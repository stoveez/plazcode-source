const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('agent/src/desktop.html', 'utf8');
const start = source.indexOf('  function Api(Path, Options)');
const end = source.indexOf('  function Setupsettingssections(', start);
assert(start >= 0 && end > start);

function fixture() {
  let now = 0, next = 0;
  const timers = new Map(), requests = [];
  const window = {
    setTimeout(callback, delay) { const id = ++next; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  const context = { window, Headers, AbortController, Key: 'test-only-key', Apiurl: 'http://localhost:1', ProfileContext: { epoch: 'test-profile' },
    fetch(url, options) {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        requests.push({ url, options, reply(body, status = 200) { resolve({ ok: status < 400, status, json: async () => body }); } });
      });
    }
  };
  vm.createContext(context); vm.runInContext(source.slice(start, end), context);
  return { context, timers, requests,
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers].filter(([, item]) => item.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; timers.delete(due[0]); due[1].callback();
      }
      now = target;
    }
  };
}

(async () => {
  const f = fixture();
  const outcome = f.context.Api('/api/blender', { method: 'POST', body: JSON.stringify({ type: 'get_scene_info', params: {} }) })
    .then(value => ({ value }), error => ({ error }));
  // A queued scene check may use 2 seconds waiting plus its 8-second reply
  // budget. Advance real AbortController behavior with a virtual browser clock.
  f.advance(10000);
  f.requests[0].reply({ ok: true, data: { status: 'success', result: { objects: [] } } });
  const result = await outcome;
  assert(!result.error, 'The desktop must not abort before the native scene-check budget ends: ' + result.error);
  assert.equal(result.value.ok, true);
  assert.equal(f.requests[0].options.headers.get('X-PlazCode-Profile'), 'test-profile');
  assert.equal(f.timers.size, 0, 'successful checks clear their timeout');

  const hung = f.context.Api('/api/blender', { method: 'POST' }).catch(error => error);
  f.advance(180000);
  const error = await hung;
  assert.equal(error.code, 'REQUEST_TIMEOUT', 'a genuine timeout has a stable, useful error');
  assert(/Blender/i.test(error.message) && !/signal is aborted/i.test(error.message));
  assert.equal(f.timers.size, 0);

  for (let i = 0; i < 24; i++) {
    const pending = f.context.Api('/api/blender', { method: 'POST' });
    f.requests.at(-1).reply(i % 2 ? { ok: false, error: 'Blender is processing another command.' } : { ok: true });
    assert.equal((await pending).ok, i % 2 === 0);
    assert.equal(f.timers.size, 0, 'repeated reconnect checks must not leave abort timers');
  }
  const status = f.context.Api('/api/desktop/state').catch(error => error);
  f.advance(7000); await status;
  assert.equal(f.requests.at(-1).options.signal.aborted, true, 'ordinary desktop polls keep their short deadline');
  console.log('PASS Blender desktop: queued/slow scene response, typed timeout, 24 recovery checks, profile header and timer cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });

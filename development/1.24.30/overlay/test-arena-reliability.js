// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Runs the real Arena provider, parser, owned-chip repair and response watcher against rendered page shapes.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync('providers/arena.js', 'utf8');
const parser = fs.readFileSync('core/parser.js', 'utf8');
const main = fs.readFileSync('core/main.js', 'utf8');
const guard = new Function(fs.readFileSync('core/stall-guard.js', 'utf8') + ';return PlazCodeStallGuard;')();
const turn = text => `<div class="mx-auto"><div class="reply"><div class="prose">${text}</div></div></div>`;
function page(text, history = '') {
  const d = new JSDOM('<form><textarea></textarea><button type="button" aria-label="Stop generation">Stop</button></form>' +
    `<ol class="flex-col-reverse">${turn(text)}${history}</ol>`, {url:'https://arena.ai/c/test', runScripts:'outside-only', pretendToBeVisual:true});
  const w = d.window;
  w.HTMLElement.prototype.getBoundingClientRect = () => ({width:400,height:40});
  Object.defineProperty(w.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
  Object.defineProperty(w.HTMLElement.prototype,'offsetParent',{get(){return this.parentElement;}});
  vm.runInContext(parser + source + ';this.P=RSProvider;this.RSParse=RSParse;', d.getInternalVMContext());
  return {d,w,P:w.P};
}
(async () => {
  // Large unfenced Lua, split across paragraphs: no raw tail, no 600-character cutoff, later prose stays visible.
  const lua = 'local found = {}\n' + 'table.insert(found, "JumpPower")\n'.repeat(100);
  const {d,w,P} = page('<p>Reading scripts.</p><p>###LUA###</p><p>' + lua + '</p><p>###END_LUA###</p><p>I will check the results.</p>');
  const item = P.lastAssistant(), md = item.querySelector('.prose');
  assert.equal(P.toolBlockVisible(item), true);
  const before = P.readAssistant().reply;
  P.findToolBlockSpot(item);
  const parts = [...md.children];
  assert(!parts[0].classList.contains('rs-tool-hide') && !parts[4].classList.contains('rs-tool-hide'));
  for (const i of [1,2,3]) assert(parts[i].classList.contains('rs-tool-hide'), 'the whole Lua block is masked');
  assert.equal(P.toolBlockVisible(item), false);
  assert.equal(P.readAssistant().reply, before, 'masking never changes the code read by the parser');
  assert.equal(w.RSParse.parseToolCalls(before)[0].arguments.code, lua.trim());
  const chip = w.document.createElement('div'); chip.className='rs-chip'; P.chipAnchor(item).appendChild(chip);
  item.__rsChip={label:'execute_luau',phase:'err',whole:false};
  let repairs=0;
  w.diag=()=>{};
  const start=main.indexOf('    ensureOwnedChip(item) {'), end=main.indexOf('\n    // owned=true',start);
  vm.runInContext('this.dec=({' + main.slice(start,end) + '});',d.getInternalVMContext());
  w.dec.chip=it=>{repairs++;P.findToolBlockSpot(it);};
  for(let i=0;i<50;i++)w.dec.ensureOwnedChip(item);
  assert.equal(repairs,0,'a settled error chip never rebuilds on an unchanged masked block');
  parts[2].replaceWith(parts[2].cloneNode(true)); md.children[2].classList.remove('rs-tool-hide');
  w.dec.ensureOwnedChip(item);
  assert.equal(repairs,1,'a genuine render wipe is repaired once');
  for(let i=0;i<50;i++)w.dec.ensureOwnedChip(item);
  assert.equal(repairs,1,'repair does not create a repeated rebuild cycle');
  md.innerHTML='<p>###LUA###</p><p>'+lua+'</p>';
  P.findToolBlockSpot(item);
  assert([...md.children].every(el=>el.classList.contains('rs-tool-hide')),'an unfinished streaming block is masked');
  assert.equal(w.RSParse.parseToolCalls(P.readAssistant().reply).length,0,'an unfinished Lua block never becomes executable');
  md.innerHTML='<p>Just an ordinary answer now.</p>';
  P.findToolBlockSpot(item);
  assert(!item.classList.contains('rs-cmd-mask'),'a replaced reply drops its stale mask');
  // Also cover direct text nodes and a single very long JSON paragraph.
  md.textContent='###LUA###\nprint(1)\n###END_LUA###'; P.findToolBlockSpot(item);
  assert(md.classList.contains('rs-tool-hide'));
  md.innerHTML='<p>'+JSON.stringify({command:'execute_luau',params:{code:lua}})+'</p>';P.findToolBlockSpot(item);
  assert(!md.classList.contains('rs-tool-hide') && md.firstChild.classList.contains('rs-tool-hide'));
  d.window.close();

  // Reads of settled history are reused, even while the newest reply grows. No stale synchronous reads.
  const cached=page('<p>live</p>',turn('<p>'+'old '.repeat(2000)+'</p>').repeat(80));
  const old=cached.P.allItems()[0], live=cached.P.lastAssistant().querySelector('.prose');
  cached.P.classifyText(old,'.rs-chip');
  const matches=cached.w.Element.prototype.matches;let walks=0;
  cached.w.Element.prototype.matches=function(sel){if(sel.startsWith('.rs-chip'))walks++;return matches.call(this,sel);};
  for(let i=0;i<40;i++) {live.firstChild.firstChild.nodeValue='live '+i;assert.equal(cached.P.readAssistant().reply,'live '+i);cached.P.classifyText(old,'.rs-chip');}
  assert(walks<160,'only the live two-node prose is walked, not 80 large old replies: '+walks);
  old.querySelector('p').firstChild.nodeValue='edited old';
  assert.equal(cached.P.itemText(old),'edited old','a real edit of an older reply invalidates it');
  cached.w.close();

  // Recovery clicks must not set the user-stop latch; actual Stop intent still does.
  const stopped=page('###LUA###\nprint(1)\n###END_LUA###');
  const stop=stopped.w.document.querySelector('button');let clicks=0,nativeStops=0,clickHook;
  const add=stopped.w.document.addEventListener.bind(stopped.w.document);
  stopped.w.document.addEventListener=(type,fn,opts)=>{if(type==='click')clickHook=fn;add(type,fn,opts);};
  const A={stop:false,sendToken:0,sessionGen:1};
  stopped.P.installSendHooks({onNativeStop(){nativeStops++;A.stop=true;},isBlocked:()=>false,isStarted:()=>true,onUserMessage(){}});
  stop.addEventListener('click',()=>clicks++);
  stopped.P.stopGeneration();
  assert.equal(clicks,1);assert.equal(nativeStops,0,'an automated recovery stop is not a manual task cancellation');
  clickHook({target:stop,isTrusted:true});
  assert.equal(nativeStops,1,'a real user click still cancels the task');
  const oldStop=stopped.w.document.createElement('button');oldStop.setAttribute('aria-label','Stop generation');stopped.w.document.body.appendChild(oldStop);
  clickHook({target:oldStop,isTrusted:true});assert.equal(nativeStops,1,'an unrelated Stop button is not the composer control');

  // Real response loop with a frozen native Stop: one bounded recovery, no partial or duplicate tool dispatch.
  A.stop=false; let now=1000;
  const events=[];
  const box={A,P:stopped.P,T:stopped.P.timings,RSParse:stopped.w.RSParse,PlazCodeStallGuard:guard,
    document:{hidden:false,getElementById:()=>null},Date:{now:()=>now},bgMode:false,sleep:async ms=>{now+=ms;},diag:n=>events.push(n),log(){},ui:{toast(){}}};
  vm.createContext(box);
  const ws=main.indexOf('  async function waitForResponse('),we=main.indexOf('\n  // ═',ws);
  vm.runInContext(main.slice(ws,we)+';this.watch=waitForResponse;',box);
  const result=await box.watch(0);
  assert.equal(result.kind,'hang_continue');assert.equal(A.stop,false,'recovery keeps the task running');
  assert(events.includes('hang.stopContinue') && now<guard.HANG_DEFAULTS.quietMs+4000,'a frozen generation is recovered within the bounded quiet period');
  stopped.w.close();
  console.log('PASS Arena: long/raw/open blocks masked without execution, no old-chip rebuild loop, fresh cached text, recovery Stop preserves task and real user Stop cancels it.');
})().catch(e=>{console.error(e);process.exit(1);});

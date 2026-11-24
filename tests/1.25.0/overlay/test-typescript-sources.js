// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// TypeScript, step 3 (owner, 2026-11-15): some extension files are written in TypeScript (development/1.25.0/ts) and turned
// into the JavaScript the extension runs by erasing the types. This test, part of the normal test run, fails when
//   1. a .js file is not exactly what its .ts makes (someone edited the .js by hand, or forgot to rebuild), or
//   2. TypeScript's checker finds a type error, including a site file that does not keep the provider contract
//      (development/1.25.0/ts/types/provider.d.ts).
// Runs from the assembled tree (build-src-1.25.0/PlazCode) or the overlay; needs release-tools' typescript and ts-blank-space.
const fs = require('fs'), path = require('path'), cp = require('child_process'), assert = require('node:assert/strict');
const candidates = [path.resolve('..', '..', 'development', '1.25.0', 'ts'), path.resolve('..', 'ts')];
const tsDir = candidates.find((d) => fs.existsSync(path.join(d, 'build.cjs')));
assert(tsDir, 'TypeScript sources folder found');
const modules = [path.resolve('release-tools', 'node_modules'), ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)];
const have = (name) => { try { require.resolve(name, {paths: modules}); return true; } catch { return false; } };
if (!have('typescript') || !have('ts-blank-space')) {
  if (process.env.CI || process.env.PLAZCODE_REQUIRE_TYPESCRIPT === '1') throw new Error('typescript and ts-blank-space must be installed (npm ci --prefix release-tools)');
  console.log('SKIP TypeScript sources: run npm ci --prefix release-tools first.');
  return;
}
const env = {...process.env, NODE_PATH: modules.join(path.delimiter)};
const run = (mode) => cp.spawnSync(process.execPath, [path.join(tsDir, 'build.cjs'), mode], {encoding: 'utf8', env, cwd: process.cwd()});
const sources = [
  ...fs.readdirSync(tsDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')),
  ...['providers', 'core'].flatMap((d) => fs.existsSync(path.join(tsDir, d)) ? fs.readdirSync(path.join(tsDir, d)).filter((f) => f.endsWith('.ts')).map((f) => d + '/' + f) : []),
];
assert(sources.includes('background.ts') && sources.includes('popup.ts') && sources.includes('ollama-page.ts') && sources.includes('providers/kimi.ts') && sources.includes('core/parser.ts') && sources.includes('core/stall-guard.ts'), 'the converted files are there: ' + sources.join(', '));
const check = run('--check');
assert.equal(check.status, 0, 'every .js matches its .ts:\n' + check.stdout + check.stderr);
const types = run('--types');
assert.equal(types.status, 0, 'TypeScript finds no type errors:\n' + types.stdout + types.stderr);
// Each converted .js file says where to edit it.
for (const s of sources) assert(fs.readFileSync(path.join(tsDir, '..', 'overlay', s.replace(/\.ts$/, '.js')), 'utf8').split('\n')[1].includes('development/1.25.0/ts/' + s), s + ' header');
console.log('PASS TypeScript sources: ' + sources.length + ' files type-check, keep the provider contract and match their JavaScript.');

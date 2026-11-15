// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// core/main.js is one big file of nested functions. A helper declared inside one function and called from another is a
// "not defined" error at run time, and most such calls sit in try/catch, so the feature just silently does nothing. The
// TypeScript checker (2026-11-15) found several: the screenshot preview's Copy image / Use as feedback buttons, remembering
// pictures attached in the chat, the RobloxScript automatic visual check and the "Always approving" note. This test fails
// when any name declared somewhere in main.js is used where it is not reachable.
const fs = require('fs'), acorn = require('acorn'), assert = require('node:assert/strict');
const src = fs.readFileSync('core/main.js', 'utf8');
const ast = acorn.parse(src, {ecmaVersion: 'latest', locations: true});
// Old features left unreachable for many versions (perf budget pill, next-step hints, session log, Studio checkpoints, a
// hidden status pill); turning them back on would change what users see, so they are listed here until the owner decides.
const KNOWN = new Set(['currentMode', 'studioConnected', 'perfParts', 'perfScripts', 'updatePerfPill', 'showSuggestion', 'persistSession', 'createCheckpoint', 'bumpPerf']);
const declared = new Set();
const blockTypes = /^(BlockStatement|Program|ForStatement|ForOfStatement|ForInStatement|CatchClause|SwitchStatement)$/;
function names(p, add) { if (!p) return; if (p.type === 'Identifier') add(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach((q) => names(q.value || q.argument, add)); else if (p.type === 'ArrayPattern') p.elements.forEach((e) => names(e, add)); else if (p.type === 'AssignmentPattern') names(p.left, add); else if (p.type === 'RestElement') names(p.argument, add); }
function hoistVars(n, add) { if (!n || typeof n.type !== 'string' || /Function/.test(n.type)) return; if (n.type === 'VariableDeclaration' && n.kind === 'var') n.declarations.forEach((d) => names(d.id, add)); for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach((c) => hoistVars(c, add)); else if (v && typeof v.type === 'string') hoistVars(v, add); } }
function scopeOf(node) {
  const set = new Set(), add = (x) => { set.add(x); declared.add(x); };
  const fn = /Function/.test(node.type);
  if (fn) { (node.params || []).forEach((p) => names(p, add)); if (node.id && node.type === 'FunctionExpression') add(node.id.name); if (node.body.type === 'BlockStatement') node.body.body.forEach((s) => hoistVars(s, add)); }
  if (node.type === 'CatchClause') names(node.param, add);
  if (node.type === 'ForStatement' && node.init && node.init.type === 'VariableDeclaration') node.init.declarations.forEach((d) => names(d.id, add));
  if ((node.type === 'ForOfStatement' || node.type === 'ForInStatement') && node.left.type === 'VariableDeclaration') node.left.declarations.forEach((d) => names(d.id, add));
  const body = fn ? (node.body.type === 'BlockStatement' ? node.body.body : []) : Array.isArray(node.body) ? node.body : node.type === 'SwitchStatement' ? node.cases.flatMap((c) => c.consequent) : [];
  for (const st of body) { if (st.type === 'VariableDeclaration' && st.kind !== 'var') st.declarations.forEach((d) => names(d.id, add)); if ((st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') && st.id) add(st.id.name); }
  return set;
}
const uses = [];
(function walk(node, scopes) {
  if (!node || typeof node.type !== 'string') return;
  if (/Function/.test(node.type) || blockTypes.test(node.type)) scopes = scopes.concat([scopeOf(node)]);
  if (node.type === 'Identifier') uses.push([node.name, node.loc.start.line, scopes]);
  for (const k in node) {
    if (k === 'loc') continue;
    if ((node.type === 'MemberExpression' || node.type === 'PropertyDefinition' || node.type === 'MethodDefinition') && (k === 'property' || k === 'key') && !node.computed) continue;
    if (node.type === 'Property' && k === 'key' && !node.computed && !node.shorthand) continue;
    if ((node.type === 'LabeledStatement' || node.type === 'BreakStatement' || node.type === 'ContinueStatement') && k === 'label') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => walk(c, scopes)); else if (v && typeof v.type === 'string') walk(v, scopes);
  }
})(ast, []);
const lost = uses.filter(([name, , scopes]) => declared.has(name) && !KNOWN.has(name) && !scopes.some((s) => s.has(name)) && !(name in globalThis));
assert.deepEqual([...new Set(lost.map(([n, l]) => n + '@' + l))], [], 'names used where they are not reachable (they throw "not defined" at run time)');
for (const name of ['rememberImages', 'imageToBlob', 'boundedImageOperation', 'copyImageToClipboard', 'captureShots', 'toast', 'menuEl', 'buildMenu'])
  assert(!lost.some(([n]) => n === name), name + ' reachable everywhere it is used');
console.log('PASS core/main.js: every helper is reachable where it is used (' + declared.size + ' names checked).');

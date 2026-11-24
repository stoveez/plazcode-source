// Harmless argument-shape mistakes are repaired before preflight so tools run
// first time; genuine mistakes are still reported back to the model.
const assert = require('node:assert/strict');
const G = require('./core/tool-guard.js');
const tools = [
  { name: 'execute_luau', inputSchema: { type: 'object', properties: { code: { type: 'string' }, datamodel_type: { type: 'string', enum: ['Edit', 'Client', 'Server'] } }, required: ['code'] } },
  { name: 'insert_model', inputSchema: { type: 'object', additionalProperties: false, required: ['query'], properties: {
    query: { type: 'string' }, count: { type: 'integer' }, anchored: { type: 'boolean' },
    pos: { type: 'array', items: { type: 'number' } }, opts: { type: 'object', properties: { n: { type: 'number' } } },
  } } },
];
let c = { tool: ' insert_model ', arguments: JSON.stringify({ query: 'tree', count: '3', anchored: 'TRUE', pos: '[1,"2",3]', opts: { n: '4.5' } }) };
assert.deepEqual(G.check(G.repair(c, tools), tools), []);
assert.equal(c.tool, 'insert_model');
assert.deepEqual(c.arguments, { query: 'tree', count: 3, anchored: true, pos: [1, 2, 3], opts: { n: 4.5 } });

c = { tool: 'execute_luau', arguments: { code: '```lua\nprint(1)\n```', datamodel_type: 'server' } };
assert.deepEqual(G.check(G.repair(c, tools), tools), []);
assert.equal(c.arguments.code, 'print(1)');
assert.equal(c.arguments.datamodel_type, 'Server');

c = { tool: 'execute_luau', arguments: '' };
G.repair(c, tools); assert.deepEqual(c.arguments, {});

// Genuine mistakes are still caught, and string values are never rewritten.
c = { tool: 'insert_model', arguments: { query: 42, count: '1.5', bogus: 1 } };
const errors = G.check(G.repair(c, tools), tools);
assert(errors.some(e => /query/.test(e)) && errors.some(e => /count/.test(e)) && errors.some(e => /bogus/.test(e)), errors.join('; '));
c = { tool: 'execute_luau', arguments: { code: '"42"' } }; G.repair(c, tools); assert.equal(c.arguments.code, '"42"');
c = { tool: 'execute_luau', arguments: { code: 'local s = "```"' } }; G.repair(c, tools); assert.equal(c.arguments.code, 'local s = "```"');
c = { tool: 'execute_luau', arguments: 'not json' }; G.repair(c, tools);
assert.equal(c.arguments, 'not json'); assert(G.check(c, tools).length, 'unparseable arguments still rejected');
assert.equal(G.repair(null, tools), null);
console.log('Tool guard repairs harmless argument mistakes and still rejects real ones.');
// Wider repairs, each reported back so the model learns the real spelling.
const wide = [{ name: 'generate_mesh', inputSchema: { type: 'object', additionalProperties: false, required: ['textPrompt'], properties: {
  textPrompt: { type: 'string' }, position: { type: 'array', items: { type: 'number' } }, size: { type: 'integer', minimum: 1, maximum: 10 }, anchoredParts: { type: 'boolean' } } } }];
c = { tool: 'generate_mesh', arguments: { params: { text_prompt: 'a red door', position: { x: 1, y: 2, z: 3 }, size: 99 } } };
assert.deepEqual(G.check(G.repair(c, wide), wide), []);
assert.deepEqual(c.arguments, { textPrompt: 'a red door', position: [1, 2, 3], size: 10 });
assert.equal(c.repairs.length, 4, c.repairs.join('; '));
assert(c.repairs.some(r => /textPrompt/.test(r)) && c.repairs.some(r => /wrapper/.test(r)) && c.repairs.some(r => /outside/.test(r)), c.repairs.join('; '));
// One letter off on a long name is fixed; a short or ambiguous name is not guessed.
c = { tool: 'generate_mesh', arguments: { textPromt: 'x', size: 2 } }; G.repair(c, wide); assert.equal(c.arguments.textPrompt, 'x');
c = { tool: 'generate_mesh', arguments: { textPrompt: 'x', size: 2, anchored: true } }; G.repair(c, wide); assert.equal(c.arguments.anchored, true, 'unrelated unknown key left for the checker');
c = { tool: 'generate_mesh', arguments: { prompt: 'x' } }; G.repair(c, wide); assert.equal(c.arguments.prompt, 'x', 'a different word is never guessed');
// A real property called "arguments" is not unwrapped; a correct call records nothing.
const holder = [{ name: 'h', inputSchema: { type: 'object', properties: { arguments: { type: 'object' } } } }];
c = { tool: 'h', arguments: { arguments: { a: 1 } } }; G.repair(c, holder); assert.deepEqual(c.arguments, { arguments: { a: 1 } });
c = { tool: 'generate_mesh', arguments: { textPrompt: 'ok', size: 3 } }; G.repair(c, wide); assert.equal(c.repairs, undefined);
console.log('Tool guard also unwraps envelopes, fixes near-miss names, {x,y,z}, clamps ranges and reports each repair.');

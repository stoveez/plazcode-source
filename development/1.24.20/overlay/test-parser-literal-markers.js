// SPDX-License-Identifier: GPL-3.0-or-later
// Pure production-parser regressions: marker-looking Luau source is DATA inside
// decoded JSON. Only a complete leading+terminal wrapper may be unwrapped.
// No DOM, live tools, source edits, dependency installs, or network.
// node test-parser-literal-markers.js [path/to/core/parser.js]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const fallback=path.resolve(__dirname,'../../../build-src-1.24.20/PlazCode/core/parser.js');
const parserPath=process.argv[2]||process.env.PLAZCODE_PARSER||[path.join(__dirname,'core/parser.js'),fallback].find(p=>fs.existsSync(p));
const source=fs.readFileSync(parserPath,'utf8'),context={};vm.createContext(context);vm.runInContext(source+';globalThis.parser=RSParse;',context,{filename:parserPath,timeout:5000});const parser=context.parser;
let passed=0,failed=0;const groups={};const failures=[];
function test(group,name,fn){const summary=groups[group]||(groups[group]={passed:0,failed:0});try{fn();passed++;summary.passed++;}catch(error){failed++;summary.failed++;failures.push({group,name,error:error.message.split('\n')[0]});}}
const json=(code,args={})=>JSON.stringify({command:'execute_luau',params:{code,...args}});
const shapes=[['JSON',x=>x],['fenced JSON',x=>'```json\n'+x+'\n```'],['MCP JSON',x=>'###MCP_TOOL###\n'+x+'\n###END_MCP_TOOL###'],['MCP fenced JSON',x=>'###MCP_TOOL###\n```json\n'+x+'\n```\n###END_MCP_TOOL###']];
const literalCases=[
 ['double-quoted opener','local before = "PREFIX"\nlocal marker = "###LUA###"\nlocal readerLed = 7\nreturn readerLed'],
 ['double-quoted terminator','local marker = "###END_LUA###"\nreturn marker'],
 ['double-quoted pair','local before = "PREFIX"\nlocal open = "###LUA###"\nlocal readerLed = 7\nlocal close = "###END_LUA###"\nreturn readerLed'],
 ['single-quoted pair',"local open = '###LUA###'\nlocal close = '###END_LUA###'\nreturn open .. close"],
 ['line-comment opener','-- ###LUA###\nlocal readerLed = 7\nreturn readerLed'],
 ['line-comment pair','local before = 1\n-- ###LUA###\nlocal readerLed = 7\n-- ###END_LUA###\nreturn before + readerLed'],
 ['longstring pair','local TICKETS = [=[\n###LUA###\n<ticket> ```lua 🦊\n###END_LUA###\n]=]\nreturn TICKETS'],
 ['long-comment pair','--[==[\n###LUA###\ncomment only\n###END_LUA###\n]==]\nreturn "PRESERVED"'],
 ['datamodel-looking literal','local marker = "###LUA:Server###"\nreturn marker'],
 ['preserved whitespace Unicode','\n\tlocal marker = "###LUA###"\n  local TICKETS = {"<", ">", "```", "🦊 é"}\n\nreturn TICKETS\n'],
 ['leading-only incomplete wrapper','###LUA###\nreturn "PRESERVE_UNCLOSED_SOURCE"'],
 ['leading wrapper with nonterminal suffix','###LUA###\nreturn 1\n###END_LUA###\nreturn "NOT_A_FULL_WRAPPER"']
];
function oneCall(wire){const calls=parser.parseToolCalls(wire);assert.equal(calls.length,1,'exactly one command must be parsed');assert.equal(calls[0].tool,'execute_luau');return calls[0];}
for(const [label,code] of literalCases)for(const [shape,wrap] of shapes)test('literal-preservation',shape+' '+label,()=>{const call=oneCall(wrap(json(code,{datamodel_type:'Client'})));assert.equal(call.arguments.code,code,'decoded Luau source changed');assert.equal(call.arguments.datamodel_type,'Client','explicit datamodel changed');});
const body='local TICKETS = {"<", ">", "```", "🦊"}\nreturn TICKETS';
for(const [label,start,end,dm] of [['default','###LUA###','###END_LUA###','Edit'],['server','###LUA:Server###','###END_LUA###','Server'],['spaced client','### LUA : Client ###','### END_LUA ###','Client'],['case-insensitive','###lua###','###end_lua###','Edit']])for(const [shape,wrap] of shapes)test('full-wrapper-compatibility',shape+' '+label,()=>{const call=oneCall(wrap(json(' \n'+start+'\n'+body+'\n'+end+'\n ')));assert.equal(call.arguments.code,body,'full wrapper must unwrap without damaging body');assert.equal(call.arguments.datamodel_type,dm,'wrapper datamodel must be retained');});
for(const [shape,wrap] of shapes)test('full-wrapper-compatibility',shape+' explicit datamodel wins',()=>{const call=oneCall(wrap(json('###LUA:Server###\n'+body+'\n###END_LUA###',{datamodel_type:'Client'})));assert.equal(call.arguments.code,body);assert.equal(call.arguments.datamodel_type,'Client');});
for(const [label,code] of literalCases.filter(([label])=>!label.startsWith('leading')))for(const [shape,wrap] of shapes)test('complete-JSON-not-open',shape+' '+label,()=>{assert.equal(parser.hasOpenToolBlock(wrap(json(code))),false,'literal marker inside complete JSON is not an open transport block');});
for(const [shape,wrap] of shapes)test('complete-JSON-not-open',shape+' valid complete code wrapper',()=>assert.equal(parser.hasOpenToolBlock(wrap(json('###LUA###\nreturn 1\n###END_LUA###'))),false));
for(const [label,wire] of [
 ['bare open Lua','###LUA###\nreturn 1'],
 ['open MCP','###MCP_TOOL###\n'+json('return 1')],
 ['open JSON object','{"command":"execute_luau","params":{"code":"return 1"}'],
 ['open JSON string with literal marker','{"command":"execute_luau","params":{"code":"local x = \\"###LUA###'],
 ['closed JSON then new open Lua',json('return 1')+'\n###LUA###\nreturn 2']
])test('real-incomplete-blocks',label,()=>assert.equal(parser.hasOpenToolBlock(wire),true,'genuinely incomplete transport must remain open'));
for(const [label,wire] of [['bare Lua','###LUA###\n'+body+'\n###END_LUA###'],['MCP raw Lua','###MCP_TOOL###\n###LUA###\n'+body+'\n###END_LUA###\n###END_MCP_TOOL###']])test('raw-wrapper-compatibility',label,()=>{const call=oneCall(wire);assert.equal(call.arguments.code,body);assert.equal(call.arguments.datamodel_type,'Edit');assert.equal(parser.hasOpenToolBlock(wire),false);});
test('other-tool-unchanged','non-Luau tool marker text',()=>{const code='###LUA###\nKEEP\n###END_LUA###';const calls=parser.parseToolCalls(JSON.stringify({command:'write_file',params:{path:'fixture.lua',content:code}}));assert.equal(calls.length,1);assert.equal(calls[0].tool,'write_file');assert.equal(calls[0].arguments.content,code);});
// Literal MCP delimiter examples must not outrank the surrounding JSON call.
const mcpLiteralCases=[
 ['quoted unmatched opener','local marker = "###MCP_TOOL###"\nreturn marker'],
 ['quoted unmatched terminator','local marker = "###END_MCP_TOOL###"\nreturn marker'],
 ['quoted MCP pair','local open = "###MCP_TOOL###"\nlocal close = "###END_MCP_TOOL###"\nreturn open .. close'],
 ['comment MCP pair','-- ###MCP_TOOL###\n-- sample only\n-- ###END_MCP_TOOL###\nreturn "OUTER_COMMENT"'],
 ['longstring embedded JSON example','local example = [=[###MCP_TOOL###\n{"command":"execute_luau","params":{"code":"return 123"}}\n###END_MCP_TOOL###]=]\nreturn "OUTER_JSON_EXAMPLE"'],
 ['longstring embedded JSON and Lua markers','local example = [=[###MCP_TOOL###\n{"command":"execute_luau","params":{"code":"###LUA### return 123 ###END_LUA###"}}\n###END_MCP_TOOL###]=]\nreturn "OUTER_JSON_AND_LUA"'],
 ['longstring raw Lua MCP example','local example = [=[###MCP_TOOL###\n###LUA###\nreturn "INNER_EXAMPLE_ONLY"\n###END_LUA###\n###END_MCP_TOOL###]=]\nreturn "OUTER_LONGSTRING"'],
 ['longcomment raw Lua MCP example','--[==[###MCP_TOOL###\n###LUA###\nreturn "INNER_COMMENT_ONLY"\n###END_LUA###\n###END_MCP_TOOL###]==]\nreturn "OUTER_LONGCOMMENT"']
];
for(const [label,code] of mcpLiteralCases)for(const [shape,wrap] of shapes){
 test('MCP-literal-preservation',shape+' '+label,()=>{const call=oneCall(wrap(json(code,{datamodel_type:'Client'})));assert.equal(call.arguments.code,code,'literal MCP example displaced or corrupted the outer JSON source');assert.equal(call.arguments.datamodel_type,'Client','inner example must not select a different datamodel');});
 test('MCP-literal-not-open',shape+' '+label,()=>assert.equal(parser.hasOpenToolBlock(wrap(json(code))),false,'literal MCP delimiter in complete JSON is not an open block'));
}
const literalEndings=json('local example = "###END_LUA### ###END_MCP_TOOL###"\nreturn example');
for(const opener of ['###LUA###','###MCP_TOOL###'])for(const position of ['before','after'])test('external-open-controls',position+' actual '+opener,()=>assert.equal(parser.hasOpenToolBlock(position==='before'?opener+'\n'+literalEndings:literalEndings+'\n'+opener),true,'literal JSON terminators cannot close a real external opener'));
for(const marker of ['###LUA###','###MCP_TOOL###'])test('truncated-JSON-marker-controls',marker,()=>{const wire=json('local marker = "'+marker+'"\nreturn marker');assert.equal(parser.hasOpenToolBlock(wire.slice(0,-1)),true,'missing root closer must remain open');});

// A real raw Lua transport owns its full body; JSON examples in Luau source
// must not be promoted to a command, regardless of the example's tool name.
const rawJsonExamples=[
 ['single-quoted JSON', 'local example = \'{"command":"execute_luau","params":{"code":"return 123","datamodel_type":"Edit"}}\'\nreturn "OUTER_QUOTED"'],
 ['longstring JSON', 'local example = [=[{"command":"execute_luau","params":{"code":"return 123"}}]=]\nreturn "OUTER_LONGSTRING"'],
 ['line-comment JSON', '-- {"command":"execute_luau","params":{"code":"return 123"}}\nreturn "OUTER_COMMENT"'],
 ['long-comment other tool', '--[==[{"command":"write_file","params":{"path":"example.lua","content":"EXAMPLE_ONLY"}}]==]\nreturn "OUTER_NOT_WRITE_FILE"'],
 ['longstring JSON with Lua markers', 'local example = [=[{"command":"execute_luau","params":{"code":"###LUA### return 123 ###END_LUA###"}}]=]\nreturn "OUTER_MARKERS"'],
 ['longstring JSON with MCP markers', 'local example = [=[{"command":"execute_luau","params":{"code":"###MCP_TOOL### example ###END_MCP_TOOL###"}}]=]\nreturn "OUTER_MCP_MARKERS"']
];
for(const [label,code] of rawJsonExamples)for(const [shape,wrap] of [['bare raw Lua',x=>x],['MCP raw Lua',x=>'###MCP_TOOL###\n'+x+'\n###END_MCP_TOOL###']]){
 const wire=wrap('###LUA:Client###\n'+code+'\n###END_LUA###');
 test('raw-Lua-owns-JSON-examples',shape+' '+label,()=>{const call=oneCall(wire);assert.equal(call.arguments.code,code,'embedded JSON example replaced or truncated the actual raw Lua body');assert.equal(call.arguments.datamodel_type,'Client','raw transport datamodel must win over example');});
 test('raw-Lua-JSON-examples-not-open',shape+' '+label,()=>assert.equal(parser.hasOpenToolBlock(wire),false,'complete raw Lua transport must remain complete'));
}

console.log('SOURCE parser.js sha256='+crypto.createHash('sha256').update(source).digest('hex'));for(const [group,value] of Object.entries(groups))console.log(group+': '+value.passed+' passed, '+value.failed+' failed');for(const failure of failures.slice(0,8))console.log('FAIL '+failure.group+' / '+failure.name+': '+failure.error);console.log('TOTAL '+passed+' passed, '+failed+' failed');process.exitCode=failed?1:0;

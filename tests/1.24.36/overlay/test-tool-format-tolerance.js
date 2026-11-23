const fs=require('fs'),assert=require('node:assert/strict');
const parse=new Function(fs.readFileSync('core/parser.js','utf8')+';return RSParse;')();
const first={command:'read_file',params:{path:'a.txt'}},second={command:'search_files',params:{pattern:'*.md'}};
for(const fence of ['json','JSON','javascript','']){
 const text='I will inspect these files.\n```'+fence+'\n'+JSON.stringify(first)+'\n```\nThen I will use the result.';
 const calls=parse.parseToolCalls(text);assert.equal(calls.length,1,fence);assert.equal(calls[0].tool,'read_file');assert.equal(calls[0].arguments.path,'a.txt');
}
const batch={command:'plazcode_batch',params:{calls:[first,second]}};
assert.equal(parse.parseToolCalls('Prepared reads:\n```json\n'+JSON.stringify(batch)+'\n```\nI will wait for them.').length,1,'children stay inside one batch envelope');
assert.equal(parse.parseToolCalls('```json\n'+JSON.stringify(batch).slice(0,-1)+'\n```\nThis batch is incomplete.').length,0,'a truncated outer envelope never releases complete inner commands');
assert.equal(parse.parseToolCalls('```text\nAn example without an actual command.\n```').length,0);
console.log('PASS complete command envelopes tolerate fence labels and surrounding prose without releasing incomplete batch children.');

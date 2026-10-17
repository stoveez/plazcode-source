from pathlib import Path
import sys
root=Path(sys.argv[1])
def edit(name,before,after):
 p=root/name;t=p.read_text()
 if before not in t:raise RuntimeError(name+': '+before[:70])
 p.write_text(t.replace(before,after))

edit('core/main.js','  function compressToolFeedback(text, name) {', '''  const retainedToolResults = new Map();
  let characterLimits = {rsInputLimitEnabled:true,rsInputCharLimit:120000,rsOutputLimitEnabled:true,rsOutputCharLimit:32000};
  function normalizeCharacterLimits(value) {
    const limit=(key,fallback)=>Number.isFinite(Number(value[key]))?Math.max(1000,Math.min(2000000,Math.floor(Number(value[key])))):fallback;
    return {rsInputLimitEnabled:value.rsInputLimitEnabled!==false,rsInputCharLimit:limit('rsInputCharLimit',120000),rsOutputLimitEnabled:value.rsOutputLimitEnabled!==false,rsOutputCharLimit:limit('rsOutputCharLimit',32000)};
  }
  chrome.storage.local.get(Object.keys(characterLimits), value=>{characterLimits=normalizeCharacterLimits(value||{});});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;const next={...characterLimits};for(const key of Object.keys(next))if(changes[key])next[key]=changes[key].newValue;characterLimits=normalizeCharacterLimits(next);});
  window.__rsLimitOutgoing = text => {
    const value=String(text||'');
    if(characterLimits.rsInputLimitEnabled&&value.length>characterLimits.rsInputCharLimit)throw Error('This message exceeds your '+characterLimits.rsInputCharLimit+' character input limit. Nothing was omitted or sent. Raise or disable the input limit in Settings.');
    return value;
  };
  function resultPageSize() {
    const output=characterLimits.rsOutputLimitEnabled?characterLimits.rsOutputCharLimit:Infinity;
    const input=characterLimits.rsInputLimitEnabled?Math.max(400,characterLimits.rsInputCharLimit-600):Infinity;
    return Math.min(output,input);
  }
  function readRetainedToolResult(args) {
    const record=retainedToolResults.get(String(args.id||''));
    if(!record||record.chat!==P.conversationKey()||record.engine!==activeEngine())return 'ERROR: This retained result is unavailable in this project chat. Inspect the original result; do not repeat an uncertain mutation.';
    const offset=args.offset===undefined?0:Number(args.offset);
    if(!Number.isSafeInteger(offset)||offset<0||offset>record.text.length)return 'ERROR: offset must be a character position within this result.';
    const requested=args.limit===undefined?resultPageSize():Number(args.limit);
    if(requested!==Infinity&&(!Number.isSafeInteger(requested)||requested<1))return 'ERROR: limit must be a positive character count.';
    let end=Math.min(record.text.length,offset+Math.min(requested,resultPageSize()));
    if(end<record.text.length&&end>offset&&/[\\uD800-\\uDBFF]/.test(record.text[end-1]))end--;
    const next=end<record.text.length?end:null;
    return "Output of 'plazcode_result_read':\\n"+JSON.stringify({id:args.id,offset,next_offset:next,total_characters:record.text.length,content:record.text.slice(offset,end)});
  }
  function compressToolFeedback(text, name) {''')
p=root/'core/main.js';t=p.read_text();start=t.index('    const MAX = 10000;',t.index('function compressToolFeedback'));end=t.index('\n  }',start)
t=t[:start]+'''    const limit=resultPageSize();
    if(s.length<=limit)return s;
    const id=crypto.randomUUID();
    retainedToolResults.set(id,{text:s,chat:P.conversationKey(),engine:activeEngine()});
    let retained=0;for(const entry of retainedToolResults.values())retained+=entry.text.length;
    while(retainedToolResults.size>32||retained>64000000&&retainedToolResults.size>1){const first=retainedToolResults.keys().next().value;retained-=retainedToolResults.get(first).text.length;retainedToolResults.delete(first);}
    let end=limit;if(/[\\uD800-\\uDBFF]/.test(s[end-1]))end--;
    return '[PlazCode retained the COMPLETE result. This is the first page, not truncated source. Read the rest with plazcode_result_read {id:"'+id+'",offset:'+end+'}. Follow next_offset until null. Do not rerun the original command.]\\n'+s.slice(0,end);
''' +t[end:];p.write_text(t)
edit('core/main.js','    if (name === "plazcode_checklist") {','    if (name === "plazcode_result_read") return readRetainedToolResult(args);\n    if (name === "plazcode_checklist") {')
edit('core/main.js','const webLines = [','const webLines = [`— Retained results: plazcode_result_read {id,offset?,limit?} — read successive exact pages of a completed command result without executing the command again. Follow next_offset until null.`, ')

# All provider-specific historical truncators delegate to the user setting.
for p in (root/'providers').glob('*.js'):
 t=p.read_text()
 if 'function truncateForSend(text) {' in t:
  t=t.replace('function truncateForSend(text) {','function truncateForSend(text) {\n    if(typeof window.__rsLimitOutgoing===\"function\")return window.__rsLimitOutgoing(text);')
  p.write_text(t)
edit('core/main.js','const sendResult = await P.typeAndSend(text, images,', 'const sendResult = await P.typeAndSend(window.__rsLimitOutgoing(text), images,')

keys=['rsInputLimitEnabled','rsInputCharLimit','rsOutputLimitEnabled','rsOutputCharLimit']
edit('background.js','  "rsRunLimitsEnabled",', ''.join('  "'+key+'",\n' for key in keys)+'  "rsRunLimitsEnabled",')
edit('agent/src/preferences.rs','    pub run_limits_enabled: bool,','''    pub run_limits_enabled: bool,
    #[serde(rename = "rsInputLimitEnabled")]
    pub input_limit_enabled: bool,
    #[serde(rename = "rsInputCharLimit")]
    pub input_char_limit: u32,
    #[serde(rename = "rsOutputLimitEnabled")]
    pub output_limit_enabled: bool,
    #[serde(rename = "rsOutputCharLimit")]
    pub output_char_limit: u32,''')
edit('agent/src/preferences.rs','tool_budget:0,run_limits_enabled:false,', 'input_limit_enabled:true,input_char_limit:120000,output_limit_enabled:true,output_char_limit:32000,tool_budget:0,run_limits_enabled:false,')
edit('agent/src/preferences.rs','        self.tool_budget=', '        self.input_char_limit=self.input_char_limit.clamp(1000,2000000);self.output_char_limit=self.output_char_limit.clamp(1000,2000000);\n        self.tool_budget=')
panel='''<h3>Message size</h3><div class="settingrow"><label>Limit message input characters</label><div class="toggle" data-pref="rsInputLimitEnabled"></div></div><div class="settingrow"><label>Input characters</label><input type="number" min="1000" max="2000000" data-pref="rsInputCharLimit"></div><div class="settingrow"><label>Limit tool result page characters</label><div class="toggle" data-pref="rsOutputLimitEnabled"></div></div><div class="settingrow"><label>Tool result characters per page</label><input type="number" min="1000" max="2000000" data-pref="rsOutputCharLimit"></div><p class="settinghelp">Limits are enabled by default and can be changed or switched off. Large tool results are kept in full and delivered in readable pages. The AI can read every page without running the command again. These settings cannot increase an AI website's own limits or set its native answer length.</p>'''
edit('agent/src/desktop.html','<div class="settingrow"><label>Pause at run limits', panel+'<div class="settingrow"><label>Pause at run limits')
print('Added configurable input and result-page limits with complete retained results.')

from pathlib import Path
import sys

root = Path(sys.argv[1])
def edit(name, before, after):
    path = root / name
    text = path.read_text()
    if before not in text:
        raise RuntimeError(f'Missing patch anchor: {name}: {before[:90]}')
    path.write_text(text.replace(before, after))

# Run limits are opt-in. Existing saved defaults must not silently stop work.
edit('core/reliability.js', 'calls=100,minutes=30', 'calls=0,minutes=0')
edit('core/main.js', 'rsToolBudget:100,rsTaskMinutes:30', 'rsToolBudget:0,rsTaskMinutes:0,rsRunLimitsEnabled:false')
edit('core/main.js', 'PlazCodeReliability.createBudget({calls:reliabilitySettings.rsToolBudget,minutes:reliabilitySettings.rsTaskMinutes})', 'PlazCodeReliability.createBudget({calls:reliabilitySettings.rsRunLimitsEnabled?reliabilitySettings.rsToolBudget:0,minutes:reliabilitySettings.rsRunLimitsEnabled?reliabilitySettings.rsTaskMinutes:0})')
edit('core/main.js', 'const normalizeReliability = value => ({rsToolBudget:', 'const normalizeReliability = value => ({rsRunLimitsEnabled:value.rsRunLimitsEnabled===true,rsToolBudget:')
edit('core/main.js', ':100)),rsTaskMinutes:', ':0)),rsTaskMinutes:')
edit('core/main.js', ':30)),rsVisualCheck:', ':0)),rsVisualCheck:')
edit('core/main.js', '["rsToolBudget","rsTaskMinutes","rsVisualCheck"', '["rsRunLimitsEnabled","rsToolBudget","rsTaskMinutes","rsVisualCheck"')
edit('core/main.js', "['rsToolBudget','rsTaskMinutes','rsVisualCheck'", "['rsRunLimitsEnabled','rsToolBudget','rsTaskMinutes','rsVisualCheck'")
edit('core/main.js', '<div class="rs-execution-limit"><label for="rs-tool-budget">', '<div class="rs-execution-limit"><label for="rs-run-limits">Pause at run limits (optional)</label><input id="rs-run-limits" type="checkbox" ${reliabilitySettings.rsRunLimitsEnabled?"checked":""}></div><div class="rs-execution-limit"><label for="rs-tool-budget">')
edit('core/main.js', '[["rs-tool-budget","rsToolBudget"]', '[["rs-run-limits","rsRunLimitsEnabled"],["rs-tool-budget","rsToolBudget"]')
edit('core/main.js', "const toggle=key==='rsVisualCheck'", "const toggle=key==='rsRunLimitsEnabled'||key==='rsVisualCheck'")
edit('agent/src/preferences.rs', 'pub tool_budget: u32,', 'pub tool_budget: u32,\n    #[serde(rename = "rsRunLimitsEnabled")]\n    pub run_limits_enabled: bool,')
edit('agent/src/preferences.rs', 'tool_budget:100,task_minutes:30', 'tool_budget:0,run_limits_enabled:false,task_minutes:0')
edit('background.js', '"rsToolBudget",', '"rsRunLimitsEnabled",\n  "rsToolBudget",')
edit('agent/src/desktop.html', '<div class="settingrow"><label>Commands per run', '<div class="settingrow"><label>Pause at run limits (optional)</label><div class="toggle" data-pref="rsRunLimitsEnabled"></div></div><div class="settingrow"><label>Commands per run')
edit('agent/src/desktop.html', 'the maximum number of AI tool commands before PlazCode pauses.', 'the maximum number of AI tool commands before PlazCode pauses, only when Pause at run limits is enabled. Limits are off by default.')

for name in ['core/main.js', 'agent/src/desktop.html', 'core/ultracode.js', 'core/ultracode-deepseek.js']:
    path=root/name
    text=path.read_text()
    path.write_text(text.replace('Ultracode (Beta)', 'Ultracode').replace('ULTRACODE (BETA)', 'ULTRACODE'))
edit('agent/src/desktop.html', '<button class="softbtn" data-go="updates">Updates</button>', '<button class="softbtn" data-go="updates" style="align-self:flex-start;margin-top:4px">Updates</button>')

# A failed status probe says nothing about whether the process actually stopped.
edit('core/main.js', 'let wasConnected = false, bridgeBannerEl = null;', 'let wasConnected = false, bridgeBannerEl = null, bridgeMisses = 0, bridgeMissingSince = 0;')
edit('core/main.js', '''if (wasConnected && !s.connected && Date.now() >= engineSwitchUntil) bridgeAlert(true);
      if (s.connected) bridgeAlert(false);
      if (s.connected || Date.now() >= engineSwitchUntil) wasConnected = s.connected;''', '''if (s.connected) {
        bridgeMisses = 0; bridgeMissingSince = 0; wasConnected = true; bridgeAlert(false);
      } else if (wasConnected && Date.now() >= engineSwitchUntil) {
        if (!bridgeMissingSince) bridgeMissingSince = Date.now();
        bridgeMisses++;
        if (bridgeMisses >= 3 && Date.now() - bridgeMissingSince >= 15000) bridgeAlert(true);
      }''')
edit('core/main.js', '⚠ Bridge went down', '⚠ Bridge is not responding')
edit('core/main.js', 'Bridge stopped. Just run ${RUN_CMD} again (keep Studio open) — it\'ll hop back on automatically when it\'s back.', 'Several connection checks did not answer. A busy bridge may still be running. Keep Studio open; PlazCode reconnects automatically. If PlazCode is closed, run ${RUN_CMD}.')

# Never display a pasted user prompt as an AI objective before a plan exists.
edit('core/checklist.js', "[{label:group.taskLabel,status:'pending'}]", "[{label:'Waiting for the AI to describe the project goal',status:'pending'}]")

# Expose removal beside the primary controls, preserve all existing imports.
edit('core/skills-ui.js', '<button class="softbtn" data-sk="export">Export</button>', '<button class="softbtn" data-sk="export">Export</button><button class="dangerbtn" data-sk="delete" hidden>Remove skill</button>')
edit('core/skills-ui.js', '<button class="dangerbtn" data-sk="delete">Delete skill</button>', '')
edit('core/skills-ui.js', '.json,.txt,.md,application/json', '.json,.txt,.md,.markdown,application/json')
edit('core/skills-ui.js', 'Import JSON or text', 'Import JSON, text or Markdown')
edit('core/skills-ui.js', 'Upload exported JSON, a text file, or paste instructions.', 'Upload exported JSON, text or Markdown, or paste instructions.')
edit('core/skills-ui.js', "find('export').disabled=!skill;", "find('export').disabled=!skill;find('delete').hidden=!skill;")
edit('core/skills-ui.js', 'async function request(value){const result=await api(value);', '''async function bounded(operation, ms=135000){let timer;try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=window.setTimeout(()=>reject(Error('The skill request did not answer. Check the connection and refresh the list before trying Save again.')),ms);})]);}finally{window.clearTimeout(timer);}}
  async function request(value){const result=await bounded(()=>api(value));''')
edit('core/skills-ui.js', 'const run=operation=>async()=>{if(busy)return;busy=true;', "const run=operation=>async()=>{if(busy){status('Another skill operation is still finishing. Your instructions are kept.');return;}busy=true;")
edit('core/skills-ui.js', "const result=await request({action:'save',skill,revision:skill.revision});await refresh();fill(result.skill);", "const result=await request({action:'save',skill,revision:skill.revision});records=records.filter(item=>item.id!==result.skill.id).concat(result.skill);fill(result.skill);renderList();void refresh();")

print('Applied opt-in run limits, truthful bridge status, skills and UI fixes.')

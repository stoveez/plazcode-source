// SPDX-License-Identifier: GPL-3.0-or-later
const PlazCodeActivity = (() => {
  function replacesTask(text) {
    text=String(text||'').replace(/[‘’]/g,"'");
    if(/\b(?:do not|don't|never)\s+(?:change|replace|reset|clear|drop|forget|discard|ignore|abandon|stop)\b/i.test(text))return false;
    return /\b(?:replace|reset|clear|discard|forget|drop|ignore|abandon)\s+(?:(?:the|my|our|all|these|those|previous|old|current|main)\s+)*(?:tasks?|checklist|plan)\b/i.test(text)||
      /\b(?:change|rewrite)\s+(?:(?:the|my|our|current|main|these|those)\s+)*(?:tasks?|checklist|plan)(?:\s+(?:to|into|completely|instead)\b|(?=\s*(?:[.!?]|$)))/i.test(text)||
      /\b(?:stop|do not|don't)\s+(?:following|follow|working on)\s+(?:(?:the|my|our|previous|old|current|main|these|those)\s+)*(?:tasks?|checklist|plan)\b/i.test(text)||
      /\b(?:start (?:a )?new (?:task|project|plan)|start over)\b/i.test(text);
  }
  // Only user goals start tracked work. Tool syntax and chat controls are not goals.
  function requestKind(text) {
    const clean=String(text||'').trim().replace(/[‘’]/g,"'");
    const short=clean.replace(/[`*]/g,'').replace(/[.!?]+$/,'').trim();
    if(!short)return 'conversation';
    if(/^(?:continue(?: working)?|keep (?:going|working)|resume(?: working)?|go on|carry on|stop|pause)$/i.test(short))return 'control';
    if(/^(?:hello|hi|hey|hello there|good (?:morning|afternoon|evening)|thanks(?: you)?|thank you|ok(?:ay)?|yes|no|got it|cool|great|nice|are you there|hello again|how are you|hello how are you|hi how are you|yo|sup|hey there|nice job|good job|thank you so much|are you ready|can you help me)(?:\s+(?:plazcode|there|again))?$/i.test(short))return 'conversation';
    if(short.length<=180 && /^(?:thanks|thank you)\b/i.test(short) && !/(?:\b(?:can|could|would|will) you\b|(?:[,;]|\b(?:please|also|now|next|and))\s*(?:please\s+)?(?:build|create|make|add|fix|change|edit|implement|investigate|debug|test|verify|run|execute|optimi[sz]e|continue|resume)\b)/i.test(short))return 'conversation';
    const workIntent=/\b(?:build|create|make|add|fix|change|edit|implement|investigate|debug|test|verify|run|execute|optimi[sz]e|continue|resume|broken|bug|issue|problem|stuck|hangs?)\b/i.test(short);
    if(!workIntent && short.length<=180 && /^(?:hello(?!\s+world\b)|hi|hey|thanks|thank you|good morning|good afternoon|good evening)\b/i.test(short))return 'conversation';
    if(/^(?:awesome|bye|goodbye|sure|alright|understood|sounds good|nice to meet you|see you|you there|are you working|how are things)(?:[.!?\s]|$)/i.test(short)&&!workIntent)return 'conversation';
    if(!workIntent && /^(?:[a-z][a-z0-9]*_)+[a-z0-9_]+(?:\s|$)/i.test(short))return 'quick';
    if(/\b(?:commands?|tools?)\b/i.test(short)&&/^(?:list|show|display|what are|which|tell me|give me|can you (?:list|show)|please (?:list|show))\b/i.test(short)&&! /\b(?:build|fix|create|implement|edit|run|execute|test)\b/i.test(short))return 'quick';
    if(/^(?:list|show|display|what (?:are|is)|which|tell me|give me|can you (?:list|show)|please (?:list|show))\s+(?:(?:me|the|all|available|supported|your|plazcode|a list of)\s+)*(?:commands?|tools?|capabilities|status|help)(?:\s+(?:please|available|you (?:have|support)|are available))?$/i.test(short) || /^(?:help|status|commands|tools)$/i.test(short))return 'quick';
    if(/^(?:[a-z][a-z0-9]*_)+[a-z0-9_]+(?:\s*\([^\n]*\)|\s*\{[\s\S]*\})?$/i.test(short) || /^(?:```(?:json)?\s*)?\{\s*"(?:command|tool|name)"\s*:/i.test(clean))return 'quick';
    // Informational questions do not establish an editing/build goal.
    if(/^(?:what|why|who|where|when|which|how)\b/i.test(short) || /^(?:explain|describe|tell me about|can you explain)\b/i.test(short))return 'quick';
    return 'work';
  }
  function commandLabel(text) {
    return requestKind(text)==='quick' && /(?:^[a-z0-9]+_[a-z0-9_]+|"(?:command|tool)"\s*:)/i.test(String(text).trim());
  }
  function create(changed = () => {}, storage = null) {
    let current, sequence = 0;
    const groups = [], tasks = new Map();
    const taskStorageKey='plazcode.mainTasks.v1';
    try {
      if(typeof storage==='function')storage=storage();
      const raw=storage?.getItem(taskStorageKey);
      if(raw&&raw.length<=512000){const saved=JSON.parse(raw);if(Array.isArray(saved))for(const [chat,value] of saved.slice(-60)){
        if(typeof chat!=='string'||!value||typeof value.label!=='string'||typeof value.key!=='string')continue;
        if(requestKind(value.label.replace(/\d{1,2}:\d{2}\s*[AP]M$/i,''))!=='work')continue;
        const items=value.plan?.items;
        if(items&&(!Array.isArray(items)||!items.length||items.length>20||items.some(item=>typeof item.label!=='string'||!item.label.trim()||item.label.length>180||!['pending','in_progress','completed'].includes(item.status))))continue;
        tasks.set(chat,{label:value.label.slice(0,300),key:value.key,objective:typeof value.objective==='string'?value.objective.slice(0,180):'',plan:items?{items,total:items.length,done:items.filter(item=>item.status==='completed').length}:null});
      }}
    } catch {}
    function persistTasks(){try{const saved=[...tasks].map(([chat,value])=>[chat,{...value,key:String(value.key).slice(0,2000)}]);let raw=JSON.stringify(saved);while(raw.length>512000&&saved.length>1){saved.shift();raw=JSON.stringify(saved);}if(raw.length<=512000)storage?.setItem(taskStorageKey,raw);}catch{}}

    function sync(busy, chat, now = Date.now(), options = {}) {
      if (current && current.chat !== chat) finish(now, {collapse: false});
      if (busy && !current) {
        current = { id: String(++sequence), chat, started: now, ended: 0, expanded: true, completed: false, plan: null, events: [], messages: [], revision: 0, omitted: 0 };
        groups.push(current);
        if (groups.length > 60) groups.splice(0, groups.length - 60);
      } else if (!busy && current) finish(now, options);
      changed();
    }
    function finish(now = Date.now(), options = {}) { if (current) { current.ended = now; current.completed = options.collapse !== false; current = null; } }
    function step(name, detail = '') {
      if (!current) return;
      current.events.push({ name: String(name), detail: String(detail).slice(0, 300) });
      if (current.events.length > 100) current.events.shift(); changed();
    }
    function task(label, key, options = {}) {
      if (!current) return;
      let saved=tasks.get(current.chat);
      if (!saved && requestKind(label)!=='work')return;
      if (!saved || options.replace) {
        saved={label:String(label || 'Current task').slice(0,300),key,objective:'',plan:null};
        tasks.set(current.chat,saved);
        if(tasks.size>60)tasks.delete(tasks.keys().next().value);
      }
      current.taskLabel=saved.objective||'Planning project work';current.taskKey=saved.key;
      current.plan=saved.plan?JSON.parse(JSON.stringify(saved.plan)):null;
      persistTasks();changed();
    }
    function keepPlan(group, items) {
      const previous=group.plan?.items||[];
      const remaining=items.map(item=>item.label);
      for(const item of previous){const at=remaining.indexOf(item.label);if(at<0)throw Error('Keep the existing main task labels. Update their statuses or append requested work; replace the plan only when the user asks to change or stop following those tasks.');remaining.splice(at,1);}
      group.plan={total:items.length,done:items.filter(item=>item.status==='completed').length,items};
      const saved=tasks.get(group.chat);
      if(saved&&saved.key===group.taskKey){saved.plan=JSON.parse(JSON.stringify(group.plan));if(!saved.objective)saved.objective=items.map(item=>item.label).join(' · ').slice(0,180);group.taskLabel=saved.objective;}
      persistTasks();return group.plan;
    }
    function checklist(steps) {
      if (!current) throw Error('No active task to update.');
      if (!Array.isArray(steps) || !steps.length || steps.length > 20) throw Error('Provide 1–20 task steps.');
      const items = steps.map(step => {
        if (!step || typeof step.label !== 'string' || !step.label.trim() || step.label.length > 180 || !['pending','in_progress','completed'].includes(step.status)) throw Error('Each step needs a label (1–180 characters) and status pending, in_progress or completed.');
        if(commandLabel(step.label))throw Error('Use a user goal or outcome as the step label, rather than a command name.');
        return {label:step.label.trim(),status:step.status};
      });
      keepPlan(current,items);
      changed(); return current.plan;
    }
    function record(id, key, role, text) {
      const group = groups.find(group => group.id === id); if (!group) return;
      text = String(text || '');
      const oversized = text.length > 200000;
      if (oversized) text = '[This reply exceeds the desktop detail limit. Read the full reply in its original browser chat.]';
      if (role === 'assistant') {
        const plain = text.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, '');
        const steps = [...plain.matchAll(/^\s*[-*+]\s+\[([ xX])\]\s+([^\n]+)$/gm)].slice(0, 64);
        if (/^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:task\s+)?(?:plan|checklist)(?:\*\*)?\s*:?\s*$/im.test(plain) && steps.length >= 2) {
          try { if(steps.some(step=>commandLabel(step[2])))throw Error('Command names are not goals');keepPlan(group,steps.map(step=>({label:step[2].slice(0,180),status:step[1].toLowerCase()==='x'?'completed':'pending'}))); } catch {}
        }
      }
      const known = group.messages.find(message => message.key === key);
      if (known && known.text === text && known.role === role) return;
      if (oversized) group.omitted++;
      if (known) { known.text = text; known.role = role; }
      else group.messages.push({key,role,text});
      group.revision++;
      function size(g) { return g.messages.reduce((sum,message)=>sum+message.text.length,0); }
      while (group.messages.length > 120 || size(group) > 200000) { group.messages.shift();group.omitted++;group.revision++; }
      let total = groups.reduce((sum,g)=>sum+size(g),0);
      for (const old of groups) while (total > 800000 && old.messages.length) { total-=old.messages.shift().text.length;old.omitted++;old.revision++; }
    }
    function removeMessage(id, key) {
      const group = groups.find(group => group.id === id); if (!group) return;
      const at = group.messages.findIndex(message=>message.key===key);
      if (at >= 0) { group.messages.splice(at,1);group.revision++; }
    }
    function read(id, revision) {
      const group = groups.find(group=>group.id===id); if (!group) return {ok:false,error:'This activity is no longer retained. Open its original browser chat.'};
      if (revision === group.revision) return {ok:true,not_modified:true,revision:group.revision};
      return {ok:true,revision:group.revision,messages:group.messages.map(message=>({...message})),omitted:group.omitted};
    }
    function toggle(id) { const group = groups.find(group => group.id === id); if (group) { group.expanded = !group.expanded; changed(); } }
    function list(chat) { return groups.filter(group => group.chat === chat); }
    function label(group, now = Date.now()) {
      const seconds = Math.floor(((group.ended || now) - group.started) / 1000);
      return `${group.ended ? 'Worked' : 'Working'} for ${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    }
    return { sync, finish, step, task, checklist, record, removeMessage, read, toggle, list, label, active: () => current, saved: chat => tasks.get(chat) || null };
  }
  function exempt(text, calls = []) {
    const clean = String(text || '').replace(/[`*#]/g, '').trim();
    return /^(?:PLAZCODE_READY|PlazCode is ready)[.!]?$/i.test(clean) ||
      /^Output of '(?:list_commands|list_tools)'/.test(clean) ||
      /^⟦RS-SYS⟧/.test(clean) ||
      (calls.length > 0 && calls.every(call => /^(?:list_commands|list_tools)$/.test(call.tool)));
  }
  function progress(group) {
    if (group.completed) return 1;
    return group.plan && group.plan.total > 0 ? Math.max(0, Math.min(1, group.plan.done / group.plan.total)) : null;
  }
  function renderer({label,toggle,mount}) {
    const views = new Map();
    function sync(groups, findItem) {
      const mounted = new Set();
      const alive = new Set(groups.map(group => group.id));
      for (const [id, view] of views) if (!alive.has(id)) { view.binding?.dispose?.();view.node.remove();views.delete(id); }
      for (const group of groups) {
        const item = findItem(group);let view = views.get(group.id);
        if (!item || !item.isConnected) { if (view) view.node.hidden = true;continue; }
        if (!view) {
          const node = document.createElement('section');node.className='rs-chat-activity';
          const heading=document.createElement('button');heading.type='button';heading.className='rs-chat-activity-heading';
          const icon=document.createElement('span');icon.className='rs-chat-activity-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg width=18 height=18 viewBox="0 0 18 18" fill="none"><circle class="rs-activity-track" cx=9 cy=9 r=6.5/><circle class="rs-activity-fill" cx=9 cy=9 r=6.5 pathLength=100 stroke-dasharray=100 transform="rotate(-90 9 9)"/></svg>';
          const title=document.createElement('span');const arrow=document.createElement('span');arrow.className='rs-chat-activity-arrow';arrow.setAttribute('aria-hidden','true');arrow.innerHTML='<svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M4 2L8 6L4 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          const body=document.createElement('div');body.className='rs-chat-activity-body';body.id='rs-chat-activity-'+group.id;
          heading.setAttribute('aria-controls',body.id);heading.append(icon,title,arrow);heading.onclick=()=>toggle(group.id);node.append(heading,body);
          view={node,heading,icon,title,arrow,body};views.set(group.id,view);
        }
        if (view.item !== item || !view.node.isConnected || !view.binding) {
          view.binding?.dispose?.();view.item=item;
          try { view.binding=mount(item,view.node); } catch { view.binding=null; }
        }
        view.node.hidden = !view.binding;
        view.node.dataset.done=group.ended?'1':'0';view.title.textContent=label(group);const fraction = progress(group);
        view.node.dataset.progress = fraction === null ? 'unknown' : 'known';
        view.icon.querySelector('.rs-activity-fill').style.strokeDashoffset = String(100 * (1 - (fraction === null ? group.ended ? 0 : .25 : fraction)));
        view.heading.title = group.completed ? 'Task completed' : group.plan ? 'Plan progress: ' + group.plan.done + ' of ' + group.plan.total + ' steps complete' : group.ended ? 'Stopped before completion' : 'Working; total task progress is not known yet';
        view.heading.setAttribute('aria-expanded',String(group.expanded));view.arrow.style.transform=group.expanded?'rotate(90deg)':'rotate(0deg)';view.body.hidden=!group.expanded;
        const signature=group.expanded ? JSON.stringify([group.ended,group.events,!!group.messages.length]) : 'collapsed';
        if (signature!==view.signature) {
          view.signature=signature;view.body.replaceChildren();
          // Collapsed summaries still need placement and availability checks.
          if (group.expanded && !group.ended && !group.events.length && !group.messages.length) { const row=document.createElement('div');row.textContent='Waiting for the AI response…';view.body.appendChild(row); }
          for (const event of group.expanded ? group.events : []) { const row=document.createElement('div');const name=document.createElement('strong');name.textContent=event.name;const detail=document.createElement('span');detail.textContent=event.detail;row.append(name,detail);view.body.appendChild(row); }
        }
        view.body.hidden = !group.expanded || !view.body.childElementCount;
        try { view.binding?.place?.(); } catch { view.node.hidden=true; }
        if (view.binding && view.node.isConnected && !view.node.hidden) mounted.add(group.id);
      }
      return mounted;
    }
    return {sync};
  }
  return { create, renderer, exempt, progress, replacesTask, requestKind, commandLabel };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PlazCodeActivity;

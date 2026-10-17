// SPDX-License-Identifier: GPL-3.0-or-later
const PlazCodeExplorerUI=(()=>{
 'use strict';
 function mount(host,api,preferences,setPreference){
  host.innerHTML=`<div class="explorer-toolbar"><button class="softbtn" data-ex="refresh">Bridge Sync</button><span data-ex="status" role="status">Connect Studio to load your game.</span><label><input type="checkbox" data-ex="auto" checked> Auto-Sync: <b data-ex="auto-label">ON</b></label><button class="softbtn" data-ex="compare" disabled>Compare with Studio</button><button class="accentbtn" data-ex="push" disabled>Push to Workspace</button></div><div class="explorer-layout"><aside><input data-ex="filter" placeholder="Filter loaded objects & scripts" aria-label="Filter Explorer"><div data-ex="tree" role="tree" aria-label="Game Explorer"></div></aside><section><header data-ex="path">Select a script or object</header><div class="explorer-editor"><pre data-ex="lines" aria-hidden="true">1</pre><textarea data-ex="editor" aria-label="Script source" spellcheck="false" disabled></textarea></div><details data-ex="comparison" hidden><summary>Current Studio source — merge changes into your draft</summary><pre data-ex="studio"></pre></details><div data-ex="properties" class="explorer-properties" hidden></div></section></div>`;
  const find=name=>host.querySelector('[data-ex="'+name+'"]');
  const editor=find('editor'),tree=find('tree'),auto=find('auto'),status=find('status');
  let session='',selected=null,expected='',busy=false,blocked=false,timer=null,epoch=0,active=true;
  const key=()=>selected?'plazcode-explorer-draft:'+session+':'+selected.id:'';
  const dirty=()=>!!selected&&editor.value!==expected;
  function message(text){status.textContent=text;find('push').disabled=busy||!dirty();find('compare').disabled=busy||!selected;}
  function store(){try{if(dirty())localStorage.setItem(key(),JSON.stringify({expected,source:editor.value,path:find('path').textContent}));else localStorage.removeItem(key());}catch{message('Draft storage unavailable. Keep this editor open until you push.');}}
  function lines(){find('lines').textContent=Array.from({length:editor.value.split('\n').length},(_,i)=>i+1).join('\n');}
  function renderProperties(properties){
   const container=find('properties');container.replaceChildren();
   for(const name of Object.keys(properties)){
    const value=properties[name],row=document.createElement('label'),label=document.createElement('span'),controls=document.createElement('div');row.className='explorer-property';label.textContent=name;row.append(label,controls);container.append(row);
    const update=next=>{let draft;try{draft=JSON.parse(editor.value);}catch{return;}draft[name]=next;editor.value=JSON.stringify(draft,null,2);editor.dispatchEvent(new Event('input',{bubbles:true}));};
    if(Array.isArray(value)){
     if(name.includes('Color')){const input=document.createElement('input');input.type='color';input.value='#'+value.map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');input.setAttribute('aria-label',name);input.oninput=()=>update([1,3,5].map(start=>parseInt(input.value.slice(start,start+2),16)/255));controls.append(input);}
     else {const axes=value.length===4?['X scale','X offset','Y scale','Y offset']:['X','Y','Z'];const inputs=value.map((component,index)=>{const input=document.createElement('input');input.type='number';input.step='any';input.value=component;input.setAttribute('aria-label',name+' '+axes[index]);input.title=axes[index];controls.append(input);return input;});for(const input of inputs)input.oninput=()=>update(inputs.map(i=>Number(i.value)));}
    }else{
     const input=document.createElement(name==='Text'?'textarea':'input');input.setAttribute('aria-label',name);if(typeof value==='boolean'){input.type='checkbox';input.checked=value;input.onchange=()=>update(input.checked);}else {if(typeof value==='number'){input.type='number';input.step='any';}input.value=value;input.oninput=()=>update(typeof value==='number'?Number(input.value):input.value);}input.disabled=name==='ClassName';controls.append(input);
    }
   }
  }
  async function push(){
   clearTimeout(timer);if(busy||!dirty()||!selected||!active)return;
   const id=selected.id,context=session,base=expected,source=editor.value,isScript=!!selected.script;
   let dispatched=false;busy=true;message('Syncing to Studio…');
   try{
    const request=isScript?{action:'write',id,session:context,expected:base,source}:{action:'write',id,session:context,properties:JSON.parse(source),expected_properties:JSON.parse(base)};
    dispatched=true;const result=await api(request);
    if(session!==context||selected?.id!==id)return;
    if(result.session!==context||(isScript&&result.source!==source))throw Error('Studio source does not match this edit. Reload and merge before retrying.');
    const accepted=isScript?source:JSON.stringify(result.properties,null,2);
    if(editor.value===source&&!isScript){editor.value=accepted;lines();renderProperties(result.properties);}
    if(result.path)find('path').textContent=result.path;expected=accepted;blocked=false;store();message(dirty()?'New edits waiting to sync':'In sync with Studio');
   }catch(error){blocked=dispatched;message(String(error.message||error)+' Your draft is preserved.');}
   finally{busy=false;find('push').disabled=!dirty();find('compare').disabled=!selected;if(dirty()&&!blocked&&auto.checked&&active)timer=setTimeout(push,700);}
  }
  async function select(node){
   if(busy){message('Wait for the current push to finish.');return;}
   clearTimeout(timer);store();const generation=++epoch;
   try{
    const result=await api({action:'read',id:node.id,session});if(generation!==epoch)return;
    selected={...node,script:!!result.script};expected=result.script?result.source:JSON.stringify(result.properties,null,2);blocked=false;
    find('path').textContent=result.path||node.name;editor.value=expected;editor.disabled=false;
    find('properties').hidden=!!result.script;if(!result.script)renderProperties(result.properties);editor.setAttribute('aria-label',result.script?'Script source':'Object properties JSON');
    host.querySelector('.explorer-editor').hidden=!result.script;
    let saved;try{saved=JSON.parse(localStorage.getItem(key())||'null');}catch{}
    if(saved&&typeof saved.source==='string'){editor.value=saved.source;if(typeof saved.expected==='string')expected=saved.expected;blocked=true;message('Restored local draft. Compare with Studio, merge changes and push manually.');}else message(result.script?'In sync with Studio':'Object properties');
    if(!result.script){try{renderProperties(JSON.parse(editor.value));}catch{}}find('comparison').hidden=true;lines();find('push').disabled=!dirty();find('compare').disabled=false;
    tree.querySelectorAll('[aria-selected]').forEach(row=>row.setAttribute('aria-selected',String(row.dataset.id===node.id)));
   }catch(error){message(error.message||String(error));}
  }
  async function children(id,parent,offset=0){
   const generation=epoch,result=await api({action:'tree',id,session:session||undefined,offset});
   if(generation!==epoch)return;
   if(session&&result.session!==session){message('Studio session changed. Refresh Explorer.');return;}
   session=result.session;
   for(const node of result.nodes){
    const wrap=document.createElement('div'),row=document.createElement('button'),group=document.createElement('div');
    row.type='button';row.setAttribute('role','treeitem');row.setAttribute('aria-selected','false');row.dataset.id=node.id;row.dataset.name=node.name.toLowerCase();row.className='explorer-node';
    const twist=document.createElement('span');twist.textContent=node.children?'▸':' ';twist.setAttribute('aria-hidden','true');
    const label=document.createElement('span');label.textContent=(node.script?'▣ ':node.class==='Folder'?'▱ ':'◇ ')+node.name;row.append(twist,label);group.setAttribute('role','group');group.hidden=true;wrap.append(row,group);parent.append(wrap);
    let loaded=false;
    row.onclick=async event=>{
     if(node.children&&event.target===twist){group.hidden=!group.hidden;row.setAttribute('aria-expanded',String(!group.hidden));twist.textContent=group.hidden?'▸':'▾';if(!loaded){loaded=true;try{await children(node.id,group);}catch(error){loaded=false;message(error.message||String(error));}}}
     else await select(node);
    };
   }
   if(result.next_offset!=null){const more=document.createElement('button');more.textContent='Load more objects';more.onclick=async()=>{more.disabled=true;try{await children(id,parent,result.next_offset);more.remove();}catch(error){more.disabled=false;message(error.message||String(error));}};parent.append(more);}
  }
  async function refresh(){
   active=true;clearTimeout(timer);if(busy){message('Wait for the current push to finish.');return;}
   store();++epoch;selected=null;expected='';session='';tree.replaceChildren();editor.disabled=true;editor.value='';lines();find('push').disabled=true;
   auto.checked=preferences().rsExplorerAutoSync!==false;find('auto-label').textContent=auto.checked?'ON':'OFF';
   try{await children('root',tree);message('Game loaded. Expand objects to browse scripts.');}catch(error){message(error.message||String(error));}
  }
  editor.addEventListener('input',()=>{lines();store();message('Local edits waiting to sync');clearTimeout(timer);if(auto.checked&&!blocked&&active)timer=setTimeout(push,700);});
  editor.addEventListener('scroll',()=>find('lines').scrollTop=editor.scrollTop);
  editor.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();void push();}});
  auto.onchange=()=>{find('auto-label').textContent=auto.checked?'ON':'OFF';void setPreference({rsExplorerAutoSync:auto.checked}).catch(error=>message(error.message||String(error)));clearTimeout(timer);if(auto.checked&&dirty()&&!blocked)timer=setTimeout(push,700);};
  find('filter').oninput=()=>{const query=find('filter').value.toLowerCase();tree.querySelectorAll('.explorer-node').forEach(row=>{row.hidden=!!query&&!row.dataset.name.includes(query);});};
  find('compare').onclick=async()=>{if(!selected||busy)return;const id=selected.id,context=session;try{const latest=await api({action:'read',id,session:context});if(selected?.id!==id||session!==context||latest.session!==context)return;const latestText=latest.script?latest.source:JSON.stringify(latest.properties,null,2);find('studio').textContent=latestText;find('comparison').hidden=false;find('comparison').open=true;expected=latestText;blocked=true;store();message('Compare the Studio source below with your draft. Merge changes, then push manually.');}catch(error){message(error.message||String(error));}};
  find('push').onclick=push;find('refresh').onclick=refresh;
  return {refresh,pause(){active=false;clearTimeout(timer);store();},push};
 }
 return {mount};
})();
if(typeof module!=='undefined')module.exports=PlazCodeExplorerUI;

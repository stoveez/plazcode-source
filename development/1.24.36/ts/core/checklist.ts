// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/checklist.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
const PlazCodeChecklist = (() => {
  type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
  type PlanItem = { label: string; status: string };
  type Group = { id?: string; taskLabel?: string; completed?: boolean; ended?: boolean; plan?: { items?: PlanItem[]; done: number; total: number } | null };
  type MountOptions = { root: Element; getGroup: () => Group | null | undefined; getBar: () => HTMLElement | null | undefined; blocked: () => boolean; getDetached?: () => boolean; storage?: Store | null };
  type DragState = { id: number; element: HTMLElement; x: number; y: number; left: number; top: number; threshold: number; moved: boolean };
  function userText(item: Element, read: (node: Element) => unknown): string {
    try {
      const clone=item.cloneNode(true) as Element;
      clone.querySelectorAll('time,[datetime],[data-testid="timestamp"],[data-testid*="-timestamp"],[data-message-time],[class*="timestamp"],[class*="message-time"]').forEach(node=>node.remove());
      // Some hosts put an unmarked clock beside the message body. Remove only
      // standalone metadata leaves; literal times inside prose/code stay intact.
      for(const node of clone.querySelectorAll('span,div')) {
        if(node.childElementCount || !/^\s*\d{1,2}:\d{2}\s*(?:AM|PM)\s*$/i.test(node.textContent||'') || node.closest('p,pre,code,blockquote,li'))continue;
        const previous=node.previousElementSibling||node.parentElement?.previousElementSibling;
        if(previous && !/^(?:SPAN|A|EM|STRONG|CODE)$/.test(previous.tagName))node.remove();
      }
      return String(read(clone)||'').trim();
    } catch { return ''; }
  }
  function mount({root, getGroup, getBar, blocked, getDetached=()=>false, storage}: MountOptions) {
    // autoCollapsed: folded into the Tasks pill because PlazCode itself was minimized (owner, 2026-11-18); it opens again
    // with PlazCode unless the person opened or closed it in between. wasDetached: PlazCode's minimized state last seen.
    const key='plazcode.checklistHidden',positionKey='plazcode.checklistPosition'; let collapsed=false, signature='',position:{x:number;y:number}|null=null,drag:DragState|null=null,autoCollapsed=false,wasDetached:boolean|null=null;
    try { if(!storage)storage=window.sessionStorage;collapsed=storage.getItem(key)==='1';const saved=JSON.parse(storage.getItem(positionKey) as string);if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))position={x:saved.x,y:saved.y}; } catch {}
    const panel=document.createElement('section');panel.id='rs-task-checklist';panel.hidden=true;panel.setAttribute('aria-label','Task checklist');
    panel.innerHTML='<header><span class="rs-checklist-ring" role="progressbar" aria-label="Task plan progress" aria-valuemin="0" aria-valuemax="100"><svg viewBox="0 0 32 32" aria-hidden="true"><circle class="rs-checklist-track" cx="16" cy="16" r="12"/><circle class="rs-checklist-fill" cx="16" cy="16" r="12" pathLength="100" stroke-dasharray="100" transform="rotate(-90 16 16)"/></svg><span class="rs-checklist-percent"></span></span><span class="rs-checklist-heading"><strong>Task checklist</strong><small></small></span><button type="button" class="rs-checklist-hide" aria-label="Hide task checklist" title="Hide checklist — the AI keeps working">−</button></header><ol></ol>';
    const tab=document.createElement('button');tab.id='rs-checklist-show';tab.type='button';tab.hidden=true;tab.innerHTML='<span class="rs-checklist-tab-icon" aria-hidden="true">✓</span><span class="rs-checklist-tab-label">Tasks</span><span class="rs-checklist-tab-count"></span>';tab.setAttribute('aria-label','Show task checklist');
    root.append(panel,tab);
    function setCollapsed(value:boolean) {
      collapsed=value;autoCollapsed=false;try{if(value)(storage as Store).setItem(key,'1');else (storage as Store).removeItem(key);}catch{}
      place();(value?tab:panel.querySelector('button') as HTMLButtonElement).focus({preventScroll:true});
    }
    // Minimizing PlazCode folds the list into its pill, without saving that as the person's choice and without moving focus.
    function followBar(detached:boolean) {
      if(wasDetached===detached)return;const first=wasDetached===null;wasDetached=detached;
      if(detached&&!collapsed){collapsed=true;autoCollapsed=true;}
      else if(!detached&&!first&&autoCollapsed){collapsed=false;autoCollapsed=false;}
    }
    (panel.querySelector('button') as HTMLButtonElement).onclick=()=>setCollapsed(true);
    function savePosition(){try{(storage as Store).setItem(positionKey,JSON.stringify(position));}catch{}}
    // While PlazCode is minimized, the list and its Tasks pill can be dragged anywhere and share one saved spot. The pill
    // moves only after the pointer travels 5 px, so a plain click still opens the list (as PlazCode's own minimized button).
    function stopDrag(){if(drag){const {id,element,moved}=drag;drag=null;try{element.releasePointerCapture(id);}catch{}element.removeAttribute('data-dragging');if(moved){savePosition();if(element===tab){suppressClick=true;setTimeout(()=>{suppressClick=false;},60);}}}}
    let suppressClick=false;
    function startDrag(element:HTMLElement,event:PointerEvent,threshold:number){
      const rect=element.getBoundingClientRect();drag={id:event.pointerId,element,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,threshold,moved:false};
      try{element.setPointerCapture(event.pointerId);}catch{}
      if(!threshold){drag.moved=true;position={x:rect.left,y:rect.top};element.dataset.dragging='true';event.preventDefault();}
    }
    function moveDrag(event:PointerEvent){
      if(!drag||event.pointerId!==drag.id)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(!drag.moved){if(Math.hypot(dx,dy)<drag.threshold)return;drag.moved=true;drag.element.dataset.dragging='true';}
      position={x:drag.left+dx,y:drag.top+dy};place();event.preventDefault();
    }
    panel.addEventListener('pointerdown',(event:PointerEvent)=>{if(!getDetached()||event.button!==0||(event.target as Element).closest('button'))return;startDrag(panel,event,0);});
    tab.addEventListener('pointerdown',(event:PointerEvent)=>{if(!getDetached()||event.button!==0)return;startDrag(tab,event,5);});
    for(const element of [panel,tab]){element.addEventListener('pointermove',moveDrag);element.addEventListener('pointerup',stopDrag);element.addEventListener('pointercancel',stopDrag);element.addEventListener('lostpointercapture',stopDrag);}
    window.addEventListener('blur',stopDrag);
    tab.onclick=(event:MouseEvent)=>{if(suppressClick){suppressClick=false;event.preventDefault();return;}setCollapsed(false);};
    const arrows=(element:HTMLElement)=>(event:KeyboardEvent)=>{if(!getDetached()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;const rect=element.getBoundingClientRect(),step=event.shiftKey?40:10;position={x:rect.left+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),y:rect.top+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0)};place();savePosition();event.preventDefault();};
    const header=panel.querySelector('header') as HTMLElement;header.tabIndex=0;header.title='When the bar is hidden, drag this box or use arrow keys to move it.';header.setAttribute('aria-label','Task checklist; use arrow keys to move when detached');
    header.addEventListener('keydown',arrows(panel));tab.addEventListener('keydown',arrows(tab));
    function render() {
      const group=getGroup();
      if (!group || !group.taskLabel) {panel.hidden=true;tab.hidden=true;return;}
      const items=group.plan?.items?.length ? group.plan.items : [{label:'Waiting for the AI to describe the project goal',status:'pending'}];
      const completed=group.completed&&(!group.plan||group.plan.done===group.plan.total);
      const percent=completed?100:Math.round(100*(group.plan?group.plan.done/group.plan.total:0));
      const next=JSON.stringify([group.id,completed,group.ended,group.taskLabel,items,percent]);
      if(next!==signature){
        signature=next;panel.dataset.done=String(!!completed);
        (panel.querySelector('.rs-checklist-percent') as HTMLElement).textContent=percent+'%';
        (panel.querySelector('.rs-checklist-ring') as Element).setAttribute('aria-valuenow',String(percent));
        (panel.querySelector('.rs-checklist-fill') as SVGElement).style.strokeDashoffset=String(100-percent);
        const doneCount=completed?items.length:items.filter(item=>item.status==='completed').length;
        const goal=group.taskLabel&&group.taskLabel!=='Planning project work'?group.taskLabel:'Task checklist';
        (panel.querySelector('small') as HTMLElement).textContent=completed?'Completed':(group.plan?`${doneCount} of ${items.length} done`+(group.ended?' · paused':''):'Waiting for task steps');
        (panel.querySelector('strong') as HTMLElement).textContent=goal;
        // The collapsed Tasks pill shows how far the plan is ("2/5"), or nothing while there is no plan yet.
        (tab.querySelector('.rs-checklist-tab-count') as HTMLElement).textContent=group.plan?`${doneCount}/${items.length}`:'';tab.dataset.done=String(!!completed);
        (panel.querySelector('strong') as HTMLElement).title=group.taskLabel;
        const list=panel.querySelector('ol') as HTMLElement;list.replaceChildren();
        for(const [index,item] of items.entries()){const row=document.createElement('li'),icon=document.createElement('span'),label=document.createElement('span');const done=completed||item.status==='completed';row.dataset.status=done?'completed':item.status;icon.className='rs-checklist-mark';icon.textContent=done?'✓':item.status==='in_progress'?'◉':'○';icon.setAttribute('aria-hidden','true');label.className="rs-checklist-label";label.textContent=(group.plan?`${index+1}. `:"")+item.label;row.setAttribute('aria-label',item.label+' — '+(done?'completed':item.status.replace('_',' ')));row.append(icon,label);list.append(row);}
      }
      place();
    }
    function place() {
      const group=getGroup(),bar=getBar(),rect=bar?.isConnected&&bar.style.display!=='none'?bar.getBoundingClientRect():null;
      const detached=!!getDetached();followBar(detached);const available=!!group?.taskLabel&&(detached||!!rect?.width&&rect.top>64)&&!blocked();
      panel.hidden=!available||collapsed;tab.hidden=!available||!collapsed;
      if(!available)return;
      const element=collapsed?tab:panel,width=collapsed?(tab.querySelector('.rs-checklist-tab-count')?.textContent?124:92):Math.min(300,window.innerWidth-16);
      panel.dataset.detached=String(detached);tab.dataset.detached=String(detached);
      if(detached){
        if(!position){const previous=element.getBoundingClientRect();position={x:previous.width?previous.left:Math.max(8,window.innerWidth-316),y:previous.height?previous.top:Math.max(8,window.innerHeight-380)};}
        element.style.width=width+'px';element.style.bottom='auto';panel.style.maxHeight=Math.max(48,Math.min(330,window.innerHeight-16))+'px';panel.style.setProperty('--rs-checklist-space',Math.max(48,Math.min(330,window.innerHeight-16))+'px');
        const height=element.offsetHeight||(collapsed?32:180);
        position.x=Math.max(8,Math.min(window.innerWidth-width-8,position.x));position.y=Math.max(8,Math.min(window.innerHeight-height-8,position.y));
        element.style.left=position.x+'px';element.style.top=position.y+'px';return;
      }
      stopDrag();element.style.top='auto';
      element.style.width=width+'px';element.style.left=Math.max(8,Math.min(window.innerWidth-width-8,(rect as DOMRect).right-width))+'px';element.style.bottom=(window.innerHeight-(rect as DOMRect).top+8)+'px';
      panel.style.maxHeight=Math.max(48,Math.min(330,(rect as DOMRect).top-16))+'px';
      panel.style.setProperty('--rs-checklist-space',Math.max(48,Math.min(330,(rect as DOMRect).top-16))+'px');
    }
    return {render,place,setCollapsed,panel,tab};
  }
  return {mount,userText};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=PlazCodeChecklist;

// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/effort-picker.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
// Styled, keyboard-accessible effort menu. The original select remains the state/event contract.
function PlazCodeMountEffortPicker(select: (HTMLSelectElement & { _ultraPicker?: { refresh: () => void; close: (focus?: boolean) => void } }) | null){
 if(!select||select.tagName!=='SELECT')return null;if(select._ultraPicker)return select._ultraPicker;
 const wrap=document.createElement('div');wrap.className='pc-effort-picker';select.before(wrap);wrap.append(select);select.hidden=true;
 const trigger=document.createElement('button');trigger.type='button';trigger.className='pc-effort-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
 const label=document.createElement('span'),arrow=document.createElement('span');arrow.textContent='⌄';arrow.setAttribute('aria-hidden','true');trigger.append(label,arrow);
 const panel=document.createElement('div');panel.className='pc-effort-options';panel.hidden=true;panel.setAttribute('role','listbox');panel.setAttribute('aria-label','Reasoning effort');
 const options:HTMLButtonElement[]=Array.from(select.options).map((option:HTMLOptionElement)=>{const button=document.createElement('button');button.type='button';button.setAttribute('role','option');button.tabIndex=-1;button.dataset.value=option.value;const text=document.createElement('span');text.textContent=option.textContent;text.classList.toggle('pc-ultra-label',option.value==='ultracode');button.append(text);button.onclick=()=>choose(option.value);panel.append(button);return button;});
 wrap.append(trigger,panel);
 function refresh(){if(!select)return;const value=select.value,text=Array.from(select.options).find(o=>o.value===value)?.textContent||'Default';if(label.textContent!==text)label.textContent=text;label.classList.toggle('pc-ultra-label',value==='ultracode');trigger.disabled=select.disabled;trigger.setAttribute('aria-label','Reasoning effort: '+text);for(const b of options)b.setAttribute('aria-selected',String(b.dataset.value===value));}
 let lifted:Element|null=null;function lift(on:boolean){try{if(on){lifted=wrap.closest('.settingcard,.panel');if(lifted)lifted.classList.add('pc-effort-lift');}else if(lifted){lifted.classList.remove('pc-effort-lift');lifted=null;}}catch{}}
 function close(focus=false){lift(false);panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();}
 function open(index?:number){
  if(!select)return;
  refresh();if(trigger.disabled)return;const rect=trigger.getBoundingClientRect();
  panel.hidden=false;lift(true);
  const bounds=wrap.closest('.content,#rs-menu')?.getBoundingClientRect();
  const top=Math.max(0,bounds?bounds.top:0),bottom=Math.min(innerHeight,bounds?bounds.bottom:innerHeight);
  const below=Math.max(0,bottom-rect.bottom-12),above=Math.max(0,rect.top-top-12);
  const up=below<Math.min(280,panel.scrollHeight)&&above>below;
  wrap.toggleAttribute('data-open-up',up);panel.style.maxHeight=Math.min(280,up?above:below)+'px';
  trigger.setAttribute('aria-expanded','true');const target=options[index as number]||options.find(b=>b.dataset.value===select.value)||options[0];
  if(target){target.focus();target.scrollIntoView?.({block:'nearest'});}
 }
 function choose(value:string){if(!select||panel.hidden)return;select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));refresh();close(true);}
 trigger.onclick=()=>panel.hidden?open():close();trigger.onkeydown=(e:KeyboardEvent)=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();open(e.key==='Home'?0:e.key==='End'?options.length-1:undefined);}};
 panel.onkeydown=(e:KeyboardEvent)=>{const index=options.indexOf(document.activeElement as HTMLButtonElement);if(e.key==='Escape'){e.preventDefault();close(true);}else if(e.key==='Tab')close();else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?options.length-1:(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options[next].focus();}else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(index>=0)choose(options[index].dataset.value as string);}};
 const outside=(e:Event)=>{if(!wrap.contains(e.target as Node|null))close();};document.addEventListener('pointerdown',outside);select.addEventListener('change',refresh);
 const timer=setInterval(()=>{if(!wrap.isConnected){clearInterval(timer);document.removeEventListener('pointerdown',outside);return;}refresh();},500);refresh();
 return select._ultraPicker={refresh,close};
}
if(typeof module!=='undefined')module.exports=PlazCodeMountEffortPicker;

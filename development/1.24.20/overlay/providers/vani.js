// SPDX-License-Identifier: GPL-3.0-or-later
// Vani AI. Public /c markup checked on the live site; signed-in surfaces are
// accepted only when their composer and author controls identify a chat.
const RSProvider = (() => {
  'use strict';
  const S={turn:'[data-turn-id]',thinking:'[aria-label="Thinking"],.reasoning,[data-is-thinking="true"],[data-role="thinking"],[data-testid="thinking"]',
    owned:'#rs-root,#rs-input-cover,#rs-diag-log,.rs-chip,.rs-chat-activity',send:'button[aria-label="Send message"],button[aria-label="Send"]',stop:'button[aria-label="Stop generating"],button[aria-label="Stop generation"]'};
  const timings={GEN_IDLE_MS:1600,REASON_IDLE_MS:16000,WARMUP_MS:45000,REASON_NOREPLY_MS:120000,STABLE_MS:8000,RESPONSE_TIMEOUT_MS:300000};
  const safeRead=(fn,fallback=null)=>{try{return fn();}catch{return fallback;}};
  const q=(root,sel)=>root?safeRead(()=>root.querySelector(sel)):null;
  const qa=(root,sel)=>root?safeRead(()=>Array.from(root.querySelectorAll(sel)),[]):[];
  const closest=(el,sel)=>el?safeRead(()=>el.closest(sel)):null;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const norm=x=>String(x??'').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').trim();
  let diag=()=>{},isStopped=()=>false,locked=false,inFlight=false,committed=false,failure='',writing=false,performingEdit=false;
  const originals=new WeakMap();let guardInstalled=false,nativeCommitForm=null;
  let pageId=typeof crypto.randomUUID==='function'?crypto.randomUUID():String(Date.now()),epoch=0;
  function allowed(){return location.hostname==='c.vani.ai' && /^\/(?:c|chat)(?:\/[^/]+)?\/?$/.test(location.pathname);}
  function shown(el){
    if(!el||!el.isConnected||safeRead(()=>closest(el,S.owned+', [hidden],[aria-hidden="true"],dialog,[role="dialog"],nav,header,[role="navigation"]')))return false;
    return safeRead(()=>{for(let n=el;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||s.opacity==='0')return false;}return true;},false);
  }
  function chatRoot(){if(!allowed())return null;const roots=qa(document,'main').filter(shown);return roots.length===1?roots[0]:null;}
  function getEditor(){
    const root=chatRoot();if(!root)return null;
    const editors=qa(root,'textarea,[contenteditable][role="textbox"],.ProseMirror[contenteditable],.tiptap[contenteditable]').filter(el=>{
      if(!shown(el)||el.disabled||safeRead(()=>closest(el,S.turn))||safeRead(()=>closest(el,'[role="search"], [data-slot="sidebar"]')))return false;
      const form=safeRead(()=>closest(el,'form'));return form&&safeRead(()=>root.contains(form))&&!!q(form,S.send+','+S.stop);
    });
    // Multiple chat boxes are ambiguous; never guess the first textarea.
    return editors.length===1?editors[0]:null;
  }
  const composerFrame=()=>safeRead(()=>closest(getEditor(),'form'));
  const barAnchor=composerFrame;
  const sendButton=()=>q(composerFrame(),S.send);
  const stopButton=()=>q(composerFrame(),S.stop);
  function actionable(b){return !!b&&shown(b)&&!b.disabled&&safeRead(()=>b.getAttribute('aria-disabled'))!=='true'&&!safeRead(()=>closest(b,'[inert]'))&&safeRead(()=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(b).pointerEvents!=='none';},false);}
  function editorValue(el){if(!el)return '';return el.tagName==='TEXTAREA'?el.value:String(el.innerText??el.textContent??'').replace(/\u00a0/g,' ');}
  const editorText=()=>editorValue(getEditor());
  const conversationKey=()=>allowed()?location.pathname.replace(/\/$/,'')+'|'+(/^\/(?:c|chat)\/?$/.test(location.pathname)?pageId+':'+epoch:'saved'):null;
  function roleOf(item){
    if(!item||!safeRead(()=>item.matches(S.turn)))return '';
    const explicit=(safeRead(()=>item.getAttribute('data-message-role'))||safeRead(()=>item.getAttribute('data-role'))||'').toLowerCase();
    const user=explicit==='user'||!!q(item,'[data-message-actions="user"]')||!!q(item,':scope > .items-end');
    const assistant=explicit==='assistant'||!!q(item,'[data-message-actions="assistant"],[data-turn-model]');
    return user===assistant?'':user?'user':'assistant';
  }
  let observer=null,dirty=true,cache=null,cacheRoute='';const textCache=new WeakMap();
  function owned(node){return !!safeRead(()=>closest(node?.nodeType===1?node:node?.parentElement,S.owned));}
  function invalidateItems(records){
    if(!records){dirty=true;return;}
    for(const r of records){
      if(owned(r.target))continue;
      const changed=[...(r.addedNodes||[]),...(r.removedNodes||[])];
      if(changed.length&&changed.every(owned))continue;
      const el=r.target.nodeType===1?r.target:r.target.parentElement,item=safeRead(()=>closest(el,S.turn));
      if(item)textCache.delete(item);
      if(!item||r.type==='attributes'||r.type==='childList'||changed.some(n=>n.nodeType===1&&(safeRead(()=>n.matches(S.turn))||q(n,S.turn))))dirty=true;
    }
  }
  function drain(){
    if(!observer){observer=new MutationObserver(invalidateItems);observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-turn-id','data-role','data-message-role','data-message-actions','data-turn-model','aria-label','data-is-thinking','hidden','aria-hidden','class','style']});}
    invalidateItems(observer.takeRecords());const route=conversationKey();if(route!==cacheRoute){dirty=true;cacheRoute=route;}
  }
  function rawItems(){
    drain();const root=chatRoot();if(!root)return [];
    if(dirty||cache?.root!==root){cache={root,items:qa(root,S.turn).filter(el=>shown(el)&&!safeRead(()=>closest(el,S.owned))&&roleOf(el))};dirty=false;}
    return cache.items.filter(el=>el.isConnected&&shown(el));
  }
  function textWithout(root,exclude=''){
    if(!root)return '';
    // Read native visibility without our presentation-only masks. This is fully
    // synchronous: drain real host changes first, restore exact classes, and
    // discard only the class records generated by this bounded temporary unmask.
    if(observer)invalidateItems(observer.takeRecords());
    const maskClasses=['rs-hidden','rs-tool-hide','rs-code-hide'],masked=[];
    for(const n of [root,...qa(root,'.rs-hidden,.rs-tool-hide,.rs-code-hide')]){if(maskClasses.some(c=>safeRead(()=>n.classList.contains(c)))){masked.push([n,safeRead(()=>n.getAttribute('class'))]);maskClasses.forEach(c=>n.classList.remove(c));}}
    try{let out='';const skip=S.owned+', [data-message-actions],[data-turn-model],time,button,[hidden],[aria-hidden="true"],'+S.thinking+(exclude?','+exclude:'');
    // Iterative traversal avoids recursion limits on a deeply nested code reply.
    const stack=[{node:root,end:false}];
    while(stack.length){const {node:n,end}=stack.pop();if(n.nodeType===3){out+=n.nodeValue||'';continue;}if(n.nodeType!==1)continue;
      if(safeRead(()=>n.matches(skip)))continue;
      // Ignore native hidden copies, but retain source deliberately hidden by our own tool cards.
      if(!end){const cs=safeRead(()=>getComputedStyle(n),{display:'none',visibility:'hidden',opacity:'0',pointerEvents:'none'});if(cs.display==='none'||cs.visibility==='hidden'||cs.visibility==='collapse'||cs.opacity==='0')continue;}
      const block=/^(P|DIV|PRE|LI|UL|OL|BLOCKQUOTE|H[1-6]|ARTICLE|SECTION)$/.test(n.tagName);
      if(end){if(block&&!out.endsWith('\n'))out+='\n';continue;}
      if(n.tagName==='BR'){out+='\n';continue;}if(block&&out&&!out.endsWith('\n'))out+='\n';
      stack.push({node:n,end:true});for(let i=n.childNodes.length-1;i>=0;i--)stack.push({node:n.childNodes[i],end:false});
    }return out.trim();
    }finally{for(const [n,cls] of masked){if(cls===null)n.removeAttribute('class');else n.setAttribute('class',cls);}if(observer){const own=new Set(masked.map(([n])=>n));invalidateItems(observer.takeRecords().filter(r=>!(r.type==='attributes'&&r.attributeName==='class'&&own.has(r.target))));}}
  }
  function itemText(item){drain();if(!item||!shown(item)||safeRead(()=>closest(item,'[data-slot="sidebar"],[role="complementary"]'))||!safeRead(()=>chatRoot()?.contains(item))||!roleOf(item))return '';if(!textCache.has(item))textCache.set(item,textWithout(item));return textCache.get(item);}
  function classifyText(item,exclude){if(!itemText(item))return '';return exclude?textWithout(item,exclude):itemText(item);}
  function isUserItem(item){drain();return roleOf(item)==='user';}
  function isAssistantItem(item){drain();return roleOf(item)==='assistant';}
  function allItems(){const items=rawItems();for(const item of items){if(roleOf(item)!=='user')continue;const text=itemText(item),injected=text.startsWith('⟦RS-SYS⟧')||(typeof RSParse!=='undefined'&&RSParse.isInjectedFeedback(text));
      if(injected){if(!safeRead(()=>item.hasAttribute('data-rs-vani-injected'))){item.setAttribute('data-rs-vani-injected','1');item.classList.add('rs-hidden');}}
      else if(safeRead(()=>item.hasAttribute('data-rs-vani-injected'))){item.removeAttribute('data-rs-vani-injected');item.classList.remove('rs-hidden');}
    }return items;}
  const assistantItems=()=>allItems().filter(isAssistantItem),assistantCount=()=>assistantItems().length,userCount=()=>allItems().filter(isUserItem).length;
  const lastAssistant=()=>assistantItems().at(-1)||null;
  function itemKey(item){if(!item||!roleOf(item))return null;const id=safeRead(()=>item.getAttribute('data-turn-id'));return id?conversationKey()+'|'+roleOf(item)+':'+id:null;}
  const lastAssistantId=()=>itemKey(lastAssistant());
  function readAssistant(){const item=lastAssistant();return {present:!!item,item,reply:itemText(item),thinking:''};}
  const streamLen=item=>itemText(item===undefined?lastAssistant():item).length;
  const snapshot=()=>({th:0,rp:streamLen()});
  const chatIsEmpty=()=>allItems().length===0,isFreshChat=()=>chatIsEmpty()&&!!getEditor();
  const isHardGenerating=()=>!!stopButton();
  // Native Stop is authoritative. A long thinking pause is not completion.
  const isGenerating=isHardGenerating,isBusyNow=isHardGenerating;
  function applyLock(el){
    if(!el)return;
    if(!originals.has(el))originals.set(el,{readonly:el.readOnly,editable:safeRead(()=>el.getAttribute('contenteditable'))});
    const old=originals.get(el);
    if(el.tagName==='TEXTAREA')el.readOnly=locked?true:old.readonly;
    else if(locked&&!writing)el.setAttribute('contenteditable','false');else if(old.editable===null)el.removeAttribute('contenteditable');else el.setAttribute('contenteditable',old.editable);
  }
  function installGuard(){if(guardInstalled)return;guardInstalled=true;
    const block=e=>{if(!locked||!e.isTrusted)return;const ed=getEditor();if(ed&&(e.target===ed||safeRead(()=>ed.contains(e.target)))){if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();}};
    for(const name of ['beforeinput','paste','drop','cut','keydown'])document.addEventListener(name,block,true);
    const blockSend=e=>{if(!e.isTrusted||(!locked&&!inFlight))return;const form=composerFrame(),button=safeRead(()=>closest(e.target,'button'));if(e.type==='submit'&&e.target===nativeCommitForm)return;if(form&&((e.type==='submit'&&e.target===form)||(e.type==='click'&&button===sendButton()))){if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();}};
    document.addEventListener('click',blockSend,true);document.addEventListener('submit',blockSend,true);
    document.addEventListener('click',e=>{const b=safeRead(()=>closest(e.target,'button'));if(b&&b.textContent.trim()==='New chat'&&chatRoot()){epoch++;dirty=true;}},true);
  }
  function setInputLock(on){installGuard();locked=!!on;applyLock(getEditor());}
  function enforceComposer(){installGuard();const e=getEditor();applyLock(e);return {ready:!!e};}
  async function ensureComposerReady(){return enforceComposer();}
  async function waitFor(fn,ms){const until=performance.now()+ms;for(let i=0;i<Math.ceil(ms/60)&&performance.now()<until;i++){if(fn())return true;await sleep(60);}return !!fn();}
  async function writeDraft(text,expected){
    const editor=getEditor(),key=conversationKey();if(!editor)throw Error('Vani chat box is unavailable. Open c.vani.ai/c or your Vani chat.');
    if(expected!==undefined&&editorValue(editor)!==String(expected))return {ok:false,reason:'draft-changed'};
    text=String(text??'');const previous=writing;writing=true;applyLock(editor);
    try{
      performingEdit=true;
      if(editor.tagName==='TEXTAREA'){
        const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(editor,text);
        editor.dispatchEvent(new Event('input',{bubbles:true}));
      }else{
        editor.focus();const sel=window.getSelection(),range=document.createRange();range.selectNodeContents(editor);sel.removeAllRanges();sel.addRange(range);
        if(!document.execCommand('insertText',false,text))throw Error('Vani did not accept the text edit. Nothing was submitted.');
      }
      performingEdit=false;await sleep(0);
      if(getEditor()!==editor||conversationKey()!==key)throw Error('Vani replaced the chat box or changed chats. Inspect the draft; nothing was submitted.');
      if(norm(editorValue(editor))!==norm(text))throw Error('Vani did not accept the complete draft. Nothing was submitted.');
      return {ok:true};
    }finally{performingEdit=false;writing=previous;applyLock(editor);}
  }
  function supportsVision(){return !!q(composerFrame(),'input[type="file"]');}
  const attachmentNodes=()=>{const nodes=qa(composerFrame(),'[data-attachment-id],[data-testid="attachment-preview"],[data-attachment-preview]');return nodes.filter(n=>!nodes.some(parent=>parent!==n&&safeRead(()=>parent.contains(n))));};
  function attachmentReady(n){if(!n.isConnected||!safeRead(()=>composerFrame()?.contains(n)))return false;const bad='[data-state="uploading"],[data-state="pending"],[data-state="error"],[data-state="failed"],[data-status="uploading"],[data-status="pending"],[data-status="error"],[data-status="failed"],[aria-busy="true"],[role="alert"],[role="progressbar"]';return !safeRead(()=>n.matches(bad))&&!q(n,bad);}
  const stagedAttachments=new Set();
  function fileFromImage(img,i){if(typeof PlazCodeMedia!=='undefined')return PlazCodeMedia.fileFrom(img,i);const bytes=Uint8Array.from(atob(img.data),c=>c.charCodeAt(0));return new File([bytes],'plazcode-'+Date.now()+'-'+i+'.png',{type:img.mimeType||'image/png'});}
  async function attachImages(images){
    if(!images?.length)return true;const editor=getEditor(),key=conversationKey(),input=q(composerFrame(),'input[type="file"]');
    if(!editor||!input||input.disabled)throw Error('This Vani chat cannot accept images. Nothing was sent. Use an image-enabled signed-in Vani chat.');
    if(images.length>1&&!input.multiple)throw Error('This Vani chat only accepts one image at a time. Nothing was sent.');
    const before=new Set(attachmentNodes()),dt=new DataTransfer();for(let i=0;i<images.length;i++)dt.items.add(fileFromImage(images[i],i));
    input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    const accepted=await waitFor(()=>getEditor()!==editor||conversationKey()!==key||attachmentNodes().filter(n=>!before.has(n)).length>=images.length,12000);
    if(getEditor()!==editor||conversationKey()!==key||!accepted)throw Error('Vani image upload was not confirmed. Nothing was sent; inspect pending attachments before retrying.');
    const added=attachmentNodes().filter(n=>!before.has(n));if(added.length!==images.length||new Set(added.map(n=>safeRead(()=>n.getAttribute('data-attachment-id'))||n)).size!==images.length||added.some(n=>!attachmentReady(n)))throw Error('Vani image upload is incomplete or failed. Nothing was sent.');
    added.forEach(n=>stagedAttachments.add(n));return true;
  }
  async function clearAttachments(){
    for(const node of stagedAttachments){if(!node.isConnected){stagedAttachments.delete(node);continue;}if(!safeRead(()=>composerFrame()?.contains(node)))return false;const remove=q(node,'button[aria-label="Remove attachment"],button[aria-label="Remove image"]');if(!actionable(remove))return false;remove.click();}
    return waitFor(()=>[...stagedAttachments].every(n=>!n.isConnected),2500);
  }
  function startupRequest(engine){return `I clicked Start Agent in my installed PlazCode extension to connect this Vani chat to my own ${engine==='local'?'local files':'Roblox Studio project'}. The extension reads JSON command blocks from your ordinary replies and returns actual tool results here. This is my connection request, not a system instruction, and it does not override your safety rules or grant extra permissions. Please request the available commands with one fenced json code block containing {"command":"list_commands"}. This only lists capabilities; wait for the result and my task before changing anything. If you cannot participate, explain briefly.`;}
  function startupFeedbackMessages(text){
    text=String(text);const limit=8000;if(text.length<=limit)return [{text}];const parts=[];
    for(let offset=0;offset<text.length;){let end=Math.min(offset+limit,text.length);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;parts.push(text.slice(offset,end));offset=end;}
    return parts.map((part,i)=>{const ack=`PlazCode startup part ${i+1}/${parts.length} received.`,last=i===parts.length-1;return {text:`⟦RS-SYS⟧ PlazCode startup context part ${i+1}/${parts.length}. This is a split command reference, not a project task. Keep all parts in order; do not call commands while receiving them.\n\nBEGIN CONTEXT PART\n${part}\nEND CONTEXT PART\n\n`+(last?'All startup context has arrived. Reply with exactly "PlazCode is ready." and wait for my task.':`More context follows. Reply with exactly "${ack}" and nothing else.`),...(last?{}:{ack})};});
  }
  function nativeFailure(item){return !!item&&(safeRead(()=>item.matches('[data-state="failed"],[data-state="error"],[data-status="failed"],[data-status="error"]'))||!!q(item,'[role="alert"],[data-state="failed"],[data-status="error"]'));}
  async function typeAndSend(text,images){
    if(inFlight)throw Error('A Vani send is already pending. It was not duplicated.');
    installGuard();inFlight=true;committed=false;failure='';let attempted=false,wrote=false,touched=false,rejected=false;
    const editor=getEditor(),key=conversationKey(),prior=editorValue(editor),oldWriting=writing;
    text=String(text??'');const oldUsers=new Set(allItems().filter(isUserItem).map(itemKey));
    const check=()=>{if(isStopped())throw Error('Stopped before Vani send.');if(!key||conversationKey()!==key||getEditor()!==editor)throw Error('Vani changed chats or replaced the chat box. Inspect the draft before retrying.');};
    const onInput=e=>{if(e.isTrusted&&!performingEdit&&e.target===editor)touched=true;};
    for(const name of ['beforeinput','input','paste'])document.addEventListener(name,onInput,true);
    try{
      check();if(isHardGenerating())throw Error('Vani is still replying. Nothing was submitted.');
      if(!text.trim())throw Error('Vani message is empty. Nothing was submitted.');
      if(text.length>16000)throw Error('Vani message is too large to send safely. Use smaller tool-result pages. Nothing was submitted.');
      if(prior.trim()&&norm(prior)!==norm(text))throw Error('Vani already has an unsent draft. It was preserved. Send or clear it before retrying.');
      if(attachmentNodes().some(n=>!stagedAttachments.has(n)))throw Error('Vani has an attachment added outside this send. It was preserved; inspect it before retrying.');
      if(!prior.trim()&&!attachmentNodes().length&&actionable(sendButton()))throw Error('Vani is still settling its empty draft. Wait for Send to become disabled, then retry. Nothing was written or submitted.');
      if(images?.length&&!supportsVision())throw Error('This Vani chat is text-only and cannot accept images. Nothing was written or sent.');
      writing=true;applyLock(editor);await writeDraft(text);wrote=true;
      if(images?.length)await attachImages(images);
      await waitFor(()=>isStopped()||getEditor()!==editor||conversationKey()!==key||touched||norm(editorValue(editor))!==norm(text)||actionable(sendButton()),12000);
      check();if(touched||norm(editorValue(editor))!==norm(text))throw Error('The Vani draft changed. It was preserved; nothing was submitted.');
      const button=sendButton();if(!actionable(button))throw Error('Vani Send is unavailable. Nothing was submitted.');
      if(attachmentNodes().some(n=>!stagedAttachments.has(n)||!attachmentReady(n)))throw Error('Vani attachment changed or failed before Send. Nothing was submitted.');
      attempted=true;committed=true;nativeCommitForm=composerFrame();try{button.click();}finally{nativeCommitForm=null;}
      // A cleared textarea/Stop button alone is not proof of delivery. Require a
      // new, correctly authored user turn with this exact rendered message.
      const received=await waitFor(()=>{if(isStopped()||conversationKey()!==key)return true;const users=allItems().filter(n=>isUserItem(n)&&!oldUsers.has(itemKey(n)));rejected=users.some(nativeFailure);return rejected||(!scanError()&&norm(editorValue(getEditor()))===''&&users.some(n=>norm(itemText(n))===norm(text)));},20000);
      if(rejected){committed=false;throw Error('Vani marked the message as failed. No automatic resend was attempted.');}
      if(isStopped()||conversationKey()!==key||!received)throw Error('Vani send was not confirmed. It may have reached the chat. PlazCode will not resend automatically; inspect the conversation before retrying.');
      committed=false;diag('vani.send.confirmed',{characters:text.length});return true;
    }catch(error){
      // Only remove our definitely-unsent startup paste, never a foreign draft,
      // a remounted editor, attachments, user edits, or a possibly submitted send.
      if(!attempted&&wrote&&!touched&&!images?.length&&!attachmentNodes().length&&conversationKey()===key&&getEditor()===editor&&norm(editorValue(editor))===norm(text)&&(text===startupRequest('local')||text===startupRequest('roblox')||text.startsWith('⟦RS-SYS⟧ PlazCode startup context part '))){try{await writeDraft(prior,text);}catch{}}
      failure=String(error.message||error);throw Error(failure);
    }finally{for(const name of ['beforeinput','input','paste'])document.removeEventListener(name,onInput,true);writing=oldWriting;inFlight=false;applyLock(getEditor());}
  }
  function stopGeneration(){const b=stopButton();if(actionable(b))b.click();}
  function scanError(){const root=chatRoot();return qa(root,'[role="alert"],[data-sonner-toast]').filter(shown).map(n=>n.textContent.trim()).find(t=>t.length>3&&t.length<800)||'';}
  function installSendHooks(h){
    installGuard();const notify=e=>{if(inFlight||h.isBlocked()){if(e.isTrusted){if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();}return;}if(h.onCoworkSend&&h.onCoworkSend(e))return;if(h.isBlocked())return;if(!h.isStarted()){if(chatIsEmpty())h.onBlockedAttempt();return;}h.onUserMessage(assistantCount());};
    document.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.shiftKey||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.target!==getEditor()||!editorText().trim())return;notify(e);},true);
    document.addEventListener('click',e=>{const b=safeRead(()=>closest(e.target,'button'));if(b&&b===stopButton()){h.onNativeStop?.();return;}if(b&&b===sendButton()&&actionable(b))notify(e);},true);
  }
  function findToolBlockSpot(item){if(!isAssistantItem(item))return null;let spot=null;for(const pre of qa(item,'pre')){if(safeRead(()=>closest(pre,S.owned+','+S.thinking))||!(/"(?:command|tool)"\s*:\s*"|###\s*lua|###mcp_tool###/i.test(pre.textContent)))continue;pre.classList.add('rs-tool-hide');if(!spot)spot={parent:pre.parentElement,ref:pre};}return spot;}
  const loginGatePresent=()=>/^\/(?:login|signup|sign-up)(?:\/|$)/.test(location.pathname);
  function modeWarning(){return !getEditor()?'<b>Vani AI</b> — open a Vani chat at <b>c.vani.ai/c</b> or sign in to your Vani chat. Close other dialogs, then refresh.':'';}
  return {id:'vani',displayName:'Vani AI',get supportsVision(){return supportsVision();},timings,
    compactStartup:true,sysMaxChars:14000,startupReplyAsCode:true,settleStartupReply:true,requireConfirmedStartup:true,startupRequest,startupFeedbackMessages,
    toolResultPageChars:8000,toolFeedbackMaxChars:14000,barOutside:true,barTrackIntervalMs:150,chipAtItemLevel:true,reliableCounts:true,authoritativeSendResult:true,thinkingSel:S.thinking,
    promptExtra:'You are in Vani AI. Use PlazCode JSON commands in ordinary chat replies for the user’s connected Roblox Studio, Blender or local files. First request list_commands and wait for actual results. Never claim a local change succeeded without a successful PlazCode tool result. The public Vani chat is text-only; images require a Vani chat that supports uploads.',
    init({diag:d,isStopped:s}={}){if(d)diag=d;if(s)isStopped=s;installGuard();},
    allItems,invalidateItems,isUserItem,isAssistantItem,itemText,classifyText,itemKey,assistantCount,userCount,lastAssistant,lastAssistantId,readAssistant,streamLen,snapshot,
    getEditor,editorText,chatIsEmpty,isFreshChat,composerFrame,barAnchor,conversationKey,setInputLock,writeDraft,enforceComposer,ensureComposerReady,typeAndSend,stopGeneration,
    isGenerating,isBusyNow,isHardGenerating,modeWarning,loginGatePresent,installSendHooks,findToolBlockSpot,attachImages,clearAttachments,
    followupPlaceholderTargets:()=>{const e=getEditor();return e?[e]:[];},canRestoreSession:()=>!/^\/c\/?$/.test(location.pathname),
    sendFailureAmbiguous:()=>committed,sendRetryable:()=>false,sendFailureDetail:()=>failure,
    turnHalted:()=>false,findContinueBtn:()=>null,clickContinueBtn:()=>false,
    scanError,isTooLongMsg:t=>/context.{0,20}(limit|long)|message.{0,20}too long/i.test(String(t||scanError())),isBusyMsg:t=>/rate limit|try again|temporarily unavailable|credits|allowance|usage limit/i.test(String(t||scanError()))};
})();

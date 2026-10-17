// SPDX-License-Identifier: GPL-3.0-or-later
// ClickUp Ask Brain and AI-agent DMs. Selectors inspected on the signed-in app.
// Never target ordinary DMs, task comments, document editors or the agent builder.
const RSProvider = (() => {
  "use strict";
  const S = {
    prompt: 'cu-refinement-prompt[data-test="refinement-prompt"]',
    editor: '.ql-editor[contenteditable]',
    thread: '[data-test="chat-thread-container"][data-brain-prompt-surface="true"]',
    item: '[data-test="chat-item-presentational__container"]',
    body: '[data-test="chat-item-content-area__message-body"]',
    content: '[data-test="quill-delta-to-html__comment"]',
    send: 'button[data-test="refinement-prompt-submit-button"]',
    stop: 'button[data-test="refinement-prompt-stop-button"]',
    thinking: '[data-is-thinking="true"], [data-test="content-assistant-thinking"]',
  };
  const timings = { GEN_IDLE_MS:1800, REASON_IDLE_MS:16000, WARMUP_MS:45000,
    REASON_NOREPLY_MS:120000, STABLE_MS:8000, RESPONSE_TIMEOUT_MS:360000 };
  let isStopped = () => false;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const safeRead = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
  const query = (root, selector) => root ? safeRead(() => root.querySelector(selector)) : null;
  const all = (root, selector) => root ? safeRead(() => Array.from(root.querySelectorAll(selector)), []) : [];
  const closest = (node, selector) => node ? safeRead(() => node.closest(selector)) : null;
  let diag = () => {}, locked = false, sendInFlight = false, committed = false;
  let failure = "", writeGeneration = 0;
  const originals = new WeakMap(), ids = new WeakMap(); let nextId = 0;
  const norm = value => String(value || "").replace(/\r\n?/g,"\n").replace(/[\u200b\ufeff]/g,"").replace(/\u00a0/g," ").trim();
  function visible(node) {
    if (!node || closest(node, '#rs-root,[hidden],[aria-hidden="true"]')) return false;
    return safeRead(() => {
      const r=node.getBoundingClientRect(), s=getComputedStyle(node);
      return r.width>0 && r.height>0 && s.display!=="none" && s.visibility!=="hidden" && s.opacity!=="0";
    }, false);
  }
  function mode() {
    if (location.hostname !== "app.clickup.com") return "";
    if (/^\/\d+\/ai\/brain\/?$/.test(location.pathname)) return "brain";
    if (/^\/\d+\/chat\/r\//.test(location.pathname)) {
      const headers=all(document,'[data-test="chat-room-header__title-container"]');
      if (headers.some(h=>visible(h) && query(h,'cu-chat-ai-avatar'))) return "agent";
    }
    return "";
  }
  function activeThread() {
    if (!mode()) return null;
    return all(document,S.thread).filter(node=>!closest(node,'#rs-root,[hidden],[aria-hidden="true"]') && safeRead(()=>getComputedStyle(node).display!=='none',false)).at(-1) || null;
  }
  function prompts() {
    if (!mode()) return [];
    return all(document,S.prompt).filter(p=>visible(p) && query(p,S.editor) &&
      !closest(p,'cu-ai-agent-builder-home,cu-ai-agent-builder'));
  }
  function getEditor() {
    // In agent DMs, the open thread composer follows the main room composer.
    // Always continue in that thread; never post tool results as new room threads.
    const p=prompts().at(-1); return query(p,S.editor);
  }
  const composerRoot = () => closest(getEditor(),S.prompt);
  // The custom element spans the whole chat column after the first send. The
  // rounded input wrapper stays composer-width, including in an agent thread.
  const composerFrame = () => closest(getEditor(),'.refinement-prompt-wrapper__form-input-wrapper') ||
    closest(getEditor(),'.refinement-prompt-wrapper') || composerRoot();
  const barAnchor = () => composerFrame();
  function rawItems() {
    const root=activeThread();return root?all(root,S.item).filter(item=>closest(item,S.thread)===root && role(item)):[];
  }
  function maskInjectedItems(items) {
    for(const item of items) {
      if(!isUserItem(item))continue;
      const text=itemText(item);
      if(text.includes('⟦RS-SYS⟧') || (typeof RSParse!=='undefined' && RSParse.isInjectedFeedback(text))) {
        item.setAttribute('data-rs-clickup-injected','1');item.classList.add('rs-hidden');
      }
    }
  }
  function setupStyles() {
    if(document.getElementById('rs-clickup-provider-style'))return;
    const style=document.createElement('style');style.id='rs-clickup-provider-style';style.textContent=`
      [data-test="chat-item-presentational__container"][data-rs-clickup-injected] > :not(.rs-chip){display:none!important}
      html.rs-clickup-injecting cu-refinement-prompt .ql-editor[contenteditable]{max-height:72px!important;overflow:hidden!important;color:transparent!important;caret-color:transparent!important;text-shadow:none!important}
      html:not([data-rs-bar-collapsed]) #rs-bar.rs-prov-clickup{display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:5px 8px!important;padding:8px 10px!important;min-width:0!important}
      #rs-bar.rs-prov-clickup[style*="display: none"]{display:none!important}
      #rs-bar.rs-prov-clickup .rs-cluster-left{grid-row:1;grid-column:1;min-width:0}
      #rs-bar.rs-prov-clickup #rs-ctx{grid-row:1;grid-column:2;justify-self:end;margin-right:34px}
      #rs-bar.rs-prov-clickup #rs-state{grid-row:2;grid-column:1 / -1;min-width:0;margin:0!important;width:auto!important}
      #rs-bar.rs-prov-clickup .rs-cluster-right{grid-row:3;grid-column:1 / -1;display:flex;position:static!important;justify-content:flex-end;flex-wrap:wrap;gap:4px;margin-left:var(--rs-clickup-tab-space,0px)!important;min-width:0}
      html:not([data-rs-bar-collapsed]) #rs-bar.rs-prov-clickup #rs-hide{position:absolute;top:8px;right:10px;margin:0!important}
      #rs-bar.rs-prov-clickup :is(#rs-status-pill,#rs-perf){display:none!important}
    `;
    document.documentElement.append(style);
  }
  function syncBarCutout() {
    const bar=query(document,'#rs-bar');if(!bar)return;
    const group=closest(composerRoot(),'.ai-agent-builder-input-container');
    const tabs=all(group,'[role="tab"]').filter(visible);
    if(!tabs.length || safeRead(()=>document.documentElement.hasAttribute('data-rs-bar-collapsed'),false)) {
      bar.style.clipPath='';bar.style.removeProperty('--rs-clickup-tab-space');return;
    }
    const r=safeRead(()=>bar.getBoundingClientRect()),rects=tabs.map(n=>safeRead(()=>n.getBoundingClientRect())).filter(Boolean);
    if(!r || !r.width || !rects.length)return;
    const left=Math.max(0,Math.min(...rects.map(t=>t.left))-r.left-4),right=Math.min(r.width,Math.max(...rects.map(t=>t.right))-r.left+4);
    const top=Math.max(0,Math.min(...rects.map(t=>t.top))-r.top-3);
    // Leave the native Ask/Agents area out of our painted AND clickable shape.
    // Its own DOM, listeners and stacking contexts remain untouched.
    bar.style.setProperty('--rs-clickup-tab-space',Math.max(0,right+4)+'px');
    bar.style.clipPath=top<r.height?`polygon(0 0,100% 0,100% 100%,${right}px 100%,${right}px ${top}px,${left}px ${top}px,${left}px 100%,0 100%)`:'';
  }
  function allItems() {
    const items=rawItems();maskInjectedItems(items);return items;
  }
  function role(item) {
    if (!item) return "";
    // Use the owning message's avatar, not names, response text or quotations.
    const avatar=query(item,'cu-chat-user-avatar');
    if (!avatar || closest(avatar,S.item)!==item) return "";
    if (query(avatar,'cu-chat-ai-avatar')) return "assistant";
    if (query(avatar,'cu-user-avatar')) return "user";
    return "";
  }
  const isUserItem = item => role(item)==="user";
  const isAssistantItem = item => role(item)==="assistant";
  function textWithout(root, extra="") {
    if (!root) return "";
    const skip='.rs-chip,.rs-cowork-receipt,.attachment-chip,button,input,cu-content-assistant-follow-up-questions'+(extra?','+extra:'');
    let text="";
    const walk=node=>{
      if (node.nodeType===3) {text+=node.nodeValue || "";return;}
      if (node.nodeType!==1 || safeRead(()=>node.matches(skip),false)) return;
      if (node.tagName==='BR') {text+='\n';return;}
      const block=/^(P|DIV|PRE|LI|UL|OL|BLOCKQUOTE|H[1-6]|TR|SECTION)$/.test(node.tagName);
      if (block && text && !text.endsWith('\n')) text+='\n';
      for (const child of Array.from(node.childNodes)) walk(child);
      if (block && text && !text.endsWith('\n')) text+='\n';
    };
    walk(root);return norm(text);
  }
  function itemText(item) {
    const body=query(item,S.body); return textWithout(query(body,S.content)||body,S.thinking);
  }
  function classifyText(item, exclude) {
    const body=query(item,S.body); return textWithout(query(body,S.content)||body,[S.thinking,exclude].filter(Boolean).join(','));
  }
  function itemKey(item) {
    if (!item) return null;
    const owner=closest(item.parentElement,'[data-id]');
    const id=owner && safeRead(()=>owner.getAttribute('data-id'), null);
    if (id) return role(item)+':'+id;
    if (!ids.has(item)) ids.set(item,++nextId);
    return role(item)+':dom:'+ids.get(item);
  }
  const assistantCount=()=>allItems().filter(isAssistantItem).length;
  const userCount=()=>allItems().filter(isUserItem).length;
  const lastAssistant=()=>allItems().filter(isAssistantItem).at(-1)||null;
  const lastAssistantId=()=>itemKey(lastAssistant());
  const streamLen=item=>itemText(item===undefined?lastAssistant():item).length;
  const readAssistant=()=>{const item=lastAssistant();return {present:!!item,item,reply:itemText(item),thinking:''};};
  const snapshot=()=>({th:0,rp:streamLen()});
  const editorText=()=>textWithout(getEditor());
  const chatIsEmpty=()=>allItems().length===0;
  const isFreshChat=()=>!!getEditor() && chatIsEmpty();
  function conversationKey() {
    const kind=mode();if (!kind) return '';
    const url=new URL(location.href), workspace=url.pathname.split('/')[1];
    if(kind==='brain') return 'clickup:'+workspace+':brain:'+(url.searchParams.get('conversationId')||'new');
    const room=url.pathname.match(/\/chat\/r\/([^/]+)/)?.[1]||'';
    const thread=url.pathname.match(/\/t\/([^/]+)/)?.[1]||safeRead(()=>activeThread()?.getAttribute('data-id'), null)||'new';
    return 'clickup:'+workspace+':agent:'+room+':'+thread;
  }
  function applyLock(editor, on) {
    if (!editor) return;
    if (on) {
      if (!originals.has(editor)) originals.set(editor,safeRead(()=>editor.getAttribute('contenteditable'), null));
      editor.setAttribute('data-rs-locked','1');editor.setAttribute('contenteditable','false');
    } else {
      const original=originals.get(editor);
      if (originals.has(editor)) {if(original===null)editor.removeAttribute('contenteditable');else editor.setAttribute('contenteditable',original);originals.delete(editor);}
      editor.removeAttribute('data-rs-locked');
    }
  }
  function setInputLock(on) {locked=!!on;applyLock(getEditor(),locked);}
  function exactControl(selector) {return all(composerRoot(),selector).find(visible)||null;}
  const sendButton=()=>exactControl(S.send);
  const stopButton=()=>exactControl(S.stop);
  function actionable(node) {
    if(!visible(node)||node.disabled||safeRead(()=>node.getAttribute('aria-disabled'), null)==='true')return false;
    if(typeof document.elementFromPoint!=='function')return true;
    const r=safeRead(()=>node.getBoundingClientRect(), null),x=Math.max(0,Math.min(innerWidth-1,r.left+r.width/2)),y=Math.max(0,Math.min(innerHeight-1,r.top+r.height/2));
    const hit=document.elementFromPoint(x,y);
    // PlazCode's own working cover intentionally overlays the locked composer.
    return !!hit && (safeRead(()=>node.contains(hit), false)||hit===node||!!closest(hit,'#rs-root,#rs-input-cover'));
  }
  const isHardGenerating=()=>!!stopButton();
  const isGenerating=()=>isHardGenerating();
  const isBusyNow=isGenerating;
  async function waitFor(predicate, timeout=10000) {
    const polls=Math.ceil(Math.min(Math.max(timeout,0),600000)/80),start=Date.now();
    for(let i=0;i<polls&&Date.now()-start<timeout;i++) {if(predicate())return true;await sleep(80);}
    return !!predicate();
  }
  function modeWarning() {
    if(mode() && getEditor())return '';
    if(/\/ai\/agents(?:\/|$)/.test(location.pathname))return 'ClickUp — open an existing agent’s Chat or direct message. PlazCode never starts or changes an agent from the creation form.';
    return 'ClickUp — open Ask Brain or an AI agent direct message. Human chats, Docs and task comments are not PlazCode chat surfaces.';
  }
  async function ensureComposerReady() {
    await waitFor(()=>!!getEditor(),5000);
    return {ready:!!getEditor(),detail:modeWarning()};
  }
  function enforceComposer() {setupStyles();maskInjectedItems(rawItems());syncBarCutout();if(locked)applyLock(getEditor(),true);return {ready:!!getEditor()};}
  async function writeDraft(text, expected) {
    const editor=getEditor(),key=conversationKey(),generation=++writeGeneration;
    if(!editor)throw Error('ClickUp AI chat box is not available. Open Ask Brain or an agent chat.');
    text=String(text??'');
    if(text.length>250000)throw Error('PlazCode safety bound exceeded: outgoing ClickUp draft is over 250,000 characters. Nothing was sent.');
    if(expected!==undefined && norm(editorText())!==norm(expected))return {ok:false,reason:'The draft changed; it was not overwritten.'};
    const before=editorText(),relock=locked;
    try {
      editor.setAttribute('contenteditable','true');editor.focus();
      const range=document.createRange();range.selectNodeContents(editor);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      let inserted=false;
      if(typeof document.execCommand==='function') inserted=document.execCommand('insertText',false,text);
      if(!inserted && norm(editorText())===norm(before) && typeof DataTransfer!=='undefined' && typeof ClipboardEvent!=='undefined') {
        const data=new DataTransfer();data.setData('text/plain',text);
        editor.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
      }
      const okay=await waitFor(()=>generation!==writeGeneration||conversationKey()!==key||norm(editorText())===norm(text),2500);
      if(!okay||generation!==writeGeneration||conversationKey()!==key||norm(editorText())!==norm(text))
        throw Error('ClickUp did not confirm the exact draft. Nothing was submitted; inspect the chat box before retrying.');
      return {ok:true};
    } finally {if(relock)applyLock(getEditor(),true);}
  }
  function fileFromImage(image,index) {
    if(typeof PlazCodeMedia!=='undefined')return PlazCodeMedia.fileFrom(image,index);
    const binary=atob(image.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    return new File([bytes],'plazcode-capture-'+index+'.'+(image.mimeType==='image/png'?'png':'jpg'),{type:image.mimeType||'image/jpeg'});
  }
  function attachmentNodes() {
    return all(composerRoot(),'[data-test="link-preview-element__root"].attachment-chip')
      .filter(node=>visible(node) && query(node,'a[href]'));
  }
  async function attachImages(images) {
    if(!images?.length)return true;
    const frame=composerRoot(),input=query(frame,'input[type="file"]');
    if(!input)throw Error('ClickUp image upload control was not found. The screenshot message was not submitted.');
    const key=conversationKey(),before=new Set(attachmentNodes()),transfer=new DataTransfer();
    images.forEach((image,index)=>transfer.items.add(fileFromImage(image,index)));
    input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    const ready=await waitFor(()=>conversationKey()!==key||attachmentNodes().filter(node=>!before.has(node)).length>=images.length,15000);
    if(!ready||conversationKey()!==key)throw Error('ClickUp did not confirm the screenshot attachment. The message was not submitted.');
    return true;
  }
  async function clearAttachments() {
    if(!attachmentNodes().length)return true;
    // ClickUp stores uploads as Quill attachment embeds. Replace the editor with
    // its exact plain-text draft through Quill's native input path; never click
    // arbitrary Remove/Delete actions or change the sent conversation history.
    try {await writeDraft(editorText());return await waitFor(()=>!attachmentNodes().length,2500);}
    catch {return false;}
  }
  function renderedReceipt(text) {
    return norm(text).replace(/```[^\n]*\n/g,'').replace(/```/g,'')
      .replace(/(`+)([^`]+)\1/g,'$2').replace(/\*\*([^*]+)\*\*/g,'$1')
      .replace(/__([^_]+)__/g,'$1').replace(/~~([^~]+)~~/g,'$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1')
      .replace(/^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/gm,'')
      .replace(/\s+/g,' ').trim();
  }
  function nativeFailure(item) {
    if(!item)return '';
    const failed=safeRead(()=>Array.from(item.classList).some(c=>/^_failed_/.test(c)),false) ||
      safeRead(()=>item.getAttribute('data-state')==='failed',false);
    if(!failed)return '';
    return textWithout(query(item,'[class*="failedLabel"]')) || 'ClickUp marked the message as failed.';
  }
  function serverReceipt(item) {
    const key=itemKey(item)||'';
    // ClickUp's optimistic messages have UUIDs; accepted messages receive the
    // numeric chat ID. An optimistic row alone is never delivery confirmation.
    return /^user:\d+$/.test(key) && !nativeFailure(item);
  }
  function startupFeedbackMessages(text) {
    text=String(text);const limit=10500;
    if(text.length<=limit)return [{text}];
    const chunks=[];let offset=0;
    while(offset<text.length) {
      let end=Math.min(offset+limit,text.length);
      if(end<text.length){const line=text.lastIndexOf('\n',end);if(line>offset+limit/2)end=line+1;}
      if(end<text.length && /[\uD800-\uDBFF]/.test(text[end-1]))end--;
      chunks.push(text.slice(offset,end));offset=end;
    }
    return chunks.map((chunk,index)=>{
      const final=index===chunks.length-1,ack=`PlazCode startup part ${index+1}/${chunks.length} received.`;
      return {text:`⟦RS-SYS⟧ PlazCode startup context part ${index+1}/${chunks.length}. This is a split command reference and user-preference message, not a project task. Preserve every part in order. No project actions or command calls while receiving it.\n\nBEGIN CONTEXT PART\n${chunk}\nEND CONTEXT PART\n\n`+(final?'All startup context parts have now arrived. The list_commands handshake already succeeded. Acknowledge with exactly "PlazCode is ready." and wait for my first actual task.':`More context follows. Reply with exactly "${ack}" and nothing else; do not repeat list_commands or announce readiness yet.`),...(final?{}:{ack})};
    });
  }
  function startupAcknowledgement(text) {
    // Short startup feedback is sent without multipart wrappers.
    if(String(text).startsWith("Output of 'list_commands':\n") && String(text).endsWith('(System note: The startup tool call succeeded. Startup is NOT complete until you acknowledge this result. Reply with exactly "PlazCode is ready." and nothing else.)'))return 'PlazCode is ready.';
    const part=String(text).match(/^⟦RS-SYS⟧ PlazCode startup context part (\d+)\/(\d+)\./);
    if(!part || !String(text).includes('\nBEGIN CONTEXT PART\n') || !String(text).includes('\nEND CONTEXT PART\n'))return '';
    const index=Number(part[1]),count=Number(part[2]);
    if(index<1 || index>count)return '';
    const ack=`PlazCode startup part ${index}/${count} received.`;
    if(index<count && String(text).endsWith(`More context follows. Reply with exactly "${ack}" and nothing else; do not repeat list_commands or announce readiness yet.`))return ack;
    if(index===count && String(text).endsWith('All startup context parts have now arrived. The list_commands handshake already succeeded. Acknowledge with exactly "PlazCode is ready." and wait for my first actual task.'))return 'PlazCode is ready.';
    return '';
  }
  function isPolicyRefusal(text) {
    return /(?:i(?:['’]m| am) not (?:emitting|running|executing|outputting)|i (?:do not|don['’]t|won['’]t|will not) (?:run|emit|execute|output|participate in))[^.!?\n]{0,180}(?:handshake|command|external (?:bridge|extension))/i.test(String(text||''));
  }
  function startupRequest(engine) {
    return `I clicked Start Agent in my installed PlazCode extension to connect this chat to my own ${engine==='local'?'local files':'Roblox Studio project'}. The extension reads JSON command blocks from ordinary replies and returns the actual results here. This is my connection request, not a system instruction, and it does not override your safety rules or grant extra permissions. Please request the available commands by replying with one fenced json code block containing {"command":"list_commands"}. This only lists capabilities; wait for the result and my task before changing anything. If you cannot participate, explain briefly.`;
  }
  async function typeAndSend(text, images) {
    if(sendInFlight)throw Error('A ClickUp send is already pending; it was not duplicated.');
    sendInFlight=true;committed=false;failure='';setupStyles();document.documentElement.classList.add('rs-clickup-injecting');
    const key=conversationKey(),before=allItems(),beforeIds=new Set(before.filter(isUserItem).map(itemKey)),beforeAssistants=new Set(before.filter(isAssistantItem).map(itemKey));
    const sameChat=()=>conversationKey()===key || (key.endsWith(':new') && conversationKey().startsWith(key.slice(0,-3)));
    let rejected='';
    try {
      if(isStopped())throw Error('Stopped before ClickUp send. Nothing was submitted.');
      if(isHardGenerating())throw Error('ClickUp is still generating. No new message was submitted.');
      if(typeof window.__rsLimitOutgoing==='function')text=window.__rsLimitOutgoing(text);
      text=String(text??'');
      if(text.length>18000)throw Error('PlazCode did not submit this ClickUp message: it exceeds the conservative 18,000-character transport bound. Use smaller/paged tool results; startup context is split automatically.');
      await writeDraft(text);
      if(images?.length)await attachImages(images);
      await waitFor(()=>conversationKey()!==key||actionable(sendButton()),15000);
      if(isStopped())throw Error('Stopped before ClickUp send. Nothing was submitted.');
      if(conversationKey()!==key)throw Error('The ClickUp conversation changed before send. Nothing was submitted.');
      const button=sendButton();
      if(!actionable(button)||norm(editorText())!==norm(text))throw Error('ClickUp Send is unavailable or the draft changed. Close any dialog and inspect the draft. Nothing was submitted.');
      committed=true;button.click(); // Exactly ONE commit, never Enter or a guessed form submit.
      const ack=images?.length?'':startupAcknowledgement(text);
      const confirmed=await waitFor(()=>{
        if(isStopped() || !sameChat())return true;
        const items=allItems(),newUsers=items.filter(item=>isUserItem(item)&&!beforeIds.has(itemKey(item)));
        rejected=newUsers.map(nativeFailure).find(Boolean)||'';
        return !!rejected || newUsers.some(item=>serverReceipt(item) && (
          renderedReceipt(itemText(item))===renderedReceipt(text) ||
          // Rich-text rendering can change a long context part beyond Markdown
          // normalization. Its exact, NEW assistant acknowledgement after a
          // persisted user row confirms this part without another Send click.
          (ack && items.slice(items.indexOf(item)+1).some(reply=>isAssistantItem(reply) &&
            !beforeAssistants.has(itemKey(reply)) && norm(itemText(reply))===ack))
        ));
      // A slow model can acknowledge the part after the normal send-receipt
      // window. Keep observing the same single commit for the response budget;
      // Stop and conversation changes still interrupt it immediately.
      },ack ? timings.RESPONSE_TIMEOUT_MS : 20000);
      if(isStopped() || !sameChat())throw Error('ClickUp delivery was interrupted by Stop or a conversation change. It may have reached the original chat; no automatic resend was attempted.');
      if(rejected){committed=false;throw Error('ClickUp rejected the message: '+rejected+' No automatic resend was attempted.');}
      if(!confirmed)throw Error('ClickUp send was not confirmed. It may have reached the chat; PlazCode will not resend it automatically. Inspect the conversation before retrying.');
      committed=false;
      diag('clickup.send.confirmed',{mode:mode(),characters:text.length});return true;
    } catch(error) {failure=String(error.message||error);throw error;}
    finally {sendInFlight=false;document.documentElement.classList.remove('rs-clickup-injecting');if(locked)applyLock(getEditor(),true);}
  }
  function stopGeneration() {const button=stopButton();if(actionable(button))button.click();}
  function scanError() {
    const frame=composerFrame(),thread=activeThread();
    for(const root of [frame,thread])for(const node of all(root,'[role="alert"], [data-test="content-assistant-error"]'))
      if(visible(node)){const text=textWithout(node);if(text.length>3&&text.length<800)return text;}
    return '';
  }
  function installSendHooks(handlers) {
    const notify=event=>{
      if(sendInFlight)return;
      const editor=getEditor();if(!editor)return;
      if(handlers.onCoworkSend&&handlers.onCoworkSend(event))return;
      if(handlers.isBlocked())return;
      if(!handlers.isStarted()){if(chatIsEmpty())handlers.onBlockedAttempt();return;}
      handlers.onUserMessage(assistantCount());
    };
    document.addEventListener('keydown',event=>{
      if(event.key!=='Enter'||event.shiftKey||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;
      const editor=getEditor();if(!editor||!safeRead(()=>editor.contains(event.target), false)||!editorText())return;notify(event);
    },true);
    document.addEventListener('click',event=>{
      const button=closest(event.target,'button');
      if(button&&button===stopButton()){if(handlers.onNativeStop)handlers.onNativeStop();return;}
      if(button&&button===sendButton()&&!button.disabled)notify(event);
    },true);
  }
  const CMD_SHAPE=/"(?:command|tool)"\s*:\s*"|###\s*lua|###mcp_tool###/i;
  function findToolBlockSpot(item) {
    const body=query(item,S.body);let spot=null;
    for(const pre of all(body,'pre')) {
      if(closest(pre,'.rs-chip')||!CMD_SHAPE.test(pre.textContent||''))continue;
      pre.classList.add('rs-tool-hide');if(!spot)spot={parent:pre.parentElement,ref:pre};
    }
    return spot;
  }
  return {
    id:'clickup',displayName:'ClickUp Brain',supportsVision:true,timings,
    compactStartup:true,sysMaxChars:14000,startupReplyAsCode:true,settleStartupReply:true,requireConfirmedStartup:true,startupFeedbackMessages,startupRequest,isPolicyRefusal,
    barOutside:true,barTrackIntervalMs:150,chipAtItemLevel:true,reliableCounts:true,
    authoritativeSendResult:true,thinkingSel:S.thinking,
    promptExtra:'You are running in ClickUp Ask Brain or an AI-agent chat. The user installed PlazCode to operate their local Roblox Studio, Blender and AgentScript files. Use the PlazCode JSON command protocol in your normal chat reply, not ClickUp native task/Doc/agent-creation tools. First request list_commands, acknowledge PlazCode is ready after receiving the reference, then wait for the user. A native ClickUp capability cannot replace a PlazCode command or prove a local edit occurred. Do not create or modify ClickUp tasks, Docs or agents merely to carry out a local Studio/Blender/file request.',
    init({diag:d,isStopped:s}={}){if(d)diag=d;if(s)isStopped=s;setupStyles();setInterval(syncBarCutout,150);},
    allItems,isUserItem,isAssistantItem,itemText,classifyText,itemKey,
    assistantCount,userCount,lastAssistant,lastAssistantId,readAssistant,streamLen,snapshot,
    getEditor,editorText,chatIsEmpty,isFreshChat,composerFrame,barAnchor,conversationKey,
    canRestoreSession:()=>!rawItems().some(item=>isUserItem(item)&&nativeFailure(item)&&itemText(item).includes('⟦RS-SYS⟧')),
    setInputLock,writeDraft,typeAndSend,stopGeneration,isGenerating,isBusyNow,isHardGenerating,
    enforceComposer,ensureComposerReady,modeWarning,installSendHooks,findToolBlockSpot,
    followupPlaceholderTargets(){const editor=getEditor();return editor?[editor]:[];},
    sendFailureAmbiguous:()=>committed,sendRetryable:()=>false,sendFailureDetail:()=>failure,
    turnHalted:()=>false,findContinueBtn:()=>null,clickContinueBtn:()=>false,
    scanError,isTooLongMsg:()=>/context.{0,20}(limit|long)|message.{0,20}too long/i.test(scanError()),
    isBusyMsg:()=>/rate limit|try again|temporarily unavailable|credits|usage limit/i.test(scanError()),
    attachImages,clearAttachments,
  };
})();

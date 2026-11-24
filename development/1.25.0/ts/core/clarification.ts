// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.25.0/ts/core/clarification.ts (TypeScript): edit that file, then run node development/1.25.0/ts/build.cjs.
const PlazCodeClarification = (() => {
  type Option = { id: string; label: string; scope: string };
  type NormalizedInput = { question: string; options: Option[]; recommended_id: string; recommendation: string; questions: string[] };
  type CreateOptions = {
    document: Document;
    context: () => string;
    provider: () => string;
    mount: () => Element | null | undefined;
    cancelled?: () => boolean;
    onCancel?: () => void;
    changed?: (waiting: boolean) => void;
  };
  type PendingClarification = {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    host: HTMLElement;
    focus: Element | null;
    timer: ReturnType<typeof setInterval>;
  };
  const INSTRUCTION = '\nBEFORE ACTING: Assess the request, existing project and constraints first. For a clear task, proceed with targeted work. If materially unclear choices would change the scope, call plazcode_clarify BEFORE changing anything. Provide 2–3 distinct options with labels and scope, recommend one with a reason, and ask 1–3 necessary questions. This opens a user panel and waits for their answer. Do not pick an option yourself, send reminders, repeat the question, or run other actions while waiting. Continue only from the returned answer. Do not ask for hidden reasoning; give concise practical scope and tradeoffs.\n';
  const DESCRIPTION = 'plazcode_clarify {question:string, options:[{id:string,label:string,scope:string}] (2–3), recommended_id:string, recommendation:string, questions:[string] (1–3)} — clarify materially unclear work before acting; waits indefinitely without reminders for an explicit answer.';
  // Models often guess near-miss field names (recommend/reason, title/description,
  // a single question string). Map the unambiguous aliases onto the schema so a
  // valid intent is not rejected, and name the exact fields when it still fails.
  function normalize(input: unknown): any {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    const value: Record<string, any> = { ...(input as Record<string, unknown>) }, pick = (...keys: string[]) => { for (const key of keys) if (value[key] !== undefined && value[key] !== null && value[key] !== '') return value[key]; return undefined; };
    if (value.question === undefined) value.question = pick('prompt', 'title', 'ask');
    if (Array.isArray(value.options)) value.options = value.options.map((option: any, index: number) => {
      if (typeof option === 'string') return { id: 'option_' + (index + 1), label: option.slice(0, 120), scope: option };
      if (!option || typeof option !== 'object') return option;
      const out: Record<string, any> = { ...option };
      if (out.id === undefined || out.id === null || out.id === '') out.id = out.value ?? out.key ?? ('option_' + (index + 1));
      if (typeof out.id === 'number') out.id = String(out.id);
      if (!out.label) out.label = out.title ?? out.name ?? out.text;
      if (!out.scope) out.scope = out.description ?? out.details ?? out.summary ?? out.label;
      return out;
    });
    let rec = pick('recommended_id', 'recommended', 'recommend', 'recommendation_id', 'recommended_option', 'recommended_option_id', 'default');
    if (rec && typeof rec === 'object') rec = rec.id ?? rec.value;
    if (typeof rec === 'number') rec = String(rec);
    if (typeof rec === 'string' && Array.isArray(value.options) && !value.options.some((option: any) => option && option.id === rec)) {
      const match = value.options.find((option: any) => option && typeof option.label === 'string' && option.label.trim().toLowerCase() === rec.trim().toLowerCase());
      if (match) rec = match.id;
    }
    value.recommended_id = rec;
    const why = value.recommendation !== undefined && !(value.recommendation === value.recommended_id && pick('reason', 'why', 'rationale', 'explanation', 'recommendation_reason')) ? value.recommendation : pick('reason', 'why', 'rationale', 'explanation', 'recommendation_reason');
    value.recommendation = why;
    if (value.questions === undefined) value.questions = pick('clarifying_questions', 'question_list');
    if (typeof value.questions === 'string') value.questions = [value.questions];
    if (value.questions === undefined && typeof value.question === 'string') value.questions = [value.question];
    return value;
  }
  function validate(input: unknown): NormalizedInput {
    const value = normalize(input);
    const string = (text: unknown, max: number): text is string => typeof text === 'string' && !!text.trim() && text.length <= max;
    if (!value || !string(value.question, 1200) || !Array.isArray(value.options) || value.options.length < 2 || value.options.length > 3) throw Error('Provide a question and 2–3 options.');
    if (value.options.some((option: any) => !option || !string(option.id, 60) || !string(option.label, 120) || !string(option.scope, 1800))) throw Error('Each option needs id, label and scope strings.');
    if (new Set(value.options.map((option: Option) => option.id)).size !== value.options.length) throw Error('Option ids must be distinct.');
    if (!value.options.some((option: Option) => option.id === value.recommended_id) || !string(value.recommendation, 1200)) throw Error('Set recommended_id to one of the option ids (' + value.options.map((option: Option) => option.id).join(', ') + ') and recommendation to a short reason.');
    if (!Array.isArray(value.questions) || value.questions.length < 1 || value.questions.length > 3 || value.questions.some((question: unknown) => !string(question, 500))) throw Error('Ask 1–3 necessary clarifying questions.');
    return value;
  }
  function create({ document, context, provider, mount, cancelled = () => false, onCancel = () => {}, changed = () => {} }: CreateOptions) {
    let pending: PendingClarification | null = null;
    function finish(answer: unknown, error?: unknown) {
      if (!pending) return;
      const current = pending; pending = null;
      try {
        try { clearInterval(current.timer); } catch {}
        try { current.host.remove(); } catch {}
        try { if (current.focus && current.focus.isConnected) (current.focus as HTMLElement).focus(); } catch {}
        try { changed(false); } catch {}
      } finally {
        if (error) current.reject(error); else current.resolve(answer);
      }
    }
    function cancel(reason = 'Clarification cancelled. No option was selected.') {
      const error = new Error(reason); error.name = 'AbortError'; finish(null, error);
    }
    function request(input: unknown) {
      const args = validate(input);
      if (pending) throw Error('A clarification is already waiting for an answer.');
      const key = context(), host = document.createElement('div');host.id = 'rs-clarification-host';
      try{const css=(document.defaultView as Window).getComputedStyle(document.getElementById('rs-root') as Element);for(const key of ['--rs-text','--rs-muted','--rs-bg','--rs-accent','--pc-bg','--pc-accent']){const value=css.getPropertyValue(key);if(value)host.style.setProperty(key,value);}}catch{}
      const shadow=host.attachShadow({mode:'closed'});
      const style = document.createElement('style');
      style.textContent = ':host{position:fixed;inset:0;z-index:2147483647;color:var(--rs-text,#edf2fa);font:14px/1.5 system-ui,sans-serif}*{box-sizing:border-box}.shade{position:absolute;inset:0;background:#0009;display:grid;place-items:center;padding:20px}.panel{width:min(660px,100%);max-height:calc(100dvh - 40px);overflow:auto;scroll-padding-bottom:96px;background:var(--pc-bg,var(--rs-bg,#111a26));border:1px solid var(--pc-accent,var(--rs-accent,#ffa83d));border-radius:20px;padding:24px;box-shadow:0 20px 70px #0008;animation:appear .18s ease-out}h2{margin:0 0 8px;font-size:21px;outline:none}p{margin:0 0 16px;overflow-wrap:anywhere}.muted{color:var(--rs-muted,#aab6c6)}.options,.questions{display:grid;gap:12px;margin:18px 0}label{display:grid;gap:7px}.option{grid-template-columns:20px 1fr;border:1px solid #8090a044;border-radius:12px;padding:14px;cursor:pointer;background:#ffffff05}.option:has(input:checked){border-color:var(--pc-accent,var(--rs-accent,#ffa83d));background:#ffa83d14}input[type=radio]{accent-color:var(--pc-accent,var(--rs-accent,#ffa83d));margin:5px 0}strong{display:block}small{display:block;white-space:pre-wrap;overflow-wrap:anywhere}.badge{color:var(--pc-accent,var(--rs-accent,#ffa83d));font-size:12px}textarea{width:100%;min-height:74px;resize:vertical;color:inherit;background:#0003;border:1px solid #8090a066;border-radius:10px;padding:11px;font:inherit}textarea:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid var(--pc-accent,var(--rs-accent,#ffa83d));outline-offset:3px}textarea,label.option{scroll-margin-bottom:96px}.actions{display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;margin-top:20px;position:sticky;bottom:0;padding:14px 0 0;background:var(--pc-bg,var(--rs-bg,#111a26));border-top:1px solid #8090a044}button{border:1px solid #8090a066;border-radius:10px;padding:10px 16px;font:inherit;color:inherit;background:#ffffff08;cursor:pointer}button[type=submit]{background:var(--pc-accent,var(--rs-accent,#ffa83d));color:#111822;font-weight:650}button:disabled{opacity:.45;cursor:default}@keyframes appear{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.panel{animation:none}}@media(max-width:420px){.shade{padding:12px}.panel{padding:18px;max-height:calc(100dvh - 24px)}.actions button{flex:1}}';
      shadow.append(style);
      const shade = document.createElement('div');shade.className = 'shade';shadow.append(shade);
      const form = document.createElement('form');form.className = 'panel';form.setAttribute('role','dialog');form.setAttribute('aria-modal','true');form.setAttribute('aria-label', provider() + ' is asking you…');shade.append(form);
      const add = <K extends keyof HTMLElementTagNameMap>(tag: K, text: string, parent: ParentNode = form, className = ''): HTMLElementTagNameMap[K] => {const node = document.createElement(tag);node.textContent = text;node.className = className;parent.append(node);return node;};
      const heading = add('h2', provider() + ' is asking you…');heading.tabIndex = -1;
      add('p',args.question);add('p','Waiting for a response. Nothing will run until an answer is submitted.',form,'muted');
      const options = add('div','',form,'options');
      for (const option of args.options) {
        const label = add('label','',options,'option'),radio = document.createElement('input');radio.type='radio';radio.name='choice';radio.value=option.id;label.append(radio);
        const body = add('span','',label);add('strong',option.label,body);
        if (option.id === args.recommended_id) add('span','Recommended',body,'badge');
        add('small',option.scope,body);
      }
      add('p','Recommendation: '+args.recommendation);
      const questions = add('div','',form,'questions');
      const answers = args.questions.map(question => {const label=add('label','',questions);add('span',question,label);const input=document.createElement('textarea');input.maxLength=6000;label.append(input);return input;});
      const extraLabel=add('label','');add('span','Other: your own answer or a different approach',extraLabel);
      const extra=document.createElement('textarea');extra.maxLength=10000;extraLabel.append(extra);
      const actions=add('div','',form,'actions'),stop=add('button','Cancel task',actions),submit=add('button','Submit answer',actions);stop.type='button';submit.type='submit';submit.disabled=true;
      const guard=<E extends Event>(handler:(event:E)=>unknown)=>(event:E)=>{try{return handler(event);}catch(error){finish(null,error);return undefined;}};
      // Owner (2026-11-18): an "Other" answer in your own words could not be submitted, because every question box was required too.
      // Any one of these is now an answer: a picked option, your own answer, or an answered question. Empty questions are left out.
      const valid=()=>!!(form.querySelector('input:checked') || extra.value.trim() || answers.some(input=>input.value.trim()));
      form.addEventListener('input',guard(()=>{submit.disabled=!valid();}));form.addEventListener('change',guard(()=>{submit.disabled=!valid();}));
      stop.addEventListener('click',guard(()=>{cancel();onCancel();}));
      form.addEventListener('submit',guard((event:Event)=>{event.preventDefault();if(!valid() || context()!==key){if(context()!==key)cancel('Chat or engine changed. Clarification cancelled.');return;}
        const selected=form.querySelector('input:checked') as HTMLInputElement | null;
        finish({selected_option:selected ? args.options.find(option=>option.id===selected.value) : null,answers:args.questions.map((question,index)=>({question,answer:answers[index].value})),additional_details:extra.value});
      }));
      for(const type of ['beforeinput','input','change','paste','keyup','keypress'])shadow.addEventListener(type,guard(event=>event.stopPropagation()));
      form.addEventListener('keydown',guard((event:KeyboardEvent)=>{event.stopPropagation();if(event.key!=='Tab')return;const controls=[heading,...Array.from(form.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLButtonElement>('input,textarea,button'))].filter((node)=>!(node as HTMLButtonElement).disabled);const current=form.ownerDocument===document?shadow.activeElement:form.ownerDocument.activeElement;if(event.shiftKey&&current===controls[0]){event.preventDefault();(controls.at(-1) as HTMLElement).focus();}else if(!event.shiftKey&&current===controls.at(-1)){event.preventDefault();(controls[0] as HTMLElement).focus();}}));
      return new Promise((resolve,reject)=>{
        pending={resolve,reject,host,focus:document.activeElement,timer:setInterval(()=>{try{if(!host.isConnected || context()!==key || cancelled())cancel('Task stopped, answer panel removed, or chat/engine changed. Clarification cancelled.');}catch(error){finish(null,error);}},500)};
        try {
        // 1.24.13: mount at the root stacking context. A page that turns <body>
        // into its own stacking context (Notion) flattened a body child below
        // PlazCode's <html>-level "Agent is working" cover and Tasks button.
        (mount()||document.documentElement).append(host);changed(true);
        // Site capture handlers see a closed-shadow host as a non-editable div.
        // A script-free frame isolates native answers from page keyboard locks.
        const frame=document.createElement('iframe');frame.title='PlazCode clarification';frame.setAttribute('sandbox','allow-same-origin allow-forms');frame.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent';
        frame.addEventListener('load',()=>{
          if(!pending||pending.host!==host)return;
          try{const pane=frame.contentDocument as Document,sheet=style.cloneNode(true) as HTMLStyleElement;sheet.textContent=(sheet.textContent as string).replace(':host{','html{')+'body{margin:0}';pane.head.append(sheet);for(const key of ['--rs-text','--rs-muted','--rs-bg','--rs-accent','--pc-bg','--pc-accent']){const value=host.style.getPropertyValue(key);if(value)pane.documentElement.style.setProperty(key,value);}pane.body.append(shade);heading.focus();}catch{try{frame.remove();heading.focus();}catch(error){finish(null,error);}}
        },{once:true});shadow.append(frame);heading.focus();
        } catch(error) { finish(null,error); }
      });
    }
    return {request,cancel,isWaiting:()=>!!pending};
  }
  return {create,validate,normalize,INSTRUCTION,DESCRIPTION};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PlazCodeClarification;

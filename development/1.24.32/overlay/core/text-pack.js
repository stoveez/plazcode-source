// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// core/text-pack.js - PlazCode's instruction text kept inside the desktop app (1.24.32).
//
// Owner, 2026-10-31: make PlazCode harder to copy without breaking startup or updates. When a release is
// packaged, the long prompt texts and the Studio Skills Luau library are moved out of the extension's
// JavaScript into a sealed file that only the PlazCode app opens, and only for the official, paired
// extension. The code calls PlazCodeText.t("<id>") / PlazCodeText.f("<id>", values) where the text used
// to be. In the development source nothing is moved, REQUIRED stays false and this file does nothing.
// eslint-disable-next-line no-unused-vars
globalThis.PlazCodeText = (() => {
  const REQUIRED = false; // packaging sets this to true when it moves text into the app
  const MESSAGE = "PlazCode could not load its instructions from the PlazCode app. Open the PlazCode app (update the app and the extension together), then refresh this AI tab.";
  const REQUEST_TIMEOUT_MS = 20000, RETRY_DELAY_MS = 500;
  let pack = null, pending = null, failure = "", failureKind = "";
  function title() { return failureKind === "unsupported" || failureKind === "stale-extension" ? "Reload the PlazCode extension" : "PlazCode connection not ready"; }
  function requestPack() {
    return new Promise(resolve => {
      let settled=false;
      const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result);};
      const timer=setTimeout(()=>finish({ok:false,kind:"disconnected",error:"The PlazCode extension did not answer its instruction request in time."}),REQUEST_TIMEOUT_MS);
      try {
        chrome.runtime.sendMessage({type:"textPack"},reply=>{
          const runtimeError=chrome.runtime.lastError?.message;
          if(runtimeError){finish({ok:false,kind:/context invalidated|receiving end does not exist/i.test(runtimeError)?"stale-extension":"disconnected",error:runtimeError});return;}
          if(reply?.ok && reply.pack && typeof reply.pack==="object" && !Array.isArray(reply.pack)){finish({ok:true,pack:reply.pack});return;}
          if(reply?.kind==="unknown-message" || /^unknown message$/i.test(String(reply?.error||""))){
            finish({ok:false,kind:"unsupported",error:"The running PlazCode extension worker does not recognize its instruction request. Reload PlazCode in your browser's Extensions page, then refresh this AI tab. If it continues, load the extension from the same complete PlazCode download as the app."});return;
          }
          finish({ok:false,kind:reply?.kind||"disconnected",error:String(reply?.error||MESSAGE)});
        });
      } catch(error) { finish({ok:false,kind:"stale-extension",error:String(error?.message||error)}); }
    });
  }
  async function load() {
    for(let attempt=0;attempt<2;attempt++){
      const reply=await requestPack();
      if(reply.ok){pack=reply.pack;failure="";failureKind="";return true;}
      failure=reply.error||MESSAGE;failureKind=reply.kind||"disconnected";
      if(["unsupported","stale-extension","integrity"].includes(failureKind)||attempt===1)return false;
      await new Promise(resolve=>setTimeout(resolve,RETRY_DELAY_MS));
    }
    return false;
  }
  function ready() {
    if (!REQUIRED || pack) return Promise.resolve(true);
    if (pending) return pending;
    const operation=load();pending=operation;
    operation.finally(()=>{if(pending===operation)pending=null;});
    return operation;
  }
  function missing(key) {
    return new Error((failure || MESSAGE) + " (missing " + key + ")");
  }
  // A moved plain string.
  function t(key) {
    if (pack && typeof pack[key] === "string") return pack[key];
    throw missing(key);
  }
  // A moved template string: the fixed parts come from the app, the values are filled in here exactly as
  // the original `...${value}...` did.
  function f(key, values) {
    const parts = pack && pack[key];
    if (!Array.isArray(parts) || parts.length !== values.length + 1) throw missing(key);
    let out = parts[0];
    for (let i = 0; i < values.length; i++) out += `${values[i]}` + parts[i + 1];
    return out;
  }
  if (REQUIRED) ready();
  return Object.freeze({ required: REQUIRED, ready, t, f, title, loaded: () => !REQUIRED || !!pack, error: () => failure || MESSAGE });
})();

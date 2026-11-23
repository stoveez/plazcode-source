// Actual guarded provider and browser-native textarea normalization. Offline only.
const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium,firefox}=require('playwright');
(async()=>{
 let failures=0;
 for(const [name,engine]of Object.entries({chromium,firefox})){
  if(process.env.PLAZCODE_TEST_BROWSER&&process.env.PLAZCODE_TEST_BROWSER!==name)continue;
  const browser=await engine.launch({headless:true,...(name==='chromium'&&process.env.PLAZCODE_CHROMIUM?{executablePath:process.env.PLAZCODE_CHROMIUM}:{}),args:name==='chromium'?['--no-sandbox']:[]});
  try{for(const ending of ['\n','\r\n','\r']){
   const page=await browser.newPage();
   try{
    await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="turns"></div><form><textarea style="width:500px;height:120px"></textarea><button type="button" class="ds-button--primary" aria-label="Send">Send</button></form>'}));
    await page.goto('https://chat.deepseek.com/a/chat/offline');
    await page.addScriptTag({content:fs.readFileSync('providers/deepseek.js','utf8')+';window.provider=RSProvider;'});
    const got=await page.evaluate(async ending=>{
      let clicks=0,body='';const requests=[];
      provider.init({sendContext:()=>({session:1,stop:0}),pacingRequest:async request=>{requests.push(request.action);return{ok:true,allowed:true,valid_until:Date.now()+30000};}});
      document.querySelector('button').onclick=()=>{clicks++;const ed=document.querySelector('textarea');body=ed.value;ed.value='';const row=document.createElement('div');row.className='ds-message';row.dataset.role='user';row.textContent=body;document.querySelector('#turns').append(row);};
      const text=["Output of 'read_file':",'  exact indentation 🧪','','last line'].join(ending);
      let ok=false,error='';try{ok=await provider.typeAndSend(text);}catch(e){error=e.message;}
      return{ok,error,clicks,body,draft:provider.editorText(),requests};
    },ending);
    assert.equal(got.ok,true,JSON.stringify(got));assert.equal(got.error,'');assert.equal(got.clicks,1);assert.equal(got.draft,'');assert.equal(got.body,"Output of 'read_file':\n  exact indentation 🧪\n\nlast line");
    assert(got.requests.includes('claim')&&got.requests.includes('validate')&&got.requests.includes('finish'),'the shared pacing/authorization gate must remain active');
    console.log('PASS '+name+' '+JSON.stringify(ending)+' result sends once through unchanged shared pacing');
   }catch(e){failures++;console.error(e.stack);}finally{await page.close();}
  }}finally{await browser.close();}
 }
 if(failures)throw Error(failures+' native line-ending delivery checks failed');
})().catch(e=>{console.error(e);process.exitCode=1;});

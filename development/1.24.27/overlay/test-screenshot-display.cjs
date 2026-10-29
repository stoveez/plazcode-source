// Exercise the production popup with a strict image policy in a real browser.
const fs = require('node:fs'), assert = require('node:assert/strict');
const {chromium,firefox} = require('playwright');
(async()=>{
 const browser=await (process.env.PLAZCODE_TEST_BROWSER==='firefox'?firefox:chromium).launch({headless:true,executablePath:process.env.PLAZCODE_BROWSER_EXECUTABLE || undefined,args:process.env.PLAZCODE_TEST_BROWSER==='firefox'?[]:['--no-sandbox']});
 try {
  const page=await browser.newPage();
  await page.setContent('<meta http-equiv="Content-Security-Policy" content="img-src \'none\'"><div id="root"></div>');
  const main=fs.readFileSync('core/main.js','utf8');
  const popup=main.slice(main.indexOf('    let screenshotCleanup = null;'),main.indexOf('\n    build();',main.indexOf('    let screenshotCleanup = null;')));
  const image=main.slice(main.indexOf('  function imageToBlob('),main.indexOf('  async function imageToPngBlob('));
  const result=await page.evaluate(async({popup,image})=>{
    const root=document.getElementById('root'),A={},ui={toast(){}},rememberImages=()=>{};
    eval(image+'\n'+popup+'\nwindow.capturePopup=showImages;');
    const source=document.createElement('canvas');source.width=2;source.height=2;source.getContext('2d').fillStyle='#ff0000';source.getContext('2d').fillRect(0,0,2,2);
    const data=source.toDataURL().split(',')[1];
    window.capturePopup([{mimeType:'image/png',data}],'screen_capture');
    await new Promise(resolve=>setTimeout(resolve,200));
    const canvas=root.querySelector('canvas');
    const pixels=Array.from(canvas.getContext('2d').getImageData(0,0,1,1).data);
    root.querySelector('.rs-shot-x').click();
    window.capturePopup([{mimeType:'image/png',data:'YmFk'}],'screen_capture');
    await new Promise(resolve=>setTimeout(resolve,200));
    const error=root.textContent.includes('Screenshot could not be displayed');
    root.querySelector('.rs-shot-x').click();
    return {pixels,error,closed:!root.querySelector('.rs-shot')};
  },{popup,image});
  assert.deepEqual(result.pixels,[255,0,0,255]);assert.equal(result.error,true);assert.equal(result.closed,true);
  console.log('Screenshot popup: pixels render despite img-src none; corrupt data explained; cleanup passed');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Browser contract test for Android bridge paths; does not emulate GPS/BLE hardware. */
const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>{
   let stored=localStorage.getItem('native-test')||JSON.stringify({name:'奶芙',memories:[],quiet:true,hidePlace:true,onboarded:true});
   const finished={id:'trip-qa',title:'测试同行',status:'finished',source:'phone',points:[{lat:30,lon:120,time:Date.now()-120000,segment:0}],quality:'精度约 10 米'};
   let track={...finished,status:'recording'};
   window.XinZaiAndroid={loadState:()=>stored,saveState:value=>{stored=value;localStorage.setItem('native-test',value);return true;},request:raw=>{
     const req=JSON.parse(raw);let data={};
     if(req.action==='trackStatus')data=track;
     if(req.action==='bleStatus')data={status:'disconnected'};
     if(req.action==='trackPause'){track={...track,status:'paused'};data=track;}
     if(req.action==='trackStop'){track={...track,status:'finished'};data=track;}
     if(req.action==='trackClear')track={};
     queueMicrotask(()=>window.XinZaiNative.receive({id:req.id,ok:true,data}));
   }};
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4173');
 await page.locator('#navigation [data-page="journey"]').click();
 await page.getByText('位置已过期',{exact:false}).waitFor();
 await page.locator('[data-mobile="finish"]').click();await page.locator('[name="note"]').fill('一起走过的路');await page.locator('[name="makeCard"]').check();await page.locator('#memory-form [type="submit"]').click();
 await page.locator('[data-mobile="saved-route"]').waitFor();
 assert.equal(await page.evaluate(()=>JSON.parse(XinZaiAndroid.loadState()).memories[0].track.points.length),1);
 await page.locator('[data-action="close"]').click();await page.locator('#navigation [data-page="home"]').click();
 fs.mkdirSync('output/qa',{recursive:true});await page.screenshot({path:'output/qa/android-contract-home.png',fullPage:true});
 await page.locator('[data-action="device"]').click();assert.match(await page.locator('.notice-box').textContent(),/断连期间不补传轨迹/);await page.locator('[data-action="close"]').click();
 await page.locator('#navigation [data-page="memories"]').click();await page.locator('[data-action="new"]').first().click();await page.locator('[name="note"]').fill('按安卓返回键也保留草稿');
 await page.evaluate(()=>window.xinzaiBack());await page.reload();await page.locator('[data-action="new"]').first().click();await page.locator('[data-experience="resume-draft"]').click();assert.equal(await page.locator('[name="note"]').inputValue(),'按安卓返回键也保留草稿');
 await page.screenshot({path:'output/qa/android-contract-editor.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 console.log('PASS Android bridge contract: stale location, completed trip association, device disclosure, back-button draft persistence, Android layout. Hardware remains untested.');await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});

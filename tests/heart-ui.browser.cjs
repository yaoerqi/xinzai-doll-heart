// Isolated UI contract fixtures; no simulated coordinates are saved on a user's phone.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   let stored=JSON.stringify({name:'测试娃娃',memories:[],onboarded:true}),track={};
   let device={status:'connected',name:'XinZai-Heart',id:'fixture-heart',trackSyncReady:true,gnssStatus:'searching',fix:false,satellites:0};
   window.testDevice=value=>{device={...device,...value};XinZaiNative.event({type:'bleDevice',data:device});};
   window.XinZaiAndroid={loadState:()=>stored,saveState:v=>{stored=v;return true;},request:raw=>{
     const r=JSON.parse(raw);let data={};
     if(r.action==='bleStatus')data=device;
     if(r.action==='trackStatus')data=track;
     if(r.action==='trackStart'){track={id:'fixture-trip',title:r.params.title,source:r.params.source||track.source,status:'recording',points:[],started:Date.now(),quality:'正在搜星'};data=track;}
     if(r.action==='trackStop'){track={...track,status:'finished'};data=track;}
     if(r.action==='trackPause'){track={...track,status:'paused'};data=track;}
     if(r.action==='trackClear')track={};
     queueMicrotask(()=>XinZaiNative.receive({id:r.id,ok:true,data}));
   }};
 });
 await page.goto('http://127.0.0.1:4173');
 await page.locator('[data-action=device]').first().click();
 await page.locator('#ble-connection').getByText(/正在搜星/).waitFor();
 assert.doesNotMatch(await page.locator('#ble-connection').innerText(),/纬度/);
 await page.evaluate(()=>testDevice({gnssStatus:'fixed',fix:true,satellites:8,hdop:1.2,lat:30,lon:120}));
 await page.getByText(/纬度 30.000000/).waitFor();
 await page.evaluate(()=>testDevice({gnssStatus:'stale',fix:false}));
 assert.doesNotMatch(await page.locator('#ble-connection').innerText(),/纬度/);
 await page.evaluate(()=>testDevice({gnssStatus:'searching',fix:false}));
 fs.mkdirSync('output/qa',{recursive:true});await page.screenshot({path:'output/qa/heart-searching.png'});
 await page.locator('[data-action=close]').click();
 await page.locator('#navigation [data-page=journey]').click();await page.locator('[data-action=trip]').click();
 assert.equal(await page.locator('[name=source]').inputValue(),'hardware');
 await page.locator('[name=place]').fill('蓝牙旅程测试');await page.locator('.privacy-check input').check();await page.locator('#native-trip-form [type=submit]').click();
 await page.locator('.route-status').getByText(/糖心卫星定位/).waitFor();
 assert.match(await page.locator('.route-empty').innerText(),/第一颗位置点/);
 await page.screenshot({path:'output/qa/heart-journey.png'});
 await page.locator('[data-mobile=finish]').click();await page.locator('[name=note]').fill('没有定位也能保存文字回忆');
 await page.locator('#memory-form [type=submit]').click();
 const saved=await page.evaluate(()=>JSON.parse(XinZaiAndroid.loadState()).memories[0]);
 assert.equal(saved.track.source,'hardware');assert.equal(saved.track.points.length,0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 console.log('PASS: searching/fix/stale UI, hardware trip selection, zero-point memory, layout; browser fixtures only.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

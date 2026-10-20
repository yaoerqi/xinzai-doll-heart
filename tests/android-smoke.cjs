/* Opt-in: runs only against a named Android emulator, never a physical phone. */
const {_android}=require('playwright');const {execFileSync}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const serial=process.env.XINZAI_TEST_EMULATOR||'emulator-5554';if(!/^emulator-\d+$/.test(serial))throw Error('Use a disposable emulator');
 const adb=process.env.ADB||path.resolve('.tooling/emulator-sdk/platform-tools/adb.exe');
 const command=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8'}).trim();
 const pid=command('shell','pidof','com.xinzai.app');if(!/^\d+$/.test(pid))throw Error('App must be running');
 const device=(await _android.devices()).find(d=>d.serial()===serial);if(!device)throw Error('Emulator not available');
 const webview=await device.webView({pkg:'com.xinzai.app'});const page=await webview.page();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.waitForFunction(()=>typeof MemoryCore==='object'&&typeof XinZaiNative==='object');
 assert.equal(await page.evaluate(()=>XinZaiNative.available),true);
 const testTitle=`安卓体验 ${Date.now()}`;
 const info=await page.evaluate(()=>XinZaiNative.request('info'));assert.equal(info.version,'0.5.0');
 const cloud=await page.evaluate(()=>XinZaiNative.request('cloudStatus'));assert.equal(cloud.connected,false);assert.equal(cloud.token,undefined);
 const rejected=await page.evaluate(async()=>{try{await XinZaiNative.request('cloudLogin',{endpoint:'http://127.0.0.1:8787',username:'test',password:'only-test-password'});return '';}catch(error){return error.message;}});assert.match(rejected,/HTTPS/);
 if(await page.locator('#identity-form').count()){await page.locator('#identity-form button[type="submit"]').click();}
 if(await page.locator('#modal[open]').count())await page.locator('[data-action="close"]').click();
 await page.locator('#navigation [data-page="memories"]').click();await page.locator('[data-action="new"]').first().click();
 if(await page.locator('[data-experience="resume-draft"]').count())await page.locator('[data-experience="resume-draft"]').click();
 await page.locator('[name="note"]').fill('安卓模拟器验证：草稿与照片回忆留在本机');
 await page.evaluate(()=>window.xinzaiBack());
 const saved=await page.evaluate(()=>JSON.parse(XinZaiAndroid.loadState()));assert.match(saved.draft.fields.note,/安卓模拟器验证/);
 await page.locator('[data-action="new"]').first().click();await page.locator('[data-experience="resume-draft"]').click();
 await page.locator('[name="title"]').fill(testTitle);await page.locator('#memory-form [type="submit"]').click();
 assert.equal(await page.locator('.memory-card').filter({hasText:testTitle}).count(),1);
 await page.reload();await page.locator('.memory-card').filter({hasText:testTitle}).waitFor();
 await page.locator('[data-library=manage]').click();await page.locator('[data-library=add]').click();await page.locator('#doll-form [name=name]').fill('安卓团团');await page.locator('#doll-form button[type=submit]').click();
 const dollId=await page.evaluate(()=>state.activeDollId);assert.equal(await page.locator('.memory-card').count(),0);
 await page.locator('[data-action=new]').first().click();await page.locator('[name=title]').fill('安卓双图相册');
 // Exercise image decoding and persistence inside the actual WebView. System picker UI is separate.
 await page.evaluate(async()=>{const files=await Promise.all(['assets/doll-cafe.png','assets/doll-hero.png'].map(async url=>new File([await(await fetch(url)).blob()],url.split('/').pop(),{type:'image/png'})));await loadPhoto(files);});
 assert.equal(await page.locator('.photo-editor-tile').count(),2);await page.locator('[data-experience=photo-cover][data-index="1"]').click();await page.locator('#memory-form button[type=submit]').click();await page.reload();
 const library=await page.evaluate(()=>JSON.parse(XinZaiAndroid.loadState()));assert.equal(library.activeDollId,dollId);assert.equal(library.memories.find(m=>m.dollId===dollId).photos.length,2);
 await page.locator('.memory-card').first().click();assert.equal(await page.locator('.album-thumbnails button').count(),2);await page.locator('[data-album=view][data-index="1"]').click();assert.match(await page.locator('#modal-title').textContent(),/2 \/ 2/);await page.locator('[data-action=close]').click();
 await page.locator('#navigation [data-page="home"]').click();
 fs.writeFileSync('output/qa/android-emulator-home.png',await device.screenshot());
 await page.locator('#navigation [data-page="memories"]').click();fs.writeFileSync('output/qa/android-emulator-memories.png',await device.screenshot());
 assert.deepEqual(errors,[]);console.log('PASS Android 15 emulator: native v0.4, cloud status and HTTP rejection, private-file drafts, new doll isolation, two-photo decoding/cover/album and persistence after reload.');
 await device.close();
})().catch(error=>{console.error(error);process.exit(1);});

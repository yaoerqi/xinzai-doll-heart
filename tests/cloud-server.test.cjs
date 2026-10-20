const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {createServer}=require('../cloud/server.cjs');const S=require('../sync-core.js');
test('real cloud API: invitations, auth, account isolation, CAS, restart durability and logout',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xinzai-cloud-test-')),database=path.join(dir,'data.sqlite');let server=createServer({database,invite:'test-invite',origins:['http://127.0.0.1:4173']});
 const listen=async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;};let base=await listen();
 const call=async(route,method='GET',body,token,origin)=>{const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const credentials={username:'tester',password:'only-a-test-password',invite:'test-invite'};
 try{
  assert.equal((await call('/api/register','POST',{...credentials,invite:'wrong'})).status,403);
  const a=await call('/api/register','POST',credentials);assert.equal(a.status,200);const token=a.data.token;
  assert.equal((await call('/api/login','POST',{...credentials,password:'wrong-password'})).status,401);
  assert.equal((await call('/api/library')).status,401);assert.equal((await call('/api/library','GET',undefined,token,'https://untrusted.example')).status,403);
  const b=await call('/api/register','POST',{...credentials,username:'other'});assert.equal(b.status,200);
  const data={name:'奶芙',memories:[{id:'one',title:'照片测试',date:'2026-10-01',image:'data:image/png;base64,YWJj',photos:['data:image/png;base64,YWJj','data:image/png;base64,ZGVm']}],cloud:{token:'must-not-save'}};S.stamp(data,{},()=>require('node:crypto').randomUUID());
  assert.equal((await call('/api/library','PUT',{revision:0,data},token)).status,200);
  assert.equal((await call('/api/library','PUT',{revision:0,data},token)).status,409);
  const owned=await call('/api/library','GET',undefined,token);assert.equal(owned.data.data.cloud,undefined);assert.equal(owned.data.data.memories[0].photos.length,2);
  assert.equal((await call('/api/library','GET',undefined,b.data.token)).data.data,null);
  const invalid=structuredClone(data);invalid.memories[0].photos=['https://external.example/image'];assert.equal((await call('/api/library','PUT',{revision:1,data:invalid},token)).status,400);
  await new Promise(resolve=>server.close(resolve));server=createServer({database,invite:'test-invite'});base=await listen();assert.equal((await call('/api/library','GET',undefined,token)).data.revision,1);
  const login=await call('/api/login','POST',credentials);assert.equal(login.status,200);
  assert.equal((await call('/api/logout','POST',{},token)).status,200);assert.equal((await call('/api/library','GET',undefined,token)).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
});

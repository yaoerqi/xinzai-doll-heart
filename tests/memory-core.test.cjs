const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../memory-core.js');
const m=(extras={})=>({id:'one',title:'河边散步',date:'2026-10-01',place:'小公园',tag:'一起出门',note:'秋天',image:'',...extras});
const raw=(memories=[m()],extra={})=>JSON.stringify({format:'xinzai-backup-v1',data:{name:'奶芙',memories,...extra}});

test('hardware routes survive backup with source, device and measured quality',()=>{
  const route={id:'heart-trip',source:'hardware',deviceId:'test-heart',points:[{lat:30,lon:120,time:1000,segment:0,hdop:1.2,satellites:8},{lat:30.001,lon:120,time:9000,segment:1,hdop:1.5,satellites:7}]};
  const parsed=C.parseBackup(raw([m({track:route})])).memories[0].track;
  assert.equal(parsed.source,'hardware');assert.equal(parsed.deviceId,'test-heart');assert.equal(parsed.timeSource,'phone-reception');
  assert.equal(parsed.points[0].hdop,1.2);assert.equal(parsed.points[1].segment,1);assert.equal(parsed.points[1].satellites,7);
});
test('calendar dates include leap years and reject impossible days',()=>{
  assert.equal(C.validDate('2024-02-29'),true);for(const s of ['2025-02-29','2026-02-31','2026-13-01','2026-00-01','2026-10-00','not-date'])assert.equal(C.validDate(s),false);
});
test('old v1 backups migrate and preserve optional new metadata',()=>{
  const old=C.parseBackup(raw());assert.equal(old.memories[0].favorite,false);assert.deepEqual(old.trash,[]);
  const next=C.parseBackup(raw([m({favorite:true})],{trash:[m({id:'deleted',deletedAt:123})]}));assert.equal(next.memories[0].favorite,true);assert.equal(next.trash[0].deletedAt,123);
});
test('reject remote images, malformed dates, duplicate IDs and unsafe routes',()=>{
  for(const value of [raw([m({image:'https://example.com/track.png'})]),raw([m({date:'2026-02-31'})]),raw([m(),m()]),raw([m({track:{id:'trip',points:[{lat:100,lon:0,time:1,segment:0}]}})]),raw([m({track:{id:'trip',points:[{lat:0,lon:0,time:1e20,segment:0}]}})])])assert.throws(()=>C.parseBackup(value));
});
test('merge keeps local records and conflicting versions, repeat import is idempotent',()=>{
  const current={memories:[m()],trash:[]},incoming={memories:[m(),m({note:'不同的文字'}),m({id:'two',title:'咖啡'})]};let id=0;
  const first=C.merge(current,incoming,()=>`copy-${++id}`);assert.equal(first.added,2);assert.equal(first.skipped,1);assert.equal(first.conflicts,1);assert.equal(first.memories.find(x=>x.id==='one').note,'秋天');
  const second=C.merge({...current,memories:first.memories},incoming,()=>`copy-${++id}`);assert.equal(second.added,0);assert.equal(second.skipped,3);
});
test('merge cannot collide with IDs in recycle bin',()=>{let n=0;const result=C.merge({memories:[],trash:[m()]},{memories:[m()]},()=>`new-${++n}`);assert.equal(result.memories[0].id,'new-1');});
test('search includes city and mood; combined filters and newest ordering work',()=>{
  const items=[m({id:'a',city:'杭州',mood:'开心',favorite:true}),m({id:'b',city:'上海',date:'2026-10-02'}),m({id:'c',city:'杭州',mood:'平静'})];
  assert.equal(C.filter(items,{query:'杭州',mood:'开心',mode:'favorites'}).length,1);assert.equal(C.filter(items)[0].id,'b');assert.equal(C.filter(items,{query:'   '}).length,3);
});
test('on this day excludes today and future records, then falls back to a real past memory',()=>{
  const items=[m({id:'old',date:'2025-10-04'}),m({id:'today',date:'2026-10-04'}),m({id:'future',date:'2027-10-04'})];
  assert.equal(C.recollection(items,'2026-10-04').memory.id,'old');assert.equal(C.recollection([items[1],items[2]],'2026-10-04'),null);assert.equal(C.recollection([m()],'2026-10-04').label,'再翻一页旧时光');
});
test('backup serialization roundtrip retains photos, favorites, trash and track segments',()=>{
  const data=C.parseBackup(raw([m({image:'data:image/jpeg;base64,YWJj',favorite:true,track:{id:'trip',source:'phone',points:[{lat:30,lon:120,time:1000,segment:0},{lat:31,lon:121,time:3000,segment:1}]}})],{trash:[m({id:'trash',deletedAt:4})]}));
  assert.deepEqual(C.parseBackup(JSON.stringify({format:'xinzai-backup-v1',data})),data);
});

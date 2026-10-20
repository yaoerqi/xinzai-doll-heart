/* Shared, DOM-free rules for memories, backup validation and safe merging. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MemoryCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function() {
  const MAX_FILE = 25 * 1024 * 1024;
  const MAX_PHOTOS = 9;
  function migrate(data) {
    if(!Array.isArray(data.dolls)||!data.dolls.length)data.dolls=[{id:'doll-legacy',name:data.name||'奶芙',birthday:data.birthday||'',personality:data.personality||'温柔慢热',archived:false}];
    for(const d of data.dolls){d.rev=d.rev||'';d.updatedAt=d.updatedAt||0;}
    if(!data.dolls.some(d=>d.id===data.activeDollId&&!d.archived))data.activeDollId=(data.dolls.find(d=>!d.archived)||data.dolls[0]).id;
    data.trash=Array.isArray(data.trash)?data.trash:[];data.tombstones=Array.isArray(data.tombstones)?data.tombstones:[];
    for(const m of [...data.memories,...data.trash]){
      if(!m.dollId)m.dollId=data.dolls[0].id;
      if(!Array.isArray(m.photos))m.photos=m.image?[m.image]:[];
      m.image=m.photos[0]||'';
    }
    if(data.draft){data.draft.dollId=data.draft.dollId||data.activeDollId;data.draft.photos=data.draft.photos||(data.draft.image?[data.draft.image]:[]);}
    const current=data.dolls.find(d=>d.id===data.activeDollId);data.name=current.name;data.birthday=current.birthday||'';data.personality=current.personality||'温柔慢热';data.schemaVersion=2;
    return data;
  }
  const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function validDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y,m,d] = s.split('-').map(Number);
    const date = new Date(`${s}T12:00:00`);
    return y >= 1900 && y <= 2199 && date.getFullYear() === y && date.getMonth()+1 === m && date.getDate() === d;
  }
  function text(v, max, fallback = '') {
    if (v === undefined) return fallback;
    if (typeof v !== 'string' || v.length > max) throw Error('备份中的文字格式或长度不正确');
    return v;
  }
  function track(value) {
    if (!value) return null;
    if (typeof value !== 'object' || !Array.isArray(value.points) || value.points.length > 50000) throw Error('路线数据格式不正确');
    const id = text(value.id,100); if (!id) throw Error('路线编号缺失');
    let previous = -Infinity;
    const points = value.points.map(p => {
      if (!p || !Number.isFinite(p.lat) || Math.abs(p.lat)>90 || !Number.isFinite(p.lon) || Math.abs(p.lon)>180 || !Number.isFinite(p.time) || p.time<0 || p.time>7258118400000 || p.time<previous || !Number.isInteger(p.segment) || p.segment<0) throw Error('路线坐标或时间无效');
      previous = p.time;
      return {lat:p.lat,lon:p.lon,time:p.time,segment:p.segment,...(Number.isFinite(p.accuracy)&&p.accuracy>=0?{accuracy:p.accuracy}:{}),...(Number.isFinite(p.hdop)&&p.hdop>=0?{hdop:p.hdop}:{}),...(Number.isInteger(p.satellites)&&p.satellites>=0&&p.satellites<=99?{satellites:p.satellites}:{})};
    });
    return {id,title:text(value.title,50),points,status:'finished',source:['phone','hardware'].includes(value.source)?value.source:'unknown',coordinateSystem:'WGS84',quality:text(value.quality,200),started:points[0]?.time||0,...(value.source==='hardware'?{deviceId:text(value.deviceId,100),timeSource:'phone-reception'}:{})};
  }
  function memory(m) {
    if (!m || typeof m !== 'object') throw Error('回忆格式不正确');
    const out = {};
    for (const [key,max] of Object.entries({id:100,title:40,date:10,place:50,tag:40,note:600,image:MAX_FILE,city:20,mood:20})) out[key]=text(m[key],max);
    if (!out.id || !out.title.trim() || !validDate(out.date)) throw Error('回忆标题、编号或日期无效');
    if (out.image && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(out.image)) throw Error('备份照片必须为内嵌图片，不能包含外部链接');
    out.template = m.template || 'cream';
    if (!['cream','pink','ticket'].includes(out.template)) throw Error('回忆模板无效');
    out.favorite = m.favorite === true;
    out.track = track(m.track);
    out.dollId=text(m.dollId,100,'doll-legacy');
    out.photos=m.photos===undefined?(out.image?[out.image]:[]):m.photos;
    if(!Array.isArray(out.photos)||out.photos.length>MAX_PHOTOS||out.photos.some(p=>typeof p!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(p)))throw Error('每份回忆最多 9 张内嵌照片');
    out.photos=[...out.photos];out.image=out.photos[0]||'';
    out.rev=text(m.rev,150);out.updatedAt=Number.isSafeInteger(m.updatedAt)&&m.updatedAt>=0?m.updatedAt:0;
    if(m.conflictOf)out.conflictOf=text(m.conflictOf,100);
    return out;
  }
  function parseBackup(raw) {
    if (new TextEncoder().encode(raw).length > MAX_FILE) throw Error('备份文件超过 25 MB');
    let wrapper; try { wrapper = JSON.parse(raw); } catch { throw Error('无法读取 JSON 备份'); }
    const data=wrapper?.data;
    if (!['xinzai-backup-v1','xinzai-backup-v2'].includes(wrapper?.format) || !Array.isArray(data?.memories) || !data.name?.trim?.()) throw Error('请选择心仔导出的备份');
    const trash = data.trash || [];
    if (!Array.isArray(trash) || data.memories.length+trash.length>500) throw Error('备份最多支持 500 份回忆（含回收站）');
    const ids = new Set();
    const validate = m => {const value=memory(m);if(ids.has(value.id))throw Error('备份包含重复编号');ids.add(value.id);return value;};
    const birthday=text(data.birthday,10);
    if (birthday && !validDate(birthday)) throw Error('生日日期无效');
    const result={name:text(data.name,10),memories:data.memories.map(validate),trash:trash.map(m=>({...validate(m),deletedAt:Number.isFinite(m.deletedAt)?m.deletedAt:0})),birthday,personality:text(data.personality,20,'温柔慢热'),quiet:data.quiet!==false,hidePlace:data.hidePlace!==false,onboarded:true,trip:null,connected:false};
    if(data.dolls!==undefined){
      if(!Array.isArray(data.dolls)||!data.dolls.length||data.dolls.length>20)throw Error('娃娃档案数量应为 1-20 个');
      const dollIds=new Set();result.dolls=data.dolls.map(d=>{
        if(!d||typeof d!=='object')throw Error('娃娃档案无效');
        const id=text(d.id,100),name=text(d.name,10),birthday=text(d.birthday,10);
        if(!id||dollIds.has(id)||!name.trim()||(birthday&&!validDate(birthday)))throw Error('娃娃编号、名字或生日无效');dollIds.add(id);
        return {id,name,birthday,personality:text(d.personality,20,'温柔慢热'),archived:d.archived===true,rev:text(d.rev,150),updatedAt:Number.isSafeInteger(d.updatedAt)&&d.updatedAt>=0?d.updatedAt:0};
      });
      if(!result.dolls.some(d=>!d.archived))throw Error('至少保留一个使用中的娃娃');
      if([...result.memories,...result.trash].some(m=>!dollIds.has(m.dollId)))throw Error('回忆关联的娃娃档案缺失');
      result.activeDollId=text(data.activeDollId,100);
    }
    if(data.tombstones!==undefined){
      if(!Array.isArray(data.tombstones)||data.tombstones.length>10000)throw Error('删除同步标记过多');
      const used=new Set();result.tombstones=data.tombstones.map(t=>{const id=text(t?.id,100),rev=text(t?.rev,150);if(!id||!rev||used.has(id)||ids.has(id))throw Error('删除同步标记无效');used.add(id);return {id,rev,updatedAt:Number.isSafeInteger(t.updatedAt)&&t.updatedAt>=0?t.updatedAt:0};});
    }
    return migrate(result);
  }
  const sorted = items => [...items].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
  function filter(items, options={}) {
    const q=(options.query||'').trim().toLocaleLowerCase();
    return sorted(items.filter(m=> (!q||[m.title,m.place,m.city,m.note,m.tag,m.date,m.mood].join(' ').toLocaleLowerCase().includes(q)) && (!options.city||m.city===options.city) && (!options.mood||m.mood===options.mood) && (options.mode!=='favorites'||m.favorite) && (options.mode!=='photos'||m.image) && (options.mode!=='out'||['一起出门','咖啡散步','追星打卡'].includes(m.tag))));
  }
  const signature = m => JSON.stringify([m.title,m.date,m.place,m.tag,m.note,m.photos||[m.image],m.dollId||'doll-legacy',m.city||'',m.mood||'',m.template||'cream',m.favorite===true,m.track?.points||[]]);
  function merge(current, incoming, makeId) {
    const ids=new Set([...current.memories,...(current.trash||[]),...(current.tombstones||[])].map(m=>m.id));
    const signatures=new Set(current.memories.map(signature));
    const result=[...current.memories];let added=0,skipped=0,conflicts=0;
    const dolls=[...(current.dolls||[])],mapping=new Map();
    for(const doll of incoming.dolls||[]){
      const match=dolls.find(d=>d.id===doll.id);
      if(match&&match.name!==doll.name){const identical=dolls.find(d=>d.name===doll.name&&d.birthday===doll.birthday&&d.personality===doll.personality);if(identical){mapping.set(doll.id,identical.id);continue;}const copy={...doll,id:makeId()};dolls.push(copy);mapping.set(doll.id,copy.id);}
      else if(!match)dolls.push({...doll});
    }
    if(dolls.length>20)throw Error('合并后超过 20 个娃娃档案');
    for (const original of incoming.memories) {
      const item={...original,dollId:mapping.get(original.dollId)||original.dollId};
      if (signatures.has(signature(item))) {skipped++;continue;}
      const next={...item};
      if(ids.has(next.id)){do{next.id=makeId();}while(ids.has(next.id));conflicts++;}
      ids.add(next.id);signatures.add(signature(next));result.push(next);added++;
    }
    if(result.length+(current.trash||[]).length>500)throw Error('合并后超过 500 份，请先整理回忆');
    return {memories:sorted(result),dolls,added,skipped,conflicts};
  }
  function recollection(items,today=localDate()) {
    const past=sorted(items.filter(m=>m.date<today));
    const anniversary=past.find(m=>m.date.slice(5)===today.slice(5));
    return anniversary?{label:'往年今日',memory:anniversary}:past.length?{label:'再翻一页旧时光',memory:past.find(m=>m.favorite)||past[0]}:null;
  }
  return {MAX_FILE,MAX_PHOTOS,migrate,localDate,validDate,parseBackup,filter,merge,recollection,sorted};
});

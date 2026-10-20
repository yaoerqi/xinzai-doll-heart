/* Versioned, three-way library merge. Missing records are never treated as deletions. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./memory-core.js'));else root.SyncCore=factory(root.MemoryCore);})(globalThis,function(C){
  function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
  function content(entity){const copy={...entity};delete copy.rev;delete copy.updatedAt;return canonical(copy);}
  function entities(data){const map=new Map();for(const d of data.dolls||[])map.set('d:'+d.id,{kind:'doll',value:d});for(const m of data.memories||[])map.set('m:'+m.id,{kind:'memory',value:m});for(const m of data.trash||[])map.set('m:'+m.id,{kind:'trash',value:m});for(const t of data.tombstones||[])map.set('m:'+t.id,{kind:'deleted',value:t});return map;}
  const same=(a,b)=>!!a&&!!b&&a.kind===b.kind&&content(a.value)===content(b.value);
  function stamp(state,previous,uid,now=Date.now()){
    C.migrate(state);const before=entities(previous||{}),after=entities(state);
    for(const [key,entry] of after){const old=before.get(key);if(!entry.value.rev||!same(entry,old)){entry.value.rev=uid();entry.value.updatedAt=now;}}
    for(const [key,entry] of before)if(key.startsWith('m:')&&!after.has(key))state.tombstones.push({id:entry.value.id,rev:uid(),updatedAt:now});
  }
  function snapshot(state){return {schemaVersion:2,name:state.name||state.dolls?.[0]?.name||'奶芙',birthday:state.birthday||'',personality:state.personality||'温柔慢热',activeDollId:state.activeDollId,dolls:state.dolls,memories:state.memories,trash:state.trash||[],tombstones:state.tombstones||[],quiet:state.quiet!==false,hidePlace:state.hidePlace!==false};}
  function validate(data){return C.parseBackup(JSON.stringify({format:'xinzai-backup-v2',data}));}
  function versions(data){return Object.fromEntries([...entities(data)].map(([key,e])=>[key,e.value.rev||'']));}
  function merge(local,remote,base={}){
    if(!remote)return {data:local,conflicts:0};
    const left=entities(local),right=entities(remote),chosen=new Map();let conflicts=0;
    const winner=(a,b)=>a.value.updatedAt===b.value.updatedAt?(a.value.rev>b.value.rev?a:b):(a.value.updatedAt>b.value.updatedAt?a:b);
    for(const key of new Set([...left.keys(),...right.keys()])){
      const a=left.get(key),b=right.get(key);
      if(!a||!b){chosen.set(key,a||b);continue;}
      if(same(a,b)){chosen.set(key,winner(a,b));continue;}
      const baseline=base[key];
      if(baseline&&a.value.rev===baseline&&b.value.rev!==baseline){chosen.set(key,b);continue;}
      if(baseline&&b.value.rev===baseline&&a.value.rev!==baseline){chosen.set(key,a);continue;}
      // A deletion wins against a concurrent edit. Keep the edit in the recycle bin
      // with its own ID, so stale devices cannot silently resurrect the original.
      if(a.kind==='deleted'||b.kind==='deleted'){
        const deleted=a.kind==='deleted'?a:b,other=a.kind==='deleted'?b:a;chosen.set(key,deleted);
        if(other.kind!=='deleted'){const id='conflict-'+other.value.rev;chosen.set('m:'+id,{kind:'trash',value:{...other.value,id,conflictOf:other.value.id,deletedAt:deleted.value.updatedAt}});conflicts++;}continue;
      }
      if(a.kind==='doll'){chosen.set(key,winner(a,b));continue;}
      const win=winner(a,b),lose=win===a?b:a;chosen.set(key,win);
      const id='conflict-'+lose.value.rev;
      chosen.set('m:'+id,{kind:lose.kind,value:{...lose.value,id,conflictOf:lose.value.id}});conflicts++;
    }
    // Keep an existing conflict's recovered/deleted state instead of regenerating it.
    for(const [key,value] of chosen)if(key.startsWith('m:conflict-')){
      const a=left.get(key),b=right.get(key);if(a?.kind==='deleted'||b?.kind==='deleted')chosen.set(key,a?.kind==='deleted'?a:b);
      else if(a||b)chosen.set(key,a&&b?winner(a,b):(a||b));
    }
    const data={...local,dolls:[],memories:[],trash:[],tombstones:[]};
    for(const item of chosen.values())data[item.kind==='doll'?'dolls':item.kind==='memory'?'memories':item.kind==='trash'?'trash':'tombstones'].push({...item.value});
    if(!data.dolls.some(d=>!d.archived)&&data.dolls.length)data.dolls[0].archived=false;
    C.migrate(data);data.memories=C.sorted(data.memories);return {data,conflicts};
  }
  return {canonical,content,entities,stamp,snapshot,validate,versions,merge};
});

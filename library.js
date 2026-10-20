/* Multiple companions share a library, but retain their own stories and passports. */
(() => {
  MemoryCore.migrate(state);
  let previous=JSON.parse(JSON.stringify(state));const originalSave=save;
  const uid=()=>crypto.randomUUID();
  save=function(){
    const current=state.dolls.find(d=>d.id===state.activeDollId);
    if(current){current.name=state.name;current.birthday=state.birthday||'';current.personality=state.personality||'温柔慢热';}
    SyncCore.stamp(state,previous,uid);
    const ok=originalSave();if(ok)previous=JSON.parse(JSON.stringify(state));return ok;
  };
  function activate(id){state.activeDollId=id;MemoryCore.migrate(state);}
  function commit(change){const before=JSON.parse(JSON.stringify(state));change();if(save())return true;state=before;return false;}
  const baseRender=render;
  render=function(focus=false){
    baseRender(focus);
    const picker=`<div class="doll-switcher"><label>今天和谁一起<select id="active-doll" aria-label="切换娃娃">${state.dolls.filter(d=>!d.archived).map(d=>`<option value="${escapeHTML(d.id)}" ${d.id===state.activeDollId?'selected':''}>${escapeHTML(d.name)}</option>`).join('')}</select></label><button class="text-button" data-library="manage">娃娃们 ${icon('heart')}</button></div>`;
    $('#view').insertAdjacentHTML('afterbegin',picker);
    if(page==='profile')$('.doll-passport .tags').innerHTML=`<span>棉花娃娃</span><span>${escapeHTML(state.personality)}</span><span>${scopedMemories().length} 份共同回忆</span>`;
  };
  function manage(){modal('我们的小小家庭',`<p>每个娃娃都有自己的档案、回忆和城市护照。归档只收起入口，不删除回忆。</p><div class="doll-list">${state.dolls.map(d=>`<div class="doll-row"><span class="doll-initial">${escapeHTML(d.name.slice(0,1))}</span><div><strong>${escapeHTML(d.name)}${d.archived?' · 已归档':''}</strong><small>${state.memories.filter(m=>m.dollId===d.id).length} 份回忆 · ${escapeHTML(d.personality||'温柔慢热')}</small></div><button class="text-button" data-library="edit" data-id="${escapeHTML(d.id)}">编辑</button><button class="text-button" data-library="${d.archived?'unarchive':'archive'}" data-id="${escapeHTML(d.id)}">${d.archived?'恢复':'归档'}</button></div>`).join('')}</div><button class="primary full-width" data-library="add">${icon('plus')}迎接一个新娃娃</button>`);}
  function editor(id){const d=state.dolls.find(d=>d.id===id);modal(d?'编辑娃娃档案':'欢迎新的小伙伴',`<form id="doll-form" data-id="${escapeHTML(id||'')}"><label class="form-field">名字<input name="name" maxlength="10" required value="${escapeHTML(d?.name||'')}"></label><label class="form-field">生日 · 可选<input type="date" name="birthday" min="1900-01-01" max="${MemoryCore.localDate()}" value="${escapeHTML(d?.birthday||'')}"></label><label class="form-field">陪伴性格<select name="personality">${['温柔慢热','好奇冒险','安静陪伴'].map(p=>`<option ${d?.personality===p?'selected':''}>${p}</option>`).join('')}</select></label><button class="primary full-width" type="submit">收好档案</button></form>`);}
  function canSwitch(){if(($('#modal').open&&$('#memory-form'))||state.draft||state.trip||nativeTrack.id){toast('请先保存或舍弃当前草稿和旅程，再切换娃娃');return false;}return true;}
  document.addEventListener('change',event=>{if(event.target.id!=='active-doll')return;if(!canSwitch()){event.target.value=state.activeDollId;return;}if(commit(()=>activate(event.target.value)))render();});
  document.addEventListener('click',event=>{const target=event.target.closest('[data-library]');if(!target)return;const {library:action,id}=target.dataset;
    if(action==='manage')manage();
    if(action==='add'){if(state.dolls.length>=20){toast('最多保留 20 个娃娃档案');return;}if(canSwitch())editor();}
    if(action==='edit')editor(id);
    if(action==='archive'){
      const d=state.dolls.find(d=>d.id===id);if(!d)return;
      if(state.dolls.filter(d=>!d.archived).length<=1){toast('至少保留一个使用中的娃娃');return;}
      if(id===state.activeDollId&&!canSwitch())return;
      if(commit(()=>{d.archived=true;if(id===state.activeDollId)activate(state.dolls.find(d=>!d.archived).id);})){render();manage();}
    }
    if(action==='unarchive'&&commit(()=>{state.dolls.find(d=>d.id===id).archived=false;})){render();manage();}
  });
  document.addEventListener('submit',event=>{const form=event.target;if(form.id!=='doll-form')return;event.preventDefault();const f=Object.fromEntries(new FormData(form));if(!f.name.trim()||(f.birthday&&(!MemoryCore.validDate(f.birthday)||f.birthday>MemoryCore.localDate()))){toast('请检查名字和生日');return;}
    if(commit(()=>{const existing=state.dolls.find(d=>d.id===form.dataset.id);if(existing){Object.assign(existing,{name:f.name.trim(),birthday:f.birthday,personality:f.personality});if(existing.id===state.activeDollId)activate(existing.id);}else{const id='doll-'+uid();state.dolls.push({id,name:f.name.trim(),birthday:f.birthday,personality:f.personality,archived:false});activate(id);}})){closeModal();render();toast('娃娃档案已收好');}
  });
  function acceptSync(data,cloud){const before=JSON.parse(JSON.stringify(state));const active=state.activeDollId;Object.assign(state,{dolls:data.dolls,memories:data.memories,trash:data.trash,tombstones:data.tombstones,cloud,activeDollId:active});MemoryCore.migrate(state);if(originalSave()){previous=JSON.parse(JSON.stringify(state));return true;}state=before;return false;}
  window.Library={activate,commit,manage,acceptSync};
  // Persist migration before accepting another edit; the old data is retained on failure.
  save();
})();

/* Memory-first experience shared by Android and browser preview. */
(() => {
  const C=MemoryCore;
  state.trash=Array.isArray(state.trash)?state.trash:[];
  let calendarMonth=C.localDate().slice(0,7), cityFilter='', moodFilter='';
  let draftTimer, editorBaseline='', photoVersion=0, pendingImport=null, exporting=false, uploadedPhotos=[],photoBusy=false;
  const baseRender=render, baseEditor=newMemory, baseOpen=openMemory, baseClose=closeModal;
  const uid=()=>`m-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
  function commit(change) {
    const old=JSON.parse(JSON.stringify(state));
    change();
    if (save()) return true;
    state=old;return false;
  }
  const formSnapshot=form=>{
    const fields=Object.fromEntries(new FormData(form));delete fields.photo;
    return {fields,image:uploadedPhoto,photos:[...uploadedPhotos],dollId:form.elements.dollId?.value||state.activeDollId,id:form.dataset.id||'',trip:form.dataset.trip==='true',track:form.dataset.trip==='true'?(window.xinzaiPendingTrack||null):null};
  };
  function persistDraft() {
    clearTimeout(draftTimer);
    const form=$('#memory-form');
    if(!form||form.dataset.committed==='true')return true;
    const snapshot=formSnapshot(form),serialized=JSON.stringify(snapshot);
    if(serialized===editorBaseline)return true;
    if(!commit(()=>{state.draft={...snapshot,savedAt:Date.now()};}))return false;
    editorBaseline=serialized;
    const status=$('#draft-status');if(status)status.textContent='草稿已保存在本机，可以放心暂时离开';
    return true;
  }
  function enhanceEditor() {
    const form=$('#memory-form');
    const existing=state.memories.find(m=>m.id===form.dataset.id);
    uploadedPhotos=[...(existing?.photos||(uploadedPhoto?[uploadedPhoto]:[]))];photoBusy=false;
    $('#photo-input').multiple=true;
    form.insertAdjacentHTML('afterbegin',`<label class="form-field">这段回忆属于<select name="dollId">${state.dolls.map(d=>`<option value="${escapeHTML(d.id)}" ${(existing?.dollId||state.activeDollId)===d.id?'selected':''}>${escapeHTML(d.name)}${d.archived?'（已归档）':''}</option>`).join('')}</select></label>`);
    form.elements.title.required=false;
    form.elements.title.placeholder='可以留空，我们会为这一天起个名字';
    form.elements.date.min='1900-01-01';form.elements.date.max=C.localDate();
    form.insertAdjacentHTML('afterbegin','<p id="draft-status" class="draft-status" role="status">边写边存草稿，不必一次写完。</p>');
    $('#upload-preview').parentElement.insertAdjacentHTML('afterend','<p class="view-note">最多 9 张；第一张是封面。照片会压缩保存，原图不受影响。</p><div id="photo-gallery" class="photo-editor-grid"></div>');
    form.insertAdjacentHTML('beforeend','<label class="privacy-check"><input name="makeCard" type="checkbox">保存后直接制作回忆卡</label>');
    form.elements.note.placeholder='今天有什么想记住的小事？一句话也很好。';
    paintPhoto();editorBaseline=JSON.stringify(formSnapshot(form));
  }
  newMemory=function(existing=null,tripDraft=false) {
    if(state.draft) {
      modal('上次的小故事，还在这里',`<p>你有一份尚未正式保存的草稿。先继续它，或明确舍弃后开始新的记录。</p><div class="modal-actions"><button class="primary" data-experience="resume-draft">继续上次草稿</button><button class="outline-button" data-experience="discard-draft">舍弃草稿</button></div>`);
      return;
    }
    baseEditor(existing,tripDraft);enhanceEditor();
  };
  function resumeDraft() {
    const draft=state.draft;if(!draft)return;
    const existing=state.memories.find(m=>m.id===draft.id);
    if(draft.track)window.xinzaiPendingTrack=draft.track;
    baseEditor(existing||null,draft.trip);enhanceEditor();
    const form=$('#memory-form');
    for(const [key,value] of Object.entries(draft.fields||{})) {
      const control=form.elements.namedItem(key);
      if(!control||key==='makeCard')continue;
      control.value=value;
    }
    form.elements.makeCard.checked=draft.fields?.makeCard==='on';
    uploadedPhotos=[...(draft.photos||(draft.image?[draft.image]:[]))];uploadedPhoto=uploadedPhotos[0]||'';if(draft.dollId)form.elements.dollId.value=draft.dollId;paintPhoto();
    editorBaseline=JSON.stringify(formSnapshot(form));
    $('#draft-status').textContent='已恢复上次草稿，继续写就好';
  }
  closeModal=function() {
    if(!persistDraft())return;
    photoVersion++;photoBusy=false;baseClose();
    if(page==='home'||page==='profile')render();
  };
  $('#modal').addEventListener('cancel',event=>{event.preventDefault();closeModal();});
  document.addEventListener('input',event=>{if(event.target.closest('#memory-form')){clearTimeout(draftTimer);draftTimer=setTimeout(persistDraft,450);}});
  document.addEventListener('change',event=>{if(event.target.closest('#memory-form')&&event.target.id!=='photo-input')persistDraft();});
  window.addEventListener('pagehide',persistDraft);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)persistDraft();});
  function paintPhoto() {
    uploadedPhoto=uploadedPhotos[0]||'';
    const preview=$('#upload-preview');
    if(preview)preview.innerHTML=uploadedPhoto?`<img src="${escapeHTML(uploadedPhoto)}" alt="回忆封面"><small>已选 ${uploadedPhotos.length}/9 张 · 点击继续添加</small>`:`${icon('camera')} 选几张我们的照片`;
    if($('#photo-gallery'))$('#photo-gallery').innerHTML=uploadedPhotos.map((p,i)=>`<div class="photo-editor-tile"><img src="${escapeHTML(p)}" alt="第 ${i+1} 张照片"><span>${i===0?'封面':i+1}</span><div><button type="button" data-experience="photo-cover" data-index="${i}" ${i===0?'disabled':''}>设封面</button><button type="button" data-experience="photo-left" data-index="${i}" ${i===0?'disabled':''} aria-label="前移第 ${i+1} 张">←</button><button type="button" data-experience="photo-remove" data-index="${i}" aria-label="移除第 ${i+1} 张">移除</button></div></div>`).join('');
  }
  loadPhoto=async function(input) {
    const files=Array.isArray(input)?input:[input];if(!files.length||!files[0])return;
    if(photoBusy){toast('正在处理照片，请稍等');return;}
    if(uploadedPhotos.length+files.length>9){toast(`这份回忆还能添加 ${9-uploadedPhotos.length} 张照片`);return;}
    if(files.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)){toast('每张请选择 15 MB 以内的 JPG、PNG 或 WebP 图片');return;}
    const version=++photoVersion,form=$('#memory-form');photoBusy=true;
    const submit=form?.querySelector('[type="submit"]');if(submit)submit.disabled=true;
    try {
      const added=[];
      for(const file of files){const url=URL.createObjectURL(file);try{
        const img=new Image();img.src=url;await img.decode();if(version!==photoVersion||!form?.isConnected)return;
        if(img.width*img.height>40000000)throw Error('照片尺寸过大');
        const ratio=Math.min(1,1280/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));
        const ctx=canvas.getContext('2d');ctx.fillStyle='#fffdf7';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);added.push(canvas.toDataURL('image/jpeg',.78));
      }finally{URL.revokeObjectURL(url);}}
      uploadedPhotos.push(...added);paintPhoto();persistDraft();toast(`${added.length} 张照片已处理并存入草稿`);
    } catch {if(form?.isConnected)toast('这张照片未能打开，请换一张试试');}
    finally {if(version===photoVersion){photoBusy=false;if(submit?.isConnected)submit.disabled=false;}}
  };
  document.addEventListener('change',event=>{if(event.target.id==='photo-input'){event.stopImmediatePropagation();loadPhoto([...event.target.files]);event.target.value='';}},true);
  function memoryResults() {
    const shown=C.filter(scopedMemories(),{query,mode:memoryMode,city:cityFilter,mood:moodFilter});
    return `<p class="results-count" role="status">找到 ${shown.length} 份回忆</p>${memoryMode==='calendar'?calendar(shown):shown.length?`<div class="memory-grid">${shown.map(memoryCard).join('')}</div>`:`<div class="empty-state"><p>${state.memories.length?'这一页还没有匹配的回忆，试试其他筛选。':'第一份回忆，等你来写。'}</p><button class="outline-button" data-experience="clear-filters">清除筛选</button><button class="primary" data-action="new">留下一个瞬间</button></div>`}`;
  }
  memories=function() {
    const choices=[['all','全部'],['favorites','珍藏'],['photos','照片'],['out','出门'],['calendar','日历']];
    return `${heading('把日子，装进回忆里','想起一个城市、一种心情，就能找到那一天。',`<button class="primary" data-action="new">${icon('plus')}留下一个瞬间</button>`)}<div class="toolbar memory-toolbar"><div class="segmented" aria-label="回忆筛选">${choices.map(([key,label])=>`<button data-action="filter" data-filter="${key}" class="${memoryMode===key?'active':''}" aria-pressed="${memoryMode===key}">${label}</button>`).join('')}</div><input class="search-field" id="memory-search" type="search" value="${escapeHTML(query)}" placeholder="搜索城市、心情、地点或故事" aria-label="搜索回忆"></div><div class="memory-facets"><label>城市<select id="city-filter"><option value="">全部城市</option>${[...new Set(scopedMemories().map(m=>m.city).filter(Boolean))].sort().map(city=>`<option ${cityFilter===city?'selected':''}>${escapeHTML(city)}</option>`).join('')}</select></label><label>心情<select id="mood-filter"><option value="">全部心情</option>${['平静','开心','被治愈','有点累','小激动'].map(m=>`<option ${moodFilter===m?'selected':''}>${m}</option>`).join('')}</select></label><button class="text-button" data-experience="clear-filters">重置</button></div><div id="memory-results">${memoryResults()}</div><p class="view-note">${icon('shield')} 回忆留在${nativeApp?'本机 App':'当前浏览器'}，不会自动公开。</p>`;
  };
  calendar=function(items) {
    const [y,m]=calendarMonth.split('-').map(Number),days=new Date(y,m,0).getDate(),offset=(new Date(y,m-1,1).getDay()+6)%7;
    return `<div class="calendar-controls"><button class="icon-button" data-experience="month-prev" aria-label="上个月">‹</button><label><span class="sr-only">选择月份</span><input id="calendar-month" type="month" min="1900-01" max="2199-12" value="${calendarMonth}"></label><button class="icon-button" data-experience="month-next" aria-label="下个月">›</button><button class="text-button" data-experience="month-today">本月</button></div><div class="calendar">${['一','二','三','四','五','六','日'].map(d=>`<div class="weekday">周${d}</div>`).join('')}${'<div></div>'.repeat(offset)}${Array.from({length:days},(_,i)=>{
      const date=`${calendarMonth}-${String(i+1).padStart(2,'0')}`,entries=items.filter(e=>e.date===date);
      return `<button class="${date===C.localDate()?'today':''}" data-experience="calendar-day" data-date="${date}" aria-label="${date}，${entries.length}份回忆" ${date>C.localDate()?'disabled':''}>${i+1}${entries[0]?.image?`<img src="${escapeHTML(entries[0].image)}" alt="">`:entries.length?' ♡':''}${entries.length?`<small>${entries.length} 篇</small>`:''}</button>`;
    }).join('')}</div><p class="view-note">点有记录的日子回看；点空白日期可以补记。</p>`;
  };
  const baseCard=memoryCard;
  memoryCard=m=>baseCard(m).replace('<span class="heart">♡</span>',`<span class="heart" aria-label="${m.favorite?'已珍藏':'未珍藏'}">${m.favorite?'♥':'♡'}</span>`);
  openMemory=function(id) {
    baseOpen(id);const m=state.memories.find(m=>m.id===id);if(!m)return;
    $('.card-preview').insertAdjacentHTML('beforebegin',`<button class="text-button favorite-button" data-experience="favorite" data-id="${escapeHTML(id)}" aria-pressed="${!!m.favorite}">${m.favorite?'♥ 已珍藏':'♡ 加入珍藏'}</button>`);
    const check=$('#share-place');
    if(check)check.addEventListener('change',()=>{
      $('.share-location-preview')?.remove();
      if(check.checked&&m.place)$('.card-preview').insertAdjacentHTML('beforeend',`<p class="share-location-preview">${icon('pin')}${escapeHTML(m.place)}</p>`);
    });
    if(check?.checked)check.dispatchEvent(new Event('change'));
    $('.modal-body').insertAdjacentHTML('beforeend','<p class="view-note">分享前请检查照片和文字：隐藏地点开关只控制地点栏，不会自动遮挡照片里的地址或正文。</p>');
  };
  function companionLetter() {
    const memory=C.recollection(scopedMemories())?.memory;
    const tone=state.personality==='好奇冒险'?'还想和你发现更多小小的新鲜事。':state.personality==='安静陪伴'?'不必安排什么，安静待在一起也很好。':'普通的日子，也值得被温柔收好。';
    modal(`${doll()}的一封小来信`,`<p class="view-note">根据你保存的回忆和性格，用本地文案写成。</p><div class="letter">${memory?`翻到 ${dateLabel(memory.date)} 的「${escapeHTML(memory.title)}」，又想起了我们的那一天。<br><br>`:'我们的故事，随时都可以开始。<br><br>'}${tone}<small>陪着你的 ${doll()} ♡</small></div>${memory?`<button class="outline-button full-width" data-action="memory" data-id="${escapeHTML(memory.id)}">翻开提到的这份回忆</button>`:''}<button class="primary full-width" data-action="close">收好这份温柔</button>`);
  }
  render=function(focus=false) {
    baseRender(focus);
    const date=$('.date-tag');if(date)date.innerHTML=`${icon('calendar')}${dateLabel(C.localDate())} · 今天也在一起`;
    const profileName=$('.profile-button span');if(profileName)profileName.innerHTML=`${doll()}和我的小世界<small>只属于我们的回忆</small>`;
    $('#inbox-button').setAttribute('aria-label',`查看${state.name}的来信`);
    if(nativeApp)$('.demo-label').textContent='ANDROID · 0.5';
    if(page==='home') {
      const revisit=C.recollection(scopedMemories()),thisMonth=scopedMemories().filter(m=>m.date.startsWith(C.localDate().slice(0,7)));
      $('.home-grid').insertAdjacentHTML('afterend',`<section class="memory-digest"><div><span class="app-kicker">这个月，我们一起</span><h2>${thisMonth.length} 份回忆，${new Set(thisMonth.map(m=>m.date)).size} 个被记住的日子</h2><p>不用每天打卡，想记录时，我都在。</p></div><button class="outline-button" data-experience="month-review">翻开本月</button></section>`);
      if(state.draft)$('.greeting').insertAdjacentHTML('afterend','<button class="draft-banner" data-experience="resume-draft">✎ 上次的小故事还没写完 <span>继续草稿 →</span></button>');
      if(revisit)$('.memory-digest').insertAdjacentHTML('afterend',`<button class="revisit-card" data-action="memory" data-id="${escapeHTML(revisit.memory.id)}"><span>${icon('book')}${revisit.label}</span><strong>${escapeHTML(revisit.memory.title)}</strong><small>${dateLabel(revisit.memory.date)} · 再看看那天的我们 →</small></button>`);
      if($('.whisper p'))$('.whisper p').textContent=state.quiet?'“不用特意做什么，我就在这里。”':'“今天有什么小事，想和我一起记住？”';
      if(!state.quiet)$('.memory-digest p').textContent='小小邀请：拍一张今天的合照，或者记下一件开心的事。';
    }
    if(page==='journey'&&nativeApp&&nativeTrack.id&&!['recording','starting'].includes(nativeTrack.status)){
      $('#native-route-panel').insertAdjacentHTML('afterend','<button class="text-button danger" data-experience="discard-trip">舍弃这段未保存的旅程</button>');
    }
    if(page==='profile') {
      $('.profile-grid').insertAdjacentHTML('afterend',`<section class="settings-card memory-tools"><h3>回忆有退路，也能带走</h3><div class="setting-row"><span>回收站<small>${state.trash.length} 份回忆，保留到你主动清理</small></span><button class="text-button" data-experience="trash">打开</button></div><div class="setting-row"><span>草稿<small>${state.draft?'有一段没写完的小故事':'暂时没有未完成的故事'}</small></span>${state.draft?'<button class="text-button" data-experience="resume-draft">继续写</button>':''}</div><p class="view-note">${state.lastBackup?`最近一次导出：${escapeHTML(new Date(state.lastBackup).toLocaleString('zh-CN'))}`:'还没有导出备份，换手机前记得带走我们的回忆。'}<br>本机存储未做应用层加密；卸载或清除数据会移除回忆。</p></section>`);
      const quiet=$('[data-action="toggle-quiet"]')?.closest('.setting-row').querySelector('small');if(quiet)quiet.textContent='开启后首页不显示记录邀请；始终没有断签惩罚';
      const restoreNote=$('[data-action="restore"]')?.closest('.setting-row').querySelector('small');if(restoreNote)restoreNote.textContent='先预览，再选择合并或替换';
    }
  };
  function showTrash() {
    modal('回收站 · 故事还在这里',`<p>误删的回忆可以找回。只有选择「永久删除」才会移除，不自动清空。开启云同步后，删除和恢复也会同步到同账号的其他设备。</p>${state.trash.map(m=>`<div class="trash-row"><div><strong>${escapeHTML(m.title)}</strong><small>${escapeHTML(state.dolls.find(d=>d.id===m.dollId)?.name||'')} · ${escapeHTML(m.date)}${m.conflictOf?' · 同步冲突副本':''}</small></div><button class="text-button" data-experience="recover" data-id="${escapeHTML(m.id)}">恢复</button><button class="text-button danger" data-experience="purge" data-id="${escapeHTML(m.id)}">永久删除</button></div>`).join('')||'<div class="empty-state">这里空空的，回忆都好好收着。</div>'}`);
  }
  restore=function() {
    pendingImport=null;
    modal('让回忆回到这里',`<p>先检查备份，再决定怎么导入。合并会保留本机回忆和娃娃档案，跳过相同内容；同编号但内容不同的回忆会保留两份。</p><form id="restore-form"><label class="form-field">选择心仔 JSON 备份<input id="restore-file" type="file" accept="application/json,.json" required></label><button class="primary full-width" type="submit">预览备份内容</button></form><p class="view-note">合并只加入备份中的正常回忆；替换还会恢复备份的回收站和档案。草稿与进行中的旅程不从备份恢复。</p>`);
  };
  backup=async function() {
    if(exporting)return;exporting=true;
    try {
      if(!persistDraft())return;
      const data=JSON.parse(JSON.stringify(state));delete data.draft;delete data.trip;delete data.cloud;data.connected=false;
      await Album.embedPhotos(data);
      const raw=JSON.stringify({format:'xinzai-backup-v2',exportedAt:new Date().toISOString(),data});C.parseBackup(raw);
      await downloadBlob(new Blob([raw],{type:'application/json'}),`心仔-${C.localDate()}-回忆备份.json`);
      commit(()=>{state.lastBackup=Date.now();});render();toast('备份已导出，包含已保存回忆、照片及回收站；不含草稿和未完成旅程');
    }catch(error){toast(error.message||'备份未完成，请稍后重试');}finally{exporting=false;}
  };
  function applyImport(replace) {
    if(!pendingImport)return;
    if(nativeTrack.id||state.trip||state.draft){toast('请先保存旅程和草稿，再导入备份');return;}
    let summary;
    if(replace) {
      if(!$('#replace-confirm')?.checked){toast('请先确认已保留需要的本机备份');return;}
      if(!commit(()=>{state={...pendingImport,trash:pendingImport.trash||[],cloud:state.cloud?{...state.cloud,auto:false}:undefined};}))return;
      summary='备份已恢复；云同步已暂停，确认后可在「我的」重新开启';
    } else {
      const result=C.merge(state,pendingImport,uid);
      if(!commit(()=>{state.memories=result.memories;if(result.dolls.length)state.dolls=result.dolls;MemoryCore.migrate(state);}))return;
      summary=`新增 ${result.added} 份，跳过 ${result.skipped} 份重复回忆${result.conflicts?`，保留 ${result.conflicts} 份冲突副本`:''}`;
    }
    pendingImport=null;cityFilter='';moodFilter='';query='';memoryMode='all';closeModal();go('memories');toast(summary);
  }
  document.addEventListener('submit',async event=>{
    const form=event.target;
    if(!['memory-form','restore-form'].includes(form.id))return;
    event.preventDefault();event.stopImmediatePropagation();clearTimeout(draftTimer);
    if(form.id==='memory-form') {
      const fields=Object.fromEntries(new FormData(form));
      if(photoBusy){toast('照片还在处理中，请稍等');return;}
      if(!state.dolls.some(d=>d.id===fields.dollId)){toast('请选择这段回忆的娃娃');return;}
      if(!C.validDate(fields.date)||fields.date>C.localDate()){toast('请选择有效日期，回忆不能晚于今天');return;}
      if(!fields.title.trim()&&!fields.note.trim()&&!uploadedPhoto){toast('选一张照片，或写下标题、小事中的任意一项就好');return;}
      const existing=state.memories.find(m=>m.id===form.dataset.id);
      if(!existing&&state.memories.length+state.trash.length>=500){toast('最多保存 500 份回忆，请先导出备份并整理');return;}
      const m={id:existing?.id||uid(),dollId:fields.dollId,photos:[...uploadedPhotos],title:fields.title.trim()||`${fields.date} 的小小日常`,date:fields.date,place:fields.place.trim(),tag:fields.tag,note:fields.note.trim(),image:uploadedPhoto,city:fields.city.trim(),mood:fields.mood,template:fields.template||'cream',favorite:!!existing?.favorite,track:form.dataset.trip==='true'?(window.xinzaiPendingTrack||null):(existing?.track||null)};
      if(!commit(()=>{state.memories=C.sorted([...state.memories.filter(x=>x.id!==m.id),m]);state.draft=null;if(!state.dolls.find(d=>d.id===m.dollId)?.archived)Library.activate(m.dollId);if(form.dataset.trip==='true')state.trip=null;}))return;
      form.dataset.committed='true';window.xinzaiPendingTrack=null;closeModal();query='';cityFilter='';moodFilter='';memoryMode='all';go('memories');
      toast('收好啦，又多了一段我们的故事 ♡');if(fields.makeCard==='on')openMemory(m.id);
    }else{
      if(nativeTrack.id||state.trip||state.draft){toast('请先保存旅程和草稿，再导入备份');return;}
      const file=$('#restore-file').files[0],submit=form.querySelector('button');submit.disabled=true;
      try {
        if(!file||file.size>C.MAX_FILE)throw Error('请选择 25 MB 以内的心仔备份');
        const incoming=C.parseBackup(await file.text());
        if(!form.isConnected)return;pendingImport=incoming;
        const preview=C.merge(state,incoming,uid);
        modal('先看看，要带回哪些回忆',`<div class="notice-box">备份来自：${escapeHTML(incoming.name)}<br>${incoming.dolls.length} 个娃娃 · ${incoming.memories.length} 份回忆 · ${incoming.memories.reduce((sum,m)=>sum+m.photos.length,0)} 张照片 · ${incoming.trash.length} 份回收站记录<br>合并将新增 ${preview.added} 份，跳过 ${preview.skipped} 份重复内容，保留 ${preview.conflicts} 份冲突副本。</div><button class="primary full-width" style="margin-top:18px" data-experience="import-merge">合并回忆，保留本机内容</button><details class="replace-import"><summary>需要完全替换本机内容？</summary><p>将替换当前回忆、回收站和娃娃档案。此操作不能通过回收站撤销。</p><label class="privacy-check"><input id="replace-confirm" type="checkbox">我已导出需要保留的本机备份，同意替换。</label><button class="outline-button full-width" data-experience="import-replace">确认替换</button></details>`);
      }catch(error){toast(error.message);if(submit.isConnected)submit.disabled=false;}
    }
  },true);
  document.addEventListener('change',event=>{
    if(event.target.id==='city-filter'){cityFilter=event.target.value;$('#memory-results').innerHTML=memoryResults();}
    if(event.target.id==='mood-filter'){moodFilter=event.target.value;$('#memory-results').innerHTML=memoryResults();}
    if(event.target.id==='calendar-month'&&/^\d{4}-\d{2}$/.test(event.target.value)&&C.validDate(event.target.value+'-01')){calendarMonth=event.target.value;$('#memory-results').innerHTML=memoryResults();}
  });
  // Capture before the original handlers so destructive actions use the new recovery flow.
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-experience],[data-action="delete"],[data-action="confirm-delete"],[data-action="toggle-quiet"]');
    if(!target)return;
    event.preventDefault();event.stopImmediatePropagation();
    const action=target.dataset.experience||target.dataset.action,id=target.dataset.id;
    try{switch(action) {
      case 'photo-cover':case 'photo-left':case 'photo-remove':{if(photoBusy){toast('请等照片处理完成');break;}const i=Number(target.dataset.index);if(!Number.isInteger(i)||!uploadedPhotos[i])break;if(action==='photo-remove')uploadedPhotos.splice(i,1);else if(action==='photo-cover')uploadedPhotos.unshift(uploadedPhotos.splice(i,1)[0]);else if(i>0)[uploadedPhotos[i-1],uploadedPhotos[i]]=[uploadedPhotos[i],uploadedPhotos[i-1]];paintPhoto();persistDraft();break;}
      case 'resume-draft':resumeDraft();break;
      case 'discard-draft':if(commit(()=>{state.draft=null;})){closeModal();toast('草稿已舍弃，可以开始新的记录');}break;
      case 'favorite':if(commit(()=>{const m=state.memories.find(m=>m.id===id);m.favorite=!m.favorite;})){render();openMemory(id);}break;
      case 'clear-filters':cityFilter='';moodFilter='';query='';memoryMode='all';render();break;
      case 'month-review':cityFilter='';moodFilter='';query=C.localDate().slice(0,7);memoryMode='all';go('memories');break;
      case 'discard-trip':modal('舍弃未保存的旅程？','<p>只移除当前未保存的路线，已有回忆不受影响。此操作不能撤销。</p><div class="modal-actions"><button class="outline-button" data-action="close">保留旅程</button><button class="primary" data-experience="discard-trip-confirm">确认舍弃</button></div>');break;
      case 'discard-trip-confirm':{
        if(state.draft?.trip){toast('这段旅程还有回忆草稿，请先保存或舍弃草稿');break;}
        target.disabled=true;
        requestNative('trackClear',{tripId:nativeTrack.id}).then(()=>{nativeTrack={};window.xinzaiPendingTrack=null;commit(()=>{state.trip=null;});closeModal();render();toast('未保存的旅程已舍弃');}).catch(error=>{toast(error.message);target.disabled=false;});break;
      }
      case 'month-today':calendarMonth=C.localDate().slice(0,7);$('#memory-results').innerHTML=memoryResults();break;
      case 'month-prev':case 'month-next':{const [y,m]=calendarMonth.split('-').map(Number);const d=new Date(y,m-1+(action==='month-prev'?-1:1),1);if(d.getFullYear()<1900||d.getFullYear()>2199)break;calendarMonth=C.localDate(d).slice(0,7);$('#memory-results').innerHTML=memoryResults();break;}
      case 'calendar-day':{
        const date=target.dataset.date,items=C.filter(scopedMemories(),{query,city:cityFilter,mood:moodFilter}).filter(m=>m.date===date);
        if(items.length){query=date;memoryMode='all';render();}
        else {newMemory();if($('#memory-form')){$('#memory-form').elements.date.value=date;persistDraft();}}break;
      }
      case 'toggle-quiet':if(commit(()=>{state.quiet=!state.quiet;})){render();toast(state.quiet?'安静陪着你，不显示记录邀请':'首页会出现轻轻的记录邀请');}break;
      case 'delete':modal('先把这一页放进回收站？','<p>照片与附属路线会一起保留，可以在「我的 → 回收站」找回。</p>'+`<div class="modal-actions"><button class="outline-button" data-action="memory" data-id="${escapeHTML(id)}">再留一会儿</button><button class="primary" data-action="confirm-delete" data-id="${escapeHTML(id)}">移入回收站</button></div>`);break;
      case 'confirm-delete':if(commit(()=>{const m=state.memories.find(m=>m.id===id);if(m)state.trash.push({...m,deletedAt:Date.now()});state.memories=state.memories.filter(m=>m.id!==id);})){closeModal();render();toast('已放入回收站，可以在「我的」找回');}break;
      case 'trash':showTrash();break;
      case 'recover':if(commit(()=>{const m=state.trash.find(m=>m.id===id);if(m){const restored={...m};delete restored.deletedAt;if(state.memories.some(m=>m.id===restored.id))restored.id=uid();state.memories=C.sorted([...state.memories,restored]);state.trash=state.trash.filter(m=>m.id!==id);}})){render();showTrash();toast('这段故事回来了');}break;
      case 'purge':modal('永久删除这份回忆？',`<p>会移除照片、文字和附属路线，不能撤销。开启云同步后，这次删除也会同步到同账号的其他设备。已导出的备份不受影响。</p><div class="modal-actions"><button class="outline-button" data-experience="trash">保留</button><button class="primary" data-experience="purge-confirm" data-id="${escapeHTML(id)}">永久删除</button></div>`);break;
      case 'purge-confirm':if(commit(()=>{state.trash=state.trash.filter(m=>m.id!==id);})){render();showTrash();}break;
      case 'import-merge':applyImport(false);break;
      case 'import-replace':applyImport(true);break;
    }}catch(error){toast(error.message||'操作没有完成，请重试');}
  },true);
  // An ancestor capture listener runs before mobile.js's old document listener.
  window.addEventListener('click',event=>{
    if(event.target.closest('[data-action="inbox"]')){event.preventDefault();event.stopImmediatePropagation();companionLetter();}
    if(event.target.closest('[data-mobile="resume"]')&&state.draft?.trip){event.preventDefault();event.stopImmediatePropagation();toast('请先保存或舍弃这段旅程的草稿，再继续记录');}
  },true);
  window.MemoryEditor={flush:persistDraft,busy:()=>photoBusy};
  render();
})();

(() => {
  async function embedPhotos(data){
    const cache=new Map();
    for(const m of [...data.memories,...(data.trash||[])]){
      const photos=m.photos||(m.image?[m.image]:[]),out=[];
      for(const photo of photos){if(!photo.startsWith('assets/')){out.push(photo);continue;}
        if(!cache.has(photo)){const img=new Image();img.src=photo;await img.decode();const c=document.createElement('canvas'),ratio=Math.min(1,1280/Math.max(img.width,img.height));c.width=img.width*ratio;c.height=img.height*ratio;c.getContext('2d').drawImage(img,0,0,c.width,c.height);cache.set(photo,c.toDataURL('image/jpeg',.78));}out.push(cache.get(photo));
      }m.photos=out;m.image=out[0]||'';
    }return data;
  }
  async function drawCollage(ctx,photos,x,y,w,h){
    const columns=photos.length<=4?2:3,rows=Math.ceil(photos.length/columns),gap=12,cw=(w-gap*(columns-1))/columns,ch=(h-gap*(rows-1))/rows;
    for(let i=0;i<photos.length;i++){const img=new Image();img.src=photos[i];await img.decode();const px=x+(i%columns)*(cw+gap),py=y+Math.floor(i/columns)*(ch+gap),scale=Math.max(cw/img.width,ch/img.height);ctx.save();ctx.beginPath();ctx.rect(px,py,cw,ch);ctx.clip();ctx.drawImage(img,px+(cw-img.width*scale)/2,py+(ch-img.height*scale)/2,img.width*scale,img.height*scale);ctx.restore();}
  }
  const baseOpen=openMemory,baseCard=memoryCard,baseRender=render;
  memoryCard=m=>baseCard(m).replace('<div class="memory-info">',`${m.photos?.length>1?`<span class="photo-count">${m.photos.length} 张照片</span>`:''}<div class="memory-info">`);
  openMemory=function(id){baseOpen(id);const m=state.memories.find(m=>m.id===id);if(!m)return;
    const name=state.dolls.find(d=>d.id===m.dollId)?.name||state.name;
    $('.card-preview').insertAdjacentHTML('beforebegin',`<p class="album-owner">和 ${escapeHTML(name)} 的回忆${m.conflictOf?' · 同步冲突保留副本':''}</p>`);
    $('.card-preview small:last-of-type').textContent=`♡ ${name} & YOU · 心仔`;
    if(!m.photos?.length)return;
    $('.card-preview').insertAdjacentHTML('afterend',`<div class="album-thumbnails">${m.photos.map((p,i)=>`<button data-album="view" data-id="${escapeHTML(id)}" data-index="${i}" aria-label="查看第 ${i+1} 张照片"><img src="${escapeHTML(p)}" alt="第 ${i+1} 张照片"></button>`).join('')}</div>${m.photos.length>1?'<label class="privacy-check"><input id="share-collage" type="checkbox" checked>将全部照片拼成一张回忆卡（取消则只用封面）</label>':''}`);
  };
  function viewer(id,index){const m=state.memories.find(m=>m.id===id);if(!m?.photos?.[index])return;modal(`${index+1} / ${m.photos.length} · 我们的相册`,`<img class="album-full" src="${escapeHTML(m.photos[index])}" alt="${escapeHTML(m.title)} 第 ${index+1} 张"><div class="modal-actions"><button class="outline-button" data-album="view" data-id="${escapeHTML(id)}" data-index="${index-1}" ${index===0?'disabled':''}>上一张</button><button class="outline-button" data-album="view" data-id="${escapeHTML(id)}" data-index="${index+1}" ${index===m.photos.length-1?'disabled':''}>下一张</button></div><button class="text-button full-width" data-action="memory" data-id="${escapeHTML(id)}">回到这份回忆</button>`);}
  document.addEventListener('click',event=>{const t=event.target.closest('[data-album="view"]');if(t)viewer(t.dataset.id,Number(t.dataset.index));});
  render=function(focus=false){baseRender(focus);if(page==='home'){const count=$('.stats-bar .stat:last-child strong');if(count)count.textContent=scopedMemories().reduce((sum,m)=>sum+(m.photos?.length||0),0);}};
  window.Album={embedPhotos,drawCollage};render();
})();

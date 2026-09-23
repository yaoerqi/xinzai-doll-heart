/* Shared companion experience. Native features are honest, explicit and user-started. */
const nativeApp = XinZaiNative.available;
let nativeTrack = {}, nativeDevice = {}, bleResults = { devices: [], scanning: false }, activeNativeModal = '', trackBusy = false;
const originalRender = render, originalNewMemory = newMemory, originalOpenMemory = openMemory, originalDevice = showDevice, originalStartTrip = startTrip, originalJourney = journey, originalClose = closeModal;
const requestNative = (action, params) => XinZaiNative.request(action, params);
const prettyDate = value => new Date(value).toLocaleDateString('zh-CN');
const realMemories = () => state.memories.filter(m => !['cafe','home','walk'].includes(m.id));
const trackLabels = {recording:'正在记录',starting:'正在启动',paused:'已经暂停',interrupted:'记录已中断',finished:'等待收进回忆'};
function cities() { return [...new Set(state.memories.map(m => m.city).filter(Boolean))]; }

render = function(focus = false) {
  originalRender(focus);
  if (nativeApp) {
    $('.demo-label').textContent = 'ANDROID · 0.2';
    const deviceStatus = nativeDevice.status === 'connected' ? 'BLE 已连接 · 协议待适配' : '糖心尚未连接';
    if ($('.hero .pill')) $('.hero .pill').innerHTML = `${icon('heart')} ${escapeHTML(state.name)}的小世界`;
    if ($('.device-card .card-heading')) $('.device-card .card-heading').innerHTML = '<span>糖心 · 娃娃的心脏</span>';
    if ($('.device-card>p')) $('.device-card>p').textContent = deviceStatus;
    if ($('.device-card .device-stats')) $('.device-card .device-stats').innerHTML = `<span>${icon('bluetooth')}${deviceStatus}</span>`;
    if ($('.device-card h3')) $('.device-card h3').textContent = '一颗为你而跳的糖心';
    if ($('.device-card .outline-button')) $('.device-card .outline-button').innerHTML = `${icon('bluetooth')}连接糖心`;
    if ($('.whisper p')) $('.whisper p').textContent = state.memories.length ? '“一起经历的小事，我都想收好。”' : '“第一段故事，我们一起写吧。”';
    if ($('.whisper small')) $('.whisper small').textContent = '一封轻陪伴小来信';
    document.querySelectorAll('.view-note').forEach(node => { node.innerHTML = node.innerHTML.replaceAll('当前浏览器', '本机 App 私有目录').replaceAll('浏览器', 'App'); });
    const setting = $('.settings-card .setting-row small');
    if (page === 'profile' && setting) setting.textContent = deviceStatus + '，可查看真实扫描结果';
    if (page === 'profile' && $('.doll-passport p')) $('.doll-passport p').innerHTML = `性格：${escapeHTML(state.personality || '温柔慢热')}<br>${state.birthday ? '生日：' + escapeHTML(state.birthday) : '每一个普通日子，都想陪着你。'}`;
    if (page === 'home') {
      const hero = $('.hero');
      hero.insertAdjacentHTML('afterend', `<div class="quick-record"><button class="outline-button" data-action="new">${icon('camera')}记录此刻</button><button class="outline-button" data-mobile="passport">${icon('book')}娃娃护照</button></div>`);
    }
  }
  if (page === 'profile') $('.profile-grid').insertAdjacentHTML('afterend', `<button class="passport-banner full-width" data-mobile="passport"><div style="text-align:left"><h3>我们的旅行护照</h3><p>${cities().length ? `已收集 ${cities().length} 座城市的印章` : '下一站，会是哪里呢？'}</p></div>${icon('book')}</button><div class="passport-actions"><button class="outline-button" data-mobile="identity">编辑娃娃档案</button><button class="outline-button" data-mobile="privacy">位置与数据</button></div>`);
};

newMemory = function(existing = null, tripDraft = false) {
  originalNewMemory(existing, tripDraft);
  activeNativeModal = 'editor';
  const note = $('#memory-form .form-field:has(textarea)');
  note.insertAdjacentHTML('beforebegin', `<div class="form-two"><label class="form-field">城市 · 护照印章<input name="city" maxlength="20" placeholder="例如：杭州" value="${escapeHTML(existing?.city || '')}"></label><label class="form-field">今天的心情<select name="mood">${['平静','开心','被治愈','有点累','小激动'].map(m => `<option ${existing?.mood===m?'selected':''}>${m}</option>`).join('')}</select></label></div>`);
  note.insertAdjacentHTML('afterend', `<div class="form-field">给回忆选张纸</div><div class="template-options">${[['cream','奶油手账'],['pink','樱花心事'],['ticket','应援票根']].map(([key,label]) => `<label><input type="radio" name="template" value="${key}" ${(existing?.template || 'cream')===key?'checked':''}>${label}</label>`).join('')}</div>`);
  if (nativeApp) {
    $('#modal-content').querySelectorAll('p').forEach(n => { n.textContent=n.textContent.replaceAll('当前浏览器','本机 App 私有目录'); });
    if (tripDraft && window.xinzaiPendingTrack) $('#memory-form').insertAdjacentHTML('afterbegin', `<p class="notice-box">这段路线有 ${window.xinzaiPendingTrack.points?.length || 0} 个位置点，将随回忆保存在本机；导出的照片卡片不含轨迹坐标。</p>`);
  }
};
openMemory = function(id) {
  originalOpenMemory(id); activeNativeModal='memory';
  const m = state.memories.find(m => m.id===id); if(!m)return;
  const preview=$('.card-preview'); preview.classList.add(`theme-${['cream','pink','ticket'].includes(m.template)?m.template:'cream'}`);
  if(m.mood)preview.insertAdjacentHTML('beforeend',`<span class="mood-caption">今天的小心情 · ${escapeHTML(m.mood)}</span>`);
  if(m.track?.points?.length)$('.modal-actions').insertAdjacentHTML('afterend',`<button class="outline-button full-width" style="margin-top:12px" data-mobile="saved-route" data-memory="${escapeHTML(id)}">${icon('map')}重走这段路线 · ${m.track.points.length} 个位置点</button>`);
};
closeModal = function() { if(activeNativeModal==='device' && nativeApp)requestNative('bleStop').catch(()=>{});activeNativeModal='';originalClose(); };

function passport() {
  const list = cities();
  modal('一本，只属于我们的护照',`<div class="passport-cover">${icon('book')}<h3>${doll()}的旅行护照</h3><p>ONE LITTLE SOUL · SO MANY PLACES<br>一起走过的地方，都会在这里留下印章。</p></div><div class="route-stats"><div><strong>${list.length}</strong><small>座城市</small></div><div><strong>${state.memories.length}</strong><small>份回忆</small></div><div><strong>${new Set(state.memories.map(m=>m.date)).size}</strong><small>有记录的日子</small></div></div>${list.length?`<div class="stamp-grid">${list.map(city=>`<div class="city-stamp"><small>♡ TOGETHER</small><strong>${escapeHTML(city)}</strong><small>一起抵达</small></div>`).join('')}</div>`:'<p class="notice-box">保存回忆时填上城市，就能收集一枚印章。城市由你确认，不会根据不准确的位置偷偷添加。</p>'}<button class="primary full-width" data-mobile="passport-record">${icon('plus')}收藏下一站</button>`);activeNativeModal='passport';
}
function identity(welcome=false) {
  modal(welcome?'给小小的我，一个名字':'我们的娃娃档案',`<div style="text-align:center"><div class="welcome-mark">♥</div><p style="font-size:13px;line-height:1.9;color:#a0937e">从今天起，一起收集小小的快乐。</p></div><form id="identity-form"><label class="form-field">娃娃的名字<input name="name" maxlength="10" required value="${doll()}"></label><div class="form-two"><label class="form-field">娃娃生日 · 可选<input name="birthday" type="date" value="${escapeHTML(state.birthday||'')}"></label><label class="form-field">陪伴性格<select name="personality">${['温柔慢热','好奇冒险','安静陪伴'].map(p=>`<option ${state.personality===p?'selected':''}>${p}</option>`).join('')}</select></label></div><div class="notice-box">照片和回忆留在本机。需要定位或蓝牙时再征求权限；没有糖心，也能先收藏日常。</div><button class="primary full-width" style="margin-top:20px" type="submit">${welcome?'开始我们的小故事':'收好这份档案'}</button></form>`);activeNativeModal='identity';
}

showDevice = function() {
  if(!nativeApp){originalDevice();return;}
  const connected=nativeDevice.status==='connected';
  modal('糖心，藏在娃娃里的小心脏',`<div class="device-large">${heartObject()}<p>你选定的心形方案 · 适配 10–20 cm 及以上娃娃<br>目标架构：BLE + GNSS + 本地轨迹存储</p></div><div id="ble-connection"></div><button class="primary full-width" data-mobile="scan">${icon('bluetooth')}扫描附近的蓝牙设备</button><div id="ble-results"></div><div class="notice-box">扫描会列出真实 BLE 设备。仅连接你认识的设备；建立蓝牙连接不代表已支持糖心轨迹。硬件型号和协议确定后，才能实现离线日志同步。</div><button class="outline-button full-width" style="margin-top:13px" data-mobile="haptic">${icon('heart')}感受手机上的心跳反馈</button>`);activeNativeModal='device';updateBleUI();
};
function updateBleUI() {
  if(activeNativeModal!=='device'||!$('#ble-results'))return;
  const connected=nativeDevice.status==='connected', connecting=nativeDevice.status==='connecting';
  $('#ble-connection').innerHTML=connected||connecting?`<div class="ble-state">${connecting?'正在连接':'BLE 已连接'} · ${escapeHTML(nativeDevice.name||'设备')}<br>${nativeDevice.battery!==undefined?`设备报告电量 ${nativeDevice.battery}% · `:''}轨迹协议尚未接入${connected?`<button class="text-button" style="float:right" data-mobile="disconnect">断开</button>`:''}${nativeDevice.services?.length?`<details class="ble-services"><summary>查看设备公开服务</summary>${nativeDevice.services.map(escapeHTML).join('<br>')}</details>`:''}</div>`:'';
  const button=$('[data-mobile="scan"]');if(button){button.disabled=bleResults.scanning;button.innerHTML=bleResults.scanning?'正在扫描，约 10 秒…':`${icon('bluetooth')}扫描附近的蓝牙设备`;}
  $('#ble-results').innerHTML=`<p class="view-note">${escapeHTML(bleResults.error || (bleResults.scanning?'正在寻找附近的心跳…':bleResults.devices.length?`发现 ${bleResults.devices.length} 个 BLE 设备`:'打开糖心电源后，点击扫描。'))}</p>${bleResults.devices.map(device=>`<button class="device-row" data-mobile="connect" data-device="${escapeHTML(device.id)}">${icon('bluetooth')}<span>${escapeHTML(device.name)}<small>${escapeHTML(device.id)} · 信号 ${device.rssi} dBm</small></span>${icon('arrow')}</button>`).join('')}`;
}

function distanceMeters(points=[]) {
  let meters=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(a.segment!==b.segment)continue;const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad;const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;meters+=6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));}return meters;
}
function routeSVG(track) {
  const points=track.points||[];
  if(!points.length)return `<div class="route-empty">${icon('pin')}<br>${track.status==='recording'?'正在等第一颗位置点…<br>在窗边或室外，通常更容易获得定位。':'还没有位置点。<br>可以先留下文字和照片，或继续记录。'}</div>`;
  const stride=Math.max(1,Math.ceil(points.length/1500)),shown=points.filter((_,i)=>i%stride===0||i===points.length-1),lat0=shown[0].lat;
  const x=shown.map(p=>p.lon*Math.cos(lat0*Math.PI/180)),y=shown.map(p=>-p.lat),xmin=Math.min(...x),xmax=Math.max(...x),ymin=Math.min(...y),ymax=Math.max(...y);
  const scale=Math.min(290/Math.max(xmax-xmin,.0001),170/Math.max(ymax-ymin,.0001)),xoff=(350-(xmax-xmin)*scale)/2,yoff=(230-(ymax-ymin)*scale)/2;
  const coords=shown.map((p,i)=>({x:(x[i]-xmin)*scale+xoff,y:(y[i]-ymin)*scale+yoff,segment:p.segment}));
  const d=coords.map((p,i)=>`${i===0||p.segment!==coords[i-1].segment?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');const first=coords[0],last=coords.at(-1);
  return `<svg viewBox="0 0 350 230" role="img" aria-label="真实采集轨迹的几何示意图"><defs><pattern id="route-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#e0e4d4" stroke-width=".6"/></pattern></defs><rect width="350" height="230" fill="url(#route-grid)"/><path d="${d}" fill="none" stroke="#b98c80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${first.x}" cy="${first.y}" r="6" fill="#8a9c6f" stroke="#fffdf6" stroke-width="3"/><circle cx="${last.x}" cy="${last.y}" r="6" fill="#c08d80" stroke="#fffdf6" stroke-width="3"/></svg>`;
}
function routePanel(track,controls=false) {
  const points=track.points||[];const span=points.length>1?Math.round((points.at(-1).time-points[0].time)/60000):0;
  return `<div class="route-status"><i></i>${trackLabels[track.status]||'已保存的同行'} · 手机定位</div><div class="route-canvas">${routeSVG(track)}<p class="route-caption">路线形状示意 · WGS84 原始坐标 · 不是街道底图</p></div><div class="route-stats"><div><strong>${(distanceMeters(points)/1000).toFixed(2)}</strong><small>估算公里</small></div><div><strong>${points.length}</strong><small>位置点</small></div><div><strong>${span}</strong><small>首末点间隔 / 分钟</small></div></div><p class="view-note">${escapeHTML(track.error||track.quality||'尚无定位样本，不会生成虚构路线。')}</p>${controls?`<div class="modal-actions"><button class="outline-button" data-mobile="${track.status==='recording'?'pause':'resume'}">${track.status==='recording'?'暂停记录':'继续记录'}</button><button class="primary" data-mobile="finish">结束并写回忆</button></div><button class="text-button" style="margin-top:12px" data-mobile="export-route">${icon('download')}导出原始 GPX 路线</button>`:''}`;
}
journey = function() {
  if(!nativeApp)return originalJourney();
  const recorded=state.memories.filter(m=>m.track?.points?.length);
  return `${heading('每一程，都有你','糖心未就绪时，先用手机收藏一起走过的路。',`<button class="primary" data-action="trip">${icon('leaf')}${nativeTrack.id?'当前旅程':'一起出发'}</button>`)}<div id="native-route-panel">${nativeTrack.id?routePanel(nativeTrack,true):`<div class="route-canvas"><div class="route-empty">${icon('map')}<br>还没有进行中的旅程<br>点击「一起出发」，主动开启手机定位。</div></div><p class="notice-box">位置只留在本机。开启通知权限后，可在通知栏查看状态和暂停。手机记录和未来糖心离线记录是两种来源，这里不会混为一谈。</p>`}</div><div class="section-title"><h2>我们走过的路</h2></div>${recorded.map(m=>`<button class="route-history full-width" data-mobile="saved-route" data-memory="${escapeHTML(m.id)}"><div style="text-align:left"><h4>${escapeHTML(m.title)}</h4><p>${escapeHTML(m.date)} · ${m.track.points.length} 个位置点</p></div>${icon('arrow')}</button>`).join('')||'<p class="view-note">完成旅程并保存回忆后，就能在这里重新翻开。</p>'}`;
};
startTrip = function() {
  if(!nativeApp){originalStartTrip();return;}
  if(nativeTrack.id){go('journey');return;}
  modal('带上我，一起出发吧',`<p>这次先由手机记录真实位置。尚未接入糖心的独立 GNSS，所以请带上手机同行。</p><form id="native-trip-form"><label class="form-field">今天想去哪里<input name="place" required maxlength="50" placeholder="例如：河边散步、演唱会"></label><ul class="permission-list"><li>点击开始后申请精确位置权限。</li><li>开启通知权限后可在通知栏暂停，也可随时回到 App 暂停。</li><li>关闭 App、断电或系统限制可能中断记录。</li></ul><label class="privacy-check"><input type="checkbox" required>我同意本次旅程记录手机位置，随时可以结束。</label><button class="primary full-width" style="margin-top:18px" type="submit">${icon('leaf')}开始这段同行</button></form>`);activeNativeModal='trip';
};
async function refreshNative() {
  if(!nativeApp)return;
  try {
    nativeTrack=await requestNative('trackStatus');
    if(nativeTrack.id && state.memories.some(m=>m.track?.id===nativeTrack.id) && nativeTrack.status!=='recording') {await requestNative('trackClear',{tripId:nativeTrack.id});nativeTrack={};}
    if(nativeTrack.id){state.trip={place:nativeTrack.title,started:nativeTrack.started,source:'phone'};}else if(state.trip?.source==='phone'){state.trip=null;}
    if(page==='journey'&&!$('#modal').open){const panel=$('#native-route-panel');if(panel&&nativeTrack.id)panel.innerHTML=routePanel(nativeTrack,true);else render();}
  }catch(error){console.warn('Native refresh:',error.message);}
}
window.xinzaiRefreshNative=refreshNative;
window.xinzaiBack=()=>{if($('#modal').open){closeModal();return true;}if(page!=='home'){go('home');return true;}return false;};
window.xinzaiValidateBackup=incoming=>{
  if(nativeTrack.id)throw Error('先保存进行中的旅程，再导入备份');
  for(const m of incoming.memories){if(m.city!==undefined&&(typeof m.city!=='string'||m.city.length>20))throw Error('城市无效');if(m.mood!==undefined&&(typeof m.mood!=='string'||m.mood.length>20))throw Error('心情无效');if(m.template!==undefined&&!['cream','pink','ticket'].includes(m.template))throw Error('模板无效');if(m.track){const t=m.track;if(typeof t.id!=='string'||t.id.length>100||!Array.isArray(t.points)||t.points.length>50000)throw Error('轨迹无效');for(const p of t.points)if(!Number.isFinite(p.lat)||Math.abs(p.lat)>90||!Number.isFinite(p.lon)||Math.abs(p.lon)>180||!Number.isFinite(p.time)||!Number.isInteger(p.segment))throw Error('坐标无效');}}
};
function gpx(track){const e=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));let xml=`<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="XinZai" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${e(track.title||'我们的同行')}</name>`;let segment=null;for(const point of track.points||[]){if(point.segment!==segment){if(segment!==null)xml+='</trkseg>';xml+='<trkseg>';segment=point.segment;}xml+=`<trkpt lat="${point.lat}" lon="${point.lon}"><time>${new Date(point.time).toISOString()}</time></trkpt>`;}if(segment!==null)xml+='</trkseg>';return xml+'</trk></gpx>';}
async function exportRoute(track){if(!track?.points?.length){toast('还没有位置点可以导出');return;}await downloadBlob(new Blob([gpx(track)],{type:'application/gpx+xml'}),'心仔-同行路线.gpx');toast('路线已导出，文件包含精确坐标，请谨慎分享');}

document.addEventListener('click', async event => {
  const target=event.target.closest('[data-mobile]');if(!target)return;
  try{switch(target.dataset.mobile){
    case'passport':passport();break;case'passport-record':newMemory();break;case'identity':identity();break;
    case'privacy':modal('位置，始终由你决定',`<p>回忆与位置保存在${nativeApp?'手机 App 私有目录':'当前浏览器'}。没有云上传，没有账号追踪。</p><ul class="permission-list"><li>只有主动开始旅程后才记录手机位置。</li><li>暂停后的间隙不会连成一条虚构路线。</li><li>照片卡片不包含原始轨迹坐标。</li><li>GPX 和备份文件可能含精确位置，请自行保管。</li><li>删除回忆会同时删除其附属轨迹；卸载 App 会移除本机数据。</li></ul>${nativeApp?'<button class="outline-button full-width" data-mobile="notifications">开启旅程状态通知</button>':''}<p class="notice-box">暂未接入地图厂商 SDK，因此没有街道底图、地址搜索和坐标转换。轨迹形状直接由采集的 WGS84 点绘制。</p>`);activeNativeModal='privacy';break;
    case'notifications':await requestNative('notificationPermission');toast('通知权限已开启');break;
    case'scan':bleResults={devices:[],scanning:true};updateBleUI();await requestNative('bleScan');break;
    case'connect':await requestNative('bleConnect',{device:target.dataset.device});break;
    case'disconnect':await requestNative('bleDisconnect');break;
    case'haptic':await requestNative('haptic');toast('这是手机的心跳反馈，不是硬件震动');break;
    case'pause':if(trackBusy)break;trackBusy=true;nativeTrack=await requestNative('trackPause');render();toast('已暂停，不再采集新位置');break;
    case'resume':if(trackBusy)break;trackBusy=true;nativeTrack=await requestNative('trackStart',{title:nativeTrack.title,resume:true});render();break;
    case'finish':if(trackBusy)break;trackBusy=true;nativeTrack=await requestNative('trackStop');window.xinzaiPendingTrack=JSON.parse(JSON.stringify(nativeTrack));state.trip={place:nativeTrack.title||'一起出门',source:'phone',started:nativeTrack.started};newMemory(null,true);break;
    case'export-route':await exportRoute(nativeTrack);break;
    case'saved-route':{const m=state.memories.find(m=>m.id===target.dataset.memory);if(!m?.track)break;modal('我们一起走过的路',`${routePanel(m.track)}<button class="primary full-width" data-mobile="export-saved-route" data-memory="${escapeHTML(m.id)}">${icon('download')}导出 GPX 路线</button><p class="view-note">导出文件含精确坐标。此页面不是在线地图。</p>`);activeNativeModal='route';break;}
    case'export-saved-route':await exportRoute(state.memories.find(m=>m.id===target.dataset.memory)?.track);break;
  }}catch(error){if(target.dataset.mobile==='scan'){bleResults.scanning=false;bleResults.error=error.message;updateBleUI();}toast(error.message);}finally{trackBusy=false;}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!['identity-form','native-trip-form'].includes(form.id))return;event.preventDefault();
  const data=new FormData(form);
  if(form.id==='identity-form'){const name=String(data.get('name')).trim();if(!name){toast('名字不能只有空格哦');return;}state.name=name;state.birthday=data.get('birthday');state.personality=data.get('personality');state.onboarded=true;if(save()){closeModal();render();toast('从今天起，一起收集小小的快乐 ♡');}}
  else{const title=String(data.get('place')).trim();if(!title){toast('写下今天想去的地方吧');return;}const submit=form.querySelector('[type="submit"]');submit.disabled=true;try{nativeTrack=await requestNative('trackStart',{title});if(!['recording','starting'].includes(nativeTrack.status))throw Error(nativeTrack.error||'定位未能开始');state.trip={place:title,started:nativeTrack.started,source:'phone'};save();closeModal();go('journey');toast('已开启手机路线记录');}catch(error){toast(error.message);submit.disabled=false;}}
});
window.addEventListener('xinzai-native',event=>{const {type,data}=event.detail;if(type==='bleScan'){bleResults={...bleResults,...data};updateBleUI();}if(type==='bleDevice'){nativeDevice=data;updateBleUI();if(!$('#modal').open)render();}});
window.addEventListener('xinzai-state-saved',()=>{if(nativeApp)setTimeout(refreshNative,100);});
document.addEventListener('click',event=>{if(!nativeApp)return;const action=event.target.closest('[data-action]')?.dataset.action;if(action==='inbox'){event.stopImmediatePropagation();modal(`${doll()}的一封小来信`,`<p>根据当前档案生成的本地陪伴文案，不是在线 AI。</p><div class="letter">${state.personality==='好奇冒险'?'世界那么大，下次想和你发现哪个新地方呢？':state.personality==='安静陪伴'?'不用特意做什么。我就在这里，陪你慢慢过今天。':'普通的一天，也可以有小小的快乐。'}<br><br>${state.memories.length?`我们已经收藏了 ${state.memories.length} 份回忆。<br>想回看的时候，随时翻开就好。`:'第一份共同回忆，什么时候开始都可以。'}<small>陪着你的 ${doll()} ♡</small></div><button class="primary full-width" data-action="close">把这份温柔收好</button>`);}if(action==='restore'&&nativeTrack.id){event.stopImmediatePropagation();toast('请先把当前旅程保存为回忆，再导入备份');}},true);

if(nativeApp){state.connected=false;requestNative('bleStatus').then(value=>{nativeDevice=value;render();}).catch(()=>{});refreshNative();setInterval(()=>{if(!document.hidden)refreshNative();},4000);if(!state.onboarded)setTimeout(()=>identity(true),350);}
render();

/* Opt-in foreground sync. Native session tokens never enter JavaScript or backups. */
(() => {
  const C=SyncCore, native=XinZaiNative.available;let session={connected:false},busy=false,timer,lastError='',initializing=true;
  let browserSession=null;try{browserSession=JSON.parse(sessionStorage.getItem('xinzai-cloud-session')||'null');}catch{}
  function endpoint(value){const u=new URL(value);if((u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error('请填写服务的 HTTPS 地址，不带路径、账号或参数');return u.origin;}
  async function request(action,params={}){
    if(native)return XinZaiNative.request(action,params);
    if(action==='cloudStatus')return browserSession?.expires>Date.now()?{connected:true,endpoint:browserSession.endpoint,account:browserSession.account,expires:browserSession.expires}:{connected:false};
    const login=['cloudLogin','cloudRegister'].includes(action),saved=browserSession;
    if(!login&&!saved)throw Error('请先登录云同步');
    const origin=login?endpoint(params.endpoint):endpoint(saved.endpoint),route=action==='cloudLogin'?'login':action==='cloudRegister'?'register':action==='cloudLogout'?'logout':'library';
    try{
      const response=await fetch(origin+'/api/'+route,{method:action==='cloudPull'?'GET':action==='cloudPush'?'PUT':'POST',headers:{'Content-Type':'application/json',...(!login?{Authorization:'Bearer '+saved.token}:{})},body:action==='cloudPull'?undefined:JSON.stringify(login?{username:params.username,password:params.password,invite:params.invite}:action==='cloudPush'?params:{}),signal:AbortSignal.timeout(45000),redirect:'error',credentials:'omit'});
      const result=await response.json();if(!response.ok)throw Error('HTTP '+response.status+': '+(result.error||'同步请求失败'));
      if(login){browserSession={...result,endpoint:origin};sessionStorage.setItem('xinzai-cloud-session',JSON.stringify(browserSession));return request('cloudStatus');}return result;
    }finally{if(action==='cloudLogout'){browserSession=null;sessionStorage.removeItem('xinzai-cloud-session');}}
  }
  function bound(){return session.connected&&state.cloud?.accountId===session.account?.id&&state.cloud?.endpoint===session.endpoint;}
  function description(){if(busy)return '正在合并回忆与照片…';if(lastError)return lastError;if(!bound())return '尚未连接 · 回忆保存在本机';return (state.cloud.auto?'自动同步已开启':'自动同步已暂停')+(state.cloud.lastSync?' · 上次 '+new Date(state.cloud.lastSync).toLocaleString('zh-CN'):' · 等待首次同步');}
  function status(){document.querySelectorAll('[data-cloud-status]').forEach(el=>el.textContent=description());document.querySelectorAll('[data-cloud="sync"]').forEach(el=>el.disabled=busy);}
  function panel(){
    if(bound())modal('把回忆带到另一部手机',`<div id="cloud-panel"><p><strong>${escapeHTML(session.account.username)}</strong><br><small>${escapeHTML(session.endpoint)}</small></p><p data-cloud-status role="status">${escapeHTML(description())}</p><p>同步这个账号下的所有娃娃、已保存回忆、照片与路线。草稿和未完成的旅程只留在本机。编辑结束后、App 在前台且联网时会尝试同步。</p><button class="primary full-width" data-cloud="sync" ${busy?'disabled':''}>立即同步</button><label class="cloud-consent"><input id="cloud-auto" type="checkbox" ${state.cloud.auto?'checked':''}>联网时自动同步</label><button class="text-button" data-cloud="logout">退出云账号</button><p class="form-note">退出后本机和云端的回忆都会保留。自动同步失败时可以稍后重试。</p></div>`);
    else modal('连接回忆云',`<div id="cloud-panel"><p>先部署心仔同步服务，再在两部手机填写相同地址并登录同一账号。没有服务时，所有功能仍可离线使用。</p><form id="cloud-form"><label class="form-field">服务地址<input name="endpoint" type="url" required placeholder="https://sync.example.com" value="${escapeHTML(state.cloud?.endpoint||'')}" autocomplete="url"></label><label class="form-field">账号<input name="username" required minlength="3" maxlength="80" pattern="[a-zA-Z0-9_.@\-]{3,80}" autocomplete="username" placeholder="字母、数字或邮箱"></label><label class="form-field">密码<input name="password" type="password" required minlength="10" maxlength="128" autocomplete="current-password" placeholder="至少 10 位"></label><label class="cloud-consent"><input id="cloud-register" type="checkbox">第一次使用，注册新账号</label><label class="form-field" id="cloud-invite-field" hidden>注册邀请码<input name="invite" autocomplete="off" maxlength="200"></label><label class="cloud-consent"><input name="consent" type="checkbox" required>同意将本机所有娃娃、已保存回忆、照片和路线位置同步到这个账号。服务运营者可访问这些数据，请使用信任的服务。</label><p class="form-note">登录其他账号也会合并本机回忆。密码和登录凭据不会写入回忆备份。</p><button class="primary full-width" type="submit">连接并同步</button><p id="cloud-login-status" role="status"></p></form></div>`);
  }
  const fingerprint=()=>C.canonical(C.snapshot(state));
  function editable(){return MemoryEditor.busy()||($('#modal').open&&!$('#cloud-panel'));}
  async function synchronize(manual=false){
    if(busy)return;if(!bound()){if(manual)panel();return;}if(editable()){if(manual)toast('请先完成当前编辑，再同步回忆');return;}
    busy=true;lastError='';status();let again=false;
    try{
      for(let attempt=0;attempt<3;attempt++){
        if(!save())throw Error('本机保存失败，未开始同步');
        const mark=fingerprint(),local=JSON.parse(JSON.stringify(C.snapshot(state)));await Album.embedPhotos(local);
        const remote=await request('cloudPull');if(!Number.isSafeInteger(remote.revision)||remote.revision<0)throw Error('云服务返回了无效版本');
        const merged=C.merge(C.validate(local),remote.data===null?null:C.validate(remote.data),state.cloud.base||{});const data=C.snapshot(C.validate(merged.data));
        const records=value=>C.canonical(Object.fromEntries(C.entities(value)));
        try{if(!remote.data||records(data)!==records(C.validate(remote.data)))await request('cloudPush',{revision:remote.revision,data});}catch(error){if(/HTTP 409[:：]/.test(error.message))continue;throw error;}
        // A save or editor opened during network I/O must never be replaced by an older snapshot.
        if(fingerprint()!==mark||editable()){
          // Only advance baselines for the exact local revisions we just uploaded.
          // Advancing remote-only changes here could make an unmerged local copy win later.
          const uploaded={};for(const [key,entry] of C.entities(local)){if(C.entities(data).get(key)?.value.rev===entry.value.rev)uploaded[key]=entry.value.rev;}
          Library.commit(()=>{state.cloud.base={...state.cloud.base,...uploaded};});again=true;if(manual)toast(state.cloud.auto?'本机新修改已保留，编辑结束后会继续同步':'本机新修改已保留，请完成编辑后再点一次同步');return;
        }
        const metadata={...state.cloud,base:C.versions(data),lastSync:Date.now()};
        if(!Library.acceptSync(data,metadata))throw Error('云端已保存，但本机空间不足；请释放空间后再同步');
        render();if($('#modal').open&&$('#cloud-panel'))panel();
        if(manual)toast(merged.conflicts?`同步完成，保留了 ${merged.conflicts} 份冲突副本；可在回忆和回收站查看`:'所有娃娃和回忆已同步');return;
      }
      throw Error('其他设备正在更新，请稍后再同步');
    }catch(error){lastError=error.message||'连接失败，请检查网络和服务地址';if(/HTTP 401[:：]/.test(lastError)){session={connected:false};lastError='登录已过期，请重新连接；本机回忆已保留';}if(manual)toast(lastError);}
    finally{busy=false;status();if(again)schedule();}
  }
  function schedule(){clearTimeout(timer);if(!initializing&&bound()&&state.cloud.auto)timer=setTimeout(()=>{if(!document.hidden)synchronize(false);},8000);}
  const baseRender=render;render=function(focus=false){baseRender(focus);if(page==='profile')$('#view').insertAdjacentHTML('beforeend',`<section class="cloud-card"><div><span class="eyebrow">MEMORY CLOUD</span><h3>让回忆跟着你</h3><p data-cloud-status>${escapeHTML(description())}</p></div><button class="secondary" data-cloud="open">${bound()?'管理同步':'连接云同步'}</button></section>`);};
  document.addEventListener('click',async event=>{const el=event.target.closest('[data-cloud]');if(!el)return;
    if(el.dataset.cloud==='open')panel();if(el.dataset.cloud==='sync')await synchronize(true);
    if(el.dataset.cloud==='logout'){
      if(busy){toast('请等待当前同步完成');return;}el.disabled=true;let revoked=true;try{const result=await request('cloudLogout');if(result.revoked===false)revoked=false;}catch{revoked=false;}
      session={connected:false};lastError='';clearTimeout(timer);Library.commit(()=>{if(state.cloud)state.cloud.auto=false;});render();panel();toast(revoked?'已退出，回忆仍保存在本机':'已清除本机登录；离线时云端凭据最迟 7 天过期');
    }
  });
  document.addEventListener('change',event=>{if(event.target.id==='cloud-register'){const checked=event.target.checked;$('#cloud-invite-field').hidden=!checked;$('#cloud-form [name=invite]').required=checked;$('#cloud-form [name=password]').autocomplete=checked?'new-password':'current-password';}if(event.target.id==='cloud-auto'){if(Library.commit(()=>{state.cloud.auto=event.target.checked;})){schedule();status();}}});
  document.addEventListener('submit',async event=>{if(event.target.id!=='cloud-form')return;event.preventDefault();if(busy)return;const form=event.target,values=Object.fromEntries(new FormData(form));if(!values.consent)return;const button=form.querySelector('button[type=submit]');button.disabled=true;busy=true;$('#cloud-login-status').textContent='正在连接…';
    try{const result=await request($('#cloud-register').checked?'cloudRegister':'cloudLogin',values);if(!result.connected||!result.account?.id)throw Error('服务返回的账号信息无效');session=result;lastError='';const same=bound();if(!Library.commit(()=>{state.cloud={endpoint:result.endpoint,accountId:result.account.id,auto:true,base:same?state.cloud.base||{}:{},lastSync:same?state.cloud.lastSync:0};}))throw Error('本机无法保存同步设置');form.querySelector('[name=password]').value='';busy=false;render();panel();await synchronize(true);}
    catch(error){const message=form.querySelector('#cloud-login-status');if(message)message.textContent=error.message;toast(error.message);}finally{busy=false;button.disabled=false;status();}
  });
  window.addEventListener('xinzai-state-saved',()=>{if(!busy)schedule();});window.addEventListener('online',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  setInterval(()=>{if(bound()&&state.cloud.auto&&!document.hidden)synchronize(false);},60000);
  window.CloudSync={sync:()=>synchronize(true),status:()=>({connected:bound(),busy,message:description()}),open:panel};
  request('cloudStatus').then(result=>{session=result;}).catch(error=>{lastError=error.message;}).finally(()=>{initializing=false;render();schedule();});
})();

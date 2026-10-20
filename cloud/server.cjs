'use strict';
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {promisify}=require('node:util');const {DatabaseSync}=require('node:sqlite');const scrypt=promisify(crypto.scrypt);
const Core=require('../sync-core.js');const MAX=25*1024*1024,SESSION_MS=7*86400000;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>Object.assign(Error(message),{status});
function createServer(options={}){
  const database=options.database||process.env.XINZAI_DATABASE||path.join(__dirname,'data','xinzai.sqlite');
  if(database!==':memory:')fs.mkdirSync(path.dirname(database),{recursive:true});
  const db=new DatabaseSync(database);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS libraries (user_id TEXT PRIMARY KEY REFERENCES users(id), revision INTEGER NOT NULL, document TEXT NOT NULL);');
  const invite=options.invite??process.env.XINZAI_INVITE_CODE??'';
  const trustProxy=options.trustProxy??process.env.XINZAI_TRUST_PROXY==='1';
  const origins=new Set(options.origins||String(process.env.XINZAI_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean));
  const limits=new Map();let authBusy=0;
  function limited(key,max,window=60000){const now=Date.now();if(limits.size>10000)for(const [k,v]of limits)if(v.until<now)limits.delete(k);if(limits.size>20000)throw fail(503,'服务繁忙，请稍后再试');let entry=limits.get(key);if(!entry||entry.until<now){entry={count:0,until:now+window};limits.set(key,entry);}if(++entry.count>max)throw fail(429,'请求过于频繁，请稍后再试');}
  async function body(req,limit=MAX+1024){const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>limit)throw fail(413,'同步内容超过 25 MB，请先整理照片并保留备份');parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw fail(400,'请求格式不正确');}}
  function auth(req){const value=String(req.headers.authorization||'');if(!/^Bearer [a-f0-9]{64}$/.test(value))throw fail(401,'请先登录云同步');const session=db.prepare('SELECT users.id,users.username,sessions.expires FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=?').get(hash(value.slice(7)));if(!session||session.expires<Date.now())throw fail(401,'登录已过期，请重新登录');return session;}
  function session(user){const token=crypto.randomBytes(32).toString('hex'),expires=Date.now()+SESSION_MS;db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token),user.id,expires);return {token,expires,account:{id:user.id,username:user.username}};}
  function respond(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
  const server=http.createServer(async(req,res)=>{
    try{
      const origin=req.headers.origin;if(origin){if(!origins.has(origin))throw fail(403,'此网页来源未获服务端授权');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS');}
      if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
      // TLS is terminated by Caddy in the deployment bundle. Bind to localhost by default.
      const route=new URL(req.url,'http://localhost').pathname,ip=trustProxy?String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',').pop().trim():req.socket.remoteAddress||'unknown';limited('all:'+ip,180);
      if(route==='/health'&&req.method==='GET'){respond(res,200,{ok:true,protocol:1});return;}
      if(['/api/register','/api/login'].includes(route)&&req.method==='POST'){
        limited('auth:'+ip,20,15*60000);const data=await body(req,4096),username=String(data.username||'').trim().toLowerCase();
        if(!/^[a-z0-9_.@-]{3,80}$/.test(username)||typeof data.password!=='string'||data.password.length<10||data.password.length>128)throw fail(400,'账号需为 3-80 位字母、数字或邮箱；密码需为 10-128 位');
        limited('user:'+username,12,15*60000);if(authBusy>=4)throw fail(503,'服务繁忙，请稍后再试');authBusy++;
        try{
          let user=db.prepare('SELECT * FROM users WHERE username=?').get(username);
          if(route==='/api/register'){
            const supplied=typeof data.invite==='string'?data.invite:'';
            if(!invite||!crypto.timingSafeEqual(Buffer.from(hash(invite)),Buffer.from(hash(supplied))))throw fail(403,'注册邀请码无效或注册未开放');
            if(user)throw fail(409,'这个账号已注册，请直接登录');
            const salt=crypto.randomBytes(16).toString('hex'),password=(await scrypt(data.password,salt,64)).toString('hex');user={id:crypto.randomUUID(),username,salt,password};
            try{db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(user.id,username,salt,password);}catch{throw fail(409,'这个账号已注册，请直接登录');}
          }else{
            const derived=await scrypt(data.password,user?.salt||'unknown-account-salt',64),expected=Buffer.from(user?.password||'0'.repeat(128),'hex');
            if(!crypto.timingSafeEqual(derived,expected)||!user)throw fail(401,'账号或密码不正确');
          }
          respond(res,200,session(user));return;
        }finally{authBusy--;}
      }
      const user=auth(req);
      if(route==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(hash(req.headers.authorization.slice(7)));respond(res,200,{ok:true});return;}
      if(route==='/api/library'&&req.method==='GET'){
        const row=db.prepare('SELECT revision,document FROM libraries WHERE user_id=?').get(user.id);respond(res,200,{revision:row?.revision||0,data:row?JSON.parse(row.document):null});return;
      }
      if(route==='/api/library'&&req.method==='PUT'){
        const input=await body(req);if(!Number.isSafeInteger(input.revision)||input.revision<0)throw fail(400,'同步版本无效');
        let clean;try{clean=Core.snapshot(Core.validate(input.data));}catch(error){throw fail(400,error.message);}
        for(const item of Core.entities(clean).values())if(!/^[A-Za-z0-9_-]{1,64}$/.test(item.value.rev||''))throw fail(400,'记录修订号无效');
        const payload=JSON.stringify(clean);if(Buffer.byteLength(payload)>MAX)throw fail(413,'资料库超过 25 MB');
        db.exec('BEGIN IMMEDIATE');try{
          const row=db.prepare('SELECT revision FROM libraries WHERE user_id=?').get(user.id),revision=row?.revision||0;
          if(input.revision!==revision)throw fail(409,'云端刚有更新，请重新合并');
          db.prepare('INSERT INTO libraries VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,document=excluded.document').run(user.id,revision+1,payload);db.exec('COMMIT');respond(res,200,{revision:revision+1});
        }catch(error){db.exec('ROLLBACK');throw error;}return;
      }
      throw fail(404,'接口不存在');
    }catch(error){if(!res.headersSent&&!res.destroyed)respond(res,error.status||500,{error:error.status?error.message:'服务暂时无法完成请求'});}
  });
  server.requestTimeout=120000;server.headersTimeout=15000;server.on('close',()=>db.close());return server;
}
if(require.main===module){const host=process.env.XINZAI_HOST||'127.0.0.1',port=Number(process.env.PORT||8787);createServer().listen(port,host,()=>console.log(`XinZai sync server listening on ${host}:${port}`));}
module.exports={createServer};

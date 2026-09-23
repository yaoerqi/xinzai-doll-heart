const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
  let target;
  try { target = path.resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname.replaceAll('\\','/'))); } catch {res.writeHead(400);res.end();return;}
  if(target!==root && !target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(target===root)target=path.join(root,'index.html');
  fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return}res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data)});
}).listen(4173,'127.0.0.1',()=>console.log('心仔原型：http://127.0.0.1:4173'));

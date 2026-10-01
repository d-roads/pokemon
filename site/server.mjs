import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {api} from './lib/api.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(root,'data'),{recursive:true});
const sqlite=new DatabaseSync(path.join(root,'data','primal-watch.sqlite'));
sqlite.exec(readFileSync(path.join(root,'db/schema.sql'),'utf8'));
sqlite.exec('PRAGMA journal_mode = WAL');
const wrap=sql=>({bind(...values){return statement(sql,values)},...statement(sql,[])});
function statement(sql,values){return {all:async()=>({results:sqlite.prepare(sql).all(...values)}),first:async()=>sqlite.prepare(sql).get(...values)||null,run:async()=>sqlite.prepare(sql).run(...values)};}
const DB={prepare:wrap,batch:async items=>{sqlite.exec('BEGIN');try{const result=[];for(const s of items)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const env={DB,LOCAL_USER_ID:'local-owner',NETWORK_DISABLED:/127\.0\.0\.1:9\b/.test(process.env.HTTPS_PROXY||process.env.HTTP_PROXY||'')};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  const host=req.headers.host;
  if(!['localhost:5173','127.0.0.1:5173'].includes(host)){res.writeHead(400);res.end('Invalid host');return;}
  const url=new URL(req.url,'http://'+host);
  if(url.pathname.startsWith('/api/')){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192){res.writeHead(413);res.end();return;}chunks.push(chunk);}
   const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const result=await api(request,env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;
  }
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
  const file=name==='analysis.mjs'?path.join(root,'lib/analysis.mjs'):path.resolve(root,'public',name);
  if(name!=='analysis.mjs'&&!file.startsWith(path.join(root,'public')+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  if(!existsSync(file)){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(readFileSync(file));
 }catch(e){console.error(e.message);res.writeHead(500);res.end('Something went wrong.');}
});
server.listen(5173,'127.0.0.1',()=>console.log('Primal Watch is ready at http://127.0.0.1:5173'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{sqlite.close();process.exit(0)}));

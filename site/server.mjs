import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {api,readSettings,scanForUser} from './lib/api.mjs';
import {hasEbayKeys} from './lib/alerts.mjs';
import {reportError} from './lib/report.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
// Optional settings (such as SENTRY_DSN for error reporting) can live in a .env file next to this one; it is never committed.
try{process.loadEnvFile(path.join(root,'.env'));}catch{}
mkdirSync(path.join(root,'data'),{recursive:true});
// Your watchlist, buy limits, Dex and alerts live in this file. New tables are only ever added.
const sqlite=new DatabaseSync(path.join(root,'data','primal-watch.sqlite'));
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec(readFileSync(path.join(root,'db/schema.sql'),'utf8'));
const wrap=sql=>({bind(...values){return statement(sql,values)},...statement(sql,[])});
function statement(sql,values){return {all:async()=>({results:sqlite.prepare(sql).all(...values)}),first:async()=>sqlite.prepare(sql).get(...values)||null,run:async()=>sqlite.prepare(sql).run(...values)};}
const DB={prepare:wrap,batch:async items=>{sqlite.exec('BEGIN');try{const result=[];for(const s of items)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const PORT=Number(process.env.PORT||5173);
const HOST=process.env.HOST||'127.0.0.1';
const env={DB,LOCAL_USER_ID:'local-owner',SENTRY_DSN:process.env.SENTRY_DSN,SENTRY_ENV:process.env.SENTRY_ENV,NETWORK_DISABLED:/127\.0\.0\.1:9\b/.test(process.env.HTTPS_PROXY||process.env.HTTP_PROXY||'')};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const SHARED_MODULES=new Set(['analysis.mjs','portfolio.mjs']);
const server=createServer(async(req,res)=>{
 try{
  const host=req.headers.host;
  const allowedHosts=new Set([`localhost:${PORT}`,`127.0.0.1:${PORT}`]);
  const allowedByPort=HOST==='0.0.0.0'&&host?.endsWith(`:${PORT}`);
  if(!allowedHosts.has(host)&&!allowedByPort){res.writeHead(400);res.end('Invalid host');return;}
  const url=new URL(req.url,'http://'+host),gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');
  if(url.pathname.startsWith('/api/')){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192){res.writeHead(413);res.end();return;}chunks.push(chunk);}
   const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const result=await api(request,env),headers=Object.fromEntries(result.headers),body=Buffer.from(await result.arrayBuffer());
   if(gzip&&body.length>2048){headers['Content-Encoding']='gzip';headers['Vary']='Accept-Encoding';res.writeHead(result.status,headers);res.end(gzipSync(body));return;}
   res.writeHead(result.status,headers);res.end(body);return;
  }
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
  const file=SHARED_MODULES.has(name)?path.join(root,'lib',name):path.resolve(root,'public',name);
  if(!SHARED_MODULES.has(name)&&!file.startsWith(path.join(root,'public')+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  if(!existsSync(file)){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(readFileSync(file));
 }catch(e){console.error(e.message);reportError(env,e,{source:'server',route:req.url?.split('?')[0]});res.writeHead(500);res.end('Something went wrong.');}
});
// A crash is reported (briefly waiting for the send) and then the process exits, as Node would do anyway.
process.on('uncaughtException',async e=>{console.error(e);await reportError(env,e,{source:'server',level:'fatal'});process.exit(1);});

// Listing alerts run in the background while the server is open, on the interval chosen in Alerts.
let scanning=false,lastScan=0;
async function scheduledScan(){
 if(scanning||env.NETWORK_DISABLED)return;
 try{
  const settings=await readSettings(DB,env.LOCAL_USER_ID);
  if(!settings.enabled||!hasEbayKeys(settings))return;
  if(Date.now()-lastScan<settings.intervalMinutes*60000)return;
  scanning=true;lastScan=Date.now();
  const r=await scanForUser(env,env.LOCAL_USER_ID);
  console.log(`Alerts: checked ${r.checked} watched cards, ${r.found.length} new listing${r.found.length===1?'':'s'} at or under your limit.`+(r.error?' '+r.error:''));
 }catch(e){console.error('Alerts:',e.message);reportError(env,e,{source:'scan'});}finally{scanning=false;}
}
const timer=setInterval(scheduledScan,60000);setTimeout(scheduledScan,15000);

server.listen(PORT,HOST,()=>console.log(`FutureSight is ready at http://${HOST==='0.0.0.0'?'127.0.0.1':HOST}:${PORT}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(()=>{sqlite.close();process.exit(0)});});

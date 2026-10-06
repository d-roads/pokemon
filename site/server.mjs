import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {api,readSettings,scanForUser} from './lib/api.mjs';
import {hasEbayKeys} from './lib/alerts.mjs';
import {reportError} from './lib/report.mjs';
import {accountStore,seedAdmin,readCookie,sessionCookie,clearCookie,attemptLimiter,usernameProblem,passwordProblem} from './lib/accounts.mjs';
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
// Accounts: everyone on the network signs in; each account has its own watchlist, Dex and alerts.
const accounts=accountStore(sqlite),LEGACY_USER='local-owner';
const seeded=seedAdmin(accounts,process.env.FUTURESIGHT_ADMIN_PASSWORD,LEGACY_USER);
if(seeded)console.log('Created the admin account; it holds the watchlist, Dex and alerts saved before accounts existed.');
const loginLimit=attemptLimiter(),signupLimit=attemptLimiter({max:6,windowMs:3600000});
const PORT=Number(process.env.PORT||5173);
const HOST=process.env.HOST||'127.0.0.1';
const env={DB,SENTRY_DSN:process.env.SENTRY_DSN,SENTRY_ENV:process.env.SENTRY_ENV,FUTURESIGHT_SCORE_MODEL:process.env.FUTURESIGHT_SCORE_MODEL,NETWORK_DISABLED:/127\.0\.0\.1:9\b/.test(process.env.HTTPS_PROXY||process.env.HTTP_PROXY||'')};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const SHARED_MODULES=new Set(['analysis.mjs','portfolio.mjs','investment-costs.mjs']);
const PAGE_HEADERS={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Cache-Control':'no-store'};
function sendJson(res,status,body,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(body));}
const clientAddress=req=>req.socket.remoteAddress||'unknown';
async function auth(req,res,url,raw,token,user){
 const route=url.pathname.slice('/api/auth/'.length);
 if(route==='me'&&req.method==='GET'){if(!user)return sendJson(res,401,{error:'Not signed in.',signedOut:true});return sendJson(res,200,{user:{username:user.username}});}
 if(req.method!=='POST')return sendJson(res,405,{error:'Unsupported request.'});
 // Sign-in forms must be posted from this site's own page.
 if(req.headers.origin!==url.origin)return sendJson(res,403,{error:'Sign in from the FutureSight page.'});
 if(route==='logout'){accounts.endSession(token);return sendJson(res,200,{ok:true},{'Set-Cookie':clearCookie()});}
 if(!/^application\/json\b/.test(req.headers['content-type']||''))return sendJson(res,415,{error:'Unsupported request.'});
 let body;try{body=JSON.parse(raw.toString('utf8'));}catch{return sendJson(res,400,{error:'The request was invalid.'});}
 if(!body||typeof body!=='object')return sendJson(res,400,{error:'The request was invalid.'});
 const ip=clientAddress(req);
 if(route==='login'){
  const wait=loginLimit.blocked(ip);if(wait)return sendJson(res,429,{error:`Too many sign-in attempts. Try again in ${Math.ceil(wait/60)} minute${wait>60?'s':''}.`});
  const account=accounts.authenticate(body.username,body.password);
  if(!account){loginLimit.fail(ip);return sendJson(res,401,{error:'That username and password do not match.'});}
  loginLimit.clear(ip);
  return sendJson(res,200,{user:{username:account.username}},{'Set-Cookie':sessionCookie(accounts.startSession(account.id))});
 }
 if(route==='signup'){
  const wait=signupLimit.blocked(ip);if(wait)return sendJson(res,429,{error:'Too many new accounts from this device. Try again later.'});
  const problem=usernameProblem(body.username)||passwordProblem(body.password,body.repeat);if(problem)return sendJson(res,400,{error:problem});
  const r=accounts.create(body.username,body.password);
  if(r.error)return sendJson(res,r.status||400,{error:r.error});
  signupLimit.fail(ip);
  console.log(`New account: ${r.account.username}`);
  return sendJson(res,201,{user:{username:r.account.username}},{'Set-Cookie':sessionCookie(accounts.startSession(r.account.id))});
 }
 return sendJson(res,404,{error:'Not found.'});
}
const server=createServer(async(req,res)=>{
 try{
  const host=req.headers.host;
  const allowedHosts=new Set([`localhost:${PORT}`,`127.0.0.1:${PORT}`]);
  const allowedByPort=HOST==='0.0.0.0'&&host?.endsWith(`:${PORT}`);
  if(!allowedHosts.has(host)&&!allowedByPort){res.writeHead(400);res.end('Invalid host');return;}
  const url=new URL(req.url,'http://'+host),gzip=/\bgzip\b/.test(req.headers['accept-encoding']||'');
  const token=readCookie(req.headers.cookie),user=token?accounts.sessionUser(token):null;
  if(url.pathname.startsWith('/api/')){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8192){res.writeHead(413);res.end();return;}chunks.push(chunk);}
   if(url.pathname.startsWith('/api/auth/')){await auth(req,res,url,Buffer.concat(chunks),token,user);return;}
   if(!user){sendJson(res,401,{error:'Sign in to use FutureSight.',signedOut:true});return;}
   // The account's storage key stands in for the single local user the API was written for.
   const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const result=await api(request,{...env,LOCAL_USER_ID:user.user_key}),headers=Object.fromEntries(result.headers),body=Buffer.from(await result.arrayBuffer());
   if(gzip&&body.length>2048){headers['Content-Encoding']='gzip';headers['Vary']='Accept-Encoding';res.writeHead(result.status,headers);res.end(gzipSync(body));return;}
   res.writeHead(result.status,headers);res.end(body);return;
  }
  // The landing page is shown until someone signs in.
  if(['/','/index.html','/login'].includes(url.pathname)){
   if(url.pathname==='/login'&&user){res.writeHead(303,{Location:'/'});res.end();return;}
   res.writeHead(200,{'Content-Type':types['.html'],...PAGE_HEADERS});res.end(readFileSync(path.join(root,'public',user&&url.pathname!=='/login'?'index.html':'login.html')));return;
  }
  const name=url.pathname.slice(1);
  const file=SHARED_MODULES.has(name)?path.join(root,'lib',name):path.resolve(root,'public',name);
  if(!SHARED_MODULES.has(name)&&!file.startsWith(path.join(root,'public')+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  if(!existsSync(file)){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(readFileSync(file));
 }catch(e){console.error(e.message);reportError(env,e,{source:'server',route:req.url?.split('?')[0]});res.writeHead(500);res.end('Something went wrong.');}
});
// A crash is reported (briefly waiting for the send) and then the process exits, as Node would do anyway.
process.on('uncaughtException',async e=>{console.error(e);await reportError(env,e,{source:'server',level:'fatal'});process.exit(1);});

// Listing alerts run in the background while the server is open, on the interval chosen in Alerts.
let scanning=false;const lastScan=new Map();
async function scheduledScan(){
 if(scanning||env.NETWORK_DISABLED)return;
 try{
  scanning=true;
  for(const user of accounts.userKeys()){
   const settings=await readSettings(DB,user);
   if(!settings.enabled||!hasEbayKeys(settings))continue;
   if(Date.now()-(lastScan.get(user)||0)<settings.intervalMinutes*60000)continue;
   lastScan.set(user,Date.now());
   const r=await scanForUser(env,user);
   console.log(`Alerts (${user}): checked ${r.checked} watched cards, ${r.found.length} new listing${r.found.length===1?'':'s'} at or under the limit.`+(r.error?' '+r.error:''));
  }
 }catch(e){console.error('Alerts:',e.message);reportError(env,e,{source:'scan'});}finally{scanning=false;}
}
const timer=setInterval(scheduledScan,60000);setTimeout(scheduledScan,15000);

server.listen(PORT,HOST,()=>console.log(`FutureSight is ready at http://${HOST==='0.0.0.0'?'127.0.0.1':HOST}:${PORT}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(()=>{sqlite.close();process.exit(0)});});

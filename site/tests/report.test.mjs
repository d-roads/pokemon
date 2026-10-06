import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {api} from '../lib/api.mjs';
import {isPlainObject,oneOf,optionalPrice,boundedText,optionalText,shapeError} from '../lib/schema.mjs';
import {parseDsn,stackFrames,buildEvent,reportError,resetReportLimits} from '../lib/report.mjs';

const DSN='https://abc123publickey@o111.ingest.us.sentry.io/222';
const sql=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
function dbAdapter(sqlite){const stmt=(query,values=[])=>({bind(...v){return stmt(query,v)},all:async()=>({results:sqlite.prepare(query).all(...values)}),first:async()=>sqlite.prepare(query).get(...values)||null,run:async()=>sqlite.prepare(query).run(...values)});return {prepare:stmt,batch:async items=>Promise.all(items.map(i=>i.run()))};}
const sqlite=new DatabaseSync(':memory:');sqlite.exec(sql);const DB=dbAdapter(sqlite);
const req=(path,method='GET',raw)=>new Request('https://primal.test'+path,{method,headers:{'oai-authenticated-user-id':'collector-a',Origin:'https://primal.test','Content-Type':'application/json'},...(raw!==undefined?{body:raw}:{})});
// A fake Sentry that records what would have been sent.
const sink=()=>{const sent=[];return {sent,fetch:async(url,init)=>{sent.push({url:String(url),init});return {ok:true};}};};
const events=sent=>sent.map(s=>JSON.parse(s.init.body.split('\n')[2]));

test('Shape checker returns the first failing message and rejects non-objects',()=>{
 const rules=[['grade',oneOf('raw','psa9'),'Bad grade.'],['target',optionalPrice(100),'Bad target.']];
 assert.equal(shapeError({grade:'raw'},rules),null);
 assert.equal(shapeError({grade:'raw',target:50},rules),null);
 assert.equal(shapeError({grade:'cgc'},rules),'Bad grade.');
 assert.equal(shapeError({grade:'raw',target:0},rules),'Bad target.');
 assert.equal(shapeError({grade:'raw',target:101},rules),'Bad target.');
 assert.equal(shapeError({grade:'raw',target:'5'},rules),'Bad target.');
 for(const body of [null,[],'text',7,undefined])assert.equal(shapeError(body,rules,'Nope.'),'Nope.');
 assert.ok(isPlainObject({})&&!isPlainObject([])&&!isPlainObject(null));
 assert.ok(boundedText(1,5)('abc')&&!boundedText(1,5)('')&&!boundedText(1,5)('abcdef')&&!boundedText(1,5)(3));
 assert.ok(optionalText(5)(undefined)&&optionalText(5)('abc')&&!optionalText(5)('abcdef'));
});

test('DSN parsing accepts a Sentry address and rejects anything else',()=>{
 assert.deepEqual(parseDsn(DSN),{key:'abc123publickey',host:'o111.ingest.us.sentry.io',project:'222'});
 for(const bad of [undefined,'',' ','not a url','http://key@host.test/1','https://host.test/1','https://key@host.test/abc'])assert.equal(parseDsn(bad),null);
});

test('Stack frames keep only file names, oldest first, in Chrome and Firefox formats',()=>{
 const frames=stackFrames('Error: x\n    at run (C:\\Users\\someone\\Desktop\\site\\lib\\api.mjs:10:5)\n    at file:///home/me/site/server.mjs:3:9');
 assert.deepEqual(frames,[{function:'?',filename:'server.mjs',lineno:3,colno:9},{function:'run',filename:'api.mjs',lineno:10,colno:5}]);
 assert.deepEqual(stackFrames('go@http://localhost:5173/app.js?v=2:7:3'),[{function:'go',filename:'app.js',lineno:7,colno:3}]);
 assert.deepEqual(stackFrames(undefined),[]);
});

test('Events strip query strings from links and never carry request data',()=>{
 const event=buildEvent(new Error('Fetch failed for https://api.example.test/search?q=1&token=SECRET and more'),{source:'api',route:'/api/market'},{LOCAL_USER_ID:'x'});
 const text=JSON.stringify(event);
 assert.ok(!text.includes('SECRET')&&!text.includes('token='));
 assert.match(event.exception.values[0].value,/https:\/\/api\.example\.test and more/);
 assert.equal(event.environment,'local');assert.equal(event.tags.source,'api');assert.equal(event.tags.route,'/api/market');
});

test('Reporting posts a valid envelope to the project, and only when configured',async()=>{
 resetReportLimits();const s=sink();
 assert.equal(await reportError({fetch:s.fetch},new Error('no dsn')),false);
 assert.equal(await reportError({fetch:s.fetch,SENTRY_DSN:DSN,NETWORK_DISABLED:true},new Error('offline')),false);
 assert.equal(s.sent.length,0);
 assert.equal(await reportError({fetch:s.fetch,SENTRY_DSN:DSN},new Error('boom')),true);
 assert.equal(s.sent.length,1);
 const {url,init}=s.sent[0];
 assert.equal(url,'https://o111.ingest.us.sentry.io/api/222/envelope/?sentry_key=abc123publickey&sentry_version=7');
 const lines=init.body.split('\n');assert.equal(lines.length,3);
 assert.equal(JSON.parse(lines[0]).dsn,DSN);assert.equal(JSON.parse(lines[1]).type,'event');
 const event=JSON.parse(lines[2]);assert.equal(event.exception.values[0].value,'boom');assert.match(event.event_id,/^[0-9a-f]{32}$/);
});

test('Repeats within a minute are skipped and sending problems never throw',async()=>{
 resetReportLimits();const s=sink();const env={fetch:s.fetch,SENTRY_DSN:DSN};
 assert.equal(await reportError(env,new Error('same')),true);
 assert.equal(await reportError(env,new Error('same')),false);
 assert.equal(await reportError(env,new Error('different')),true);
 assert.equal(s.sent.length,2);
 resetReportLimits();
 assert.equal(await reportError({SENTRY_DSN:DSN,fetch:async()=>{throw new Error('network down');}},new Error('x')),false);
 assert.equal(await reportError({SENTRY_DSN:DSN,fetch:async()=>({ok:false})},new Error('y')),false);
});

test('The hourly cap stops a crash loop from using the quota',async()=>{
 resetReportLimits();const s=sink();const env={fetch:s.fetch,SENTRY_DSN:DSN};
 for(let i=0;i<40;i++)await reportError(env,new Error('unique '+i));
 assert.equal(s.sent.length,30);
});

test('Browser crash reports are validated and forwarded without extra data',async()=>{
 resetReportLimits();const s=sink();const env={DB,NETWORK_DISABLED:false,SENTRY_DSN:DSN,fetch:s.fetch};
 const good=await api(req('/api/report','POST',JSON.stringify({message:'x is not a function',stack:'TypeError: x\n    at go (http://localhost:5173/app.js:5:2)'})),env);
 assert.equal(good.status,200);assert.deepEqual(await good.json(),{ok:true,sent:true});
 const [event]=events(s.sent);assert.equal(event.tags.source,'browser');assert.equal(event.exception.values[0].type,'BrowserError');assert.equal(event.exception.values[0].stacktrace.frames[0].filename,'app.js');
 for(const body of [JSON.stringify({}),JSON.stringify({message:''}),JSON.stringify({message:'a'.repeat(501)}),JSON.stringify({message:'ok',stack:'s'.repeat(4001)}),'null','[]','not json'])assert.equal((await api(req('/api/report','POST',body),env)).status,400);
 const quiet=await api(req('/api/report','POST',JSON.stringify({message:'fine'})),{DB});assert.deepEqual(await quiet.json(),{ok:true,sent:false});
});

test('A server failure is reported with its route, and the page still gets the usual 503',async()=>{
 resetReportLimits();const s=sink();const pending=[];
 const env={DB:{prepare(){throw new Error('database exploded');}},SENTRY_DSN:DSN,fetch:s.fetch};
 const r=await api(req('/api/watchlist'),env,{waitUntil:p=>pending.push(p)});
 assert.equal(r.status,503);assert.match((await r.json()).error,/temporarily unavailable/);
 await Promise.all(pending);
 const [event]=events(s.sent);assert.equal(event.tags.source,'api');assert.equal(event.tags.route,'/api/watchlist');assert.equal(event.exception.values[0].value,'database exploded');
});

test('Non-object JSON bodies are rejected with 400 instead of crashing',async()=>{
 const env={DB,NETWORK_DISABLED:true};
 for(const [path,method] of [['/api/watchlist','POST'],['/api/watchlist','DELETE'],['/api/collection','POST'],['/api/collection','PUT'],['/api/collection','DELETE'],['/api/alerts','PATCH'],['/api/alerts/settings','POST']])
  for(const raw of ['null','[]','7','"text"'])assert.equal((await api(req(path,method,raw),env)).status,400,`${method} ${path} ${raw}`);
});

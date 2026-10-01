import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {api} from '../lib/api.mjs';
import {snapshots} from '../data/market.mjs';
const sql=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
function dbAdapter(sqlite){const stmt=(query,values=[])=>({bind(...v){return stmt(query,v)},all:async()=>({results:sqlite.prepare(query).all(...values)}),first:async()=>sqlite.prepare(query).get(...values)||null,run:async()=>sqlite.prepare(query).run(...values)});return {prepare:stmt,batch:async items=>Promise.all(items.map(i=>i.run()))};}
const sqlite=new DatabaseSync(':memory:');sqlite.exec(sql);const DB=dbAdapter(sqlite);
const env={DB,NETWORK_DISABLED:true};
const req=(path,method='GET',body,user='collector-a',origin='https://primal.test')=>new Request('https://primal.test'+path,{method,headers:{...(user?{'oai-authenticated-user-id':user}:{}),Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('API returns all sets and separates source coverage',async()=>{const r=await api(req('/api/catalog'),env);assert.equal(r.status,200);const data=await r.json();assert.equal(data.cards.length,1831);assert.equal(data.sets.length,14);assert.equal(Object.keys(data.markets).length,Object.keys(snapshots).length);});
test('Watchlist survives repeated writes, scopes ownership, and supports removal',async()=>{
 const item={card_id:'xy5-147',grade:'psa9',target:215};
 for(let i=0;i<2;i++)assert.equal((await api(req('/api/watchlist','POST',item),env)).status,200);
 const a=await (await api(req('/api/watchlist'),env)).json();assert.equal(a.watchlist.length,1);assert.equal(a.watchlist[0].target,215);
 const b=await (await api(req('/api/watchlist','GET',null,'collector-b'),env)).json();assert.equal(b.watchlist.length,0);
 await api(req('/api/watchlist','DELETE',item),env);const cleared=await (await api(req('/api/watchlist'),env)).json();assert.equal(cleared.watchlist.length,0);
});
test('Invalid cards, grades, targets and cross-origin writes are rejected',async()=>{
 const base={card_id:'xy5-147',grade:'psa9',target:215};
 for(const item of [{...base,card_id:'sm1-1'},{...base,grade:'cgc9'},{...base,target:-1}])assert.equal((await api(req('/api/watchlist','POST',item),env)).status,400);
 assert.equal((await api(req('/api/watchlist','POST',base,'collector-a','https://elsewhere.test'),env)).status,403);
 assert.equal((await api(req('/api/watchlist','POST',base,null),env)).status,401);
});
test('Blocked refresh preserves the saved date and exposes no fake live status',async()=>{
 const r=await api(req('/api/market?id=xy5-147&refresh=1'),env);assert.equal(r.status,200);const data=await r.json();assert.equal(data.refreshed,false);assert.equal(data.market.observedAt,snapshots['xy5-147'].observedAt);assert.match(data.warning,/unavailable/);
});
test('SQLite watchlist remains after closing and reopening the database',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'primal-watch-test-'));const filename=join(directory,'saved.sqlite');
 let disk=new DatabaseSync(filename);disk.exec(sql);
 await api(req('/api/watchlist','POST',{card_id:'xy5-55',grade:'psa9',target:150}),{DB:dbAdapter(disk)});disk.close();
 disk=new DatabaseSync(filename);const r=await api(req('/api/watchlist'),{DB:dbAdapter(disk)});assert.equal((await r.json()).watchlist[0].target,150);disk.close();
});
test('One shared watchlist keeps identical numbers in different sets separate',async()=>{
 const items=[{card_id:'xy1-55',grade:'psa9',target:25},{card_id:'xy5-55',grade:'psa9',target:150},{card_id:'g1-RC5',grade:'raw',target:30}];
 for(const item of items)assert.equal((await api(req('/api/watchlist','POST',item,'cross-set-user'),env)).status,200);
 const result=await(await api(req('/api/watchlist','GET',null,'cross-set-user'),env)).json();assert.equal(result.watchlist.length,3);
 for(const item of items)assert.equal(result.watchlist.find(w=>w.card_id===item.card_id).target,item.target);
});
test('Market cache preserves full set IDs and never merges matching numbers',async()=>{
 for(const [id,raw] of [['xy1-55',11],['xy5-55',222]])sqlite.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?)').run(id,JSON.stringify({guide:{raw},sales:[],observedAt:'2099-10-01T00:00:00Z'}),'2099-10-01T00:00:00Z');
 const data=await(await api(req('/api/catalog'),env)).json();assert.equal(data.markets['xy1-55'].guide.raw,11);assert.equal(data.markets['xy5-55'].guide.raw,222);
 sqlite.prepare('DELETE FROM market_cache').run();
 assert.equal((await api(req('/api/refresh?set=invalid','POST'),env)).status,400);
 const r=await(await api(req('/api/refresh?set=g1','POST'),env)).json();assert.equal(r.refreshed,false);assert.equal(sqlite.prepare('SELECT count(*) AS count FROM market_cache').get().count,0);
});
test('Sales refresh is scoped to rares and reports blocked access without writes',async()=>{const before=sqlite.prepare('SELECT count(*) AS count FROM market_cache').get().count;const r=await api(req('/api/research?set=all','POST'),env),body=await r.json();assert.equal(body.total,894);assert.equal(body.refreshed,false);assert.equal(body.attempted,0);assert.equal(sqlite.prepare('SELECT count(*) AS count FROM market_cache').get().count,before);assert.equal((await api(req('/api/research?set=invalid','POST'),env)).status,400);});

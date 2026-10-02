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
test('API returns all sets and separates source coverage',async()=>{const r=await api(req('/api/catalog'),env);assert.equal(r.status,200);const data=await r.json();assert.equal(data.cards.length,3167);assert.equal(data.sets.length,26);assert.deepEqual(data.series.map(s=>s.id),['XY','BW']);assert.ok(Array.isArray(data.markets['xy5-147'].s));assert.equal(Object.keys(data.markets).length,Object.keys(snapshots).length);});
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
test('Sales refresh is scoped to rares and reports blocked access without writes',async()=>{const before=sqlite.prepare('SELECT count(*) AS count FROM market_cache').get().count;const r=await api(req('/api/research?set=all','POST'),env),body=await r.json();assert.equal(body.total,1447);assert.equal((await(await api(req('/api/research?set=era:XY','POST'),env)).json()).total,894);assert.equal((await(await api(req('/api/research?set=era:BW','POST'),env)).json()).total,553);assert.equal(body.refreshed,false);assert.equal(body.attempted,0);assert.equal(sqlite.prepare('SELECT count(*) AS count FROM market_cache').get().count,before);assert.equal((await api(req('/api/research?set=invalid','POST'),env)).status,400);});

test('Market detail returns the full record with history and titled sales',async()=>{const data=await(await api(req('/api/market?id=xy5-151'),env)).json();assert.equal(data.refreshed,false);assert.ok(data.market.sales.some(s=>s.title&&s.grade==='psa9'));assert.ok(data.market.history?.psa10?.length>12);assert.equal(data.market.research.status,'full');});
test('Dex entries are validated, scoped to their owner, and editable',async()=>{
 const add=b=>api(req('/api/collection','POST',b,'dex-user'),env);
 for(const bad of [{card_id:'nope',grade:'psa9'},{card_id:'xy5-151',grade:'bgs9'},{card_id:'xy5-151',grade:'psa9',quantity:0},{card_id:'xy5-151',grade:'psa9',purchase_price:-5},{card_id:'xy5-151',grade:'psa9',purchase_date:'2009-12-31'},{card_id:'xy5-151',grade:'psa9',purchase_date:'2999-01-01'}])assert.equal((await add(bad)).status,400);
 let r=await(await add({card_id:'xy5-151',grade:'psa9',quantity:2,purchase_price:1500,purchase_date:'2025-06-01',notes:'cert 123'})).json();
 assert.equal(r.collection.length,1);assert.equal(r.collection[0].quantity,2);assert.ok(r.markets['xy5-151'].history);
 const id=r.collection[0].id;
 assert.equal((await(await api(req('/api/collection','GET',null,'someone-else'),env)).json()).collection.length,0);
 assert.equal((await api(req('/api/collection','PUT',{id,card_id:'xy5-151',grade:'psa9',quantity:1,purchase_price:1400},'someone-else'),env)).status,404);
 r=await(await api(req('/api/collection','PUT',{id,card_id:'xy5-151',grade:'psa10',quantity:1,purchase_price:3000,purchase_date:'2025-06-01'},'dex-user'),env)).json();assert.equal(r.collection[0].grade,'psa10');assert.equal(r.collection[0].purchase_price,3000);
 r=await(await api(req('/api/collection','DELETE',{id},'dex-user'),env)).json();assert.equal(r.collection.length,0);
});
test('Alert settings keep secrets server-side and validate notification targets',async()=>{
 const post=b=>api(req('/api/alerts/settings','POST',b,'alert-user'),env);
 assert.equal((await post({enabled:true})).status,400);
 assert.equal((await post({notify:{discord:'https://example.com/hook'}})).status,400);
 let r=await(await post({ebay:{clientId:'Collector-PrimalWa-PRD-abc123',clientSecret:'PRD-secret-value'},enabled:true,intervalMinutes:15,notify:{ntfy:'primal-watch-test'}})).json();
 assert.equal(r.settings.ebay.configured,true);assert.equal(r.settings.enabled,true);assert.ok(!JSON.stringify(r).includes('PRD-secret-value'));assert.ok(!JSON.stringify(r).includes('abc123')||r.settings.ebay.clientId.includes('…'));
 r=await(await post({ebay:{clientId:'Collector-PrimalWa-PRD-abc123'},intervalMinutes:60})).json();assert.equal(r.settings.ebay.hasSecret,true);assert.equal(r.settings.intervalMinutes,60);
 const list=await(await api(req('/api/alerts','GET',null,'alert-user'),env)).json();assert.equal(list.alerts.length,0);assert.equal(list.live,true);
 const scan=await(await api(req('/api/alerts/scan','POST',{},'alert-user'),env)).json();assert.match(scan.error,/unavailable/);
});

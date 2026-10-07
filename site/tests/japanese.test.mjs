// Japanese cards, task 1: catalog, links to English cards, and the guards that keep them unpriced
// until their PriceCharting products are verified (task 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {api} from '../lib/api.mjs';
import {parseMarket,parseSet} from '../lib/provider.mjs';
import {runScan,resetTokenCache} from '../lib/alerts.mjs';
import {cards,sets} from '../data/catalog.mjs';
import japanese from '../data/japanese-catalogs.json' with {type:'json'};
const sql=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
function dbAdapter(sqlite){const stmt=(query,values=[])=>({bind(...v){return stmt(query,v)},all:async()=>({results:sqlite.prepare(query).all(...values)}),first:async()=>sqlite.prepare(query).get(...values)||null,run:async()=>sqlite.prepare(query).run(...values)});return {prepare:stmt,batch:async items=>{const out=[];for(const s of items)out.push(await s.run());return out;}};}
const sqlite=new DatabaseSync(':memory:');sqlite.exec(sql);const DB=dbAdapter(sqlite);
const req=(path,method='GET')=>new Request('https://primal.test'+path,{method,headers:{'oai-authenticated-user-id':'collector-a',Origin:'https://primal.test','Content-Type':'application/json'}});
const byId=new Map(cards.map(c=>[c.id,c]));
const ja=cards.filter(c=>c.japanese),jaSets=sets.filter(s=>s.lang==='ja');

test('Japanese sets and cards are in the catalog with unique ids, eras and no price source',()=>{
 assert.ok(jaSets.length>=100,'Japanese sets with card lists');
 assert.equal(ja.length,japanese.reduce((n,s)=>n+s.cards.length,0));
 assert.equal(new Set(cards.map(c=>c.id)).size,cards.length,'card ids are unique across languages');
 const eras=new Set(['WOTC','EX','DP','BW','XY','SM','SWSH','SV','ME']);
 for(const c of ja){
  assert.ok(c.id.startsWith('ja-'));assert.equal(c.lang,'ja');assert.ok(eras.has(c.series),c.id);
  assert.equal(c.eligible,true);assert.equal(c.source,null);assert.equal(c.sourceVerified,false);
  assert.ok(c.name&&c.nameJa&&c.numberLabel&&c.image.startsWith('https://assets.tcgdex.net/ja/'),c.id);
 }
 for(const s of jaSets){assert.ok(s.id.startsWith('ja-'));assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(s.release),s.id);assert.ok(s.checklistSource.includes('tcgdex'));}
 // English cards keep their own data; only the cross-reference is added.
 assert.ok(cards.filter(c=>!c.japanese).every(c=>c.lang!=='ja'));
});

test('Links between Japanese and English cards point both ways and to real English cards',()=>{
 const linked=ja.filter(c=>c.englishId);
 assert.ok(linked.length>2500,'most Japanese cards with an English printing are linked');
 for(const c of linked){const e=byId.get(c.englishId);assert.ok(e&&!e.japanese,c.id);assert.ok(e.japaneseIds?.includes(c.id),c.id);}
 for(const e of cards.filter(c=>c.japaneseIds))for(const id of e.japaneseIds)assert.equal(byId.get(id)?.englishId,e.id);
 // Known pairs: same artwork, matching rarity class.
 const pair=(jaId,enId)=>assert.equal(byId.get(jaId)?.englishId,enId,jaId);
 pair('ja-sv2a-201','sv3pt5-199'); // Charizard ex SAR -> Special Illustration Rare
 pair('ja-sv2a-006','sv3pt5-6');   // regular Charizard ex -> regular, not the full art
 pair('ja-pmcg1-011','base1-15');  // Venusaur holo
 // Unlinked cards say why: several candidates or none.
 for(const c of ja.filter(c=>!c.englishId))assert.equal(typeof c.englishCandidates,'number');
});

test('Japanese rarity codes follow each era and names are English where known',()=>{
 assert.equal(byId.get('ja-sv2a-201').rarity,'Special Art Rare (SAR)');
 assert.equal(byId.get('ja-sv2a-201').name,'Charizard ex');assert.equal(byId.get('ja-sv2a-201').nameJa,'リザードンex');
 const sm=ja.filter(c=>c.series==='SM'&&/Hyper Rare \(HR\)/.test(c.rarity)),sv=ja.filter(c=>['SV','ME'].includes(c.series)&&/HR/.test(c.rarity));
 assert.ok(sm.length>0);assert.equal(sv.length,0,'from Scarlet & Violet the gold card is UR, not HR');
 const named=ja.filter(c=>!c.nameIsJapanese).length;assert.ok(named/ja.length>0.75,'most cards carry an English name');
});

test('Japanese cards are never fetched or priced before their product is verified',async()=>{
 const env={DB,NETWORK_DISABLED:false};
 const card=byId.get('ja-sv2a-201');
 assert.throws(()=>parseMarket('<h1>Charizard ex #201</h1>',card),/Japanese prices are not loaded yet/);
 // A set listing row with the same number is ignored for a Japanese card (nothing usable is read).
 assert.throws(()=>parseSet('<tr><td class="title">Charizard ex #201</td><td class="price">$1</td><td class="price">$2</td><td class="price">$3</td></tr>',[card]),/could not be read/);
 const m=await(await api(req('/api/market?id=ja-sv2a-201&refresh=1'),env)).json();
 assert.equal(m.refreshed,false);assert.match(m.warning,/Japanese prices/);
 const set=await(await api(req('/api/refresh?set=ja-sv2a','POST'),env)).json();
 assert.equal(set.refreshed,false);assert.equal(set.count,0);
 const research=await(await api(req('/api/research?set=all','POST'),{DB,NETWORK_DISABLED:true})).json();
 assert.equal(research.total,cards.filter(c=>c.eligible&&!c.japanese).length);
 const catalog=await(await api(req('/api/catalog'),env)).json();
 assert.ok(catalog.cards.some(c=>c.id==='ja-sv2a-201'));assert.equal(catalog.markets['ja-sv2a-201'],undefined);
});

test('Japanese cards can be watched and added to the Dex, but alert scans skip them',async()=>{
 resetTokenCache();
 const s=new DatabaseSync(':memory:');s.exec(sql);const db=dbAdapter(s);
 s.prepare('INSERT INTO watchlist (user_id,card_id,grade,target,created_at) VALUES (?,?,?,?,?)').run('me','ja-sv2a-201','psa10',500,'2026-10-01T00:00:00Z');
 const searched=[];const fetchImpl=async url=>{if(String(url).includes('/oauth2/token'))return new Response(JSON.stringify({access_token:'t',expires_in:7200}),{status:200});searched.push(String(url));return new Response(JSON.stringify({itemSummaries:[]}),{status:200});};
 const r=await runScan({db,user:'me',cards,marketFor:()=>null,settings:{enabled:true,ebay:{clientId:'id',clientSecret:'secret'},notify:{ntfy:'t'}},fetchImpl,notify:async()=>{}});
 assert.equal(r.checked,0);assert.equal(searched.length,0);assert.match(r.skipped[0].reason,/Japanese/);
});

test('Movers, investments and scores stay English-only while Japanese cards have no prices',async()=>{
 const env={DB,NETWORK_DISABLED:true};
 const scores=await(await api(req('/api/scores'),env)).json();
 assert.ok(Object.keys(scores.scores||{}).every(id=>!id.startsWith('ja-')));
 assert.ok(Object.keys(scores.scores).length>1000);
 const movers=await(await api(req('/api/movers?period=month'),env)).json(),moved=Object.values(movers.grades).flatMap(g=>g.movers);
 assert.ok(moved.length>0);assert.ok(moved.every(m=>!m.card_id.startsWith('ja-')));
 const invest=await(await api(req('/api/investments'),env)).json(),picks=Object.values(invest.grades).flatMap(g=>g.picks);
 assert.ok(picks.length>0);assert.ok(picks.every(p=>!p.card_id.startsWith('ja-')));
});

test('Rankings never mix languages: lang=en|ja on movers and investments, scores per language',async()=>{
 const env={DB,NETWORK_DISABLED:true};
 const jm=await(await api(req('/api/movers?period=month&lang=ja'),env)).json();
 assert.equal(jm.lang,'ja');assert.ok(Object.values(jm.grades).every(g=>g.movers.length===0),'no Japanese prices yet, so no Japanese movers');
 const em=await(await api(req('/api/movers?period=month&lang=en'),env)).json(),dm=await(await api(req('/api/movers?period=month'),env)).json();
 assert.equal(em.lang,'en');assert.deepEqual(em.grades,dm.grades,'English is the default');
 const ji=await(await api(req('/api/investments?lang=ja'),env)).json();assert.equal(ji.lang,'ja');assert.ok(Object.values(ji.grades).every(g=>g.picks.length===0));
 assert.equal((await api(req('/api/movers?lang=fr'),env)).status,400);assert.equal((await api(req('/api/investments?lang=fr'),env)).status,400);
 // English scores are exactly what English cards alone produce.
 const {investmentScores}=await import('../lib/score.mjs'),{snapshots}=await import('../data/market.mjs');
 const alone=investmentScores(cards.filter(c=>!c.japanese).map(c=>[c,snapshots[c.id]]));
 const served=(await(await api(req('/api/scores'),env)).json()).scores;
 for(const id of Object.keys(alone.scores).slice(0,200))assert.deepEqual(served[id],alone.scores[id],id);
});

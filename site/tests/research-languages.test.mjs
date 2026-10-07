import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {api,forgetSourceMap} from '../lib/api.mjs';
import {cards} from '../data/catalog.mjs';
import {researchLanguages} from '../lib/investment.mjs';

// Japanese research ranks: off by default, their own pool when FUTURESIGHT_JA_RESEARCH=shadow.
const sql=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
function dbAdapter(sqlite){const stmt=(query,values=[])=>({bind(...v){return stmt(query,v)},all:async()=>({results:sqlite.prepare(query).all(...values)}),first:async()=>sqlite.prepare(query).get(...values)||null,run:async()=>sqlite.prepare(query).run(...values)});return {prepare:stmt,batch:async items=>{sqlite.exec('BEGIN');try{const out=[];for(const s of items)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};}
const req=path=>new Request('https://primal.test'+path,{headers:{'oai-authenticated-user-id':'collector-a'}});

// 30 mapped Japanese cards with 24 completed months of varied PSA 10 guide history ending last month.
function seed(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(sql);
 const now=new Date(),ids=cards.filter(c=>c.setId==='ja-sm12a').slice(0,30).map(c=>c.id),stamp=now.toISOString();
 const months=Array.from({length:24},(_,i)=>{const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-24+i,1));return d.toISOString().slice(0,7);});
 ids.forEach((id,k)=>{
  sqlite.prepare('INSERT INTO source_map (card_id,url,product_id,name,rule,map_version,mapped_at) VALUES (?,?,?,?,?,?,?)').run(id,'https://www.pricecharting.com/game/pokemon-japanese-tag-all-stars/test-'+k,String(9000+k),'Test '+k,'name','test',stamp);
  const history={psa10:months.map((m,i)=>[m,Math.round((60+k*7)*100*(1+((i*(k+3))%11-5)/40))])};
  sqlite.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?)').run(id,JSON.stringify({guide:{psa10:history.psa10.at(-1)[1]/100},history,sales:[],observedAt:stamp,source:'PriceCharting',status:'refreshed',research:{status:'full',checkedAt:stamp}}),stamp);
 });
 return {sqlite,DB:dbAdapter(sqlite),ids};
}

test('The Japanese research switch defaults to off and only accepts shadow',()=>{
 assert.deepEqual(researchLanguages({}),['en']);assert.deepEqual(researchLanguages({FUTURESIGHT_JA_RESEARCH:'off'}),['en']);
 assert.deepEqual(researchLanguages({FUTURESIGHT_JA_RESEARCH:' Shadow '}),['en','ja']);assert.deepEqual(researchLanguages({FUTURESIGHT_JA_RESEARCH:'on'}),['en']);
});

test('Japanese research ranks are hidden by default and form their own pool when switched on',async()=>{
 forgetSourceMap();
 try{
  const {DB,ids}=seed(),env={DB,NETWORK_DISABLED:true};
  const off=await (await api(req('/api/scores'),env)).json();
  assert.deepEqual(off.research.languages,['en']);assert.ok(Object.keys(off.research.ranks).length>1000);
  assert.ok(Object.keys(off.research.ranks).every(id=>!id.startsWith('ja-')));
  const offCard=await (await api(req('/api/market?id='+ids[0]),env)).json();assert.equal(offCard.investment.psa10,null);

  const on={...env,FUTURESIGHT_JA_RESEARCH:'shadow'},s=await (await api(req('/api/scores'),on)).json();
  assert.deepEqual(s.research.languages,['en','ja']);
  const ja=Object.keys(s.research.ranks).filter(id=>id.startsWith('ja-'));assert.ok(ja.length>=25&&ja.every(id=>ids.includes(id)),'ranked '+ja.length);
  // English ranks are unchanged by adding the Japanese pool.
  for(const id of Object.keys(off.research.ranks))assert.deepEqual(s.research.ranks[id],off.research.ranks[id]);
  const card=await (await api(req('/api/market?id='+ja[0]),on)).json(),v=card.investment.psa10;
  assert.ok(v&&v.rank!=null);assert.equal(v.reference.size,ja.filter(id=>s.research.ranks[id][0]!=null).length,'ranked only against Japanese cards');assert.match(v.modelVersion,/\+ja$/);
  const rows=await DB.prepare("SELECT COUNT(*) AS n FROM score_observations WHERE model_version LIKE '%+ja' AND card_id LIKE 'ja-%'").first();assert.ok(rows.n>=ids.length);
  const enRows=await DB.prepare("SELECT COUNT(*) AS n FROM score_observations WHERE model_version LIKE '%+ja' AND card_id NOT LIKE 'ja-%'").first();assert.equal(enRows.n,0);
  // Japanese Investments picks read the same table as the card panel.
  const inv=await (await api(req('/api/investments?lang=ja'),on)).json();
  for(const [g,col] of Object.entries(inv.grades))for(const p of col.picks.slice(0,3)){const c=await (await api(req('/api/market?id='+p.card_id),on)).json();assert.equal(p.research?.rank??null,c.investment[g]?.rank??null);}
 }finally{forgetSourceMap();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {buildSeries,priceAt,seriesReturn,tierOf,cardFacts,buildMetrics,indexDates,indexKeysOf,dayNum,dayStr,METRIC_RULES} from '../lib/metrics.mjs';
import {newPoint,rebuildMetrics} from '../lib/metrics-store.mjs';
import {api} from '../lib/api.mjs';
import {cards} from '../data/catalog.mjs';

const today=dayNum('2026-10-14');
// Monthly history in cents, `months` months ending with the month of `end`, growing by `rate` a month.
const history=(start,rate,months=24,end='2026-10')=>{const [y,m]=end.split('-').map(Number),out=[];for(let k=months-1;k>=0;k--){const d=new Date(Date.UTC(y,m-1-k,1));out.push([d.toISOString().slice(0,7),Math.round(start*Math.pow(1+rate,months-1-k)*100)]);}return out;};

test('A series combines monthly history with daily guide reads, and a price only stands for a limited time',()=>{
 const s=buildSeries([['2026-08',1000],['2026-09',2000],['2026-10',3000]],dayNum('2026-10-07'),[[dayNum('2026-10-10'),35]]);
 assert.deepEqual([...s.d].map(dayStr),['2026-08-31','2026-09-30','2026-10-07','2026-10-10'],'the month in progress is dated the day it was read');
 assert.equal(priceAt(s,dayNum('2026-09-15')),10);
 assert.equal(priceAt(s,dayNum('2026-10-14')),35);
 assert.equal(priceAt(s,dayNum('2026-10-10')+METRIC_RULES.dailyMaxAge+1),null,'a daily read is too old after dailyMaxAge days');
 assert.equal(priceAt(s,dayNum('2026-10-10')+12),35,'later points take over');
 assert.equal(priceAt(s,dayNum('2026-01-01')),null,'nothing before the first point');
});

test('Returns need a new price inside the period and fresh prices at both ends',()=>{
 const s=buildSeries(history(10,.05,14),dayNum('2026-10-07'),[[today-1,30],[today,33]]);
 assert.ok(Math.abs(seriesReturn(s,today,1)-.1)<1e-9,'day over day');
 assert.equal(seriesReturn(s,today+5,1),null,'no read in the last day');
 const r=seriesReturn(s,today,365);assert.ok(r>2,'a year: from last October\'s month-end to today');
 const stale=buildSeries(history(10,.05,14,'2026-06'),dayNum('2026-06-20'));
 assert.equal(seriesReturn(stale,today,30),null,'a card last priced in June has no 30-day return in October');
});

test('Daily prices are saved when they change, or again after the heartbeat',()=>{
 assert.deepEqual(newPoint([],10,5),[10,5]);
 assert.equal(newPoint([[10,5]],11,5),null,'unchanged the next day');
 assert.deepEqual(newPoint([[10,5]],11,6),[11,6]);
 assert.deepEqual(newPoint([[10,5]],10+METRIC_RULES.heartbeat,5),[10+METRIC_RULES.heartbeat,5],'unchanged, but due again');
 assert.deepEqual(newPoint([[10,5]],10,7),[10,7],'a second read the same day replaces it');
 assert.equal(newPoint([[10,5]],9,7),null,'older reads are ignored');
 assert.equal(newPoint([[10,5]],12,0),null);
});

test('Rarity tiers group comparable cards across eras and languages',()=>{
 const tier=(category,rarity)=>tierOf({category,rarity});
 assert.equal(tier('Secret rare','Special Illustration Rare'),'sir');
 assert.equal(tier('Secret rare','Special Art Rare (SAR)'),'sir');
 assert.equal(tier('Secret rare','Illustration Rare'),'ir');
 assert.equal(tier('Secret rare','Art Rare (AR)'),'ir');
 assert.equal(tier('Secret rare','Hyper Rare'),'gold');
 assert.equal(tier('Secret rare','Rare Rainbow'),'rainbow');
 assert.equal(tier('Full art','Rare Ultra'),'full-art');
 assert.equal(tier('Secret rare','Super Rare (SR)'),'full-art');
 assert.equal(tier('Gold Star','Rare Holo Star'),'gold-star');
 assert.equal(tier('Trainer Gallery','Trainer Gallery Rare Holo'),'gallery');
 assert.equal(tier('Pokémon ex','Rare Holo EX'),'ex-era');
 assert.equal(tier('VMAX','Rare Holo VMAX'),'ultra');
 assert.equal(tier('Holo rare','Rare Holo'),'holo');
 assert.equal(tier('Standard','Rare'),'rare');
 const byId=new Map(cards.map(c=>[c.id,c])),zard=byId.get('base1-4');
 const keys=indexKeysOf(zard,byId);
 for(const k of ['en:all:all','en:era:WOTC','en:set:base1','en:tier:holo','en:char:Charizard'])assert.ok(keys.includes(k),k);
 assert.ok(keys.some(k=>k.startsWith('en:artist:')),'an English card takes the illustrator of its verified Japanese printing');
});

test('Indices are chain-linked: a card joining later never moves the level, and weights differ by method',async()=>{
 const base={series:'X',category:'Holo rare',rarity:'Rare Holo',eligible:true,setId:'s1',setName:'Set'};
 const catalog=[{...base,id:'a',name:'Pikachu'},{...base,id:'b',name:'Pikachu'},{...base,id:'c',name:'Mew'},{...base,id:'d',name:'Mew'}];
 // a: $1,000 doubling over the year; b, c: $10 flat; d: appears only this month at $500.
 // Fourteen months: a month's point is dated at its end, so a year ago falls on last September's point.
 const markets={a:{history:{psa10:history(1000,Math.pow(2,1/13)-1,14)}},b:{history:{psa10:history(10,0,14)}},c:{history:{psa10:history(10,0,14)}},d:{history:{psa10:[['2026-10',50000]]}}};
 const facts=new Map(catalog.map(c=>[c.id,cardFacts(c,{...markets[c.id],research:{checkedAt:'2026-10-14T00:00:00Z'}},null,null,today)]));
 const {indexRows,historyRows,cardRows}=await buildMetrics(catalog,facts,today);
 const set=indexRows.find(r=>r.index_id==='en:set:s1'&&r.grade==='psa10');
 assert.ok(Math.abs(set.ret_1y-1.0)<0.05,'value-weighted: the $1,000 card dominates ('+set.ret_1y+')');
 assert.ok(Math.abs(set.eq_ret_1y-(Math.pow(2,1/3)-1))<0.05,'equal-weighted: the typical card ('+set.eq_ret_1y+')');
 assert.equal(set.members,4);assert.equal(set.priced,4);assert.ok(Math.abs(set.value-(2000+10+10+500))<20);
 const levels=historyRows.filter(r=>r[0]==='en:set:s1'&&r[1]==='psa10');
 assert.ok(levels.length>10&&levels[0][3]===100,'starts at 100');
 const pika=indexRows.find(r=>r.index_id==='en:char:Pikachu'&&r.grade==='psa10'),mew=indexRows.find(r=>r.index_id==='en:char:Mew'&&r.grade==='psa10');
 assert.equal(pika,undefined,'two cards are too few for an index');assert.equal(mew,undefined);
 const a=cardRows.find(r=>r.card_id==='a'&&r.grade==='psa10');
 assert.equal(a.premium,null,'three other cards are too few peers for a premium');assert.ok(Math.abs(a.ret_1y-1)<0.05);
 assert.equal(cardRows.find(r=>r.card_id==='d'&&r.grade==='psa10').ret_1y,null,'no history, no yearly return');
 assert.ok(indexDates(today).includes(today-365),'exact one-year date');
});

function adapter(sqlite){
 const stmt=(query,values=[])=>({bind(...v){return stmt(query,v)},all:async()=>({results:sqlite.prepare(query).all(...values)}),first:async()=>sqlite.prepare(query).get(...values)||null,run:async()=>sqlite.prepare(query).run(...values)});
 return {prepare:stmt,batch:async items=>{sqlite.exec('BEGIN');try{const out=[];for(const s of items)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
const req=(path,method='GET',body)=>new Request('https://primal.test'+path,{method,headers:{'oai-authenticated-user-id':'collector-a',Origin:'https://primal.test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});

test('A rebuild saves daily prices, card and index metrics, and the routes serve them',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
 const DB=adapter(sqlite),env={DB,NETWORK_DISABLED:true};
 assert.equal((await api(req('/api/indices?kind=nope'),env)).status,400);
 assert.equal((await api(req('/api/index?id=en:set:base1'),env)).status,404,'no data before the first rebuild');
 // Today's guide read for the four Base Set holo Charizard-era cards, over their bundled snapshots.
 const now=new Date().toISOString(),ids=['base1-2','base1-4','base1-10','base1-15'];
 for(const [i,id] of ids.entries())sqlite.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?)').run(id,JSON.stringify({guide:{raw:100+i,grade9:500+i,psa10:2000+i},guideSources:{psa10:{observedAt:now},raw:{observedAt:now},grade9:{observedAt:now}},sales:[],observedAt:now}),now);
 const {snapshots}=await import('../data/market.mjs');
 const sample=cards.filter(c=>c.eligible&&(c.setId==='base1'||c.setId==='base2'));
 const r=await rebuildMetrics(DB,{cards:sample,snapshots:Object.fromEntries(Object.entries(snapshots).filter(([id])=>sample.some(c=>c.id===id)))});
 assert.ok(r.cards>=ids.length);assert.ok(r.indices>3);
 assert.equal(sqlite.prepare("SELECT price FROM price_points WHERE card_id='base1-4' AND grade='psa10'").get().price,2001);
 const again=await rebuildMetrics(DB,{cards:sample,snapshots:{}});assert.equal(again.points,0,'nothing new to save the second time');
 const metrics=await(await api(req('/api/metrics?id=base1-4'),env)).json();
 assert.equal(metrics.grades.psa10.price,2001);assert.ok(metrics.indices.some(i=>i.id==='en:set:base1'&&i.name==='Base Set'));
 const list=await(await api(req('/api/indices?kind=set&grade=psa10'),env)).json();
 const base=list.rows.find(x=>x.index_id==='en:set:base1');assert.ok(base);assert.equal(base.name,'Base Set');assert.ok(base.priced>=4);
 const detail=await(await api(req('/api/index?id=en:set:base1&grade=psa10'),env)).json();
 assert.ok(detail.history.length>=1);assert.ok(detail.members.some(m=>m.card_id==='base1-4'&&m.price===2001));
 assert.ok(detail.members[0].price>=detail.members.at(-1).price||detail.members.at(-1).price==null,'most valuable first');
 const status=await(await api(req('/api/metrics/rebuild'),env)).json();assert.equal(status.running,false);assert.ok(status.run.finished_at);
 assert.deepEqual(await(await api(req('/api/metrics/rebuild','POST'),env)).json(),{unavailable:true},'rebuilds run only where background jobs can');
 const schedule=await(await api(req('/api/schedule'),env)).json();
 assert.equal(schedule.enabled,false);assert.deepEqual(schedule.tiers.map(t=>t.id),['daily','weekly','monthly']);
 assert.ok(schedule.tiers.reduce((n,t)=>n+t.cards,0)>0);
});

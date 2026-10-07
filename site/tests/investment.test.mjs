import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {cards,sets} from '../data/catalog.mjs';
import {snapshots} from '../data/market.mjs';
import {windowFeatures,percentileRanks,researchTable,salesEvidence,saleDays,saleMonthly,monthIndex,evidenceStatus,RESEARCH_RANK} from '../lib/investment-features.mjs';
import {DEFAULT_COSTS,normalizeCosts,netReturn,maxBuyPrice,saleFee,acquisitionCost,costSummary} from '../lib/investment-costs.mjs';
import {asOfMarket,asOfObservations} from '../lib/as-of.mjs';
import {observationRows,recordObservations,contentHash} from '../lib/observations.mjs';
import {fitHuberRidge,fitTransforms,scaled,modelForecast,designRow} from '../lib/investment-model.mjs';
import {investmentTable,investmentView,scoreMode,archiveRows,MODEL_ARTIFACT} from '../lib/investment.mjs';
import {analyze} from '../lib/analysis.mjs';

const NOW=Date.parse('2026-10-06T20:00:00Z');
const release=Object.fromEntries(sets.map(s=>[s.id,s.release]));
const series=values=>new Map(values.map((v,i)=>[100+i,v]));
const card={id:'t-1',eligible:true,setId:'xy5',series:'XY',name:'Test',number:1};

test('Features need 13 consecutive completed months and never forward-fill gaps',()=>{
 const full=series([30,31,32,33,34,35,36,37,38,39,40,41,30]);
 const f=windowFeatures(full,112);
 assert.ok(Math.abs(f.V-Math.log(35/30))<1e-12);assert.ok(Math.abs(f.M-Math.log(41/30))<1e-12);assert.ok(f.Q<0);
 const gap=new Map(full);gap.delete(105);assert.equal(windowFeatures(gap,112).reason,'history-gap');
 assert.equal(windowFeatures(series(Array(13).fill(40)),112).reason,'flat-history');
 assert.equal(windowFeatures(series([10,11,12,13,14,15,16,17,18,19,20,21,22]),112).reason,'below-floor');
 // Monthly sale medians keep missing months missing.
 const days=saleDays([{grade:'psa10',price:100,date:'2026-01-05',id:'a'},{grade:'psa10',price:100,date:'2026-01-05',id:'a'},{grade:'psa10',price:140,date:'2026-03-02',id:'b'}],'psa10','2026-10-06');
 assert.equal(days.length,2);const m=saleMonthly(days,monthIndex('2026-10'));assert.equal(m.size,2);assert.equal(m.get(monthIndex('2026-02')),undefined);
});

test('Percentile ranks average ties and stay within 0–1',()=>{
 const rows=[{x:1},{x:2},{x:2},{x:5}];percentileRanks(rows,'x','p');
 assert.deepEqual(rows.map(r=>r.p),[0,0.5,0.5,1]);
 assert.equal(percentileRanks([{x:3}],'x','p')[0].p,0);
});

test('Three identical sales cannot create supported evidence',()=>{
 const sales=['2026-09-30','2026-09-20','2026-09-10'].map((date,i)=>({id:'s'+i,grade:'psa10',price:200,date}));
 const e=salesEvidence(sales,'psa10',NOW);assert.equal(e.passes,false);assert.equal(e.repeated,true);
 assert.equal(evidenceStatus(['sales-gate','identical-prices'],70),'limited');
 assert.equal(evidenceStatus([],null),'insufficient');assert.equal(evidenceStatus(['cohort-not-validated'],80),'unsupported');
 const busy=Array.from({length:12},(_,i)=>({id:'b'+i,grade:'psa10',price:200+i,date:new Date(NOW-(i*15+1)*86400000).toISOString().slice(0,10)}));
 assert.equal(salesEvidence(busy,'psa10',NOW).passes,true);
});

test('Research table: frozen weights, labelled bases, unsupported cohorts and stale data',()=>{
 assert.deepEqual(RESEARCH_RANK.weights,{momentum:.25,value:.75,lowVol:0});
 const entries=cards.map(c=>[c,snapshots[c.id]]),t=researchTable(entries,{now:NOW,release});
 const ranked=[...t.table.values()].flatMap(e=>Object.values(e)).filter(e=>e.rank!=null);
 assert.ok(ranked.length>3000);
 for(const e of ranked){assert.ok(e.rank>=0&&e.rank<=100);assert.ok(e.reference.size>=RESEARCH_RANK.minReference||e.reference.kind==='guide');}
 for(const e of ranked.filter(e=>e.grade==='raw'))assert.ok(e.reasons.includes('mixed-condition-basis')&&e.evidenceStatus!=='supported');
 for(const e of ranked.filter(e=>e.grade==='psa9'&&e.basis.key==='grade9-guide'))assert.ok(e.reasons.includes('mixed-grader-basis'));
 const me=cards.find(c=>c.series==='ME'&&c.eligible);assert.equal(t.table.get(me.id).psa10.evidenceStatus,'unsupported');assert.equal(t.table.get(me.id).psa10.rank,null);
 // A month later without new captures, everything is stale and nothing is "supported".
 const later=researchTable(entries.slice(0,3000),{now:NOW+40*86400000,release});
 assert.ok([...later.table.values()].every(e=>Object.values(e).every(x=>x.evidenceStatus!=='supported')));
});

test('Future-data poisoning leaves earlier research unchanged',()=>{
 const id='xy5-151',m=snapshots[id],c=cards.find(x=>x.id===id);
 const poisoned={...m,sales:[...m.sales,{id:'future',grade:'psa10',price:99999,date:'2026-12-01'}],history:Object.fromEntries(Object.entries(m.history).map(([k,v])=>[k,[...v,['2026-11',99999900],['2026-12',99999900]]]))};
 const peers=cards.filter(x=>x.setId==='xy5').map(x=>[x,snapshots[x.id]]);
 const a=researchTable(peers,{now:NOW,release}).table.get(id),b=researchTable(peers.map(([x,mm])=>[x,x.id===id?poisoned:mm]),{now:NOW,release}).table.get(id);
 for(const g of ['raw','psa9','psa10']){assert.equal(a[g].rank,b[g].rank,g);assert.deepEqual(a[g].features,b[g].features);assert.deepEqual(a[g].salesEvidence,b[g].salesEvidence);}
 assert.ok(c);
});

test('As-of layer enforces capture availability; reconstruction is labelled',()=>{
 const m=snapshots['xy5-151'];
 const strict=asOfMarket(m,'2025-06-30T23:59:59Z');assert.equal(strict.market,null);assert.equal(strict.status,'unavailable');
 const after=asOfMarket(m,'2026-12-01T00:00:00Z');assert.equal(after.status,'available');assert.equal(after.market.asOf.reconstructed,false);
 const rec=asOfMarket(m,'2025-06-30T23:59:59Z',{mode:'reconstruction'}).market;
 assert.equal(rec.asOf.reconstructed,true);assert.deepEqual(rec.guide,{});assert.equal(rec.pop,null);
 assert.ok(rec.sales.every(s=>s.date<='2025-06-30'));assert.ok(Object.values(rec.history).flat().every(([ym])=>ym<='2025-06'));
 assert.throws(()=>asOfMarket(m,'2025-01-01',{mode:'loose'}));
 const rows=[{id:1,card_id:'a',grade:'psa10',listing_id:'x',event_at:'2025-01-01',available_at:'2026-10-01T00:00:00Z',price:10},{id:2,card_id:'a',grade:'psa10',listing_id:'x',event_at:'2025-01-01',available_at:'2026-10-05T00:00:00Z',price:12}];
 assert.equal(asOfObservations(rows,'2025-12-31T00:00:00Z').length,0);
 assert.equal(asOfObservations(rows,'2026-10-02T00:00:00Z')[0].price,10);
 assert.equal(asOfObservations(rows,'2026-10-06T00:00:00Z')[0].price,12);
});

test('Observation log is append-only, versioned by content and never backdated',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
 const stmt=(q,v=[])=>({bind(...x){return stmt(q,x)},run:async()=>sqlite.prepare(q).run(...v),first:async()=>sqlite.prepare(q).get(...v)||null,all:async()=>({results:sqlite.prepare(q).all(...v)})});
 const db={prepare:stmt,batch:async items=>{for(const i of items)await i.run();}};
 const c=cards.find(x=>x.id==='xy5-151'),m=snapshots[c.id];
 const rows=observationRows(c,m);
 assert.ok(rows.sales.length>0);assert.ok(rows.sales.every(r=>r.available_at===r.captured_at&&r.available_at>=r.event_at));
 assert.ok(rows.guides.some(r=>/partial month/.test(r.price_basis)));assert.ok(rows.sales.every(r=>r.grade==='raw'?r.grader===null:r.grader==='PSA'));
 await recordObservations(db,c,m);await recordObservations(db,c,m);
 const n=sqlite.prepare('SELECT COUNT(*) AS n FROM sales_observations').get().n;assert.equal(n,new Set(rows.sales.map(r=>r.grade+'|'+r.listing_id+'|'+r.content_hash)).size);
 const corrected={...m,sales:m.sales.map((s,i)=>i===0?{...s,price:s.price+1}:s),research:{...m.research,checkedAt:'2026-10-05T00:00:00Z'}};
 await recordObservations(db,c,corrected);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sales_observations').get().n,n+1);
 const versions=sqlite.prepare('SELECT * FROM sales_observations WHERE listing_id = ?').all(String(m.sales[0].id));assert.equal(versions.length,2);
 assert.equal(asOfObservations(versions,'2026-10-06T00:00:00Z')[0].price,m.sales[0].price+1);
 assert.equal(contentHash({a:1}),contentHash({a:1}));assert.notEqual(contentHash({a:1}),contentHash({a:2}));
});

test('Costs: higher asks and higher costs can never improve the return',()=>{
 const E=500;let prev=Infinity;
 for(const ask of [50,100,200,400,600]){const r=netReturn(ask,E);assert.ok(r<prev);prev=r;}
 const base=netReturn(300,E);
 for(const [k,v] of [['saleFeeRate',.2],['shippingIn',10],['shippingOut',12],['taxRate',.08],['holdingCost',20],['saleFixedFee',1]])assert.ok(netReturn(300,E,normalizeCosts({[k]:v}).costs)<base,k);
 // The plan's research formula: (0.85E − 5)/(P + 5) − 1.
 assert.ok(Math.abs(netReturn(100,100)-((85-5)/105-1))<1e-12);
 for(const h of [0,.1,.25]){const B=maxBuyPrice(E,DEFAULT_COSTS,h);assert.ok(netReturn(B,E)>=h-1e-6&&netReturn(B+.02,E)<h+1e-3);}
 assert.equal(maxBuyPrice(8),null);assert.equal(netReturn(null,100),null);assert.equal(maxBuyPrice(null),null);
 const tiers=normalizeCosts({feeTiers:[{upTo:1000,rate:.13},{rate:.03}]}).costs;assert.ok(Math.abs(saleFee(2000,tiers)-160)<1e-9);
 assert.ok(normalizeCosts({saleFeeRate:2}).errors.length);assert.ok(normalizeCosts({feeTiers:[{upTo:5,rate:.1},{upTo:2,rate:.1}]}).errors.length);
 assert.ok(Math.abs(acquisitionCost(100,normalizeCosts({taxRate:.1}).costs)-115)<1e-9);
 const s=costSummary({ask:120,reference:150});assert.equal(s.breakEven,maxBuyPrice(150,DEFAULT_COSTS,0));assert.ok(s.netReturnAtReference<0===(120>s.breakEven));
});

test('Huber ridge recovers a clean signal; transforms clip and handle constant features',()=>{
 const rows=[];for(let i=0;i<400;i++){const a=Math.sin(i),b=Math.cos(i*1.7);rows.push({g:['raw','grade9','psa10'][i%3],M:a,V:b,Q:0,lnP:4,lnAge:2,y:.3*a-.2*b+(i%37===0?5:0)});}
 const tr=fitTransforms(rows);assert.equal(tr.Q.constant,true);assert.equal(scaled(99,tr.Q),0);assert.equal(scaled(1e9,tr.M),5);
 const X=rows.map(r=>designRow(r,tr)),beta=fitHuberRidge(X,rows.map(r=>r.y),rows.map(()=>1),{lambda:.001,delta:.2});
 assert.ok(Math.abs(beta[4]*1/tr.M.iqr-.3)<.03,'M coefficient');assert.ok(Math.abs(beta[5]/tr.V.iqr+.2)<.03,'V coefficient');
});

test('The shipped model artifact is frozen, unpromoted and explains its failed gate',()=>{
 const a=MODEL_ARTIFACT;
 assert.equal(a.promoted,false);assert.equal(a.status,'shadow');assert.equal(a.gate.passed,false);
 assert.ok(a.gate.checks.some(c=>c.id==='annual-vintages'&&!c.pass));assert.ok(a.gate.checks.some(c=>c.id==='forecast-selected'&&!c.pass));
 assert.deepEqual(a.supportedGrades,['psa10']);assert.equal(a.coefficients.length,3+1+5);assert.ok(Number.isFinite(a.calibration.q10));
 const f=modelForecast(a,{grade:'psa10',features:{M:.1,V:.05,Q:-.05},price:100,ageMonths:60});assert.ok(f.E10<f.expected);
 assert.equal(modelForecast(a,{grade:'psa10',features:{M:NaN,V:0,Q:0},price:100,ageMonths:1}),null);
});

test('Mode switch: shadow by default, legacy rollback, candidate refused without a promoted model',()=>{
 assert.equal(scoreMode({}),'shadow');assert.equal(scoreMode({FUTURESIGHT_SCORE_MODEL:'legacy'}),'legacy');
 assert.equal(scoreMode({FUTURESIGHT_SCORE_MODEL:'candidate'}),'shadow');assert.equal(scoreMode({FUTURESIGHT_SCORE_MODEL:'nonsense'}),'shadow');
 assert.equal(scoreMode({FUTURESIGHT_SCORE_MODEL:'candidate'},{promoted:true}),'candidate');
});

test('Card view: forecast withheld, costs follow the asking price, archive rows carry both systems',()=>{
 const entries=cards.filter(c=>c.setId==='xy5'||c.series==='XY').map(c=>[c,snapshots[c.id]]);
 const t=investmentTable(entries,{now:NOW,release}),id='xy5-151',a=analyze(snapshots[id],'psa9',15,NOW);
 const v=investmentView(t,id,'psa9',{reference:a.fair,referenceLabel:a.priceLabel,ask:100});
 assert.equal(v.forecast,null);assert.equal(v.probability,null);assert.match(v.forecastWithheld,/validation gate/);
 assert.equal(v.netReturnQuantiles,null);assert.equal(v.maxBuyPrice,null);assert.ok(v.costs.breakEven>0);
 const dearer=investmentView(t,id,'psa9',{reference:a.fair,ask:a.fair*2});assert.ok(dearer.costs.netReturnAtReference<investmentView(t,id,'psa9',{reference:a.fair,ask:a.fair}).costs.netReturnAtReference);
 assert.equal(investmentView(t,id,'psa9',{reference:null}).costs.breakEven,null);
 // A promoted model in candidate mode still refuses grades without matched evidence.
 const forced={...t,mode:'candidate',artifact:{...t.artifact,promoted:true},gate:{...t.gate,promoted:true}};
 assert.match(investmentView(forced,id,'psa9',{reference:a.fair}).forecastWithheld,/mixed/);
 const rows=archiveRows(t,null);assert.ok(rows.length>100);assert.ok(rows.every(r=>r.model_version===t.modelVersion&&r.as_of==='2026-10-06'));
 assert.ok(rows.some(r=>JSON.parse(r.payload).shadowForecast));
});

test('Bundled full-page captures give every qualifying English card a research rank',()=>{
 const english=cards.filter(c=>c.eligible&&(c.lang||'en')==='en'),t=researchTable(english.map(c=>[c,snapshots[c.id]]),{now:NOW,release});
 const ranked=english.filter(c=>['raw','psa9','psa10'].some(g=>t.table.get(c.id)[g].rank!=null));
 assert.ok(ranked.length>=7500,'ranked '+ranked.length);
 // Every era with a validated history has most of its rares ranked; ME stays excluded by design.
 for(const s of new Set(english.map(c=>c.series))){const all=english.filter(c=>c.series===s),n=ranked.filter(c=>c.series===s).length;if(s==='ME')assert.equal(n,0);else assert.ok(n/all.length>=.7,s+' '+n+'/'+all.length);}
 // The legacy sets whose rares had guide prices only now carry monthly history.
 for(const set of ['ex2','dp1','pl1','hgss1','col1','sm1','sm12'])assert.ok(english.filter(c=>c.setId===set).filter(c=>snapshots[c.id]?.history).length>=english.filter(c=>c.setId===set).length*.8,set);
});

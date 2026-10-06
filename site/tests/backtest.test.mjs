import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig,loadData,runBacktest,buildObservations,baskets,positionReturn,summary,linearScore} from '../../tools/research/backtest-investment.mjs';
import {checkPurge,loadModelConfig} from '../../tools/research/train-investment-model.mjs';

test('Backtest harness reproduces the plan\'s frozen experiment',async()=>{
 const r=await runBacktest(loadConfig(),await loadData(),{legacy:false});
 assert.equal(r.chosen.name,'grid_1_3');assert.deepEqual(r.chosen.w,[.25,.75,0]);
 const c=r.comparison.grid_1_3;assert.equal(c.baskets,18);
 assert.ok(Math.abs(c.lift-.0513021)<1e-6,'+5.13 pp');assert.ok(Math.abs(r.delayed.summary.lift-.0301734)<1e-6,'+3.02 pp delayed');
 assert.ok(r.byGrade.grade9.lift<0,'Grade 9 failure stays visible');assert.equal(r.walkForward[1].selected.name,'grid_1_3');
 assert.equal(r.evaluationCoverage.missing12,18);
});

test('Selection never sees future prices; missing exits and unfilled entries are explicit',()=>{
 const config=loadConfig().config,release=new Map([['s1',0]]);
 const mk=(id,prices)=>({card:{id,name:id,setId:'s1',series:'XY'},g:'psa10',h:new Map(prices.map((p,i)=>[24250+i,p])),hold:false});
 const base=Array.from({length:25},(_,k)=>mk('c'+k,Array.from({length:40},(_,i)=>30+k+((i*7+k)%9))));
 const cfg={...config,grades:['psa10'],entry:{first:'2022-03',last:'2022-03',stepMonths:3}};
 const a=buildObservations({series:base},release,cfg).observations;
 // Change only prices after the entry month: features and ranks must not move.
 const poisoned=base.map(s=>({...s,h:new Map([...s.h].map(([t,p])=>[t,t>24266?p*50:p]))}));
 const b=buildObservations({series:poisoned},release,cfg).observations;
 assert.equal(a.length,25);assert.deepEqual(a.map(r=>[r.id,r.rm,r.rv,r.rq,r.p]),b.map(r=>[r.id,r.rm,r.rv,r.rq,r.p]));
 const opts={haircut:.15,entryFixed:5,exitFixed:5,missing:-1};
 assert.equal(positionReturn({p:100,future:{12:undefined}},12,opts),-1);assert.equal(positionReturn({p:100,noTrade:true,future:{}},12,opts),0);
 const s=summary(baskets(a.map((r,i)=>i===0?{...r,future:{...r.future,12:undefined}}:r),r=>linearScore(r,[.25,.75,0]),cfg));
 assert.equal(s.missingExits,1);
});

test('Model windows are purged and the gate is frozen in config',()=>{
 const {config}=loadModelConfig();
 assert.ok(checkPurge(config).every(p=>p.ok));
 assert.deepEqual(config.lambdaGrid,[.1,1,10,100]);assert.equal(config.gate.minAnnualVintages,3);
 assert.equal(checkPurge({...config,windows:{...config.windows,tune:['2022-09','2022-12']}}).find(p=>p.earlier==='fit'&&p.later==='tune').ok,false);
});

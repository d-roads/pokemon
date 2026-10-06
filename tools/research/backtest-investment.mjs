// Investment backtest harness (plan.md, Phase 1).
//
// A modular version of the plan's Appendix C. Stages are separate functions so tests can feed
// them small synthetic universes:
//   buildUniverse      exact saved guide series per eligible card and guide grade
//   buildObservations  date-safe features at each entry month, plus every exclusion reason
//   assignHoldout      deterministic set hash; held-out sets never contribute outcomes to selection
//   selectWeights      candidate selection on the training window only
//   baskets/summary    top-quintile vs. all-card execution simulation after explicit costs
//   portfolio          integer-card purchases under a budget and concentration limits
// Reads saved data only. Run from the repository root:  node tools/research/backtest-investment.mjs
// It writes tools/research/investment-backtest-results.json and changes nothing else.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {median,analyze} from '../../site/lib/analysis.mjs';
import {monthIndex as month,monthName as ym,windowFeatures,percentileRanks} from '../../site/lib/investment-features.mjs';
import {charactersOf} from '../../site/lib/invest.mjs';
import {asOfMarket} from '../../site/lib/as-of.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
export const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
export const sd=a=>{const m=avg(a);return Math.sqrt(avg(a.map(x=>(x-m)**2))||0);};
export const setHash=(s,mult=31)=>{let h=0;for(const c of s)h=(mult*h+c.charCodeAt(0))>>>0;return h;};
export const sha256=b=>createHash('sha256').update(b).digest('hex');
export function loadConfig(file=path.join(here,'investment-backtest.config.json')){const raw=readFileSync(file);return {config:JSON.parse(raw),hash:sha256(raw)};}

export function gridModels(config){
 const models={...config.models},n=config.gridSteps;
 for(let m=0;m<=n;m++)for(let v=0;v<=n-m;v++)models['grid_'+m+'_'+v]=[m/n,v/n,(n-m-v)/n];
 return models;
}
// 1. Universe: positive completed guide months before the excluded (partial) month.
export function buildUniverse(cards,snapshots,config){
 const series=[],stop=config.excludeFromMonth,inventory={cards:0,series:0,points:0,sales:0};
 for(const c of cards){
  if(!c.eligible)continue;const m=snapshots[c.id];if(!m)continue;inventory.cards++;inventory.sales+=(m.sales||[]).length;
  for(const g of config.grades){
   const h=new Map((m.history?.[g]||[]).filter(([d,p])=>p>0&&d<stop).map(([d,p])=>[month(d),p/100]));
   inventory.points+=h.size;if(h.size){series.push({card:c,g,h,hold:setHash(c.setId,config.holdout.hashMultiplier)%config.holdout.modulus===0});inventory.series++;}
  }
 }
 return {series,inventory};
}
// 2. Features at each entry month. Ranks are computed over every eligible row at that date,
// including rows whose future exit is unknown, so selection never conditions on the future.
export function buildObservations(universe,release,config){
 const observations=[],cohorts=[],exclusions={};
 const rules={windowMonths:config.features.windowMonths,minDistinct:config.features.minDistinct,minPrice:config.features.minPrice};
 for(let t=month(config.entry.first);t<=month(config.entry.last);t+=config.entry.stepMonths)for(const g of config.grades){
  const rows=[],why={};
  for(const s of universe.series){
   if(s.g!==g)continue;
   if(release.get(s.card.setId)>t-config.features.minAgeMonths){why['too-new']=(why['too-new']||0)+1;continue;}
   const f=windowFeatures(s.h,t,rules);if(f.reason){why[f.reason]=(why[f.reason]||0)+1;continue;}
   const future={},lagFuture={};for(const h of config.horizons){future[h]=s.h.get(t+h);lagFuture[h]=s.h.get(t+h+1);}
   rows.push({id:s.card.id,name:s.card.name,set:s.card.setId,era:s.card.series,g,t,hold:s.hold,p:f.price,next:s.h.get(t+1),mom:f.M,val:f.V,qual:f.Q,lnAge:Math.log(1+t-release.get(s.card.setId)),future,lagFuture,h:s.h});
  }
  percentileRanks(rows,'mom','rm');percentileRanks(rows,'val','rv');percentileRanks(rows,'qual','rq');
  observations.push(...rows);exclusions[ym(t)+'|'+g]=why;
  cohorts.push({date:ym(t),g,eligible:rows.length,missing12:rows.filter(r=>!r.future[config.primaryHorizon]).length,excluded:why});
 }
 return {observations,cohorts,exclusions};
}
export const linearScore=(r,w)=>r.rm*w[0]+r.rv*w[1]+r.rq*w[2];
// Simulated net return of one hypothetical position after the stated costs.
// No entry fill: cash, zero return. Missing mature exit: the conservative missingExitReturn mark.
export function positionReturn(r,h,{haircut,entryFixed,exitFixed,missing=-1}){
 if(r.noTrade)return 0;
 const E=r.future[h];
 if(!(E>0))return missing;
 return Math.min(r.cap??Infinity,((1-haircut)*E-exitFixed)/(r.p+entryFixed)-1);
}
export function baskets(rows,scoreOf,config,{h=config.primaryHorizon,haircut=config.costs.saleHaircut,entryFixed=config.costs.entryFixed,exitFixed=config.costs.exitFixed,by=''}={}){
 const last=month(config.lastExitMonth),groups=new Map(),opts={haircut,entryFixed,exitFixed,missing:config.missingExitReturn};
 for(const r of rows){if(r.t+h>last)continue;const k=r.t+'|'+r.g+(by?'|'+r[by]:'');(groups.get(k)||groups.set(k,[]).get(k)).push(r);}
 const out=[];
 for(const [key,all] of groups){
  if(all.length<config.basket.minCards)continue;
  const top=[...all].sort((a,b)=>scoreOf(b)-scoreOf(a)||a.id.localeCompare(b.id)).slice(0,Math.ceil(all.length*config.basket.topShare));
  const r=top.map(x=>positionReturn(x,h,opts)),base=avg(all.map(x=>positionReturn(x,h,opts)));
  out.push({key,date:ym(all[0].t),g:all[0].g,n:all.length,k:top.length,missing:all.filter(x=>!(x.future[h]>0)).length,unfilled:top.filter(x=>x.noTrade).length,net:avg(r),base,lift:avg(r)-base,median:median(r),win:avg(r.map(x=>+(x>0))),loss:avg(r.map(x=>+(x<-.3))),worst:Math.min(...r)});
 }
 return out;
}
export const summary=b=>({baskets:b.length,meanNet:avg(b.map(x=>x.net)),baseline:avg(b.map(x=>x.base)),lift:avg(b.map(x=>x.lift)),medianLift:median(b.map(x=>x.lift)),positiveLift:avg(b.map(x=>+(x.lift>0))),win:avg(b.map(x=>x.win)),loss30:avg(b.map(x=>x.loss)),worstBasket:b.length?Math.min(...b.map(x=>x.net)):null,missingExits:b.reduce((n,x)=>n+x.missing,0),unfilled:b.reduce((n,x)=>n+x.unfilled,0)});
export const objective=(b,config)=>avg(b.map(x=>x.lift))-config.objective.stddevPenalty*sd(b.map(x=>x.lift));
export function selectWeights(train,models,config){
 return Object.entries(models).map(([name,w])=>{const b=baskets(train,r=>linearScore(r,w),config);return {name,w,...summary(b),objective:objective(b,config)};})
  .sort((a,b)=>b.objective-a.objective||a.name.localeCompare(b.name));
}
// Integer purchases: one copy each in rank order under a budget, with set and character caps.
// Exit marks use the guide; a missing exit is counted and valued at zero (not proof of worthlessness).
// Monthly marks over the holding give a drawdown on a marked portfolio; missing marks are counted.
export function portfolio(rows,scoreOf,config,{h=config.primaryHorizon}={}){
 const {budget,maxPerSet,maxPerCharacter}=config.portfolio,last=month(config.lastExitMonth),c=config.costs,groups=new Map();
 for(const r of rows){if(r.t+h>last)continue;const k=r.t+'|'+r.g;(groups.get(k)||groups.set(k,[]).get(k)).push(r);}
 const out=[];
 for(const all of groups.values()){
  if(all.length<config.basket.minCards)continue;
  const want=Math.ceil(all.length*config.basket.topShare),held=[],perSet=new Map(),perChar=new Map();let cash=budget,skipped=0;
  for(const r of [...all].sort((a,b)=>scoreOf(b)-scoreOf(a)||a.id.localeCompare(b.id))){
   if(held.length>=want)break;
   const cost=r.p+c.entryFixed,ch=charactersOf(r.name)[0]||r.name;
   if(cost>cash||(perSet.get(r.set)||0)>=maxPerSet||(perChar.get(ch)||0)>=maxPerCharacter){skipped++;continue;}
   cash-=cost;held.push(r);perSet.set(r.set,(perSet.get(r.set)||0)+1);perChar.set(ch,(perChar.get(ch)||0)+1);
  }
  let missingExit=0,missingMarks=0,peak=budget,maxDD=0;
  const proceeds=held.reduce((s,r)=>{const E=r.future[h];if(!(E>0)){missingExit++;return s;}return s+Math.max(0,(1-c.saleHaircut)*E-c.exitFixed);},0);
  for(let m=1;m<=h;m++){
   const value=cash+held.reduce((s,r)=>{const p=r.h.get(r.t+m);if(!(p>0)){missingMarks++;return s;}return s+(1-c.saleHaircut)*p;},0);
   peak=Math.max(peak,value);maxDD=Math.max(maxDD,1-value/peak);
  }
  out.push({date:ym(all[0].t),g:all[0].g,positions:held.length,wanted:want,skipped,fill:(budget-cash)/budget,ret:(cash+proceeds)/budget-1,missingExit,missingMarks,maxDrawdown:maxDD});
 }
 return {baskets:out,meanReturn:avg(out.map(x=>x.ret)),meanFill:avg(out.map(x=>x.fill)),worstDrawdown:out.length?Math.max(...out.map(x=>x.maxDrawdown)):null,missingExit:out.reduce((n,x)=>n+x.missingExit,0),missingMarks:out.reduce((n,x)=>n+x.missingMarks,0),
  timeToSale:null,timeToSaleNote:'Not observable: no listing or order-book history exists, so exits assume a sale at the guide price.'};
}
export function lcg(seed){let s=seed>>>0;return ()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296;};}
export function dateBootstrap(testBaskets,config){
 const dates=[...new Set(testBaskets.map(b=>b.date))],lifts=dates.map(d=>avg(testBaskets.filter(b=>b.date===d).map(b=>b.lift))),rand=lcg(config.bootstrap.seed),n=config.bootstrap.draws;
 const bs=Array.from({length:n},()=>avg(lifts.map(()=>lifts[Math.floor(rand()*lifts.length)]))).sort((a,b)=>a-b);
 return {dates:lifts.length,lower:bs[Math.floor(n*.025)],upper:bs[Math.ceil(n*.975)-1],note:'Exploratory date-cluster bootstrap; adjacent 12-month holdings overlap, so not a formal confidence interval.'};
}

export async function loadData(){
 const {cards,sets}=await import(pathToFileURL(path.join(root,'site/data/catalog.mjs')).href);
 const {snapshots}=await import(pathToFileURL(path.join(root,'site/data/market.mjs')).href);
 return {cards,sets,snapshots};
}
export function captureManifest(dir=path.join(root,'site/data/pricecharting')){
 const files=readdirSync(dir).filter(f=>f.endsWith('.json')).sort().map(f=>[f,sha256(readFileSync(path.join(dir,f)))]);
 return {files:files.length,digest:sha256(files.map(x=>x.join(' ')).join('\n')),entries:files};
}

export async function runBacktest({config,hash},{cards,sets,snapshots},{legacy=true}={}){
 const release=new Map(sets.map(s=>[s.id,month(s.release)]));
 const universe=buildUniverse(cards,snapshots,config);
 const {observations,cohorts,exclusions}=buildObservations(universe,release,config);
 const models=gridModels(config);
 const train=observations.filter(r=>!r.hold&&r.t<=month(config.split.trainLastEntry));
 const test=observations.filter(r=>r.t>=month(config.split.testFirstEntry));
 const selection=selectWeights(train,models,config),chosen=selection[0],w=chosen.w,S=r=>linearScore(r,w);
 const B=(rows,o={})=>summary(baskets(rows,S,config,o));
 const years=config.walkForwardYears;
 const results={config:{version:config.version,sha256:hash},
  inventory:{...universe.inventory,eligible:cards.filter(c=>c.eligible).length,catalogCards:cards.length,sets:sets.length,observations:observations.length,uniqueCards:new Set(observations.map(r=>r.id)).size,setsTested:new Set(observations.map(r=>r.set)).size,eras:[...new Set(observations.map(r=>r.era))]},
  cohorts,selection:selection.map(({name,w,objective,lift,meanNet,baskets})=>({name,w,objective,lift,meanNet,baskets})),chosen:{name:chosen.name,w:chosen.w,objective:chosen.objective},
  comparison:Object.fromEntries(Object.entries(models).filter(([n])=>!n.startsWith('grid')||n===chosen.name).map(([n,mw])=>[n,summary(baskets(test,r=>linearScore(r,mw),config))])),
  byYear:Object.fromEntries(years.map(y=>[y,B(test.filter(r=>Math.floor(r.t/12)===y))])),
  byGrade:Object.fromEntries(config.grades.map(g=>[g,B(test.filter(r=>r.g===g))])),
  byEra:Object.fromEntries([...new Set(test.map(r=>r.era))].map(e=>[e,B(test.filter(r=>r.era===e))])),
  heldSets:B(test.filter(r=>r.hold)),
  bySetBaskets:B(test,{by:'set'}),
  horizons:Object.fromEntries(config.horizons.map(h=>[h,B(test,{h})])),
  costs:Object.fromEntries(config.saleHaircutScenarios.map(f=>[f,B(test,{haircut:f,exitFixed:f?config.costs.exitFixed:0})])),
  testBaskets:baskets(test,S,config),
  heldSetNames:sets.filter(s=>setHash(s.id,config.holdout.hashMultiplier)%config.holdout.modulus===0&&test.some(r=>r.set===s.id)).map(s=>s.name)};
 results.walkForward=years.map(y=>{const tr=observations.filter(r=>!r.hold&&r.t+config.primaryHorizon<=month((y-1)+'-12')&&r.t<=month((y-2)+'-12'));const pick=selectWeights(tr,models,config)[0],ws=r=>linearScore(r,pick.w);
  return {year:y,selected:{name:pick.name,w:pick.w,objective:pick.objective},test:summary(baskets(test.filter(r=>Math.floor(r.t/12)===y),ws,config)),heldSets:summary(baskets(test.filter(r=>Math.floor(r.t/12)===y&&r.hold),ws,config))};});
 results.setDetails=[...new Set(test.map(r=>r.set))].map(set=>({set,name:sets.find(s=>s.id===set)?.name,...B(test.filter(r=>r.set===set))})).filter(x=>x.baskets);
 results.dateBootstrap=dateBootstrap(results.testBaskets,config);
 results.evaluationCoverage={testObservations:test.length,cards:new Set(test.map(r=>r.id)).size,sets:new Set(test.map(r=>r.set)).size,missing12:test.filter(r=>!r.future[config.primaryHorizon]).length,holdSets:new Set(test.filter(r=>r.hold).map(r=>r.set)).size};
 const delayed=test.map(r=>({...r,p:r.next||r.p,noTrade:!r.next,future:r.lagFuture}));
 results.delayed={missingEntries:test.filter(r=>!r.next).length,summary:B(delayed),byGrade:Object.fromEntries(config.grades.map(g=>[g,B(delayed.filter(r=>r.g===g))]))};
 results.nonoverlap=B(test.filter(r=>r.t%12===month(config.split.testFirstEntry)%12));
 results.priceBands=Object.fromEntries(config.priceBands.map(([lo,hi])=>[lo+'-'+(hi??'Infinity'),B(test.filter(r=>r.p>=lo&&r.p<(hi??Infinity)))]));
 const p10=selectWeights(train.filter(r=>r.g==='psa10'),models,config)[0];results.psa10TrainingChoice={name:p10.name,w:p10.w,objective:p10.objective};results.psa10OwnModel=summary(baskets(test.filter(r=>r.g==='psa10'),r=>linearScore(r,p10.w),config));
 results.cappedUpside=B(test.map(r=>({...r,cap:config.upsideCap})));
 const st=config.stress;
 results.executionStress=B(delayed.map(r=>({...r,p:r.p*(1+st.buySlippage)*(1+st.acquisitionTax),future:Object.fromEntries(Object.entries(r.future).map(([h,p])=>[h,p*(1-st.exitSlippage)]))})),{haircut:st.saleHaircut,exitFixed:st.fixed});
 results.portfolio={candidate:portfolio(test,S,config),valueOnly:portfolio(test,r=>linearScore(r,[0,1,0]),config),note:'Integer one-copy purchases, $'+config.portfolio.budget+' per basket, at most '+config.portfolio.maxPerSet+' per set and '+config.portfolio.maxPerCharacter+' per character; uninvested cash earns nothing.'};
 if(legacy)results.legacyReplay=await legacyReplay({cards,snapshots,release,config});
 // Checks the protocol depends on.
 assert(train.every(r=>!r.hold&&r.t+config.primaryHorizon<=month(config.split.trainLastEntry)+12));
 assert(observations.every(r=>[r.rm,r.rv,r.rq].every(x=>Number.isFinite(x)&&x>=0&&x<=1)));
 assert(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-10);
 const c=results.costs;assert(c['0.1'].meanNet>c['0.15'].meanNet&&c['0.15'].meanNet>c['0.2'].meanNet);
 assert.equal(positionReturn({p:100,future:{12:100}},12,{haircut:.15,entryFixed:5,exitFixed:5}),(85-5)/105-1);
 assert.equal(positionReturn({p:100,future:{}},12,{haircut:.15,entryFixed:5,exitFixed:5,missing:-1}),-1);
 assert.equal(positionReturn({p:100,future:{},noTrade:true},12,{haircut:.15,entryFixed:5,exitFixed:5}),0);
 results.exclusions=exclusions;
 results.checks='Passed: ranks, training-label cutoff, disjoint held sets, weight sum, fee monotonicity, net-return arithmetic, missing exits and unfilled entries.';
 return results;
}
// Diagnostic only: the existing score on event-filtered (reconstructed) inputs. Current guides
// and population are removed by the as-of layer; the result is not historically available data.
export async function legacyReplay({cards,snapshots,release,config}){
 const {investmentScores}=await import(pathToFileURL(path.join(root,'site/lib/score.mjs')).href);
 const out=[];
 for(const date of config.legacyReplayDates){
  const cutoff=Date.parse(date+'T23:59:59Z');
  const entries=cards.filter(c=>c.eligible&&release.get(c.setId)<=month(date)).map(c=>[c,snapshots[c.id]?asOfMarket(snapshots[c.id],cutoff,{mode:'reconstruction'}).market:null]);
  const scores=investmentScores(entries,{now:cutoff}),row={date,reconstructed:true,grades:{}};
  for(const g of ['raw','psa9','psa10']){
   let scored=0,matched=0;
   for(const [c] of entries){const a=scores.full.get(c.id)?.[g];if(a?.score==null||!(a.price>=25))continue;scored++;const fut=analyze({sales:(snapshots[c.id]?.sales||[]).filter(s=>s.date>date)},g,15,Date.UTC(Number(date.slice(0,4))+1,5,30,23,59,59));if(fut.fair>0)matched++;}
   row.grades[g]={scored,matched};
  }
  out.push(row);
 }
 return {rows:out,note:'Partial reconstruction. Matched rows are selected on future coverage, so no returns are compared.'};
}

async function main(){
 const cfg=loadConfig(),data=await loadData();
 const results=await runBacktest(cfg,data);
 const manifest=captureManifest();
 results.provenance={scriptSha256:sha256(readFileSync(fileURLToPath(import.meta.url))),captures:{files:manifest.files,digest:manifest.digest},node:process.version};
 for(const r of [results.testBaskets])for(const b of r)delete b.h;
 const file=path.join(here,'investment-backtest-results.json');
 writeFileSync(file,JSON.stringify(results,(k,v)=>typeof v==='number'&&!Number.isInteger(v)?Math.round(v*1e8)/1e8:v,1)+'\n');
 const c=results.comparison[results.chosen.name];
 console.log(`Selected ${results.chosen.name} ${JSON.stringify(results.chosen.w)}: test net ${(c.meanNet*100).toFixed(2)}% vs baseline ${(c.baseline*100).toFixed(2)}% (${(c.lift*100).toFixed(2)} pp, ${c.baskets} baskets). Delayed: ${(results.delayed.summary.lift*100).toFixed(2)} pp.`);
 console.log('Wrote',path.relative(root,file));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e);process.exit(1);});

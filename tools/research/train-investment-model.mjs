// Train and validate the net-return challenger offline (plan.md Phase 3).
//
// Windows are calendar blocks of entry months, purged so that no 12-month label used in one
// window ends on or after the first entry of a later window:
//   fit        coefficients for each lambda in the frozen grid
//   tune       lambda by validation Huber loss (one-standard-error rule, simpler model wins)
//   calibrate  10th-percentile residual for the conservative exit E10
//   test       untouched; scored once, with the promotion gate frozen in the config
// Outputs:
//   site/data/investment-model.json            the artifact the app reads (promoted only if the gate passes)
//   tools/research/investment-model-report.json full validation report
// Run from the repository root:  node tools/research/train-investment-model.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadConfig,loadData,buildUniverse,buildObservations,positionReturn,avg,sd,sha256,lcg,captureManifest} from './backtest-investment.mjs';
import {monthIndex as month,monthName as ym} from '../../site/lib/investment-features.mjs';
import {MODEL_FEATURES,fitTransforms,designRow,fitHuberRidge,predictRow,huber,quantile} from '../../site/lib/investment-model.mjs';
import {netReturn} from '../../site/lib/investment-costs.mjs';
import {median} from '../../site/lib/analysis.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
export function loadModelConfig(file=path.join(here,'investment-model.config.json')){const raw=readFileSync(file);return {config:JSON.parse(raw),hash:sha256(raw)};}
const inWindow=(t,[a,b])=>t>=month(a)&&t<=month(b);

// Purging: every label in an earlier window must end before the next window's first entry.
export function checkPurge(cfg){
 const w=cfg.windows,h=cfg.horizonMonths,end=k=>month(w[k][1])+h,start=k=>month(w[k][0]);
 const pairs=[['fit','tune'],['fit','calibrate'],['tune','test'],['calibrate','test'],['fit','test']];
 return pairs.map(([a,b])=>({earlier:a,later:b,labelsEnd:ym(end(a)),laterStarts:ym(start(b)),ok:end(a)<start(b)}));
}
export function modelRows(observations,h){
 return observations.map(r=>({id:r.id,name:r.name,set:r.set,era:r.era,g:r.g,t:r.t,p:r.p,M:r.mom,V:r.val,Q:r.qual,S:.25*r.rm+.75*r.rv,rm:r.rm,rv:r.rv,lnP:Math.log(r.p),lnAge:r.lnAge,exit:r.future[h],y:r.future[h]>0?Math.log(r.future[h]/r.p):null}));
}
// Equal total weight per entry-month × grade × era block, normalised to mean 1.
export function blockWeights(rows){
 const size=new Map(),key=r=>r.t+'|'+r.g+'|'+r.era;for(const r of rows)size.set(key(r),(size.get(key(r))||0)+1);
 const raw=rows.map(r=>1/size.get(key(r))),mean=avg(raw);return raw.map(x=>x/mean);
}
export function fitModel(rows,{features=MODEL_FEATURES,lambda,delta}){
 const transforms=fitTransforms(rows,features),X=rows.map(r=>designRow(r,transforms,features)),y=rows.map(r=>r.y),w=blockWeights(rows);
 return {features,transforms,lambda,delta,coefficients:fitHuberRidge(X,y,w,{lambda,delta})};
}
export const predict=(m,r)=>predictRow(m.coefficients,designRow(r,m.transforms,m.features));
function lossByBlock(m,rows,delta){
 const blocks=new Map();for(const r of rows){const k=r.t+'|'+r.g;(blocks.get(k)||blocks.set(k,[]).get(k)).push(huber(r.y-(m?predict(m,r):0),delta));}
 const means=[...blocks.values()].map(avg);return {loss:avg(means),se:sd(means)/Math.sqrt(Math.max(1,means.length-1)),blocks:means.length};
}
// Top-quintile baskets per entry month and grade, scored by `score`; returns per-basket nets.
function strategy(rows,score,cfg){
 const groups=new Map();for(const r of rows){const k=r.t+'|'+r.g;(groups.get(k)||groups.set(k,[]).get(k)).push(r);}
 const c=cfg.costs,opts={haircut:c.saleFeeRate,entryFixed:c.shippingIn,exitFixed:c.shippingOut+c.saleFixedFee,missing:-1},out=[];
 for(const [key,all] of groups){
  if(all.length<20)continue;
  const ret=r=>positionReturn({p:r.p,future:{h:r.exit}},'h',opts);
  const top=[...all].sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id)).slice(0,Math.ceil(all.length*.2));
  out.push({key,t:all[0].t,g:all[0].g,n:all.length,net:avg(top.map(ret)),base:avg(all.map(ret))});
 }
 return out;
}
function blockBootstrap(diffsByMonth,gate){
 const months=[...diffsByMonth.keys()].sort((a,b)=>a-b),L=gate.bootstrapBlockMonths,blocks=[];
 for(let i=0;i<months.length;i+=L)blocks.push(months.slice(i,i+L).map(m=>diffsByMonth.get(m)));
 if(blocks.length<2)return {blocks:blocks.length,lower:null,reason:`Only ${blocks.length} non-overlapping ${L}-month block${blocks.length===1?'':'s'} in the test window; at least 2 are needed to bootstrap.`};
 const rand=lcg(gate.bootstrapSeed),draws=[];
 for(let d=0;d<gate.bootstrapDraws;d++){const pick=[];for(let b=0;b<blocks.length;b++)pick.push(...blocks[Math.floor(rand()*blocks.length)]);draws.push(avg(pick));}
 draws.sort((a,b)=>a-b);return {blocks:blocks.length,lower:quantile(draws,gate.bootstrapLowerQuantile),upper:quantile(draws,1-gate.bootstrapLowerQuantile)};
}

export async function train({config:cfg,hash},data,{backtest=loadConfig()}={}){
 const purge=checkPurge(cfg);assert(purge.every(p=>p.ok),'Windows are not purged: '+JSON.stringify(purge.filter(p=>!p.ok)));
 const h=cfg.horizonMonths,lastExit=month(cfg.lastExitMonth);
 const btc={...backtest.config,entry:{first:cfg.windows.fit[0],last:cfg.windows.test[1],stepMonths:cfg.entryStepMonths},horizons:[h],primaryHorizon:h};
 const release=new Map(data.sets.map(s=>[s.id,month(s.release)]));
 const {observations}=buildObservations(buildUniverse(data.cards,data.snapshots,btc),release,btc);
 const rows=modelRows(observations,h).filter(r=>r.t+h<=lastExit);
 const win=k=>rows.filter(r=>inWindow(r.t,cfg.windows[k]));
 const labelled=k=>win(k).filter(r=>r.y!=null);
 const fit=labelled('fit'),tune=labelled('tune'),cal=labelled('calibrate'),testAll=win('test'),test=testAll.filter(r=>r.y!=null);
 // Huber threshold from a lightly penalised fit on the fit window only.
 const pilot=fitModel(fit,{lambda:1e-6,delta:1e6}),res=fit.map(r=>r.y-predict(pilot,r)),mad=median(res.map(x=>Math.abs(x-median(res))));
 const delta=Math.max(cfg.huber.minDelta,cfg.huber.deltaMadMultiplier*1.4826*mad);
 const grid=cfg.lambdaGrid.map(lambda=>{const m=fitModel(fit,{lambda,delta});return {lambda,model:m,...lossByBlock(m,tune,delta)};});
 const best=grid.reduce((a,b)=>b.loss<a.loss?b:a);
 const chosen=grid.filter(g=>g.loss<=best.loss+best.se).reduce((a,b)=>b.lambda>a.lambda?b:a);
 const model=chosen.model;
 // Benchmarks fitted the same way on the same windows.
 const bench={constant:null,valueOnly:fitModel(fit,{features:['V'],lambda:chosen.lambda,delta}),momentumOnly:fitModel(fit,{features:['M'],lambda:chosen.lambda,delta}),researchRank:fitModel(fit,{features:['S'],lambda:chosen.lambda,delta})};
 const validation=Object.fromEntries([['model',model],...Object.entries(bench)].map(([k,m])=>[k,{tune:lossByBlock(m,tune,delta),test:lossByBlock(m,test,delta)}]));
 // Forecast selection on the tune window: the simplest forecast within one standard error of the best.
 const COMPLEXITY={constant:0,valueOnly:1,momentumOnly:1,researchRank:1,model:MODEL_FEATURES.length};
 const bestTune=Object.entries(validation).reduce((a,b)=>b[1].tune.loss<a[1].tune.loss?b:a);
 const forecastChoice=Object.entries(validation).filter(([,v])=>v.tune.loss<=bestTune[1].tune.loss+bestTune[1].tune.se).sort((a,b)=>COMPLEXITY[a[0]]-COMPLEXITY[b[0]]||a[1].tune.loss-b[1].tune.loss)[0][0];
 // Calibration on its own window.
 const calRes=cal.map(r=>r.y-predict(model,r)).sort((a,b)=>a-b),q10=quantile(calRes,cfg.calibrationQuantile);
 const covered=rs=>rs.length?avg(rs.map(r=>+(r.y>=predict(model,r)+q10))):null;
 const coverage={overall:{n:test.length,share:covered(test)},byGrade:{},byEra:{}};
 for(const g of ['raw','grade9','psa10']){const s=test.filter(r=>r.g===g);coverage.byGrade[g]={n:s.length,share:covered(s)};}
 for(const e of [...new Set(test.map(r=>r.era))]){const s=test.filter(r=>r.era===e);coverage.byEra[e]={n:s.length,share:covered(s)};}
 // Strategy on the untouched test window (missing exits marked −100% for every strategy).
 const costs={...cfg.costs,feeTiers:null},E10=r=>r.p*Math.exp(predict(model,r)+q10);
 const scored=testAll.map(r=>({...r,conservative:netReturn(r.p,E10(r),costs)}));
 const strategies={model:strategy(scored,r=>r.conservative,cfg),researchRank:strategy(scored,r=>r.S,cfg),valueOnly:strategy(scored,r=>r.rv,cfg),momentumOnly:strategy(scored,r=>r.rm,cfg)};
 const mean=k=>avg(strategies[k].map(b=>b.net)),allCards=avg(strategies.model.map(b=>b.base));
 const baselines={allCards,researchRank:mean('researchRank'),valueOnly:mean('valueOnly'),momentumOnly:mean('momentumOnly'),cash:0};
 const strongest=Object.entries(baselines).reduce((a,b)=>b[1]>a[1]?b:a);
 // Excess over the strongest baseline per entry month, for the block bootstrap.
 const sKey=strongest[0],diffs=new Map();
 for(const b of strategies.model){const other=sKey==='allCards'?b.base:sKey==='cash'?0:strategies[sKey].find(x=>x.key===b.key)?.net;if(other==null)continue;(diffs.get(b.t)||diffs.set(b.t,[]).get(b.t)).push(b.net-other);}
 const boot=blockBootstrap(new Map([...diffs].map(([t,v])=>[t,avg(v)])),cfg.gate);
 // Cohorts: fresh top quintile within each grade and era, against that cohort's all-card basket.
 const cohorts=[];
 for(const [kind,key] of [['grade','g'],['era','era']])for(const v of [...new Set(scored.map(r=>r[key]))]){
  const s=scored.filter(r=>r[key]===v),b=strategy(s,r=>r.conservative,cfg),cards=new Set(s.map(r=>r.id)).size,setsN=new Set(s.map(r=>r.set)).size;
  cohorts.push({kind,value:v,rows:s.length,cards,sets:setsN,baskets:b.length,net:avg(b.map(x=>x.net)),base:avg(b.map(x=>x.base)),excess:b.length?avg(b.map(x=>x.net-x.base)):null,sized:s.length>=cfg.gate.minCohortRows&&cards>=cfg.gate.cohortMinCards&&setsN>=cfg.gate.cohortMinSets});
 }
 const G=cfg.gate,modelNet=mean('model'),testYears=new Set(testAll.map(r=>Math.floor(r.t/12)));
 const vintages=Math.floor((month(cfg.windows.test[1])-month(cfg.windows.test[0])+1)/12)+((month(cfg.windows.test[1])-month(cfg.windows.test[0])+1)%12?1:0);
 const failures=cohorts.filter(c=>c.sized&&c.excess!=null&&c.excess<-G.maxCohortShortfall);
 const checks=[
  {id:'forecast-selected',label:'The full model is the forecast chosen on the tune window (simplest within one standard error, including an unchanged price)',value:forecastChoice,pass:forecastChoice==='model'},
  {id:'forecast-error',label:'Test forecast error below the unchanged-price forecast',value:{model:validation.model.test.loss,constant:validation.constant.test.loss},pass:validation.model.test.loss<validation.constant.test.loss},
  {id:'net-return',label:'Positive net return after costs on the untouched test window',value:modelNet,pass:modelNet>G.minNetReturn},
  {id:'beats-strongest-baseline',label:`Beats the strongest baseline (${strongest[0]})`,value:modelNet-strongest[1],pass:modelNet-strongest[1]>G.minExcessOverStrongestBaseline},
  {id:'bootstrap-lower-bound',label:'Block-bootstrap lower bound of excess above zero',value:boot.lower,pass:boot.lower!=null&&boot.lower>0,note:boot.reason},
  {id:'calibration',label:`E10 covers ${Math.round(G.coverageTarget*100)}% ± ${Math.round(G.coverageTolerance*100)} points of outcomes, overall and per grade`,value:coverage.overall.share,
   pass:[coverage.overall,...Object.values(coverage.byGrade).filter(x=>x.n>=G.minCohortRows)].every(x=>x.share!=null&&Math.abs(x.share-G.coverageTarget)<=G.coverageTolerance)},
  {id:'no-cohort-failure',label:`No sized grade or era cohort trails its all-card basket by more than ${G.maxCohortShortfall*100} points`,value:failures.map(c=>c.kind+':'+c.value),pass:!failures.length},
  {id:'annual-vintages',label:`At least ${G.minAnnualVintages} non-overlapping annual test vintages`,value:vintages,pass:vintages>=G.minAnnualVintages},
  {id:'coverage',label:`At least ${G.minCards} distinct cards across ${G.minSets} sets in the test`,value:{cards:new Set(testAll.map(r=>r.id)).size,sets:new Set(testAll.map(r=>r.set)).size},pass:new Set(testAll.map(r=>r.id)).size>=G.minCards&&new Set(testAll.map(r=>r.set)).size>=G.minSets},
 ];
 const passed=checks.every(c=>c.pass);
 const artifact={
  version:cfg.version,status:passed?'validated':'shadow',promoted:passed,
  note:passed?'Passed the frozen promotion gate.':'Did not pass the frozen promotion gate; the app keeps this model in shadow mode and shows no forecast from it.',
  horizonMonths:h,trainedOn:'PriceCharting monthly guide history (guide-to-guide labels)',
  supportedGrades:G.matchedBasisGrades,supportNote:'Raw and Grade 9 guide series mix conditions or graders, so they cannot support NM or PSA 9 forecasts even after promotion.',
  windows:cfg.windows,features:model.features,transforms:model.transforms,coefficients:model.coefficients,lambda:chosen.lambda,huberDelta:delta,forecastSelected:forecastChoice,
  calibration:{q10,quantile:cfg.calibrationQuantile,rows:cal.length},costProfile:cfg.costs,
  gate:{passed,checks:checks.map(({id,label,pass,value,note})=>({id,label,pass,value,note}))},
  hashes:{protocol:hash,code:sha256(readFileSync(fileURLToPath(import.meta.url))),backtestProtocol:backtest.hash},
 };
 const report={...artifact,purge,rows:{fit:fit.length,tune:tune.length,calibrate:cal.length,test:testAll.length,testLabelled:test.length,testMissingExit:testAll.length-test.length},
  lambdaSearch:grid.map(({lambda,loss,se,blocks})=>({lambda,loss,se,blocks})),validation,coverage,baselines,strongestBaseline:strongest[0],modelNet,bootstrap:boot,cohorts,testYears:[...testYears],
  strategies:Object.fromEntries(Object.entries(strategies).map(([k,v])=>[k,{baskets:v.length,meanNet:avg(v.map(b=>b.net))}])),
  legacyScore:{available:false,reason:'The current score cannot be replayed exactly: historical population, guides, capture availability and complete sold pages are unavailable (see the backtest legacyReplay diagnostic).'}};
 return {artifact,report};
}

async function main(){
 const cfg=loadModelConfig(),data=await loadData(),{artifact,report}=await train(cfg,data);
 const manifest=captureManifest();artifact.hashes.captures=manifest.digest;report.hashes=artifact.hashes;
 const round=(k,v)=>typeof v==='number'&&!Number.isInteger(v)?Math.round(v*1e10)/1e10:v;
 writeFileSync(path.join(root,'site/data/investment-model.json'),JSON.stringify(artifact,round,1)+'\n');
 writeFileSync(path.join(here,'investment-model-report.json'),JSON.stringify(report,round,1)+'\n');
 console.log(`${artifact.version}: lambda ${artifact.lambda}, q10 ${artifact.calibration.q10.toFixed(3)}, gate ${artifact.gate.passed?'PASSED':'not passed'}`);
 for(const c of artifact.gate.checks)console.log(` ${c.pass?'✓':'✗'} ${c.label}: ${JSON.stringify(c.value)}${c.note?' — '+c.note:''}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e);process.exit(1);});

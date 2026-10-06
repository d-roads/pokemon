// Research rank and evidence status for the investment model (shadow mode).
//
// The rank is the candidate from the October 2026 research plan (plan.md, sections 4–6):
//   V = ln(median(P[t−12..t]) / P[t])          discount to the trailing 13-month median
//   M = ln(P[t−1] / P[t−12])                   momentum, skipping the newest month
//   Q = −stddev of the 12 monthly log changes  (tested, weight 0)
//   S = 100 × (0.75 × PR(V) + 0.25 × PR(M))    PR = tie-averaged percentile within grade and month
// Weights were chosen on 2022 entry dates of non-held-out sets and frozen. S is an uncalibrated
// historical ranking: S = 80 does not mean an 80% chance of profit.
//
// P is a completed month. Monthly prices come from the source's guide history (the only long
// series the app has) and are labelled by what they measure: the raw guide is ungraded and mixes
// conditions, the Grade 9 guide mixes PSA and BGS. Monthly sale medians from verified, deduped
// sale days are built too and replace the guide once a card has 13 consecutive sale months.
// Missing months stay missing: nothing is forward-filled to manufacture a qualifying history.
import {median} from './analysis.mjs';

export const RESEARCH_RANK={
 version:'research-rank-v1',
 weights:{momentum:.25,value:.75,lowVol:0},
 windowMonths:13,minDistinct:6,minPrice:25,minAgeMonths:12,
 // The newest completed month may be missing from some histories; a card may use the month before.
 maxLagMonths:2,
 // A percentile needs a real reference universe; smaller matching-sale pools use the guide instead.
 minReference:50,
 unsupportedSeries:['ME'],
 selection:'Selected on 2022 entry dates of non-held-out sets (labels matured by Dec 2023); frozen for 2024–2025 evaluation.',
};
export const EVIDENCE_RULES={minSaleDays:8,windowDays:180,recentDays:30,minMonths:6,monthsWindow:12,minDistinctPrices:3,freshDays:14};
export const GUIDE_KEY={raw:'raw',psa9:'grade9',psa10:'psa10'};
export const BASIS={
 raw:{key:'ungraded-guide',label:'Ungraded guide history (mixed condition, not NM-only)',matched:false,reason:'mixed-condition-basis'},
 psa9:{key:'grade9-guide',label:'Grade 9 guide history (PSA and BGS mixed)',matched:false,reason:'mixed-grader-basis'},
 psa10:{key:'psa10-guide',label:'PSA 10 guide history',matched:true},
 sales:{key:'matching-sales',label:'Monthly medians of matching sales',matched:true},
};
export const REASONS={
 'not-eligible':'Only rare and promo cards in the catalog are ranked.',
 'unverified-source':'The exact source product is not verified, so prices are withheld.',
 'cohort-not-validated':'This era has no completed history in the research, so it is not ranked.',
 'too-new':'The set is less than 12 months old; launch-period prices need a separate model.',
 'stale-source':'Source data is more than 14 days old. Refresh sales.',
 'no-history':'No monthly price history for this grade.',
 'history-gap':'Needs 13 consecutive completed months of price history.',
 'flat-history':'Monthly prices repeat too often (fewer than 6 distinct values in 13 months) to rank.',
 'below-floor':'Below the $25 research floor.',
 'mixed-condition-basis':'Ranked on the ungraded guide, which mixes conditions; not NM-specific evidence.',
 'mixed-grader-basis':'Ranked on the Grade 9 guide, which mixes PSA and BGS; not PSA-specific evidence.',
 'sales-gate':'Fewer than 8 sale days in 180 days, one in the last 30, across 6 of the last 12 months.',
 'identical-prices':'Recent matching sales repeat the same few prices; they cannot show confidence.',
};
export const monthIndex=s=>Number(String(s).slice(0,4))*12+Number(String(s).slice(5,7))-1;
export const monthName=t=>Math.floor(t/12)+'-'+String(t%12+1).padStart(2,'0');
const IF_DAY=86400000;

// Completed guide months only (strictly before `beforeMonth`), dollars.
export function guideMonthly(points,beforeMonth){
 const out=new Map();for(const [m,cents] of points||[])if(/^\d{4}-\d{2}$/.test(m)&&cents>0&&monthIndex(m)<beforeMonth)out.set(monthIndex(m),cents/100);return out;
}
// Verified sale days: deduped listings, raw NM only for raw, one median per day, one median of
// day medians per month. Sales after the cutoff day are ignored.
export function saleDays(sales,grade,lastDay){
 const seen=new Map();
 for(const s of sales||[]){
  if(s.grade!==grade||!(s.price>0)||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||s.date>lastDay)continue;
  if(grade==='raw'&&s.condition!=='NM')continue;
  const key=s.id||[s.date,s.price,s.title||''].join('|');if(!seen.has(key))seen.set(key,s);
 }
 const days=new Map();for(const s of seen.values())(days.get(s.date)||days.set(s.date,[]).get(s.date)).push(s.price);
 return [...days].map(([date,prices])=>({date,price:median(prices),sales:prices.length,prices})).sort((a,b)=>a.date.localeCompare(b.date));
}
export function saleMonthly(days,beforeMonth){
 const by=new Map();for(const d of days){const t=monthIndex(d.date);if(t<beforeMonth)(by.get(t)||by.set(t,[]).get(t)).push(d.price);}
 return new Map([...by].map(([t,ps])=>[t,median(ps)]));
}
// V, M, Q at month t from 13 consecutive months; null with a reason otherwise.
export function windowFeatures(series,t,rules=RESEARCH_RANK){
 const ps=[];for(let k=t-rules.windowMonths+1;k<=t;k++){const p=series.get(k);if(!(p>0))return {reason:'history-gap'};ps.push(p);}
 if(new Set(ps).size<rules.minDistinct)return {reason:'flat-history'};
 const price=ps.at(-1);if(price<rules.minPrice)return {reason:'below-floor',price};
 const lr=ps.slice(1).map((p,i)=>Math.log(p/ps[i])),mean=lr.reduce((a,b)=>a+b,0)/lr.length;
 return {t,price,M:Math.log(ps.at(-2)/ps[0]),V:Math.log(median(ps)/price),Q:-Math.sqrt(lr.reduce((s,x)=>s+(x-mean)**2,0)/lr.length),distinct:new Set(ps).size};
}
// Zero-based sorted rank / (N−1), ties averaged. Writes rows[i][out].
export function percentileRanks(rows,key,out){
 const a=[...rows].sort((x,y)=>x[key]-y[key]);
 for(let i=0;i<a.length;){let j=i+1;while(j<a.length&&a[j][key]===a[i][key])j++;for(let k=i;k<j;k++)a[k][out]=(i+j-1)/2/Math.max(1,a.length-1);i=j;}
 return rows;
}
export const rankScore=(r,w=RESEARCH_RANK.weights)=>100*(w.momentum*r.pm+w.value*r.pv+w.lowVol*r.pq);

// Exact-condition sales evidence (independent of the guide-based rank).
export function salesEvidence(sales,grade,now,rules=EVIDENCE_RULES){
 const today=new Date(now).toISOString().slice(0,10),todayN=Math.floor(now/IF_DAY);
 const days=saleDays(sales,grade,today).filter(d=>todayN-Math.floor(Date.parse(d.date)/IF_DAY)<=rules.windowDays);
 const recent=days.some(d=>todayN-Math.floor(Date.parse(d.date)/IF_DAY)<=rules.recentDays);
 const nowM=monthIndex(today),months=new Set(saleDays(sales,grade,today).map(d=>monthIndex(d.date)).filter(t=>t>nowM-rules.monthsWindow&&t<=nowM)).size;
 const distinct=new Set(days.flatMap(d=>d.prices)).size;
 const passes=days.length>=rules.minSaleDays&&recent&&months>=rules.minMonths;
 return {passes,saleDays:days.length,recent,months,distinctPrices:distinct,repeated:days.length>=rules.minDistinctPrices&&distinct<rules.minDistinctPrices};
}

const ifFresh=(market,now,rules)=>{const t=market?.research?.checkedAt||market?.observedAt;return t&&now-Date.parse(t)<=rules.freshDays*IF_DAY;};
export const releaseMonth=card=>card?.release?monthIndex(card.release):null;

// Research rank for every eligible card and grade at `now`. `release` maps set id → YYYY-MM-DD.
export function researchTable(entries,{now=Date.now(),release={},rules=RESEARCH_RANK,evidence=EVIDENCE_RULES}={}){
 const nowM=monthIndex(new Date(now).toISOString()),grades=['raw','psa9','psa10'],out=new Map();
 const candidates={guide:{},sales:{}};
 for(const [card,market] of entries){
  const entry={};out.set(card.id,entry);
  const base=[];
  if(!card.eligible)base.push('not-eligible');
  if((card.vintage||card.modern)&&!card.sourceVerified)base.push('unverified-source');
  if(rules.unsupportedSeries.includes(card.series))base.push('cohort-not-validated');
  const rel=release[card.setId]?monthIndex(release[card.setId]):null;
  for(const g of grades){
   const e={grade:g,reasons:[...base],rank:null,basis:null,features:null,t:null};entry[g]=e;
   e.salesEvidence=salesEvidence(market?.sales,g,now,evidence);
   if(!ifFresh(market,now,evidence))e.reasons.push('stale-source');
   if(base.length||!market)continue;
   // Exact matching-sale months are preferred; the labelled guide series is the fallback.
   const salesSeries=saleMonthly(saleDays(market.sales,g,new Date(now).toISOString().slice(0,10)),nowM);
   const guideSeries=guideMonthly(market.history?.[GUIDE_KEY[g]],nowM);
   e.options={};let why='no-history';
   for(const [kind,series] of [['guide',guideSeries],['sales',salesSeries]]){
    if(!series.size)continue;
    for(let t=nowM-1;t>=nowM-rules.maxLagMonths;t--){
     const f=windowFeatures(series,t,rules);
     if(f.reason){if(kind==='guide')why=f.reason;continue;}
     if(rel!=null&&rel>t-rules.minAgeMonths){if(kind==='guide')why='too-new';continue;}
     e.options[kind]={kind,...f};break;
    }
   }
   if(!e.options.guide&&!e.options.sales){e.reasons.push(why);continue;}
   e.ageRel=rel;
   for(const f of Object.values(e.options))(candidates[f.kind][g+'|'+f.t]||(candidates[f.kind][g+'|'+f.t]=[])).push({e,M:f.M,V:f.V,Q:f.Q});
  }
 }
 // Use matching-sale pools large enough to rank against; otherwise the guide pool.
 const pools=[];
 for(const [k,rows] of Object.entries(candidates.sales))if(rows.length>=rules.minReference)pools.push(['sales',k,rows]);
 const bySales=new Set(pools.flatMap(([,,rows])=>rows.map(r=>r.e)));
 for(const [k,rows] of Object.entries(candidates.guide))pools.push(['guide',k,rows.filter(r=>!bySales.has(r.e))]);
 const reference={};
 for(const [kind,k,rows] of pools){
  if(!rows.length)continue;
  percentileRanks(rows,'M','pm');percentileRanks(rows,'V','pv');percentileRanks(rows,'Q','pq');
  reference[kind+'|'+k]=rows.length;
  for(const r of rows){
   const f=r.e.options[kind];
   r.e.rank=Math.round(rankScore(r,rules.weights));r.e.t=monthName(f.t);r.e.basis=kind==='sales'?BASIS.sales:BASIS[r.e.grade];
   r.e.features={M:f.M,V:f.V,Q:f.Q,price:f.price};r.e.ageMonths=r.e.ageRel!=null?f.t-r.e.ageRel:null;
   r.e.reference={kind,grade:k.split('|')[0],month:monthName(Number(k.split('|')[1])),size:rows.length};r.e.percentiles={value:r.pv,momentum:r.pm};
  }
 }
 for(const entry of out.values())for(const e of Object.values(entry)){
  delete e.options;delete e.ageRel;
  if(e.rank!=null&&!e.basis.matched)e.reasons.push(e.basis.reason);
  if(!e.salesEvidence.passes)e.reasons.push('sales-gate');
  if(e.salesEvidence.repeated)e.reasons.push('identical-prices');
  e.evidenceStatus=evidenceStatus(e.reasons,e.rank);
 }
 return {version:rules.version,asOf:new Date(now).toISOString(),table:out,reference};
}
const UNSUPPORTED=new Set(['not-eligible','unverified-source','cohort-not-validated','too-new']);
const INSUFFICIENT=new Set(['stale-source','no-history','history-gap','flat-history','below-floor']);
export function evidenceStatus(reasons,rank){
 if(reasons.some(r=>UNSUPPORTED.has(r)))return 'unsupported';
 if(rank==null||reasons.some(r=>INSUFFICIENT.has(r)))return 'insufficient';
 return reasons.length?'limited':'supported';
}

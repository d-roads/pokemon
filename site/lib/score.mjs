// Investment score: a 0–100 rating of how good a buy each card looks today, per grade.
//
// It is built only from the app's own sales, monthly guide history and catalog, the same
// evidence used by Top movers and Potential investments. Five parts, each scored 0–100:
//   demand     how in-demand the card's character is (its cards sell above similar cards)
//   momentum   the trailing-year sold-price trend, weighted by how statistically clear it is
//   value      price vs. same-set, same-rarity cards of less popular characters, and distance
//              below a held multi-year high (a falling price earns less credit for being low)
//   liquidity  the sales-activity score: how often and how recently the card sells
//   stability  how tightly recent sales cluster around the median
//   scarcity   PSA 9 and PSA 10 only: how rarely PSA-graded copies reach this grade (PSA 10s, or
//              9-or-better for PSA 9), ranked against cards of the same era because gem rates
//              differ hugely between eras (Diamond & Pearl ~3% PSA 10, Sun & Moon ~40%)
// A card needs a confident sold price (the same evidence a buy target needs) and recent data,
// or it gets no score. Cards under the $25 floor are capped below "Good". Not a forecast.
import {median} from './analysis.mjs';
import {marketContext,demandOf,uptrendSignal,recoveringSignal,cheapSignal,INVEST_GRADES,INVEST_RULES} from './invest.mjs';

const SC_DAY=86400000,SC_YEAR=365.2425;
export const SCORE_RULES={
 minPrice:25,belowFloorCap:59,
 weights:{demand:.30,momentum:.25,value:.20,liquidity:.15,stability:.10},
 gradedWeights:{demand:.27,momentum:.22,value:.18,liquidity:.13,stability:.08,scarcity:.12},
 scarcity:{minGraded:30,minPeers:20},
 momentum:{minSales:5,minSpanDays:90,fullT:3,cap:.6,overheat:1.5,overheatScore:.45},
 value:{peerFull:.65,peerNone:1.5,minPeers:4,drawdownFull:.5,atHigh:.05,atHighScore:.35,lookbackMonths:60,skipMonths:3,sustainShare:.8,sustainMonths:3,fallingGrowth:-.15,fallingPenalty:.6},
 stability:{maxVolatility:.4},
 ratings:[[80,'Strong'],[65,'Good'],[50,'Fair'],[35,'Weak'],[0,'Poor']],
};
export const SCORE_PARTS=[['demand','Character demand'],['momentum','Price momentum'],['value','Value'],['liquidity','Liquidity'],['stability','Price stability'],['scarcity','Grade scarcity']];
export const weightsFor=(grade,rules=SCORE_RULES)=>grade==='raw'?rules.weights:rules.gradedWeights;
export const partsFor=(grade,rules=SCORE_RULES)=>SCORE_PARTS.filter(([k])=>k in weightsFor(grade,rules));
const SC_ERA={EX:'EX-era',DP:'Diamond & Pearl–HGSS',BW:'Black & White',XY:'XY',SM:'Sun & Moon'};

// Share of PSA-graded copies at this grade: PSA 10s for psa10, 9-or-better for psa9.
export function gradeShare(pop,grade,rules=SCORE_RULES.scarcity){
 const p=pop?.psa;if(!Array.isArray(p)||p.length<10||grade==='raw')return null;
 const total=p.reduce((a,b)=>a+(b>0?b:0),0);if(total<rules.minGraded)return null;
 const count=grade==='psa10'?p[9]:p[8]+p[9];
 return {share:count/total,count,total,tens:p[9],nines:p[8]};
}
// Sorted shares per grade, per era and catalog-wide, for percentile ranking.
export function scarcityTable(rows,rules=SCORE_RULES.scarcity){
 const table={};
 for(const g of ['psa10','psa9']){
  const era=new Map(),all=[];
  for(const r of rows){const s=gradeShare(r.market?.pop,g,rules);if(!s)continue;all.push(s.share);(era.get(r.card.series)||era.set(r.card.series,[]).get(r.card.series)).push(s.share);}
  for(const a of [all,...era.values()])a.sort((x,y)=>x-y);
  table[g]={all,era};
 }
 return table;
}
// Fraction of peers with a lower share (ties count half).
const scRank=(sorted,v)=>{let lo=0,eq=0;for(const x of sorted){if(x<v)lo++;else if(x===v)eq++;}return (lo+eq/2)/sorted.length;};
export function scarcityPart(table,row,grade,rules=SCORE_RULES.scarcity){
 const s=gradeShare(row.market?.pop,grade,rules);
 if(!s)return {score:50,neutral:true,detail:`Fewer than ${rules.minGraded} PSA-graded copies on record (or no population count captured). Counted as average.`};
 const eraPeers=table[grade].era.get(row.card.series)||[],useEra=eraPeers.length>=rules.minPeers,peers=useEra?eraPeers:table[grade].all;
 if(peers.length<rules.minPeers)return {score:50,neutral:true,detail:'Too few cards with population counts to compare against. Counted as average.'};
 const rarer=1-scRank(peers,s.share),pct=v=>v<.01&&v>0?'<1%':Math.round(v*100)+'%';
 const what=grade==='psa10'?`${pct(s.share)} of ${s.total.toLocaleString('en-US')} PSA-graded copies are PSA 10 (${s.tens.toLocaleString('en-US')})`
  :`${pct(s.share)} of ${s.total.toLocaleString('en-US')} PSA-graded copies reached PSA 9 or better (${s.nines.toLocaleString('en-US')} PSA 9, ${s.tens.toLocaleString('en-US')} PSA 10)`;
 return {score:Math.round(rarer*100),share:s.share,graded:s.total,
  detail:`${what}: a lower rate than ${Math.round(rarer*100)}% of ${useEra?SC_ERA[row.card.series]||row.card.series:'all'} cards with ${rules.minGraded}+ graded.`};
}
const SC_HISTORY_KEY={raw:'raw',psa9:'grade9',psa10:'psa10'};
const scClamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const scDay=iso=>Math.floor(Date.parse(iso)/SC_DAY);
const scMoney=v=>'$'+(v>=100?Math.round(v).toLocaleString('en-US'):v.toFixed(2));
const scPct=v=>(v>0?'+':v<0?'−':'')+Math.abs(Math.round(v*100))+'%';
export const scoreRating=score=>score==null?null:SCORE_RULES.ratings.find(([min])=>score>=min)[1];

// Log-price regression over the trailing year of matching sales. Looser than the uptrend
// signal: it measures direction and clarity rather than deciding whether to list a card.
export function priceMomentum(a,endDay,rules=SCORE_RULES.momentum){
 const year=a.comparable.filter(s=>endDay-scDay(s.date)>=0&&endDay-scDay(s.date)<365),mid=median(year.map(s=>s.price));
 if(mid==null)return null;
 const rows=year.filter(s=>s.price>=mid*.4&&s.price<=mid*2.5);if(rows.length<rules.minSales)return null;
 const ages=rows.map(s=>endDay-scDay(s.date)),span=Math.max(...ages)-Math.min(...ages);if(span<rules.minSpanDays)return null;
 const pts=rows.map((s,i)=>({x:-ages[i]/SC_YEAR,y:Math.log(s.price)})),n=pts.length;
 const mx=pts.reduce((t,p)=>t+p.x,0)/n,my=pts.reduce((t,p)=>t+p.y,0)/n,sxx=pts.reduce((t,p)=>t+(p.x-mx)**2,0);if(!sxx)return null;
 const slope=pts.reduce((t,p)=>t+(p.x-mx)*(p.y-my),0)/sxx,resid=pts.map(p=>p.y-(my+slope*(p.x-mx)));
 const se=n>2?Math.sqrt(resid.reduce((t,r)=>t+r*r,0)/(n-2)/sxx):Infinity,t=se>0?slope/se:(slope?Math.sign(slope)*99:0);
 return {growth:Math.exp(slope)-1,t,sales:n,months:Math.round(span/30.44)};
}
// Distance below the highest monthly guide price that was actually held for a few months.
export function heldHigh(history,rules=SCORE_RULES.value){
 const h=(history||[]).map(([ym,cents])=>[ym,cents/100]).filter(([,v])=>v>0);
 if(h.length<12)return null;
 const window=h.slice(-rules.lookbackMonths),candidates=window.slice(0,-rules.skipMonths);if(!candidates.length)return null;
 // The highest level the guide sat at (within sustainShare) for sustainMonths or more.
 const held=candidates.map(([ym,v])=>[ym,v,window.filter(([,w])=>w>=v*rules.sustainShare).length]).filter(x=>x[2]>=rules.sustainMonths);
 if(!held.length)return null;
 const [peakMonth,peak]=held.reduce((best,x)=>x[1]>best[1]?x:best),latest=h.at(-1)[1];
 return {peak,peakMonth,latest,drawdown:Math.max(0,1-latest/peak)};
}
function peerValue(ctx,row,grade,demand,rules){
 if(row.card.category==='Promo')return null;
 const a=row.analyses[grade],own=demand?.score??null;
 const prices=(ctx.bySet.get(row.card.setId)||[]).filter(r=>r!==row&&!r.stale&&r.card.category===row.card.category).map(r=>{const p=r.analyses[grade].current;if(!(p>0))return null;if(own==null)return p;const d=demandOf(ctx,r);return d&&d.score<=own?p:null;}).filter(v=>v!=null);
 if(prices.length<rules.minPeers)return null;
 const typical=median(prices);return {ratio:a.fair/typical,typical,peers:prices.length};
}
const scMonth=ym=>{const [y,m]=ym.split('-');return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m)-1]+' '+y;};

export function scoreCard(ctx,row,grade,rules=SCORE_RULES,scarcity=null){
 const a=row.analyses[grade];
 if(row.stale)return {score:null,reason:'Sales data is out of date. Refresh sales to score this card.'};
 if(!(a.fair>0))return {score:null,reason:'Needs at least 3 matching sales in 180 days, including one in the last 90, before it can be scored.'};
 const parts={},demand=demandOf(ctx,row);
 // Demand
 parts.demand=demand?{score:demand.score,detail:`${demand.name} cards sell about ${Math.exp(demand.premium).toFixed(1)}× comparable cards${demand.activity!=null?`, ${Math.round(demand.activity)} sales per card in 6 months`:''}.`}
  :{score:50,neutral:true,detail:'Too few priced cards of this character to rate its demand. Counted as average.'};
 // Momentum
 const m=priceMomentum(a,row.endDay,rules.momentum);
 if(!m)parts.momentum={score:50,neutral:true,detail:'Not enough sales across the past year to measure a trend. Counted as flat.'};
 else if(m.growth>rules.momentum.overheat)parts.momentum={score:Math.round(rules.momentum.overheatScore*100),detail:`Up about ${scPct(m.growth)} a year across ${m.sales} sales: too fast to trust, so it earns no momentum credit.`};
 else{const clarity=scClamp(Math.abs(m.t)/rules.momentum.fullT),s=.5+.5*scClamp(m.growth/rules.momentum.cap,-1,1)*clarity;
  parts.momentum={score:Math.round(s*100),growth:m.growth,detail:`${scPct(m.growth)} a year across ${m.sales} sales over ${m.months} months${clarity<1?` (trend only ${Math.round(clarity*100)}% clear)`:''}.`};}
 // Value
 const vr=rules.value,peer=peerValue(ctx,row,grade,demand,vr),high=heldHigh(row.market.history?.[SC_HISTORY_KEY[grade]],vr),vals=[],notes=[];
 if(peer){vals.push(scClamp(1-.8*(peer.ratio-vr.peerFull)/(vr.peerNone-vr.peerFull),.2,1));notes.push(`${peer.ratio<1?Math.round((1-peer.ratio)*100)+'% below':Math.round((peer.ratio-1)*100)+'% above'} the ${scMoney(peer.typical)} median of ${peer.peers} ${row.card.category} cards of ${demand?'no more popular':'other'} characters in ${row.card.setName}`);}
 if(high){let v=high.drawdown<vr.atHigh?vr.atHighScore:.4+.6*scClamp(high.drawdown/vr.drawdownFull);const falling=m&&m.growth<=vr.fallingGrowth&&m.t<=-2;if(falling&&high.drawdown>=vr.atHigh)v*=vr.fallingPenalty;vals.push(v);
  notes.push(high.drawdown<vr.atHigh?`at or near its ${scMonth(high.peakMonth)} high of ${scMoney(high.peak)}`:`${Math.round(high.drawdown*100)}% below its ${scMonth(high.peakMonth)} high of ${scMoney(high.peak)}${falling?', but still falling':''}`);}
 parts.value=vals.length?{score:Math.round(vals.reduce((s,v)=>s+v,0)/vals.length*100),detail:notes.map((n,i)=>i?n:n[0].toUpperCase()+n.slice(1)).join('; ')+'.'}
  :{score:50,neutral:true,detail:'No same-set peers or price history to compare against. Counted as fair value.'};
 // Liquidity and stability
 parts.liquidity={score:a.score??0,detail:`${a.recent} matching sale${a.recent===1?'':'s'} in the last 90 days; most recent ${a.latestAge===0?'today':a.latestAge+' day'+(a.latestAge===1?'':'s')+' before the data check'}.`};
 const vol=a.volatility||0;parts.stability={score:Math.round((1-scClamp(vol/rules.stability.maxVolatility))*100),detail:`Recent sales sit a typical ${Math.round(vol*100)}% from the ${scMoney(a.fair)} median.`};
 if(grade!=='raw')parts.scarcity=scarcityPart(scarcity||scarcityTable(ctx.rows,rules.scarcity),row,grade,rules.scarcity);
 const weights=weightsFor(grade,rules),keys=partsFor(grade,rules);
 let score=Math.round(keys.reduce((s,[k])=>s+weights[k]*parts[k].score,0));
 const belowFloor=a.fair<rules.minPrice;if(belowFloor)score=Math.min(score,rules.belowFloorCap);
 const signals=demand?[uptrendSignal(a,row.endDay),recoveringSignal(a,row.market.history?.[SC_HISTORY_KEY[grade]],row.endDay),cheapSignal(ctx,row,grade,demand)].filter(Boolean).map(s=>s.type):[];
 return {score,rating:scoreRating(score),price:a.fair,priceLabel:a.priceLabel,belowFloor,signals,
  parts:keys.map(([key,label])=>({key,label,weight:weights[key],...parts[key]}))};
}

// Scores for every eligible card and grade. `full` keeps each breakdown; `compact` is
// {card_id: [psa10, psa9, raw]} with null where a grade can't be scored.
export function investmentScores(entries,{now=Date.now(),rules=SCORE_RULES}={}){
 const ctx=marketContext(entries,{now,rules:INVEST_RULES}),scarcity=scarcityTable(ctx.rows,rules.scarcity),full=new Map(),compact={};
 for(const row of ctx.rows){
  const byGrade={};for(const g of INVEST_GRADES)byGrade[g]=scoreCard(ctx,row,g,rules,scarcity);
  full.set(row.card.id,byGrade);
  if(INVEST_GRADES.some(g=>byGrade[g].score!=null))compact[row.card.id]=INVEST_GRADES.map(g=>byGrade[g].score);
 }
 const stamps=ctx.rows.map(r=>r.market?.research?.checkedAt||r.market?.observedAt).filter(Boolean).sort();
 return {checkedAt:stamps.at(-1)||null,grades:INVEST_GRADES,scores:compact,full};
}

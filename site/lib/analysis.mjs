export const gradeNames={raw:'Raw · near mint',psa9:'PSA 9',psa10:'PSA 10'};
export const median=a=>a.length?[...a].sort((a,b)=>a-b).reduce((_,x,i,s)=>i===Math.floor(s.length/2)?(s.length%2?x:(s[i-1]+x)/2):_,null):null;
const DAY=86400000,YEAR_DAYS=365.2425;

// Daily medians stop a single busy day dominating the regression. A chronological
// holdout must beat an unchanged-price baseline before extrapolation is shown.
export function trendProjection(comparable,current,now=Date.now()){
 const unique=new Map();
 for(const s of comparable||[]){
  const date=Date.parse(s.date),age=(now-date)/DAY;
  if(!Number.isFinite(s.price)||s.price<=0||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==s.date||age<0||age>365)continue;
  const key=s.id||[s.date,s.price,s.title||''].join('|');if(!unique.has(key))unique.set(key,s);
 }
 const rows=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date));
 const fail=reason=>({available:false,rows,reason});
 if(!Number.isFinite(current)||current<=0||rows.length<8)return fail('Not enough information');
 const days=new Map();for(const s of rows)(days.get(s.date)||days.set(s.date,[]).get(s.date)).push(s.price);
 const points=[...days].map(([date,prices])=>({x:Date.parse(date)/DAY,y:median(prices)})),spanDays=points.at(-1).x-points[0].x;
 if(points.length<8||spanDays<180||now/DAY-points.at(-1).x>90)return fail('Needs 8 sale days spanning 6 months, with a sale in the last 90 days.');
 const fit=ps=>{const mx=ps.reduce((n,p)=>n+p.x,0)/ps.length,my=ps.reduce((n,p)=>n+p.y,0)/ps.length,sxx=ps.reduce((n,p)=>n+(p.x-mx)**2,0);const slope=ps.reduce((n,p)=>n+(p.x-mx)*(p.y-my),0)/sxx;return {slope,predict:x=>my+slope*(x-mx)};};
 const split=Math.min(points.length-3,Math.floor(points.length*.7)),train=points.slice(0,split),holdout=points.slice(split),model=fit(train),cutoff=train.at(-1).x;
 const trainingSales=rows.filter(s=>Date.parse(s.date)/DAY<=cutoff).map(s=>({...s,grade:'raw',condition:'NM'}));
 const baseline=analyze({sales:trainingSales},'raw',15,cutoff*DAY).fair;
 if(!(baseline>0))return fail('Not enough matching training sales to validate a trend.');
 const mape=holdout.reduce((n,p)=>n+Math.abs(baseline+model.slope*(p.x-cutoff)-p.y)/p.y,0)/holdout.length;
 const baselineMape=holdout.reduce((n,p)=>n+Math.abs(baseline-p.y)/p.y,0)/holdout.length;
 if(!Number.isFinite(mape)||mape>.35||mape>baselineMape+1e-9)return fail('Trend did not pass a held-out sales check against an unchanged-price baseline.');
 const annualIncrease=fit(points).slope*YEAR_DAYS;
 if(!Number.isFinite(annualIncrease)||annualIncrease/current>1.5||annualIncrease/current<-.8)return fail('Trend is too extreme to extrapolate reliably.');
 const values=[1,2,3].map(years=>Math.max(0,Math.round((current+annualIncrease*years)*100)/100));
 return {available:true,rows,sampleCount:rows.length,saleDays:points.length,spanDays,annualIncrease,values,validation:{mape,baselineMape,saleDays:holdout.length,spanDays:holdout.at(-1).x-train.at(-1).x},method:'Daily-median linear trend; illustrative, not a validated multi-year forecast'};
}
export function analyze(market,grade,discount=15,now=Date.now()){
 const today=Math.floor(now/86400000),age=s=>today-Math.floor(Date.parse(s.date)/86400000),unique=new Map();
 for(const s of market?.sales||[]){
  if(s.grade!==grade||!(s.price>0)||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!Number.isFinite(Date.parse(s.date))||new Date(s.date).toISOString().slice(0,10)!==s.date||age(s)<0)continue;
  const key=s.id||[s.date,s.grade,s.price,s.condition,s.title].join('|');if(!unique.has(key))unique.set(key,s);
 }
 const all=[...unique.values()].sort((a,b)=>b.date.localeCompare(a.date)),comparable=all.filter(s=>grade!=='raw'||s.condition==='NM');
 const candidates=comparable.filter(s=>age(s)<=180);
 let windowDays=180,usable=candidates,filtered=candidates;
 for(const days of [30,90,180]){const sample=candidates.filter(s=>age(s)<=days),middle=median(sample.map(s=>s.price)),clean=sample.filter(s=>s.price>=middle*.4&&s.price<=middle*2.5);if(clean.length>=3||days===180){usable=sample;filtered=clean;windowDays=days;break;}}
 const sampleMedian=median(filtered.map(s=>s.price));
 const guideKey=grade==='psa9'?'grade9':grade,guidePrice=market?.guide?.[guideKey]>0?market.guide[guideKey]:null;
 const current=sampleMedian??(grade==='psa9'?null:guidePrice),priceSource=sampleMedian!=null?'sales':current!=null?'guide':'missing';
 const latestAge=comparable.length?age(comparable[0]):Infinity,recent=comparable.filter(s=>age(s)<=90);
 const sufficient=filtered.length>=3&&filtered.some(s=>age(s)<=90);
 const score=comparable.length?Math.min(100,Math.round(Math.min(70,recent.length*7)+Math.max(0,30*(1-latestAge/90)))):null;
 const volatility=sampleMedian?median(filtered.map(s=>Math.abs(s.price-sampleMedian)))/sampleMedian:0;
 const priceLabel=priceSource==='sales'?(filtered.length>=3?windowDays+'-day sold median':filtered.length+' matching sale'+(filtered.length===1?'':'s')+' · limited sample'):priceSource==='missing'?'No recent matching sales':grade==='raw'?'Raw guide · mixed condition':'PSA 10 source guide';
 const reason=sufficient?filtered.length+' '+gradeNames[grade]+' sales in '+windowDays+' days. Buy limit is '+discount+'% below the median, before shipping and tax.':!comparable.length?'No matching '+gradeNames[grade]+' sales have been loaded.':'A target needs at least 3 matching sales in 180 days, including one in the last 90 days.';
 return {grade,all,comparable,usable:filtered,current,guidePrice,guideSource:market?.guideSources?.[guideKey],priceSource,priceLabel,windowDays,sampleCount:filtered.length,fair:sufficient?sampleMedian:null,target:sufficient?Math.floor(sampleMedian*(1-discount/100)*100)/100:null,discount,score,recent:recent.length,confidence:sufficient?(filtered.length>=10&&volatility<.2?'Moderate':'Limited'):'Insufficient',volatility,latestAge,excluded:usable.length-filtered.length,reason};
}

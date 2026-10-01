export const gradeNames={raw:'Raw · near mint',psa9:'PSA 9',psa10:'PSA 10'};
export const median=a=>a.length?[...a].sort((a,b)=>a-b).reduce((_,x,i,s)=>i===Math.floor(s.length/2)?(s.length%2?x:(s[i-1]+x)/2):_,null):null;
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

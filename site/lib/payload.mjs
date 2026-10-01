// A compact market summary for the catalog list: guide prices plus the last ~13 months of
// matching sales as [date, price, grade code, condition]. Full records (titles, links,
// monthly history, population) are loaded per card from /api/market.
const GRADE_CODE={raw:0,psa9:9,psa10:10};
export function lightMarket(m,now=Date.now()){
 if(!m)return null;
 const since=new Date(now-400*86400000).toISOString().slice(0,10);
 return {guide:m.guide||{},observedAt:m.observedAt,source:m.source,status:m.status,research:m.research?{status:m.research.status,checkedAt:m.research.checkedAt}:undefined,
  s:(m.sales||[]).filter(s=>s.date>=since&&s.grade in GRADE_CODE).map(s=>[s.date,s.price,GRADE_CODE[s.grade],s.condition||''])};
}

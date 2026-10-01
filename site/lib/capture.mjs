// Full PriceCharting card-page captures.
//
// A capture is everything one product page shows: the guide prices, the monthly price
// history per grade, PSA/CGC population counts, and every sold-listing row in the
// Ungraded, Grade 9 and PSA 10 tables. Rows are classified once, with the same title
// rules used everywhere else, and stored compactly:
//   sales: [date, price, grade, condition, marketplace, ref, title]
import {gradeOf,conditionOf,matchesCard} from './sales.mjs';

// The page table a row was listed under must agree with the grade its title states.
const SECTION_GRADE={used:'raw',graded:'psa9','manual-only':'psa10'};
const GRADE_SECTION={raw:'used',psa9:'graded',psa10:'manual-only'};
const MARKET={e:'eBay',t:'TCGPlayer',o:'Other'};

export function classifyCapture(page,card){
 const guide={};
 const g=page.guide||{};
 if(g.used_price>0)guide.raw=g.used_price;
 if(g.graded_price>0)guide.grade9=g.graded_price;
 if(g.manual_only_price>0)guide.psa10=g.manual_only_price;
 if(g.new_price>0)guide.grade8=g.new_price;
 if(g.complete_price>0)guide.grade7=g.complete_price;
 const history={};
 for(const [from,to] of [['used','raw'],['graded','grade9'],['manualonly','psa10']])if(page.chart?.[from]?.length)history[to]=page.chart[from];
 const sales=[],excluded={raw:0,psa9:0,psa10:0},cutoff={},seen=new Set();
 for(const [section,date,price,,rowId,title,ref] of page.rows||[]){
  const expected=SECTION_GRADE[section];if(!expected)continue;
  if(!cutoff[expected]||date<cutoff[expected])cutoff[expected]=date;
  const grade=gradeOf(title);
  if(grade!==expected||!(price>0)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!matchesCard(title,card)){excluded[expected]++;continue;}
  const market=/^tcgplayer/i.test(rowId)?'t':/^ebay/i.test(rowId)||/^ebay:/.test(ref||'')?'e':'o';
  const key=(rowId||ref||'')+'|'+date+'|'+price;if(seen.has(key))continue;seen.add(key);
  sales.push([date,price,grade,grade==='raw'?conditionOf(title):'',market,rowId||ref||'',title.slice(0,160)]);
 }
 sales.sort((a,b)=>b[0].localeCompare(a[0]));
 return {fetchedAt:page.fetchedAt,url:page.url,productId:page.productId||null,name:page.name||'',guide,history,pop:page.pop||null,cutoff,excluded,sales};
}

export function saleSource(ref,fallback){
 const m=String(ref||'').match(/^ebay[-:](\d{6,})$/);return m?'https://www.ebay.com/itm/'+m[1]:fallback;
}

export function expandCapture(record,card){
 const source=record.url||card.source;
 const sales=record.sales.map(([date,price,grade,condition,market,ref,title])=>({id:'pc|'+(ref||date+'|'+price)+'|'+grade,number:card.number,grade,date,price,condition,marketplace:MARKET[market]||'eBay',provenance:'PriceCharting reported sale',source:saleSource(ref,source),title}));
 const guideSources=Object.fromEntries(Object.keys(record.guide).map(k=>[k,{name:'PriceCharting',url:source,observedAt:record.fetchedAt}]));
 return {number:card.number,guide:record.guide,guideSources,sales,observedAt:record.fetchedAt,source:'PriceCharting',sourceUrl:source,status:'researched',history:record.history,pop:record.pop,
  research:{status:'full',checkedAt:record.fetchedAt,sourceUrl:source,gradesChecked:['raw','psa9','psa10'],cutoff:record.cutoff,excluded:record.excluded,rows:record.sales.length}};
}

// Older excerpt-based observations came from the same pages. Keep an older sale only when it
// predates the oldest row the full page still shows for that grade, so nothing is counted twice.
export function mergeCapture(previous,captured){
 if(!previous)return captured;
 const cutoff=captured.research?.cutoff||{};
 const older=(previous.sales||[]).filter(s=>GRADE_SECTION[s.grade]&&cutoff[s.grade]&&s.date<cutoff[s.grade]);
 const guide={...previous.guide,...captured.guide},guideSources={...previous.guideSources,...captured.guideSources};
 return {...previous,...captured,guide,guideSources,sales:[...captured.sales,...older].sort((a,b)=>b.date.localeCompare(a.date))};
}

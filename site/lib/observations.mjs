// Immutable observation log for investment research.
//
// market_cache keeps only the newest merged record per card. Research needs to know what was
// known *when*, so every capture is also appended here, split into sale, guide and population
// rows. Nothing is updated or deleted: a corrected value arrives as a new row with a different
// content hash, and the as-of layer (as-of.mjs) picks the latest version available at a cutoff.
//
// available_at is the time this app first held the value (the capture time). It is never set
// to the sale or month date: a 2023 sale first captured in 2026 was not available in 2023.

// 64-bit FNV-1a style hash, synchronous so it works the same in Node and the Worker.
export function contentHash(value){
 const s=typeof value==='string'?value:JSON.stringify(value);
 let a=0x811c9dc5,b=0x01000193^0x5bd1e995;
 for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a=Math.imul(a^c,0x01000193)>>>0;b=Math.imul(b^c,0x5bd1e995)>>>0;b=(b^(b>>>15))>>>0;}
 return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
}
export const GUIDE_BASIS={
 raw:'PriceCharting ungraded guide (mixed condition)',
 grade9:'PriceCharting Grade 9 guide (PSA and BGS mixed)',
 psa10:'PriceCharting PSA 10 guide',
 grade8:'PriceCharting Grade 8 guide',grade7:'PriceCharting Grade 7 guide',
};
export const SALE_BASIS='Reported sold item price (excludes shipping, tax and fees)';
const obsMonthEnd=ym=>{const [y,m]=ym.split('-').map(Number);return new Date(Date.UTC(y,m,0,23,59,59)).toISOString();};

export function completenessOf(market){
 const r=market?.research;
 if(r?.status==='full')return r.coverage?.completeEbayHistory===false||!r.coverage?'source-page-excerpt':'source-page';
 if(market?.sales?.length)return 'partial-sales';
 return 'guide-only';
}

// Split one capture into observation rows. `market` is what was just fetched, not a merge.
export function observationRows(card,market,{recordedAt=new Date().toISOString()}={}){
 const capturedAt=market?.research?.checkedAt||market?.observedAt;
 if(!card||!market||!capturedAt||!Number.isFinite(Date.parse(capturedAt)))return null;
 const parser=market.research?.parserVersion||market.parserVersion||'unversioned';
 const completeness=completenessOf(market),source=market.sourceUrl||card.source||null;
 const sales=(market.sales||[]).filter(s=>s.price>0&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&s.date<=capturedAt.slice(0,10)&&['raw','psa9','psa10'].includes(s.grade)).map(s=>{
  const listing=String(s.id||[s.date,s.price,s.title].join('|'));
  const content={date:s.date,price:s.price,grade:s.grade,condition:s.condition||'',title:s.title||'',marketplace:s.marketplace||''};
  return {card_id:card.id,printing:card.printing||null,language:card.lang||'en',grade:s.grade,grader:s.grade==='raw'?null:'PSA',condition:s.grade==='raw'?(s.condition||'Unknown'):null,event_at:s.date,available_at:capturedAt,captured_at:capturedAt,listing_id:listing,marketplace:s.marketplace||null,currency:'USD',price:s.price,price_basis:SALE_BASIS,source_url:s.source||source,parser_version:parser,completeness,content_hash:contentHash(content),recorded_at:recordedAt};
 });
 const guides=[];
 for(const [key,value] of Object.entries(market.guide||{}))if(value>0&&GUIDE_BASIS[key])guides.push({card_id:card.id,guide:key,period:'current',price:value,price_basis:GUIDE_BASIS[key],event_at:capturedAt,available_at:capturedAt,captured_at:capturedAt,source_url:source,parser_version:parser,content_hash:contentHash([value]),recorded_at:recordedAt});
 for(const [key,points] of Object.entries(market.history||{}))for(const [ym,cents] of points||[]){
  if(!/^\d{4}-\d{2}$/.test(ym)||!(cents>0))continue;
  const end=obsMonthEnd(ym),event=end<capturedAt?end:capturedAt;
  // A point for the month still in progress is a partial value; it is kept but labelled.
  guides.push({card_id:card.id,guide:key,period:ym,price:cents/100,price_basis:GUIDE_BASIS[key]+(end>capturedAt?' · partial month':''),event_at:event,available_at:capturedAt,captured_at:capturedAt,source_url:source,parser_version:parser,content_hash:contentHash([cents,end>capturedAt]),recorded_at:recordedAt});
 }
 const psa=market.pop?.psa;
 const population=Array.isArray(psa)?{card_id:card.id,grader:'PSA',counts:JSON.stringify(psa),captured_at:capturedAt,available_at:capturedAt,source_url:source,parser_version:parser,content_hash:contentHash(psa),recorded_at:recordedAt}:null;
 const marketRow={card_id:card.id,captured_at:capturedAt,available_at:capturedAt,source:market.source||null,source_url:source,product_id:market.research?.productId||null,parser_version:parser,completeness,sales:sales.length,content_hash:contentHash({capturedAt,guide:market.guide,sales:sales.map(s=>s.content_hash),history:guides.length,pop:psa||null}),recorded_at:recordedAt};
 return {market:marketRow,sales,guides,population};
}

const obsInsert=(db,table,row)=>{const cols=Object.keys(row);return db.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...cols.map(c=>row[c]));};
// Append a capture. Rows already stored (same content) are ignored, so re-recording is harmless.
export async function recordObservations(db,card,market,options){
 const rows=observationRows(card,market,options);if(!rows)return {recorded:false};
 const statements=[obsInsert(db,'market_observations',rows.market),...rows.sales.map(r=>obsInsert(db,'sales_observations',r)),...rows.guides.map(r=>obsInsert(db,'guide_observations',r))];
 if(rows.population)statements.push(obsInsert(db,'population_observations',rows.population));
 await db.batch(statements);
 return {recorded:true,sales:rows.sales.length,guides:rows.guides.length,population:!!rows.population};
}

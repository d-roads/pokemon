import {makeSale,dedupeSales} from './sales.mjs';
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));
const htmlText=s=>decode(s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
const dollars=s=>{const m=s.replace(/<s\b[^>]*>[\s\S]*?<\/s>/gi,'').match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);return m?Number(m[1].replace(/,/g,'')):null;};
export function parseMarket(html,card){
 if(!/pricecharting/i.test(html))throw new Error('The price source did not return a card page.');
 const guide={},sales=[],rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1]);
 for(const [key,id]of [['raw','used_price'],['grade9','graded_price'],['psa10','manual_only_price']]){
  const cell=html.match(new RegExp('<(?:td|div)\\b[^>]*id=["\x27]'+id+'["\x27][^>]*>([\\s\\S]*?)<\\/(?:td|div)>','i'))?.[1];
  const value=cell?dollars(cell):null;if(value>0)guide[key]=value;
 }
 let headers=[];
 for(const row of rows){
  const cells=[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>m[1]),plain=htmlText(row);
  const labels=cells.map(htmlText);
  if(labels.some(s=>s==='Ungraded')&&labels.some(s=>s==='PSA 10')){headers=labels;continue;}
  if(headers.length&&cells.some(c=>dollars(c)>0)){
   for(const [key,label]of [['raw','Ungraded'],['grade9','Grade 9'],['psa10','PSA 10']]){const index=headers.indexOf(label),value=index>=0?dollars(cells[index]||''):null;if(value>0)guide[key]=value;}
   headers=[];
  }
  for(const [key,label]of [['raw','Ungraded'],['grade9','Grade 9'],['psa10','PSA 10']])if(new RegExp('^'+label+'\\s+\\$').test(plain)){const value=dollars(row);if(value>0)guide[key]=value;}
  const date=plain.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];if(!date)continue;
  const titleCell=row.match(/<td\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1];
  const priceCell=row.match(/<td\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1];if(!titleCell||!priceCell)continue;
  const listingUrl=decode(titleCell.match(/href=["']([^"']+)["']/i)?.[1]||'');
  const safe=/^https:\/\/([^/]+\.)?(ebay\.(com|nl|co\.uk)|tcgplayer\.com)\//i.test(listingUrl);
  const sale=makeSale({date,title:htmlText(titleCell),price:dollars(priceCell),listingUrl,source:safe?listingUrl:card.source,marketplace:/tcgplayer/i.test(listingUrl)?'TCGPlayer':'eBay'},card);if(sale)sales.push(sale);
 }
 if(!Object.keys(guide).length&&!sales.length)throw new Error('The price source format could not be read.');
 return {number:card.number,guide,sales:dedupeSales(sales),observedAt:new Date().toISOString(),source:'PriceCharting',sourceUrl:card.source,status:'refreshed'};
}
export function parseSet(html,cards){
 const result={};
 for(const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const row=m[1],title=row.match(/<td\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1];if(!title)continue;
  const name=htmlText(title),n=name.match(/#(XY\d+|RC\d+|\d+)(?![a-z0-9])/i)?.[1]?.toUpperCase();if(!n||name.includes('['))continue;
  const normalize=n=>String(n).toUpperCase().replace(/^(XY|RC)0+(?=\d)/,'$1');
  const card=cards.find(c=>normalize(c.number)===normalize(n));if(!card)continue;
  const values=[...row.matchAll(/<td\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)].map(x=>dollars(x[1]));
  if(values.length<3||!values[0])continue;
  result[card.id]={number:card.number,guide:{raw:values[0],grade9:values[1],psa10:values[2]},sales:[],observedAt:new Date().toISOString(),source:'PriceCharting',sourceUrl:card.source,status:'refreshed'};
 }
 if(!Object.keys(result).length)throw new Error('The set price guide could not be read.');return result;
}
export async function sourceFetch(url,env){
 if(env.NETWORK_DISABLED)throw new Error('Live sales refresh is unavailable in this workspace. Showing the last researched sales.');
 const r=await fetch(url,{headers:{Accept:'text/html','User-Agent':'PrimalWatch/1.0 (collector price tracker)'},signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw new Error('The price source is unavailable ('+r.status+'). Showing saved observations.');
 const html=await r.text();if(html.length>3500000)throw new Error('The source response was too large.');return html;
}

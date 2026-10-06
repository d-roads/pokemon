
import {classifyCapture,expandCapture} from './capture.mjs';
import {matchesCard} from './sales.mjs';
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));
const htmlText=s=>decode(s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
const dollars=s=>{const m=s.replace(/<s\b[^>]*>[\s\S]*?<\/s>/gi,'').match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);return m?Number(m[1].replace(/,/g,'')):null;};
const GUIDE_IDS=['used_price','complete_price','new_price','graded_price','box_only_price','manual_only_price'];
const LEGACY={raw:'used_price',grade9:'graded_price',psa10:'manual_only_price'};

// Parse a PriceCharting product page into the same shape the research capture uses.
export function parsePage(html){
 if(!/pricecharting/i.test(html))throw new Error('The price source did not return a card page.');
 const guide={};
 for(const id of GUIDE_IDS){const cell=html.match(new RegExp('<(?:td|div)\\b[^>]*id=["\x27]'+id+'["\x27][^>]*>([\\s\\S]*?)<\\/(?:td|div)>','i'))?.[1];const v=cell?dollars(cell):null;if(v>0)guide[id]=v;}
 // Older layouts: a horizontal table with Ungraded / Grade 9 / PSA 10 headings.
 let headers=[];
 for(const row of [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>m[1])){
  const cells=[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>m[1]),labels=cells.map(htmlText);
  if(labels.includes('Ungraded')&&labels.includes('PSA 10')){headers=labels;continue;}
  if(headers.length&&cells.some(c=>dollars(c)>0)){for(const [key,label] of [['raw','Ungraded'],['grade9','Grade 9'],['psa10','PSA 10']]){const i=headers.indexOf(label),v=i>=0?dollars(cells[i]||''):null;if(v>0&&!guide[LEGACY[key]])guide[LEGACY[key]]=v;}headers=[];}
 }
 const h1=html.match(/<h1\b[^>]*id=["']product_name["'][^>]*>([\s\S]*?)<\/h1>/i);
 const productId=html.match(/<h1\b[^>]*id=["']product_name["'][^>]*title=["'](\d+)["']/i)?.[1]||null;
 let chart=null;try{const m=html.match(/VGPC\.chart_data\s*=\s*(\{[\s\S]*?\});/);if(m){const cd=JSON.parse(m[1]);chart={};for(const k of ['used','graded','manualonly'])if(cd[k])chart[k]=cd[k].filter(p=>p[1]>0).map(p=>[new Date(p[0]).toISOString().slice(0,7),p[1]]);}}catch{chart=null;}
 let pop=null;try{const m=html.match(/VGPC\.pop_data\s*=\s*(\{[\s\S]*?\}|null);/);if(m)pop=JSON.parse(m[1]);}catch{pop=null;}
 const rows=[],starts=[...html.matchAll(/<div\s+class=["']completed-auctions-([a-z0-9-]+)[^"']*["'][^>]*>/gi)];
 starts.forEach((start,i)=>{
  const section=start[1],body=html.slice(start.index,starts[i+1]?.index??html.length);
  for(const m of body.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)){
   const rowId=m[1].match(/id=["']([^"']+)["']/)?.[1]||'',tr=m[2];
   const date=tr.match(/<td\b[^>]*class=["']date["'][^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/i)?.[1];if(!date)continue;
   const a=tr.match(/<td\b[^>]*class=["']title["'][^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i);if(!a)continue;
   const href=decode(a[1].match(/href=["']([^"']+)["']/i)?.[1]||''),title=htmlText(a[2]);
   const priceCell=tr.match(/<td\b[^>]*class=["']numeric["'][^>]*>([\s\S]*?)<\/td>/i)?.[1]||'';
   const listedCell=tr.match(/<td\b[^>]*class=["']numeric listed-price["'][^>]*>([\s\S]*?)<\/td>/i)?.[1]||'';
   const em=href.match(/ebay\.[a-z.]+\/itm\/(\d+)/i);
   rows.push([section,date,dollars(priceCell),dollars(listedCell),rowId,title,em?'ebay:'+em[1]:href.replace(/\?.*$/,'').slice(0,160)]);
  }
 });
 return {name:h1?htmlText(h1[1]).slice(0,140):'',productId,guide,chart,pop,rows};
}

export function parseMarket(html,card,now=new Date().toISOString()){
 if(card.vintage&&!card.sourceVerified)throw new Error('An exact source match is required before this vintage card can be priced.');
 const page=parsePage(html);
 if(card.vintage&&!matchesCard(page.name,card))throw new Error('The source page does not match this vintage card and printing.');
 if(!Object.keys(page.guide).length&&!page.rows.length)throw new Error('The price source format could not be read.');
 const market=expandCapture(classifyCapture({...page,url:card.source,fetchedAt:now},card),card);
 return {...market,status:'refreshed'};
}
export function parseSet(html,cards){
 const result={};
 for(const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const row=m[1],title=row.match(/<td\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1];if(!title)continue;
  const name=htmlText(title),n=name.match(/#([A-Z]*\d+[a-z]?)(?![a-z0-9])/i)?.[1]?.toUpperCase();if(!n||name.includes('['))continue;
  const normalize=n=>String(n).toUpperCase().replace(/^([A-Z]*)0+(?=\d)/,'$1');
  const card=cards.find(c=>normalize(c.number)===normalize(n));if(!card)continue;
  if(card.vintage&&(!card.sourceVerified||!matchesCard(name+' '+card.setName,card)))continue;
  const values=[...row.matchAll(/<td\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)].map(x=>dollars(x[1]));
  if(values.length<3||!values[0])continue;
  result[card.id]={number:card.number,guide:{raw:values[0],grade9:values[1],psa10:values[2]},sales:[],observedAt:new Date().toISOString(),source:'PriceCharting',sourceUrl:card.source,status:'refreshed'};
 }
 if(!Object.keys(result).length)throw new Error('The set price guide could not be read.');return result;
}
export async function sourceFetch(url,env){
 if(env.NETWORK_DISABLED)throw new Error('Live sales refresh is unavailable in this workspace. Showing the last researched sales.');
 const r=await fetch(url,{headers:{Accept:'text/html','User-Agent':'FutureSight/1.1 (personal collector price tracker)'},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new Error('The price source is unavailable ('+r.status+'). Showing saved observations.');
 const html=await r.text();if(html.length>3500000)throw new Error('The source response was too large.');return html;
}

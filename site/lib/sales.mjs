// Listings that are not a single, English, standard print of the card.
export const EXCLUDED_LISTING=/\blot\b|bundle|\bfake\b|proxy|replica|custom|jumbo|oversized|reverse[ -]?holo|\brev[\/-]holo\b|cosmos|pre-?release|\bleague\b|stamped|\bstamp\b|championship|\bwinner\b|crosshatch|\bstaff\b|signed|autograph|japanese|\bjpn\b|\bjap\b|\bger\b|german|french|\bfr\b|korean|chinese|italian|spanish|portuguese/i;
export const collector=n=>String(n).toUpperCase().replace(/\s/g,'').replace(/^([A-Z]*)0+(?=\d)/,'$1');
export function gradeOf(title){
 if(/\b(?:CGC|BGS|BVG|Beckett|HGA|DSG|GRA|KSA|ACE|TAG|SGC|GMA|PCA|AGS|CGS)\b|\bPSA\s*(?:9|10)\s*\/\s*(?:9|10)\b/i.test(title))return null;
 // Qualifiers are annotations on the grade. The word "of" in a set name is not OF.
 if(/\(\s*(?:OC|MC|ST|MK|PD|OF)\s*\)|\bPSA\s*(?:9|10)\s+(?:OC|MC|ST|MK|PD|OF)\b/i.test(title))return null;
 const grades=[...title.matchAll(/\bPSA\s*([\d.]+)/gi)].map(m=>m[1]);
 if(grades.length)return grades.every(g=>g==='10')?'psa10':grades.every(g=>g==='9')?'psa9':null;
 if(/\bPSA\b|graded|grading|slab|\b(?:9|10)\s*\/\s*(?:9|10)\b/i.test(title))return null;
 return 'raw';
}
export function conditionOf(title){
 const t=title.replace(/(?<!\/)\b\d+\s*HP\b/gi,'');
 if(/damaged|\bDMG\b|creases?|creased/i.test(t))return 'Damaged';
 if(/\bHP\b|heavily played|poor condition/i.test(t))return 'HP';
 if(/\bMP\b|moderately played/i.test(t))return 'MP';
 if(/NM\s*\/\s*LP|NM-|LP\+|near mint\s*\/\s*light/i.test(t))return 'NM/LP';
 if(/\bLP\b|lightly played/i.test(t))return 'LP';
 if(/near[ -]?mint|\bNM\b|\bmint(?: condition)?\b/i.test(t))return 'NM';
 return 'Unknown';
}
import {japaneseTitleMatches} from './japanese.mjs';
export function matchesCard(title,card){
 // Japanese cards have their own title rules (they must not be English or another language).
 if(card.japanese)return japaneseTitleMatches(title,card);
 let checkedTitle=card.nativeReverse?title.replace(/reverse[ -]?(?:holo|foil)/gi,''):title;
 if(card.nativeStamp==='Snowflake'){
  if(!/snowflake/i.test(title))return false;
  checkedTitle=checkedTitle.replace(/\bstamp(?:ed)?\b/gi,'');
 }
 if(card.nativeStamp==='Set logo')checkedTitle=checkedTitle.replace(/\b(?:pre[ -]?release|stamp(?:ed)?)\b/gi,'');
 if(card.nativeCosmos)checkedTitle=checkedTitle.replace(/\bcosmos\b/gi,'');
 if(card.nativeWorlds)checkedTitle=checkedTitle.replace(/\bworld(?:s| championships?)?\s*(?:championships?|2026)?\b/gi,'');
 if(card.setId==='bp'){
  if(card.nativeWinner){if(!/\bwinners?\b/i.test(title)||/\bnon[ -]?winner/i.test(title))return false;checkedTitle=checkedTitle.replace(/\bwinners?\b/gi,'');}
  else checkedTitle=checkedTitle.replace(/\bnon[ -]?winner/gi,'');
  checkedTitle=checkedTitle.replace(/\bstamp(?:ed)?\b/gi,'');
 }
 // Exclusion words inside the official name (Iron Bundle, Unfair Stamp, etc.)
 // describe the card, while separate lot and printing terms still disqualify a sale.
 if(card.modern&&card.name)checkedTitle=checkedTitle.replace(new RegExp(card.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),'Card Name');
 if(EXCLUDED_LISTING.test(checkedTitle))return false;
 if(card.modern){const words=s=>String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f'’‘]/g,'').replace(/[^a-z0-9]+/g,' ').trim();if(![card.name,...(card.nameAliases||[])].some(name=>(' '+words(title)+' ').includes(' '+words(name)+' ')))return false;}
 if(card.nativeNonHolo&&/\bholo(?:graphic)?\b/i.test(title.replace(/\bnon[ -]?holo\b/gi,'')))return false;
 if(card.nativeHolo&&/\bnon[ -]?holo\b/i.test(title))return false;
 if(card.category==='Classic Collection'&&!/celebrations|celebration|25th|30th|25 year|30 year|2021.*reprint|2026.*reprint|classic collection/i.test(title))return false;
 if(card.vintage){
  const firstEdition=/\b1st\b|\b(?:first|1\.?)[ -]*(?:ed(?:ition)?\.?|print(?:ing)?)\b/i.test(title);
  if(firstEdition!==!!card.nativeFirstEdition)return false;
  if(/\bshadowless\b|\b1999[ -]*2000\b|fourth print|4th print|no symbol|no rarity|reprint|celebrations|evolutions|classic collection/i.test(title))return false;
  if(/\berror\b/i.test(title)&&!/\berror\b/i.test(card.name))return false;
  const norm=s=>String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const words=s=>String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f'’‘"\x60]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  if(![card.name,...(card.nameAliases||[])].some(name=>(' '+words(title)+' ').includes(' '+words(name)+' ')))return false;
  const nonHolo=/non[ -]?holo|no[ -]?holo/i.test(title);
  if(/holo/i.test(card.rarity)&&nonHolo)return false;
  if(!/holo/i.test(card.rarity)&&card.category!=='Promo'&&!nonHolo&&/\bholo(?:graphic)?\b/i.test(title))return false;
  // With no denominator, require the set name and an explicit collector number.
  if(!/\b[A-Z]*\d+\s*\/\s*[A-Z]*\d+\b/i.test(title)){
   const setName=card.setId==='basep'?'promo':card.setId==='ecard1'?'expedition':card.setName;
   if(!norm(title).includes(norm(setName)))return false;
   const mark=String(card.number).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   if(!new RegExp('(?:#\\s*0*'+mark+'|\\b0*'+mark+'\\b)','i').test(title.replace(/\bPSA\s*\d+/gi,'')))return false;
  }
 }
 const titleAnd=(title.match(/\s&\s/g)||[]).length,nameAnd=(String(card.name||'').match(/\s&\s/g)||[]).length;
 const setName=String(card.setName||''),marketSetName=card.setId==='sve'?'Scarlet & Violet Energy':card.setId==='sv3pt5'?'Scarlet & Violet 151':setName;
 const setAnd=card.modern&&title.toLowerCase().includes(marketSetName.toLowerCase())?(marketSetName.match(/\s&\s/g)||[]).length:0;
 if(titleAnd>nameAnd+setAnd)return false;
 const expected=collector(card.number),prefix=expected.match(/^[A-Z]+/)?.[0]||'',total=prefix+card.printedTotal;
 if(/^[A-Z!?]$/.test(expected)){const mark=expected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('(?:\\[\\s*'+mark+'\\s*\\]|(?:^|[^A-Z0-9])'+mark+'\\s*\\/\\s*'+card.printedTotal+'(?!\\d))','i').test(title);}
 const numbered=[...title.matchAll(/\b((?:SWSH|MEP|SVP|GG|TG|XY|RC|SV|SH|SL|AR|H)?\s*\d+[a-z]?)\s*\/\s*((?:SWSH|MEP|SVP|GG|TG|XY|RC|SV|SH|SL|AR|H)?\s*\d+[a-z]?)\b/gi)];
 if(!expected.startsWith('XY')&&numbered.length)return numbered.every(m=>collector(m[1])===expected&&(!card.modern||card.printedTotal!=null?collector(m[2])===total:true));
 if(expected.startsWith('XY'))return [...title.matchAll(/\bXY\s*0*(\d+)(?![a-z\d])/gi)].some(m=>'XY'+Number(m[1])===expected);
 const parts=expected.match(/^([A-Z]*)(\d+)([A-Z]?)$/);return parts?new RegExp('(?:#|'+(card.setId==='mep'?'MEP':'')+')?\\s*'+parts[1]+'\\s*0*'+parts[2]+parts[3]+'(?![a-z0-9])','i').test(title):false;
}
export function makeSale({date,title,price,source,listingUrl,marketplace},card){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||!(price>0)||!matchesCard(title,card))return null;
 const grade=gradeOf(title);if(!grade)return null;
 const identity=(listingUrl||source||card.source)+'|'+date+'|'+grade+'|'+price+'|'+title;
 return {id:identity,number:card.number,grade,date,price,condition:grade==='raw'?conditionOf(title):'',marketplace:marketplace||'eBay',provenance:'PriceCharting reported sale',source:source||card.source,title};
}
export function dedupeSales(sales){
 const unique=new Map(),legacyIndex=new Map();
 for(const original of sales||[]){
  let s=original;if(s.title){const grade=gradeOf(s.title);if(!grade)continue;s={...s,grade,condition:grade==='raw'?conditionOf(s.title):''};}
  const legacy=[s.number,s.date,s.grade,s.price,s.condition].join('|'),bucket=legacyIndex.get(legacy)||[];
  const duplicate=bucket.find(([k,v])=>unique.get(k)===v&&(!s.title||!v.title));
  if(duplicate){if(s.title&&!duplicate[1].title)unique.delete(duplicate[0]);else continue;}
  const key=s.marketplace==='TCGPlayer'?[s.date,s.grade,s.price,s.condition,s.title].join('|'):s.id||[s.date,s.grade,s.price,s.title].join('|');
  if(!unique.has(key)){unique.set(key,s);bucket.push([key,s]);legacyIndex.set(legacy,bucket);}
 }
 return [...unique.values()].sort((a,b)=>b.date.localeCompare(a.date));
}
export function mergeMarket(previous,next){
 if(!next)return previous;
 const newer=!previous?.observedAt||Date.parse(next.observedAt)>=Date.parse(previous.observedAt);
 const guide={...previous?.guide},guideSources={...previous?.guideSources};for(const [key,value]of Object.entries(next.guide||{}))if(value>0&&(newer||!guide[key])){guide[key]=value;guideSources[key]=next.guideSources?.[key]||{name:next.source,url:next.sourceUrl,observedAt:next.observedAt};}
 const latest=newer?next:previous;
 return {...previous,...next,source:latest?.source,sourceUrl:latest?.sourceUrl,observedAt:latest?.observedAt,status:latest?.status,pop:next.pop||previous?.pop||null,guide,guideSources,sales:dedupeSales([...(next.sales||[]),...(previous?.sales||[])])};
}
// Bump when listing-title rules change.
export const SALES_PARSER_VERSION='sales-2026.10.06';
export function parsePublicText(text,card){
 const plain=text.replace(/^L\d+:\s*/gm,''),guide={},sales=[];
 const lines=plain.split('\n');
 for(let i=0;i<lines.length;i++){
  if(!/^Ungraded\s*\|/.test(lines[i]))continue;
  const labels=lines[i].split('|').map(s=>s.trim()),prices=lines[i+1]?.split('|')||[];
  for(const [key,label]of [['raw','Ungraded'],['grade9','Grade 9'],['psa10','PSA 10']]){const p=prices[labels.indexOf(label)]?.match(/\$([\d,.]+)/);if(p)guide[key]=Number(p[1].replace(/,/g,''));}
 }
 const rows=[...plain.matchAll(/(?:^|\n)(20\d{2}-\d{2}-\d{2})\s*\|([\s\S]*?)(?=\n20\d{2}-\d{2}-\d{2}\s*\||\nSee an incorrect|\nSale Date|$)/g)];
 for(const row of rows){
  const m=row[2].match(/【\d+†([^】]+?)】\s*\[(eBay|TCGPlayer)\]\s*\|\s*\$([\d,.]+)/i);if(!m)continue;
  const title=m[1].replace(/†(?:[^†]+\.)?(?:ebay\.com|tcgplayer\.com)$/i,'').replace(/†partner\.tcgplayer\.com$/i,'').trim();
  const sale=makeSale({date:row[1],title,price:Number(m[3].replace(/,/g,'')),source:card.source,marketplace:m[2]},card);if(sale)sales.push(sale);
 }
 if(!sales.length&&!Object.keys(guide).length)throw new Error('No supported prices or matching sales could be read.');
 return {number:card.number,guide,sales:dedupeSales(sales),observedAt:new Date().toISOString(),source:'PriceCharting',sourceUrl:card.source,status:'researched',parserVersion:SALES_PARSER_VERSION};
}

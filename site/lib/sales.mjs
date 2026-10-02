// Listings that are not a single, English, standard print of the card.
export const EXCLUDED_LISTING=/\blot\b|bundle|\bfake\b|proxy|replica|custom|jumbo|oversized|reverse[ -]?holo|cosmos|pre-?release|\bleague\b|stamped|\bstamp\b|championship|\bwinner\b|crosshatch|\bstaff\b|signed|autograph|japanese|\bjpn\b|\bjap\b|\bger\b|german|french|\bfr\b|korean|chinese|italian|spanish|portuguese/i;
export const collector=n=>String(n).toUpperCase().replace(/\s/g,'').replace(/^([A-Z]*)0+(?=\d)/,'$1');
export function gradeOf(title){
 if(/\b(?:CGC|BGS|BVG|Beckett|HGA|DSG|GRA|KSA|ACE|TAG|SGC|GMA|PCA|AGS|CGS)\b|\b(?:OC|MC|ST|MK|PD|OF)\b|\bPSA\s*(?:9|10)\s*\/\s*(?:9|10)\b/i.test(title))return null;
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
export function matchesCard(title,card){
 if(EXCLUDED_LISTING.test(title))return false;
 const titleAnd=(title.match(/\s&\s/g)||[]).length,nameAnd=(String(card.name||'').match(/\s&\s/g)||[]).length;if(titleAnd>nameAnd)return false;
 const expected=collector(card.number),prefix=expected.match(/^[A-Z]+/)?.[0]||'',total=prefix+card.printedTotal;
 if(/^[A-Z!?]$/.test(expected)){const mark=expected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('(?:\\[\\s*'+mark+'\\s*\\]|(?:^|[^A-Z0-9])'+mark+'\\s*\\/\\s*'+card.printedTotal+'(?!\\d))','i').test(title);}
 const numbered=[...title.matchAll(/\b((?:XY|RC|SV)?\s*\d+[a-z]?)\s*\/\s*((?:XY|RC|SV)?\s*\d+[a-z]?)\b/gi)];
 if(!expected.startsWith('XY')&&numbered.length)return numbered.every(m=>collector(m[1])===expected&&collector(m[2])===total);
 if(expected.startsWith('XY'))return [...title.matchAll(/\bXY\s*0*(\d+)(?![a-z\d])/gi)].some(m=>'XY'+Number(m[1])===expected);
 const parts=expected.match(/^([A-Z]*)(\d+)([A-Z]?)$/);return parts?new RegExp('#?\\s*'+parts[1]+'\\s*0*'+parts[2]+parts[3]+'(?![a-z0-9])','i').test(title):false;
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
 return {...previous,...next,source:latest?.source,sourceUrl:latest?.sourceUrl,observedAt:latest?.observedAt,status:latest?.status,guide,guideSources,sales:dedupeSales([...(next.sales||[]),...(previous?.sales||[])])};
}
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
 return {number:card.number,guide,sales:dedupeSales(sales),observedAt:new Date().toISOString(),source:'PriceCharting',sourceUrl:card.source,status:'researched'};
}

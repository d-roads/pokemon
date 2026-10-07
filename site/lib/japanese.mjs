// Japanese cards: mapping each card to its exact PriceCharting product, and the rules for
// Japanese sold-listing titles. Japanese cards are priced, scored and ranked on their own:
// they are never compared with English printings.
//
// Mapping reads a Japanese set's PriceCharting listing (every product row: name, collector
// number and guide prices) and accepts a row for a card only when the number matches and the
// name agrees, or when the number is unique in that set and the card has no English name yet.
// Variant rows ([Master Ball], [1st Edition], stamped, etc.) are never used for a standard card.

const decodeJa=s=>String(s).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));
const textJa=s=>decodeJa(String(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
const dollarsJa=s=>{const m=String(s).replace(/<s\b[^>]*>[\s\S]*?<\/s>/gi,'').match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);return m?Number(m[1].replace(/,/g,'')):null;};
export const JA_MAP_VERSION='ja-map-2026.10.07';

// One listing page (view=table): product rows plus the cursor for the next page, if any.
export function parseJapaneseListing(html){
 const rows=[];
 for(const m of String(html).matchAll(/<tr\b[^>]*id=["']product-(\d+)["'][^>]*>([\s\S]*?)<\/tr>/gi)){
  const id=m[1],row=m[2];
  const a=row.match(/<td\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);if(!a)continue;
  const path=decodeJa(a[1]).replace(/^https?:\/\/[^/]+/,''),title=textJa(a[2]);
  const prices=[...row.matchAll(/<td\b[^>]*class=["'][^"']*\bprice\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)].map(x=>dollarsJa(x[1]));
  // Promos carry their series code: "Pikachu #227/S-P".
  const number=title.match(/#\s*([A-Z]*-?\d+[a-z]?(?:\s*\/\s*[A-Z]+-?P\b)?)(?![a-z0-9])/i)?.[1]?.toUpperCase().replace(/\s+/g,'')||null;
  rows.push({productId:id,path,title,name:title.replace(/\s*#.*$/,'').trim(),number,variant:/\[[^\]]+\]/.test(title),prices});
 }
 const cursor=String(html).match(/name=["']cursor["']\s+value=["']([^"']+)["']/)?.[1]||null;
 return {rows,cursor};
}

export const jaWords=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f'’‘"`.]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const jaNumber=n=>String(n??'').toUpperCase().replace(/\s/g,'').replace(/^([A-Z]*-?)0+(?=\d)/,'$1');
// Names a card may be listed under: its own English name, a "Mega"/"M" spelling, and the
// species without a regional or owner prefix only as a last resort.
export function nameForms(card){
 const out=new Set(),base=String(card.name||'');
 if(!card.nameIsJapanese&&base)out.add(jaWords(base));
 if(card.pcName)out.add(jaWords(card.pcName));
 if(!out.size&&card.species)out.add(jaWords(card.species));
 for(const n of [...out]){if(n.startsWith('mega '))out.add('m '+n.slice(5));if(n.startsWith('m '))out.add('mega '+n.slice(2));}
 return [...out].filter(Boolean);
}
const sameName=(a,b)=>a===b||a.replace(/ (ex|gx|v|vmax|vstar|break|lv x)$/,'')===b.replace(/ (ex|gx|v|vmax|vstar|break|lv x)$/,'')&&/ (ex|gx|v|vmax|vstar|break|lv x)$/.test(a)===/ (ex|gx|v|vmax|vstar|break|lv x)$/.test(b);
// The number PriceCharting files a card under: its collector number, except Wizards-era
// Japanese cards (no printed collector numbers), which it lists by Pokédex number.
// The original Wizards sets and Neo have no printed collector numbers, so PriceCharting lists them by
// Pokédex number; e-Card, VS and web have printed numbers. Promos are listed as 227/S-P.
const DEX_LISTED=/^ja-(?:pmcg|neo)\d/,PROMO_CODE={'ja-sp':'S-P','ja-svp':'SV-P','ja-mp':'M-P'};
export const dexListed=card=>DEX_LISTED.test(card.setId||'')&&card.dexId?.length===1;
export const listedNumber=card=>dexListed(card)?String(card.dexId[0]):PROMO_CODE[card.setId]?jaNumber(card.number)+'/'+PROMO_CODE[card.setId]:String(card.number);

// Map every card of one Japanese set to at most one listing row, and each row to at most one card.
export function matchJapaneseListing(rows,cards){
 const plain=rows.filter(r=>!r.variant&&r.number),byNumber=new Map();
 for(const r of plain){const k=jaNumber(r.number);if(!byNumber.has(k))byNumber.set(k,[]);byNumber.get(k).push(r);}
 const matches=new Map(),unmatched=[],used=new Set();
 for(const card of cards){
  const pool=byNumber.get(jaNumber(listedNumber(card)))||[],forms=nameForms(card);
  let pick=null,rule=null;
  const named=pool.filter(r=>forms.some(f=>sameName(jaWords(r.name),f)));
  // Fallback: the same Pokémon under a prefix we could not translate (e.g. "Dark Arbok" for わるいアーボック),
  // when exactly one product with this number names that species.
  const species=card.species?jaWords(card.species):null;
  const bySpecies=species&&!named.length?pool.filter(r=>(' '+jaWords(r.name)+' ').includes(' '+species+' ')):[];
  if(named.length===1){pick=named[0];rule='number+name';}
  else if(bySpecies.length===1){pick=bySpecies[0];rule='number+species';}
  else if(!named.length&&pool.length===1&&(card.nameIsJapanese||!forms.length)&&!dexListed(card)){pick=pool[0];rule='number-only';}
  if(!pick||used.has(pick.productId)){unmatched.push({id:card.id,number:card.number,reason:!pool.length?'no product with this number':named.length>1?'several products with this name and number':pick?'product already used':'name differs: '+pool.map(r=>r.name).slice(0,3).join(' / ')});continue;}
  used.add(pick.productId);matches.set(card.id,{...pick,rule});
 }
 return {matches,unmatched};
}

// A guide snapshot from a listing row: ungraded, Grade 9 and PSA 10 columns.
export function listingGuide(row,card,now){
 const [raw,grade9,psa10]=row.prices;
 const guide={};if(raw>0)guide.raw=raw;if(grade9>0)guide.grade9=grade9;if(psa10>0)guide.psa10=psa10;
 const url='https://www.pricecharting.com'+row.path;
 return {number:card.number,guide,sales:[],observedAt:now,source:'PriceCharting',sourceUrl:url,status:'refreshed',parserVersion:JA_MAP_VERSION};
}

// Sold-listing titles for Japanese cards. The same lot, proxy, grading and stamp rules as
// English cards apply, but the title must not say it is another language, and it must name
// the card and carry its number (fraction numerator and set total must both agree).
const JA_EXCLUDED=/\blot\b|bundle|\bfake\b|proxy|replica|custom|jumbo|oversized|reverse[ -]?holo|\brev[\/-]holo\b|pre-?release|\bleague\b|championship|\bwinner\b|\bstaff\b|signed|autograph|\benglish\b|\beng\b|\bger\b|german|french|\bfr\b|korean|\bkor\b|chinese|\bchn\b|simplified|traditional chinese|italian|spanish|portuguese|thai|indonesian|\bmaster ?ball\b|\bpoke ?ball (?:pattern|mirror)\b/i;
export function japaneseTitleMatches(title,card){
 const t=String(title||'');
 if(JA_EXCLUDED.test(t))return false;
 if(card.category!=='Promo'&&/\bstamp(?:ed)?\b/i.test(t))return false;
 if(card.series==='WOTC'&&/\b1st\b|first edition/i.test(t))return false;
 const tw=' '+jaWords(t)+' ';
 if(!nameForms(card).some(f=>tw.includes(' '+f+' ')||tw.includes(' '+f.replace(/ (ex|gx|v|vmax|vstar)$/,'')+' ')))return false;
 const titleAnd=(t.match(/\s&\s/g)||[]).length,nameAnd=(String(card.pcName||card.name).match(/\s&\s/g)||[]).length,setAnd=(String(card.setName).match(/\s&\s/g)||[]).length;
 if(titleAnd>nameAnd+setAnd)return false;
 const code=PROMO_CODE[card.setId];
 if(code&&!new RegExp('promo|'+code.replace('-','-?'),'i').test(t))return false;
 const expected=code?jaNumber(card.number):jaNumber(listedNumber(card)),own=jaNumber(card.number);
 const fractions=[...t.matchAll(/\b([A-Z]*\d+[a-z]?)\s*\/\s*([A-Z-]*\d+[a-z]?)\b/gi)].filter(m=>!/^psa$/i.test(m[1]));
 if(fractions.length&&!code)return fractions.every(m=>jaNumber(m[1])===own&&(!card.printedTotal||jaNumber(m[2])===String(card.printedTotal)));
 // No fraction: the number must appear as #201, No.201, 201 or 0201 (graded and year numbers ignored).
 const parts=expected.match(/^([A-Z]*-?)(\d+)([A-Z]?)$/);if(!parts)return false;
 const cleaned=t.replace(/\bPSA\s*\d+(?:\.\d)?/gi,' ').replace(/\b(?:19|20)\d{2}\b/g,' ');
 return new RegExp('(?:^|[^a-z0-9])(?:#\\s*|No\\.?\\s*)?'+parts[1].replace('-','-?')+'0*'+parts[2]+parts[3]+'(?![a-z0-9])','i').test(cleaned);
}

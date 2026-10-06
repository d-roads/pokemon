// Rebuild released English Sword & Shield, Scarlet & Violet, or Mega Evolution checklists.
// Usage: node tools/research/gen-modern.mjs swsh|later
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const group=process.argv[2];
if(!['swsh','later'].includes(group))throw new Error('Choose swsh or later.');
const source='https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/';
const output=new URL('../../site/data/modern-catalogs.json',import.meta.url);
async function json(path){const r=await fetch(source+path,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(path+': HTTP '+r.status);return r.json();}
const all=await json('sets/en.json');
const today=new Date().toISOString().slice(0,10);
const swshSpecials=new Set(['fut20','mcd21','cel25','cel25c','pgo','mcd22']);
const mcd22Holos=new Set(['2','3','4','5','7','15']);
const megaNonHoloEnergy=new Set(['me4-84','me4-85','me4-86']);
const chosen=all.filter(s=>(group==='swsh'?s.id.startsWith('swsh')||swshSpecials.has(s.id):/^(sv|me|zsv|rsv)/.test(s.id))&&s.releaseDate.replaceAll('/','-')<=today);
const previous=existsSync(output)?JSON.parse(readFileSync(output,'utf8')):[];
const specialSlugs={swshp:'promo',svp:'promo',sve:'scarlet-%26-violet-energy',mep:'promo',mee:'mega-evolution-energy',sv3pt5:'scarlet-%26-violet-151',fut20:'promo',cel25:'celebrations',cel25c:'celebrations',pgo:'go',mcd21:'mcdonalds-2021',mcd22:'mcdonalds-2022'};
// PriceCharting shortens these product names; the set and printed number still disambiguate them.
const sourceAliases={
 'swshp-SWSH135':'Zacian LV',
 'swshp-SWSH195':'Leafeon V Star',
 'swsh45-60':"Professor's Research: Professor Juniper",
 'swsh6-207':'Slowking VMAX',
 'swsh9tg-TG18':'Urshifu V',
 'swsh9tg-TG20':'Urshifu V',
 'swsh9tg-TG27':'Mustard',
 'swsh9tg-TG28':'Mustard',
 'swsh9tg-TG29':'Urshifu VMAX',
 'cel25c-24_A':['Pikachu Birthday','Birthday Pikachu'],
 'pgo-78':"Professor's Research: Professor Willow",
 'pgo-84':"Professor's Research: Professor Willow",
 'sv9-190':'Spike Energy',
 'me2pt5-256':"Boss's Orders: Corbeau",
 'me4-84':'Bubbly W Energy',
 'me4-85':'Magnetic M Energy',
 'me4-86':'Nitro R Energy'
};
const sourceProductSlugs={'svp-27':'pikachu-paldea-27','svp-221':'professor%27s-research-professor-birch-221','svp-222':'professor%27s-research-professor-kukui-222','svp-223':'professor%27s-research-professor-magnolia-223','svp-224':'paradise-resort-world-championships-2025-224','svp-225':'pikachu-world-championships-225','mep-92':'paradise-resort-world-championships-2026-92','mep-93':'pikachu-world-championship-2026-93','mep-97':'articuno-promo-97-97'};
const slug=s=>specialSlugs[s.id]||s.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/['’]/g,'%27').replace(/&/g,'%26').replace(/[^a-z0-9%]+/g,'-').replace(/^-|-$/g,'');
const parent=s=>s.id==='swsh45sv'?'swsh45':s.id==='me55c'?'me55':s.id.match(/^(swsh\d+(?:pt\d+)?)(?:tg|gg)$/)?.[1]||s.id;
const category=(card,set)=>{
 const rarity=card.rarity||'';
 if(/promo/i.test(rarity)||['fut20','mcd21','mcd22'].includes(set.id))return 'Promo';
 if(/classic collection/i.test(set.name))return 'Classic Collection';
 if(/trainer gallery/i.test(set.name))return 'Trainer Gallery';
 if(/galarian gallery/i.test(set.name))return 'Galarian Gallery';
 if(/shiny vault/i.test(set.name))return 'Shiny Vault';
 if(/secret|rainbow|hyper|special illustration/i.test(rarity)||/^\d+$/.test(card.number)&&Number(card.number)>set.printedTotal)return 'Secret rare';
 if(/illustration|ultra|full art/i.test(rarity))return 'Full art';
 if(/radiant|amazing|shiny/i.test(rarity))return 'Shiny rare';
 return card.subtypes?.find(x=>/^(V|VMAX|VSTAR|ex)$/i.test(x))||(/holo/i.test(rarity)?'Holo rare':'Standard');
};
const generated=[];
for(const s of chosen){
 const raw=await json('cards/en/'+s.id+'.json');
 const p=all.find(x=>x.id===parent(s))||s;
 const cards=raw.map(c=>{const aliases=[];
  if(/\s+\([^)]*\)$/.test(c.name))aliases.push(c.name.replace(/\s+\([^)]*\)$/,''));
  const energyAlias={'Lightning Energy':'Electric Energy','Darkness Energy':'Dark Energy','Metal Energy':'Steel Energy'}[c.name];if(energyAlias)aliases.push(energyAlias);
  if(/^Basic .+ Energy$/.test(c.name)){
   aliases.push(c.name.replace(/^Basic /,''));
   const alternate=c.name.replace(/Lightning/,'Electric').replace(/Darkness/,'Dark').replace(/Metal/,'Steel');
   if(alternate!==c.name)aliases.push(alternate,alternate.replace(/^Basic /,''));
  }
  if(sourceAliases[c.id])aliases.push(...[].concat(sourceAliases[c.id]));
  return {number:c.number,name:c.name,...(c.id!==s.id+'-'+c.number?{catalogId:c.id}:{}),...(aliases.length?{nameAliases:aliases}:{}),...(sourceProductSlugs[c.id]?{sourceProductSlug:sourceProductSlugs[c.id]}:{}),...(s.id==='mcd21'||s.id==='mcd22'&&!mcd22Holos.has(c.number)||megaNonHoloEnergy.has(c.id)?{nativeNonHolo:true}:s.id==='mcd22'||group==='later'&&!s.id.startsWith('me')&&c.rarity==='Rare'?{nativeHolo:true}:{}),...(c.id==='swshp-SWSH153'?{nativeStamp:'Snowflake'}:{}),rarity:c.rarity||(['fut20','mcd21','mcd22'].includes(s.id)?'Promo':'Unknown'),type:c.types?.[0]||c.supertype,category:category(c,s)};
 });
 generated.push({id:s.id,slug:slug(p),name:s.name,series:group==='swsh'?'SWSH':s.id.startsWith('me')?'ME':'SV',printedTotal:/promo|classic collection/i.test(s.name)||['fut20','sve'].includes(s.id)?null:s.printedTotal||null,total:cards.length,release:s.releaseDate.replaceAll('/','-'),checklistSource:source+'cards/en/'+s.id+'.json',cards});
 console.log(s.id,s.name,cards.length,cards.filter(c=>/rare|promo/i.test(c.rarity)).length);
}
if(group==='later'){
 // The PokemonTCG checklist currently stops SVP at 165 and SVE at 16, and omits MEP/MEE.
 // TCGdex supplies the current SVP/SVE/MEE checklists; CardOS supplies MEP through
 // 101. Exclude jumbo-only promos and products releasing after this run's date.
 const tcgdex='https://api.tcgdex.net/v2/en/sets/';
 const tcg=async id=>{const r=await fetch(tcgdex+id,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('TCGdex '+id+': HTTP '+r.status);return r.json();};
 const byId=id=>generated.find(s=>s.id===id);
 const energyAliases=name=>{const aliases=[];if(/^Basic /i.test(name))aliases.push(name.replace(/^Basic /i,''));else if(/ Energy$/.test(name))aliases.push('Basic '+name);for(const [from,to] of [['Lightning','Electric'],['Darkness','Dark'],['Metal','Steel']])if(name.includes(from))aliases.push(name.replace(from,to),name.replace(/^Basic /i,'').replace(from,to),'Basic '+name.replace(from,to));return [...new Set(aliases)];};
 for(const id of ['svp','sve']){
  const set=byId(id),current=new Set(set.cards.map(c=>Number(c.number))),remote=await tcg(id);
  for(const item of remote.cards){const n=Number(item.localId);if(!Number.isInteger(n)||n<1||n>remote.cardCount.official||current.has(n))continue;
   const aliases=id==='svp'&&[221,222,223].includes(n)?[`Professor's Research Professor ${({221:'Birch',222:'Kukui',223:'Magnolia'})[n]}`]:energyAliases(item.name);
   set.cards.push({number:String(n),name:item.name,...(aliases.length?{nameAliases:aliases}:{}),...(sourceProductSlugs[id+'-'+n]?{sourceProductSlug:sourceProductSlugs[id+'-'+n]}:{}),...([167,168,169].includes(n)&&id==='svp'?{nativeCosmos:true}:{}),...([224,225].includes(n)&&id==='svp'?{nativeWorlds:true}:{}),rarity:id==='svp'?'Promo':'Common',type:id==='sve'?'Energy':'Unknown',category:id==='svp'?'Promo':'Standard',image:`https://assets.tcgdex.net/en/sv/${id}/${String(n).padStart(3,'0')}/high.webp`});
  }
  set.cards.sort((a,b)=>Number(a.number)-Number(b.number));set.total=set.cards.length;
  set.checklistSource+=` + ${tcgdex}${id}`;
  console.log(id,'supplemented',set.cards.length);
 }
 const energy=await tcg('mee');
 generated.push({id:'mee',slug:specialSlugs.mee,name:'Mega Evolution Energy',series:'ME',printedTotal:null,total:8,release:'2025-09-26',checklistSource:tcgdex+'mee',cards:energy.cards.map(item=>({number:String(Number(item.localId)),name:item.name,...(energyAliases(item.name).length?{nameAliases:energyAliases(item.name)}:{}),rarity:'Common',type:'Energy',category:'Standard',nativeNonHolo:true}))});
 const promoRows=[];
 for(let page=1;page<=4;page++){
  const url=`https://business.getcardos.com/browse/pokemon/expansions/mep?page=${page}`,r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('CardOS MEP page '+page+': HTTP '+r.status);
  const html=await r.text();
  for(const m of html.matchAll(/href="\/browse\/pokemon\/cards\/mep-([^"]+)"[\s\S]*?<span class="name [^"]*">([^<]+)<\/span>[\s\S]*?<span class="num [^"]*">#([^<]+)<\/span>/g))promoRows.push({slug:m[1],name:m[2].replaceAll('&amp;','&').replaceAll('&#39;',"'"),number:Number(m[3]),image:m[0].match(/<img src="([^"]+)"/)?.[1]});
 }
 const jumboOnly=new Set([11,12,13,25]);
 const mep=[];
 for(let n=1;n<=101;n++){
  if(jumboOnly.has(n))continue;
  const variants=promoRows.filter(r=>r.number===n),card=variants.find(r=>r.slug===String(n))||variants.find(r=>!/(?:staff|jumbo|pc|vpc|vs)$/i.test(r.slug));
  if(!card)throw new Error('Missing released MEP '+n+' in CardOS checklist');
  const name=card.name.replace(/ \(Cosmos Holofoil\)$/,'');
  mep.push({number:String(n),name,...(n===90?{nameAliases:['Mega Darkai ex']}:n===97?{nameAliases:['Articuno Promo 97']}:{}),...(sourceProductSlugs['mep-'+n]?{sourceProductSlug:sourceProductSlugs['mep-'+n]}:{}),rarity:'Promo',type:'Unknown',category:'Promo',...(n<=88?{image:`https://assets.tcgdex.net/en/me/mep/${String(n).padStart(3,'0')}/high.webp`}:card.image?{image:card.image}:{}),...([7,68,69,78,79].includes(n)?{nativeCosmos:true}:{}),...([92,93].includes(n)?{nativeWorlds:true}:{}),...(new Set([1,2,3,4,14,15,16,17,64,65,66,67,74,75,76,77,82,83,84,85]).has(n)?{nativeStamp:'Set logo'}:{})});
 }
 generated.push({id:'mep',slug:'promo',name:'MEP Black Star Promos',series:'ME',printedTotal:null,total:mep.length,release:'2025-09-26',checklistSource:'https://business.getcardos.com/browse/pokemon/expansions/mep + https://bulbapedia.bulbagarden.net/wiki/MEP',cards:mep});
 console.log('mep',mep.length,'mee',energy.cards.length);
}
const keep=previous.filter(s=>!generated.some(g=>g.id===s.id));
writeFileSync(output,JSON.stringify([...keep,...generated].sort((a,b)=>a.release.localeCompare(b.release)),null,2)+'\n');

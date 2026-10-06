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
const chosen=all.filter(s=>(group==='swsh'?s.id.startsWith('swsh')||swshSpecials.has(s.id):/^(sv|me|zsv|rsv)/.test(s.id))&&s.releaseDate.replaceAll('/','-')<=today);
const previous=existsSync(output)?JSON.parse(readFileSync(output,'utf8')):[];
const specialSlugs={swshp:'promo',svp:'promo',fut20:'promo',cel25:'celebrations',cel25c:'celebrations',pgo:'go',mcd21:'mcdonalds-2021',mcd22:'mcdonalds-2022'};
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
 'pgo-84':"Professor's Research: Professor Willow"
};
const slug=s=>specialSlugs[s.id]||s.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/['’]/g,'%27').replace(/&/g,'%26').replace(/[^a-z0-9%]+/g,'-').replace(/^-|-$/g,'');
const parent=s=>s.id==='swsh45sv'?'swsh45':s.id.match(/^(swsh\d+(?:pt\d+)?)(?:tg|gg)$/)?.[1]||s.id;
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
  if(sourceAliases[c.id])aliases.push(...[].concat(sourceAliases[c.id]));
  return {number:c.number,name:c.name,...(c.id!==s.id+'-'+c.number?{catalogId:c.id}:{}),...(aliases.length?{nameAliases:aliases}:{}),...(s.id==='mcd21'||s.id==='mcd22'&&!mcd22Holos.has(c.number)?{nativeNonHolo:true}:s.id==='mcd22'?{nativeHolo:true}:{}),...(c.id==='swshp-SWSH153'?{nativeStamp:'Snowflake'}:{}),rarity:c.rarity||(['fut20','mcd21','mcd22'].includes(s.id)?'Promo':'Unknown'),type:c.types?.[0]||c.supertype,category:category(c,s)};
 });
 generated.push({id:s.id,slug:slug(p),name:s.name,series:group==='swsh'?'SWSH':s.id.startsWith('me')?'ME':'SV',printedTotal:/promo|classic collection/i.test(s.name)||s.id==='fut20'?null:s.printedTotal||null,total:cards.length,release:s.releaseDate.replaceAll('/','-'),checklistSource:source+'cards/en/'+s.id+'.json',cards});
 console.log(s.id,s.name,cards.length,cards.filter(c=>/rare|promo/i.test(c.rarity)).length);
}
const keep=previous.filter(s=>!generated.some(g=>g.id===s.id));
writeFileSync(output,JSON.stringify([...keep,...generated].sort((a,b)=>a.release.localeCompare(b.release)),null,2)+'\n');

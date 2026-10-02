// Build the EX and Diamond & Pearl / Platinum / HeartGold & SoulSilver catalogs
// from the public PokemonTCG/pokemon-tcg-data repository.
// Usage: node tools/research/gen-legacy.mjs
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const base='https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/';
const meta=[
 ['ex1','ruby-&-sapphire','EX'],['ex2','sandstorm','EX'],['ex3','dragon','EX'],['ex4','team-magma-&-team-aqua','EX'],
 ['ex5','hidden-legends','EX'],['ex6','fire-red-&-leaf-green','EX'],['ex7','team-rocket-returns','EX'],['ex8','deoxys','EX'],
 ['ex9','emerald','EX'],['ex10','unseen-forces','EX'],['ex11','delta-species','EX'],['ex12','legend-maker','EX'],
 ['ex13','holon-phantoms','EX'],['ex14','crystal-guardians','EX'],['ex15','dragon-frontiers','EX'],['ex16','power-keepers','EX'],
 ['dp1','diamond-&-pearl','DP'],['dp2','mysterious-treasures','DP'],['dp3','secret-wonders','DP'],['dp4','great-encounters','DP'],
 ['dp5','majestic-dawn','DP'],['dp6','legends-awakened','DP'],['dp7','stormfront','DP'],['pl1','platinum','DP'],
 ['pl2','rising-rivals','DP'],['pl3','supreme-victors','DP'],['pl4','arceus','DP'],['hgss1','heartgold-&-soulsilver','DP'],
 ['hgss2','unleashed','DP'],['hgss3','undaunted','DP'],['hgss4','triumphant','DP'],['col1','call-of-legends','DP'],
];

async function json(path){
 let last;
 for(let attempt=1;attempt<=4;attempt++)try{
  const response=await fetch(base+path,{headers:{Accept:'application/json','User-Agent':'PrimalWatch catalog builder'},signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error('HTTP '+response.status);
  return response.json();
 }catch(error){last=error;await new Promise(resolve=>setTimeout(resolve,attempt*1500));}
 throw last;
}
const numberKey=value=>{const match=String(value).match(/^(\d+)([a-z]*)$/i);return match?Number(match[1])*10+(match[2]?match[2].toLowerCase().charCodeAt(0)-96:0):100000;};
function category(card,rarity){
 const name=card.name;
 if(/^SL/i.test(card.number))return 'Shiny rare';
 if(/secret/i.test(rarity)||Number(card.number)>card.set.printedTotal)return 'Secret rare';
 if(/shining/i.test(rarity)||/^Shining\s/i.test(name))return 'Shining';
 if(/star/i.test(rarity)||/[★☆]$/.test(name))return 'Gold Star';
 if(/prime/i.test(rarity))return 'Prime';
 if(/LEGEND$/i.test(name))return 'LEGEND';
 if(/LV\.?X$/i.test(name))return 'Pokémon LV.X';
 if(/\bex$/i.test(name))return 'Pokémon ex';
 if(/holo/i.test(rarity))return 'Holo rare';
 return 'Standard';
}

const setRows=await json('sets/en.json'),sets=[];
for(const [id,slug,series] of meta){
 const source=setRows.find(set=>set.id===id);
 if(!source)throw new Error('Missing set metadata for '+id);
 const raw=await json('cards/en/'+id+'.json');
 const cards=raw.map(card=>{
  const rarity=card.rarity||(Number(card.number)>source.printedTotal?'Rare Secret':'Unknown');
  const name=card.name.replace(/\s+/g,' ').trim();
  return {number:card.number,name,rarity,type:card.types?.[0]||card.supertype,category:category({...card,set:source},rarity),...(id==='ex10'&&!/^\d+$/.test(card.number)?{subsetTotal:28}:{})};
 }).sort((a,b)=>numberKey(a.number)-numberKey(b.number)||String(a.number).localeCompare(String(b.number)));
 sets.push({id,slug,name:source.name,series,printedTotal:source.printedTotal,total:cards.length,release:source.releaseDate.replace(/\//g,'-'),checklistSource:base+'cards/en/'+id+'.json',cards});
 const eligible=cards.filter(card=>/rare|promo/i.test(card.rarity));
 console.log(id,source.name,cards.length,'cards,',eligible.length,'rare,',eligible.filter(card=>card.category!=='Standard'&&card.category!=='Holo rare').length,'chase');
}
writeFileSync(root+'site/data/legacy-catalogs.json',JSON.stringify(sets)+'\n');
console.log('Wrote',sets.length,'sets and',sets.reduce((n,set)=>n+set.cards.length,0),'cards to site/data/legacy-catalogs.json');

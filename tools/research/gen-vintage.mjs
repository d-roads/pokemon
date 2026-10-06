// Rebuild the English Wizards-era checklist, including the e-Card sets before EX.
import {writeFileSync} from 'node:fs';
const source='https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/';
const meta=[['base1','base-set'],['base2','jungle'],['base3','fossil'],['base4','base-set-2'],['base5','team-rocket'],['gym1','gym-heroes'],['gym2','gym-challenge'],['neo1','neo-genesis'],['neo2','neo-discovery'],['neo3','neo-revelation'],['neo4','neo-destiny'],['base6','legendary-collection'],['ecard1','expedition'],['ecard2','aquapolis'],['ecard3','skyridge'],['basep','promo'],['si1','southern-islands'],['bp','best-of-game']];
async function json(path){const r=await fetch(source+path,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(path+': HTTP '+r.status);return r.json();}
const metadata=await json('sets/en.json'),sets=[];
for(const [id,slug] of meta){
 const s=metadata.find(s=>s.id===id);if(!s)throw new Error('Missing set '+id);
 const raw=await json('cards/en/'+id+'.json');
 const cards=raw.map(c=>{
  const rarity=c.rarity||(id==='si1'?'Promo':'Unknown'),h=/^H\d+$/.test(c.number);
  const category=/Shining/i.test(c.name)?'Shining':/Secret/i.test(rarity)?'Secret rare':/Promo/i.test(rarity)?'Promo':/Holo/i.test(rarity)?'Holo rare':'Standard';
  const aliases={'base1-73':['Imposter Professor Oak'],'base4-102':['Imposter Professor Oak'],'basep-24':['Birthday Pikachu'],'neo4-94':["Imposter Professor Oak's Invention"],'gym1-104':["Rocket's Training Gym"]};
  return {number:c.number,name:c.name,...(aliases[id+'-'+c.number]?{nameAliases:aliases[id+'-'+c.number]}:{}),rarity,...(id==='base1'&&c.number==='8'?{nativeFirstEdition:true}:{}),...(id==='bp'&&['8','9'].includes(c.number)?{nativeWinner:true}:{}),type:c.types?.[0]||c.supertype,category,...(h?{subsetTotal:32}:{}),...((id==='si1'&&['1','4','7','10','13','16'].includes(c.number))||id==='bp'?{nativeReverse:true}: {})};
 });
 sets.push({id,slug,name:id==='base1'?'Base Set':s.name,series:'WOTC',printedTotal:id==='basep'?null:s.printedTotal,total:cards.length,release:s.releaseDate.replaceAll('/','-'),checklistSource:source+'cards/en/'+id+'.json',cards});
 console.log(id,cards.length,'cards,',cards.filter(c=>/rare|promo/i.test(c.rarity)).length,'rare/promos');
}
writeFileSync(new URL('../../site/data/vintage-catalogs.json',import.meta.url),JSON.stringify(sets,null,2)+'\n');

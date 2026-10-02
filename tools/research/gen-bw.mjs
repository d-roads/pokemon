import {readFileSync,writeFileSync} from 'node:fs';
const root='/home/claude/pokemontcg/pokemon-tcg-data/';
const sets=JSON.parse(readFileSync(root+'sets/en.json','utf8'));
const meta=[['bw1','black-&-white','Black & White Base Set'],['bw2','emerging-powers'],['bw3','noble-victories'],['bw4','next-destinies'],['bw5','dark-explorers'],['bw6','dragons-exalted'],['dv1','dragon-vault'],['bw7','boundaries-crossed'],['bw8','plasma-storm'],['bw9','plasma-freeze'],['bw10','plasma-blast'],['bw11','legendary-treasures']];
const out=[];
for(const [id,slug,label] of meta){
 const s=sets.find(x=>x.id===id);const raw=JSON.parse(readFileSync(root+'cards/en/'+id+'.json','utf8'));
 const cards=raw.map(c=>{
  let rarity=c.rarity;
  if(id==='dv1'&&!rarity)rarity=c.number==='21'?'Rare Secret':'Rare Holo';
  const name=c.name.replace(/-EX\b/g,' EX').replace(/\s+/g,' ').trim();
  const rc=/^RC/.test(c.number);
  const category=/Secret/i.test(rarity)?'Secret rare':/Ultra/i.test(rarity)?'Full art':/ACE/i.test(rarity)?'ACE SPEC':/ EX$/.test(name)?'Pokémon EX':rc?'Radiant Collection':/Holo/i.test(rarity)?'Holo rare':'Standard';
  return {number:c.number,name,rarity,category};
 }).sort((a,b)=>{const k=n=>/^RC/.test(n)?1000+Number(n.slice(2)):Number(n);return k(a.number)-k(b.number);});
 out.push({id,slug,name:label||s.name,series:'BW',printedTotal:s.printedTotal,total:cards.length,release:s.releaseDate.replace(/\//g,'-'),rcTotal:cards.filter(c=>/^RC/.test(c.number)).length||undefined,checklistSource:'https://pokemontcg.io/',cards});
}
writeFileSync('/home/claude/pokemon/site/data/bw-catalogs.json',JSON.stringify(out));
for(const s of out){const e=s.cards.filter(c=>/rare|promo/i.test(c.rarity));console.log(s.id,s.name,s.printedTotal,s.total,s.release,'eligible',e.length,'chase',e.filter(c=>/Full art|Secret|EX/.test(c.category)).length);}
console.log('eligible total',out.reduce((n,s)=>n+s.cards.filter(c=>/rare|promo/i.test(c.rarity)).length,0));

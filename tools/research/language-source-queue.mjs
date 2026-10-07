import {cards,sets} from '../../site/data/catalog.mjs';
import {writeFileSync} from 'node:fs';
const base='https://bulbapedia.bulbagarden.net/wiki/';
const url=s=>base+encodeURIComponent(s.replaceAll(' ','_')).replaceAll('%28','(').replaceAll('%29',')');
const species=[...new Set(cards.filter(c=>c.japanese).map(c=>c.species).filter(Boolean))].sort();
const queue=species.map(name=>({key:name,kind:'species',url:url(name+' (TCG)')}));
const en=cards.filter(c=>!c.japanese);
const trainerNames=new Set(en.filter(c=>c.eligible&&['Trainer','Energy'].includes(c.type)).map(c=>c.name));
const releases=new Map(sets.map(s=>[s.id,s.release]));
const grouped=new Map();for(const c of en.filter(c=>trainerNames.has(c.name))){const prev=grouped.get(c.name);if(!prev||releases.get(c.setId)<releases.get(prev.setId)||c.setId===prev.setId&&Number(c.number)<Number(prev.number))grouped.set(c.name,c);}
// Trainers with changed effects need individual card articles as well as their origin.
for(const [name,c] of grouped){const set=/^ex\d/.test(c.setId)?'EX '+c.setName:c.setName;
 queue.push({key:name,kind:'trainer-origin',url:url(name+' ('+set+' '+c.number+')')});}
writeFileSync(new URL('../../../work/language-source-queue.json',import.meta.url),JSON.stringify(queue));
console.log(JSON.stringify({species:species.length,trainers:grouped.size,total:queue.length}));

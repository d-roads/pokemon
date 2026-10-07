import test from 'node:test';
import assert from 'node:assert/strict';
import {numberedTableRows,numberKey} from '../../tools/research/language-reference.mjs';
import {cards} from '../data/catalog.mjs';
import registry from '../data/language-pairs.json' with {type:'json'};

test('Reference parsing requires both printing endpoints on the same row',()=>{
 const rows=numberedTableRows({url:'https://example.test/card',lines:[
  {n:1,text:'| Umbreon VMAX | Evolving Skies | 215/203 | Eevee Heroes | 095/069 |'},
  {n:2,text:'| | | | Eevee Heroes | 094/069 |'},
  {n:3,text:'| | Evolving Skies | 214/203 | | |'},
 ]});
 assert.equal(rows.length,1);assert.equal(rows[0].jaNumber,'095/069');
 assert.equal(numberKey('095/069'),'95');
});

test('Infobox Japanese-only reprints do not inherit an English counterpart',()=>{
 const text=['English expansion Hidden Fates','English card no. 67/68','Japanese expansion Double Blaze','Japanese card no. 105/095','Japanese expansion Tag All Stars','Japanese card no. 193/173'];
 const rows=numberedTableRows({url:'https://example.test/card',lines:text.map((text,n)=>({text,n}))});
 assert.equal(rows.length,1);assert.equal(rows[0].jaNumber,'105/095');
});

test('Exact origin references recover alternate art and trainer counterparts',()=>{
 const byId=new Map(cards.map(c=>[c.id,c]));
 for(const [en,ja] of [['sm115-67','ja-sm10-105'],['swsh7-215','ja-s6a-095'],['sm3-140','ja-sm3n-055'],['ex11-17','ja-pcg6-069']]){
  assert.deepEqual(byId.get(en).japaneseIds,[ja]);assert.equal(byId.get(ja).englishId,en);
 }
 assert.equal(registry.pairs.length,new Set(registry.pairs.map(p=>p.en)).size);
 assert.equal(registry.pairs.length,new Set(registry.pairs.map(p=>p.ja)).size);
 assert.ok(registry.pairs.every(p=>p.source?.startsWith('https://')&&p.sourceLine>=0));
});

test('Vintage display uses physical numbering while record ids remain stable',()=>{
 const venusaur=cards.find(c=>c.id==='ja-pmcg1-011');
 assert.equal(venusaur.number,11);assert.equal(venusaur.collectorNumber,null);
 assert.equal(venusaur.numberLabel,'Unnumbered · Pokédex 003');
 assert.equal(venusaur.englishId,'base1-15');
 const doll=cards.find(c=>c.id==='ja-pmcg1-091');
 assert.equal(doll.numberLabel,'Unnumbered','a trainer featuring a Pokémon has no printed Pokédex number');
});

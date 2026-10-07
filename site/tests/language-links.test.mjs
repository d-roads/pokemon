import test from 'node:test';
import assert from 'node:assert/strict';
import {linkLanguages} from '../data/language-links.mjs';
import {cards} from '../data/catalog.mjs';
import registry from '../data/language-pairs.json' with {type:'json'};
const en=[{id:'en-a'},{id:'en-b'}],ja=[{id:'ja-a',japanese:true},{id:'ja-b',japanese:true}];
const pair={en:'en-a',ja:'ja-a',evidence:'Reviewed matching artwork and expansion printing'};
test('Reviewed registry rejects missing evidence, missing cards and ambiguous printings',()=>{
 for(const pairs of [[{...pair,evidence:''}],[{...pair,en:'missing'}],[{...pair,ja:'missing'}],[pair,pair],[pair,{...pair,ja:'ja-b'}],[pair,{...pair,en:'en-b'}]])assert.throws(()=>linkLanguages(en,ja,{pairs}),/Invalid|Ambiguous/);
});
test('Legacy guesses cannot leak into catalog links',()=>{
 const result=linkLanguages([{id:'en-a',japaneseIds:['ja-b']}],[{id:'ja-a',englishId:'en-a',englishLink:'stats+first-print'},{id:'ja-b',englishId:'en-a'}],{pairs:[pair]});
 assert.deepEqual(result[0].japaneseIds,['ja-a']);assert.equal(result[1].englishId,'en-a');assert.equal(result[2].englishId,undefined);
 assert.equal(linkLanguages(en,ja,{pairs:[]}).filter(c=>c.englishId||c.japaneseIds).length,0);
});
test('Every enabled catalog link is exactly registered',()=>{
 const registered=new Set(registry.pairs.map(p=>p.en+'|'+p.ja));
 for(const c of cards){
  if(c.englishId)assert.ok(c.languagePairVerified&&registered.has(c.englishId+'|'+c.id),c.id);
  if(c.japaneseIds){assert.equal(c.japaneseIds.length,1);assert.ok(c.languagePairVerified&&registered.has(c.id+'|'+c.japaneseIds[0]),c.id);}
 }
});

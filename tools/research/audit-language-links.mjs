// Run from anywhere: node tools/research/audit-language-links.mjs
// Checks every catalog card and writes a deterministic candidate/review coverage report.
import {writeFileSync} from 'node:fs';
import {cards} from '../../site/data/catalog.mjs';
import registry from '../../site/data/language-pairs.json' with {type:'json'};
const byId=new Map(cards.map(c=>[c.id,c]));
const candidates=cards.filter(c=>c.japanese&&c.englishCandidateIds?.length).map(c=>({ja:c.id,candidates:c.englishCandidateIds,method:c.englishCandidateMethod||'fingerprint',verified:!!c.languagePairVerified}));
for(const c of cards){
 if(c.japaneseIds){
  if(!c.languagePairVerified||c.japaneseIds.length!==1||byId.get(c.japaneseIds[0])?.englishId!==c.id)throw new Error('Invalid reciprocal pair '+c.id);
 }
 if(c.englishId&&(!c.languagePairVerified||byId.get(c.englishId)?.japaneseIds?.[0]!==c.id))throw new Error('Invalid reciprocal pair '+c.id);
 for(const id of c.englishCandidateIds||[])if(!byId.has(id)||byId.get(id).japanese)throw new Error('Invalid candidate '+c.id+' / '+id);
}
const report={policy:'Only reviewed, reciprocal, one-to-one exact printing pairs enable language switching. Unknown counterparts stay disabled; they are not classified as nonexistent.',totalCards:cards.length,japaneseCards:cards.filter(c=>c.japanese).length,reviewedPairs:registry.pairs.length,candidateCards:candidates.length,quarantinedCandidateCards:candidates.filter(c=>!c.verified).length,candidates};
writeFileSync(new URL('./language-links-audit.json',import.meta.url),JSON.stringify(report,null,1)+'\n');
console.log(JSON.stringify({...report,candidates:undefined}));

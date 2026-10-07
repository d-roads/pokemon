// Only reviewed, exact printing pairs can enable a language switch. Candidate fingerprints
// (illustrator, HP, attacks, release date) do not establish artwork or printing identity.
export function linkLanguages(english,japanese,registry){
 const enById=new Map(english.map(c=>[c.id,c])),jaById=new Map(japanese.map(c=>[c.id,c]));
 const enLinks=new Map(),jaLinks=new Map();
 for(const pair of registry.pairs){
  if(!enById.has(pair.en)||!jaById.has(pair.ja)||!pair.evidence?.trim())throw new Error(`Invalid language pair: ${pair.en} / ${pair.ja}`);
  if(enLinks.has(pair.en)||jaLinks.has(pair.ja))throw new Error(`Ambiguous language pair: ${pair.en} / ${pair.ja}`);
  enLinks.set(pair.en,pair.ja);jaLinks.set(pair.ja,pair.en);
 }
 const clean=c=>{const {englishId,englishLink,japaneseIds,languagePairVerified,...rest}=c;return rest;};
 return [...english.map(c=>({...clean(c),...(enLinks.has(c.id)?{japaneseIds:[enLinks.get(c.id)],languagePairVerified:true}:{})})),
  ...japanese.map(c=>({...clean(c),...(jaLinks.has(c.id)?{englishId:jaLinks.get(c.id),englishLink:'reviewed-exact-printing',languagePairVerified:true}:{})}))];
}

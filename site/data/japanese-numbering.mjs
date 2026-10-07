// Early Japanese Pokémon cards show a National Pokédex number, not a collector fraction.
// Their TCGdex local ids are internal checklist positions and must remain stable record ids.
export function japaneseNumbering(set,card){
 if(!/^ja-(?:pmcg|neo)\d/.test(set.id))return {};
 const dex=card.species&&card.dexId?.length===1?String(card.dexId[0]).padStart(3,'0'):null;
 return {collectorNumber:null,numbering:dex?'pokedex':'unnumbered',...(dex?{pokedexNumber:dex}:{}),numberLabel:dex?`Unnumbered · Pokédex ${dex}`:'Unnumbered'};
}

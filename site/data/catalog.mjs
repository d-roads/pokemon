import extraSets from './xy-catalogs.json' with {type:'json'};
import bwSets from './bw-catalogs.json' with {type:'json'};
import smSets from './sm-catalogs.json' with {type:'json'};
import xySpecialSets from './xy-special-catalogs.json' with {type:'json'};
import legacySets from './legacy-catalogs.json' with {type:'json'};
import primalRarities from './primal-rarities.json' with {type:'json'};
import promos from './xy-promos.json' with {type:'json'};
import sourceUrls from './source-urls.json' with {type:'json'};
const names = `Weedle|Kakuna|Beedrill|Tangela|Tangrowth|Treecko|Grovyle|Sceptile|Sceptile|Lotad|Lombre|Ludicolo|Surskit|Masquerain|Shroomish|Breloom|Volbeat|Illumise|Trevenant EX|Vulpix|Ninetales|Slugma|Magcargo|Magcargo|Torchic|Torchic|Combusken|Blaziken|Camerupt EX|Horsea|Seadra|Staryu|Mudkip|Marshtomp|Swampert|Swampert|Ludicolo|Wailord EX|Barboach|Whiscash|Whiscash|Corphish|Feebas|Milotic|Spheal|Spheal|Sealeo|Walrein|Clamperl|Huntail|Gorebyss|Gorebyss|Kyogre|Kyogre EX|Primal Kyogre EX|Manaphy|Chinchou|Lanturn|Electrike|Electrike|Manectric|Tynamo|Eelektrik|Eelektrik|Eelektross|Nidoran♀|Nidorina|Nidoqueen|Nidoqueen|Tentacool|Tentacool|Tentacruel|Starmie|Rhyhorn|Rhydon|Rhyperior|Rhyperior|Nosepass|Meditite|Medicham|Medicham|Trapinch|Solrock|Groudon|Groudon EX|Primal Groudon EX|Hippopotas|Hippowdon|Drilbur|Diggersby|Sharpedo EX|Crawdaunt|Aggron EX|M Aggron EX|Probopass|Excadrill|Excadrill|Honedge|Doublade|Aegislash|Mr. Mime|Marill|Azumarill|Azumarill|Gardevoir EX|M Gardevoir EX|Kingdra|Kingdra|Vibrava|Flygon|Zigzagoon|Linoone|Skitty|Delcatty|Spinda|Bidoof|Bidoof|Bibarel|Bouffalant|Bunnelby|Bunnelby|Acro Bike|Aggron Spirit Link|Archie's Ace in the Hole|Dive Ball|Energy Retrieval|Escape Rope|Exp. Share|Fresh Water Set|Gardevoir Spirit Link|Groudon Spirit Link|Kyogre Spirit Link|Maxie's Hidden Ball Trick|Professor Birch's Observations|Rare Candy|Repeat Ball|Rough Seas|Scorched Earth|Shrine of Memories|Silent Lab|Teammates|Weakness Policy|Shield Energy|Wonder Energy|Trevenant EX|Camerupt EX|Wailord EX|Kyogre EX|Primal Kyogre EX|Groudon EX|Primal Groudon EX|Sharpedo EX|Aggron EX|M Aggron EX|Gardevoir EX|M Gardevoir EX|Archie's Ace in the Hole|Maxie's Hidden Ball Trick|Professor Birch's Observations|Teammates|Dive Ball|Enhanced Hammer|Switch|Weakness Policy`.split('|');
const ancient = new Set([9,24,26,36,37,41,52,60,64,69,71,77,81,97,104,108,117,121]);

// PriceCharting product slugs keep apostrophes (as %27) and hyphens, and drop other punctuation.
// Exact product URLs, verified against PriceCharting's set listings, live in source-urls.json;
// this is only the fallback for cards that are not listed there.
export const pcSlug=name=>String(name).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[♀♂]/g,'').replace(/[\u2019']/g,'%27').replace(/[^a-z0-9% -]/g,'').trim().replace(/[\s-]+/g,'-');
const sourceSuffix=value=>value==='!'?'exclamation':value==='?'?'question-mark':String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const sourceFor=(id,setSlug,name,suffix)=>sourceUrls[id]||'https://www.pricecharting.com/game/pokemon-'+setSlug+'/'+pcSlug(name)+'-'+sourceSuffix(suffix);

const primalCards = names.map((name, i) => {
  const number = i + 1;
  let type = number <=19 ? 'Grass' : number <=29 ? 'Fire' : number <=56 ? 'Water' : number<=65 ? 'Lightning' : number<=73 ? 'Psychic' : number<=90 ? 'Fighting' : number<=92 ? 'Darkness' : number<=100 ? 'Metal' : number<=106 ? 'Fairy' : number<=110 ? 'Dragon' : number<=121 ? 'Colorless' : 'Trainer';
  if (number>=145 && number<=156) type = ['Grass','Fire','Water','Water','Water','Fighting','Fighting','Darkness','Metal','Metal','Fairy','Fairy'][number-145];
  if (number===143 || number===144) type='Energy';
  const category = number >160 ? 'Secret rare' : number>=145 ? 'Full art' : name.endsWith('EX') ? 'Pokémon EX' : ancient.has(number) ? 'Ancient Trait' : number>=122 ? 'Trainer & Energy' : 'Standard';
  return {id:`xy5-${number}`,number,name,type,category,image:`https://images.pokemontcg.io/xy5/${number}.png`,source:sourceFor(`xy5-${number}`,'primal-clash',name,number)};
});
export const SET_SOURCE='https://www.pokemon.com/static-assets/content-assets/cms2/pdf/trading-card-game/checklist/xy5_web_cardlist_en.pdf';
export const LIST_SOURCE='https://bulbapedia.bulbagarden.net/wiki/Primal_Clash_(TCG)';
export const IMAGE_SOURCE='https://pokemontcg.io/';
export const series=[{id:'EX',name:'EX',label:'EX Series',years:'2003–2007'},{id:'DP',name:'Diamond & Pearl / Platinum / HGSS',label:'Diamond & Pearl through HGSS',years:'2007–2011'},{id:'BW',name:'Black & White',label:'Black & White Series',years:'2011–2013'},{id:'XY',name:'XY',label:'XY Series',years:'2014–2016'},{id:'SM',name:'Sun & Moon',label:'Sun & Moon Series',years:'2017–2019'}];

const primalSet={id:'xy5',slug:'primal-clash',name:'Primal Clash',series:'XY',printedTotal:160,total:164,release:'2015-02-04',checklistSource:SET_SOURCE};
const promoSet={id:'xyp',slug:'promo',name:'XY Black Star Promos',series:'XY',printedTotal:null,total:promos.length,release:'2013-10-12',checklistSource:'https://eyevotcg.com/sets/xy-black-star-promos/checklist/'};
export const sets=[...legacySets.map(({cards,...set})=>set),primalSet,...extraSets.map(({cards,...set})=>({...set,series:'XY'})),...xySpecialSets.map(({cards,...set})=>set),promoSet,...bwSets.map(({cards,...set})=>set),...smSets.map(({cards,...set})=>set)].sort((a,b)=>a.release.localeCompare(b.release)).map(s=>({...s,marketSource:'https://www.pricecharting.com/console/pokemon-'+s.slug}));

const xyNumbered=extraSets.flatMap(s=>s.cards.map(c=>{
 const radiant=c.number.startsWith('RC'),number=radiant?c.number:Number(c.number),fullArt=radiant?Number(c.number.slice(2))>=28:s.fullArtStart>0&&number>=s.fullArtStart;
 const category=/secret/i.test(c.rarity)?'Secret rare':fullArt?'Full art':c.name.endsWith('EX')?'Pokémon EX':c.name.endsWith('BREAK')?'BREAK':radiant?'Radiant Collection':'Standard';
 const id=s.id+'-'+c.number;
 return {...c,id,number,setId:s.id,setName:s.name,printedTotal:radiant?32:s.printedTotal,numberLabel:c.number+'/'+(radiant?'RC32':s.printedTotal),type:c.rarity,category,image:'https://images.pokemontcg.io/'+s.id+'/'+c.number+'.png',source:sourceFor(id,s.slug,c.name,c.number)};
}));
const bwNumbered=bwSets.flatMap(s=>s.cards.map(c=>{
 const radiant=c.number.startsWith('RC'),number=radiant?c.number:Number(c.number),id=s.id+'-'+c.number;
 return {number,name:c.name,rarity:c.rarity,id,setId:s.id,setName:s.name,printedTotal:radiant?s.rcTotal:s.printedTotal,numberLabel:c.number+'/'+(radiant?'RC'+s.rcTotal:s.printedTotal),type:c.rarity,category:c.category,image:'https://images.pokemontcg.io/'+s.id+'/'+c.number+'.png',source:sourceFor(id,s.slug,c.name,c.number)};
}));
const smNumbered=smSets.flatMap(s=>s.cards.map(c=>{
 const numeric=/^\d+$/.test(c.number),number=numeric?Number(c.number):c.number,id=s.id+'-'+c.number,total=c.subsetTotal||s.printedTotal;
 return {number,name:c.name,rarity:c.rarity,id,setId:s.id,setName:s.name,printedTotal:total,numberLabel:c.number+'/'+(c.subsetTotal?'SV'+c.subsetTotal:total),type:c.type||c.rarity,category:c.category,image:'https://images.pokemontcg.io/'+(c.imageSetId||s.id)+'/'+c.number+'.png',source:sourceFor(id,s.slug,c.name,c.number)};
}));
const xySpecialNumbered=xySpecialSets.flatMap(s=>s.cards.map(c=>{const number=Number(c.number),id=s.id+'-'+c.number;return {number,name:c.name,rarity:c.rarity,id,setId:s.id,setName:s.name,printedTotal:s.printedTotal,numberLabel:c.number+'/'+s.printedTotal,type:c.type||c.rarity,category:c.category,image:'https://images.pokemontcg.io/'+s.id+'/'+c.number+'.png',source:sourceFor(id,s.slug,c.name,c.number)};}));
const legacyNumbered=legacySets.flatMap(s=>s.cards.map(c=>{const numeric=/^\d+$/.test(c.number),number=numeric?Number(c.number):c.number,id=s.id+'-'+c.number,total=c.subsetTotal||s.printedTotal,numberLabel=c.subsetTotal?c.number+'/'+c.subsetTotal:numeric?c.number+'/'+s.printedTotal:c.number;return {...c,number,id,setId:s.id,setName:s.name,printedTotal:total,numberLabel,image:'https://images.pokemontcg.io/'+s.id+'/'+c.number+'.png',source:sourceFor(id,s.slug,c.name,c.number)};}));
const numberedCards=[...legacyNumbered,...primalCards.map(c=>({...c,rarity:primalRarities.find(r=>r.number===c.number).rarity,setId:'xy5',setName:'Primal Clash',printedTotal:160,numberLabel:c.number+'/160'})),...xyNumbered,...xySpecialNumbered,...bwNumbered,...smNumbered];
const seriesOf=Object.fromEntries(sets.map(s=>[s.id,s.series]));
export const cards=[...numberedCards,...promos.map(c=>({...c,id:'xyp-'+c.number,setId:'xyp',setName:promoSet.name,category:'Promo',type:'Black Star Promo',printedTotal:null,numberLabel:c.number,image:'https://images.pokemontcg.io/xyp/'+c.number+'.png',source:sourceFor('xyp-'+c.number,'promo',c.name,'xy'+String(c.number).slice(2))}))].map(c=>({...c,series:seriesOf[c.setId],eligible:/rare|promo|legend/i.test(c.rarity),chase:/Full art|Secret rare|Promo|BREAK|Pokémon (?:EX|ex|GX|LV\.X)|Shiny|Prism Star|Shining|Gold Star|Prime|LEGEND/.test(c.category)}));

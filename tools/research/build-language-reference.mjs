// Build exact counterparts and missing Japanese printings from numbered reference facts.
// Capture mode: node tools/research/build-language-reference.mjs <web capture directory>
// Rebuild mode: node tools/research/build-language-reference.mjs --facts [--write]
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {cards,sets} from '../../site/data/catalog.mjs';
import {referencePages,numberedTableRows,setKey,numberKey} from './language-reference.mjs';
import metadata from './japanese-set-metadata.json' with {type:'json'};
import aliases from './language-set-aliases.json' with {type:'json'};
import primaryCards from './japanese-card-metadata.json' with {type:'json'};
import corrections from './language-reference-corrections.json' with {type:'json'};
const factsFile=new URL('./language-printing-facts.json',import.meta.url),catalogFile=new URL('../../site/data/japanese-catalogs.json',import.meta.url);
let facts;
if(process.argv.includes('--facts'))facts=JSON.parse(readFileSync(factsFile,'utf8'));
else{
 const dir=process.argv[2];if(!dir)throw Error('Capture directory or --facts required');
 const pages=readdirSync(dir).filter(f=>f.endsWith('.txt')).sort().flatMap(f=>referencePages(readFileSync(dir+'/'+f,'utf8')));
 const unique=new Map();for(const page of pages)for(const row of numberedTableRows(page))unique.set([row.source,row.line,row.enSet,row.enNumber,row.jaSet,row.jaNumber].join('|'),row);
 facts={policy:'Explicit numbered expansion/printing references; no illustrator, stats, name-only or release-order inference.',sources:[...new Set(pages.filter(p=>!p.error).map(p=>p.url))].sort(),unavailableSources:[...new Set(pages.filter(p=>p.error).map(p=>p.url))].sort(),rows:[...unique.values()]};
 writeFileSync(factsFile,JSON.stringify(facts,null,1)+'\n');
}
const catalog=JSON.parse(readFileSync(catalogFile,'utf8')),catalogById=new Map(catalog.map(s=>[s.id,s]));
const enSets=new Map(),jaSets=new Map(),metaById=new Map();
for(const s of sets.filter(s=>s.lang!=='ja')){enSets.set(setKey(s.name),s.id);if(s.series==='EX')enSets.set(setKey('EX '+s.name),s.id);}
for(const s of catalog)jaSets.set(setKey(s.name),s.id);
for(const row of metadata.sets){const id='ja-'+row.tcgdex.toLowerCase().replace(/[^a-z0-9]+/g,'');metaById.set(id,row);jaSets.set(setKey(row.name),id);}
for(const [name,id] of Object.entries(aliases.ja))if(metaById.has(id))jaSets.set(setKey(name),id);
for(const [name,id] of Object.entries(aliases.en))if(sets.some(s=>s.id===id))enSets.set(setKey(name),id);
const index=new Map();for(const c of cards){const sourceNumber=c.japanese&&/^ja-(?:pmcg|neo)\d/.test(c.setId)?null:(c.numberText??c.number);if(sourceNumber==null)continue;const key=c.setId+'|'+numberKey(sourceNumber);if(!index.has(key))index.set(key,[]);index.get(key).push(c);}
const vintageName=c=>{
 if(!c.species||!c.nameJa)return null;let rest=c.nameJa.replace(/\s/g,''),prefix='';
 for(const [ja,en] of [['わるい','Dark '],['やさしい','Light '],['ひかる','Shining '],['タケシの',"Brock's "],['カスミの',"Misty's "],['マチスの',"Lt. Surge's "],['エリカの',"Erika's "],['ナツメの',"Sabrina's "],['キョウの',"Koga's "],['カツラの',"Blaine's "],['サカキの',"Giovanni's "]])if(rest.startsWith(ja)){prefix=en;rest=rest.slice(ja.length);break;}
 return /^[ァ-ヴー・♂♀]+$/.test(rest)?prefix+c.species:/^[A-Za-z .'-]+$/.test(rest)?c.nameJa:null;
};
const speciesByDex=new Map(cards.filter(c=>c.japanese&&c.species&&c.dexId?.length===1).map(c=>[c.dexId[0],c.species]));
const knownSpecies=new Set([...speciesByDex.values()].map(setKey));
const primaryById=new Map(primaryCards.cards.map(c=>[c.id,c]));
const possible=new Map(),rejected=[],missingEn=new Map(),missingJa=new Map(),additions=new Map();
for(const original of facts.rows){
 if(/Special_(?:illustration|Art)|_(?:ITCG|TCTCG|KTCG|SCTCG|TTCG)/i.test(decodeURIComponent(original.source)))continue;
 const fix=corrections.find(c=>c.source===original.source&&c.enSet===original.enSet&&c.enNumber===original.enNumber&&c.oldJaNumber===original.jaNumber);
 const row=fix?{...original,jaNumber:fix.jaNumber,correction:fix.reference}:original;
 const enSet=enSets.get(setKey(row.enSet)),jaSet=jaSets.get(setKey(row.jaSet));
 if(!enSet){missingEn.set(row.enSet,(missingEn.get(row.enSet)||0)+1);continue;}
 if(!jaSet){missingJa.set(row.jaSet,(missingJa.get(row.jaSet)||0)+1);continue;}
 const en=(index.get(enSet+'|'+numberKey(row.enNumber))||[]).filter(c=>!c.nativeStamp&&!c.nativeNonHolo&&!c.nativeHolo);
 if(en.length!==1)continue;const e=en[0],meta=metaById.get(jaSet);
 if(row.enNumber.includes('/')&&e.printedTotal&&/^\d+$/.test(row.enNumber.split('/')[1])&&Number(row.enNumber.split('/')[1])!==e.printedTotal){rejected.push({row,reason:'English printed total disagrees with catalog'});continue;}
 const sourceSpecies=decodeURIComponent(row.source.split('/wiki/')[1]||'').replace(/_\(TCG\)$/,'').replaceAll('_',' ');
 if(decodeURIComponent(row.source).endsWith('_(TCG)')&&knownSpecies.has(setKey(sourceSpecies))&&!setKey(e.name).includes(setKey(sourceSpecies))){rejected.push({row,reason:'English numbered card disagrees with the reference species'});continue;}
 let ja=row.jaNumber==null&&/^ja-(?:pmcg|neo)\d/.test(jaSet)?cards.filter(c=>c.setId===jaSet&&setKey(vintageName(c))===setKey(e.name)&&/holo/i.test(c.rarity)===/holo/i.test(e.rarity)):index.get(jaSet+'|'+numberKey(row.jaNumber))||[];
 if(row.jaNumber?.includes('/')&&meta?.printedTotal&&/^\d+$/.test(row.jaNumber.split('/')[1])&&Number(row.jaNumber.split('/')[1])!==meta.printedTotal){rejected.push({row,reason:'Japanese printed total disagrees with set metadata'});continue;}
 // An explicitly published edition can be missing from our Japanese card list. Add it
 // with its real number and source, preserving every existing record id and field.
 if(!ja.length&&row.jaNumber!=null&&meta?.release&&e.eligible&&!/^ja-(?:pmcg|neo)\d/.test(jaSet)){
  const number=row.jaNumber.split('/')[0],id=jaSet+'-'+number;
  if(cards.some(c=>c.id===id))continue;
  const primary=primaryById.get(id);
  const expectedCategory=e.type==='Trainer'?'Trainer':e.type==='Energy'?'Energy':'Pokemon';
  if(primary&&(primary.category!==expectedCategory||primary.dexId.map(d=>speciesByDex.get(d)).filter(Boolean).some(name=>!setKey(e.name).includes(setKey(name))))){rejected.push({row,reason:'Primary Japanese card identity disagrees'});continue;}
  const raw={number,name:e.name,nameJa:primary?.names?.ja||null,rarity:primary?.rarity||'Unlisted rarity',category:e.category,...(primary?.illustrator?{illustrator:primary.illustrator}:{}),...(primary?.dexId?.length?{dexId:primary.dexId}:{}),...(primary?{primaryCardSource:primary.source}:{}),counterpartReference:row.source,englishCandidates:0};
  const j={...raw,id,setId:jaSet,japanese:true};ja=[j];index.set(jaSet+'|'+numberKey(number),ja);additions.set(id,{setId:jaSet,raw});
 }
 if(ja.length!==1)continue;const j=ja[0];
 if(j.species&&!setKey(e.name).includes(setKey(j.species))){rejected.push({row,reason:'Japanese species disagrees with English numbered printing'});continue;}
 const key=e.id+'|'+j.id;
 if(!possible.has(key))possible.set(key,{en:e.id,ja:j.id,evidence:`Explicit ${row.kind}: ${row.enSet} #${row.enNumber} ↔ ${row.jaSet} ${row.jaNumber?'#'+row.jaNumber:'(unnumbered)'}`,source:row.source,sourceLine:row.line,...(row.correction?{correctionSource:row.correction}:{}),enNumber:row.enNumber,jaNumber:row.jaNumber});
}
const enLinks=new Map(),jaLinks=new Map();for(const p of possible.values())for(const [m,key,val] of [[enLinks,p.en,p.ja],[jaLinks,p.ja,p.en]]){if(!m.has(key))m.set(key,new Set());m.get(key).add(val);}
const pairs=[...possible.values()].filter(p=>enLinks.get(p.en).size===1&&jaLinks.get(p.ja).size===1).sort((a,b)=>a.en.localeCompare(b.en,'en',{numeric:true}));
const conflicts=[...possible.values()].filter(p=>enLinks.get(p.en).size>1||jaLinks.get(p.ja).size>1);
const activeJa=new Set(pairs.map(p=>p.ja));let addedCards=0,addedSets=0;
for(const [id,{setId,raw}] of additions){if(!activeJa.has(id))continue;
 if(!catalogById.has(setId)){const m=metaById.get(setId),set={id:setId,lang:'ja',tcgdexId:m.tcgdex,name:m.name,nameJa:m.nameJa,series:m.era,kind:m.kind,printedTotal:m.printedTotal,total:0,release:m.release,slug:m.pricecharting?.replace(/^pokemon-/, '')||null,marketSource:m.pricecharting&&m.pricechartingListed?'https://www.pricecharting.com/console/'+m.pricecharting:null,marketSourceListed:!!m.pricechartingListed,checklistSource:m.source,cards:[]};catalogById.set(setId,set);catalog.push(set);addedSets++;}
 const set=catalogById.get(setId);set.cards.push(raw);set.total=set.cards.length;addedCards++;
}
writeFileSync(new URL('../../../work/language-new-card-queue.json',import.meta.url),JSON.stringify([...additions].filter(([id])=>activeJa.has(id)).map(([id,{setId,raw}])=>({id,setId,number:raw.number,tcgdex:metaById.get(setId).tcgdex})))+'\n');
const summary={sources:facts.sources.length,sourceRows:facts.rows.length,possiblePairs:possible.size,uniquePairs:pairs.length,addedCards,addedSets,referenceBackedCards:catalog.reduce((n,s)=>n+s.cards.filter(c=>c.counterpartReference).length,0),referenceBackedSets:catalog.filter(s=>s.cards.some(c=>c.counterpartReference)).length,conflicts,rejected,unavailableSources:facts.unavailableSources,missingEnglishSets:[...missingEn].sort((a,b)=>b[1]-a[1]),missingJapaneseSets:[...missingJa].sort((a,b)=>b[1]-a[1])};
writeFileSync(new URL('./language-reference-report.json',import.meta.url),JSON.stringify(summary,null,1)+'\n');
console.log(JSON.stringify({...summary,conflicts:conflicts.length,rejected:rejected.length,unavailableSources:summary.unavailableSources.length,missingEnglishSets:summary.missingEnglishSets.slice(0,5),missingJapaneseSets:summary.missingJapaneseSets.slice(0,8)}));
if(process.argv.includes('--write')){
 writeFileSync(catalogFile,JSON.stringify(catalog)+'\n');
 writeFileSync(new URL('../../site/data/language-pairs.json',import.meta.url),JSON.stringify({version:2,note:'Exact printing relationships from numbered expansion references, with independent set metadata. Unknown or conflicting counterparts stay disabled. Official numbers and set names may differ.',pairs},null,1)+'\n');
}

// Japanese catalog (Task 1 of the Japanese work): every rare/promo card of the Japanese sets in
// tools/research/japanese-sets.json, with its English counterpart in our catalog where one can be
// identified without guessing.
//
//   git clone --depth 1 https://github.com/tcgdex/cards-database /tmp/tcgdex
//   node tools/research/gen-japanese.mjs /tmp/tcgdex
//
// Writes site/data/japanese-catalogs.json and tools/research/japanese-coverage.json.
// Card lists come from TCGdex (MIT licence). Prices are NOT part of this step (Task 2).
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {loadTcgdex} from './tcgdex-load.mjs';
import {sets as allSets,cards as allCards} from '../../site/data/catalog.mjs';
const enSets=allSets.filter(s=>s.lang!=='ja'),enCards=allCards.filter(c=>c.lang!=='ja');

const src=process.argv[2];
if(!src)throw new Error('Usage: node tools/research/gen-japanese.mjs <path to tcgdex cards-database clone | cached JSON>');
const tcg=src.endsWith('.json')?JSON.parse(readFileSync(src,'utf8')):loadTcgdex(src);
const table=JSON.parse(readFileSync(new URL('./japanese-sets.json',import.meta.url),'utf8')).sets;
const outCatalog=new URL('../../site/data/japanese-catalogs.json',import.meta.url);
const outReport=new URL('./japanese-coverage.json',import.meta.url);

const norm=s=>String(s||'').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/&/g,'and').replace(/[^a-z0-9]/g,'');
const day=s=>s?Date.parse(s+'T00:00:00Z')/86400000:null;
const dateOf=(r,lang)=>typeof r==='string'?r:r?.[lang]||null;

// ---- 1. Our English sets <-> TCGdex English sets ---------------------------------------------
// Names match for most sets; these differ in wording. Every pairing is then checked card by card.
const EN_OVERRIDES={hgss1:'hgss1',hgss2:'hgss2',hgss3:'hgss3',hgss4:'hgss4',bw1:'bw1',xy1:'xy1',fut20:'fut2020',svp:'svp',sve:'sve',me55c:'30th-c'};
const intlSets=tcg.intl.sets.filter(s=>s.serie!=='tcgp').map(s=>({...s,en:s.name?.en,date:dateOf(s.releaseDate,'en')}));
const numKey=n=>{const m=String(n).trim().toUpperCase().match(/^([A-Z]*)0*(\d+)([A-Z]*)$/);return m?m[1]+Number(m[2])+m[3]:String(n).trim().toUpperCase();};
const enById=new Map(enCards.map(c=>[c.id,c]));
const enBySet=new Map();for(const c of enCards){if(!enBySet.has(c.setId))enBySet.set(c.setId,new Map());enBySet.get(c.setId).set(numKey(c.number),c);}
const intlBySet=new Map();for(const c of tcg.intl.cards){if(!intlBySet.has(c.setId))intlBySet.set(c.setId,[]);intlBySet.get(c.setId).push(c);}
const setPairs=[],setPairProblems=[];
for(const s of enSets){
 let t=EN_OVERRIDES[s.id]?intlSets.filter(x=>x.id===EN_OVERRIDES[s.id]):intlSets.filter(x=>norm(x.en)===norm(s.name));
 if(t.length>1)t=t.sort((a,b)=>Math.abs(day(a.date)-day(s.release))-Math.abs(day(b.date)-day(s.release)));
 const pick=t[0];if(!pick){setPairProblems.push({set:s.id,problem:'no TCGdex English set'});continue;}
 const ours=enBySet.get(s.id)||new Map(),theirs=intlBySet.get(pick.id)||[];
 let same=0,checked=0;for(const c of theirs){const o=ours.get(numKey(c.localId));if(!o)continue;checked++;if(norm(o.name).slice(0,6)===norm(c.name?.en).slice(0,6))same++;}
 if(checked<Math.min(5,theirs.length)||same/Math.max(1,checked)<0.8){setPairProblems.push({set:s.id,tcgdex:pick.id,checked,same,problem:'card names disagree'});continue;}
 setPairs.push({set:s.id,tcgdex:pick.id,checked,same});
}
const ourSetOf=new Map(setPairs.map(p=>[p.tcgdex,p.set]));

// ---- 2. English fingerprints ---------------------------------------------------------------------
const ill=s=>norm(s);
const sig=c=>(c.attacks||[]).map(a=>(a.cost||[]).length+':'+String(a.damage??'')).join('|');
// Rarity class, comparable across languages: the Japanese SR is the English Ultra Rare full art, AR is the
// Illustration Rare, SAR the Special Illustration Rare, UR/HR the gold or rainbow secret rares. null = unknown.
const JA_CLASS={'Illustration rare':'AR','Ultra Rare':'SR','Special illustration rare':'SAR','Hyper rare':'UR','Secret Rare':'UR','Mega Hyper Rare':'UR','Shiny rare':'S','Shiny Ultra Rare':'SSR','Common':'base','Uncommon':'base','Rare':'base','Holo Rare':'base','Rare Holo':'base','Double rare':'base','Triple Rare':'base','Radiant Rare':'base','ACE SPEC Rare':'base','Black White Rare':'UR'};
const EN_CLASS=r=>!r||r==='None'||r==='Promo'?null:/^Illustration rare$/.test(r)?'AR':/^(Ultra Rare|Full Art Trainer)$/.test(r)?'SR':/^Special illustration rare$/.test(r)?'SAR':/^(Secret Rare|Hyper rare|Mega Hyper Rare|Black White Rare)$/.test(r)?'UR':/^Shiny rare/.test(r)?'S':/^Shiny Ultra Rare$/.test(r)?'SSR':/Diamond|Star|Shiny$|Crown/.test(r)?null:'base';
const enIndex=new Map(); // illustrator -> English cards in our catalog
const enByDex=new Map(); // Pokédex number -> English Pokémon cards in our catalog (for cards without illustrator data)
let enIndexed=0;
for(const c of tcg.intl.cards){
 const our=ourSetOf.get(c.setId);if(!our)continue;
 const o=enBySet.get(our)?.get(numKey(c.localId));if(!o)continue;
 const set=intlSets.find(x=>x.id===c.setId);
 const f={id:o.id,setId:our,name:o.name,eligible:o.eligible,cat:c.category,dex:c.dexId||[],hp:c.hp??null,sig:sig(c),stage:c.stage||'',trainerType:c.trainerType||'',release:day(set?.date),promo:/promo/i.test(o.category||'')||/p$/.test(our),cls:EN_CLASS(c.rarity),ill:ill(c.illustrator)};
 const k=ill(c.illustrator);if(!enIndex.has(k))enIndex.set(k,[]);enIndex.get(k).push(f);enIndexed++;
 for(const d of f.dex){if(!enByDex.has(d))enByDex.set(d,[]);enByDex.get(d).push(f);}
}
// Species names by National Pokédex number, from English cards with no prefix/suffix.
const species=new Map();
for(const c of tcg.intl.cards){if(c.category!=='Pokemon'||(c.dexId||[]).length!==1)continue;const n=c.name?.en;if(!n||/\s/.test(n.replace(/^Mr\. |^Mime Jr\.|^Type: Null|^Tapu |^Porygon-Z|^Ho-Oh/,'')))continue;const t=species.get(c.dexId[0])||{};t[n]=(t[n]||0)+1;species.set(c.dexId[0],t);}
const speciesName=d=>{const t=species.get(d);return t?Object.entries(t).sort((a,b)=>b[1]-a[1])[0][0]:null;};

// ---- 3. Japanese cards -------------------------------------------------------------------------
const RARE=/^(Rare|Holo Rare|Rare Holo|Double rare|Triple Rare|Ultra Rare|Illustration rare|Special illustration rare|Hyper rare|Secret Rare|Mega Hyper Rare|Shiny rare|Shiny Ultra Rare|Radiant Rare|Character Rare|Character Super Rare|ACE SPEC Rare|Classic Collection|Black White Rare|RGB Rare|Futuristic Rare|Promo)$/;
const RARITY_LABEL={'Double rare':'Double Rare (RR)','Triple Rare':'Triple Rare (RRR)','Ultra Rare':'Super Rare (SR)','Illustration rare':'Art Rare (AR)','Special illustration rare':'Special Art Rare (SAR)','Hyper rare':'Ultra Rare (UR)','Mega Hyper Rare':'Mega Ultra Rare (MUR)','Shiny rare':'Shiny Rare (S)','Shiny Ultra Rare':'Shiny Super Rare (SSR)','Radiant Rare':'Radiant (K)','Character Rare':'Character Rare (CHR)','Character Super Rare':'Character Super Rare (CSR)','Black White Rare':'Black White Rare (BWR)','Rare':'Rare (R)','Holo Rare':'Holo Rare','Rare Holo':'Holo Rare','Secret Rare':'Secret Rare','Promo':'Promo'};
// Japanese rarity codes changed meaning between eras: in Sun & Moon and Sword & Shield HR is the
// rainbow "Hyper Rare" and UR the gold "Ultra Rare"; from Scarlet & Violet the gold card is UR.
function rarityLabel(r,era,link){
 if(!r||r==='None'){
  const e=link?.rarity||'';
  return /^Shiny Ultra/i.test(e)?'Shiny Super Rare (SSR)':/^Shiny/i.test(e)?'Shiny Rare (S)':/^Special Illustration/i.test(e)?'Special Art Rare (SAR)':/^Illustration/i.test(e)?'Art Rare (AR)':/^Hyper/i.test(e)?'Ultra Rare (UR)':/^(Ultra Rare|Rare Ultra)$/i.test(e)?'Super Rare (SR)':/^Double/i.test(e)?'Double Rare (RR)':'Unlisted rarity';
 }
 if(r==='Hyper rare')return ['SM','SWSH'].includes(era)?'Hyper Rare (HR)':'Ultra Rare (UR)';
 if(r==='Secret Rare')return ['SM','SWSH'].includes(era)?'Ultra Rare (UR)':'Secret Rare';
 return RARITY_LABEL[r]||r;
}
// English for common name prefixes, so unlinked Pokémon still get a readable English name.
const PREFIX=[['ロケット団の',"Team Rocket's "],['ロケットの',"Rocket's "],['ヒスイ',"Hisuian "],['ガラル',"Galarian "],['アローラ',"Alolan "],['パルデア',"Paldean "],['かがやく',"Radiant "],['ひかる',"Shining "],['ダーク',"Dark "],['ライト',"Light "],['れんげき',"Rapid Strike "],['いちげき',"Single Strike "],['シロナの',"Cynthia's "],['ナンジャモの',"Iono's "],['Nの',"N's "],['エリカの',"Erika's "],['カスミの',"Misty's "],['タケシの',"Brock's "],['マチスの',"Lt. Surge's "],['ナツメの',"Sabrina's "],['キョウの',"Koga's "],['カツラの',"Blaine's "],['サカキの',"Giovanni's "],['リーリエの',"Lillie's "],['ホップの',"Hop's "],['マリィの',"Marnie's "],['ペパーの',"Arven's "],['ヒビキの',"Ethan's "],['ダイゴの',"Steven's "],['アオキの',"Larry's "],['メガ',"Mega "]];
const TAIL=/(VMAX|VSTAR|V-UNION|V|GX|EX|ex|BREAK|LV\.X|☆|◇|δ|プリズムスター)$/;
const tailOf=ja=>{const m=String(ja).replace(/\s+/g,'').match(TAIL);return m?m[1]:'';};
const TAIL_EN={'☆':' ☆','◇':' ◇','プリズムスター':' ◇','δ':' δ','LV.X':' LV.X'};
function englishName(card,link){
 if(link)return link.name;
 // A few older TCGdex records hold English text or a collector number in the Japanese name field.
 const raw=card.name.ja.replace(/-\d+\/\d+$/,'');
 if(/^[A-Za-z0-9 .'’-]+$/.test(raw))return raw.replace(/\b[a-z]/g,m=>m.toUpperCase());
 const ja=raw.replace(/\s+/g,'').replace(/[（(]デルタ種[)）]$/,'δ'),tail=tailOf(ja),d=card.dexId||[];
 if(card.category==='Pokemon'&&d.length===1){const base=speciesName(d[0]);if(base){
  let rest=ja,prefix='';for(let again=true;again;){again=false;for(const [k,v] of PREFIX)if(rest.startsWith(k)){prefix+=v;rest=rest.slice(k.length);again=true;}}
  // What is left must be just the species (in katakana) and a known suffix; anything else stays Japanese.
  if(!/^[ァ-ヴー・♂♀]+(ex|EX|GX|V|VMAX|VSTAR|BREAK|LV\.X|☆|δ|◇|プリズムスター)?$/.test(rest))return null;
  const t=tail?TAIL_EN[tail]||' '+tail:'';return prefix+base+t;}}
 return card.name.id&&/^[\x20-\x7EÀ-ſ♀♂é]+$/.test(card.name.id)&&card.category==='Pokemon'?card.name.id:null;
}
function categoryOf(card,set,era,secret){
 if(set.kind==='promo'||card.rarity==='Promo')return 'Promo';
 const tail=tailOf(card.name.ja);
 if(tail==='☆')return 'Gold Star';
 if(card.rarity==='Classic Collection')return 'Classic Collection';
 if(secret||/Special illustration|Hyper|Mega Hyper|Shiny Ultra|Character Super|Secret|Black White|RGB/.test(card.rarity||''))return 'Secret rare';
 if(/Shiny rare/.test(card.rarity||''))return era==='EX'?'Gold Star':'Shiny rare';
 if(tail==='ex')return era==='EX'?'Pokémon ex':'ex';
 if(tail==='EX')return 'Pokémon EX';
 if(tail==='GX')return 'Pokémon GX';
 if(tail==='LV.X')return 'Pokémon LV.X';
 if(['V','VMAX','VSTAR'].includes(tail))return tail;
 if(tail==='BREAK')return 'BREAK';
 if(tail==='◇'||tail==='プリズムスター')return 'Prism Star';
 if(/Ultra Rare|Character Rare|Illustration rare/.test(card.rarity||''))return 'Full art';
 if(/Holo/.test(card.rarity||''))return 'Holo rare';
 return 'Standard';
}
const RARITY_TIER=r=>/Special illustration|Hyper|Mega Hyper|Secret|Shiny Ultra|Character Super|Black White/.test(r||'')?3:/Ultra Rare|Illustration|Character Rare|Shiny rare|Radiant/.test(r||'')?2:1;

const tSets=new Map(tcg.asia.sets.map(s=>[s.id,s]));
const tCards=new Map();for(const c of tcg.asia.cards){if(!c.name?.ja)continue;if(!tCards.has(c.setId))tCards.set(c.setId,[]);tCards.get(c.setId).push(c);}
const out=[],report={generatedAt:new Date().toISOString(),source:'https://github.com/tcgdex/cards-database (MIT)',englishSetPairs:setPairs.length,englishSetPairProblems:setPairProblems,englishCardsIndexed:enIndexed,sets:[],missingCardLists:[],totals:{}};
const pending=[];
for(const row of table){
 const ts=tSets.get(row.tcgdex),list=(tCards.get(row.tcgdex)||[]).slice().sort((a,b)=>String(a.localId).localeCompare(String(b.localId),'en',{numeric:true}));
 const release=row.release||dateOf(ts?.releaseDate,'ja')||null;
 const printedTotal=row.printedTotal??(ts?.cardCount?.official||null);
 const id='ja-'+row.tcgdex.toLowerCase().replace(/[^a-z0-9]+/g,'');
 const set={id,lang:'ja',tcgdexId:row.tcgdex,name:row.name,nameJa:ts?.name?.ja||null,series:row.era,kind:row.kind,printedTotal:printedTotal||null,total:list.length,release,slug:row.pricecharting?row.pricecharting.replace(/^pokemon-/,''):null,marketSource:row.pricecharting?'https://www.pricecharting.com/console/'+row.pricecharting:null,marketSourceListed:row.pricechartingListed,checklistSource:'https://github.com/tcgdex/cards-database/tree/master/data-asia/'+(ts?.serie||'')+'/'+row.tcgdex,cards:[]};
 if(!release){report.missingCardLists.push({set:id,name:row.name,problem:'no release date'});continue;}
 if(!list.length){report.missingCardLists.push({set:id,tcgdex:row.tcgdex,name:row.name,era:row.era,release,printedTotal});continue;}
 for(const c of list){
  const n=/^\d+$/.test(c.localId)?Number(c.localId):null,secret=n!=null&&printedTotal>0&&n>printedTotal;
  const unknown=!c.rarity||c.rarity==='None';
  const eligible=RARE.test(c.rarity||'')||row.kind==='promo'||unknown&&(secret||/^(ex|EX|GX|V|VMAX|VSTAR)$/.test(tailOf(c.name.ja)));
  if(!eligible)continue;
  pending.push({row,set,c,secret,unknown,release:day(release)});
 }
 out.push(set);
}

// Link a Japanese card to the English card with the same artwork (same illustrator), the same
// Pokémon and HP and the same attack costs and damage. Ambiguous cases stay unlinked.
// Cards without illustrator data (most Wizards-era and PCG Japanese records) are matched on the
// Pokémon, HP and every attack's cost and damage instead ("stats"), which is weaker evidence.
function candidates(p){
 const c=p.c,byArt=!!c.illustrator,jc=p.row.kind==='promo'?null:JA_CLASS[c.rarity]??null;
 const list=byArt?(enIndex.get(ill(c.illustrator))||[]):c.category==='Pokemon'?[...new Set((c.dexId||[]).flatMap(d=>enByDex.get(d)||[]))]:[];
 return list.filter(e=>{
  if(c.category!==e.cat)return false;
  if(jc&&e.cls&&jc!==e.cls)return false;
  if(c.category==='Pokemon'){
   if(c.dexId?.length&&!c.dexId.some(d=>e.dex.includes(d)))return false;
   if(!byArt&&(c.hp==null||!sig(c)))return false;
   if(c.hp!=null&&e.hp!=null&&c.hp!==e.hp)return false;
   if(sig(c)&&e.sig&&sig(c)!==e.sig)return false;
  }else if(c.trainerType&&e.trainerType&&c.trainerType!==e.trainerType)return false;
  return e.release==null||p.release==null||e.release>=p.release-45; // the English print comes after (or with) the Japanese one
 });
}
const firstPass=new Map();
for(const p of pending)p.cands=candidates(p);
// Japanese set -> English sets that its unambiguous Pokémon links point to (majority vote).
const vote=new Map();
for(const p of pending){if(p.c.category!=='Pokemon'||p.cands.length!==1)continue;const k=p.set.id,v=vote.get(k)||{};v[p.cands[0].setId]=(v[p.cands[0].setId]||0)+1;vote.set(k,v);}
const preferred=k=>{const v=vote.get(k)||{},tot=Object.values(v).reduce((a,b)=>a+b,0);return new Set(Object.entries(v).filter(([,n])=>n>=Math.max(2,tot*0.1)).map(([s])=>s));};
const stats={eligible:0,linked:0,ambiguous:0,none:0,byMethod:{}};
for(const p of pending){
 const {c,set,row}=p;stats.eligible++;
 let cands=p.cands,method=null,link=null;
 const kind=c.illustrator?'artwork':'stats';
 if(cands.length===1){link=cands[0];method=kind;}
 else if(cands.length>1){
  const pref=preferred(set.id);
  let narrowed=cands.filter(e=>pref.has(e.setId));
  if(narrowed.length===1){link=narrowed[0];method=kind+'+set';}
  else{
   // Same artwork reprinted in several English products: take the first English printing,
   // but only when it is clearly first (no other candidate within 30 days) and not a promo reprint of a set card.
   const pool=(narrowed.length?narrowed:cands).filter(e=>!e.promo||set.kind==='promo');
   const sorted=pool.slice().sort((a,b)=>(a.release??9e9)-(b.release??9e9));
   if(sorted.length===1||sorted.length>1&&(sorted[1].release??9e9)-(sorted[0].release??9e9)>30){link=sorted[0];method=kind+'+first-print';}
  }
 }
 if(link){stats.linked++;stats.byMethod[method]=(stats.byMethod[method]||0)+1;}else if(cands.length)stats.ambiguous++;else stats.none++;
 const number=String(c.localId),name=englishName(c,link);
 const card={number,name:name||c.name.ja,nameJa:c.name.ja,...(name?{}:{nameIsJapanese:true}),rarity:rarityLabel(c.rarity,row.era,link&&enById.get(link.id)),category:categoryOf(c,row,row.era,p.secret),...(c.dexId?.length?{dexId:c.dexId}:{}),...(c.illustrator?{illustrator:c.illustrator}:{}),
  image:`https://assets.tcgdex.net/ja/${tSets.get(row.tcgdex)?.serie||c.serie}/${row.tcgdex}/${c.localId}/high.webp`,
  ...(link?{englishId:link.id,englishLink:method}:{englishCandidates:cands.length})};
 set.cards.push(card);
}
for(const s of out){const linked=s.cards.filter(c=>c.englishId).length;report.sets.push({set:s.id,tcgdex:s.tcgdexId,name:s.name,era:s.series,eligible:s.cards.length,linked,pricecharting:s.marketSource,pricechartingListed:s.marketSourceListed});s.total=s.cards.length;}
report.totals={setsWithCards:out.length,setsWithoutCardLists:report.missingCardLists.length,eligibleCards:stats.eligible,linkedToEnglish:stats.linked,ambiguous:stats.ambiguous,noEnglishMatch:stats.none,byMethod:stats.byMethod,japaneseNamesOnly:out.reduce((n,s)=>n+s.cards.filter(c=>c.nameIsJapanese).length,0)};
writeFileSync(outCatalog,JSON.stringify(out)+'\n');
writeFileSync(outReport,JSON.stringify(report,null,1)+'\n');
console.log(JSON.stringify(report.totals),'\nEnglish set pairs',setPairs.length,'problems',setPairProblems.length);

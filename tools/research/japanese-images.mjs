// Japanese card images and English names (follow-up to gen-japanese.mjs).
//
// 1. TCGdex image paths are case-sensitive ("ja/SV/SV2a/201", not "ja/sv/sv2a/201"), and most
//    Japanese sets have no TCGdex scans at all. The real path of every card is read from the
//    TCGdex API; cards without one get no TCGdex link.
// 2. PriceCharting lists a product photo beside every Japanese card. Each card is matched to its
//    product with the app's own rules (matchJapaneseListing), and the photo becomes the image
//    (no TCGdex scan) or the fallback image (with one).
// 3. Cards known only by a Japanese name take the matched product's English name (nameEn), so the
//    app can show English by default before the owner's own mapping runs.
//
//   node tools/research/japanese-images.mjs                 (fetches TCGdex and PriceCharting, ~10 min)
//   node tools/research/japanese-images.mjs <tcgdex.json> <listings.json>   (cached inputs)
//
// Rewrites site/data/japanese-catalogs.json in place and writes tools/research/japanese-images-report.json.
import {readFileSync,writeFileSync} from 'node:fs';
import {cards,sets} from '../../site/data/catalog.mjs';
import {parseJapaneseListing,matchJapaneseListing} from '../../site/lib/japanese.mjs';

const catalogUrl=new URL('../../site/data/japanese-catalogs.json',import.meta.url);
const reportUrl=new URL('./japanese-images-report.json',import.meta.url);
const catalog=JSON.parse(readFileSync(catalogUrl,'utf8'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const UA={headers:{Accept:'text/html','User-Agent':'FutureSight/1.1 (personal collector price tracker)'}};

async function tcgdexImages(){
 const out={};
 for(const s of catalog){
  const r=await fetch('https://api.tcgdex.net/v2/ja/sets/'+encodeURIComponent(s.tcgdexId));
  const d=r.ok?await r.json():null;out[s.id]={images:{}};
  for(const c of d?.cards||[])if(c.image)out[s.id].images[c.localId]=c.image;
 }
 return out;
}
async function page(url){
 for(let attempt=0;;attempt++){
  const r=await fetch(url,UA).catch(e=>({ok:false,status:e.message}));
  if(r.ok)return r.text();
  if(attempt<4&&(r.status===429||r.status>=500||typeof r.status==='string')){await wait(15000*(attempt+1));continue;}
  throw new Error(url+' '+r.status);
 }
}
// Every Japanese set's listing, matched card by card exactly as the app maps it.
async function listingMatches(){
 const memo=new Map(),out={cards:{}};
 for(const set of sets.filter(s=>s.lang==='ja'&&s.marketSourceListed!==false)){
  let rows=memo.get(set.marketSource);
  if(!rows){
   rows=[];let cursor=null,pages=0;const seen=new Set();
   do{await wait(1000);const p=parseJapaneseListing(await page(set.marketSource+'?view=table'+(cursor?'&cursor='+encodeURIComponent(cursor):'')));rows.push(...p.rows);cursor=p.cursor;pages++;if(cursor&&seen.has(cursor))break;if(cursor)seen.add(cursor);}while(cursor&&pages<40);
   memo.set(set.marketSource,rows);
  }
  const {matches}=matchJapaneseListing(rows,cards.filter(c=>c.setId===set.id&&c.eligible));
  for(const [id,r] of matches)out.cards[id]={productId:r.productId,name:r.name,image:r.image};
 }
 return out;
}

const [tcgdexFile,listingsFile]=process.argv.slice(2);
const tcgdex=tcgdexFile?JSON.parse(readFileSync(tcgdexFile,'utf8')):await tcgdexImages();
const listings=listingsFile?JSON.parse(readFileSync(listingsFile,'utf8')):await listingMatches();

const report={generatedAt:new Date().toISOString(),cards:0,tcgdex:0,pricecharting:0,none:0,englishNames:0,japaneseOnlyNames:0,setsWithoutTcgdex:[]};
for(const s of catalog){
 const scans=tcgdex[s.id]?.images||{};let setScans=0;
 for(const c of s.cards){
  report.cards++;
  const id=s.id+'-'+c.number,pc=listings.cards[id],scan=scans[c.number]?scans[c.number]+'/high.webp':null;
  delete c.image;delete c.imageAlt;
  if(scan){c.image=scan;setScans++;report.tcgdex++;if(pc?.image)c.imageAlt=pc.image;}
  else if(pc?.image){c.image=pc.image;report.pricecharting++;}
  else report.none++;
  if(c.nameIsJapanese){if(pc?.name){c.nameEn=pc.name;report.englishNames++;}else{delete c.nameEn;report.japaneseOnlyNames++;}}
 }
 if(!setScans)report.setsWithoutTcgdex.push(s.id);
}
writeFileSync(catalogUrl,JSON.stringify(catalog));
writeFileSync(reportUrl,JSON.stringify(report,null,1)+'\n');
console.log(JSON.stringify({...report,setsWithoutTcgdex:report.setsWithoutTcgdex.length}));

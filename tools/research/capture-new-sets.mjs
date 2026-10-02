// Build exact PriceCharting URL/guide mappings and capture full sales pages for
// the highest-interest rare cards in selected sets.
// Usage: node tools/research/capture-new-sets.mjs sm1 sm2 --per-set=12
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {cards,sets} from '../../site/data/catalog.mjs';
import {parsePage} from '../../site/lib/provider.mjs';
import {classifyCapture} from '../../site/lib/capture.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),dataDir=root+'site/data/',captureDir=dataDir+'pricecharting/';
const defaults=['dc1','sm1','sm2','sm3','sm35','sm4','sm5','sm6','sm7','sm75','sm8','sm9','det1','sm10','sm11','sm115','sm12'];
const selected=process.argv.slice(2).filter(x=>!x.startsWith('--'));
const setIds=selected.length?selected:defaults,perSet=Number(process.argv.find(x=>x.startsWith('--per-set='))?.split('=')[1]||12),delay=Number(process.argv.find(x=>x.startsWith('--delay='))?.split('=')[1]||1300);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));
const text=s=>decode(String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
const money=s=>{const m=String(s||'').replace(/<s\b[^>]*>[\s\S]*?<\/s>/gi,'').match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);return m?Number(m[1].replace(/,/g,'')):null;};
const normNumber=n=>String(n).toUpperCase().replace(/^([A-Z]*)0+(?=\d)/,'$1');
const normName=s=>String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[♀]/g,' f').replace(/[♂]/g,' m').replace(/\bmega\b/g,'m').replace(/-(ex|gx)\b/g,' $1').replace(/[^a-z0-9]+/g,' ').trim();

async function fetchText(url){
 let last;for(let attempt=1;attempt<=4;attempt++){try{const r=await fetch(url,{headers:{Accept:'text/html','User-Agent':'Mozilla/5.0 (compatible; PrimalWatch/1.2; personal collector research)'},signal:AbortSignal.timeout(45000)});if(r.ok){const body=await r.text();if(body.length>20000)return body;}last=new Error('HTTP '+r.status);}catch(e){last=e;}await sleep(attempt*5000);}throw last||new Error('Source unavailable');
}
function parseConsole(html){
 const rows=[];for(const match of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)){
  const attrs=match[1],row=match[2],titleCell=row.match(/<td\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1];if(!titleCell)continue;
  const anchor=titleCell.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);if(!anchor)continue;
  const title=text(anchor[2]),number=title.match(/#\s*([A-Za-z]*\d+[a-z]?)(?![a-z0-9])/i)?.[1];if(!number)continue;
  const href=decode(anchor[1].match(/href=["']([^"']+)["']/i)?.[1]||''),productId=attrs.match(/data-product=["'](\d+)["']/i)?.[1]||null;
  const cell=cls=>row.match(new RegExp('<td\\b[^>]*class=["\\x27][^"\\x27]*\\b'+cls+'\\b[^"\\x27]*["\\x27][^>]*>([\\s\\S]*?)<\\/td>','i'))?.[1];
  rows.push({title,base:title.replace(/\s*#\s*[A-Za-z]*\d+[a-z]?\s*$/i,'').trim(),number:normNumber(number),href:href.startsWith('http')?href:'https://www.pricecharting.com'+href,productId,guide:{raw:money(cell('used_price')),grade9:money(cell('cib_price')),psa10:money(cell('new_price'))}});
 }return rows;
}
function mapSet(set,consoleRows){
 const mapped={},missing=[];for(const card of cards.filter(c=>c.setId===set.id)){
  const candidates=consoleRows.filter(r=>r.number===normNumber(card.number)&&!r.title.includes('['));let pick=candidates.length===1?candidates[0]:candidates.find(r=>normName(r.base)===normName(card.name));
  if(!pick&&candidates.length)pick=candidates[0];if(!pick){if(card.eligible)missing.push(card.id);continue;}mapped[card.id]={...pick,card};
 }return {mapped,missing};
}
function rank({card,guide}){const g=Math.max((guide.raw||0)*20,(guide.grade9||0)*4,guide.psa10||0);return g*(card.chase?1.25:1);}
function compact(obj){return JSON.stringify(obj,null,0).replace(/},"/g,'},\n"');}
function compactStrings(obj){return JSON.stringify(obj,null,0).replace(/,"/g,',\n"');}

mkdirSync(captureDir,{recursive:true});
const sourceUrls=JSON.parse(readFileSync(dataDir+'source-urls.json','utf8')),market=existsSync(dataDir+'sm-market.json')?JSON.parse(readFileSync(dataDir+'sm-market.json','utf8')):{},report={sets:{},captured:0,sales:0,errors:[]};
for(const id of setIds){
 const set=sets.find(s=>s.id===id);if(!set)throw new Error('Unknown set '+id);
 process.stdout.write(`Mapping ${set.name}... `);const html=await fetchText(set.marketSource+'?view=table'),rows=parseConsole(html),{mapped,missing}=mapSet(set,rows),fetchedAt=new Date().toISOString();
 for(const [cardId,item] of Object.entries(mapped)){sourceUrls[cardId]=item.href;if(item.card.eligible){const guide=Object.fromEntries(Object.entries(item.guide).filter(([,v])=>v>0));market[cardId]={number:item.card.number,guide,sales:[],observedAt:fetchedAt,source:'PriceCharting',sourceUrl:item.href,status:'snapshot'};}}
 const rare=Object.values(mapped).filter(x=>x.card.eligible&&Object.values(x.guide).some(v=>v>0)).sort((a,b)=>rank(b)-rank(a)),extra=id==='sm115'?12:0,chosen=rare.slice(0,perSet+extra),out=existsSync(captureDir+id+'.json')?JSON.parse(readFileSync(captureDir+id+'.json','utf8')):{};
 report.sets[id]={consoleRows:rows.length,mapped:Object.keys(mapped).length,rareGuides:rare.length,missingRare:missing.length,selected:chosen.length};console.log(`${rare.length} rare guides; ${chosen.length} full captures`);
 for(let i=0;i<chosen.length;i++){
  const item=chosen[i],label=`${id} ${i+1}/${chosen.length} ${item.card.name} #${item.card.number}`;try{const page=parsePage(await fetchText(item.href));const record=classifyCapture({...page,url:item.href,fetchedAt:new Date().toISOString()},{...item.card,source:item.href});out[item.card.id]=record;report.captured++;report.sales+=record.sales.length;console.log(`  ${label}: ${record.sales.length} sales`);}catch(e){report.errors.push(label+': '+e.message);console.log(`  ${label}: ERROR ${e.message}`);}await sleep(delay);
 }
 writeFileSync(captureDir+id+'.json',compact(Object.fromEntries(Object.entries(out).sort()))+'\n');
}
writeFileSync(dataDir+'source-urls.json',compactStrings(Object.fromEntries(Object.entries(sourceUrls).sort()))+'\n');
writeFileSync(dataDir+'sm-market.json',compact(Object.fromEntries(Object.entries(market).sort()))+'\n');
writeFileSync(root+'tools/research/new-sets-report.json',JSON.stringify({...report,finishedAt:new Date().toISOString()},null,2)+'\n');
console.log(JSON.stringify(report,null,2));

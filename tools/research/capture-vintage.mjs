// Capture every mapped vintage rare/promo, with resumable per-card checkpoints.
// node tools/research/capture-vintage.mjs [set ids] [--refresh]
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {cards,sets} from '../../site/data/catalog.mjs';
import {parsePage,parseMarket} from '../../site/lib/provider.mjs';
import {classifyCapture} from '../../site/lib/capture.mjs';
const dir=new URL('../../site/data/',import.meta.url),reportFile=new URL('./vintage-coverage.json',import.meta.url);
const read=(path,fallback={})=>existsSync(path)?JSON.parse(readFileSync(path,'utf8')):fallback;
const save=(path,value)=>{const tmp=new URL(path.href+'.tmp');writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');renameSync(tmp,path);};
const urls=read(new URL('source-urls.json',dir)),report=read(reportFile,{sets:{}});
const selected=process.argv.slice(2).filter(s=>!s.startsWith('--')),refresh=process.argv.includes('--refresh');
if(selected.some(id=>!sets.some(s=>s.id===id&&s.series==='WOTC')))throw new Error('Choose a Wizards set ID.');
const decode=s=>s.replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ');
const clean=s=>decode(s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
const norm=s=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url){
 for(let attempt=0;attempt<3;attempt++){
  const r=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'PrimalWatch vintage catalog research'}});
  if(r.ok)return r.text();
  if(r.status===429||r.status>=500){await sleep(10000*(attempt+1));continue;}
  throw new Error('HTTP '+r.status+' '+url);
 }throw new Error('Source unavailable after retries: '+url);
}
for(const set of sets.filter(s=>s.series==='WOTC'&&(!selected.length||selected.includes(s.id)))){
 const file=new URL('pricecharting/'+set.id+'.json',dir),out=read(file),wanted=cards.filter(c=>c.eligible&&c.setId===set.id);
 const entry=report.sets[set.id]={name:set.name,eligible:wanted.length,mapped:0,captured:0,unmatched:[],errors:[],sales:0,ebaySales:0,sourceRows:0};
 try{
  let html='',cursor='',pages=0;const cursors=new Set();
  do{
   const body=await get(set.marketSource+'?view=table'+(cursor?'&cursor='+encodeURIComponent(cursor):''));
   if(!body.includes('pricecharting')||!body.includes('class="title"'))throw new Error('Set listing could not be read; coverage is unknown.');
   html+=body;pages++;
   const next=body.match(/name="cursor"\s+value="([^"]+)"/)?.[1]||'';
   if(next&&cursors.has(next))throw new Error('Set pagination repeated cursor '+next);
   if(next)cursors.add(next);cursor=next;
   if(pages>=100&&cursor)throw new Error('Set pagination exceeded 100 pages.');
   if(cursor)await sleep(600);
  }while(cursor);
  entry.listingPages=pages;
  const products=[];
  for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
   const cell=row[1].match(/<td\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1];if(!cell)continue;
   const a=cell.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);if(!a)continue;
   const title=clean(a[2]),m=title.match(/^(.*?)\s*#\s*([A-Z]*\d+[a-z]?)$/i);if(!m)continue;
   const variants=[...m[1].matchAll(/\[([^\]]+)\]/g)].map(x=>x[1]);
   if(variants.some(v=>!/^holo$/i.test(v)&&!(set.id==='basep'&&/^WOTC$/i.test(v))&&!(set.id==='bp'&&['8','9'].includes(m[2])&&/^Winner$/i.test(v))&&!(set.id==='base1'&&m[2]==='8'&&/^1st Edition$/i.test(v))))continue;
   const url=new URL(decode(a[1]),'https://www.pricecharting.com').href;
   if(!products.some(p=>p.url===url))products.push({name:norm(m[1].replace(/\[[^\]]+\]/g,'')),number:m[2].toUpperCase().replace(/^([A-Z]*)0+(?=\d)/,'$1'),holo:variants.some(v=>/^holo$/i.test(v)),url});
  }
  const queue=[];
  for(const card of wanted){
   let matches=products.filter(p=>[card.name,...(card.nameAliases||[])].some(n=>p.name===norm(n))&&p.number===String(card.number).toUpperCase());
   const holo=matches.filter(p=>p.holo);if(/holo/i.test(card.rarity)&&holo.length)matches=holo;else matches=matches.filter(p=>!p.holo);
   if(matches.length!==1){entry.unmatched.push({id:card.id,name:card.name,reason:matches.length?'Ambiguous product matches':'No exact standard-print product'});continue;}
   const source=matches[0].url;urls[card.id]=source;entry.mapped++;queue.push({...card,source,sourceVerified:true});
  }
  // Each worker processes one card at a time; at most three public requests in flight.
  let index=0;
  await Promise.all(Array.from({length:3},async()=>{
   while(index<queue.length){const card=queue[index++];
    if(refresh||!out[card.id]||out[card.id].url!==card.source){
     try{
      const body=await get(card.source),stamp=new Date().toISOString();
      parseMarket(body,card,stamp); // Validate page identity before accepting guides/population.
      const record=classifyCapture({...parsePage(body),url:card.source,fetchedAt:stamp},card);
      if(out[card.id]){
       const previous=out[card.id],seen=new Set(record.sales.map(s=>s[5]+'|'+s[0]+'|'+s[2]));
       record.sales.push(...previous.sales.filter(s=>!seen.has(s[5]+'|'+s[0]+'|'+s[2])));record.sales.sort((a,b)=>b[0].localeCompare(a[0]));
      }
      out[card.id]=record;save(file,out);
     }catch(e){entry.errors.push({id:card.id,error:e.message});}
     await sleep(600);
    }
   }
  }));
  for(const card of queue){const r=out[card.id];if(!r||r.url!==card.source)continue;entry.captured++;entry.sales+=r.sales.length;entry.ebaySales+=r.sales.filter(s=>s[4]==='e').length;entry.sourceRows+=r.coverage?.sourceRows||0;}
 }catch(e){entry.errors.push({error:e.message});}
 // Preserve the original compact formatting of the existing URL registry.
 writeFileSync(new URL('source-urls.json',dir),'{'+Object.entries(urls).map(([k,v])=>JSON.stringify(k)+':'+JSON.stringify(v)).join(',\n')+'}\n');
 report.checkedAt=new Date().toISOString();report.completeEbayHistory=false;report.scope='Every exact-matched rare/promo; all rows exposed on each public source page. Earlier and unreported eBay sales may be absent.';save(reportFile,report);
 console.log(set.id,JSON.stringify(entry));
}

// node process-pages.mjs <raw-tag>... : classify captured pages into site/data/pricecharting/<setId>.json
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {cards} from '/home/claude/pokemon/site/data/catalog.mjs';
import {classifyCapture} from '/home/claude/pokemon/site/lib/capture.mjs';
const outDir='/home/claude/pokemon/site/data/pricecharting/';mkdirSync(outDir,{recursive:true});
const byId=new Map(cards.map(c=>[c.id,c]));const files={};const stats={ok:0,failed:[],nameMismatch:[],sales:0};
const load=set=>files[set]??=(existsSync(outDir+set+'.json')?JSON.parse(readFileSync(outDir+set+'.json','utf8')):{});
for(const tag of process.argv.slice(2)){
 const raw=JSON.parse(readFileSync('/home/claude/work/raw/'+tag+'.json','utf8'));
 const fallback=new Date().toISOString();
 for(const page of raw){
  const card=byId.get(page.id);if(!card){stats.failed.push(page.id+' not in catalog');continue;}
  if(page.status!==200||!page.rows){stats.failed.push(page.id+' status '+page.status+' '+(page.error||''));continue;}
  const num=String(card.number).toUpperCase().replace(/^(XY|RC|BW)0+(?=\d)/,'$1');
  const pageNum=(page.name.match(/#\s*([A-Z]*\d+)/i)||[])[1]?.toUpperCase().replace(/^(XY|RC|BW)0+(?=\d)/,'$1');
  if(pageNum&&pageNum!==num)stats.nameMismatch.push(page.id+' -> '+page.name);
  const rec=classifyCapture({...page,fetchedAt:page.fetchedAt||fallback},card);
  load(card.setId)[card.id]=rec;stats.ok++;stats.sales+=rec.sales.length;
 }
}
for(const [set,data] of Object.entries(files)){const sorted=Object.fromEntries(Object.entries(data).sort());writeFileSync(outDir+set+'.json','{\n'+Object.entries(sorted).map(([k,v])=>JSON.stringify(k)+':'+JSON.stringify(v)).join(',\n')+'\n}\n');}
console.log(JSON.stringify({ok:stats.ok,sales:stats.sales,failed:stats.failed,nameMismatch:stats.nameMismatch.slice(0,20)},null,1));

import {readFileSync,writeFileSync} from 'node:fs';
import {cards,sets} from '/home/claude/pokemon/site/data/catalog.mjs';
const lists=JSON.parse(readFileSync('/home/claude/work/raw/lists-1.json','utf8'));
const consoleOf={xy1:'pokemon-xy',xy2:'pokemon-flashfire',xy3:'pokemon-furious-fists',xy4:'pokemon-phantom-forces',xy5:'pokemon-primal-clash',xy6:'pokemon-roaring-skies',xy7:'pokemon-ancient-origins',xy8:'pokemon-breakthrough',xy9:'pokemon-breakpoint',xy10:'pokemon-fates-collide',xy11:'pokemon-steam-siege',g1:'pokemon-generations',xy12:'pokemon-evolutions',xyp:'pokemon-promo',bw1:'pokemon-black-&-white',bw2:'pokemon-emerging-powers',bw3:'pokemon-noble-victories',bw4:'pokemon-next-destinies',bw5:'pokemon-dark-explorers',bw6:'pokemon-dragons-exalted',dv1:'pokemon-dragon-vault',bw7:'pokemon-boundaries-crossed',bw8:'pokemon-plasma-storm',bw9:'pokemon-plasma-freeze',bw10:'pokemon-plasma-blast',bw11:'pokemon-legendary-treasures'};
const ONLY=process.argv[2]||'';
const norm=s=>s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/♀/g,' f').replace(/♂/g,' m').replace(/\bmega\b/g,'m').replace(/-ex\b/g,' ex').replace(/[^a-z0-9]+/g,' ').trim();
const parse=t=>{const m=t.match(/^(.*?)(?:\s*\[([^\]]+)\])?\s*#\s*([A-Za-z]*\d+[a-z]?)\s*$/);return m?{base:m[1].trim(),variant:m[2]||'',num:m[3].toUpperCase()}:null;};
const collector=n=>String(n).toUpperCase().replace(/^(XY|RC|BW)0+(?=\d)/,'$1');
const out={},report={exact:0,nameDiff:[],missing:[],ambiguous:[]};
for(const c of cards.filter(c=>!ONLY||c.series===ONLY)){
 const slug=consoleOf[c.setId];const rows=lists[slug].rows.map(r=>({pid:r[0],href:r[1],title:r[2],p:r.slice(3),...parse(r[2])})).filter(r=>r.num);
 const want=collector(c.number);let cands=rows.filter(r=>collector(r.num)===want&&!r.variant);if(!cands.length)cands=rows.filter(r=>collector(r.num)===want&&r.variant==='Holo');
 let pick=null;
 if(cands.length===1)pick=cands[0];else if(cands.length>1){const byName=cands.filter(r=>norm(r.base)===norm(c.name));pick=byName.length===1?byName[0]:null;if(!pick)report.ambiguous.push(c.id+' '+c.name+' :: '+cands.map(r=>r.title).join(' | '));}
 if(!pick){if(!cands.length)report.missing.push(c.id+' '+c.name+(c.eligible?' [eligible]':''));continue;}
 if(norm(pick.base)!==norm(c.name))report.nameDiff.push(c.id+' '+c.name+' -> '+pick.title);
 out[c.id]={url:'https://www.pricecharting.com'+pick.href,productId:pick.pid,title:pick.title,guide:{raw:pick.p[0],grade9:pick.p[1],psa10:pick.p[2]}};
}
writeFileSync('/home/claude/work/url-map-'+(ONLY||'all').toLowerCase()+'.json',JSON.stringify(out,null,0));
const changed=cards.filter(c=>out[c.id]&&decodeURIComponent(out[c.id].url)!==decodeURIComponent(c.source));
console.log({mapped:Object.keys(out).length,total:cards.length,changed:changed.length,changedEligible:changed.filter(c=>c.eligible).length,missing:report.missing.length,ambiguous:report.ambiguous.length,nameDiff:report.nameDiff.length});
console.log('MISSING',report.missing.filter(x=>x.includes('eligible')).slice(0,40));console.log('AMBIG',report.ambiguous.slice(0,20));console.log('NAMEDIFF',report.nameDiff.slice(0,60));
console.log('CHANGED sample',changed.filter(c=>c.eligible).slice(0,25).map(c=>c.id+': '+c.source.split('/').pop()+' -> '+out[c.id].url.split('/').pop()));

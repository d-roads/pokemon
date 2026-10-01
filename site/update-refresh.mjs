import {readFileSync,writeFileSync} from 'node:fs';
let code=readFileSync('public/app.js','utf8'),start=code.indexOf('async function refreshSet(){'),end=code.indexOf('function updateView(){',start);
code=code.slice(0,start)+`let refreshRun;
async function refreshSet(){
 if(refreshRun){refreshRun.abort();return;}
 const controller=new AbortController();refreshRun=controller;const b=$('#refresh-set'),scope=state.setId;let offset=0,updated=0,total=0;
 b.textContent='Cancel refresh';b.disabled=false;
 try{
  for(;;){
   const r=await request('/api/research?set='+encodeURIComponent(scope)+'&offset='+offset,{method:'POST',signal:controller.signal});
   if(r.markets)Object.assign(state.markets,r.markets);updated+=r.count||0;total=r.total||0;
   stats();renderList();renderDetail();
   if(r.warning){toast(r.warning);return;}
   if(r.done)break;offset=r.nextOffset;b.textContent='Cancel · '+offset+'/'+total;
  }
  toast('Refreshed sales for '+updated+' of '+total+' rare cards.');if(updated)$('#snapshot-label').textContent='Sales checked just now';
 }catch(e){toast(e.name==='AbortError'?'Refresh stopped. Retrieved sales are saved.':e.message);}
 finally{refreshRun=null;b.disabled=false;b.innerHTML='<span aria-hidden="true">↻</span> Refresh sales';}
}
`+code.slice(end);
code=code.replace('const comparison=a.fair?',"const referenceSource=a.priceSource==='guide'?a.guideSource:null;\n const comparison=a.fair?");
code=code.replace("m?'Checked '+new Date(m.observedAt)","(referenceSource?.observedAt||m?.observedAt)?'Checked '+new Date(referenceSource?.observedAt||m.observedAt)").replace('esc(m?.sourceUrl||c.source)','esc(referenceSource?.url||m?.sourceUrl||c.source)').replace("m?.source?esc(m.source)+' · ':'',", "m?.source?esc(m.source)+' · ':'',");
code=code.replace("${m?.source?esc(m.source)+' · ':''}","${referenceSource?.name?esc(referenceSource.name)+' · ':m?.source?esc(m.source)+' · ':''}");
writeFileSync('public/app.js',code);
let html=readFileSync('public/index.html','utf8').replace('Refresh prices</button>','Refresh sales</button>');writeFileSync('public/index.html',html);

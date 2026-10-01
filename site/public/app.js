import {analyze as computeAnalysis,gradeNames} from '/analysis.mjs';
const analysisCache=new WeakMap();
const analyze=(market,grade)=>{if(!market)return computeAnalysis(market,grade);const day=Math.floor(Date.now()/86400000);let cache=analysisCache.get(market);if(!cache||cache.day!==day){cache={day,grades:{}};analysisCache.set(market,cache);}return cache.grades[grade]??=(computeAnalysis(market,grade));};
const $=s=>document.querySelector(s);
const money=v=>v==null?'-':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const state={sets:[],setId:'xy5',cards:[],markets:{},watch:[],grade:'psa9',category:'chase',query:'',sort:'featured',view:'browse',selected:'xy5-147',limit:18,budget:false,expanded:false};
let toastTimer,selectionController;
async function request(url,options){const r=await fetch(url,options);const b=await r.json();if(!r.ok)throw new Error(b.error||'Something went wrong. Please try again.');return b;}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function error(text){$('#error-banner').textContent=text;$('#error-banner').hidden=!text;}
const matchingWatch=id=>state.watch.find(w=>w.card_id===id && w.grade===state.grade);
const activeSet=()=>state.sets.find(s=>s.id===state.setId);
const scopedCards=()=>state.cards.filter(c=>(state.setId==='all'||c.setId===state.setId)&&(c.eligible||state.view==='watch'&&matchingWatch(c.id)));
function stats(){
 const scope=scopedCards(),priced=scope.filter(c=>analyze(state.markets[c.id],state.grade).current!=null).length;
 $('#watch-count').textContent=state.watch.length;$('#summary-watch').innerHTML=state.watch.length+' <small>cards & grades saved</small>';
 $('#set-count').innerHTML=scope.length+' <small>'+(state.setId==='all'?state.sets.length+' sets · rare cards':'EX, full art, secret & other rares')+'</small>';
 $('#set-count-label').textContent=state.setId==='all'?'Rare cards across XY':'Rare cards in this set';
 $('#price-count').innerHTML=priced+' <small>with '+gradeNames[state.grade]+' prices</small>';
 $('#coverage-note').textContent=priced===0&&state.grade!=='raw'?'No prices are loaded for this grade in this set. Choose Raw to see available reference guides.':priced+' of '+scope.length+' cards have a price for this grade. Guides are estimates; targets need matching sales.';
}
const priority=['xy5-147','xy5-55','xy5-156','xy5-151'];
const cardNumber=c=>String(c.number).startsWith('RC')?1000+Number(String(c.number).slice(2)):Number(c.number);
function filteredCards(){
 let list=scopedCards().filter(c=>(state.view!=='watch'||matchingWatch(c.id))&&(state.category==='all'||state.category==='chase'&&c.chase||(state.category==='Pokémon EX'?c.name.endsWith('EX'):c.category===state.category))&&(!state.query||(c.name+' '+c.numberLabel+' '+c.setName+' '+c.setId).toLowerCase().includes(state.query)));
 const analyses=new Map(),get=c=>{if(!analyses.has(c.id))analyses.set(c.id,analyze(state.markets[c.id],state.grade));return analyses.get(c.id);};
 if(state.budget)list=list.filter(c=>{const p=get(c).current;return p>=250&&p<=350;});
 const featured=c=>priority.includes(c.id)?priority.indexOf(c.id):get(c).current!=null?10:100;
 return list.sort((a,b)=>state.sort==='number'?(state.setId==='all'?state.sets.findIndex(s=>s.id===a.setId)-state.sets.findIndex(s=>s.id===b.setId):0)||cardNumber(a)-cardNumber(b):state.sort==='price'?(get(b).current??-1)-(get(a).current??-1):state.sort==='activity'?(get(b).score??-1)-(get(a).score??-1):featured(a)-featured(b)||(state.setId!=='xy5'?(get(b).current??-1)-(get(a).current??-1):0)||cardNumber(a)-cardNumber(b));
}
function renderList(){
 const list=filteredCards();$('#result-count').textContent=`${list.length} ${state.view==='watch'?'watched entries':'cards'} · ${gradeNames[state.grade]}`;
 $('#show-more').hidden=list.length<=state.limit;
 if(!list.length){$('#card-list').innerHTML=`<div class="empty-state"><strong>${state.view==='watch'&&!state.watch.length?'Your next pickup starts here.':'No cards match.'}</strong><p>${state.view==='watch'&&!state.watch.length?'Tap the star beside a card to save it with its grade and buy target.':'Try another grade, search, or category.'}</p><button class="button primary" id="clear-filters">${state.view==='watch'?'Browse XY cards':'Clear filters'}</button></div>`;$('#clear-filters').onclick=()=>{state.view='browse';state.category='chase';state.query='';state.budget=false;$('#search').value='';$('#budget-filter').checked=false;updateView();};return;}
 $('#card-list').innerHTML=list.slice(0,state.limit).map(c=>{
  const a=analyze(state.markets[c.id],state.grade),w=matchingWatch(c.id),target=w?.target??a.target;
  return `<div class="card-row ${c.id===state.selected?'selected':''}" data-id="${c.id}"><button class="card-open" data-open="${c.id}" aria-label="View ${esc(c.name)} number ${c.number}" ${c.id===state.selected?'aria-current="true"':''}><img class="card-thumb" src="${c.image}" alt="" loading="lazy"><span><span class="card-name">${esc(c.name)}</span><span class="card-sub">#${c.numberLabel} · ${esc(c.category)}<span class="row-set">${esc(c.setName)}</span></span></span></button><div class="price-cell">${money(a.current)}<small>${a.priceSource==='sales'?'Sold median':a.current?'Source guide':'Awaiting source'}</small></div><div class="target-cell ${target==null?'missing':''}">${target==null?'Needs sales':money(target)}${w?.target!=null?'<small class="card-sub">Your target</small>':''}</div><button class="star-button ${w?'saved':''}" data-watch="${c.id}" aria-label="${w?'Remove':'Add'} ${esc(c.name)} ${gradeNames[state.grade]} ${w?'from':'to'} watchlist" aria-pressed="${!!w}">${w?'★':'☆'}</button></div>`;
 }).join('');
 $('#card-list').querySelectorAll('[data-open]').forEach(el=>el.onclick=()=>select(el.dataset.open));
 $('#card-list').querySelectorAll('.card-row').forEach(el=>el.onclick=e=>{if(!e.target.closest('button'))select(el.dataset.id);});
 $('#card-list').querySelectorAll('[data-watch]').forEach(el=>el.onclick=()=>toggleWatch(el.dataset.watch,el));
 wireImages();
}
function wireImages(){document.querySelectorAll('img').forEach(im=>im.onerror=()=>{im.removeAttribute('src');im.style.opacity='.45';im.alt='Card image unavailable';im.onerror=null;});}
function chart(a){
 const rows=a.comparable.filter(s=>s.price>0 && (Date.now()-Date.parse(s.date))/86400000<=365).slice(0,35).sort((x,y)=>x.date.localeCompare(y.date));
 if(rows.length<2)return `<div class="chart-empty">${rows.length?'Only one matching sale in the last year.':'No matching sales in the last year.'}</div>`;
 const vals=rows.map(r=>r.price),min=Math.min(...vals)*.85,max=Math.max(...vals)*1.12,w=290,h=130,pad=28,start=Date.parse(rows[0].date),end=Date.parse(rows.at(-1).date);
 const x=r=>pad+(Date.parse(r.date)-start)/(end-start||1)*(w-pad-8),y=r=>10+(max-r.price)/(max-min||1)*85;
 const grid=[0,.5,1].map(t=>{const v=min+(max-min)*t,Y=10+(1-t)*85;return `<line x1="${pad}" y1="${Y}" x2="${w-8}" y2="${Y}" stroke="#eaf0f8" stroke-dasharray="3 4"/><text x="0" y="${Y+3}" fill="#9cabc2" font-size="9">${v>=1000?(v/1000).toFixed(1)+'k':Math.round(v)}</text>`;}).join('');
 return `<svg class="sale-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${rows.length} reported ${gradeNames[state.grade]} sale prices plotted by date">${grid}${rows.map(r=>`<circle cx="${x(r)}" cy="${y(r)}" r="3.5" fill="#5b80ed"><title>${date(r.date)}: ${money(r.price)}</title></circle>`).join('')}<text x="${pad}" y="119" fill="#9cabc2" font-size="9">${date(rows[0].date)}</text><text x="${w-8}" y="119" fill="#9cabc2" font-size="9" text-anchor="end">${date(rows.at(-1).date)}</text></svg>`;
}
function renderDetail(){
 const c=state.cards.find(c=>c.id===state.selected);if(!c){$('#detail').innerHTML='<div class="empty-state"><strong>Select a card</strong><p>Card insights will appear here.</p></div>';return;}
 const sourceSet=state.sets.find(s=>s.id===c.setId);$('#set-market-source').href=sourceSet.marketSource;$('#set-checklist-source').href=sourceSet.checklistSource;
 const m=state.markets[c.id],a=analyze(m,state.grade),w=matchingWatch(c.id),target=w?.target??a.target;
 const referenceSource=a.priceSource==='guide'?a.guideSource:null;
 const comparison=a.fair?money(a.fair):'—',conf=a.confidence==='Insufficient'?'More evidence needed':`${a.confidence} confidence`;
 const forecasts=a.fair?[-.07,.05,.12].map(g=>money(a.fair*(1+g)**5)):['—','—','—'];
 $('#detail').classList.toggle('expanded',state.expanded);
 $('#detail').innerHTML=`<div class="detail-top"><div class="detail-eyebrow"><span>CARD INSIGHT</span><span>${gradeNames[state.grade]}</span></div><div class="detail-identity"><div class="detail-image-wrap"><img class="detail-image" src="${c.image}" alt="${esc(c.name)} ${c.numberLabel}"></div><div><h2>${esc(c.name)}</h2><p>${esc(c.setName)} · #${c.numberLabel}<br>${esc(c.category)}</p><span class="type-pill">${esc(c.type)}</span></div></div></div>
 <div class="buy-box ${target==null?'insufficient':''}"><div class="eyebrow">${w?.target!=null?'YOUR BUY TARGET':'SUGGESTED MAXIMUM PRICE'}</div><div class="buy-amount"><strong>${target==null?'Waiting for evidence':money(target)}</strong>${a.target!=null && w?.target==null?'<span class="discount-tag">15% below median</span>':''}</div><p>${w?.target!=null?'Your saved limit, before shipping and tax.':esc(a.reason)}</p></div>
 <div class="detail-metrics"><div><span class="metric-label">Current reference</span><strong>${money(a.current)}</strong><small>${esc(a.priceLabel)}</small>${state.grade==='psa9'&&a.guidePrice?`<small>Mixed Grade 9 guide: ${money(a.guidePrice)}</small>`:''}${a.sampleCount?`<span class="sample-badge">${a.sampleCount} matching sales</span>`:''}</div><div><span class="metric-label">Demand estimate</span><div class="demand-wrap"><strong>${a.score??'—'}</strong><em>/ 100</em></div><div class="demand-bar"><span style="width:${a.score??0}%"></span></div><small>Sales activity · ${conf.toLowerCase()}</small></div></div>
 <div class="detail-chart"><div class="section-heading"><h3>Reported sales</h3><small>${gradeNames[state.grade]}</small></div>${chart(a)}<p class="chart-caption">${a.usable.length} matching sales · ${a.windowDays} days · ${conf}</p></div>
 <div class="detail-actions"><button class="button primary" id="detail-watch">${w?'★ Watching':'☆ Add to watchlist'}</button><button class="button" id="refresh-card" aria-label="Refresh this card">↻ Refresh</button></div>
 ${w?`<div class="detail-section"><h3>Your buy limit</h3><form id="target-form" class="target-form"><label for="custom-target">Maximum price (USD)<input id="custom-target" type="number" min="0.01" max="1000000" step="0.01" value="${w.target??a.target??''}" placeholder="Set a price" required></label><button class="button" type="submit">Save</button></form><button id="reset-target" class="remove-watch">Use suggested target</button></div>`:''}
 <div class="detail-section sales"><div class="section-heading"><h3>Recent sales</h3><small>${a.all.length} observed</small></div>${a.all.length?a.all.slice(0,6).map(s=>`<div class="sale-row"><span>${date(s.date)}</span><a href="${esc(s.source)}" target="_blank" rel="noopener noreferrer">${esc(s.marketplace)}${state.grade==='raw'?' · '+esc(s.condition):''}</a><strong>${money(s.price)}</strong>${s.title?`<span class="sale-title">${esc(s.title)}</span>`:''}</div>`).join(''):'<p class="sales-note">No matching sales loaded for this grade. Refresh or check the source.</p>'}<p class="sales-note">${state.grade==='raw'?'Raw conditions are shown as reported; only NM enters targets. ':'PSA sales are kept separate from other graders. '}${a.all.length?'Reported by PriceCharting.':'Targets use reported matching sales.'}${a.excluded?' '+a.excluded+' outliers excluded from targets.':''}</p></div>
 <div class="detail-section research"><h3>Sales coverage</h3><p>${['raw','psa9','psa10'].map(g=>gradeNames[g]+': '+analyze(m,g).comparable.length+' matching sales').join(' · ')}</p><p>${m?.research?.status==='unavailable'?'The public source could not be retrieved. Saved guides keep their original date.':'Coverage reflects the public sales retrieved, and can be incomplete. Targets use only matching recent sales.'}</p></div><div class="detail-section scenarios"><h3>Five-year scenarios <span class="muted">· 2031</span></h3><div class="scenario-grid">${['Bear','Steady','Strong'].map((label,i)=>`<div><span>${label}</span><strong>${forecasts[i]}</strong><small>${['−7%','+5%','+12%'][i]} / year</small></div>`).join('')}</div><p class="sales-note">Illustrative scenarios, using the ${comparison} comparable median. Not a backtested forecast.</p></div>
 <button class="mobile-expand" id="expand-details">${state.expanded?'Show fewer details':'See sales & five-year scenarios'}</button><div class="source-line"><span>${(referenceSource?.observedAt||m?.observedAt)?'Checked '+new Date(referenceSource?.observedAt||m.observedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Price data not yet loaded'}</span><a href="${esc(referenceSource?.url||m?.sourceUrl||c.source)}" target="_blank" rel="noopener noreferrer">${referenceSource?.name?esc(referenceSource.name)+' · ':m?.source?esc(m.source)+' · ':''}View source</a></div>`;
 $('#detail-watch').onclick=()=>toggleWatch(c.id,$('#detail-watch'));
 $('#refresh-card').onclick=()=>refreshCard(c);
 $('#expand-details').onclick=()=>{state.expanded=!state.expanded;renderDetail();};
 if(w){$('#target-form').onsubmit=e=>{e.preventDefault();saveTarget(c.id,Number($('#custom-target').value));};$('#reset-target').onclick=()=>saveTarget(c.id,null);}
 wireImages();
}
async function select(id){state.selected=id;state.expanded=false;renderList();renderDetail();$('#detail').scrollTop=0;if(!analyze(state.markets[id],state.grade).comparable.length)await loadCard(id);}
async function loadCard(id){selectionController?.abort();selectionController=new AbortController();const c=state.cards.find(c=>c.id===id);try{const r=await request(`/api/market?id=${id}`,{signal:selectionController.signal});if(r.market)state.markets[c.id]=r.market;renderList();if(state.selected===id)renderDetail();stats();}catch(e){if(e.name!=='AbortError')toast('Could not load this card. Try Refresh.');}}
async function toggleWatch(id,button){const w=matchingWatch(id),grade=state.grade;button.disabled=true;try{const r=await request('/api/watchlist',{method:w?'DELETE':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({card_id:id,grade,target:null})});state.watch=r.watchlist;toast(w?'Removed from watchlist.':'Saved to your watchlist.');stats();renderList();renderDetail();}catch(e){error(e.message);button.disabled=false;}}
async function saveTarget(id,target){const button=$('#target-form button');if(button)button.disabled=true;try{const r=await request('/api/watchlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({card_id:id,grade:state.grade,target})});state.watch=r.watchlist;renderList();renderDetail();toast(target==null?'Using the suggested target.':'Your buy limit is saved.');}catch(e){error(e.message);if(button)button.disabled=false;}}
async function refreshCard(c){const b=$('#refresh-card');b.disabled=true;b.textContent='Refreshing…';try{const r=await request(`/api/market?id=${c.id}&refresh=1`);if(r.market)state.markets[c.id]=r.market;toast(r.refreshed?'Latest source data saved.':r.warning||'The source is unavailable. Showing saved observations.');renderList();renderDetail();stats();}catch(e){toast(e.message);b.disabled=false;b.textContent='↻ Refresh';}}
let refreshRun;
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
function updateView(){
 $('#browse-nav').classList.toggle('active',state.view==='browse');$('#watch-nav').classList.toggle('active',state.view==='watch');
 $('#browse-nav').setAttribute('aria-current',state.view==='browse'?'page':'false');$('#watch-nav').setAttribute('aria-current',state.view==='watch'?'page':'false');
 const set=activeSet(),name=set?.name||'All XY sets';
 $('#page-title').textContent=state.view==='watch'?'Your watchlist':name==='All XY sets'?'Explore the XY era':name;
 $('#page-description').textContent=state.view==='watch'?'Your saved cards and buy targets, across the XY era.':'A closer look at your next pickup.';
 $('#breadcrumb-set').textContent=name;$('#sidebar-set').textContent=name;$('#sidebar-year').textContent='English · '+(set?set.release.slice(0,4):'2014–2016');$('#set-code').textContent=set?.id.toUpperCase()||'XY + PROMOS';
 $('#set-select').value=state.setId;$('#set-scope').textContent=state.view==='watch'?'Filter your saved cards by set':'13 expansions + XY promos';
 const sourceSet=set||state.sets.find(s=>s.id===state.cards.find(c=>c.id===state.selected)?.setId);if(sourceSet){$('#set-market-source').href=sourceSet.marketSource;$('#set-checklist-source').href=sourceSet.checklistSource;}
 stats();
 document.querySelectorAll('[data-category]').forEach(b=>{b.classList.toggle('active',b.dataset.category===state.category);b.setAttribute('aria-pressed',String(b.dataset.category===state.category));});
 state.limit=60;$('#card-list').scrollTop=0;$('#detail').scrollTop=0;const visible=filteredCards();if(!visible.some(c=>c.id===state.selected))state.selected=visible[0]?.id||null;renderList();renderDetail();
}
$('#search').oninput=e=>{state.query=e.target.value.toLowerCase().trim();state.limit=60;$('#card-list').scrollTop=0;renderList();};
$('#grade').onchange=e=>{state.grade=e.target.value;updateView();};
$('#sort').onchange=e=>{state.sort=e.target.value;renderList();};
$('#budget-filter').onchange=e=>{state.budget=e.target.checked;renderList();};
document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;updateView();});
$('#browse-nav').onclick=()=>{state.view='browse';updateView();};$('#watch-nav').onclick=()=>{state.view='watch';state.setId='all';state.category='all';state.query='';state.budget=false;$('#search').value='';$('#budget-filter').checked=false;updateView();};
$('#set-select').onchange=e=>{state.setId=e.target.value;state.category='all';state.query='';state.budget=false;$('#search').value='';$('#budget-filter').checked=false;updateView();};
$('#show-more').onclick=()=>{state.limit+=24;renderList();};$('#refresh-set').onclick=refreshSet;
$('#method-button').onclick=$('#sources-button').onclick=()=>$('#method-dialog').showModal();$('#close-method').onclick=()=>$('#method-dialog').close();$('#method-dialog').onclick=e=>{if(e.target===$('#method-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
async function init(){
 try{const [catalog,watch]=await Promise.all([request('/api/catalog'),request('/api/watchlist').catch(e=>{error(e.message);return {watchlist:[]};})]);state.sets=catalog.sets;state.cards=catalog.cards;$('#set-select').innerHTML='<option value="all">All XY sets</option>'+state.sets.map(s=>`<option value="${s.id}">${esc(s.name)} · ${s.total} cards</option>`).join('');$('#set-select').value=state.setId;state.markets=catalog.markets;state.watch=watch.watchlist;updateView();if(catalog.local)$('#snapshot-label').textContent='Dated source snapshots';}catch(e){error(e.message);$('#card-list').innerHTML='<div class="empty-state"><strong>Couldn’t load the set.</strong><p>Keep this page open and try again.</p><button class="button" id="retry-load">Try again</button></div>';$('#retry-load').onclick=init;}
}
init();

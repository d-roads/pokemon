import {analyze as computeAnalysis,gradeNames,trendProjection} from '/analysis.mjs';
import {summarize,portfolioSeries,priceHistory,entryValue,MIN_PURCHASE_DATE} from '/portfolio.mjs';
const analysisCache=new WeakMap();
const analyze=(market,grade)=>{if(!market)return computeAnalysis(market,grade);const day=Math.floor(Date.now()/86400000);let cache=analysisCache.get(market);if(!cache||cache.day!==day){cache={day,grades:{}};analysisCache.set(market,cache);}return cache.grades[grade]??=(computeAnalysis(market,grade));};
const $=s=>document.querySelector(s);
const money=v=>v==null?'-':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const compact=v=>v==null?'-':Math.abs(v)>=1000?'$'+(v/1000).toFixed(Math.abs(v)>=10000?0:1)+'k':'$'+Math.round(v);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const monthLabel=ym=>new Date(ym+'-15T12:00:00Z').toLocaleDateString('en-US',{month:'short',year:'numeric'});
const ago=iso=>{const m=Math.round((Date.now()-Date.parse(iso))/60000);return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' d ago';};
const signed=v=>v==null?'—':(v>0?'+':v<0?'−':'')+money(Math.abs(v));
const pct=v=>v==null?'':(v>0?'+':v<0?'−':'')+Math.abs(v*100).toFixed(1)+'%';
const GRADE_FROM={0:'raw',9:'psa9',10:'psa10'};
const state={sets:[],series:[],setId:'xy5',cards:[],markets:{},full:{},watch:[],grade:'psa9',category:'chase',query:'',sort:'featured',view:'browse',selected:'xy5-147',limit:18,budget:false,expanded:false,
 dex:{entries:[],markets:{},loaded:false,sort:'value',range:'all'},alerts:{data:null,known:null,busy:false},movers:{period:'week',grade:'psa10',data:{},error:null},invest:{grade:'psa10',data:null,error:null}};
let toastTimer,selectionController;
async function request(url,options){const r=await fetch(url,options);const b=await r.json();if(!r.ok)throw new Error(b.error||'Something went wrong. Please try again.');return b;}
const send=(url,method,body)=>request(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function error(text){$('#error-banner').textContent=text;$('#error-banner').hidden=!text;}
// The catalog sends compact markets; expand them into the shape the analysis expects.
function expandMarket(m){if(!m||!Array.isArray(m.s))return m;const {s,...rest}=m;return {...rest,light:true,sales:s.map(([d,price,g,condition],i)=>({id:i,date:d,price,grade:GRADE_FROM[g],condition}))};}
const matchingWatch=id=>state.watch.find(w=>w.card_id===id && w.grade===state.grade);
const cardById=id=>state.cards.find(c=>c.id===id);
const activeSet=()=>state.sets.find(s=>s.id===state.setId);
const activeSeries=()=>state.setId.startsWith('era:')?state.series.find(s=>s.id===state.setId.slice(4)):state.series.find(s=>s.id===activeSet()?.series);
const inScope=c=>state.setId==='all'||(state.setId.startsWith('era:')?c.series===state.setId.slice(4):c.setId===state.setId);
const scopedCards=()=>state.cards.filter(c=>inScope(c)&&(c.eligible||state.view==='watch'&&matchingWatch(c.id)));
const owned=id=>state.dex.entries.filter(e=>e.card_id===id);
function stats(){
 const scope=scopedCards(),priced=scope.filter(c=>analyze(state.markets[c.id],state.grade).current!=null).length;
 $('#watch-count').textContent=state.watch.length;$('#summary-watch').innerHTML=state.watch.length+' <small>cards & grades saved</small>';
 $('#dex-count').textContent=state.dex.entries.reduce((n,e)=>n+(e.quantity||1),0);
 const wide=state.setId==='all'||state.setId.startsWith('era:');
 $('#set-count').innerHTML=scope.length+' <small>'+(wide?new Set(scope.map(c=>c.setId)).size+' sets · rare cards':'EX, full art, secret & other rares')+'</small>';
 $('#set-count-label').textContent=wide?'Rare cards in view':'Rare cards in this set';
 $('#price-count').innerHTML=priced+' <small>with '+gradeNames[state.grade]+' prices</small>';
 $('#coverage-note').textContent=priced===0&&state.grade!=='raw'?'No prices are loaded for this grade in this set. Choose Raw to see available reference guides.':priced+' of '+scope.length+' cards have a price for this grade. Guides are estimates; targets need matching sales.';
}
const priority=['xy5-147','xy5-55','xy5-156','xy5-151'];
const cardNumber=c=>{const n=String(c.number).toUpperCase(),special=n.match(/^([A-Z]+)(\d+)/);return special?1000+Number(special[2]):Number.parseInt(n,10);};
function filteredCards(){
 let list=scopedCards().filter(c=>(state.view!=='watch'||matchingWatch(c.id))&&(state.category==='all'||state.category==='chase'&&c.chase||(state.category==='Pokémon EX'?c.name.endsWith('EX'):c.category===state.category))&&(!state.query||(c.name+' '+c.numberLabel+' '+c.setName+' '+c.setId).toLowerCase().includes(state.query)));
 const analyses=new Map(),get=c=>{if(!analyses.has(c.id))analyses.set(c.id,analyze(state.markets[c.id],state.grade));return analyses.get(c.id);};
 if(state.budget)list=list.filter(c=>{const p=get(c).current;return p>=250&&p<=350;});
 const featured=c=>priority.includes(c.id)?priority.indexOf(c.id):get(c).current!=null?10:100;
 const setOrder=c=>state.sets.findIndex(s=>s.id===c.setId);
 return list.sort((a,b)=>state.sort==='number'?(setOrder(a)-setOrder(b))||cardNumber(a)-cardNumber(b):state.sort==='price'?(get(b).current??-1)-(get(a).current??-1):state.sort==='activity'?(get(b).score??-1)-(get(a).score??-1):featured(a)-featured(b)||(state.setId!=='xy5'?(get(b).current??-1)-(get(a).current??-1):0)||cardNumber(a)-cardNumber(b));
}
function renderList(){
 const list=filteredCards();$('#result-count').textContent=`${list.length} ${state.view==='watch'?'watched entries':'cards'} · ${gradeNames[state.grade]}`;
 $('#show-more').hidden=list.length<=state.limit;
 if(!list.length){$('#card-list').innerHTML=`<div class="empty-state"><strong>${state.view==='watch'&&!state.watch.length?'Your next pickup starts here.':'No cards match.'}</strong><p>${state.view==='watch'&&!state.watch.length?'Tap the star beside a card to save it with its grade and buy target.':'Try another grade, search, or category.'}</p><button class="button primary" id="clear-filters">${state.view==='watch'?'Browse cards':'Clear filters'}</button></div>`;$('#clear-filters').onclick=()=>{state.view='browse';state.category='chase';state.query='';state.budget=false;$('#search').value='';$('#budget-filter').checked=false;updateView();};return;}
 $('#card-list').innerHTML=list.slice(0,state.limit).map(c=>{
  const a=analyze(state.markets[c.id],state.grade),w=matchingWatch(c.id),target=w?.target??a.target,own=owned(c.id).length;
  return `<div class="card-row ${c.id===state.selected?'selected':''}" data-id="${c.id}"><button class="card-open" data-open="${c.id}" aria-label="View ${esc(c.name)} number ${c.number}" ${c.id===state.selected?'aria-current="true"':''}><img class="card-thumb" src="${c.image}" alt="" loading="lazy"><span><span class="card-name">${esc(c.name)}${own?'<span class="owned-dot" title="In your Dex">●</span>':''}</span><span class="card-sub">#${c.numberLabel} · ${esc(c.category)}<span class="row-set">${esc(c.setName)}</span></span></span></button><div class="price-cell">${money(a.current)}<small>${a.priceSource==='sales'?'Sold median':a.current?'Source guide':'Awaiting source'}</small></div><div class="target-cell ${target==null?'missing':''}">${target==null?'Needs sales':money(target)}${w?.target!=null?'<small class="card-sub">Your target</small>':''}</div><button class="star-button ${w?'saved':''}" data-watch="${c.id}" aria-label="${w?'Remove':'Add'} ${esc(c.name)} ${gradeNames[state.grade]} ${w?'from':'to'} watchlist" aria-pressed="${!!w}">${w?'★':'☆'}</button></div>`;
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

// Line charts with a crosshair and tooltip. Each series: {label, color, dash, points:[[label, value]], area}.
const charts=new Map();let chartSeq=0;
function lineChart({series,height=170,width=560,label,format=money,reference}){
 const all=series.flatMap(s=>s.points.map(p=>p[1])).concat(reference?[reference.value]:[]).filter(v=>v!=null);
 const n=Math.max(...series.map(s=>s.points.length));
 if(n<2||!all.length)return '<div class="chart-empty">Not enough price history to chart yet.</div>';
 const narrow=typeof window!=='undefined'&&window.innerWidth<640,id='chart'+(++chartSeq),w=narrow?Math.max(300,Math.min(width,window.innerWidth-40)):width,h=narrow?Math.round(height*.9):height,left=46,right=series.length>1?56:16,top=12,bottom=24;
 let lo=Math.min(...all),hi=Math.max(...all);if(lo===hi){lo*=.9;hi*=1.1;}const padY=(hi-lo)*.12;lo=Math.max(0,lo-padY);hi+=padY;
 const X=i=>left+i*(w-left-right)/(n-1),Y=v=>top+(hi-v)/(hi-lo||1)*(h-top-bottom);
 const ticks=[0,.5,1].map(t=>lo+(hi-lo)*t);
 const grid=ticks.map(v=>`<line x1="${left}" x2="${w-right}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="grid"/><text x="${left-8}" y="${(Y(v)+3).toFixed(1)}" text-anchor="end" class="tick">${compact(v)}</text>`).join('');
 const labels=series[0].points;const xt=[0,Math.floor((n-1)/2),n-1].map(i=>`<text x="${X(i).toFixed(1)}" y="${h-6}" text-anchor="${i===0?'start':i===n-1?'end':'middle'}" class="tick">${esc(labels[i]?.[2]||labels[i]?.[0]||'')}</text>`).join('');
 const paths=series.map(s=>{const pts=s.points.map((p,i)=>p[1]==null?null:[X(i),Y(p[1])]).filter(Boolean);if(!pts.length)return '';const d='M'+pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L');
  const area=s.area?`<path d="${d}L${pts.at(-1)[0].toFixed(1)},${(h-bottom).toFixed(1)}L${pts[0][0].toFixed(1)},${(h-bottom).toFixed(1)}Z" fill="${s.color}" opacity=".08"/>`:'';
  const end=pts.at(-1),direct=series.length>1?`<text x="${(end[0]+6).toFixed(1)}" y="${(end[1]+4).toFixed(1)}" class="direct" fill="currentColor">${esc(s.label)}</text>`:'';
  return area+`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${s.dash?'stroke-dasharray="5 4"':''}/>`+direct;}).join('');
 const ref=reference?`<line x1="${left}" x2="${w-right}" y1="${Y(reference.value).toFixed(1)}" y2="${Y(reference.value).toFixed(1)}" stroke="${reference.color}" stroke-width="2" stroke-dasharray="5 4"/><text x="${w-right}" y="${(Y(reference.value)-5).toFixed(1)}" text-anchor="end" class="direct" fill="currentColor">${esc(reference.label)}</text>`:'';
 const marks=(reference?.markIndex!=null)?`<circle cx="${X(reference.markIndex).toFixed(1)}" cy="${Y(series[0].points[reference.markIndex]?.[1]??reference.value).toFixed(1)}" r="4.5" fill="${reference.color}" stroke="#fff" stroke-width="2"/>`:'';
 if(charts.size>40)charts.delete(charts.keys().next().value);charts.set(id,{series,n,X,Y,format,left,right,w,h,top,bottom});
 const legend=series.length>1?`<div class="chart-legend">${series.map(s=>`<span><i style="background:${s.color}" class="${s.dash?'dashed':''}"></i>${esc(s.label)}</span>`).join('')}</div>`:'';
 return `${legend}<div class="line-chart" data-chart="${id}"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${grid}${xt}${ref}${paths}${marks}<line class="crosshair" x1="0" x2="0" y1="${top}" y2="${h-bottom}" visibility="hidden"/><g class="hover-dots"></g><rect class="hit" x="${left}" y="0" width="${w-left-right}" height="${h}" fill="transparent"/></svg><div class="chart-tip" hidden></div></div>`;
}
function wireCharts(root=document){
 root.querySelectorAll('[data-chart]').forEach(el=>{const m=charts.get(el.dataset.chart);if(!m)return;const svg=el.querySelector('svg'),tip=el.querySelector('.chart-tip'),cross=svg.querySelector('.crosshair'),dots=svg.querySelector('.hover-dots');
  const show=evt=>{const r=svg.getBoundingClientRect(),sx=(evt.clientX-r.left)*m.w/r.width;let i=Math.round((sx-m.left)/((m.w-m.left-m.right)/(m.n-1)));i=Math.max(0,Math.min(m.n-1,i));const x=m.X(i);
   cross.setAttribute('x1',x);cross.setAttribute('x2',x);cross.setAttribute('visibility','visible');
   dots.innerHTML=m.series.map(s=>s.points[i]?.[1]==null?'':`<circle cx="${x}" cy="${m.Y(s.points[i][1])}" r="4" fill="${s.color}" stroke="#fff" stroke-width="2"/>`).join('');
   const p=m.series[0].points[i];tip.innerHTML=`<strong>${esc(p?.[2]||p?.[0]||'')}</strong>`+m.series.map(s=>s.points[i]?.[1]==null?'':`<span><i style="background:${s.color}"></i>${esc(s.label)} <b>${m.format(s.points[i][1])}</b></span>`).join('');
   tip.hidden=false;const px=x/m.w*r.width;tip.style.left=Math.min(Math.max(px,70),r.width-70)+'px';};
  const hide=()=>{cross.setAttribute('visibility','hidden');dots.innerHTML='';tip.hidden=true;};
  svg.onpointermove=show;svg.onpointerdown=show;svg.onpointerleave=hide;});
}

function historyChart(m,grade){
 const h=priceHistory(m,grade).slice(-36);if(h.length<2)return '';
 return `<div class="detail-section history"><div class="section-heading"><h3>Price history</h3><small>Monthly guide · ${h.length} months</small></div>${lineChart({series:[{label:gradeNames[grade],color:'#2658ec',area:true,points:h.map(([ym,v])=>[ym,v,monthLabel(ym)])}],height:170,width:340,label:gradeNames[grade]+' monthly guide price'})}<p class="sales-note">PriceCharting's monthly guide${grade==='psa9'?' for Grade 9, which includes other graders':''}. Sold medians above use matching sales only.</p></div>`;
}
function popLine(m){const p=m?.pop?.psa;if(!Array.isArray(p)||p.length<10)return '';const total=p.reduce((a,b)=>a+b,0);return `<p>PSA population: <b>${p[8].toLocaleString()}</b> PSA 9 · <b>${p[9].toLocaleString()}</b> PSA 10 · ${total.toLocaleString()} graded.${total?' '+Math.round(p[9]/total*100)+'% gem rate.':''}</p>`;}
function renderDetail(){
 const c=cardById(state.selected);if(!c){$('#detail').innerHTML='<div class="empty-state"><strong>Select a card</strong><p>Card insights will appear here.</p></div>';return;}
 const sourceSet=state.sets.find(s=>s.id===c.setId);$('#set-market-source').href=sourceSet.marketSource;$('#set-checklist-source').href=sourceSet.checklistSource;
 const m=state.markets[c.id],a=analyze(m,state.grade),w=matchingWatch(c.id),target=w?.target??a.target,mine=owned(c.id);
 const projection=trendProjection(a.comparable,a.current);
 const referenceSource=a.priceSource==='guide'?a.guideSource:null;
 const comparison=a.fair?money(a.fair):'—',conf=a.confidence==='Insufficient'?'More evidence needed':`${a.confidence} confidence`;
 const forecasts=a.fair?[-.07,.05,.12].map(g=>money(a.fair*(1+g)**5)):['—','—','—'];
 const loading=m?.light&&!state.full[c.id];
 $('#detail').classList.toggle('expanded',state.expanded);
 $('#detail').innerHTML=`<div class="detail-top"><div class="detail-eyebrow"><span>CARD INSIGHT</span><span>${gradeNames[state.grade]}</span></div><div class="detail-identity"><div class="detail-image-wrap"><img class="detail-image" src="${c.image}" alt="${esc(c.name)} ${c.numberLabel}"></div><div><h2>${esc(c.name)}</h2><p>${esc(c.setName)} · #${c.numberLabel}<br>${esc(c.category)}</p><span class="type-pill">${esc(c.type)}</span>${mine.length?`<span class="type-pill owned-pill">In your Dex · ${mine.reduce((n,e)=>n+(e.quantity||1),0)}</span>`:''}</div></div></div>
 <div class="buy-box ${target==null?'insufficient':''}"><div class="eyebrow">${w?.target!=null?'YOUR BUY TARGET':'SUGGESTED MAXIMUM PRICE'}</div><div class="buy-amount"><strong>${target==null?'Waiting for evidence':money(target)}</strong>${a.target!=null && w?.target==null?'<span class="discount-tag">15% below median</span>':''}</div><p>${w?.target!=null?'Your saved limit, before shipping and tax.':esc(a.reason)}</p></div>
 <div class="detail-metrics"><div><span class="metric-label">Current reference</span><strong>${money(a.current)}</strong><small>${esc(a.priceLabel)}</small>${state.grade==='psa9'&&a.guidePrice?`<small>Mixed Grade 9 guide: ${money(a.guidePrice)}</small>`:''}${a.sampleCount?`<span class="sample-badge">${a.sampleCount} matching sales</span>`:''}</div><div><span class="metric-label">Demand estimate</span><div class="demand-wrap"><strong>${a.score??'—'}</strong><em>/ 100</em></div><div class="demand-bar"><span style="width:${a.score??0}%"></span></div><small>Sales activity · ${conf.toLowerCase()}</small></div></div>
 <div class="detail-chart"><div class="section-heading"><h3>Reported sales</h3><small>${gradeNames[state.grade]}</small></div><div class="trend-layout"><div>${chart(a)}</div><aside class="trend-projection" aria-label="Simple trend projection"><span>Simple trend projection</span>${projection.available?['1Y','2Y','3Y'].map((label,i)=>`<div><b>${label}</b><strong>${money(projection.values[i])}</strong></div>`).join(''):`<p>${projection.reason}</p>`}</aside></div><p class="chart-caption">${a.usable.length} matching sales · ${a.windowDays} days · ${conf}${projection.available?` · ${signed(projection.annualIncrease)} / year trend`:''}</p><p class="sales-note">Projection applies the trailing-year sales regression slope to today's reference price. It is a simple trend estimate, not investment advice.</p></div>
 <div class="detail-actions"><button class="button primary" id="detail-watch">${w?'★ Watching':'☆ Add to watchlist'}</button><button class="button" id="detail-dex" aria-label="Add ${esc(c.name)} to your Dex">＋ Dex</button><button class="button" id="refresh-card" aria-label="Refresh this card">↻</button></div>
 ${w?`<div class="detail-section"><h3>Your buy limit</h3><form id="target-form" class="target-form"><label for="custom-target">Maximum price (USD)<input id="custom-target" type="number" min="0.01" max="1000000" step="0.01" value="${w.target??a.target??''}" placeholder="Set a price" required></label><button class="button" type="submit">Save</button></form><button id="reset-target" class="remove-watch">Use suggested target</button><p class="sales-note">Alerts fire when this card is listed at or under ${target!=null?money(target):'your limit'} including shipping. <button class="link-button" id="open-alerts">Alert settings</button></p></div>`:''}
 <div class="detail-section sales"><div class="section-heading"><h3>Recent sales</h3><small>${loading?'Loading…':a.all.length+' observed'}</small></div>${a.all.length?a.all.slice(0,8).map(s=>`<div class="sale-row"><span>${date(s.date)}</span><a href="${esc(s.source||c.source)}" target="_blank" rel="noopener noreferrer">${esc(s.marketplace||'Source')}${state.grade==='raw'?' · '+esc(s.condition):''}</a><strong>${money(s.price)}</strong>${s.title?`<span class="sale-title">${esc(s.title)}</span>`:''}</div>`).join(''):'<p class="sales-note">No matching sales loaded for this grade. Refresh or check the source.</p>'}<p class="sales-note">${state.grade==='raw'?'Raw conditions are shown as reported; only NM enters targets. ':'PSA sales are kept separate from other graders. '}${a.all.length?'Reported by PriceCharting.':'Targets use reported matching sales.'}${a.excluded?' '+a.excluded+' outliers excluded from targets.':''}</p></div>
 ${loading?'':historyChart(m,state.grade)}
 <div class="detail-section research"><h3>Sales coverage</h3><p>${['raw','psa9','psa10'].map(g=>gradeNames[g]+': '+analyze(m,g).comparable.length+' matching sales').join(' · ')}</p>${popLine(m)}<p>${m?.research?.status==='full'?'Read from the full source page'+(m.research.checkedAt?' on '+new Date(m.research.checkedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'')+'. Listings with other graders, wrong numbers or variants are left out.':m?.research?.status==='unavailable'?'The public source could not be retrieved. Saved guides keep their original date.':'Coverage reflects the public sales retrieved, and can be incomplete. Targets use only matching recent sales.'}</p></div><div class="detail-section scenarios"><h3>Five-year scenarios <span class="muted">· 2031</span></h3><div class="scenario-grid">${['Bear','Steady','Strong'].map((label,i)=>`<div><span>${label}</span><strong>${forecasts[i]}</strong><small>${['−7%','+5%','+12%'][i]} / year</small></div>`).join('')}</div><p class="sales-note">Illustrative scenarios, using the ${comparison} comparable median. Not a backtested forecast.</p></div>
 <button class="mobile-expand" id="expand-details">${state.expanded?'Show fewer details':'See sales & five-year scenarios'}</button><div class="source-line"><span>${(referenceSource?.observedAt||m?.observedAt)?'Checked '+new Date(referenceSource?.observedAt||m.observedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Price data not yet loaded'}</span><a href="${esc(referenceSource?.url||m?.sourceUrl||c.source)}" target="_blank" rel="noopener noreferrer">${referenceSource?.name?esc(referenceSource.name)+' · ':m?.source?esc(m.source)+' · ':''}View source</a></div>`;
 $('#detail-watch').onclick=()=>toggleWatch(c.id,$('#detail-watch'));
 $('#detail-dex').onclick=()=>openDexDialog({card_id:c.id,grade:state.grade});
 $('#refresh-card').onclick=()=>refreshCard(c);
 $('#expand-details').onclick=()=>{state.expanded=!state.expanded;renderDetail();};
 if(w){$('#target-form').onsubmit=e=>{e.preventDefault();saveTarget(c.id,Number($('#custom-target').value));};$('#reset-target').onclick=()=>saveTarget(c.id,null);$('#open-alerts').onclick=()=>{state.view='alerts';updateView();};}
 wireImages();wireCharts($('#detail'));
}
async function select(id){state.selected=id;state.expanded=false;renderList();renderDetail();$('#detail').scrollTop=0;if(!state.full[id])await loadCard(id);}
async function loadCard(id){selectionController?.abort();selectionController=new AbortController();try{const r=await request(`/api/market?id=${encodeURIComponent(id)}`,{signal:selectionController.signal});if(r.market){state.markets[id]=r.market;state.full[id]=true;}if(state.selected===id)renderDetail();}catch(e){if(e.name!=='AbortError')toast('Could not load this card. Try Refresh.');}}
async function toggleWatch(id,button){const w=matchingWatch(id),grade=state.grade;button.disabled=true;try{const r=await send('/api/watchlist',w?'DELETE':'POST',{card_id:id,grade,target:null});state.watch=r.watchlist;toast(w?'Removed from watchlist.':'Saved to your watchlist.');stats();renderList();renderDetail();}catch(e){error(e.message);button.disabled=false;}}
async function saveTarget(id,target){const button=$('#target-form button');if(button)button.disabled=true;try{const r=await send('/api/watchlist','POST',{card_id:id,grade:state.grade,target});state.watch=r.watchlist;renderList();renderDetail();toast(target==null?'Using the suggested target.':'Your buy limit is saved.');}catch(e){error(e.message);if(button)button.disabled=false;}}
async function refreshCard(c){const b=$('#refresh-card');b.disabled=true;b.textContent='…';try{const r=await request(`/api/market?id=${encodeURIComponent(c.id)}&refresh=1`);if(r.market){state.markets[c.id]=r.market;state.full[c.id]=true;}toast(r.refreshed?'Latest source data saved.':r.warning||'The source is unavailable. Showing saved observations.');renderList();renderDetail();stats();}catch(e){toast(e.message);b.disabled=false;b.textContent='↻';}}
let refreshRun;
async function refreshSet(){
 if(refreshRun){refreshRun.abort();return;}
 const controller=new AbortController();refreshRun=controller;const b=$('#refresh-set'),scope=state.setId;let offset=0,updated=0,total=0;
 b.textContent='Cancel refresh';b.disabled=false;
 try{
  for(;;){
   const r=await request('/api/research?set='+encodeURIComponent(scope)+'&offset='+offset,{method:'POST',signal:controller.signal});
   if(r.markets)for(const [id,m] of Object.entries(r.markets)){state.markets[id]=expandMarket(m);delete state.full[id];}updated+=r.count||0;total=r.total||0;
   stats();renderList();renderDetail();
   if(r.warning){toast(r.warning);return;}
   if(r.done)break;offset=r.nextOffset;b.textContent='Cancel · '+offset+'/'+total;
  }
  toast('Refreshed sales for '+updated+' of '+total+' rare cards.');if(updated)$('#snapshot-label').textContent='Sales checked just now';
 }catch(e){toast(e.name==='AbortError'?'Refresh stopped. Retrieved sales are saved.':e.message);}
 finally{refreshRun=null;b.disabled=false;b.innerHTML='<span aria-hidden="true">↻</span> Refresh sales';}
}

// ---------- Dex ----------
const marketFor=id=>state.dex.markets[id]||state.markets[id];
async function loadDex(){try{const r=await request('/api/collection');state.dex.entries=r.collection;state.dex.markets=r.markets||{};state.dex.loaded=true;}catch(e){error(e.message);}}
function plClass(v){return v>0?'up':v<0?'down':'flat';}
function plText(v,p){return v==null?'—':`<span class="pl ${plClass(v)}"><span aria-hidden="true">${v>0?'▲':v<0?'▼':'■'}</span> ${signed(v)}${p!=null?' <small>'+pct(p)+'</small>':''}</span>`;}
function renderDex(){
 const view=$('#dex-view');
 if(!state.dex.loaded){view.innerHTML='<div class="loading"><span class="spinner"></span>Opening your Dex…</div>';return;}
 const s=summarize(state.dex.entries,marketFor),series=portfolioSeries(state.dex.entries,marketFor);
 const ranges={'6m':6,'1y':12,'3y':36,all:Infinity},shown=series.slice(-Math.min(series.length,ranges[state.dex.range]===Infinity?series.length:ranges[state.dex.range]+1));
 const rows=[...s.rows].sort((a,b)=>state.dex.sort==='pl'?(b.pl??-Infinity)-(a.pl??-Infinity):state.dex.sort==='recent'?String(b.purchase_date||b.created_at).localeCompare(String(a.purchase_date||a.created_at)):state.dex.sort==='set'?(state.sets.findIndex(x=>x.id===cardById(a.card_id)?.setId)-state.sets.findIndex(x=>x.id===cardById(b.card_id)?.setId))||cardNumber(cardById(a.card_id))-cardNumber(cardById(b.card_id)):(b.value??-1)-(a.value??-1));
 const empty=!state.dex.entries.length;
 view.innerHTML=`<div class="dex-summary">
  <div class="dex-tile"><span>Collection value</span><strong>${money(s.value)}</strong><small>${s.cards} card${s.cards===1?'':'s'} · ${s.entries} entr${s.entries===1?'y':'ies'}${s.unpriced?' · '+s.unpriced+' unpriced':''}</small></div>
  <div class="dex-tile"><span>Cost basis</span><strong>${money(s.cost)}</strong><small>${s.noCost?s.noCost+' without a price paid':'What you paid'}</small></div>
  <div class="dex-tile"><span>Unrealized P/L</span><strong>${s.comparedCost?plText(s.pl,s.plPct):'—'}</strong><small>${s.comparedCost?'On '+money(s.comparedCost)+' of priced purchases':'Add prices paid to see P/L'}</small></div>
  <div class="dex-tile"><span>Best performer</span><strong class="small">${(()=>{const b=s.rows.filter(r=>r.plPct!=null).sort((a,b)=>b.plPct-a.plPct)[0];return b?esc(cardById(b.card_id)?.name||b.card_id)+' '+plText(b.pl,b.plPct):'—';})()}</strong><small>By percentage return</small></div>
 </div>
 <div class="dex-layout">
  <section class="panel dex-chart-panel" aria-label="Value and cost over time"><div class="panel-head"><div><h2>Value vs. cost</h2><p>Your collection's market value each month against what you paid.</p></div><div class="segmented" role="group" aria-label="Chart range">${Object.keys(ranges).map(k=>`<button data-range="${k}" aria-pressed="${state.dex.range===k}" class="${state.dex.range===k?'active':''}">${k==='all'?'All':k.toUpperCase()}</button>`).join('')}</div></div>
   ${empty?'<div class="chart-empty tall">Your chart appears once you add cards.</div>':lineChart({series:[{label:'Value',color:'#2658ec',area:true,points:shown.map(p=>[p.month,p.value,monthLabel(p.month)])},{label:'Cost',color:'#eb6834',dash:true,points:shown.map(p=>[p.month,p.cost,monthLabel(p.month)])}],height:230,label:'Collection value and cost basis by month'})}
   <p class="sales-note">Monthly values use each card's price history for its grade; the latest point uses today's reference price. Months before a price history exists use the price paid. Fees, shipping and tax are not included.</p></section>
  <section class="panel dex-holdings" aria-label="Cards in your Dex"><div class="panel-head"><div><h2>Your cards</h2><p>${empty?'Nothing here yet.':'Tap a card to edit it or see its own P/L.'}</p></div><div class="holdings-tools"><label class="sort-control"><span class="sr-only">Sort Dex</span><select id="dex-sort">${[['value','Highest value'],['pl','Best P/L'],['recent','Recently bought'],['set','Set order']].map(([v,l])=>`<option value="${v}" ${state.dex.sort===v?'selected':''}>${l}</option>`).join('')}</select></label><button class="button primary" id="dex-add">＋ Add a card</button></div></div>
   ${empty?`<div class="empty-state"><strong>Start your Dex.</strong><p>Add cards you own with what you paid, and Primal Watch keeps their value and profit up to date.</p><button class="button primary" id="dex-add-empty">Add your first card</button></div>`:`<div class="dex-grid">${rows.map(r=>{const c=cardById(r.card_id);if(!c)return '';return `<button class="dex-card" data-entry="${r.id}" aria-label="${esc(c.name)} ${gradeNames[r.grade]}, value ${money(r.value)}"><img src="${c.image}" alt="" loading="lazy"><span class="dex-card-body"><span class="dex-name">${esc(c.name)}</span><span class="dex-sub">${esc(c.setName)} · #${c.numberLabel}</span><span class="dex-chips"><span class="grade-chip ${r.grade}">${gradeNames[r.grade].replace(' · near mint','')}</span>${r.quantity>1?`<span class="qty-chip">×${r.quantity}</span>`:''}</span><span class="dex-value">${money(r.value)}<small>${r.basis?esc(r.basis):'no price yet'}</small></span><span class="dex-pl">${r.cost!=null?plText(r.pl,r.plPct):'<span class="muted">Paid: not set</span>'}</span></span></button>`;}).join('')}</div>`}
  </section>
 </div>
 ${empty?'':`<section class="panel binder-panel" aria-label="Set progress"><div class="panel-head"><div><h2>Binder progress</h2><p>Rare cards you own in each set you collect.</p></div></div><div class="binder-list">${binderProgress().map(b=>`<button class="binder-row" data-binder="${b.set.id}"><span class="binder-name"><b>${esc(b.set.name)}</b><small>${esc(state.series.find(x=>x.id===b.set.series)?.label||'')} · ${b.set.release.slice(0,4)}</small></span><span class="binder-bar" role="img" aria-label="${b.owned} of ${b.total} rare cards"><i style="width:${Math.max(2,Math.round(b.owned/b.total*100))}%"></i></span><span class="binder-count">${b.owned}<small>/ ${b.total}</small></span></button>`).join('')}</div></section>`}`;
 view.querySelectorAll('[data-binder]').forEach(b=>b.onclick=()=>{state.view='browse';state.setId=b.dataset.binder;state.category='all';state.query='';$('#search').value='';updateView();});
 view.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{state.dex.range=b.dataset.range;renderDex();});
 const sort=view.querySelector('#dex-sort');if(sort)sort.onchange=e=>{state.dex.sort=e.target.value;renderDex();};
 view.querySelectorAll('#dex-add,#dex-add-empty').forEach(b=>b.onclick=()=>openDexDialog({}));
 view.querySelectorAll('[data-entry]').forEach(b=>b.onclick=()=>openDexDialog(state.dex.entries.find(e=>String(e.id)===b.dataset.entry)));
 wireImages();wireCharts(view);
}
function binderProgress(){
 const ownedIds=new Set(state.dex.entries.map(e=>e.card_id)),bySet=new Map();
 for(const id of ownedIds){const c=cardById(id);if(c)bySet.set(c.setId,(bySet.get(c.setId)||new Set()).add(id));}
 return [...bySet].map(([setId,ids])=>{const set=state.sets.find(x=>x.id===setId),rares=state.cards.filter(c=>c.setId===setId&&c.eligible);return {set,owned:[...ids].filter(id=>rares.some(c=>c.id===id)).length,total:rares.length};}).filter(b=>b.set&&b.total).sort((a,b)=>b.owned/b.total-a.owned/a.total);
}
function cardSearch(q){q=q.toLowerCase().trim();if(q.length<2)return [];return state.cards.filter(c=>(c.name+' '+c.numberLabel+' '+c.setName).toLowerCase().includes(q)).sort((a,b)=>(b.eligible-a.eligible)||a.name.localeCompare(b.name)).slice(0,8);}
function openDexDialog(entry){
 const editing=entry?.id!=null,dlg=$('#dex-dialog'),form=$('#dex-form');let card=cardById(entry?.card_id);
 const today=new Date().toISOString().slice(0,10);
 let dateDraft=entry?.purchase_date?.match(/^\d{4}-\d{2}-\d{2}$/)?{year:entry.purchase_date.slice(0,4),month:entry.purchase_date.slice(5,7),day:entry.purchase_date.slice(8,10)}:{year:'',month:'',day:''};
 const readDate=()=>{const {year,month,day}=dateDraft;if(!year&&!month&&!day)return null;if(!year||!month||!day)return 'invalid';const iso=`${year}-${month}-${day}`,parsed=new Date(iso+'T12:00:00Z');return Number.isFinite(parsed.valueOf())&&parsed.toISOString().slice(0,10)===iso?iso:'invalid';};
 const draw=()=>{
  const market=card?marketFor(card.id):null,grade=entry.grade||'psa9',val=card?entryValue({...entry,grade,quantity:entry.quantity||1},market):null;
  const h=card?priceHistory(market,grade).slice(-48):[],paidIdx=entry.purchase_date?h.findIndex(([m])=>m>=entry.purchase_date.slice(0,7)):-1;
  form.innerHTML=`<div class="dialog-heading"><h2 id="dex-dialog-title">${editing?'Edit Dex entry':'Add to your Dex'}</h2><button class="icon-button" type="button" id="dex-close" aria-label="Close">×</button></div><div class="dialog-body dex-form-body">
   ${card?`<div class="dex-picked"><img src="${card.image}" alt=""><div><strong>${esc(card.name)}</strong><span>${esc(card.setName)} · #${card.numberLabel}</span>${editing?'<button type="button" class="link-button" id="dex-view-card">Open card details</button>':'<button type="button" class="link-button" id="dex-change">Choose a different card</button>'}</div></div>`:`<label class="field">Card<input id="dex-search" type="search" placeholder="Search by name, number or set" autocomplete="off" aria-describedby="dex-search-hint"></label><div id="dex-results" class="dex-results" role="listbox"></div><p class="field-hint" id="dex-search-hint">Type at least two letters.</p>`}
   <div class="field-row"><label class="field">Grade<select id="dex-grade">${['raw','psa9','psa10'].map(g=>`<option value="${g}" ${grade===g?'selected':''}>${gradeNames[g]}</option>`).join('')}</select></label><label class="field">Quantity<input id="dex-qty" type="number" min="1" max="999" step="1" value="${entry.quantity||1}"></label></div>
   <div class="field-row"><label class="field">Price paid each (USD)<input id="dex-price" type="number" min="0" max="1000000" step="0.01" value="${entry.purchase_price??''}" placeholder="Optional"></label><div class="field date-field"><span>Date bought</span><div class="date-parts"><select id="dex-date-month" aria-label="Purchase month"><option value="">Month</option>${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((name,i)=>{const value=String(i+1).padStart(2,'0');return `<option value="${value}" ${dateDraft.month===value?'selected':''}>${name}</option>`;}).join('')}</select><select id="dex-date-day" aria-label="Purchase day"><option value="">Day</option>${Array.from({length:31},(_,i)=>{const value=String(i+1).padStart(2,'0');return `<option value="${value}" ${dateDraft.day===value?'selected':''}>${i+1}</option>`;}).join('')}</select><select id="dex-date-year" aria-label="Purchase year"><option value="">Year</option>${(()=>{const current=Number(today.slice(0,4)),minimum=Number(MIN_PURCHASE_DATE.slice(0,4)),years=Array.from({length:current-minimum+1},(_,i)=>String(current-i));if(dateDraft.year&&Number(dateDraft.year)<minimum)years.push(dateDraft.year);return years.map(year=>`<option value="${year}" ${dateDraft.year===year?'selected':''}>${year}${Number(year)<minimum?' · existing':''}</option>`).join('');})()}</select></div><div class="date-shortcuts"><button type="button" class="link-button" id="dex-date-today">Today</button><button type="button" class="link-button" id="dex-date-clear">Clear</button><small>Optional · 2010 or later</small></div></div></div>
   <label class="field">Notes<input id="dex-notes" type="text" maxlength="280" value="${esc(entry.notes||'')}" placeholder="Cert number, where you bought it…"></label>
   ${card&&val?`<div class="dex-preview"><div><span>Value now</span><strong>${money(val.value)}</strong><small>${val.basis?esc(val.basis):'No price yet'}</small></div><div><span>P/L</span><strong>${val.cost!=null?plText(val.pl,val.plPct):'—'}</strong><small>${val.cost!=null?'vs '+money(val.cost)+' paid':'Add a price paid'}</small></div></div>${h.length>1?lineChart({series:[{label:gradeNames[grade],color:'#2658ec',area:true,points:h.map(([ym,v])=>[ym,v,monthLabel(ym)])}],height:180,width:480,label:'Price history for this card',reference:entry.purchase_price!=null?{value:entry.purchase_price,label:'Paid '+money(entry.purchase_price),color:'#eb6834',markIndex:paidIdx>=0?paidIdx:null}:null}):''}`:''}
   <p class="form-error" id="dex-error" role="alert" hidden></p>
   <div class="dialog-actions">${editing?'<button type="button" class="button danger" id="dex-delete">Remove</button>':''}<span></span><button type="button" class="button" id="dex-cancel">Cancel</button><button type="submit" class="button primary" id="dex-save">${editing?'Save changes':'Add to Dex'}</button></div>
  </div>`;
  const sync=()=>{dateDraft={month:$('#dex-date-month').value,day:$('#dex-date-day').value,year:$('#dex-date-year').value};entry={...entry,grade:$('#dex-grade').value,quantity:Number($('#dex-qty').value)||1,purchase_price:$('#dex-price').value===''?null:Number($('#dex-price').value),purchase_date:readDate(),notes:$('#dex-notes').value};};
  $('#dex-close').onclick=$('#dex-cancel').onclick=()=>dlg.close();
  $('#dex-grade').onchange=()=>{sync();draw();};$('#dex-price').onchange=()=>{sync();draw();};
  for(const id of ['#dex-date-month','#dex-date-day','#dex-date-year'])$(id).onchange=sync;
  $('#dex-date-today').onclick=()=>{dateDraft={year:today.slice(0,4),month:today.slice(5,7),day:today.slice(8,10)};for(const [id,key] of [['#dex-date-month','month'],['#dex-date-day','day'],['#dex-date-year','year']])$(id).value=dateDraft[key];sync();};
  $('#dex-date-clear').onclick=()=>{dateDraft={year:'',month:'',day:''};for(const id of ['#dex-date-month','#dex-date-day','#dex-date-year'])$(id).value='';sync();};
  if($('#dex-view-card'))$('#dex-view-card').onclick=()=>{dlg.close();state.view='browse';state.setId=card.setId;state.category='all';state.grade=entry.grade||state.grade;$('#grade').value=state.grade;state.query='';$('#search').value='';updateView();select(card.id);};
  if($('#dex-change'))$('#dex-change').onclick=()=>{sync();card=null;draw();$('#dex-search').focus();};
  if($('#dex-search')){const s=$('#dex-search');s.oninput=()=>{const res=cardSearch(s.value);$('#dex-results').innerHTML=res.map(c=>`<button type="button" role="option" data-pick="${c.id}"><img src="${c.image}" alt="" loading="lazy"><span><b>${esc(c.name)}</b><small>${esc(c.setName)} · #${c.numberLabel}</small></span></button>`).join('')||(s.value.trim().length>1?'<p class="field-hint">No cards match.</p>':'');$('#dex-results').querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{sync();card=cardById(b.dataset.pick);entry.card_id=card.id;draw();});wireImages();};}
  if($('#dex-delete'))$('#dex-delete').onclick=async()=>{try{const r=await send('/api/collection','DELETE',{id:entry.id});applyDex(r);dlg.close();toast('Removed from your Dex.');}catch(e){$('#dex-error').textContent=e.message;$('#dex-error').hidden=false;}};
  form.onsubmit=async e=>{e.preventDefault();sync();if(!card){$('#dex-error').textContent='Choose a card first.';$('#dex-error').hidden=false;return;}if(entry.purchase_date==='invalid'){$('#dex-error').textContent='Choose a complete, valid purchase date from 2010 through today.';$('#dex-error').hidden=false;return;}
   const body={card_id:card.id,grade:entry.grade,quantity:entry.quantity,purchase_price:entry.purchase_price,purchase_date:entry.purchase_date,notes:entry.notes,...(editing?{id:entry.id}:{})};
   $('#dex-save').disabled=true;try{const r=await send('/api/collection',editing?'PUT':'POST',body);applyDex(r);dlg.close();toast(editing?'Dex entry saved.':card.name+' added to your Dex.');}catch(err){$('#dex-error').textContent=err.message;$('#dex-error').hidden=false;$('#dex-save').disabled=false;}};
  wireImages();wireCharts(form);
 };
 entry={grade:state.grade,quantity:1,...entry};draw();if(!dlg.open)dlg.showModal();
}
function applyDex(r){state.dex.entries=r.collection;state.dex.markets={...state.dex.markets,...(r.markets||{})};state.dex.loaded=true;stats();if(state.view==='dex')renderDex();else{renderList();renderDetail();}}

// ---------- Alerts ----------
async function loadAlerts(quiet){try{const r=await request('/api/alerts');applyAlerts(r,quiet);}catch(e){if(!quiet)error(e.message);}}
function applyAlerts(r,quiet){
 const before=state.alerts.known;r.searches=r.searches||state.alerts.data?.searches||[];state.alerts.data=r;state.alerts.known=new Set(r.alerts.map(a=>a.id));
 const badge=$('#alert-count');badge.textContent=r.unseen;badge.hidden=!r.unseen;
 if(before&&quiet){const fresh=r.alerts.filter(a=>!before.has(a.id)&&!a.seen);if(fresh.length){const a=fresh[0],c=cardById(a.card_id);toast((fresh.length>1?fresh.length+' new alerts: ':'New alert: ')+(c?.name||'')+' '+money(a.total));
  if(typeof Notification!=='undefined'&&Notification.permission==='granted')for(const x of fresh.slice(0,3)){const cc=cardById(x.card_id);const n=new Notification((cc?.name||'Watched card')+' · '+gradeNames[x.grade]+' at '+money(x.total),{body:x.title,icon:cc?.image});n.onclick=()=>window.open(x.url,'_blank','noopener');}}}
 if(state.view==='alerts')renderAlerts();
}
function renderAlerts(){
 const view=$('#alerts-view'),d=state.alerts.data;
 if(!d){view.innerHTML='<div class="loading"><span class="spinner"></span>Loading alerts…</div>';return;}
 const s=d.settings,run=d.lastRun,notifyPerm=typeof Notification==='undefined'?'unsupported':Notification.permission;
 const status=d.live?`<span class="status-dot on"></span>Live alerts are on · every ${s.intervalMinutes} min${run?` · last scan ${ago(run.finished_at||run.started_at)}, ${run.checked} card${run.checked===1?'':'s'} checked`:''}`:s.ebay.configured?'<span class="status-dot"></span>Live alerts are paused. Turn them on in settings.':'<span class="status-dot"></span>Add your eBay API keys to scan new listings automatically.';
 view.innerHTML=`<div class="alerts-layout">
 <section class="panel alerts-main" aria-label="Listings at or under your limit"><div class="panel-head"><div><h2>Listings at your price</h2><p class="status-line">${status}${run?.error?` <span class="warn">· ${esc(run.error)}</span>`:''}</p></div><div class="holdings-tools"><button class="button" id="alerts-seen" ${d.unseen?'':'disabled'}>Mark all seen</button><button class="button primary" id="alerts-scan" ${s.ebay.configured?'':'disabled'}>${state.alerts.busy?'Scanning…':'Scan now'}</button></div></div>
  ${d.alerts.length?`<div class="alert-list">${d.alerts.map(a=>{const c=cardById(a.card_id),under=a.market_price>0?(1-a.total/a.market_price):null;return `<article class="alert-row ${a.seen?'':'unseen'}"><img src="${esc(a.image||c?.image||'')}" alt="" loading="lazy"><div class="alert-body"><div class="alert-top"><strong>${esc(c?.name||a.card_id)}</strong><span class="grade-chip ${a.grade}">${gradeNames[a.grade].replace(' · near mint','')}</span>${a.seen?'':'<span class="new-chip">New</span>'}</div><p class="alert-title">${esc(a.title)}</p><p class="alert-meta">${esc(c?.setName||'')} · #${esc(c?.numberLabel||'')} · ${esc(a.buying_option||'')}${a.seller?' · '+esc(a.seller):''} · found ${ago(a.found_at)}</p></div><div class="alert-price"><strong>${money(a.total)}</strong><small>${a.shipping==null?'+ shipping':a.shipping>0?'incl. '+money(a.shipping)+' shipping':'free shipping'}</small><small>Limit ${money(a.limit_price)}${under>0?` · <b class="pl up">${Math.round(under*100)}% under market</b>`:''}</small><div class="alert-actions"><a class="button primary" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" data-open-alert="${a.id}">View listing</a><button class="button" data-dismiss="${a.id}" aria-label="Dismiss alert for ${esc(a.title)}">Dismiss</button></div></div></article>`;}).join('')}</div>`
  :`<div class="empty-state"><strong>${s.ebay.configured?'No listings at your price yet.':'Alerts are ready when you are.'}</strong><p>${s.ebay.configured?'New listings of your watched cards at or under your limit will appear here.':'Add free eBay developer keys in the settings to scan new listings of your watched cards. Until then, use the saved searches below.'}</p></div>`}
  <div class="panel-sub"><h3>Your watched searches</h3><p class="sales-note">Each watched card and grade, the price an alert uses, and a ready-made eBay search (newest first, Buy It Now, up to your limit). These links work without API keys.</p>
  ${d.searches.length?`<div class="search-list">${d.searches.map(x=>{const c=cardById(x.card_id);return c?`<div class="search-row"><img src="${c.image}" alt="" loading="lazy"><span><b>${esc(c.name)}</b><small>${esc(c.setName)} · #${c.numberLabel} · ${gradeNames[x.grade]}</small></span><span class="search-limit">${x.limit!=null?money(x.limit)+'<small>'+esc(x.limit_source)+'</small>':'<small>No limit yet</small>'}</span><a class="button" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Search eBay</a></div>`:'';}).join('')}</div>`:'<p class="sales-note">Star a card in Browse to watch it.</p>'}</div>
 </section>
 <aside class="panel alerts-side" aria-label="Alert settings"><h2>Alert settings</h2>
  <form id="alert-settings" class="settings-form">
   <label class="toggle"><input type="checkbox" id="al-enabled" ${s.enabled?'checked':''}><span>Scan for new listings automatically</span></label>
   <label class="field">Check every<select id="al-interval">${[15,30,60,120,240].map(v=>`<option value="${v}" ${s.intervalMinutes===v?'selected':''}>${v<60?v+' minutes':v/60+' hour'+(v>60?'s':'')}</option>`).join('')}</select></label>
   <label class="toggle"><input type="checkbox" id="al-suggested" ${s.useSuggested?'checked':''}><span>Use the suggested target when I haven't set a limit</span></label>
   <label class="toggle"><input type="checkbox" id="al-auctions" ${s.includeAuctions?'checked':''}><span>Include auctions (current bid)</span></label>
   <fieldset><legend>eBay API keys ${s.ebay.configured?'<span class="ok-chip">Saved</span>':''}</legend><p class="field-hint">Create a free keyset at <a href="https://developer.ebay.com/my/keys" target="_blank" rel="noopener noreferrer">developer.ebay.com</a> and paste the Production App ID and Cert ID. They stay in your local database.</p>
    <label class="field">Client ID (App ID)<input id="al-client" type="text" autocomplete="off" spellcheck="false" placeholder="${s.ebay.clientId?esc(s.ebay.clientId):'YourName-PrimalWa-PRD-…'}"></label>
    <label class="field">Client Secret (Cert ID)<input id="al-secret" type="password" autocomplete="off" placeholder="${s.ebay.hasSecret?'Saved · leave blank to keep':'PRD-…'}"></label>${s.ebay.configured?'<button type="button" class="link-button" id="al-clear">Remove saved keys</button>':''}</fieldset>
   <fieldset><legend>Phone & desktop notifications</legend>
    <label class="field">ntfy topic <small>(free push app)</small><input id="al-ntfy" type="text" autocomplete="off" spellcheck="false" value="${esc(s.notify.ntfy)}" placeholder="e.g. primal-watch-7f3k"></label>
    <label class="field">Discord webhook<input id="al-discord" type="url" autocomplete="off" spellcheck="false" value="${esc(s.notify.discord)}" placeholder="https://discord.com/api/webhooks/…"></label>
    <div class="inline-actions"><button type="button" class="button" id="al-test">Send a test</button><button type="button" class="button" id="al-desktop" ${notifyPerm==='granted'||notifyPerm==='unsupported'?'disabled':''}>${notifyPerm==='granted'?'Desktop alerts on':notifyPerm==='denied'?'Desktop alerts blocked':'Allow desktop alerts'}</button></div></fieldset>
   <p class="form-error" id="al-error" role="alert" hidden></p>
   <button type="submit" class="button primary" id="al-save">Save settings</button>
  </form></aside></div>`;
 const fail=t=>{const e=$('#al-error');e.textContent=t;e.hidden=!t;};
 $('#alert-settings').onsubmit=async e=>{e.preventDefault();fail('');const body={enabled:$('#al-enabled').checked,intervalMinutes:Number($('#al-interval').value),useSuggested:$('#al-suggested').checked,includeAuctions:$('#al-auctions').checked,notify:{ntfy:$('#al-ntfy').value.trim(),discord:$('#al-discord').value.trim()}};
  const id=$('#al-client').value.trim(),secret=$('#al-secret').value.trim();if(id||secret)body.ebay={clientId:id||undefined,clientSecret:secret};if(id&&!secret&&!s.ebay.hasSecret)return fail('Add the Client Secret too.');if(!id&&secret&&!s.ebay.clientId)return fail('Add the Client ID too.');
  if(body.ebay&&!body.ebay.clientId)delete body.ebay.clientId;
  $('#al-save').disabled=true;try{await send('/api/alerts/settings','POST',body);toast('Alert settings saved.');await loadAlerts();}catch(err){fail(err.message);$('#al-save').disabled=false;}};
 if($('#al-clear'))$('#al-clear').onclick=async()=>{try{await send('/api/alerts/settings','POST',{enabled:false,ebay:{clear:true}});toast('eBay keys removed.');await loadAlerts();}catch(err){fail(err.message);}};
 $('#al-test').onclick=async()=>{try{const r=await send('/api/alerts/test','POST',{});toast(r.sent?'Test notification sent.':r.error||'Nothing was sent.');}catch(err){fail(err.message);}};
 $('#al-desktop').onclick=async()=>{if(typeof Notification==='undefined')return;await Notification.requestPermission();renderAlerts();};
 $('#alerts-scan').onclick=async()=>{state.alerts.busy=true;renderAlerts();try{const r=await send('/api/alerts/scan','POST',{});applyAlerts(r);toast(r.error?r.error:r.found?r.found+' new listing'+(r.found===1?'':'s')+' at your price.':'Checked '+r.checked+' watched card'+(r.checked===1?'':'s')+'. Nothing new at your price.');}catch(err){toast(err.message);}finally{state.alerts.busy=false;renderAlerts();}};
 $('#alerts-seen').onclick=async()=>{try{applyAlerts(await send('/api/alerts','PATCH',{all:'seen'}));}catch(err){toast(err.message);}};
 view.querySelectorAll('[data-dismiss]').forEach(b=>b.onclick=async()=>{try{applyAlerts(await send('/api/alerts','PATCH',{id:Number(b.dataset.dismiss),dismissed:true}));}catch(err){toast(err.message);}});
 view.querySelectorAll('[data-open-alert]').forEach(a=>a.addEventListener('click',()=>send('/api/alerts','PATCH',{id:Number(a.dataset.openAlert)}).then(r=>applyAlerts(r)).catch(()=>{})));
 wireImages();
}

// ---------- Top movers ----------
const MOVER_GRADES=['psa10','psa9','raw'],shortGrade=g=>gradeNames[g].replace(' · near mint',' NM');
const wholeMoney=v=>v>=100?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v):money(v);
async function loadMovers(period){
 if(state.movers.data[period])return;
 try{const r=await request('/api/movers?period='+period);state.movers.data[period]=r;state.movers.error=null;}catch(e){state.movers.error=e.message;}
 if(state.view==='movers')renderMovers();
}
function openCard(id,grade){
 const c=cardById(id);if(!c)return;
 state.view='browse';state.setId=c.setId;state.category='all';state.grade=grade;$('#grade').value=grade;state.query='';$('#search').value='';state.budget=false;$('#budget-filter').checked=false;
 updateView();select(id);
}
function renderMovers(){
 const view=$('#movers-view'),period=state.movers.period,d=state.movers.data[period],word=period==='week'?'week':'month';
 const checked=d?.checkedAt?new Date(d.checkedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):null;
 const head=`<section class="panel movers-head"><div><h2>Biggest price increases this ${word}</h2><p>${d?`The last ${d.current} days of matching sales compared with ${esc(d.baselineLabel)}${checked?' · sales checked '+checked:''}. `:''}Cards worth $25 or more, with at least 3 matching sales in both periods. Moves the data can't confirm are left out.</p></div><div class="segmented" role="group" aria-label="Period">${[['week','Week'],['month','Month']].map(([k,l])=>`<button data-period="${k}" aria-pressed="${period===k}" class="${period===k?'active':''}">${l}</button>`).join('')}</div></section>`;
 if(!d){view.innerHTML=head+(state.movers.error?`<div class="panel empty-state"><strong>Movers couldn't be loaded.</strong><p>${esc(state.movers.error)}</p><button class="button" id="movers-retry">Try again</button></div>`:'<div class="loading"><span class="spinner"></span>Finding this '+word+'\'s movers…</div>');}
 else view.innerHTML=head+`<div class="segmented mover-grades" role="group" aria-label="Grade">${MOVER_GRADES.map(g=>`<button data-mover-grade="${g}" aria-pressed="${state.movers.grade===g}" class="${state.movers.grade===g?'active':''}">${shortGrade(g)}</button>`).join('')}</div><div class="movers-grid">${MOVER_GRADES.map(g=>{const col=d.grades[g],list=col.movers;
  return `<section class="panel mover-col ${state.movers.grade===g?'':'off'}" aria-label="${gradeNames[g]} movers"><div class="panel-head"><div><h2><span class="grade-chip ${g}">${shortGrade(g)}</span> Top ${list.length||''}</h2><p>${col.qualified>list.length?'Top '+list.length+' of '+col.qualified+' rising cards that passed every check':col.qualified?'Every rising card that passed every check':'No reliable rises'}</p></div></div>
  ${list.length?`<ol class="mover-list">${list.map((m,i)=>{const c=cardById(m.card_id);if(!c)return '';return `<li><button class="mover-row" data-mover="${c.id}" data-grade="${g}" aria-label="${esc(c.name)}, ${esc(c.setName)}, ${gradeNames[g]}, up ${pct(m.change)} from ${money(m.from)} to ${money(m.to)}"><span class="mover-rank">${i+1}</span><img src="${c.image}" alt="" loading="lazy"><span class="mover-name"><b>${esc(c.name)}</b><small>${esc(c.setName)} · #${esc(c.numberLabel)}</small><small>${m.current.sales} sale${m.current.sales===1?'':'s'} vs ${m.baseline.sales} before</small></span><span class="mover-change"><b class="pl up"><span aria-hidden="true">▲</span> ${pct(m.change)}</b><small>${wholeMoney(m.from)} → ${wholeMoney(m.to)}</small></span></button></li>`;}).join('')}</ol>`:`<div class="chart-empty">No ${gradeNames[g]} card had enough reliable sales this ${word} to measure a rise.</div>`}
  <div class="panel-foot">${list.length&&list.length<20?`Only ${list.length} card${list.length===1?'':'s'} qualified this ${word}. `:''}${col.leftOut.length?'Left out as uncertain: '+col.leftOut.map(x=>x.count+' because '+esc(x.text)).join('; ')+'.':'No rising cards were left out as uncertain.'}</div></section>`;}).join('')}</div>
  <p class="sales-note movers-note">Percentages compare sold medians, not listings, and exclude shipping, fees and tax. A rise in recent sales is not a prediction. <button class="link-button" id="movers-method">How movers work</button></p>`;
 view.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{state.movers.period=b.dataset.period;renderMovers();loadMovers(state.movers.period);});
 view.querySelectorAll('[data-mover-grade]').forEach(b=>b.onclick=()=>{state.movers.grade=b.dataset.moverGrade;renderMovers();});
 view.querySelectorAll('[data-mover]').forEach(b=>b.onclick=()=>openCard(b.dataset.mover,b.dataset.grade));
 if($('#movers-retry'))$('#movers-retry').onclick=()=>{state.movers.error=null;renderMovers();loadMovers(period);};
 if($('#movers-method'))$('#movers-method').onclick=()=>$('#method-dialog').showModal();
 wireImages();
}

// ---------- Potential investments ----------
async function loadInvest(){
 if(state.invest.data)return;
 try{state.invest.data=await request('/api/investments');state.invest.error=null;}catch(e){state.invest.error=e.message;}
 if(state.view==='invest')renderInvest();
}
const pctWhole=v=>Math.round(v*100)+'%';
function signalView(s){
 if(s.type==='uptrend')return {cls:'up',label:'Steady uptrend',value:'+'+pctWhole(s.growth)+' / yr',detail:`${s.sales} matching sales over ${s.months} months. Recent median ${wholeMoney(s.now)} vs ${wholeMoney(s.then)} 6+ months ago.`};
 if(s.type==='recovering')return {cls:'rec',label:'Recovering from highs',value:pctWhole(s.drawdown)+' below '+monthLabel(s.peakMonth)+' high',detail:`Monthly guide peaked at ${wholeMoney(s.peak)} and is now ${wholeMoney(s.latest)}. Sales in the last 45 days are up ${pctWhole(s.rise)} on the 90 days before.`};
 return {cls:'cheap',label:'Cheap vs. similar cards',value:pctWhole(1-s.ratio)+' below',detail:`${esc(s.category)} cards of less in-demand characters in ${esc(s.setName)} sell for ${wholeMoney(s.typical)} (median of ${s.peers}).`};
}
function renderInvest(){
 const view=$('#invest-view'),d=state.invest.data,g=state.invest.grade;
 const checked=d?.checkedAt?new Date(d.checkedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):null;
 const head=`<section class="panel movers-head"><div><h2>Cards worth a closer look</h2><p>Each pick has a confident sold price of $25 or more, features a character in the top quarter for collector demand, and shows at least one signal in its own sales history. Built only from the sales in this app${checked?', checked '+checked:''}. Not investment advice.</p></div><div class="segmented" role="group" aria-label="Grade">${MOVER_GRADES.map(x=>`<button data-invest-grade="${x}" aria-pressed="${g===x}" class="${g===x?'active':''}">${shortGrade(x)}</button>`).join('')}</div></section>
 <div class="signal-key"><span class="signal up">Steady uptrend</span><span>A clear, consistent rise over the past year.</span><span class="signal rec">Recovering from highs</span><span>Well below a held high, with sales turning up.</span><span class="signal cheap">Cheap vs. similar cards</span><span>Below same-set cards of less popular characters.</span></div>`;
 if(!d){view.innerHTML=head+(state.invest.error?`<div class="panel empty-state"><strong>Investments couldn't be loaded.</strong><p>${esc(state.invest.error)}</p><button class="button" id="invest-retry">Try again</button></div>`:'<div class="loading"><span class="spinner"></span>Screening every card…</div>');}
 else{
  const col=d.grades[g],picks=col.picks;
  view.innerHTML=head+`<section class="panel invest-panel" aria-label="${gradeNames[g]} potential investments"><div class="panel-head"><div><h2><span class="grade-chip ${g}">${shortGrade(g)}</span> ${picks.length?picks.length+' pick'+(picks.length===1?'':'s'):'No picks'}</h2><p>${col.qualified} of ${col.screened} high-demand cards with a confident price met at least one signal.${col.qualified>picks.length?' Strongest shown, at most 3 per character.':''}</p></div></div>
  ${picks.length?`<div class="invest-list">${picks.map(p=>{const c=cardById(p.card_id);if(!c)return '';const dm=p.demand;return `<article class="invest-row"><button class="invest-card" data-invest="${c.id}" data-grade="${g}" aria-label="Open ${esc(c.name)} ${gradeNames[g]}"><img src="${c.image}" alt="" loading="lazy"><span><b>${esc(c.name)}</b><small>${esc(c.setName)} · #${esc(c.numberLabel)} · ${esc(c.category)}</small></span></button>
   <div class="invest-price"><strong>${money(p.price)}</strong><small>${esc(p.priceLabel)}</small></div>
   <div class="invest-why"><h3>Why it's listed</h3><p class="invest-thesis">${esc(p.thesis)}</p><ul class="invest-signals">${(p.checks||p.signals.map(x=>({type:x.type,hit:true}))).map(ch=>{const sig=p.signals.find(x=>x.type===ch.type);if(!sig)return `<li class="miss"><span class="check" aria-hidden="true">–</span><span class="signal-name">${esc(ch.label)}</span><b>Not met</b></li>`;const v=signalView(sig);return `<li class="hit"><span class="check" aria-hidden="true">✓</span><span class="signal ${v.cls}">${v.label}</span><b>${v.value}</b><small>${v.detail}</small></li>`;}).join('')}</ul></div>
   <div class="invest-demand"><span class="metric-label">${esc(dm.character)} demand</span><div class="demand-wrap"><strong>${dm.score}</strong><em>/ 100</em></div><div class="demand-bar"><span style="width:${dm.score}%"></span></div><small>Cards sell ~${dm.premium.toFixed(1)}× similar cards${dm.activity!=null?' · '+Math.round(dm.activity)+' sales per card in 6 months':''}</small></div></article>`;}).join('')}</div>`:`<div class="chart-empty tall">No ${gradeNames[g]} card met every rule in the current data. That's expected when the market is at or near its highs. Try another grade, or refresh sales.</div>`}
  <div class="panel-foot">Signals use matching sales only (raw: near mint). PSA 9 highs use PriceCharting's Grade 9 guide, which includes other graders. Past sales don't guarantee future prices. <button class="link-button" id="invest-method">How picks are chosen</button></div></section>`;
 }
 view.querySelectorAll('[data-invest-grade]').forEach(b=>b.onclick=()=>{state.invest.grade=b.dataset.investGrade;renderInvest();});
 view.querySelectorAll('[data-invest]').forEach(b=>b.onclick=()=>openCard(b.dataset.invest,b.dataset.grade));
 if($('#invest-retry'))$('#invest-retry').onclick=()=>{state.invest.error=null;renderInvest();loadInvest();};
 if($('#invest-method'))$('#invest-method').onclick=()=>$('#method-dialog').showModal();
 wireImages();
}

// ---------- Views ----------
const PAGES={
 invest:{eyebrow:'MARKET <span>INVESTMENTS</span>',title:'Potential investments',description:'High-demand cards whose sales history suggests a closer look.',crumb:'Market',name:'Investments'},
 movers:{eyebrow:'MARKET <span>MOVERS</span>',title:'Top movers',description:'Which cards rose the most in sold price, by grade.',crumb:'Market',name:'Top movers'},
 dex:{eyebrow:'YOUR COLLECTION <span>DEX</span>',title:'Your Dex',description:'Every card you own, what it is worth today, and how it has done since you bought it.',crumb:'Your workspace',name:'Dex'},
 alerts:{eyebrow:'WATCHLIST <span>ALERTS</span>',title:'Listing alerts',description:'Get told when a watched card is listed at or under your buy limit.',crumb:'Your workspace',name:'Alerts'},
};
function updateView(){
 const v=state.view,catalogView=v==='browse'||v==='watch';
 for(const name of ['browse','movers','invest','watch','dex','alerts']){const nav=$('#'+name+'-nav');nav.classList.toggle('active',v===name);nav.setAttribute('aria-current',v===name?'page':'false');}
 for(const s of ['#set-switcher','#summary-grid','#workspace','#heading-tools'])$(s).hidden=!catalogView;
 for(const name of Object.keys(PAGES))$('#'+name+'-view').hidden=v!==name;
 const set=activeSet(),era=activeSeries(),name=set?.name||(state.setId==='all'?'All sets':'All '+(era?.name||'')+' sets');
 const page=PAGES[v];
 if(page){
  $('#page-eyebrow').innerHTML=page.eyebrow;$('#page-title').textContent=page.title;$('#page-description').textContent=page.description;
  $('#breadcrumb-series').textContent=page.crumb;$('#breadcrumb-set').textContent=page.name;
  if(v==='dex'){loadDex().then(()=>{if(state.view==='dex')renderDex();});renderDex();}
  else if(v==='alerts'){if(!state.alerts.data)loadAlerts();renderAlerts();}
  else if(v==='movers'){renderMovers();loadMovers(state.movers.period);}
  else if(v==='invest'){renderInvest();loadInvest();}
  $('#'+v+'-view').scrollTop=0;
  return;
 }
 $('#page-eyebrow').innerHTML='SET EXPLORER <span id="set-code"></span>';
 $('#page-title').textContent=v==='watch'?'Your watchlist':set?name:state.setId==='all'?'Explore every set':'Explore the '+(era?.name||'')+' era';
 $('#page-description').textContent=v==='watch'?'Your saved cards and buy targets, across every set.':'A closer look at your next pickup.';
 $('#breadcrumb-series').textContent=state.setId==='all'?'All series':era?.label||'Series';$('#breadcrumb-set').textContent=name;$('#sidebar-set').textContent=name;
 $('#sidebar-year').textContent='English · '+(set?set.release.slice(0,4):state.setId==='all'?'2011–2016':era?.years||'');$('#series-symbol').textContent=state.setId==='all'?'ALL':era?.id||'XY';
 $('#set-code').textContent=set?.id.toUpperCase()||(state.setId==='all'?'ALL SETS':(era?.id||'')+' ERA');
 $('#set-select').value=state.setId;
 const xy=state.sets.filter(s=>s.series==='XY').length,bw=state.sets.filter(s=>s.series==='BW').length;
 $('#set-scope').textContent=v==='watch'?'Filter your saved cards by set':`${xy-1} XY expansions + promos · ${bw} Black & White sets`;
 const sourceSet=set||state.sets.find(s=>s.id===cardById(state.selected)?.setId);if(sourceSet){$('#set-market-source').href=sourceSet.marketSource;$('#set-checklist-source').href=sourceSet.checklistSource;}
 stats();
 const scope=scopedCards(),present=new Set(scope.map(c=>c.category));if(scope.some(c=>c.name.endsWith('EX')))present.add('Pokémon EX');
 if(!['chase','all'].includes(state.category)&&!present.has(state.category))state.category='all';
 document.querySelectorAll('[data-category]').forEach(b=>{b.hidden=!['chase','all'].includes(b.dataset.category)&&!present.has(b.dataset.category);b.classList.toggle('active',b.dataset.category===state.category);b.setAttribute('aria-pressed',String(b.dataset.category===state.category));});
 state.limit=60;$('#card-list').scrollTop=0;$('#detail').scrollTop=0;const visible=filteredCards();if(!visible.some(c=>c.id===state.selected))state.selected=visible[0]?.id||null;renderList();renderDetail();
 if(state.selected&&!state.full[state.selected]&&state.markets[state.selected]?.light)loadCard(state.selected);
}
function setOptions(){
 const opt=s=>`<option value="${s.id}">${esc(s.name)} · ${s.total} cards</option>`;
 return '<option value="all">All sets · 3 eras</option>'+state.series.map(e=>`<option value="era:${e.id}">All ${esc(e.name)} sets</option>`).join('')+state.series.map(e=>`<optgroup label="${esc(e.label)}">${state.sets.filter(s=>s.series===e.id).map(opt).join('')}</optgroup>`).join('');
}
$('#search').oninput=e=>{state.query=e.target.value.toLowerCase().trim();state.limit=60;$('#card-list').scrollTop=0;renderList();};
$('#grade').onchange=e=>{state.grade=e.target.value;updateView();};
$('#sort').onchange=e=>{state.sort=e.target.value;renderList();};
$('#budget-filter').onchange=e=>{state.budget=e.target.checked;renderList();};
document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;updateView();});
$('#browse-nav').onclick=()=>{state.view='browse';updateView();};$('#watch-nav').onclick=()=>{state.view='watch';state.setId='all';state.category='all';state.query='';state.budget=false;$('#search').value='';$('#budget-filter').checked=false;updateView();};
$('#dex-nav').onclick=()=>{state.view='dex';updateView();};$('#movers-nav').onclick=()=>{state.view='movers';updateView();};$('#invest-nav').onclick=()=>{state.view='invest';updateView();};$('#alerts-nav').onclick=()=>{state.view='alerts';updateView();};
$('#set-select').onchange=e=>{state.setId=e.target.value;state.category='all';state.query='';state.budget=false;$('#search').value='';$('#budget-filter').checked=false;updateView();};
$('#show-more').onclick=()=>{state.limit+=24;renderList();};$('#refresh-set').onclick=refreshSet;
$('#method-button').onclick=$('#sources-button').onclick=()=>$('#method-dialog').showModal();$('#close-method').onclick=()=>$('#method-dialog').close();
for(const id of ['#method-dialog','#dex-dialog'])$(id).onclick=e=>{if(e.target===$(id)){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
async function init(){
 try{const [catalog,watch]=await Promise.all([request('/api/catalog'),request('/api/watchlist').catch(e=>{error(e.message);return {watchlist:[]};})]);
  state.sets=catalog.sets;state.series=catalog.series||[{id:'XY',name:'XY',label:'XY Series',years:'2014–2016'}];state.cards=catalog.cards;
  $('#set-select').innerHTML=setOptions();$('#set-select').value=state.setId;
  state.markets=Object.fromEntries(Object.entries(catalog.markets).map(([id,m])=>[id,expandMarket(m)]));state.watch=watch.watchlist;
  const checked=Object.values(catalog.markets).map(m=>m?.research?.checkedAt||m?.observedAt).filter(Boolean).sort().at(-1);
  updateView();$('#snapshot-label').textContent=checked?'Sales checked '+new Date(checked).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Dated source snapshots';
  loadDex().then(()=>{stats();renderList();if(state.view==='dex')renderDex();});
  loadAlerts(true);setInterval(()=>{if(document.visibilityState!=='hidden')loadAlerts(true);},60000);
 }catch(e){error(e.message);$('#card-list').innerHTML='<div class="empty-state"><strong>Couldn’t load the set.</strong><p>Keep this page open and try again.</p><button class="button" id="retry-load">Try again</button></div>';$('#retry-load').onclick=init;}
}
init();

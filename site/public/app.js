import {manualSearchQuery,manualSearchUrl} from '/ebay-links.mjs';
import {analyze as computeAnalysis,gradeNames,trendProjection} from '/analysis.mjs';
import {summarize,portfolioSeries,priceHistory,entryValue,MIN_PURCHASE_DATE,allocation,concentration,whatIf,versusMarket} from '/portfolio.mjs';
import {normalizeCosts,costSummary,netReturn,maxBuyPrice,netProceeds,saleFee,DEFAULT_COSTS,MARKET_PRESETS} from '/investment-costs.mjs';
const analysisCache=new WeakMap();
const analyze=(market,grade)=>{if(!market)return computeAnalysis(market,grade);const day=Math.floor(Date.now()/86400000);let cache=analysisCache.get(market);if(!cache||cache.day!==day){cache={day,grades:{}};analysisCache.set(market,cache);}return cache.grades[grade]??=(computeAnalysis(market,grade));};
const $=s=>document.querySelector(s);
// Inline icons come from the sprite at the top of index.html.
const icon=(name,cls='icon')=>`<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
const APPEARANCES={dark:{label:'Terminal',description:'Near-black panels with green and red market signals.',color:'#0b0d0c'},light:{label:'Light',description:'The terminal layout on a bright background.',color:'#f3f5f4'},soft:{label:'Soft contrast',description:'Gentler greys and muted accents with less visual contrast.',color:'#e8ebe9'}};
const THEME_KEY='futuresight-theme',OLD_THEME_KEY='primal-watch-theme-v2';
function savedAppearance(){try{const value=typeof localStorage==='undefined'?null:(localStorage.getItem(THEME_KEY)||localStorage.getItem(OLD_THEME_KEY));return value in APPEARANCES?value:'dark';}catch{return 'dark';}}
function applyAppearance(value,persist=true){const theme=value in APPEARANCES?value:'dark';if(document.documentElement){if(theme==='dark')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=theme;}const meta=$('meta[name="theme-color"]');if(meta)meta.content=APPEARANCES[theme].color;if(persist)try{localStorage.setItem(THEME_KEY,theme);}catch{}return theme;}
const money=v=>v==null?'-':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
const compact=v=>v==null?'-':Math.abs(v)>=1000?'$'+(v/1000).toFixed(Math.abs(v)>=10000?0:1)+'k':'$'+Math.round(v);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const monthLabel=ym=>new Date(ym+'-15T12:00:00Z').toLocaleDateString('en-US',{month:'short',year:'numeric'});
const ago=iso=>{const m=Math.round((Date.now()-Date.parse(iso))/60000);return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' d ago';};
const signed=v=>v==null?'—':(v>0?'+':v<0?'−':'')+money(Math.abs(v));
const pct=v=>v==null?'':(v>0?'+':v<0?'−':'')+Math.abs(v*100).toFixed(1)+'%';
const GRADE_FROM={0:'raw',9:'psa9',10:'psa10'};
// Japanese cards and sets show their English names. Settings can add the original Japanese text.
const JA_TEXT_KEY='futuresight-japanese-text';
function savedJapaneseText(){try{return localStorage.getItem(JA_TEXT_KEY)==='on';}catch{return false;}}
const state={showJapanese:savedJapaneseText(),sets:[],series:[],marketSeries:[],setId:'all',cards:[],markets:{},full:{},watch:[],grade:'psa9',category:'all',query:'',sort:'featured',view:'browse',selected:null,limit:18,expanded:false,focus:false,eras:[],langs:['en','ja'],detailLang:null,detailAlt:null,detailGrade:null,marketLang:'en',filters:{min:null,max:null,activity:0,invest:0,research:0},filtersOpen:false,scores:null,scoreDetail:{},scoreError:null,research:null,investDetail:{},asks:{},costs:savedCosts(),ticker:null,appearance:savedAppearance(),
 dex:{entries:[],markets:{},loaded:false,sort:'value',range:'all',tab:'alloc',alloc:'char',what:{dim:'market',key:'',move:-.2},vsRange:'1y',info:null},alerts:{data:null,known:null,busy:false},signals:null,cardMetrics:{},cardHistory:{},cardChart:{view:'price',grade:null,range:'1y',era:false},listings:{},grading:null,market:{tab:'overview',grade:'psa10',weight:'eq',data:{},error:null,index:null,period:'ret_30d',sorts:{},query:'',minCards:5,limit:100,memberLimit:100,memberSort:{key:'price',dir:-1},range:'1y',era:null,lifeSets:{},charView:'board',heatBy:'set'},movers:{period:'week',grade:'psa10',data:{},error:null},invest:{grade:'psa10',data:{},error:null}};
let toastTimer,selectionController;
// Crashes in the page are sent to the server, which forwards them to Sentry only when SENTRY_DSN is set. At most 5 per page load.
let crashReports=0;
function reportCrash(problem){if(crashReports>=5)return;crashReports++;try{const e=problem instanceof Error?problem:new Error(String(problem));fetch('/api/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:(e.message||'Unknown error').slice(0,500),stack:(e.stack||'').slice(0,4000)}),keepalive:true}).catch(()=>{});}catch{}}
if(typeof addEventListener==='function'){addEventListener('error',ev=>reportCrash(ev.error||ev.message));addEventListener('unhandledrejection',ev=>reportCrash(ev.reason));}
async function request(url,options){
 const r=await fetch(url,{...options,credentials:'same-origin',redirect:'manual'});
 if(r.type==='opaqueredirect')throw new Error('The connection to FutureSight was interrupted. Reload this page.');
 if(!r.headers.get('content-type')?.includes('application/json')){
  const err=new Error(r.status===401?'Your sign-in has ended. Reload this page and sign in again.':`The server returned HTTP ${r.status} without the requested data. Please reload and try again.`);err.status=r.status;throw err;
 }
 const b=await r.json();
 if(r.status===401&&b.signedOut)location.replace('/login');
 if(!r.ok){const err=new Error(b.error||'Something went wrong. Please try again.');err.status=r.status;throw err;}
 return b;
}
const send=(url,method,body)=>request(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function error(text){$('#error-banner').textContent=text;$('#error-banner').hidden=!text;}
// The catalog sends compact markets; expand them into the shape the analysis expects.
function expandMarket(m){if(!m||!Array.isArray(m.s))return m;const {s,...rest}=m;return {...rest,light:true,sales:s.map(([d,price,g,condition],i)=>({id:i,date:d,price,grade:GRADE_FROM[g],condition}))};}
const matchingWatch=(id,grade=state.grade)=>state.watch.find(w=>w.card_id===id && w.grade===grade);
const cardById=id=>state.cards.find(c=>c.id===id);
const activeSet=()=>state.sets.find(s=>s.id===state.setId);
// Investment scores arrive as {card_id:[psa10,psa9,raw]}; breakdowns come with each card's market.
const SCORE_INDEX={psa10:0,psa9:1,raw:2};
const scoreOf=(id,grade=state.grade)=>state.scores?.[id]?.[SCORE_INDEX[grade]]??null;
const ratingOf=v=>v==null?null:v>=80?'Strong':v>=65?'Good':v>=50?'Fair':v>=35?'Weak':'Poor';
const ratingClass=v=>v==null?'none':v>=80?'strong':v>=65?'good':v>=50?'fair':'weak';
const activeEras=()=>state.setId.startsWith('era:')?[state.setId.slice(4)]:state.setId==='all'?state.eras:[activeSet()?.series].filter(Boolean);
const filterCount=()=>{const f=state.filters;return (f.min!=null)+(f.max!=null)+(f.activity>0)+(f.invest>0)+(f.research>0)+(state.setId==='all'&&state.eras.length<state.series.length)+(state.langs.length<LANGS.length);};
const activeSeries=()=>state.setId.startsWith('era:')?state.series.find(s=>s.id===state.setId.slice(4)):state.series.find(s=>s.id===activeSet()?.series);
const LANGS=[{id:'en',label:'English'},{id:'ja',label:'Japanese'}];
const langOf=c=>c.lang||'en';
const inScope=c=>state.setId!=='all'&&!state.setId.startsWith('era:')?c.setId===state.setId:state.langs.includes(langOf(c))&&(state.setId==='all'?(!state.eras.length||state.eras.includes(c.series)):c.series===state.setId.slice(4));
const scopedCards=()=>state.cards.filter(c=>inScope(c)&&(c.eligible||state.view==='watch'&&matchingWatch(c.id)));
const owned=id=>state.dex.entries.filter(e=>e.card_id===id&&e.sold_price==null);
function stats(){
 const scope=scopedCards(),priced=scope.filter(c=>analyze(state.markets[c.id],state.grade).current!=null).length;
 $('#watch-count').textContent=state.watch.length;$('#summary-watch').innerHTML=state.watch.length+' <small>cards & grades saved</small>';
 $('#dex-count').textContent=state.dex.entries.filter(e=>e.sold_price==null).reduce((n,e)=>n+(e.quantity||1),0);
 const wide=state.setId==='all'||state.setId.startsWith('era:');
 $('#set-count').innerHTML=scope.length+' <small>'+(wide?new Set(scope.map(c=>c.setId)).size+' sets · rare cards':'EX, full art, secret & other rares')+'</small>';
 $('#set-count-label').textContent=wide?'Rare cards in view':'Rare cards in this set';
 $('#price-count').innerHTML=priced+' <small>with '+gradeNames[state.grade]+' prices</small>';
 $('#coverage-note').textContent=priced===0&&state.grade!=='raw'?'No prices are loaded for this grade in this set. Choose Raw to see available reference guides.':priced+' of '+scope.length+' cards have a price for this grade. Guides are estimates; targets need matching sales.';
}
const priority=['xy5-147','xy5-55','xy5-156','xy5-151'];
const cardNumber=c=>{const n=String(c.number).toUpperCase(),special=n.match(/^([A-Z]+)(\d+)/);return special?1000+Number(special[2]):Number.parseInt(n,10);};
function filteredCards(){
 let list=scopedCards().filter(c=>(state.view!=='watch'||matchingWatch(c.id))&&(state.category==='all'||state.category==='chase'&&c.chase||(state.category==='Pokémon EX'?c.name.endsWith('EX'):c.category===state.category))&&(!state.query||(c.name+' '+(c.nameJa||'')+' '+c.numberLabel+' '+c.setName+' '+c.setId+(c.japanese?' japanese jp':'')).toLowerCase().includes(state.query)));
 const analyses=new Map(),get=c=>{if(!analyses.has(c.id))analyses.set(c.id,analyze(state.markets[c.id],state.grade));return analyses.get(c.id);};
 const f=state.filters;
 if(f.min!=null||f.max!=null)list=list.filter(c=>{const p=get(c).current;return p!=null&&(f.min==null||p>=f.min)&&(f.max==null||p<=f.max);});
 if(f.activity>0)list=list.filter(c=>(get(c).score??-1)>=f.activity);
 if(f.invest>0)list=list.filter(c=>(scoreOf(c.id)??-1)>=f.invest);
 if(f.research>0)list=list.filter(c=>(researchRankOf(c.id)??-1)>=f.research);
 const featured=c=>state.setId==='xy5'&&priority.includes(c.id)?priority.indexOf(c.id):get(c).current!=null?10:100;
 const setOrder=c=>state.sets.findIndex(s=>s.id===c.setId);
 return list.sort((a,b)=>state.sort==='number'?(setOrder(a)-setOrder(b))||cardNumber(a)-cardNumber(b):state.sort==='price'?(get(b).current??-1)-(get(a).current??-1):state.sort==='activity'?(get(b).score??-1)-(get(a).score??-1):state.sort==='invest'?(scoreOf(b.id)??-1)-(scoreOf(a.id)??-1)||(get(b).current??-1)-(get(a).current??-1):state.sort==='research'?(researchRankOf(b.id)??-1)-(researchRankOf(a.id)??-1)||(get(b).current??-1)-(get(a).current??-1):featured(a)-featured(b)||(state.setId!=='xy5'?(get(b).current??-1)-(get(a).current??-1):0)||cardNumber(a)-cardNumber(b));
}
function renderList(){
 const list=filteredCards(),res=researchColumn();if($('#score-head')){$('#score-head').textContent=res?'RES':'INV';$('#score-head').title=res?'Research rank out of 100 (shadow, unvalidated)':'Investment score out of 100';}$('#result-count').textContent=`${list.length} ${state.view==='watch'?'watched entries':'cards'} · ${gradeNames[state.grade]}`;renderFilterChips();
 $('#show-more').hidden=list.length<=state.limit;
 if(!list.length){$('#card-list').innerHTML=`<div class="empty-state"><strong>${state.view==='watch'&&!state.watch.length?'Your next pickup starts here.':'No cards match.'}</strong><p>${state.view==='watch'&&!state.watch.length?'Tap the star beside a card to save it with its grade and buy target.':(state.filters.invest>0&&!state.scores?(state.scoreError?scoreProblem()+' Clear the score filter to see cards without it.':'Investment scores are still loading.'):state.filters.research>0&&!state.research?(state.scoreError?scoreProblem()+' Clear the research filter to see cards without it.':'Research ranks are still loading.'):state.filters.research>0&&researchMissingFor().length?'Research ranks cover '+researchMissingNote()+'. Clear the research filter to see them.':'Try another grade, search, category, or loosen the filters.')}</p><button class="button primary" id="clear-filters">${state.view==='watch'?'Browse cards':'Clear filters'}</button></div>`;$('#clear-filters').onclick=()=>{state.view=state.view==='watch'&&!state.watch.length?'browse':state.view;state.category='all';state.query='';$('#search').value='';resetFilters(false);updateView();};return;}
 $('#card-list').innerHTML=list.slice(0,state.limit).map(c=>{
  const a=analyze(state.markets[c.id],state.grade),w=matchingWatch(c.id),target=w?.target??a.target,own=owned(c.id).length;
  return `<div class="card-row ${c.id===state.selected?'selected':''}" data-id="${c.id}"><button class="card-open" data-open="${c.id}" aria-label="View ${esc(c.name)} ${numberCaption(c)}" ${c.id===state.selected?'aria-current="true"':''}><img class="card-thumb" src="${c.image}"${c.imageAlt?` data-alt="${c.imageAlt}"`:''} alt="" loading="lazy"><span><span class="card-name">${esc(c.name)}${c.japanese?'<span class="lang-tag" title="Japanese card">JP</span>':''}${own?'<span class="owned-dot" title="In your Dex">●</span>':''}</span><span class="card-sub">${numberCaption(c)} · ${esc(c.category)}<span class="row-set">${esc(c.setName)}</span></span></span></button><div class="price-cell">${money(a.current)}<small>${a.priceSource==='sales'?'Sold median':a.current?'Source guide':c.japanese?'JP prices soon':'Awaiting source'}</small></div><div class="target-cell ${target==null?'missing':''}">${target==null?'Needs sales':money(target)}${w?.target!=null?'<small class="card-sub">Your target</small>':''}</div><div class="score-cell">${researchColumn()?researchPill(c.id):`<span class="score-pill ${ratingClass(scoreOf(c.id))}" title="${scoreOf(c.id)==null?'No investment score: not enough recent matching sales':'Investment score '+scoreOf(c.id)+' / 100 · '+ratingOf(scoreOf(c.id))}">${scoreOf(c.id)??'—'}</span>`}</div><button class="star-button ${w?'saved':''}" data-watch="${c.id}" aria-label="${w?'Remove':'Add'} ${esc(c.name)} ${gradeNames[state.grade]} ${w?'from':'to'} watchlist" aria-pressed="${!!w}">${w?icon('star-fill'):icon('star')}</button></div>`;
 }).join('');
 $('#card-list').querySelectorAll('[data-open]').forEach(el=>el.onclick=()=>select(el.dataset.open));
 $('#card-list').querySelectorAll('.card-row').forEach(el=>el.onclick=e=>{if(!e.target.closest('button'))select(el.dataset.id);});
 $('#card-list').querySelectorAll('[data-watch]').forEach(el=>el.onclick=()=>toggleWatch(el.dataset.watch,el));
 wireImages();
}
// A missing image on images.pokemontcg.io comes back as a 640×892 card-back placeholder rather
// than an error, so treat that size from that host as missing too, then try the alternate source.
function wireImages(){document.querySelectorAll('img').forEach(im=>{
 const fail=()=>{const alt=im.dataset.alt;if(alt&&im.getAttribute('src')!==alt){im.removeAttribute('data-alt');im.src=alt;return;}im.removeAttribute('src');im.style.opacity='.45';im.alt='Card image unavailable';im.onerror=im.onload=null;};
 const placeholder=()=>/images\.pokemontcg\.io/.test(im.currentSrc||im.src)&&im.naturalWidth===640&&im.naturalHeight===892;
 im.onerror=fail;im.onload=()=>{if(placeholder())fail();};if(im.complete&&im.naturalWidth&&placeholder())fail();
});}
// Observed change in the source's monthly price over the past year: a fact, not a forecast.
function pastChange(history){
 if(!history?.length)return '';const last=history.at(-1),[y,mo]=last[0].split('-').map(Number),target=`${y-1}-${String(mo).padStart(2,'0')}`;
 const then=history.findLast(([ym])=>ym<=target);if(!then||!(then[1]>0))return '';
 const pct=Math.round((last[1]/then[1]-1)*100);return `<p class="past-change">Past 12 months (source price): <b class="${pct>0?'up':pct<0?'down':''}">${pct>0?'+':pct<0?'−':''}${Math.abs(pct)}%</b></p>`;
}
function chart(a,wide=false,history=[]){
 // Every matching sale from the past year (not just the newest few), plus the source's monthly
 // price line for context, because source pages only list the most recent sold rows.
 const DAYMS=86400000,now=Date.now(),yearAgo=now-365*DAYMS;
 const all=a.comparable.filter(s=>s.price>0&&Date.parse(s.date)>=yearAgo).sort((x,y)=>x.date.localeCompare(y.date));
 const step=all.length>160?all.length/160:1,rows=step>1?Array.from({length:160},(_,i)=>all[Math.min(all.length-1,Math.round(i*step))]):all;
 const line=(history||[]).map(([ym,v])=>({t:Math.min(now,Date.parse(ym+'-15')),v})).filter(p=>p.v>0&&p.t>=yearAgo-31*DAYMS&&p.t<=now+31*DAYMS);
 if(rows.length<2&&line.length<2)return `<div class="chart-empty">${rows.length?'Only one matching sale in the last year.':'No matching sales in the last year.'}</div>`;
 const vals=[...rows.map(r=>r.price),...line.map(p=>p.v)],min=Math.min(...vals)*.85,max=Math.max(...vals)*1.12,w=wide?640:290,h=wide?220:130,pad=wide?40:28,ph=h-45;
 const times=[...rows.map(r=>Date.parse(r.date)),...line.map(p=>p.t)],start=Math.min(...times),end=Math.max(...times);
 const X=t=>pad+(t-start)/(end-start||1)*(w-pad-8),Y=v=>10+(max-v)/(max-min||1)*ph,day=t=>new Date(t).toISOString().slice(0,10);
 const grid=[0,.5,1].map(t=>{const v=min+(max-min)*t,y=10+(1-t)*ph;return `<line x1="${pad}" y1="${y}" x2="${w-8}" y2="${y}" class="grid" stroke-dasharray="3 4"/><text x="0" y="${y+3}" class="tick" font-size="9">${v>=1000?(v/1000).toFixed(1)+'k':Math.round(v)}</text>`;}).join('');
 const path=line.length>=2?`<polyline class="guide-line" points="${line.map(p=>X(p.t).toFixed(1)+','+Y(p.v).toFixed(1)).join(' ')}"><title>Monthly source price</title></polyline>`:'';
 const label=`${all.length} reported ${gradeNames[viewGrade()]} sale prices plotted by date${path?', with the monthly source price line':''}`;
 return `<svg class="sale-chart${wide?' wide':''}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${grid}${path}${rows.map(r=>`<circle cx="${X(Date.parse(r.date)).toFixed(1)}" cy="${Y(r.price).toFixed(1)}" r="${rows.length>60?2.6:3.5}" class="dot"><title>${date(r.date)}: ${money(r.price)}</title></circle>`).join('')}<text x="${pad}" y="${h-11}" class="tick" font-size="9">${date(day(start))}</text><text x="${w-8}" y="${h-11}" class="tick" font-size="9" text-anchor="end">${date(day(end))}</text></svg>${path?`<div class="chart-legend small"><span><i class="dot-key"></i>Sold (${all.length})</span><span><i class="dashed"></i>Monthly source price</span></div>`:''}`;
}
// Line charts with a crosshair and tooltip. Each series: {label, color, dash, points:[[label, value]], area}.
const C={accent:'var(--accent)',cost:'var(--warn)'};
const charts=new Map();let chartSeq=0;
function lineChart({series,height=170,width=560,label,format=money,tick=compact,reference}){
 const all=series.flatMap(s=>s.points.map(p=>p[1])).concat(reference?[reference.value]:[]).filter(v=>v!=null);
 const n=Math.max(...series.map(s=>s.points.length));
 if(n<2||!all.length)return '<div class="chart-empty">Not enough price history to chart yet.</div>';
 const narrow=typeof window!=='undefined'&&window.innerWidth<640,id='chart'+(++chartSeq),w=narrow?Math.max(300,Math.min(width,window.innerWidth-40)):width,h=narrow?Math.round(height*.9):height,left=46,right=series.length>1?56:16,top=12,bottom=24;
 let lo=Math.min(...all),hi=Math.max(...all);if(lo===hi){lo*=.9;hi*=1.1;}const padY=(hi-lo)*.12;lo=Math.max(0,lo-padY);hi+=padY;
 const X=i=>left+i*(w-left-right)/(n-1),Y=v=>top+(hi-v)/(hi-lo||1)*(h-top-bottom);
 const ticks=[0,.5,1].map(t=>lo+(hi-lo)*t);
 const grid=ticks.map(v=>`<line x1="${left}" x2="${w-right}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="grid"/><text x="${left-8}" y="${(Y(v)+3).toFixed(1)}" text-anchor="end" class="tick">${tick(v)}</text>`).join('');
 const labels=series[0].points;const xt=[0,Math.floor((n-1)/2),n-1].map(i=>`<text x="${X(i).toFixed(1)}" y="${h-6}" text-anchor="${i===0?'start':i===n-1?'end':'middle'}" class="tick">${esc(labels[i]?.[2]||labels[i]?.[0]||'')}</text>`).join('');
 const paths=series.map(s=>{const pts=s.points.map((p,i)=>p[1]==null?null:[X(i),Y(p[1])]).filter(Boolean);if(!pts.length)return '';const d='M'+pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join('L');
  const area=s.area?`<path d="${d}L${pts.at(-1)[0].toFixed(1)},${(h-bottom).toFixed(1)}L${pts[0][0].toFixed(1)},${(h-bottom).toFixed(1)}Z" style="fill:${s.color}" opacity=".12"/>`:'';
  const end=pts.at(-1),direct=series.length>1?`<text x="${(end[0]+6).toFixed(1)}" y="${(end[1]+4).toFixed(1)}" class="direct" fill="currentColor">${esc(s.label)}</text>`:'';
  return area+`<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${s.dash?'stroke-dasharray="5 4"':''}/>`+direct;}).join('');
 const ref=reference?`<line x1="${left}" x2="${w-right}" y1="${Y(reference.value).toFixed(1)}" y2="${Y(reference.value).toFixed(1)}" style="stroke:${reference.color}" stroke-width="2" stroke-dasharray="5 4"/><text x="${w-right}" y="${(Y(reference.value)-5).toFixed(1)}" text-anchor="end" class="direct" fill="currentColor">${esc(reference.label)}</text>`:'';
 const marks=(reference?.markIndex!=null)?`<circle cx="${X(reference.markIndex).toFixed(1)}" cy="${Y(series[0].points[reference.markIndex]?.[1]??reference.value).toFixed(1)}" r="4.5" style="fill:${reference.color}" class="ring" stroke-width="2"/>`:'';
 if(charts.size>40)charts.delete(charts.keys().next().value);charts.set(id,{series,n,X,Y,format,left,right,w,h,top,bottom});
 const legend=series.length>1?`<div class="chart-legend">${series.map(s=>`<span><i style="background:${s.color}" class="${s.dash?'dashed':''}"></i>${esc(s.label)}</span>`).join('')}</div>`:'';
 return `${legend}<div class="line-chart" data-chart="${id}"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${grid}${xt}${ref}${paths}${marks}<line class="crosshair" x1="0" x2="0" y1="${top}" y2="${h-bottom}" visibility="hidden"/><g class="hover-dots"></g><rect class="hit" x="${left}" y="0" width="${w-left-right}" height="${h}" fill="transparent"/></svg><div class="chart-tip" hidden></div></div>`;
}
function wireCharts(root=document){
 root.querySelectorAll('[data-chart]').forEach(el=>{const m=charts.get(el.dataset.chart);if(!m)return;if(m.time){wireTimeChart(el,m);return;}const svg=el.querySelector('svg'),tip=el.querySelector('.chart-tip'),cross=svg.querySelector('.crosshair'),dots=svg.querySelector('.hover-dots');
  const show=evt=>{const r=svg.getBoundingClientRect(),sx=(evt.clientX-r.left)*m.w/r.width;let i=Math.round((sx-m.left)/((m.w-m.left-m.right)/(m.n-1)));i=Math.max(0,Math.min(m.n-1,i));const x=m.X(i);
   cross.setAttribute('x1',x);cross.setAttribute('x2',x);cross.setAttribute('visibility','visible');
   dots.innerHTML=m.series.map(s=>s.points[i]?.[1]==null?'':`<circle cx="${x}" cy="${m.Y(s.points[i][1])}" r="4" style="fill:${s.color}" class="ring" stroke-width="2"/>`).join('');
   const p=m.series[0].points[i];tip.innerHTML=`<strong>${esc(p?.[2]||p?.[0]||'')}</strong>`+m.series.map(s=>s.points[i]?.[1]==null?'':`<span><i style="background:${s.color}"></i>${esc(s.label)} <b>${m.format(s.points[i][1])}</b></span>`).join('');
   tip.hidden=false;const px=x/m.w*r.width;tip.style.left=Math.min(Math.max(px,70),r.width-70)+'px';};
  const hide=()=>{cross.setAttribute('visibility','hidden');dots.innerHTML='';tip.hidden=true;};
  svg.onpointermove=show;svg.onpointerdown=show;svg.onpointerleave=hide;});
}

// Charts on a time axis: lines of [t (ms), value] points, optional monthly bars along the bottom on their
// own scale, and dated markers. Hover shows each line's latest value at that date.
function timeChart({series,bars=null,markers=[],height=230,width=720,label,format=money,tick=compact,barLabel='Sales'}){
 const pts=series.flatMap(s=>s.points).filter(p=>p[1]!=null);
 if(pts.length<2)return '<div class="chart-empty">Not enough history to chart yet.</div>';
 const narrow=typeof window!=='undefined'&&window.innerWidth<640,id='chart'+(++chartSeq),w=narrow?Math.max(300,Math.min(width,window.innerWidth-40)):width,h=narrow?Math.round(height*.9):height;
 const left=46,right=series.length>1?64:16,top=16,bottom=24,barH=bars?.some(b=>b[1]>0)?Math.round((h-top-bottom)*.2):0,plotB=h-bottom-(barH?barH+6:0);
 const stamps=[...pts.map(p=>p[0]),...(bars||[]).map(b=>b[0])],t0=Math.min(...stamps),t1=Math.max(...stamps);
 let lo=Math.min(...pts.map(p=>p[1])),hi=Math.max(...pts.map(p=>p[1]));if(lo===hi){lo*=.9;hi*=1.1;}const padY=(hi-lo)*.1;lo=Math.max(0,lo-padY);hi+=padY;
 const X=t=>left+(t-t0)/(t1-t0||1)*(w-left-right),Y=v=>top+(hi-v)/(hi-lo||1)*(plotB-top);
 const grid=[0,.5,1].map(f=>{const v=lo+(hi-lo)*f;return `<line x1="${left}" x2="${w-right}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="grid"/><text x="${left-8}" y="${(Y(v)+3).toFixed(1)}" text-anchor="end" class="tick">${tick(v)}</text>`;}).join('');
 const day=t=>new Date(t).toISOString().slice(0,10),xt=[t0,(t0+t1)/2,t1].map((t,i)=>`<text x="${X(t).toFixed(1)}" y="${h-6}" text-anchor="${['start','middle','end'][i]}" class="tick">${date(day(t))}</text>`).join('');
 const maxBar=barH?Math.max(...bars.map(b=>b[1])):0,bw=Math.max(2,(w-left-right)*26*86400000/(t1-t0||1));
 const barSvg=barH?bars.filter(b=>b[1]>0).map(b=>{const bh=Math.max(1.5,b[1]/maxBar*barH);return `<rect class="vol-bar" x="${(X(b[0])-bw/2).toFixed(1)}" y="${(h-bottom-bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}"><title>${esc(barLabel)} ${monthLabel(day(b[0]).slice(0,7))}: ${b[1]}</title></rect>`;}).join(''):'';
 const shown=markers.filter(k=>k.t>=t0&&k.t<=t1),markSvg=shown.map((k,i)=>`<line class="marker ${k.kind||''}" x1="${X(k.t).toFixed(1)}" x2="${X(k.t).toFixed(1)}" y1="${top-4}" y2="${plotB}"/><text class="marker-label" x="${(X(k.t)+3).toFixed(1)}" y="${top+6+(i%3)*11}">${esc(k.label)}</text>`).join('');
 const paths=series.map(s=>{const p=s.points.filter(x=>x[1]!=null);if(!p.length)return '';const d='M'+p.map(x=>X(x[0]).toFixed(1)+','+Y(x[1]).toFixed(1)).join('L');
  const area=s.area&&p.length>1?`<path d="${d}L${X(p.at(-1)[0]).toFixed(1)},${plotB}L${X(p[0][0]).toFixed(1)},${plotB}Z" style="fill:${s.color}" opacity=".12"/>`:'';
  const end=p.at(-1),direct=series.length>1?`<text x="${(X(end[0])+6).toFixed(1)}" y="${(Y(end[1])+4).toFixed(1)}" class="direct" fill="currentColor">${esc(s.short||s.label)}</text>`:'';
  return area+`<path d="${d}" fill="none" style="stroke:${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${s.dash?'stroke-dasharray="5 4"':''}/>`+direct;}).join('');
 if(charts.size>40)charts.delete(charts.keys().next().value);charts.set(id,{time:true,series,bars,X,Y,t0,t1,format,left,right,w,h,top,bottom:h-plotB,barLabel});
 const legend=series.length>1||barH?`<div class="chart-legend">${series.map(s=>`<span><i style="background:${s.color}" class="${s.dash?'dashed':''}"></i>${esc(s.label)}</span>`).join('')}${barH?`<span><i class="bar-key"></i>${esc(barLabel)} a month</span>`:''}</div>`:'';
 return `${legend}<div class="line-chart" data-chart="${id}"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${grid}${xt}${barSvg}${markSvg}${paths}<line class="crosshair" x1="0" x2="0" y1="${top}" y2="${plotB}" visibility="hidden"/><g class="hover-dots"></g><rect class="hit" x="${left}" y="0" width="${w-left-right}" height="${h}" fill="transparent"/></svg><div class="chart-tip" hidden></div></div>`;
}
// The newest point at or before t (points sorted by time).
function pointAt(points,t){let lo=0,hi=points.length-1,at=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(points[mid][0]<=t){at=mid;lo=mid+1;}else hi=mid-1;}return at<0?null:points[at];}
function wireTimeChart(el,m){
 const svg=el.querySelector('svg'),tip=el.querySelector('.chart-tip'),cross=svg.querySelector('.crosshair'),dots=svg.querySelector('.hover-dots');
 const all=[...new Set(m.series.flatMap(s=>s.points.filter(p=>p[1]!=null).map(p=>p[0])))].sort((a,b)=>a-b);
 const show=evt=>{const r=svg.getBoundingClientRect(),sx=(evt.clientX-r.left)*m.w/r.width,t=m.t0+(sx-m.left)/(m.w-m.left-m.right)*(m.t1-m.t0);
  let best=all[0];for(const x of all)if(Math.abs(x-t)<Math.abs(best-t))best=x;const x=m.X(best);
  cross.setAttribute('x1',x);cross.setAttribute('x2',x);cross.setAttribute('visibility','visible');
  const vals=m.series.map(s=>[s,pointAt(s.points.filter(p=>p[1]!=null),best)]).filter(([,p])=>p);
  dots.innerHTML=vals.map(([s,p])=>`<circle cx="${m.X(p[0])}" cy="${m.Y(p[1])}" r="4" style="fill:${s.color}" class="ring" stroke-width="2"/>`).join('');
  const ym=new Date(best).toISOString().slice(0,7),bar=m.bars?.find(b=>new Date(b[0]).toISOString().slice(0,7)===ym);
  tip.innerHTML=`<strong>${date(new Date(best).toISOString().slice(0,10))}</strong>`+vals.map(([s,p])=>`<span><i style="background:${s.color}"></i>${esc(s.label)} <b>${m.format(p[1])}</b></span>`).join('')+(bar?`<span>${esc(m.barLabel)} in ${monthLabel(ym)} <b>${bar[1]}</b></span>`:'');
  tip.hidden=false;const px=x/m.w*r.width;tip.style.left=Math.min(Math.max(px,70),r.width-70)+'px';};
 const hide=()=>{cross.setAttribute('visibility','hidden');dots.innerHTML='';tip.hidden=true;};
 svg.onpointermove=show;svg.onpointerdown=show;svg.onpointerleave=hide;
}
async function loadCardHistory(id){
 if(state.cardHistory[id]||metricsPending.has('h:'+id))return;metricsPending.add('h:'+id);
 try{state.cardHistory[id]=await request('/api/card-history?id='+encodeURIComponent(id));}catch{state.cardHistory[id]={error:true,points:{},pop:[],era:null};}
 finally{metricsPending.delete('h:'+id);}
 if(shownCard()?.id===id)renderDetail();
}
const DAY_MS=86400000,dayMs=d=>Date.parse(d.slice(0,10)+'T00:00:00Z');
// A grade's guide over time: the monthly history (dated at each month's end, or the day the page was read
// for the month in progress) and each day the guide was read.
function guideSeries(m,grade,daily){
 const read=Date.parse(m?.research?.checkedAt||'')||Date.now(),out=new Map();
 for(const [ym,v] of priceHistory(m,grade)){const [y,mo]=ym.split('-').map(Number);out.set(Math.min(Date.UTC(y,mo,0),read),v);}
 for(const [d,p] of daily||[])if(p>0)out.set(dayMs(d),p);
 return [...out].sort((a,b)=>a[0]-b[0]);
}
const CHART_RANGES=[['3m','3M',92],['6m','6M',183],['1y','1Y',366],['3y','3Y',1096],['all','All',null]];
// Price chart, grade spreads and PSA population over time.
function cardChartSection(c,m){
 const h=state.cardHistory[c.id];if(!h){loadCardHistory(c.id);return `<div class="detail-section history"><div class="section-heading"><h3>Price chart</h3><small>Loading…</small></div></div>`;}
 const o=state.cardChart,g=o.grade||viewGrade(),days=CHART_RANGES.find(r=>r[0]===o.range)?.[2],since=days?Date.now()-days*DAY_MS:-Infinity;
 const seg=(name,list,on)=>`<div class="segmented" role="group" aria-label="${name}">${list.map(([k,l])=>`<button data-cc-${name.toLowerCase()}="${k}" class="${on===k?'active':''}" aria-pressed="${on===k}">${l}</button>`).join('')}</div>`;
 const guides=Object.fromEntries(['raw','psa9','psa10'].map(k=>[k,guideSeries(m,k,h.points?.[k])]));
 const inRange=p=>p.filter(x=>x[0]>=since);
 const markers=[];
 if(h.release)markers.push({t:dayMs(h.release),label:'Set release',kind:'release'});
 for(let i=1;i<(h.pop||[]).length;i++){const [d,n]=h.pop[i],prev=h.pop[i-1][1];if(prev>0&&n-prev>=10&&n/prev-1>=.1)markers.push({t:dayMs(d),label:'PSA pop +'+Math.round((n/prev-1)*100)+'%',kind:'pop'});}
 let body='',note='';
 if(o.view==='price'){
  const line=inRange(guides[g]),counts=new Map();
  for(const s of analyze(m,g).all){const ym=s.date.slice(0,7);counts.set(ym,(counts.get(ym)||0)+1);}
  const bars=[...counts].map(([ym,n])=>[Date.UTC(+ym.slice(0,4),+ym.slice(5,7)-1,15),n]).filter(b=>b[0]>=since&&line.length&&b[0]>=line[0][0]-31*DAY_MS);
  const series=[{label:gradeNames[g]+' guide',short:shortGrade(g),color:C.accent,area:true,points:line}];
  const era=h.era?.levels?.[g]||[];
  if(o.era&&line.length&&era.length){const e=era.map(([d,v])=>[dayMs(d),v]).filter(p=>p[1]>0),start=pointAt(e,line[0][0])||e.find(p=>p[0]>=line[0][0]);if(start)series.push({label:h.era.name+' (typical card, scaled)',short:'Era',color:'var(--info)',dash:true,points:e.filter(p=>p[0]>=line[0][0]).map(([t,v])=>[t,v/start[1]*line[0][1]])});}
  body=timeChart({series,bars,markers,label:gradeNames[g]+' guide price over time',barLabel:'Matching sales'});
  note=`PriceCharting's guide${g==='psa9'?' for Grade 9 (all graders)':''}: monthly history, plus each day it was read. Bars count the matching sales on the card's page, which lists only recent sales.${o.era?' The era line is its typical-card index, scaled to the card\'s price at the start.':''}`;
 }else if(o.view==='spread'){
  const ratio=(a,b)=>a.map(([t,v])=>{const p=pointAt(b,t);return p&&t-p[0]<=45*DAY_MS&&p[1]>0?[t,v/p[1]]:null;}).filter(Boolean);
  body=timeChart({series:[{label:'PSA 10 / PSA 9',short:'10 / 9',color:C.accent,points:inRange(ratio(guides.psa10,guides.psa9))},{label:'PSA 10 / raw',short:'10 / raw',color:'var(--warn)',points:inRange(ratio(guides.psa10,guides.raw))}],markers,label:'Grade spreads over time',format:times,tick:v=>v.toFixed(v>=10?0:1)+'×'});
  note='How many times the PSA 10 guide is the Grade 9 and ungraded guides. A widening spread means buyers pay more for the top grade.';
 }else{
  const pop=inRange((h.pop||[]).map(([d,n,p10])=>[dayMs(d),n,p10]));
  body=pop.length>=2?timeChart({series:[{label:'PSA graded',short:'All',color:C.accent,points:pop.map(p=>[p[0],p[1]])},{label:'PSA 10',short:'PSA 10',color:'var(--warn)',points:pop.map(p=>[p[0],p[2]])}],label:'PSA population over time',format:v=>Math.round(v).toLocaleString(),tick:v=>compactCount(v)}):`<div class="chart-empty">${(h.pop||[]).length?'One population reading so far ('+date(h.pop[0][0])+'). ':''}Population history builds up each time the card's page is read.</div>`;
  note='PSA population from the card\'s page, recorded each time it changes. A jump in graded copies adds supply.';
 }
 return `<div class="detail-section history card-chart"><div class="section-heading"><h3>${o.view==='price'?'Price chart':o.view==='spread'?'Grade spreads':'PSA population'}</h3>${seg('View',[['price','Price'],['spread','Spreads'],['pop','Population']],o.view)}</div><div class="chart-tools">${o.view==='price'?seg('Grade',['raw','psa9','psa10'].map(k=>[k,shortGrade(k)]),g):''}${seg('Range',CHART_RANGES.map(r=>[r[0],r[1]]),o.range)}${o.view==='price'?`<label class="check-inline"><input type="checkbox" id="cc-era" ${o.era?'checked':''}> vs era index</label>`:''}</div>${body}<p class="sales-note">${note}</p></div>`;
}
function wireCardChart(){
 const box=$('#detail');if(!box?.querySelectorAll)return;const o=state.cardChart;
 box.querySelectorAll('[data-cc-view]').forEach(b=>b.onclick=()=>{o.view=b.dataset.ccView;renderDetail();});
 box.querySelectorAll('[data-cc-grade]').forEach(b=>b.onclick=()=>{o.grade=b.dataset.ccGrade;renderDetail();});
 box.querySelectorAll('[data-cc-range]').forEach(b=>b.onclick=()=>{o.range=b.dataset.ccRange;renderDetail();});
 const era=box.querySelector('#cc-era');if(era)era.onchange=()=>{o.era=era.checked;renderDetail();};
}
const compactCount=v=>v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e4?Math.round(v/1e3)+'k':v>=1e3?(v/1e3).toFixed(1)+'k':String(Math.round(v));
function popLine(m){const p=m?.pop?.psa;if(!Array.isArray(p)||p.length<10)return '';const total=p.reduce((a,b)=>a+b,0);return `<p>PSA population: <b>${p[8].toLocaleString()}</b> PSA 9 · <b>${p[9].toLocaleString()}</b> PSA 10 · ${total.toLocaleString()} graded.${total?' '+Math.round(p[9]/total*100)+'% gem rate.':''}</p>`;}
// The page files are read fresh on every request, but the API code is loaded once when the server
// starts. After an update, a server that was left running answers new routes with 404.
const SERVER_OLD='FutureSight is running older server code than this page. Close the FutureSight window and start it again (node server.mjs), then reload this page.';
const scoreProblem=()=>{const e=state.scoreError;return !e?'':e.status===404?SERVER_OLD:'Scores could not be loaded ('+e.message+').';};
const PART_SHORT={demand:'Demand',momentum:'Momentum',value:'Value',liquidity:'Liquidity',stability:'Stability',scarcity:'Scarcity'};
const SIGNAL_NAMES={uptrend:'Steady uptrend',recovering:'Recovering from highs',cheap:'Cheap vs. similar cards'};
// Research rank (shadow): a historical ranking, an evidence status, and a cost calculator. The
// 12-month forecast stays withheld until the model passes its validation gate.
const COST_KEY='futuresight-costs';
function savedCosts(){try{const v=typeof localStorage==='undefined'?null:JSON.parse(localStorage.getItem(COST_KEY)||'null');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
function storeCosts(v){state.costs=v;try{localStorage.setItem(COST_KEY,JSON.stringify(v));}catch{}}
const userCosts=()=>normalizeCosts(state.costs).costs;
// Marketplace fee presets: choosing one keeps your shipping, tax and return settings; editing a fee field
// switches back to a flat custom rate.
const FEE_FIELDS=['saleFeeRate','saleFixedFee'];
function presetPicker(){const on=state.costs?.preset||'';return `<div class="segmented preset-pick" role="group" aria-label="Selling fees">${[['','Research default'],...Object.entries(MARKET_PRESETS).map(([k,p])=>[k,p.name])].map(([k,l])=>`<button data-fee-preset="${k}" class="${on===k?'active':''}" aria-pressed="${on===k}">${esc(l)}</button>`).join('')}</div>`;}
function wirePresets(root){root.querySelectorAll?.('[data-fee-preset]').forEach(b=>b.onclick=()=>{const {preset:_,...rest}=state.costs||{};for(const f of FEE_FIELDS)delete rest[f];storeCosts(b.dataset.feePreset?{...rest,preset:b.dataset.feePreset}:rest);renderDetail();});}
const EVIDENCE={supported:'Supported',limited:'Limited evidence',insufficient:'Insufficient evidence',unsupported:'Not supported'};
const EVIDENCE_FROM={S:'supported',L:'limited',I:'insufficient',U:'unsupported'};
const RANK_INDEX={psa10:0,psa9:1,raw:2};
const researchRankOf=(id,grade=state.grade)=>state.research?.ranks?.[id]?.[RANK_INDEX[grade]]??null;
const researchStatusOf=(id,grade=state.grade)=>EVIDENCE_FROM[state.research?.status?.[id]?.[RANK_INDEX[grade]]]||null;
// The research rank can be screened and sorted like the other scores, unless the server rolled it back.
const researchOff=()=>state.research?.mode==='legacy';
const researchColumn=()=>!researchOff()&&(state.sort==='research'||state.filters.research>0);
function researchPill(id){const v=researchRankOf(id);return `<span class="score-pill research ${ratingClass(v)}" title="${v==null?'No research rank for this grade':'Research rank '+v+' / 100 · historical percentile (shadow, unvalidated)'}">${v??'—'}</span>`;}
// Languages in view that the server sends no research ranks for (Japanese until it is validated).
const researchMissingFor=()=>!state.research?.ranks?[]:state.langs.filter(l=>l!=='en'&&!(state.research.languages||['en']).includes(l));
const researchMissingNote=()=>(state.research?.languages||['en']).map(l=>LANGS.find(x=>x.id===l)?.label||l).join(' and ')+' cards only for now';
const monthText=ym=>ym?new Date(ym+'-15T00:00:00Z').toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'}):'';
const COST_FIELDS=[['saleFeeRate','Selling fees','%',100],['saleFixedFee','Fixed fee per sale','$',1],['shippingIn','Shipping to you','$',1],['shippingOut','Shipping to buyer','$',1],['taxRate','Sales tax','%',100],['hurdle','Return you want','%',100]];
function costOutput(inv,c){
 const costs=userCosts(),ref=inv?.priceReference?.price??null,ask=state.asks[c.id+'|'+viewGrade()]??null,sum=costSummary({ask,reference:ref,costs});
 const lines=[];
 if(ref>0){
  lines.push(`<div><span>Today's sold median</span><strong>${money(ref)}</strong><small>${esc(inv.priceReference.label||'')}</small></div>`);
  lines.push(`<div><span>Break-even price</span><strong>${sum.breakEven!=null?money(sum.breakEven):'None'}</strong><small>Most you could pay and still get your money back reselling at today's median, after fees and shipping.</small></div>`);
  if(costs.hurdle>0)lines.push(`<div><span>For a ${Math.round(costs.hurdle*100)}% return</span><strong>${sum.maxForHurdle!=null?money(sum.maxForHurdle):'None'}</strong><small>Highest price that still clears your return at today's median.</small></div>`);
  if(ask>0){const r=sum.netReturnAtReference;lines.push(`<div><span>At ${money(ask)} asking</span><strong class="${r>0?'up':r<0?'down':''}">${r==null?'—':pct(r)}</strong><small>All-in cost ${money(sum.acquisition)}; return if resold at today's median.</small></div>`);}
 }else lines.push('<div class="wide"><span>No confident sold price</span><small>A break-even price needs at least 3 matching sales in 180 days, including one in the last 90.</small></div>');
 const f=inv?.forecast;
 if(f){const at=ask>0?ask:ref,r10=at>0?netReturn(at,f.conservativeExit,costs):null,b=maxBuyPrice(f.conservativeExit,costs);lines.push(`<div><span>Conservative 12-month exit</span><strong>${money(f.conservativeExit)}</strong><small>${r10!=null?pct(r10)+' net at '+money(at)+'. ':''}Max buy ${b!=null?money(b):'none'}. ${esc(f.note)}</small></div>`);}
 return lines.join('');
}
function researchBox(c){
 if(state.research?.mode==='legacy')return '';
 const inv=state.investDetail[c.id]?.[viewGrade()],rank=inv?inv.rank:researchRankOf(c.id,viewGrade()),status=inv?.evidenceStatus||researchStatusOf(c.id,viewGrade());
 if(!inv&&!state.research)return '';
 // Languages the server does not rank (Japanese until it passes its own check) say so instead of loading forever.
 const lang=langOf(c),covered=state.research?.languages||['en'];
 if(!inv&&state.research?.ranks&&!covered.includes(lang))return `<div class="research-box"><div class="score-head-row"><span class="metric-label">Research rank</span></div><p class="score-note">Not shown for ${esc(LANGS.find(l=>l.id===lang)?.label||lang)} cards: the research rank was tested on Japanese price history and did not beat a simple all-card basket on held-out sets or when buying a month later, so it is switched off for them.</p></div>`;
 const tag=`<span class="rating-tag research-tag" title="Shown for comparison while the new system is evaluated">Shadow · unvalidated</span>`;
 const head=`<div class="score-head-row"><span class="metric-label">Research rank</span>${tag}</div>`;
 const main=`<div class="score-main"><strong>${rank??'—'}</strong><em>/ 100</em>${status?`<span class="evidence-chip ${status}">${EVIDENCE[status]}</span>`:''}</div>`;
 if(!inv)return `<div class="research-box">${head}${main}<p class="score-note">Loading evidence…</p></div>`;
 const what=rank!=null?`<p class="score-note">Percentile among ${inv.reference?.size?.toLocaleString('en-US')||'the'} ${lang==='ja'?'Japanese ':''}${gradeNames[viewGrade()]} cards ranked on ${monthText(inv.rankMonth)} prices: 75% how far below its 13-month median it sits, 25% momentum. A ranking of past prices, not a chance of profit.</p>${inv.basis?`<p class="score-note">Basis: ${esc(inv.basis.label)}.</p>`:''}`:'';
 const reasons=inv.reasons.length?`<ul class="evidence-reasons">${inv.reasons.map(r=>`<li>${esc(r.text)}</li>`).join('')}</ul>`:'';
 const costs=userCosts(),fields=COST_FIELDS.map(([k,label,unit,scale])=>`<label>${label}<span class="unit-input">${unit==='$'?'<i>$</i>':''}<input type="number" step="any" min="0" data-cost="${k}" value="${+(costs[k]*scale).toFixed(4)}">${unit==='%'?'<i>%</i>':''}</span></label>`).join('');
 const calc=`<div class="cost-calc"><h4>Price check</h4><label class="ask-label">Asking price (USD)<input id="ask-price" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="e.g. ${inv.priceReference?.price?Math.round(inv.priceReference.price):'100'}" value="${state.asks[c.id+'|'+viewGrade()]??''}"></label><div class="cost-out" id="cost-out">${costOutput(inv,c)}</div>
  <details class="cost-assumptions"><summary>Cost assumptions${state.costs?.preset?' · '+esc(MARKET_PRESETS[state.costs.preset]?.name||''):state.costs&&Object.keys(state.costs).length?' · custom':''}</summary>${presetPicker()}<div class="cost-fields">${fields}</div><p class="score-note">${esc(normalizeCosts(state.costs).costs.label)}. Fees vary by marketplace and account and may apply to shipping and tax too. <button class="link-button" id="cost-reset">Use defaults</button></p></details></div>`;
 const forecast=`<p class="forecast-note">${inv.forecast?'12-month forecast shown above (validated model).':esc(inv.forecastWithheld||'')}</p>`;
 return `<div class="research-box ${status||''}">${head}${main}${what}${reasons}${calc}${forecast}</div>`;
}
function wireResearch(c){
 const ask=$('#ask-price');if(!ask)return;
 const update=()=>{const out=$('#cost-out');if(out)out.innerHTML=costOutput(state.investDetail[c.id]?.[viewGrade()],c);};
 ask.oninput=()=>{const v=Number(ask.value);state.asks[c.id+'|'+viewGrade()]=ask.value&&v>0?v:null;update();};
 $('#detail').querySelectorAll('[data-cost]').forEach(input=>input.oninput=()=>{const field=COST_FIELDS.find(f=>f[0]===input.dataset.cost),v=Number(input.value);if(input.value===''||!Number.isFinite(v))return;const next={...state.costs,[field[0]]:v/field[3]};if(FEE_FIELDS.includes(field[0])&&next.preset){const p=MARKET_PRESETS[next.preset].costs;delete next.preset;for(const f of FEE_FIELDS)next[f]??=p[f];}if(normalizeCosts(next).errors.length)return;storeCosts(next);update();});
 if($('#cost-reset'))$('#cost-reset').onclick=()=>{storeCosts({});renderDetail();};
}
function scoreBox(c){
 const quick=scoreOf(c.id,viewGrade()),detail=state.scoreDetail[c.id]?.[viewGrade()],v=detail?detail.score:quick,cls=ratingClass(v);
 const head=`<div class="score-head-row"><span class="metric-label">Investment score</span>${v!=null?`<span class="rating-tag ${cls}">${ratingOf(v)}</span>`:''}</div>`;
 if(v==null){
  const failed=!state.scores&&state.scoreError,why=detail?.reason||(state.scores?'Needs at least 3 matching sales in 180 days, including one in the last 90, before it can be scored.':failed?scoreProblem():'Loading score…');
  return `<div class="score-box empty">${head}<div class="score-main"><strong>—</strong><em>/ 100</em></div><p class="score-note">${esc(why)}${failed?' <button class="link-button" id="score-retry">Try again</button>':''}</p></div>`;
 }
 const parts=detail?`<ul class="score-parts">${detail.parts.map(p=>`<li><span class="part-name">${PART_SHORT[p.key]||esc(p.label)}<small>${Math.round(p.weight*100)}%</small></span><span class="part-bar ${ratingClass(p.score)}"><i style="width:${Math.max(2,p.score)}%"></i></span><b>${p.score}</b><small class="part-detail">${esc(p.detail)}${p.neutral?' <em>Not measured</em>':''}</small></li>`).join('')}</ul>`:'<p class="score-note">Loading the breakdown…</p>';
 const signals=detail?.signals?.length?`<p class="score-signals">Investments signals met: ${detail.signals.map(t=>`<span class="signal ${t==='uptrend'?'up':t==='recovering'?'rec':'cheap'}">${SIGNAL_NAMES[t]}</span>`).join(' ')}</p>`:'';
 return `<div class="score-box ${cls}">${head}<div class="score-main"><strong>${v}</strong><em>/ 100</em><div class="score-meter" role="img" aria-label="Investment score ${v} out of 100" style="--v:${v}%"><span style="left:35%"></span><span style="left:50%"></span><span style="left:65%"></span><span style="left:80%"></span></div></div>${detail?.belowFloor?'<p class="score-note warn-note">Under the $25 investment floor, so capped at 59.</p>':''}${parts}${signals}<p class="score-note">From this app's ${gradeNames[viewGrade()]} sales only. Describes past sales, not a forecast or investment advice. The Strong/Good/Fair bands are fixed thresholds that have not been validated against later prices. <button class="link-button" id="score-method">How it's scored</button></p></div>`;
}
// The info screen can show another printing (state.detailLang, state.detailAlt) or grade (state.detailGrade)
// of the selected card. These only change what the info screen shows: the list's grade and filters stay put,
// and they reset when another card is picked.
const viewGrade=()=>state.detailGrade||state.grade;
function resetDetailVersion(){state.detailLang=null;state.detailAlt=null;state.detailGrade=null;state.cardChart.grade=null;}
function showGrade(g){state.detailGrade=g===state.grade?null:g;state.cardChart.grade=null;renderDetail();}
const numberCaption=c=>(c.numbering?'':'#')+esc(c.numberLabel);
function counterpart(c,lang){if(!c)return null;if(langOf(c)===lang)return c;if(!c.languagePairVerified)return null;
 const ids=lang==='ja'?c.japaneseIds:(c.englishId?[c.englishId]:[]);
 if(ids?.length!==1)return null;
 const target=cardById(ids[0]);
 return target?.languagePairVerified&&langOf(target)===lang&&(lang==='ja'?target.englishId===c.id:target.japaneseIds?.length===1&&target.japaneseIds[0]===c.id)?target:null;}
function shownCard(){
 const base=cardById(state.selected);if(!base)return null;
 const alt=state.detailAlt&&cardById(state.detailAlt);
 if(alt&&(alt.id===base.id||counterpart(base,langOf(alt))?.id===alt.id))return alt;
 return state.detailLang?counterpart(base,state.detailLang)||base:base;
}
function showVersion(lang,id){
 const base=cardById(state.selected),target=counterpart(base,lang);
 if(!target||(id&&id!==target.id))return;
 state.detailLang=lang;state.detailAlt=id||null;
 const c=shownCard();renderDetail();if(c&&!state.full[c.id])loadCard(c.id);
}
function versionBar(base,c,withGrades){
 const missing=state.detailLang&&langOf(c)!==state.detailLang;
 const tab=l=>{const target=counterpart(base,l),on=langOf(c)===l;return `<button data-detail-lang="${l}" class="${on?'active':''}" aria-pressed="${on}" ${target?'':'disabled'} title="${target?(l==='ja'?'Japanese printing':'English printing'):l==='ja'?'No verified Japanese counterpart of this printing':'No verified English counterpart of this printing'}">${l==='ja'?'Japanese':'English'}</button>`;};
 return `<div class="version-bar"><div class="segmented lang-tabs" role="group" aria-label="Card language">${tab('en')}${tab('ja')}</div>${withGrades?`<div class="segmented grade-tabs-inline" role="group" aria-label="Grade">${['raw','psa9','psa10'].map(g=>`<button data-detail-grade="${g}" class="${g===viewGrade()?'active':''}" aria-pressed="${g===viewGrade()}">${{raw:'Raw NM',psa9:'PSA 9',psa10:'PSA 10'}[g]}</button>`).join('')}</div>`:''}${missing?`<span class="version-note">No verified ${state.detailLang==='ja'?'Japanese':'English'} counterpart of this printing.</span>`:''}</div>`;
}
// ---------- Card market metrics ----------
// Returns, range, liquidity, grade spreads, population and relative value from /api/metrics, plus the
// card's set, Pokémon, rarity tier and artist indices for context.
const metricsPending=new Set();
async function loadCardMetrics(id){
 if(state.cardMetrics[id]||metricsPending.has(id))return;metricsPending.add(id);
 try{state.cardMetrics[id]=await request('/api/metrics?id='+encodeURIComponent(id));}catch{state.cardMetrics[id]={error:true,grades:{},indices:[]};}
 finally{metricsPending.delete(id);}
 if(shownCard()?.id===id)renderDetail();
}
const GRADING_KEY='futuresight-grading',GRADING_DEFAULT={fee:25,shipping:15};
function savedGrading(){try{return {...GRADING_DEFAULT,...JSON.parse(localStorage.getItem(GRADING_KEY)||'{}')};}catch{return {...GRADING_DEFAULT};}}
// Grading: what a raw copy is worth sent to PSA, at this card's population odds. Each grade is valued at
// its sold median when there is one, else the guide (8 and below at the Grade 8 / Grade 7 guides, or raw).
function gradingView(c,m,metrics){
 const psa=m?.pop?.psa,total=Array.isArray(psa)?psa.reduce((a,b)=>a+(b||0),0):0;
 if(!(total>=20))return `<div class="grading"><h4>Grading calculator</h4><p class="score-note">Needs a PSA population of 20 or more copies${total?' (this card has '+total+')':''}.</p></div>`;
 const g=state.grading??=savedGrading(),value=gr=>analyze(m,gr).fair??metrics[gr]?.price??null,raw=value('raw'),p10=value('psa10'),p9=value('psa9'),g8=m.guide?.grade8||null,g7=m.guide?.grade7||raw;
 if(!(raw>0&&p10>0&&p9>0))return `<div class="grading"><h4>Grading calculator</h4><p class="score-note">Needs raw, PSA 9 and PSA 10 prices.</p></div>`;
 // PSA 8 at the Grade 8 guide, 7 at the Grade 7 guide, 6 and below at the ungraded guide (mixed condition).
 const n10=psa[9]||0,n9=psa[8]||0,n8=psa[7]||0,n7=psa[6]||0,low=total-n10-n9-n8-n7,lowValue=m.guide?.raw||raw,cost=raw+g.fee+g.shipping;
 const below=n9*p9+n8*(g8||g7)+n7*g7+low*lowValue,ev=(n10*p10+below)/total,gain=ev-cost;
 // The PSA 10 share at which grading breaks even, with the other grades in their current proportions.
 const other=total-n10?below/(total-n10):g7,need=p10>other?(cost-other)/(p10-other):null;
 return `<div class="grading"><h4>Grading calculator</h4><div class="grading-inputs"><label>Grading fee<span class="unit-input"><i>$</i><input type="number" min="0" step="1" data-grading="fee" value="${g.fee}"></span></label><label>Shipping &amp; insurance<span class="unit-input"><i>$</i><input type="number" min="0" step="1" data-grading="shipping" value="${g.shipping}"></span></label></div>
  <div class="grading-out"><div><small>Raw copy + costs</small><b>${money(cost)}</b></div><div><small>Expected graded value</small><b>${money(ev)}</b></div><div><small>Expected gain</small><b class="pl ${gain>=0?'up':'down'}">${signed(gain)}</b></div><div><small>Break-even PSA 10 rate</small><b>${need==null?'—':need>1?'Over 100%':need<=0?'Pays without a 10':(need*100).toFixed(need<.1?1:0)+'%'}</b></div></div>
  <p class="score-note">At this card's PSA odds: ${share(n10/total)} PSA 10, ${share(n9/total)} PSA 9, ${share((n8+n7)/total)} PSA 7–8, ${share(low/total)} lower (${total.toLocaleString()} graded). Values: PSA 10 ${money(p10)}, PSA 9 ${money(p9)}, raw ${money(raw)}. Copies people choose to grade are better than average, so your own odds may be lower. Selling fees not included.</p></div>`;
}
function marketSection(c,m){
 const d=state.cardMetrics[c.id];
 if(!d){loadCardMetrics(c.id);return `<div class="detail-section card-metrics"><div class="section-heading"><h3>Market metrics</h3><small>Loading…</small></div></div>`;}
 const g=viewGrade(),x=d.grades?.[g];
 if(!x||x.price==null)return d.error?'':`<div class="detail-section card-metrics"><div class="section-heading"><h3>Market metrics</h3></div><p class="sales-note">${d.run?'No guide price for this grade yet.':'Market metrics are built after Update sales or a guide sweep, and nightly.'}</p></div>`;
 const cell=(label,value,title='')=>`<div${title?` title="${esc(title)}"`:''}><small>${label}</small><b>${value}</b></div>`;
 const pos=x.high_52w>x.low_52w?Math.min(100,Math.max(0,(x.price-x.low_52w)/(x.high_52w-x.low_52w)*100)):null;
 const range=x.low_52w!=null?`<div class="range52"><div class="range-head"><small>52-week range</small><span>${money(x.low_52w)} – ${money(x.high_52w)}</span></div><div class="range-bar">${pos!=null?`<i style="left:${pos.toFixed(1)}%"></i>`:''}</div></div>`:'';
 const gap=x.lang_gap==null?'—':(x.lang_gap>=0?'+':'−')+Math.abs(Math.round(x.lang_gap*100))+'%';
 const stats=`<div class="metric-grid">${cell('Guide',money(x.price),'PriceCharting guide for this grade, read '+date(x.as_of))}${cell('From peak',retCell(x.drawdown),'Below the highest guide price on record')}${cell('Volatility',x.volatility==null?'—':Math.round(x.volatility*100)+'%','Annualised, from month-end guide prices')}${cell('Sales 30D / 90D',x.sales_30d==null?'—':x.sales_30d+' / '+x.sales_90d,'Matching sales in the 30 and 90 days before the card was last read')}${cell('Last sale',x.days_since_sale==null?'—':x.days_since_sale+' d ago')}${cell('vs peers',times(x.premium),'Guide price over the median of same-era, same-rarity cards')}${cell('PSA 10 / PSA 9',times(x.spread_10_9))}${cell('PSA 10 / raw',times(x.spread_10_raw))}${cell('PSA graded',x.pop_total==null?'—':x.pop_total.toLocaleString()+(x.pop_growth_90d!=null?` <small>${pct(x.pop_growth_90d)} 90D</small>`:''),'All PSA-graded copies; growth over 90 days when known')}${cell('Gem rate',share(x.gem_rate),'PSA 10s as a share of PSA-graded copies')}${cell('Beta to era',x.beta==null?'—':x.beta.toFixed(2),'How much the card\'s guide moved for each 1% move in its era\'s typical card, month to month over 2 years')}${cell('Correlation',x.correl==null?'—':x.correl.toFixed(2),'How closely its monthly changes follow its era index: 1 moves together, 0 unrelated')}${cell(langOf(c)==='en'?'Japanese copy':'English copy',gap,'Price of the verified '+(langOf(c)==='en'?'Japanese':'English')+' printing against this one, same grade')}</div>`;
 const rets=`<div class="ret-strip">${RET_KEYS.map(([k,l])=>`<div><small>${l}</small>${retCell(x[k])}</div>`).join('')}</div>`;
 const order=['set','char','tier','artist','era'],idx=[...(d.indices||[])].filter(i=>i.grades?.[g]).sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind));
 const context=idx.length?`<div class="index-context"><h4>Its indices · ${shortGrade(g)}</h4>${idx.map(i=>{const r=i.grades[g];return `<button data-open-market="${esc(i.id)}"><span><small>${esc(KIND_LABEL[i.kind]||i.kind)}</small>${esc(i.name)}</span>${i.kind==='char'&&r.premium!=null?`<span class="ctx-demand" title="Demand premium">${times(r.premium)}</span>`:'<span class="ctx-demand"></span>'}<span>${retCell(retOf(r,'ret_30d'))}<small>30D</small></span><span>${retCell(retOf(r,'ret_1y'))}<small>1Y</small></span></button>`;}).join('')}</div>`:'';
 // Selling today: the sold median (or guide) less the fees and shipping set in Price check's cost assumptions.
 const sale=analyze(m,g).fair??x.price,costs=userCosts(),net=netProceeds(sale,costs);
 const sell=sale>0?`<div class="sell-side"><h4>If you sold today</h4><p><span>${money(sale)} ${analyze(m,g).fair?'sold median':'guide'}</span><span>− ${money(saleFee(sale,costs)+(costs.shippingOut||0)+(costs.holdingCost||0))} fees &amp; shipping</span><b>= ${money(net)} to you</b></p>${presetPicker()}<p class="score-note">${esc(costs.label)}${costs.preset?'':'. Fees vary by marketplace'}. Shipping and other costs are under Price check's cost assumptions.</p></div>`:'';
 return `<div class="detail-section card-metrics"><div class="section-heading"><h3>Market metrics</h3><small>${shortGrade(g)} · guide prices · ${date(x.as_of)}</small></div>${rets}${range}${stats}${context}${sell}${g==='raw'?gradingView(c,m,d.grades):''}${c.eligible?signalForm(c.id,g,CARD_SIGNALS,'card'):''}</div>`;
}
// Live listings: how many copies are for sale now and the cheapest against fair value (sold median, or the
// guide). Checked on request because each check is one eBay or SerpApi call.
function listingsSection(c){
 const g=viewGrade(),key=c.id+'|'+g,l=state.listings[key];
 const head=`<div class="section-heading"><h3>Live listings</h3><small>${shortGrade(g)}${l?.data?' · checked '+new Date(l.data.checked_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):''}</small></div>`;
 const button=`<button class="button" id="check-listings" ${l?.loading?'disabled':''}>${icon('refresh')} ${l?.loading?'Checking…':l?.data?'Check again':'Check live listings'}</button>`;
 if(!l||l.loading)return `<div class="detail-section live-listings">${head}<p class="sales-note">Active copies on eBay and the cheapest against fair value. Uses one search from your eBay or SerpApi key (set under Alerts).</p>${button}</div>`;
 if(l.error)return `<div class="detail-section live-listings">${head}<p class="sales-note">${esc(l.error)}${l.setup?' <button class="link-button" id="listings-setup">Alert settings</button>':''}</p>${button}</div>`;
 const d=l.data,f=d.fair,tag=v=>v==null?'':`<span class="deal-tag ${v<=-.1?'good':v<0?'ok':'over'}">${v<0?Math.round(-v*100)+'% below':Math.round(v*100)+'% above'} fair</span>`;
 const rows=d.listings.slice(0,6).map(x=>`<a class="listing-row" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><span class="listing-title">${esc(x.title)}</span><small>${esc(x.buying_option)}${x.shipping?' · '+money(x.shipping)+' shipping':' · free shipping'}</small><b>${money(x.total)}</b>${tag(x.vs_fair)}</a>`).join('');
 return `<div class="detail-section live-listings">${head}<div class="metric-grid"><div><small>Matching listings</small><b>${d.count}${d.count>=50?'+':''}</b></div><div><small>Cheapest</small><b>${d.lowest==null?'—':money(d.lowest)}</b></div><div title="${esc(f?.label||'')}"><small>Fair value</small><b>${f?money(f.value):'—'}</b><small>${f?esc(f.source):''}</small></div></div>${rows||'<p class="sales-note">No listing matched this exact card and grade.</p>'}<p class="sales-note">Totals include shipping. Titles are matched strictly to this card, number and grade; check each listing before buying.</p>${button}</div>`;
}
async function checkListings(c,force=false){
 const g=viewGrade(),key=c.id+'|'+g;state.listings[key]={loading:true};renderDetail();
 try{state.listings[key]={data:await send('/api/listings','POST',{card_id:c.id,grade:g,force})};}
 catch(e){state.listings[key]={error:e.message,setup:/under Alerts/.test(e.message)};}
 if(shownCard()?.id===c.id)renderDetail();
}
function wireCardMetrics(){
 const box=$('#detail');if(!box?.querySelectorAll)return;
 box.querySelectorAll('[data-open-market]').forEach(b=>b.onclick=()=>{const id=b.dataset.openMarket;state.view='market';state.market.tab=({char:'char',set:'set',tier:'tier',artist:'artist'})[id.split(':')[1]]||'overview';state.market.grade=viewGrade();state.marketLang=id.split(':')[0];state.market.index=id;updateView();openIndex(id);});
 wirePresets(box);wireSignalForms(box);
 if(!state.signals)loadSignals(true);
 const c=shownCard(),chk=box.querySelector('#check-listings');if(chk&&c)chk.onclick=()=>checkListings(c,!!state.listings[c.id+'|'+viewGrade()]?.data);
 const setup=box.querySelector('#listings-setup');if(setup)setup.onclick=()=>{state.view='alerts';updateView();};
 box.querySelectorAll('[data-grading]').forEach(input=>input.onchange=()=>{const v=Number(input.value);if(!(v>=0&&v<=10000))return;state.grading={...(state.grading||savedGrading()),[input.dataset.grading]:v};try{localStorage.setItem(GRADING_KEY,JSON.stringify(state.grading));}catch{}renderDetail();});
}
function renderDetail(){
 const base=cardById(state.selected),c=shownCard();if(!c){$('#detail').innerHTML='<div class="empty-state"><strong>Select a card</strong><p>Card insights will appear here.</p></div>';return;}
 const sourceSet=state.sets.find(s=>s.id===c.setId);$('#set-market-source').href=sourceSet.marketSource||sourceSet.checklistSource;$('#set-checklist-source').href=sourceSet.checklistSource;
 const m=state.markets[c.id],a=analyze(m,viewGrade()),w=matchingWatch(c.id,viewGrade()),target=w?.target??a.target,mine=owned(c.id);
 const salesChecked=m?.research?.checkedAt||m?.observedAt;
 const fresh=salesChecked&&Number.isFinite(Date.parse(salesChecked))&&(Date.now()-Date.parse(salesChecked))/86400000<=14;
 const loading=m?.light&&!state.full[c.id];
 const history=loading?[]:priceHistory(m,viewGrade()),projection=fresh?trendProjection(a.comparable,a.fair,Date.now(),history):{available:false,reason:'Refresh sales before projecting a trend.'};
 const referenceSource=a.priceSource==='guide'?a.guideSource:null;
 const comparison=a.fair?money(a.fair):'—',conf=a.confidence==='Insufficient'?'More evidence needed':`${a.confidence} confidence`;
 const forecasts=a.fair?[-.07,.05,.12].map(g=>money(a.fair*(1+g)**5)):['—','—','—'];
 const f=state.focus,el=$('#detail'),keep=document.activeElement?.id;
 el.classList.toggle('expanded',state.expanded);el.classList.toggle('focus',f);
 const top=`<div class="detail-top"><div class="detail-eyebrow"><span>CARD INSIGHT</span><span class="eyebrow-end"><span>${gradeNames[viewGrade()]}</span><button class="icon-button expand-button" id="detail-focus" aria-label="Expand card details" title="Expand (reading view)">${icon('expand')}</button></span></div><div class="detail-identity"><div class="detail-image-wrap"><img class="detail-image" src="${c.image}"${c.imageAlt?` data-alt="${c.imageAlt}"`:''} alt="${esc(c.name)} ${c.numberLabel}"></div><div><h2>${esc(c.name)}</h2><p>${esc(c.setName)} · ${numberCaption(c)}<br>${esc(c.category)}</p><span class="type-pill">${esc(c.type)}</span>${mine.length?`<span class="type-pill owned-pill">In your Dex · ${mine.reduce((n,e)=>n+(e.quantity||1),0)}</span>`:''}</div></div></div>`;
 const buy=`<div class="buy-box ${target==null?'insufficient':''}"><div class="eyebrow">${w?.target!=null?'YOUR BUY TARGET':'SUGGESTED MAXIMUM PRICE'}</div><div class="buy-amount"><strong>${target==null?'Waiting for evidence':money(target)}</strong>${a.target!=null && w?.target==null?'<span class="discount-tag">15% below median</span>':''}</div><p>${w?.target!=null?'Your saved limit, before shipping and tax.':esc(a.reason)}</p></div>`;
 const metrics=`<div class="detail-metrics"><div><span class="metric-label">Current reference</span><strong>${money(a.current)}</strong><small>${esc(a.priceLabel)}</small>${viewGrade()==='psa9'&&a.guidePrice?`<small>Mixed Grade 9 guide: ${money(a.guidePrice)}</small>`:''}${a.sampleCount?`<span class="sample-badge">${a.sampleCount} matching sales</span>`:''}</div><div><span class="metric-label">Activity score</span><div class="demand-wrap"><strong>${a.score??'—'}</strong><em>/ 100</em></div><div class="demand-bar"><span style="width:${a.score??0}%"></span></div><small>Sales activity · ${conf.toLowerCase()}</small></div></div>`;
 const scoreHtml=`${scoreBox(c)}${researchBox(c)}`,marketHtml=marketSection(c,m)+listingsSection(c);
 const chartSec=`<div class="detail-chart"><div class="section-heading"><h3>Reported sales</h3><small>${gradeNames[viewGrade()]}</small></div><div class="trend-layout"><div>${chart(a,f,history)}</div><aside class="trend-projection" aria-label="Simple trend projection"><span>Simple trend projection</span>${projection.available?['1Y','2Y','3Y'].map((label,i)=>`<div><b>${label}</b><strong>${money(projection.values[i])}</strong></div>`).join(''):`<p>${esc(projection.historyReason&&/held-out/.test(projection.historyReason)?'No reliable trend: neither recent sales nor the monthly price history beat an unchanged price in a held-out test.':projection.historyReason&&/Needs 8 months/.test(projection.historyReason)&&/Needs 8 sale days/.test(projection.reason)?'Not enough history yet: needs 6+ months of sales or monthly source prices.':projection.reason)}</p>`}${pastChange(history)}</aside></div><p class="chart-caption">${a.usable.length} matching sales · ${a.windowDays} days · ${conf}${projection.available?` · ${signed(projection.annualIncrease)} / year trend`:''}</p><p class="sales-note">${projection.available&&projection.basis==='history'?`Projection applies the source's monthly ${viewGrade()==='psa9'?'Grade 9 (all graders) ':''}price trend over ${projection.months} months (${projection.annualRate>=0?'+':'−'}${Math.abs(Math.round(projection.annualRate*100))}% a year) to the sold median, because the source lists only recent sales. Held-out test: last ${projection.validation.months} months, ${Math.round(projection.validation.mape*100)}% average error (${Math.round(projection.validation.baselineMape*100)}% for unchanged prices). `:`Projection uses daily sold medians from the past year${projection.historyReason?'; the monthly source history was also checked':''}. ${projection.available?`Held-out test: ${Math.round(projection.validation.spanDays)} days, ${Math.round(projection.validation.mape*100)}% average error (${Math.round(projection.validation.baselineMape*100)}% for unchanged prices). `:''}`}The 1–3 year extrapolation is illustrative; its future accuracy is unverified. This is not investment advice.</p></div>`;
 const actions=`<div class="detail-actions"><button class="button primary" id="detail-watch">${w?icon('star-fill')+' Watching':icon('star')+' Add to watchlist'}</button><button class="button" id="detail-dex" aria-label="Add ${esc(c.name)} to your Dex">${icon('plus')} Dex</button><button class="button" id="refresh-card" aria-label="Refresh this card">${icon('refresh')}</button></div>`;
 const limitSec=`${w?`<div class="detail-section"><h3>Your buy limit</h3><form id="target-form" class="target-form"><label for="custom-target">Maximum price (USD)<input id="custom-target" type="number" min="0.01" max="1000000" step="0.01" value="${w.target??a.target??''}" placeholder="Set a price" required></label><button class="button" type="submit">Save</button></form><button id="reset-target" class="remove-watch">Use suggested target</button><p class="sales-note">Alerts fire when this card is listed at or under ${target!=null?money(target):'your limit'} including shipping. <button class="link-button" id="open-alerts">Alert settings</button></p></div>`:''}`;
 const salesSec=`<div class="detail-section sales"><div class="section-heading"><h3>Recent sales</h3><small>${loading?'Loading…':a.all.length+' observed'}</small></div>${a.all.length?a.all.slice(0,f?24:8).map(s=>`<div class="sale-row"><span>${date(s.date)}</span><a href="${esc(s.source||c.source)}" target="_blank" rel="noopener noreferrer">${esc(s.marketplace||'Source')}${viewGrade()==='raw'?' · '+esc(s.condition):''}</a><strong>${money(s.price)}</strong>${s.title?`<span class="sale-title">${esc(s.title)}</span>`:''}</div>`).join(''):'<p class="sales-note">No matching sales loaded for this grade. Refresh or check the source.</p>'}<p class="sales-note">${viewGrade()==='raw'?'Raw conditions are shown as reported; only NM enters targets. ':'PSA sales are kept separate from other graders. '}${a.all.length?'Reported by PriceCharting.':'Targets use reported matching sales.'}${a.excluded?' '+a.excluded+' outliers excluded from targets.':''}</p></div>`;
 const historySec=`${loading?'':cardChartSection(c,m)}`;
 const researchSec=`<div class="detail-section research"><h3>Sales coverage</h3>${c.printing?`<p>English · ${esc(c.printing)}. Sales must match this printing; other variants have separate values.</p>`:''}${c.modern&&!c.sourceVerified?'<p>Exact product source not verified; prices and scores are withheld.</p>':''}${c.japanese?`<p>Japanese printing${c.pcName?' · price-guide product “'+esc(c.pcName)+'”':''}. Only Japanese listings count, and it is scored and ranked against Japanese cards only.</p>`:''}<p>${['raw','psa9','psa10'].map(g=>gradeNames[g]+': '+analyze(m,g).comparable.length+' matching sales').join(' · ')}</p>${popLine(m)}<p>${m?.research?.status==='full'?'Read from the full source page'+(m.research.checkedAt?' on '+new Date(m.research.checkedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'')+'. Listings with other graders, wrong numbers or variants are left out. This is a source-page snapshot, not complete eBay sales history.':m?.research?.status==='unavailable'?'The public source could not be retrieved. Saved guides keep their original date.':'Coverage reflects the public sales retrieved, and can be incomplete. Targets use only matching recent sales.'}</p></div>`;
 const scenarioSec=`<div class="detail-section scenarios"><h3>Five-year scenarios <span class="muted">· 2031</span></h3><div class="scenario-grid">${['Bear','Steady','Strong'].map((label,i)=>`<div><span>${label}</span><strong>${forecasts[i]}</strong><small>${['−7%','+5%','+12%'][i]} / year</small></div>`).join('')}</div><p class="sales-note">Illustrative scenarios, using the ${comparison} comparable median. Not a backtested forecast.</p></div>`;
 const footer=`<button class="mobile-expand" id="expand-details">${state.expanded?'Show fewer details':'See sales & five-year scenarios'}</button><div class="source-line"><span>${(referenceSource?.observedAt||m?.observedAt)?'Checked '+new Date(referenceSource?.observedAt||m.observedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Price data not yet loaded'}</span><a href="${esc(referenceSource?.url||m?.sourceUrl||c.source)}" target="_blank" rel="noopener noreferrer">${referenceSource?.name?esc(referenceSource.name)+' · ':m?.source?esc(m.source)+' · ':''}View source</a></div>`;
 // Language versions: an English card lists its Japanese printings; a Japanese card links to its English counterpart.
 const goto=(id,label)=>{const t=cardById(id);return t?`<button class="lang-link ${t.id===c.id?'current':''}" data-version="${t.id}"><img src="${t.image}"${t.imageAlt?` data-alt="${t.imageAlt}"`:''} alt="" loading="lazy"><span><strong>${esc(t.name)}${t.japanese?'<span class="lang-tag">JP</span>':''}</strong><small>${esc(t.setName)} · ${numberCaption(t)}${label?' · '+esc(label):''}</small></span></button>`:'';};
 const langSec=c.japanese?`<div class="detail-section lang-versions"><h3>English version</h3>${c.englishId?goto(c.englishId,'')+`<p class="sales-note">Reviewed counterpart with the same artwork and printing. Official set names and collector numbers can differ. Prices are kept separately: Japanese and English copies sell at different prices.</p>`:`<p class="sales-note">No verified English counterpart of this exact printing is available. A matching name, illustrator or card stats alone cannot confirm a counterpart.</p>`}</div>`
  :c.japaneseIds?.length?`<div class="detail-section lang-versions"><h3>Japanese version${c.japaneseIds.length>1?'s':''}</h3>${c.japaneseIds.map(id=>goto(id,'')).join('')}<p class="sales-note">Reviewed counterpart with the same artwork and printing. Official set names and collector numbers can differ. Prices are tracked separately.</p></div>`:'';
 const jaSet=state.sets.find(x=>x.id===c.setId),jaLine=state.showJapanese?[c.nameJa&&c.nameJa!==c.name?c.nameJa:'',jaSet?.nameJa||''].filter(Boolean).join(' · '):'';
 const jaTop=c.japanese?top.replace(`<h2>${esc(c.name)}</h2>`,`<h2>${esc(c.name)}</h2>${jaLine?`<p class="name-ja" lang="ja">${esc(jaLine)}</p>`:''}`).replace(`<span class="type-pill">${esc(c.type)}</span>`,`<span class="type-pill lang-pill">Japanese</span><span class="type-pill">${esc(c.rarity)}</span>`):top;
 if(c.japanese&&!c.source){
  const pending=`<div class="buy-box insufficient jp-pending"><div class="eyebrow">JAPANESE ${esc(gradeNames[viewGrade()].toUpperCase())} PRICES</div><div class="buy-amount"><strong>Not matched yet</strong></div><p>This card hasn't been matched to its exact Japanese price-guide product yet. <b>Find prices</b> matches every card in its set and loads their prices; it never borrows the English card's value.</p></div>`;
  const jaActions=actions.replace(/<button class="button" id="refresh-card"[\s\S]*?<\/button>/,`<button class="button" id="refresh-card">${icon('refresh')} Find prices</button>`);
  const jaSource=`<div class="detail-section research"><h3>Card data</h3><p>Japanese checklist${c.illustrator?' · illustrated by '+esc(c.illustrator):''}.${c.nameIsJapanese&&!c.nameFromGuide&&!c.nameDisplayOnly?' No English name is recorded for this card yet, so its Japanese name is shown.':''}</p><p class="sales-note">Japanese cards are priced, scored and ranked only against other Japanese cards.</p></div>`;
  const jaFooter=`<div class="source-line"><span>Japanese checklist</span><a href="${esc(sourceSet.checklistSource)}" target="_blank" rel="noopener noreferrer">TCGdex · View source</a></div>`;
  el.innerHTML=f?focusBar(c)+`<div class="focus-body">${versionBar(base,c,false)}<div class="focus-hero">${jaTop}<div class="focus-key">${pending}${jaActions}</div></div><div class="focus-grid"><div class="focus-col">${limitSec}${jaSource}</div><div class="focus-col wide">${langSec}</div></div>${jaFooter}</div>`
   :versionBar(base,c,true)+jaTop+pending+jaActions+langSec+limitSec+jaSource+jaFooter;
 }else el.innerHTML=f?focusBar(c)+`<div class="focus-body">${versionBar(base,c,false)}<div class="focus-hero">${jaTop}<div class="focus-key">${buy}${metrics}${actions}</div></div><div class="focus-grid"><div class="focus-col">${marketHtml}${scoreHtml}${langSec}${limitSec}${researchSec}${scenarioSec}</div><div class="focus-col wide">${chartSec}${historySec}${salesSec}</div></div>${footer}</div>`
  :versionBar(base,c,true)+jaTop+buy+metrics+marketHtml+scoreHtml+chartSec+actions+langSec+limitSec+salesSec+historySec+researchSec+scenarioSec+footer;
 $('#detail-watch').onclick=()=>toggleWatch(c.id,$('#detail-watch'));
 $('#detail-dex').onclick=()=>openDexDialog({card_id:c.id,grade:viewGrade()});
 if($('#refresh-card'))$('#refresh-card').onclick=()=>refreshCard(c);
 if($('#expand-details'))$('#expand-details').onclick=()=>{state.expanded=!state.expanded;renderDetail();};
 $('#detail').querySelectorAll('[data-version]').forEach(b=>b.onclick=()=>{const t=cardById(b.dataset.version);if(t)showVersion(langOf(t),t.id);});
 $('#detail').querySelectorAll('[data-detail-lang]').forEach(b=>b.onclick=()=>showVersion(b.dataset.detailLang));
 $('#detail').querySelectorAll('[data-detail-grade]').forEach(b=>b.onclick=()=>showGrade(b.dataset.detailGrade));
 if($('#detail-focus'))$('#detail-focus').onclick=()=>setFocus(true);
 if(f)wireFocusBar();
 if($('#score-method'))$('#score-method').onclick=()=>$('#method-dialog').showModal();
 if($('#score-retry'))$('#score-retry').onclick=()=>{state.scoreError=null;renderDetail();loadScores();};
 if(w){$('#target-form').onsubmit=e=>{e.preventDefault();saveTarget(c.id,Number($('#custom-target').value));};$('#reset-target').onclick=()=>saveTarget(c.id,null);$('#open-alerts').onclick=()=>{state.view='alerts';updateView();};}
 wireResearch(c);wireCardMetrics();wireCardChart();wireImages();wireCharts($('#detail'));
 if(f){const again=keep&&document.getElementById?.(keep);(again||$('#focus-close'))?.focus?.();}
}
// Reading view: the card panel expanded over the page, with grade tabs and previous/next.
function focusNeighbors(){const list=filteredCards(),i=list.findIndex(c=>c.id===state.selected);return {list,i,prev:i>0?list[i-1]:null,next:i>=0&&i<list.length-1?list[i+1]:null};}
function focusBar(c){
 const {list,i,prev,next}=focusNeighbors();
 return `<div class="focus-bar"><div class="focus-title"><span class="focus-label">CARD INSIGHT</span><strong>${esc(c.name)}</strong><small>${esc(c.setName)} · ${numberCaption(c)}</small></div>
 <div class="grade-tabs" role="tablist" aria-label="Grade">${['raw','psa9','psa10'].map(g=>`<button role="tab" class="grade-tab ${g===viewGrade()?'active':''}" data-focus-grade="${g}" aria-selected="${g===viewGrade()}" title="${gradeNames[g]}">${{raw:'Raw NM',psa9:'PSA 9',psa10:'PSA 10'}[g]}</button>`).join('')}${['en','ja'].map(l=>{const t=counterpart(cardById(state.selected),l),on=langOf(c)===l;return `<button role="tab" class="grade-tab lang-tab ${on?'active':''}" data-detail-lang="${l}" aria-selected="${on}" ${t?'':'disabled'} title="${l==='ja'?'Japanese printing':'English printing'}">${l==='ja'?'JP':'EN'}</button>`;}).join('')}</div>
 <div class="focus-nav">${i>=0?`<span class="focus-count">${i+1} of ${list.length}</span>`:''}<button class="icon-button" id="focus-prev" aria-label="Previous card${prev?': '+esc(prev.name):''}" ${prev?'':'disabled'}>${icon('chev-left')}</button><button class="icon-button" id="focus-next" aria-label="Next card${next?': '+esc(next.name):''}" ${next?'':'disabled'}>${icon('chev-right')}</button><button class="icon-button" id="focus-close" aria-label="Close expanded view" title="Close (Esc)">${icon('close')}</button></div></div>`;
}
function wireFocusBar(){
 $('#focus-close').onclick=()=>setFocus(false);
 const {prev,next}=focusNeighbors();
 $('#focus-prev').onclick=()=>prev&&select(prev.id);$('#focus-next').onclick=()=>next&&select(next.id);
 $('#detail').querySelectorAll('[data-focus-grade]').forEach(b=>b.onclick=()=>showGrade(b.dataset.focusGrade));
}
function setFocus(on){
 if(state.focus===on)return;state.focus=on;
 document.body?.classList.toggle('detail-open',on);
 if($('#detail-backdrop'))$('#detail-backdrop').hidden=!on;
 document.querySelectorAll('.sidebar,#screener,#summary-grid,.catalog-panel,.page-heading,.page-footer').forEach(n=>{n.inert=on;});
 const d=$('#detail');d.setAttribute('role',on?'dialog':'complementary');d.setAttribute('aria-modal',on?'true':'false');
 renderDetail();d.scrollTop=0;
 if(!on)$('#detail-focus')?.focus?.();
}
async function select(id){state.selected=id;resetDetailVersion();state.expanded=false;renderList();renderDetail();$('#detail').scrollTop=0;if(!state.full[id])await loadCard(id);}
async function loadCard(id){selectionController?.abort();selectionController=new AbortController();try{const r=await request(`/api/market?id=${encodeURIComponent(id)}`,{signal:selectionController.signal});if(r.market){state.markets[id]=r.market;state.full[id]=true;}if(r.score)state.scoreDetail[id]=r.score;if(r.investment)state.investDetail[id]=r.investment;if(state.selected===id||shownCard()?.id===id)renderDetail();}catch(e){if(e.name!=='AbortError')toast('Could not load this card. Try Refresh.');}}
async function toggleWatch(id,button){const w=matchingWatch(id,viewGrade()),grade=viewGrade();button.disabled=true;try{const r=await send('/api/watchlist',w?'DELETE':'POST',{card_id:id,grade,target:null});state.watch=r.watchlist;toast(w?'Removed from watchlist.':'Saved to your watchlist.');stats();renderList();renderDetail();}catch(e){error(e.message);button.disabled=false;}}
async function saveTarget(id,target){const button=$('#target-form button');if(button)button.disabled=true;try{const r=await send('/api/watchlist','POST',{card_id:id,grade:viewGrade(),target});state.watch=r.watchlist;renderList();renderDetail();toast(target==null?'Using the suggested target.':'Your buy limit is saved.');}catch(e){error(e.message);if(button)button.disabled=false;}}
async function refreshCard(c){const b=$('#refresh-card');b.disabled=true;b.textContent='…';try{const r=await request(`/api/market?id=${encodeURIComponent(c.id)}&refresh=1`);if(r.mapping)applyMapping(r.mapping,c.setId);if(r.market?.sourceUrl&&c.japanese&&!c.source){c.source=r.market.sourceUrl;c.sourceVerified=true;}if(r.market){state.markets[c.id]=r.market;state.full[c.id]=true;}if(r.investment)state.investDetail[c.id]=r.investment;if(r.score){state.scoreDetail[c.id]=r.score;if(state.scores)state.scores[c.id]=['psa10','psa9','raw'].map(g=>r.score[g]?.score??null);}if(r.refreshed)dropMarketCaches();toast(r.refreshed?'Latest source data saved.':r.warning||'The source is unavailable. Showing saved observations.');renderList();renderDetail();stats();}catch(e){toast(e.message);b.disabled=false;b.innerHTML=icon('refresh');}}
let refreshRun;
// Fetch the newest sold prices for one or more scopes ('all', 'era:XY' or a set id), a few cards at a time.
// What is fetched is saved as it goes, so cancelling keeps the progress.
const inRefreshScope=(c,sc,langs)=>c.eligible&&langs.includes(langOf(c))&&(sc==='all'||(sc.startsWith('era:')?c.series===sc.slice(4):c.setId===sc));
const scopeSize=(sc,langs=LANGS.map(l=>l.id))=>state.cards.filter(c=>c.source&&inRefreshScope(c,sc,langs)).length;
// Japanese sets are matched to their price-guide products before their sales can be fetched.
// Mapping also saves each matched product's guide prices, so prices appear right away.
async function mapJapaneseSets(scopes,langs,signal,progress){
 if(!langs.includes('ja'))return 0;
 const pending=[...new Set(state.cards.filter(c=>c.japanese&&!c.source&&!c.mapTried&&scopes.some(sc=>inRefreshScope(c,sc,langs))).map(c=>c.setId))];
 let mapped=0;
 for(const [i,setId] of pending.entries()){
  progress?.(`Matching Japanese sets ${i+1} / ${pending.length}`);
  const r=await request('/api/refresh?set='+encodeURIComponent(setId),{method:'POST',signal});
  applyMapping(r,setId);mapped+=r.mapped||0;
 }
 return mapped;
}
function applyMapping(r,setId){
 for(const c of state.cards)if(c.setId===setId)c.mapTried=true;
 for(const [id,s] of Object.entries(r.sources||{})){const c=cardById(id);if(c){c.source=s.source;c.sourceVerified=true;if(s.image&&c.imagePlaceholder){c.image=s.image;c.imagePlaceholder=false;}if(s.name){c.pcName=s.name;if(c.nameIsJapanese){c.name=s.name;c.nameFromGuide=true;}}}}
 for(const [id,m] of Object.entries(r.markets||{})){state.markets[id]=expandMarket(m);delete state.full[id];}
}
const updateLabel=()=>'Update sales · '+state.cards.filter(c=>c.eligible&&langOf(c)===state.marketLang&&state.marketSeries.includes(c.series)).length.toLocaleString()+(state.marketLang==='ja'?' Japanese':'')+' cards';
function setRefreshLabels(text){
 const busy=!!text,b=$('#refresh-set');
 if(b){if(busy)b.textContent=text;else b.innerHTML=icon('refresh')+' Refresh sales';b.disabled=false;}
 document.querySelectorAll('[data-update-sales]').forEach(x=>{x.textContent=busy?text:updateLabel();});
}
// Cards whose full sales page was read this recently are skipped, so an interrupted update resumes
// where it stopped. Cards never read come first (most valuable first), then the oldest reads.
const FRESH_HOURS=6;
const checkedAt=c=>Date.parse(state.markets[c.id]?.research?.checkedAt||'')||0;
const guideValue=c=>{const g=state.markets[c.id]?.guide||{};return Math.max(g.psa10||0,g.grade9||0,g.raw||0);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
// One batch of up to four cards. A dropped connection or busy server is retried twice before giving up.
async function researchBatch(batch,signal){
 for(let attempt=0;;attempt++){
  try{return await request('/api/research?ids='+batch.map(c=>encodeURIComponent(c.id)).join(','),{method:'POST',signal});}
  catch(e){if(e.name==='AbortError'||attempt>=2||(e.status&&e.status<500&&e.status!==429))throw e;await pause(3000*(attempt+1));}
 }
}
// The list holds thousands of cards, so an update redraws it at most once every 2 seconds.
let lastDraw=0;
function drawProgress(force){if(!force&&Date.now()-lastDraw<2000)return;lastDraw=Date.now();if(state.view==='browse'||state.view==='watch'){stats();renderList();renderDetail();}}
function applyMarkets(markets){for(const [id,m] of Object.entries(markets||{})){state.markets[id]=expandMarket(m);delete state.full[id];delete state.scoreDetail[id];delete state.investDetail[id];}}
const updateSummary=(updated,grand,skipped,failed)=>'Refreshed sales for '+updated.toLocaleString()+' of '+grand.toLocaleString()+' rare cards'+(skipped?' · '+skipped.toLocaleString()+' already checked in the last '+FRESH_HOURS+' h':'')+(failed?' · '+failed+' could not be read (try again later)':'')+'.';
// The server reads the pages itself and keeps going if this page is closed; the page follows its
// progress and shows new prices as they arrive. Returns null where the server cannot run the job
// (then the page reads batches itself). `resume` is a job already running when the page loaded:
// the page follows it from where it is now (the catalog it just loaded has the earlier cards).
async function followServerUpdate(scopes,langs,signal,resume=null){
 const start=resume||await request('/api/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scopes,langs}),signal});
 if(start.unavailable||(!start.job&&start.grand==null&&!start.warning))return null;
 if(start.warning){toast(start.warning);return {job:null,updated:0};}
 if(!start.job){toast(start.grand?'Every card here was checked in the last '+FRESH_HOURS+' hours. Nothing to update.':'No cards here have a price source yet.');return {job:null,updated:0};}
 if(start.joined)toast('An update is already running'+(start.mine?'':' from another account')+'. Showing its progress.');
 // Cancel stops the server's job (only the account that started it can); otherwise it just stops following.
 const stop=()=>{if(start.mine)request('/api/update',{method:'DELETE'}).catch(()=>{});};
 signal.addEventListener('abort',stop,{once:true});
 let job=start.job,since=resume?job.next:0,updated=0;
 try{
  for(;;){
   setRefreshLabels('Cancel · '+job.done.toLocaleString()+' / '+job.total.toLocaleString());
   if(job.state!=='running'&&since>=job.updated)break;
   if(job.state==='running')await pause(1500);
   if(signal.aborted){const e=new Error('The update was stopped.');e.name='AbortError';throw e;}
   const r=await request('/api/update?since='+since,{signal});if(!r.job)break;
   job=r.job;applyMarkets(job.markets);since=job.next;updated+=Object.keys(job.markets||{}).length;
   if(job.changed.length)drawProgress();
  }
 }finally{signal.removeEventListener('abort',stop);}
 return {job,updated};
}
async function refreshSales(scopes,langs=LANGS.map(l=>l.id),resume=null){
 if(refreshRun){refreshRun.abort();return;}
 const controller=new AbortController();refreshRun=controller;
 let updated=0,grand=0,skipped=0;const failed=new Map();
 setRefreshLabels('Cancel update');
 try{
  if(!resume)await mapJapaneseSets(scopes,langs,controller.signal,setRefreshLabels);
  const served=await followServerUpdate(scopes,langs,controller.signal,resume);
  if(served){
   const j=served.job;updated=served.updated;if(!j)return;
   toast(j.state==='cancelled'?'Update stopped. Retrieved sales are saved; the next update continues from here.':j.state==='failed'?(j.error||'The update failed.')+' Retrieved sales are saved; run the update again to continue.':updateSummary(j.updated,j.grand,j.skipped,j.failed));
   return;
  }
  const now=Date.now(),inScope=state.cards.filter(c=>c.source&&scopes.some(sc=>inRefreshScope(c,sc,langs)));
  const queue=inScope.filter(c=>now-checkedAt(c)>=FRESH_HOURS*3600000).sort((a,b)=>(checkedAt(a)?1:0)-(checkedAt(b)?1:0)||checkedAt(a)-checkedAt(b)||guideValue(b)-guideValue(a));
  grand=inScope.length;skipped=grand-queue.length;
  let n=0;
  const run=async list=>{
   for(let i=0;i<list.length;i+=4){
    const batch=list.slice(i,i+4),r=await researchBatch(batch,controller.signal);
    applyMarkets(r.markets);for(const id of Object.keys(r.markets||{}))failed.delete(id);
    for(const f of r.failures||[])failed.set(f.card_id,f.message);
    updated+=r.count||0;n+=batch.length;
    drawProgress();
    if(r.warning){toast(r.warning);return false;}
    setRefreshLabels('Cancel · '+n.toLocaleString()+' / '+queue.length.toLocaleString());
   }
   return true;
  };
  if(!queue.length){toast(grand?'Every card here was checked in the last '+FRESH_HOURS+' hours. Nothing to update.':'No cards here have a price source yet.');return;}
  if(!await run(queue))return;
  if(failed.size){
   // One more pass for cards whose page could not be read, after a short rest.
   setRefreshLabels('Retrying '+failed.size+' cards');await pause(5000);
   const retry=[...failed.keys()].map(cardById).filter(Boolean);failed.clear();
   n=0;if(!await run(retry))return;
  }
  toast(updateSummary(updated,grand,skipped,failed.size));
 }catch(e){toast(e.name==='AbortError'?'Update stopped. Retrieved sales are saved; the next update continues from here.':e.message+' Retrieved sales are saved; run the update again to continue.');}
 finally{
  refreshRun=null;setRefreshLabels('');
  if(updated){drawProgress(true);$('#snapshot-label').textContent='Sales checked just now';$('#status-data').textContent='Sales checked just now · '+state.cards.filter(c=>c.eligible).length.toLocaleString()+' rare cards';invalidateMarketViews();}
 }
}
function refreshSet(){
 const scope=state.setId;
 return refreshSales(scope==='all'&&state.eras.length<state.series.length?state.eras.map(e=>'era:'+e):[scope],scope!=='all'&&!scope.startsWith('era:')?[activeSet()?.lang||'en']:state.langs);
}
// After a reload, follow an Update sales job that is still running on the server.
async function resumeUpdate(){
 try{const r=await request('/api/update?since='+Number.MAX_SAFE_INTEGER);if(r.job?.state!=='running'||refreshRun)return;toast('Update sales is still running'+(r.mine?'':' from another account')+'. Showing its progress.');await refreshSales(null,null,r);}catch{}
}
function updateMarketSales(){
 return refreshSales(state.marketSeries.length===state.series.length?['all']:state.marketSeries.map(e=>'era:'+e),[state.marketLang]);
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
  ${s.sold?`<div class="dex-tile"><span>Realized P/L</span><strong>${s.realizedCost?plText(s.realized,s.realizedPct):'—'}</strong><small>${s.sold} sold entr${s.sold===1?'y':'ies'} · ${money(s.proceeds)} received</small></div>`:''}
  <div class="dex-tile"><span>Best performer</span><strong class="small">${(()=>{const b=s.rows.filter(r=>r.plPct!=null&&!r.sold).sort((a,b)=>b.plPct-a.plPct)[0];return b?esc(cardById(b.card_id)?.name||b.card_id)+' '+plText(b.pl,b.plPct):'—';})()}</strong><small>By percentage return</small></div>
 </div>
 <div class="dex-layout">
  <section class="panel dex-chart-panel" aria-label="Value and cost over time"><div class="panel-head"><div><h2>Value vs. cost</h2><p>Your collection's market value each month against what you paid.</p></div><div class="segmented" role="group" aria-label="Chart range">${Object.keys(ranges).map(k=>`<button data-range="${k}" aria-pressed="${state.dex.range===k}" class="${state.dex.range===k?'active':''}">${k==='all'?'All':k.toUpperCase()}</button>`).join('')}</div></div>
   ${empty?'<div class="chart-empty tall">Your chart appears once you add cards.</div>':lineChart({series:[{label:'Value',color:C.accent,area:true,points:shown.map(p=>[p.month,p.value,monthLabel(p.month)])},{label:'Cost',color:C.cost,dash:true,points:shown.map(p=>[p.month,p.cost,monthLabel(p.month)])}],height:230,label:'Collection value and cost basis by month'})}
   <p class="sales-note">Monthly values use each card's price history for its grade; the latest point uses today's reference price. Months before a price history exists use the price paid. Fees, shipping and tax are not included.</p></section>
  <section class="panel dex-holdings" aria-label="Cards in your Dex"><div class="panel-head"><div><h2>Your cards</h2><p>${empty?'Nothing here yet.':'Tap a card to edit it or see its own P/L.'}</p></div><div class="holdings-tools"><label class="sort-control"><span class="sr-only">Sort Dex</span><select id="dex-sort">${[['value','Highest value'],['pl','Best P/L'],['recent','Recently bought'],['set','Set order']].map(([v,l])=>`<option value="${v}" ${state.dex.sort===v?'selected':''}>${l}</option>`).join('')}</select></label><button class="button primary" id="dex-add">＋ Add a card</button></div></div>
   ${empty?`<div class="empty-state"><strong>Start your Dex.</strong><p>Add cards you own with what you paid, and FutureSight keeps their value and profit up to date.</p><button class="button primary" id="dex-add-empty">Add your first card</button></div>`:`<div class="dex-grid">${rows.map(r=>{const c=cardById(r.card_id);if(!c)return '';return `<button class="dex-card" data-entry="${r.id}" aria-label="${esc(c.name)} ${gradeNames[r.grade]}, value ${money(r.value)}"><img src="${c.image}"${c.imageAlt?` data-alt="${c.imageAlt}"`:''} alt="" loading="lazy"><span class="dex-card-body"><span class="dex-name">${esc(c.name)}</span><span class="dex-sub">${esc(c.setName)} · ${numberCaption(c)}</span><span class="dex-chips"><span class="grade-chip ${r.grade}">${gradeNames[r.grade].replace(' · near mint','')}</span>${r.quantity>1?`<span class="qty-chip">×${r.quantity}</span>`:''}${r.sold?'<span class="qty-chip sold-chip">Sold</span>':''}</span><span class="dex-value">${r.sold?money(r.proceeds)+`<small>sold ${date(r.sold_date)}</small>`:money(r.value)+`<small>${r.basis?esc(r.basis):'no price yet'}</small>`}</span><span class="dex-pl">${r.cost!=null?plText(r.pl,r.plPct)+(r.sold?' <small class="muted">realized</small>':''):'<span class="muted">Paid: not set</span>'}</span></span></button>`;}).join('')}</div>`}
  </section>
 </div>
 ${empty?'':dexAnalytics(s)}
 ${empty?'':`<section class="panel binder-panel" aria-label="Set progress"><div class="panel-head"><div><h2>Binder progress</h2><p>Rare cards you own in each set you collect.</p></div></div><div class="binder-list">${binderProgress().map(b=>`<button class="binder-row" data-binder="${b.set.id}"><span class="binder-name"><b>${esc(b.set.name)}</b><small>${esc(state.series.find(x=>x.id===b.set.series)?.label||'')} · ${b.set.release.slice(0,4)}</small></span><span class="binder-bar" role="img" aria-label="${b.owned} of ${b.total} rare cards"><i style="width:${Math.max(2,Math.round(b.owned/b.total*100))}%"></i></span><span class="binder-count">${b.owned}<small>/ ${b.total}</small></span></button>`).join('')}</div></section>`}`;
 wireDexAnalytics(view);
 view.querySelectorAll('[data-binder]').forEach(b=>b.onclick=()=>{state.view='browse';state.setId=b.dataset.binder;state.category='all';state.query='';$('#search').value='';updateView();});
 view.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{state.dex.range=b.dataset.range;renderDex();});
 const sort=view.querySelector('#dex-sort');if(sort)sort.onchange=e=>{state.dex.sort=e.target.value;renderDex();};
 view.querySelectorAll('#dex-add,#dex-add-empty').forEach(b=>b.onclick=()=>openDexDialog({}));
 view.querySelectorAll('[data-entry]').forEach(b=>b.onclick=()=>openDexDialog(state.dex.entries.find(e=>String(e.id)===b.dataset.entry)));
 wireImages();wireCharts(view);
}
// ---------- Dex analytics ----------
// Allocation, risk and concentration, performance against the market index, and what-if moves, for the
// cards held now. Groups and metrics come from /api/portfolio; values from the Dex's own prices.
async function loadDexInfo(){
 const d=state.dex;if(d.info)return;d.info={loading:true};
 try{d.info=await request('/api/portfolio');}catch(e){d.info={error:e.message};}
 if(state.view==='dex')renderDex();
}
const ALLOC_DIMS=[['char','Pokémon'],['setName','Set'],['series','Era'],['grade','Grade'],['tier','Rarity tier'],['lang','Language']];
function allocName(dim,key){const i=state.dex.info;return dim==='grade'?gradeNames[key]||key:dim==='series'?i?.eras?.[key]||key:dim==='lang'?(LANGS.find(l=>l.id===key)?.label||key):key;}
function barList(items,limit=10){const top=items.slice(0,limit),rest=items.slice(limit),other=rest.reduce((n,x)=>n+x.value,0),total=items.reduce((n,x)=>n+x.value,0);
 return `<ol class="alloc-list">${[...top,...(other?[{name:'Everything else ('+rest.length+')',value:other,share:total?other/total:0}]:[])].map(x=>`<li><span class="alloc-name">${esc(x.name)}</span><span class="alloc-bar"><i style="width:${Math.max(1,x.share*100).toFixed(1)}%"></i></span><span class="alloc-share">${share(x.share)}</span><span class="alloc-value">${bigMoney(x.value)}</span></li>`).join('')}</ol>`;}
function dexAnalytics(s){
 const d=state.dex,info=d.info;if(!info)loadDexInfo();
 const tabs=[['alloc','Allocation'],['risk','Risk'],['vs','vs Market'],['what','What-if']];
 const head=`<div class="panel-head"><div><h2>Portfolio analytics</h2><p>The cards you hold now, at today's values.</p></div><div class="segmented" role="group" aria-label="Analytics">${tabs.map(([k,l])=>`<button data-dex-tab="${k}" class="${d.tab===k?'active':''}" aria-pressed="${d.tab===k}">${l}</button>`).join('')}</div></div>`;
 if(!info||info.loading)return `<section class="panel dex-analytics">${head}${loadingBox('Loading…')}</section>`;
 if(info.error)return `<section class="panel dex-analytics">${head}<p class="sales-note">${esc(info.error)}</p></section>`;
 const meta=info.meta||{},metrics=info.metrics||{};let body='';
 if(d.tab==='alloc'){
  const items=allocation(s.rows,meta,d.alloc).map(x=>({...x,name:allocName(d.alloc,x.key)}));
  body=`<div class="dex-tools"><div class="segmented" role="group" aria-label="Group by">${ALLOC_DIMS.map(([k,l])=>`<button data-dex-alloc="${k}" class="${d.alloc===k?'active':''}" aria-pressed="${d.alloc===k}">${l}</button>`).join('')}</div></div>${items.length?barList(items):'<p class="sales-note">No priced cards held.</p>'}${d.alloc==='char'?'<p class="sales-note">A card with several Pokémon splits its value between them. Trainers and items count as their own names.</p>':''}`;
 }else if(d.tab==='risk'){
  const c=concentration(s.rows,meta,metrics);
  if(!c)body='<p class="sales-note">No priced cards held.</p>';
  else{const top=cardById(c.top.card_id),cell=(l,v,t='')=>`<div${t?` title="${esc(t)}"`:''}><small>${l}</small><b>${v}</b></div>`;
   body=`<div class="metric-grid risk-grid">${cell('Largest holding',share(c.top.share),top?top.name+' · '+gradeNames[c.top.grade]:'')}${cell('Top 5 holdings',share(c.top5))}${cell('Effective holdings',c.effective.toFixed(1),'How many equal-sized holdings would have the same concentration (1 ÷ sum of squared weights)')}${cell('Largest Pokémon',c.char?esc(c.char.key)+' · '+share(c.char.share):'—')}${cell('Largest set',c.set?esc(c.set.key)+' · '+share(c.set.share):'—')}${cell('Beta to era',c.beta==null?'—':c.beta.toFixed(2),'Value-weighted beta of the cards with one ('+share(c.betaCovered)+' of value)')}${cell('Volatility',c.volatility==null?'—':Math.round(c.volatility*100)+'%','Value-weighted annualised volatility of each card\'s guide (ignores diversification, so the collection\'s own is lower)')}${cell('No sales in 90 days',share(c.illiquid),'Share of value in cards with no matching sale in the 90 days before their last read: harder to sell quickly')}</div>
    <p class="sales-note">${c.top.share>.25?'One card is over a quarter of your collection. ':''}${c.char&&c.char.share>.4?esc(c.char.key)+' is '+share(c.char.share)+' of your value, so its demand drives your results. ':''}Concentration is not bad in itself; it means fewer things decide how the collection does.</p>`;}
 }else if(d.tab==='vs'){
  const now=new Date(),months=[];for(let k=36;k>=0;k--)months.push(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-k,1)).toISOString().slice(0,7));
  const n={'1y':13,'3y':37}[d.vsRange],r=versusMarket(s.rows,meta,marketFor,info.levels||{},months.slice(-n));
  const ranges=`<div class="segmented" role="group" aria-label="Range">${[['1y','1Y'],['3y','3Y']].map(([k,l])=>`<button data-dex-vs="${k}" class="${d.vsRange===k?'active':''}" aria-pressed="${d.vsRange===k}">${l}</button>`).join('')}</div>`;
  body=r?`<div class="dex-tools">${ranges}<span class="muted">Since ${monthLabel(r.start)}: your cards ${pct(r.mine)} · market ${pct(r.market)} · ${r.mine>=r.market?'ahead by':'behind by'} ${Math.abs(Math.round((r.mine-r.market)*1000)/10)} points</span></div>${lineChart({series:[{label:'Your cards',color:C.accent,area:true,points:r.points.map(p=>[p[0],p[1],monthLabel(p[0])])},{label:'Market',color:'var(--info)',dash:true,points:r.points.map(p=>[p[0],p[2],monthLabel(p[0])])}],height:220,width:720,label:'Your cards against the market index',format:v=>v.toFixed(1),tick:v=>v.toFixed(0)})}<p class="sales-note">Your current cards at fixed quantities, from their monthly guide, against the same starting amounts moving like their language and grade's market index (typical card). Starts at the first month every card has a price. Purchases, sales and fees are left out, so this measures what you hold, not your trading.</p>`
   :`<div class="dex-tools">${ranges}</div><p class="sales-note">Needs a monthly guide price for every card you hold and market index history over the range. ${info.levels&&Object.values(info.levels).some(l=>l.length)?'One of your cards has no price that far back; try a shorter range.':'Market metrics have not been built yet.'}</p>`;
 }else{
  const w=d.what,dims=[['market','Whole market'],['char','Pokémon'],['setName','Set'],['series','Era'],['grade','Grade'],['tier','Rarity tier']];
  const keys=w.dim==='market'?[]:allocation(s.rows,meta,w.dim).filter(x=>x.key!=='Other').map(x=>x.key);if(w.dim!=='market'&&!keys.includes(w.key))w.key=keys[0]||'';
  const r=whatIf(s.rows,meta,metrics,w);
  body=`<div class="whatif"><label>If<select id="dex-what-dim">${dims.map(([k,l])=>`<option value="${k}" ${w.dim===k?'selected':''}>${l}</option>`).join('')}</select></label>${w.dim==='market'?'':`<select id="dex-what-key" aria-label="Which">${keys.map(k=>`<option value="${esc(k)}" ${w.key===k?'selected':''}>${esc(allocName(w.dim,k))}</option>`).join('')}</select>`}<label>moves<span class="unit-input"><input id="dex-what-move" type="number" step="1" min="-100" max="500" value="${Math.round(w.move*100)}"><i>%</i></span></label></div>
   <div class="metric-grid">${[['Value now',money(r.before)],['Value after',money(r.after)],['Change',`<span class="pl ${r.change>=0?'up':'down'}">${signed(r.change)}</span>`],[w.dim==='market'?'Collection move':'Affected value',w.dim==='market'?pct(r.changePct):money(r.affected)]].map(([l,v])=>`<div><small>${l}</small><b>${v}</b></div>`).join('')}</div>
   <p class="sales-note">${w.dim==='market'?'Each card moves by its beta to its era (1 where unknown) times the market move.':'Cards in the group move by the chosen amount; a card shared by several Pokémon moves by its share.'} A scenario, not a forecast.</p>`;
 }
 return `<section class="panel dex-analytics">${head}<div class="dex-analytics-body">${body}</div></section>`;
}
function wireDexAnalytics(view){
 const d=state.dex;
 view.querySelectorAll('[data-dex-tab]').forEach(b=>b.onclick=()=>{d.tab=b.dataset.dexTab;renderDex();});
 view.querySelectorAll('[data-dex-alloc]').forEach(b=>b.onclick=()=>{d.alloc=b.dataset.dexAlloc;renderDex();});
 view.querySelectorAll('[data-dex-vs]').forEach(b=>b.onclick=()=>{d.vsRange=b.dataset.dexVs;renderDex();});
 const dim=view.querySelector('#dex-what-dim');if(dim)dim.onchange=()=>{d.what={...d.what,dim:dim.value,key:''};renderDex();};
 const key=view.querySelector('#dex-what-key');if(key)key.onchange=()=>{d.what.key=key.value;renderDex();};
 const move=view.querySelector('#dex-what-move');if(move)move.onchange=()=>{const v=Number(move.value);if(Number.isFinite(v)&&v>=-100&&v<=500){d.what.move=v/100;renderDex();}};
}
function binderProgress(){
 const ownedIds=new Set(state.dex.entries.filter(e=>e.sold_price==null).map(e=>e.card_id)),bySet=new Map();
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
   ${card?`<div class="dex-picked"><img src="${card.image}"${card.imageAlt?` data-alt="${card.imageAlt}"`:''} alt=""><div><strong>${esc(card.name)}</strong><span>${esc(card.setName)} · ${numberCaption(card)}</span>${editing?'<button type="button" class="link-button" id="dex-view-card">Open card details</button>':'<button type="button" class="link-button" id="dex-change">Choose a different card</button>'}</div></div>`:`<label class="field">Card<input id="dex-search" type="search" placeholder="Search by name, number or set" autocomplete="off" aria-describedby="dex-search-hint"></label><div id="dex-results" class="dex-results" role="listbox"></div><p class="field-hint" id="dex-search-hint">Type at least two letters.</p>`}
   <div class="field-row"><label class="field">Grade<select id="dex-grade">${['raw','psa9','psa10'].map(g=>`<option value="${g}" ${grade===g?'selected':''}>${gradeNames[g]}</option>`).join('')}</select></label><label class="field">Quantity<input id="dex-qty" type="number" min="1" max="999" step="1" value="${entry.quantity||1}"></label></div>
   <div class="field-row"><label class="field">Price paid each (USD)<input id="dex-price" type="number" min="0" max="1000000" step="0.01" value="${entry.purchase_price??''}" placeholder="Optional"></label><div class="field date-field"><span>Date bought</span><div class="date-parts"><select id="dex-date-month" aria-label="Purchase month"><option value="">Month</option>${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((name,i)=>{const value=String(i+1).padStart(2,'0');return `<option value="${value}" ${dateDraft.month===value?'selected':''}>${name}</option>`;}).join('')}</select><select id="dex-date-day" aria-label="Purchase day"><option value="">Day</option>${Array.from({length:31},(_,i)=>{const value=String(i+1).padStart(2,'0');return `<option value="${value}" ${dateDraft.day===value?'selected':''}>${i+1}</option>`;}).join('')}</select><select id="dex-date-year" aria-label="Purchase year"><option value="">Year</option>${(()=>{const current=Number(today.slice(0,4)),minimum=Number(MIN_PURCHASE_DATE.slice(0,4)),years=Array.from({length:current-minimum+1},(_,i)=>String(current-i));if(dateDraft.year&&Number(dateDraft.year)<minimum)years.push(dateDraft.year);return years.map(year=>`<option value="${year}" ${dateDraft.year===year?'selected':''}>${year}${Number(year)<minimum?' · existing':''}</option>`).join('');})()}</select></div><div class="date-shortcuts"><button type="button" class="link-button" id="dex-date-today">Today</button><button type="button" class="link-button" id="dex-date-clear">Clear</button><small>Optional · 2010 or later</small></div></div></div>
   <label class="field">Notes<input id="dex-notes" type="text" maxlength="280" value="${esc(entry.notes||'')}" placeholder="Cert number, where you bought it…"></label>
   <details class="dex-sold" ${entry.sold_price!=null?'open':''}><summary>${entry.sold_price!=null?'Sold':'Mark as sold'}</summary><div class="field-row"><label class="field">Sold for, each (USD)<input id="dex-sold-price" type="number" min="0" max="1000000" step="0.01" value="${entry.sold_price??''}" placeholder="Sale price"></label><label class="field">Date sold<input id="dex-sold-date" type="date" min="${MIN_PURCHASE_DATE}" max="${today}" value="${entry.sold_date||''}"></label></div><p class="field-hint">A sold entry leaves your collection's value and counts toward realized P/L. Clear both to hold it again.</p></details>
   ${card&&val?`<div class="dex-preview"><div><span>Value now</span><strong>${money(val.value)}</strong><small>${val.basis?esc(val.basis):'No price yet'}</small></div><div><span>P/L</span><strong>${val.cost!=null?plText(val.pl,val.plPct):'—'}</strong><small>${val.cost!=null?'vs '+money(val.cost)+' paid':'Add a price paid'}</small></div></div>${h.length>1?lineChart({series:[{label:gradeNames[grade],color:C.accent,area:true,points:h.map(([ym,v])=>[ym,v,monthLabel(ym)])}],height:180,width:480,label:'Price history for this card',reference:entry.purchase_price!=null?{value:entry.purchase_price,label:'Paid '+money(entry.purchase_price),color:C.cost,markIndex:paidIdx>=0?paidIdx:null}:null}):''}`:''}
   <p class="form-error" id="dex-error" role="alert" hidden></p>
   <div class="dialog-actions">${editing?'<button type="button" class="button danger" id="dex-delete">Remove</button>':''}<span></span><button type="button" class="button" id="dex-cancel">Cancel</button><button type="submit" class="button primary" id="dex-save">${editing?'Save changes':'Add to Dex'}</button></div>
  </div>`;
  const sync=()=>{dateDraft={month:$('#dex-date-month').value,day:$('#dex-date-day').value,year:$('#dex-date-year').value};entry={...entry,grade:$('#dex-grade').value,quantity:Number($('#dex-qty').value)||1,purchase_price:$('#dex-price').value===''?null:Number($('#dex-price').value),purchase_date:readDate(),notes:$('#dex-notes').value,sold_price:$('#dex-sold-price')?.value===''||$('#dex-sold-price')==null?null:Number($('#dex-sold-price').value),sold_date:$('#dex-sold-date')?.value||null};};
  $('#dex-close').onclick=$('#dex-cancel').onclick=()=>dlg.close();
  $('#dex-grade').onchange=()=>{sync();draw();};$('#dex-price').onchange=()=>{sync();draw();};
  for(const id of ['#dex-date-month','#dex-date-day','#dex-date-year'])$(id).onchange=sync;
  $('#dex-date-today').onclick=()=>{dateDraft={year:today.slice(0,4),month:today.slice(5,7),day:today.slice(8,10)};for(const [id,key] of [['#dex-date-month','month'],['#dex-date-day','day'],['#dex-date-year','year']])$(id).value=dateDraft[key];sync();};
  $('#dex-date-clear').onclick=()=>{dateDraft={year:'',month:'',day:''};for(const id of ['#dex-date-month','#dex-date-day','#dex-date-year'])$(id).value='';sync();};
  if($('#dex-view-card'))$('#dex-view-card').onclick=()=>{dlg.close();state.view='browse';state.setId=card.setId;state.category='all';state.grade=entry.grade||state.grade;$('#grade').value=state.grade;state.query='';$('#search').value='';updateView();select(card.id);};
  if($('#dex-change'))$('#dex-change').onclick=()=>{sync();card=null;draw();$('#dex-search').focus();};
  if($('#dex-search')){const s=$('#dex-search');s.oninput=()=>{const res=cardSearch(s.value);$('#dex-results').innerHTML=res.map(c=>`<button type="button" role="option" data-pick="${c.id}"><img src="${c.image}"${c.imageAlt?` data-alt="${c.imageAlt}"`:''} alt="" loading="lazy"><span><b>${esc(c.name)}</b><small>${esc(c.setName)} · ${numberCaption(c)}</small></span></button>`).join('')||(s.value.trim().length>1?'<p class="field-hint">No cards match.</p>':'');$('#dex-results').querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{sync();card=cardById(b.dataset.pick);entry.card_id=card.id;draw();});wireImages();};}
  if($('#dex-delete'))$('#dex-delete').onclick=async()=>{try{const r=await send('/api/collection','DELETE',{id:entry.id});applyDex(r);dlg.close();toast('Removed from your Dex.');}catch(e){$('#dex-error').textContent=e.message;$('#dex-error').hidden=false;}};
  form.onsubmit=async e=>{e.preventDefault();sync();if(!card){$('#dex-error').textContent='Choose a card first.';$('#dex-error').hidden=false;return;}if(entry.purchase_date==='invalid'){$('#dex-error').textContent='Choose a complete, valid purchase date from 2010 through today.';$('#dex-error').hidden=false;return;}
   const body={card_id:card.id,grade:entry.grade,quantity:entry.quantity,purchase_price:entry.purchase_price,purchase_date:entry.purchase_date,notes:entry.notes,sold_price:entry.sold_price??null,sold_date:entry.sold_date??null,...(editing?{id:entry.id}:{})};
   $('#dex-save').disabled=true;try{const r=await send('/api/collection',editing?'PUT':'POST',body);applyDex(r);dlg.close();toast(editing?'Dex entry saved.':card.name+' added to your Dex.');}catch(err){$('#dex-error').textContent=err.message;$('#dex-error').hidden=false;$('#dex-save').disabled=false;}};
  wireImages();wireCharts(form);
 };
 entry={grade:state.grade,quantity:1,...entry};draw();if(!dlg.open)dlg.showModal();
}
function applyDex(r){state.dex.info=null;state.dex.entries=r.collection;state.dex.markets={...state.dex.markets,...(r.markets||{})};state.dex.loaded=true;stats();if(state.view==='dex')renderDex();else{renderList();renderDetail();}}

// ---------- Alerts ----------
async function loadAlerts(quiet){try{const r=await request('/api/alerts');applyAlerts(r,quiet);}catch(e){if(!quiet)error(e.message);}loadSignals(quiet);}
// The Alerts page's market alerts: what fired, and every rule.
function marketAlertsPanel(){
 const sig=state.signals;if(!sig)return `<div class="panel-sub"><h3>Market alerts</h3>${loadingBox('Loading…')}</div>`;
 const open=t=>/^(?:en|ja):/.test(t)?`data-sig-index="${esc(t)}"`:`data-sig-card="${esc(t)}"`;
 const events=sig.events.length?`<div class="signal-events">${sig.events.slice(0,30).map(e=>`<article class="signal-event ${e.seen?'':'unseen'}"><span class="signal-kind">${esc(SIGNAL_TEXT[e.kind]||e.kind)}</span><button class="link-button" ${open(e.target)} data-sig-grade="${e.grade}" data-sig-seen="${e.id}">${esc(e.title)}</button><small>${ago(e.fired_at)}</small><button class="icon-button" data-sig-dismiss="${e.id}" aria-label="Dismiss">×</button></article>`).join('')}</div>`:'<p class="sales-note">Nothing has fired yet.</p>';
 const rules=sig.rules.length?`<ul class="signal-rules all">${sig.rules.map(r=>`<li><button class="link-button" ${open(r.target)} data-sig-grade="${r.grade}">${esc(r.name)}</button><span class="muted">${/^(?:en|ja):/.test(r.target)?'':gradeNames[r.grade]+' · '}${esc(ruleText(r))}</span>${r.fired_at?`<small>fired ${ago(r.fired_at)}</small>`:''}<button class="link-button" data-signal-remove="${r.id}">Remove</button></li>`).join('')}</ul>`:'<p class="sales-note">Add market alerts from a card\'s Market metrics or an index page: price levels, % moves, new 52-week highs and lows, population jumps, unusual sales volume, spread widening, index moves and Pokémon demand rank.</p>';
 return `<div class="panel-sub market-alerts"><div class="sub-head"><h3>Market alerts${sig.unseen?` <span class="new-chip">${sig.unseen} new</span>`:''}</h3><div class="inline-actions"><button class="button" id="sig-seen" ${sig.unseen?'':'disabled'}>Mark seen</button><button class="button" id="sig-check">Check now</button></div></div>${events}<h4>Your market alerts (${sig.rules.length})</h4>${rules}</div>`;
}
function wireMarketAlerts(view){
 const go=b=>{const g=b.dataset.sigGrade;if(b.dataset.sigSeen)send('/api/signals','PATCH',{id:Number(b.dataset.sigSeen)}).then(r=>{state.signals=sigShape(r);alertBadge();}).catch(()=>{});
  if(b.dataset.sigIndex){const id=b.dataset.sigIndex;state.view='market';state.market.grade=g;state.marketLang=id.split(':')[0];state.market.tab=({char:'char',set:'set',tier:'tier',artist:'artist'})[id.split(':')[1]]||'overview';updateView();openIndex(id);}
  else openCard(b.dataset.sigCard,g);};
 view.querySelectorAll('[data-sig-card],[data-sig-index]').forEach(b=>b.onclick=()=>go(b));
 view.querySelectorAll('[data-sig-dismiss]').forEach(b=>b.onclick=()=>signalAction('PATCH',{id:Number(b.dataset.sigDismiss),dismissed:true}));
 view.querySelectorAll('.market-alerts [data-signal-remove]').forEach(b=>b.onclick=()=>signalAction('DELETE',{id:Number(b.dataset.signalRemove)}));
 const seen=view.querySelector('#sig-seen');if(seen)seen.onclick=()=>signalAction('PATCH',{all:'seen'});
 const check=view.querySelector('#sig-check');if(check)check.onclick=async()=>{const before=state.signals?.events.length||0;try{state.signals=sigShape(await send('/api/signals/check','POST',{}));alertBadge();renderAlerts();const n=state.signals.events.length-before;toast(n>0?n+' market alert'+(n===1?'':'s')+' fired.':'Checked. Nothing new.');}catch(e){error(e.message);}};
}
// ---------- Market alerts ----------
// Rules on a card's or index's metrics (/api/signals), checked by the server after every metrics rebuild.
const SIGNAL_TEXT={price:'Price level',move:'Price move',pop:'Population jump',volume:'Unusual volume',spread:'Spread widening',extreme:'52-week high or low',rank:'Demand rank'};
async function loadSignals(quiet){
 const before=new Set((state.signals?.events||[]).map(e=>e.id)),had=!!state.signals;
 try{state.signals=sigShape(await request('/api/signals'));}catch(e){state.signals??={rules:[],events:[],unseen:0,failed:true};if(!quiet)error(e.message);return;}
 if(had&&quiet){const fresh=state.signals.events.filter(e=>!before.has(e.id)&&!e.seen);if(fresh.length)toast(fresh.length>1?fresh.length+' market alerts':fresh[0].title);}
 alertBadge();if(state.view==='alerts')renderAlerts();else if(state.selected)renderDetail();
}
function alertBadge(){const n=(state.alerts.data?.unseen||0)+(state.signals?.unseen||0),badge=$('#alert-count');if(!badge)return;badge.textContent=n;badge.hidden=!n;}
const sigShape=r=>({...r,rules:r?.rules||[],events:r?.events||[],unseen:r?.unseen||0});
async function signalAction(method,body){try{state.signals=sigShape(await send('/api/signals',method,body));alertBadge();if(state.view==='alerts')renderAlerts();else if(state.view==='market')renderMarket();else renderDetail();return true;}catch(e){error(e.message);return false;}}
const ruleText=r=>{const p=r.params;return r.kind==='price'?`Guide ${p.dir} ${money(p.level)}`:r.kind==='move'?`${p.dir==='up'?'Up':p.dir==='down'?'Down':'Up or down'} ${Math.round(p.pct*100)}% over ${p.period==='7d'?'7':'30'} days`:r.kind==='pop'?`PSA population +${Math.round(p.pct*100)}%`:r.kind==='volume'?`Sales ${p.mult}× a usual month`:r.kind==='spread'?`PSA 10 / 9 spread +${Math.round(p.pct*100)}%`:r.kind==='extreme'?'New 52-week high or low':`Demand rank moves ${p.places} places`;};
// The card panel's alert form: kind, one number, and this card's rules for the shown grade.
const CARD_SIGNALS=[['price-above','Price rises above','$',null],['price-below','Price falls below','$',null],['move-30d','Moves over 30 days','%',20],['move-7d','Moves over 7 days','%',10],['extreme','New 52-week high or low','',null],['pop','PSA population grows','%',10],['volume','Sales reach × a usual month','×',2],['spread','PSA 10 / 9 spread widens','%',20]];
function signalForm(target,grade,kinds,id){
 const sig=state.signals;if(!sig)return '';
 const mine=sig.rules.filter(r=>r.target===target&&r.grade===grade),pick=state.signalPick?.[id]||kinds[0][0],k=kinds.find(x=>x[0]===pick)||kinds[0];
 return `<div class="signal-form" data-signal-form="${id}" data-target="${esc(target)}" data-grade="${grade}"><h4>Market alerts</h4><div class="signal-row"><select data-signal-kind aria-label="Alert type">${kinds.map(([v,l])=>`<option value="${v}" ${v===k[0]?'selected':''}>${esc(l)}</option>`).join('')}</select>${k[2]?`<span class="unit-input">${k[2]==='$'?'<i>$</i>':''}<input type="number" step="any" min="0" data-signal-value value="${k[3]??''}" aria-label="Value"${k[2]==='$'?' placeholder="Price"':''}>${k[2]!=='$'?`<i>${k[2]}</i>`:''}</span>`:''}<button class="button" data-signal-add>Add alert</button></div>${mine.length?`<ul class="signal-rules">${mine.map(r=>`<li><span>${esc(ruleText(r))}</span>${r.fired_at?`<small>last fired ${ago(r.fired_at)}</small>`:''}<button class="link-button" data-signal-remove="${r.id}" aria-label="Remove alert">Remove</button></li>`).join('')}</ul>`:''}<p class="score-note">Checked after each metrics rebuild (nightly); sent to your ntfy topic or Discord webhook from Alert settings.</p></div>`;
}
function wireSignalForms(root){
 root.querySelectorAll?.('[data-signal-form]').forEach(f=>{
  const id=f.dataset.signalForm,kind=f.querySelector('[data-signal-kind]'),value=f.querySelector('[data-signal-value]');
  kind.onchange=()=>{(state.signalPick||={})[id]=kind.value;state.view==='market'?renderMarket():renderDetail();};
  f.querySelector('[data-signal-add]').onclick=()=>{
   const k=kind.value,v=value?Number(value.value):null;if(value&&!(v>0)){toast('Enter a number first.');return;}
   const [type,arg]=k.split('-'),params=type==='price'?{level:v,dir:arg}:type==='move'?{pct:v/100,period:arg||'30d',dir:'either'}:type==='pop'||type==='spread'?{pct:v/100}:type==='volume'?{mult:v}:type==='rank'?{places:v}:{};
   signalAction('POST',{kind:type,target:f.dataset.target,grade:f.dataset.grade,params}).then(ok=>{if(ok)toast('Alert added.');});
  };
  f.querySelectorAll('[data-signal-remove]').forEach(b=>b.onclick=()=>signalAction('DELETE',{id:Number(b.dataset.signalRemove)}));
 });
}
function applyAlerts(r,quiet){
 const before=state.alerts.known;r.affiliate=r.affiliate||state.alerts.data?.affiliate;r.searches=r.searches||state.alerts.data?.searches||[];state.alerts.data=r;state.alerts.known=new Set(r.alerts.map(a=>a.id));
 alertBadge();
 if(before&&quiet){const fresh=r.alerts.filter(a=>!before.has(a.id)&&!a.seen);if(fresh.length){const a=fresh[0],c=cardById(a.card_id);toast((fresh.length>1?fresh.length+' new alerts: ':'New alert: ')+(c?.name||'')+' '+money(a.total));
  if(typeof Notification!=='undefined'&&Notification.permission==='granted')for(const x of fresh.slice(0,3)){const cc=cardById(x.card_id);const n=new Notification((cc?.name||'Watched card')+' · '+gradeNames[x.grade]+' at '+money(x.total),{body:x.title,icon:cc?.image});n.onclick=()=>window.open(x.url,'_blank','noopener');}}}
 if(state.view==='alerts')renderAlerts();
}
function chooseManualCard(id,grade){
 const card=cardById(id);if(!card)return;
 const m=state.alerts.manual||={grade:'psa9',price:'',auctions:false};
 Object.assign(m,{cardId:id,grade:grade||m.grade,query:manualSearchQuery(card,grade||m.grade),price:'',text:''});
 renderManualSearch();
}
function renderManualSearch(){
 const panel=$('#manual-search-panel');if(!panel)return;
 const m=state.alerts.manual||={cardId:null,grade:state.grade,price:'',auctions:false,text:'',query:''};
 const card=cardById(m.cardId),affiliate=state.alerts.data?.affiliate;
 panel.innerHTML=`<h3>Find a card on eBay</h3><p class="sales-note">Pokemon + card name + set + number + grade. Choose any catalog card; it does not need to be watched.</p>
  <label class="field">Find a card<input id="manual-card-search" type="search" value="${esc(m.text)}" placeholder="Name, set or card number" autocomplete="off" aria-describedby="manual-card-hint"></label><div class="dex-results" id="manual-card-results"></div><p class="field-hint" id="manual-card-hint">Type at least two characters to choose a printing.</p>
  ${card?`<div class="dex-picked"><img src="${card.image}" alt="" loading="lazy"><div><strong>${esc(card.name)}${card.japanese?' · Japanese':''}</strong><span>${esc(card.setName)} · ${numberCaption(card)}</span></div></div>
  <div class="manual-search-controls"><label class="field">Grade<select id="manual-grade">${['psa10','psa9','raw'].map(g=>`<option value="${g}" ${m.grade===g?'selected':''}>${gradeNames[g]}</option>`).join('')}</select></label><label class="field">Max item price (optional)<input id="manual-price" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(m.price)}" placeholder="Any price"></label></div>
  <label class="field">Search terms<input id="manual-ebay-query" type="text" maxlength="1000" value="${esc(m.query)}"></label><label class="toggle"><input id="manual-auctions" type="checkbox" ${m.auctions?'checked':''}><span>Include auctions</span></label>
  <div class="inline-actions"><a class="button primary" id="manual-open" target="_blank" rel="noopener noreferrer${affiliate?.enabled?' sponsored':''}" href="${esc(manualSearchUrl(card,m.grade,m.price,{query:m.query,auctions:m.auctions,affiliate}))}">Search eBay</a><button type="button" class="button" id="manual-broaden">Broaden search</button><button type="button" class="link-button" id="manual-reset">Reset template</button></div>
  <p class="field-hint">Broaden removes the set name. Raw uses NM / near mint and excludes graded cards. Best Match is the default; price filters exclude shipping. Verify the photos, printing and total before buying. Manual searches use no API credits.</p>${affiliate?.enabled?'<p class="sales-note">Affiliate link: we may earn a commission from qualifying purchases.</p>':''}`:''}`;
 $('#manual-card-search').oninput=()=>{
  m.text=$('#manual-card-search').value;
  const words=m.text.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const result=m.text.trim().length<2?[]:state.cards.filter(c=>words.every(w=>(c.name+' '+(c.nameJa||'')+' '+c.setName+' '+c.numberLabel+' '+c.id+(c.japanese?' japanese jp':' english')).toLowerCase().includes(w))).sort((a,b)=>Number(b.eligible)-Number(a.eligible)).slice(0,8);
  $('#manual-card-results').innerHTML=result.map(c=>`<button type="button" data-manual-pick="${c.id}"><img src="${c.image}" alt="" loading="lazy"><span><b>${esc(c.name)}${c.japanese?' · JP':''}</b><small>${esc(c.setName)} · ${numberCaption(c)}</small></span></button>`).join('')||(m.text.trim().length>=2?'<p class="field-hint">No cards match. Try the name and number.</p>':'');
  $('#manual-card-results').querySelectorAll('[data-manual-pick]').forEach(b=>b.onclick=()=>chooseManualCard(b.dataset.manualPick));wireImages();
 };
 if(card){
  const updateLink=()=>{$('#manual-open').href=manualSearchUrl(card,m.grade,m.price,{query:m.query,auctions:m.auctions,affiliate});};
  $('#manual-grade').onchange=()=>{m.grade=$('#manual-grade').value;m.query=manualSearchQuery(card,m.grade);renderManualSearch();};
  $('#manual-price').oninput=()=>{m.price=$('#manual-price').value;updateLink();};
  $('#manual-ebay-query').oninput=()=>{m.query=$('#manual-ebay-query').value;updateLink();};
  $('#manual-auctions').onchange=()=>{m.auctions=$('#manual-auctions').checked;updateLink();};
  $('#manual-broaden').onclick=()=>{m.query=manualSearchQuery(card,m.grade,{broad:true});m.price='';renderManualSearch();};
  $('#manual-reset').onclick=()=>{m.query=manualSearchQuery(card,m.grade);renderManualSearch();};
 }
 wireImages();
}
function renderAlerts(){
 const view=$('#alerts-view'),d=state.alerts.data;
 if(!d){view.innerHTML='<div class="loading"><span class="spinner"></span>Loading alerts…</div>';return;}
 const s=d.settings,configured=s.configured??s.ebay.configured,providerName=s.provider==='serpapi'?'SerpApi':'eBay',run=d.lastRun,notifyPerm=typeof Notification==='undefined'?'unsupported':Notification.permission;
 const status=d.live?`<span class="status-dot on"></span>Live alerts are on · every ${s.intervalMinutes} min${run?` · last scan ${ago(run.finished_at||run.started_at)}, ${run.checked} card${run.checked===1?'':'s'} checked`:''}`:configured?'<span class="status-dot"></span>Live alerts are paused. Turn them on in settings.':'<span class="status-dot"></span>Choose a listing provider and add its credentials to scan live eBay listings.';
 view.innerHTML=`<div class="alerts-layout">
 <section class="panel alerts-main" aria-label="Listings at or under your limit"><div class="panel-head"><div><h2>Listings at your price</h2><p class="status-line">${status}${run?.error?` <span class="warn">· ${esc(run.error)}</span>`:''}</p></div><div class="holdings-tools"><button class="button" id="alerts-seen" ${d.unseen?'':'disabled'}>Mark all seen</button><button class="button primary" id="alerts-scan" ${configured?'':'disabled'}>${state.alerts.busy?'Scanning…':'Scan now'}</button></div></div>
  ${d.alerts.length?`<div class="alert-list">${d.alerts.map(a=>{const c=cardById(a.card_id),under=a.market_price>0?(1-a.total/a.market_price):null;return `<article class="alert-row ${a.seen?'':'unseen'}"><img src="${esc(a.image||c?.image||'')}" alt="" loading="lazy"><div class="alert-body"><div class="alert-top"><strong>${esc(c?.name||a.card_id)}</strong><span class="grade-chip ${a.grade}">${gradeNames[a.grade].replace(' · near mint','')}</span>${a.seen?'':'<span class="new-chip">New</span>'}</div><p class="alert-title">${esc(a.title)}</p><p class="alert-meta">${esc(c?.setName||'')} · #${esc(c?.numberLabel||'')} · ${esc(a.buying_option||'')}${a.seller?' · '+esc(a.seller):''} · found ${ago(a.found_at)}</p></div><div class="alert-price"><strong>${money(a.total)}</strong><small>${a.shipping==null?'+ shipping':a.shipping>0?'incl. '+money(a.shipping)+' shipping':'free shipping'}</small><small>Limit ${money(a.limit_price)}${under>0?` · <b class="pl up">${Math.round(under*100)}% under market</b>`:''}</small><div class="alert-actions"><a class="button primary" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" data-open-alert="${a.id}">View listing</a><button class="button" data-dismiss="${a.id}" aria-label="Dismiss alert for ${esc(a.title)}">Dismiss</button></div></div></article>`;}).join('')}</div>`
  :`<div class="empty-state"><strong>${configured?'No listings at your price yet.':'Alerts are ready when you are.'}</strong><p>${configured?'New listings of your watched cards at or under your limit will appear here.':'Choose SerpApi in settings if your eBay developer registration is unavailable. Add your own provider key to scan live listings.'}</p></div>`}
  ${marketAlertsPanel()}
  <div class="panel-sub" id="manual-search-panel"></div>
  <div class="panel-sub"><h3>Your watched searches</h3><p class="sales-note">Search the exact card and grade, or use your limit as an item-price filter. Best Match and Buy It Now are the defaults. Manual searches use no SerpApi credits. Check shipping and the card photos before buying.</p>
  ${d.searches.length?`<div class="search-list">${d.searches.map(x=>{const c=cardById(x.card_id);return c?`<div class="search-row"><img src="${c.image}"${c.imageAlt?` data-alt="${c.imageAlt}"`:''} alt="" loading="lazy"><span><b>${esc(c.name)}</b><small>${esc(c.setName)} · ${numberCaption(c)} · ${gradeNames[x.grade]}</small><button type="button" class="link-button" data-edit-search="${c.id}" data-search-grade="${x.grade}">Edit search</button></span><span class="search-limit">${x.limit!=null?money(x.limit)+'<small>'+esc(x.limit_source)+'</small>':'<small>No limit yet</small>'}</span><a class="button" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer${d.affiliate?.enabled?' sponsored':''}">Search eBay</a>${x.limitedUrl?`<a class="link-button search-at-limit" href="${esc(x.limitedUrl)}" target="_blank" rel="noopener noreferrer${d.affiliate?.enabled?' sponsored':''}">At my limit</a>`:''}</div>`:'';}).join('')}</div>`:'<p class="sales-note">Star a card in Browse to watch it.</p>'}${d.affiliate?.enabled?'<p class="sales-note">Affiliate links: we may earn a commission from qualifying purchases.</p>':''}</div>
 </section>
 <aside class="panel alerts-side" aria-label="Alert settings"><h2>Alert settings</h2>
  <form id="alert-settings" class="settings-form">
   <label class="field">Listing provider<select id="al-provider"><option value="ebay" ${s.provider!=='serpapi'?'selected':''}>eBay Browse API</option><option value="serpapi" ${s.provider==='serpapi'?'selected':''}>SerpApi · no eBay developer account needed</option></select></label>
   <p class="field-hint">Selected provider: ${providerName}. Each watched card and grade uses one search per scan, up to 60 per scan.</p>
   <label class="toggle"><input type="checkbox" id="al-enabled" ${s.enabled?'checked':''}><span>Scan for new listings automatically</span></label>
   <label class="field">Check every<select id="al-interval">${[15,30,60,120,240].map(v=>`<option value="${v}" ${s.intervalMinutes===v?'selected':''}>${v<60?v+' minutes':v/60+' hour'+(v>60?'s':'')}</option>`).join('')}</select></label>
   <label class="toggle"><input type="checkbox" id="al-suggested" ${s.useSuggested?'checked':''}><span>Use the suggested target when I haven't set a limit</span></label>
   <label class="toggle"><input type="checkbox" id="al-fair" ${s.useFair?'checked':''}><span>Too few sales for a target? Alert at a discount to fair value (the guide)</span></label>
   <label class="field">Discount to fair value<span class="unit-input"><input id="al-fair-discount" type="number" min="0" max="50" step="1" value="${Math.round((s.fairDiscount??.15)*100)}"><i>%</i></span></label>
   <label class="toggle"><input type="checkbox" id="al-auctions" ${s.includeAuctions?'checked':''}><span>Include auctions (current bid)</span></label>
   <fieldset><legend>eBay API keys ${s.ebay.configured?'<span class="ok-chip">Saved</span>':''}</legend><p class="field-hint">Create a free keyset at <a href="https://developer.ebay.com/my/keys" target="_blank" rel="noopener noreferrer">developer.ebay.com</a> and paste the Production App ID and Cert ID. They stay in your local database.</p>
    <label class="field">Client ID (App ID)<input id="al-client" type="text" autocomplete="off" spellcheck="false" placeholder="${s.ebay.clientId?esc(s.ebay.clientId):'YourName-PrimalWa-PRD-…'}"></label>
    <label class="field">Client Secret (Cert ID)<input id="al-secret" type="password" autocomplete="off" placeholder="${s.ebay.hasSecret?'Saved · leave blank to keep':'PRD-…'}"></label>${s.ebay.configured?'<button type="button" class="link-button" id="al-clear">Remove saved keys</button>':''}</fieldset>
   <fieldset><legend>SerpApi ${s.serpapi?.configured?'<span class="ok-chip">Saved</span>':''}</legend><p class="field-hint">Get your own key from <a href="https://serpapi.com/users/sign_up" target="_blank" rel="noopener noreferrer">SerpApi</a>. Its free plan currently includes 250 searches per month. Start with Scan now; frequent automatic scans can exhaust this allowance. Cached results may be up to one hour old. No eBay API keys are needed with this provider.</p>
    <label class="field">SerpApi key<input id="al-serpapi" type="password" autocomplete="off" placeholder="${s.serpapi?.hasSecret?'Saved · leave blank to keep':'Your SerpApi private key'}"></label>${s.serpapi?.configured?'<button type="button" class="link-button" id="al-clear-serpapi">Remove SerpApi key</button>':''}</fieldset>
   <fieldset><legend>Phone & desktop notifications</legend>
    <label class="field">ntfy topic <small>(free push app)</small><input id="al-ntfy" type="text" autocomplete="off" spellcheck="false" value="${esc(s.notify.ntfy)}" placeholder="e.g. futuresight-7f3k"></label>
    <label class="field">Discord webhook<input id="al-discord" type="url" autocomplete="off" spellcheck="false" value="${esc(s.notify.discord)}" placeholder="https://discord.com/api/webhooks/…"></label>
    <div class="inline-actions"><button type="button" class="button" id="al-test">Send a test</button><button type="button" class="button" id="al-desktop" ${notifyPerm==='granted'||notifyPerm==='unsupported'?'disabled':''}>${notifyPerm==='granted'?'Desktop alerts on':notifyPerm==='denied'?'Desktop alerts blocked':'Allow desktop alerts'}</button></div></fieldset>
   <p class="form-error" id="al-error" role="alert" hidden></p>
   <button type="submit" class="button primary" id="al-save">Save settings</button>
  </form></aside></div>`;
 renderManualSearch();
 view.querySelectorAll('[data-edit-search]').forEach(b=>b.onclick=()=>chooseManualCard(b.dataset.editSearch,b.dataset.searchGrade));
 const fail=t=>{const e=$('#al-error');e.textContent=t;e.hidden=!t;};
 $('#alert-settings').onsubmit=async e=>{e.preventDefault();fail('');const body={provider:$('#al-provider').value||s.provider||'ebay',enabled:$('#al-enabled').checked,intervalMinutes:Number($('#al-interval').value),useSuggested:$('#al-suggested').checked,useFair:$('#al-fair').checked,fairDiscount:Math.min(50,Math.max(0,Number($('#al-fair-discount').value)||0))/100,includeAuctions:$('#al-auctions').checked,notify:{ntfy:$('#al-ntfy').value.trim(),discord:$('#al-discord').value.trim()}};
  const serpKey=$('#al-serpapi').value.trim();if(serpKey)body.serpapi={apiKey:serpKey};
  const id=$('#al-client').value.trim(),secret=$('#al-secret').value.trim();if(id||secret)body.ebay={clientId:id||undefined,clientSecret:secret};if(id&&!secret&&!s.ebay.hasSecret)return fail('Add the Client Secret too.');if(!id&&secret&&!s.ebay.clientId)return fail('Add the Client ID too.');
  if(body.ebay&&!body.ebay.clientId)delete body.ebay.clientId;
  $('#al-save').disabled=true;try{await send('/api/alerts/settings','POST',body);toast('Alert settings saved.');await loadAlerts();}catch(err){fail(err.message);$('#al-save').disabled=false;}};
 if($('#al-clear'))$('#al-clear').onclick=async()=>{try{await send('/api/alerts/settings','POST',{enabled:false,ebay:{clear:true}});toast('eBay keys removed.');await loadAlerts();}catch(err){fail(err.message);}};
 if($('#al-clear-serpapi'))$('#al-clear-serpapi').onclick=async()=>{try{await send('/api/alerts/settings','POST',{enabled:false,serpapi:{clear:true}});toast('SerpApi key removed.');await loadAlerts();}catch(err){fail(err.message);}};
 $('#al-test').onclick=async()=>{try{const r=await send('/api/alerts/test','POST',{});toast(r.sent?'Test notification sent.':r.error||'Nothing was sent.');}catch(err){fail(err.message);}};
 $('#al-desktop').onclick=async()=>{if(typeof Notification==='undefined')return;await Notification.requestPermission();renderAlerts();};
 $('#alerts-scan').onclick=async()=>{state.alerts.busy=true;renderAlerts();try{const r=await send('/api/alerts/scan','POST',{});applyAlerts(r);toast(r.error?r.error:r.found?r.found+' new listing'+(r.found===1?'':'s')+' at your price.':'Checked '+r.checked+' watched card'+(r.checked===1?'':'s')+'. Nothing new at your price.');}catch(err){toast(err.message);}finally{state.alerts.busy=false;renderAlerts();}};
 $('#alerts-seen').onclick=async()=>{try{applyAlerts(await send('/api/alerts','PATCH',{all:'seen'}));}catch(err){toast(err.message);}};
 view.querySelectorAll('[data-dismiss]').forEach(b=>b.onclick=async()=>{try{applyAlerts(await send('/api/alerts','PATCH',{id:Number(b.dataset.dismiss),dismissed:true}));}catch(err){toast(err.message);}});
 view.querySelectorAll('[data-open-alert]').forEach(a=>a.addEventListener('click',()=>send('/api/alerts','PATCH',{id:Number(a.dataset.openAlert)}).then(r=>applyAlerts(r)).catch(()=>{})));
 wireMarketAlerts(view);
 wireImages();
}

// ---------- Top movers ----------
const MOVER_GRADES=['psa10','psa9','raw'],shortGrade=g=>gradeNames[g].replace(' · near mint',' NM');
const wholeMoney=v=>v>=100?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v):money(v);
const marketSeriesKey=()=>state.marketSeries.join(',');
const marketScopeKey=()=>state.marketLang+'|'+marketSeriesKey();
const moverKey=period=>period+'|'+marketScopeKey();
const marketSeriesLabel=id=>id==='DP'?'DP–HGSS':id;
function marketFilterView(){
 const all=state.marketSeries.length===state.series.length;
 // Each language is ranked on its own: Japanese cards are compared only with other Japanese cards.
 const langSwitch=`<div class="market-lang" role="group" aria-label="Card language"><span>Language</span><div class="segmented">${LANGS.map(l=>`<button data-market-lang="${l.id}" class="${state.marketLang===l.id?'active':''}" aria-pressed="${state.marketLang===l.id}">${l.label}</button>`).join('')}</div></div>`;
 const note=state.marketLang==='ja'?`<div class="market-lang-note">Japanese cards are ranked only against other Japanese cards. Japanese prices aren't loaded yet, so these lists stay empty until they are.</div>`:'';
 return langSwitch+note+`<div class="market-era-filter" aria-label="Included eras"><span>Include eras</span><div role="group">${state.series.map(series=>`<button data-market-series="${series.id}" class="${state.marketSeries.includes(series.id)?'active':''}" aria-pressed="${state.marketSeries.includes(series.id)}" title="${esc(series.name)} · ${esc(series.years)}">${marketSeriesLabel(series.id)}</button>`).join('')}</div><button class="link-button" data-market-all ${all?'disabled':''}>All eras</button></div>`;
}
function wireMarketFilters(view,load){
 view.querySelectorAll('[data-market-series]').forEach(button=>button.onclick=()=>{const id=button.dataset.marketSeries,active=state.marketSeries.includes(id);if(active&&state.marketSeries.length===1){toast('Keep at least one era included.');return;}state.marketSeries=active?state.marketSeries.filter(value=>value!==id):state.series.map(s=>s.id).filter(value=>state.marketSeries.includes(value)||value===id);renderMovers();renderInvest();load();});
 view.querySelectorAll('[data-market-lang]').forEach(b=>b.onclick=()=>{if(state.marketLang===b.dataset.marketLang)return;state.marketLang=b.dataset.marketLang;renderMovers();renderInvest();load();});
 const all=view.querySelector('[data-market-all]');if(all)all.onclick=()=>{state.marketSeries=state.series.map(series=>series.id);renderMovers();renderInvest();load();};
}
// Market-wide lists are cached in the page, but only briefly: opening the tab again after FRESH_MS asks the
// server again (it answers from memory unless saved sales changed) and swaps the new list in without a spinner.
const FRESH_MS=30000;
const checkedOf=()=>state.view==='movers'?state.movers.data[moverKey(state.movers.period)]?.checkedAt:state.invest.data[marketScopeKey()]?.checkedAt;
function dropMarketCaches(){state.movers.data={};state.invest.data={};}
function invalidateMarketViews(){
 dropMarketCaches();state.movers.error=null;state.invest.error=null;
 loadScores();loadTicker();
 if(state.view==='movers'){renderMovers();loadMovers(state.movers.period,true);}
 else if(state.view==='invest'){renderInvest();loadInvest(true);}
}
async function recalculate(){
 const view=state.view;
 dropMarketCaches();state.movers.error=null;state.invest.error=null;state.ticker=null;
 if(view==='movers')renderMovers();else renderInvest();
 await Promise.all([view==='movers'?loadMovers(state.movers.period,true):loadInvest(true),loadScores(),loadTicker()]);
 const at=checkedOf();
 toast(at?'Recalculated from your saved sales · newest check '+new Date(at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+'.':'Could not recalculate. Try again.');
}
function refreshControls(){
 return `<div class="refresh-tools"><button class="button primary" data-recalc title="Re-read the sales you have already saved and rebuild this list. Instant.">${icon('refresh')} Recalculate</button><button class="button" data-update-sales title="Fetch the newest sold prices for every rare card in the included eras, then rebuild. This can take a long while. Cancel any time: what was fetched is kept.">${refreshRun?'Cancel update':updateLabel()}</button></div>`;
}
function wireRefresh(view){
 view.querySelectorAll('[data-recalc]').forEach(b=>b.onclick=recalculate);
 view.querySelectorAll('[data-update-sales]').forEach(b=>b.onclick=updateMarketSales);
}
async function loadMovers(period,force=false){
 const key=moverKey(period),have=state.movers.data[key];
 if(have&&!force&&Date.now()-have._at<FRESH_MS)return;
 try{const r=await request('/api/movers?period='+period+'&lang='+state.marketLang+'&series='+encodeURIComponent(marketSeriesKey()));r._at=Date.now();state.movers.data[key]=r;state.movers.error=null;}catch(e){if(!have)state.movers.error=e.message;}
 if(state.view==='movers')renderMovers();
}
// Jump to another card (e.g. the Japanese printing), keeping the grade; widens the scope only when needed.
function goToCard(id){
 const c=cardById(id);if(!c)return;
 if(!filteredCards().some(x=>x.id===id)){const lang=langOf(c);if(!state.langs.includes(lang))state.langs=[...state.langs,lang];if(state.setId!=='all'){state.setId='all';state.eras=state.series.map(x=>x.id);}state.category='all';state.query='';$('#search').value='';state.filters={min:null,max:null,activity:0,invest:0,research:0};updateView();}
 select(id);
}
function openCard(id,grade){
 const c=cardById(id);if(!c)return;
 state.view='browse';state.setId=c.setId;state.category='all';state.grade=grade;$('#grade').value=grade;state.query='';$('#search').value='';resetFilters(false);
 updateView();select(id);
}
function renderMovers(){
 const view=$('#movers-view'),period=state.movers.period,d=state.movers.data[moverKey(period)],word=period==='week'?'week':'month';
 const checked=d?.checkedAt?new Date(d.checkedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):null;
 const head=`<section class="panel movers-head"><div><h2>Biggest price increases this ${word}</h2><p>${d?`The last ${d.current} days of matching sales compared with ${esc(d.baselineLabel)}${checked?' · sales checked '+checked:''}. `:''}Cards worth $25 or more, with at least 3 matching sales in both periods. Moves the data can't confirm are left out.</p></div><div class="head-actions">${refreshControls()}<div class="segmented" role="group" aria-label="Period">${[['week','Week'],['month','Month']].map(([k,l])=>`<button data-period="${k}" aria-pressed="${period===k}" class="${period===k?'active':''}">${l}</button>`).join('')}</div></div></section>`;
 if(!d){view.innerHTML=head+marketFilterView()+(state.movers.error?`<div class="panel empty-state"><strong>Movers couldn't be loaded.</strong><p>${esc(state.movers.error)}</p><button class="button" id="movers-retry">Try again</button></div>`:'<div class="loading"><span class="spinner"></span>Finding this '+word+'\'s movers…</div>');}
 else view.innerHTML=head+marketFilterView()+`<div class="segmented mover-grades" role="group" aria-label="Grade">${MOVER_GRADES.map(g=>`<button data-mover-grade="${g}" aria-pressed="${state.movers.grade===g}" class="${state.movers.grade===g?'active':''}">${shortGrade(g)}</button>`).join('')}</div><div class="movers-grid">${MOVER_GRADES.map(g=>{const col=d.grades[g],list=col.movers;
  return `<section class="panel mover-col ${state.movers.grade===g?'':'off'}" aria-label="${gradeNames[g]} movers"><div class="panel-head"><div><h2><span class="grade-chip ${g}">${shortGrade(g)}</span> Top ${list.length||''}</h2><p>${col.qualified>list.length?'Top '+list.length+' of '+col.qualified+' rising cards that passed every check':col.qualified?'Every rising card that passed every check':'No reliable rises'}</p></div></div>
  ${list.length?`<ol class="mover-list">${list.map((m,i)=>{const c=cardById(m.card_id);if(!c)return '';return `<li><button class="mover-row" data-mover="${c.id}" data-grade="${g}" aria-label="${esc(c.name)}, ${esc(c.setName)}, ${gradeNames[g]}, up ${pct(m.change)} from ${money(m.from)} to ${money(m.to)}"><span class="mover-rank">${i+1}</span><img src="${c.image}"${c.imageAlt?` data-alt="${c.imageAlt}"`:''} alt="" loading="lazy"><span class="mover-name"><b>${esc(c.name)}</b><small>${esc(c.setName)} · ${numberCaption(c)}</small><small>${m.current.sales} sale${m.current.sales===1?'':'s'} vs ${m.baseline.sales} before</small></span><span class="mover-change"><b class="pl up"><span aria-hidden="true">▲</span> ${pct(m.change)}</b><small>${wholeMoney(m.from)} → ${wholeMoney(m.to)}</small></span></button></li>`;}).join('')}</ol>`:`<div class="chart-empty">No ${gradeNames[g]} card had enough reliable sales this ${word} to measure a rise.</div>`}
  <div class="panel-foot">${list.length&&list.length<20?`Only ${list.length} card${list.length===1?'':'s'} qualified this ${word}. `:''}${col.leftOut.length?'Left out as uncertain: '+col.leftOut.map(x=>x.count+' because '+esc(x.text)).join('; ')+'.':'No rising cards were left out as uncertain.'}</div></section>`;}).join('')}</div>
  <p class="sales-note movers-note">Percentages compare sold medians, not listings, and exclude shipping, fees and tax. A rise in recent sales is not a prediction. <button class="link-button" id="movers-method">How movers work</button></p>`;
 view.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{state.movers.period=b.dataset.period;renderMovers();loadMovers(state.movers.period);});
 view.querySelectorAll('[data-mover-grade]').forEach(b=>b.onclick=()=>{state.movers.grade=b.dataset.moverGrade;renderMovers();});
 view.querySelectorAll('[data-mover]').forEach(b=>b.onclick=()=>openCard(b.dataset.mover,b.dataset.grade));
 wireMarketFilters(view,()=>loadMovers(state.movers.period));wireRefresh(view);
 if($('#movers-retry'))$('#movers-retry').onclick=()=>{state.movers.error=null;renderMovers();loadMovers(period);};
 if($('#movers-method'))$('#movers-method').onclick=()=>$('#method-dialog').showModal();
 wireImages();
}

// ---------- Potential investments ----------
async function loadInvest(force=false){
 const key=marketScopeKey(),have=state.invest.data[key];
 if(have&&!force&&Date.now()-have._at<FRESH_MS)return;
 try{const r=await request('/api/investments?lang='+state.marketLang+'&series='+encodeURIComponent(marketSeriesKey()));r._at=Date.now();state.invest.data[key]=r;state.invest.error=null;}catch(e){if(!have)state.invest.error=e.message;}
 if(state.view==='invest')renderInvest();
}
const pctWhole=v=>Math.round(v*100)+'%';
function signalView(s){
 if(s.type==='uptrend')return {cls:'up',label:'Steady uptrend',value:'+'+pctWhole(s.growth)+' / yr',detail:`${s.sales} matching sales over ${s.months} months. Recent median ${wholeMoney(s.now)} vs ${wholeMoney(s.then)} 6+ months ago.`};
 if(s.type==='recovering')return {cls:'rec',label:'Recovering from highs',value:pctWhole(s.drawdown)+' below '+monthLabel(s.peakMonth)+' high',detail:`Monthly guide peaked at ${wholeMoney(s.peak)} and is now ${wholeMoney(s.latest)}. Sales in the last 45 days are up ${pctWhole(s.rise)} on the 90 days before.`};
 return {cls:'cheap',label:'Cheap vs. similar cards',value:pctWhole(1-s.ratio)+' below',detail:`${esc(s.category)} cards of less in-demand characters in ${esc(s.setName)} sell for ${wholeMoney(s.typical)} (median of ${s.peers}).`};
}
function renderInvest(){
 const view=$('#invest-view'),d=state.invest.data[marketScopeKey()],g=state.invest.grade;
 const checked=d?.checkedAt?new Date(d.checkedAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):null;
 const head=`<section class="panel movers-head"><div><h2>Cards worth a closer look</h2><p>Each pick has a confident sold price of $25 or more, features a character in the top quarter for collector demand, and shows at least one signal in its own sales history. Built only from the sales in this app${checked?', checked '+checked:''}. Not investment advice.</p></div><div class="head-actions">${refreshControls()}<div class="segmented" role="group" aria-label="Grade">${MOVER_GRADES.map(x=>`<button data-invest-grade="${x}" aria-pressed="${g===x}" class="${g===x?'active':''}">${shortGrade(x)}</button>`).join('')}</div></div></section>
 <div class="signal-key"><p><span class="signal up">Steady uptrend</span><span>A clear, consistent rise over the past year.</span></p><p><span class="signal rec">Recovering from highs</span><span>Well below a held high, with sales turning up.</span></p><p><span class="signal cheap">Cheap vs. similar cards</span><span>Below same-set cards of less popular characters.</span></p></div>`;
 if(!d){view.innerHTML=head+marketFilterView()+(state.invest.error?`<div class="panel empty-state"><strong>Investments couldn't be loaded.</strong><p>${esc(state.invest.error)}</p><button class="button" id="invest-retry">Try again</button></div>`:'<div class="loading"><span class="spinner"></span>Screening every included card…</div>');}
 else{
  const col=d.grades[g],picks=col.picks;
  view.innerHTML=head+marketFilterView()+`<section class="panel invest-panel" aria-label="${gradeNames[g]} potential investments"><div class="panel-head"><div><h2><span class="grade-chip ${g}">${shortGrade(g)}</span> ${picks.length?picks.length+' pick'+(picks.length===1?'':'s'):'No picks'}</h2><p>${col.qualified} of ${col.screened} high-demand cards with a confident price met at least one signal.${col.qualified>picks.length?' Strongest shown, at most 3 per character.':''}</p></div></div>
  ${picks.length?`<div class="invest-list">${picks.map(p=>{const c=cardById(p.card_id);if(!c)return '';const dm=p.demand;return `<article class="invest-row"><button class="invest-card" data-invest="${c.id}" data-grade="${g}" aria-label="Open ${esc(c.name)} ${gradeNames[g]}"><img src="${c.image}"${c.imageAlt?` data-alt="${c.imageAlt}"`:''} alt="" loading="lazy"><span><b>${esc(c.name)}</b><small>${esc(c.setName)} · ${numberCaption(c)} · ${esc(c.category)}</small></span></button>
   <div class="invest-price"><strong>${money(p.price)}</strong><small>${esc(p.priceLabel)}</small>${scoreOf(c.id,g)!=null?`<span class="score-pill ${ratingClass(scoreOf(c.id,g))}" title="Investment score">${scoreOf(c.id,g)}<small>/100</small></span>`:''}${p.research?`<small class="research-line" title="Research rank: historical percentile, not validated">Research ${p.research.rank??'—'} · ${EVIDENCE[p.research.evidenceStatus]||''}${p.research.breakEven!=null?' · break-even '+money(p.research.breakEven):''}</small>`:''}</div>
   <div class="invest-why"><h3>Why it's listed</h3><p class="invest-thesis">${esc(p.thesis)}</p><ul class="invest-signals">${(p.checks||p.signals.map(x=>({type:x.type,hit:true}))).map(ch=>{const sig=p.signals.find(x=>x.type===ch.type);if(!sig)return `<li class="miss"><span class="check" aria-hidden="true">–</span><span class="signal-name">${esc(ch.label)}</span><b>Not met</b></li>`;const v=signalView(sig);return `<li class="hit"><span class="check" aria-hidden="true">✓</span><span class="signal ${v.cls}">${v.label}</span><b>${v.value}</b><small>${v.detail}</small></li>`;}).join('')}</ul></div>
   <div class="invest-demand"><span class="metric-label">${esc(dm.character)} demand</span><div class="demand-wrap"><strong>${dm.score}</strong><em>/ 100</em></div><div class="demand-bar"><span style="width:${dm.score}%"></span></div><small>Cards sell ~${dm.premium.toFixed(1)}× similar cards${dm.activity!=null?' · '+Math.round(dm.activity)+' sales per card in 6 months':''}</small></div></article>`;}).join('')}</div>`:`<div class="chart-empty tall">No ${gradeNames[g]} card met every rule in the current data. That's expected when the market is at or near its highs. Try another grade, or refresh sales.</div>`}
  <div class="panel-foot">Signals use matching sales only (raw: near mint). PSA 9 highs use PriceCharting's Grade 9 guide, which includes other graders. Past sales don't guarantee future prices. <button class="link-button" id="invest-method">How picks are chosen</button></div></section>`;
 }
 view.querySelectorAll('[data-invest-grade]').forEach(b=>b.onclick=()=>{state.invest.grade=b.dataset.investGrade;renderInvest();});
 view.querySelectorAll('[data-invest]').forEach(b=>b.onclick=()=>openCard(b.dataset.invest,b.dataset.grade));
 wireMarketFilters(view,()=>loadInvest());wireRefresh(view);
 if($('#invest-retry'))$('#invest-retry').onclick=()=>{state.invest.error=null;renderInvest();loadInvest();};
 if($('#invest-method'))$('#invest-method').onclick=()=>$('#method-dialog').showModal();
 wireImages();
}

// ---------- Settings ----------
function renderSettings(){
 const view=$('#settings-view');
 view.innerHTML=`<section class="panel settings-panel"><div class="panel-head"><div><h2>Appearance</h2><p>Choose the palette FutureSight uses on this device. Your choice is saved in this browser.</p></div></div><div class="appearance-grid">${Object.entries(APPEARANCES).map(([id,option])=>`<button class="appearance-option ${state.appearance===id?'active':''}" data-appearance="${id}" aria-pressed="${state.appearance===id}"><span class="appearance-preview ${id}" aria-hidden="true"><i></i><i></i><i></i></span><span><b>${option.label}</b><small>${option.description}</small></span>${state.appearance===id?'<em>Selected</em>':''}</button>`).join('')}</div><div class="settings-note"><b>About the appearances</b><p>Terminal is the default: near-black panels with green for gains and buy signals and red for losses. Light keeps the same layout on a bright background, and Soft contrast mutes the whites, ink and accents.</p></div></section>`;
 view.querySelectorAll('[data-appearance]').forEach(button=>button.onclick=()=>{state.appearance=applyAppearance(button.dataset.appearance);renderSettings();toast(APPEARANCES[state.appearance].label+' appearance enabled.');});
 const intro=globalThis.futureSightIntro;
 view.insertAdjacentHTML?.('beforeend',`<section class="panel settings-panel intro-settings"><div class="panel-head"><div><h2>Opening animation</h2><p>Glint, the FutureSight mascot, flies in, does a little twirl and settles into the logo. It plays once each time you open the site in a new tab, and any click or key skips it. It never plays when your system asks for reduced motion.</p></div></div><div class="settings-note intro-row"><svg class="intro-preview" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="#fs-glint"/></svg><label class="toggle"><input type="checkbox" id="intro-enabled" ${intro?.enabled()!==false?'checked':''}><span>Play the opening animation when I open FutureSight</span></label><button class="button" id="intro-replay">Replay now</button></div></section>`);
 view.insertAdjacentHTML?.('beforeend',`<section class="panel settings-panel ja-settings"><div class="panel-head"><div><h2>Japanese cards</h2><p>Japanese cards and sets are shown with their English names. Turn this on to also see the original Japanese card and set names on each card's details.</p></div></div><div class="settings-note intro-row"><label class="toggle"><input type="checkbox" id="ja-text" ${state.showJapanese?'checked':''}><span>Show Japanese names alongside English</span></label></div></section>`);
 const jaText=$('#ja-text');
 if(jaText)jaText.onchange=e=>{state.showJapanese=e.target.checked;try{localStorage.setItem(JA_TEXT_KEY,state.showJapanese?'on':'off');}catch{}toast(state.showJapanese?'Japanese names shown alongside English.':'English names only.');};
 const introToggle=$('#intro-enabled'),replay=$('#intro-replay');
 if(introToggle)introToggle.onchange=e=>{intro?.setEnabled(e.target.checked);toast(e.target.checked?'Opening animation on.':'Opening animation off.');};
 if(replay)replay.onclick=()=>{if(intro)intro.play({force:true});else toast('The animation could not be loaded. Reload the page and try again.');};
}

// ---------- Screener (advanced filters) ----------
const PRESETS={strong:{invest:80},good:{invest:65},research:{research:70},liquid:{activity:60},under100:{max:100,min:null},mid:{min:100,max:500},high:{min:500,max:null}};
function resetFilters(scope=true){
 state.filters={min:null,max:null,activity:0,invest:0,research:0};
 if(scope){state.eras=state.series.map(x=>x.id);state.langs=LANGS.map(l=>l.id);if(state.setId==='all'||state.setId.startsWith('era:'))state.setId='all';}
 syncScreener();
}
function syncScreener(){
 const f=state.filters,eras=activeEras();
 if($('#price-min'))$('#price-min').value=f.min??'';if($('#price-max'))$('#price-max').value=f.max??'';
 // Legacy mode has no research rank: hide its slider, sort and preset and drop an active value.
 const off=researchOff();if(off){f.research=0;if(state.sort==='research'){state.sort='featured';if($('#sort'))$('#sort').value='featured';}}
 if($('#research-block'))$('#research-block').hidden=off;if($('#sort-research'))$('#sort-research').hidden=off;if($('#preset-research'))$('#preset-research').hidden=off;
 $('#activity-min').value=f.activity;$('#invest-min').value=f.invest;if($('#research-min'))$('#research-min').value=f.research;for(const id of ['#activity-min','#invest-min','#research-min'])$(id)?.style?.setProperty('--fill',$(id).value+'%');
 $('#activity-out').textContent=f.activity?f.activity+'+':'Any';$('#invest-out').textContent=f.invest?f.invest+'+':'Any';if($('#research-out'))$('#research-out').textContent=f.research?f.research+'+':'Any';
 $('#price-grade').textContent=gradeNames[state.grade].replace(' · near mint',' NM');
 $('#era-chips').innerHTML=state.series.map(x=>`<button data-era="${x.id}" class="${eras.includes(x.id)?'active':''}" aria-pressed="${eras.includes(x.id)}" title="${esc(x.name)} · ${esc(x.years)}">${marketSeriesLabel(x.id)}</button>`).join('');
 $('#era-chips').querySelectorAll('[data-era]').forEach(b=>b.onclick=()=>toggleEra(b.dataset.era));
 if($('#lang-chips')){const mode=langMode();$('#lang-chips').innerHTML=[['all','All'],...LANGS.map(l=>[l.id,l.label])].map(([id,label])=>`<button data-lang-mode="${id}" class="${mode===id?'active':''}" aria-pressed="${mode===id}">${label}</button>`).join('');$('#lang-chips').querySelectorAll('[data-lang-mode]').forEach(b=>b.onclick=()=>setLangMode(b.dataset.langMode));}
 const n=filterCount();$('#filter-count').textContent=n;$('#filter-count').hidden=!n;
 $('#reset-filters').disabled=!n&&state.setId==='all';
 $('#filters-toggle').setAttribute('aria-expanded',String(state.filtersOpen));$('#screener').classList.toggle('open',state.filtersOpen);
 document.querySelectorAll('[data-preset]').forEach(b=>{const p=PRESETS[b.dataset.preset],on=Object.entries(p).every(([k,v])=>f[k]===v);b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
}
// Browse language switch: all cards, English only or Japanese only.
const langMode=()=>state.langs.length===LANGS.length?'all':state.langs[0];
function setLangMode(mode){
 state.langs=mode==='all'?LANGS.map(l=>l.id):[mode];
 // A set from the other language can't stay selected; the info screen follows the chosen language again.
 if(!state.setId.startsWith('era:')&&state.setId!=='all'&&!state.langs.includes(activeSet()?.lang||'en'))state.setId='all';
 resetDetailVersion();updateView();
}
// Kept for older callers: turn one language on or off (at least one stays on).
function toggleLang(id){const on=state.langs.includes(id);if(on&&state.langs.length===1){toast('Keep at least one language included.');return;}setLangMode(on?LANGS.map(l=>l.id).find(x=>x!==id):'all');}
function toggleEra(id){
 const current=activeEras(),on=current.includes(id);
 if(on&&current.length===1){toast('Keep at least one era included.');return;}
 const next=state.series.map(x=>x.id).filter(x=>x===id?!on:current.includes(x));
 const set=activeSet();state.eras=next;
 state.setId=set&&next.includes(set.series)?set.id:next.length===1?'era:'+next[0]:'all';
 state.category='all';updateView();
}
function applyFilters(){state.limit=60;$('#card-list').scrollTop=0;syncScreener();renderList();const visible=filteredCards();if(state.selected&&!visible.some(c=>c.id===state.selected)){state.selected=visible[0]?.id||null;resetDetailVersion();renderDetail();if(state.selected&&!state.full[state.selected])loadCard(state.selected);}}
function renderFilterChips(){
 const f=state.filters,chips=[];
 if(state.setId==='all'&&state.eras.length&&state.eras.length<state.series.length)chips.push(['eras','Eras: '+state.eras.map(marketSeriesLabel).join(', ')]);
 if(state.langs.length<LANGS.length)chips.push(['langs',state.langs.map(l=>LANGS.find(x=>x.id===l).label).join(', ')+' only']);
 if(f.min!=null||f.max!=null)chips.push(['price',(f.min!=null&&f.max!=null?wholeMoney(f.min)+'–'+wholeMoney(f.max):f.min!=null?wholeMoney(f.min)+'+':'Up to '+wholeMoney(f.max))+' · '+gradeNames[state.grade].replace(' · near mint',' NM')]);
 if(f.activity>0)chips.push(['activity','Activity '+f.activity+'+']);
 if(f.invest>0)chips.push(['invest','Inv. score '+f.invest+'+']);
 if(f.research>0)chips.push(['research','Research '+f.research+'+']);
 const box=$('#active-filters');box.innerHTML=chips.map(([k,l])=>`<button class="chip" data-unfilter="${k}" aria-label="Remove filter: ${esc(l)}">${esc(l)}<span aria-hidden="true">×</span></button>`).join('');
 box.querySelectorAll('[data-unfilter]').forEach(b=>b.onclick=()=>{const k=b.dataset.unfilter;if(k==='eras'){state.eras=state.series.map(x=>x.id);updateView();return;}if(k==='langs'){state.langs=LANGS.map(l=>l.id);updateView();return;}if(k==='price'){f.min=null;f.max=null;}else f[k]=0;applyFilters();});
}
function readPrice(el){const v=el.value.trim();if(v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;}
let priceTimer;
function wireScreener(){
 const price=()=>{clearTimeout(priceTimer);priceTimer=setTimeout(()=>{let min=readPrice($('#price-min')),max=readPrice($('#price-max'));if(min!=null&&max!=null&&min>max)[min,max]=[max,min];state.filters.min=min;state.filters.max=max;applyFilters();},250);};
 $('#price-min').oninput=price;$('#price-max').oninput=price;
 $('#activity-min').oninput=e=>{state.filters.activity=Number(e.target.value);applyFilters();};
 $('#invest-min').oninput=e=>{state.filters.invest=Number(e.target.value);applyFilters();};
 if($('#research-min'))$('#research-min').oninput=e=>{state.filters.research=Number(e.target.value);applyFilters();};
 document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const p=PRESETS[b.dataset.preset],on=Object.entries(p).every(([k,v])=>state.filters[k]===v);for(const [k,v] of Object.entries(p))state.filters[k]=on?(k==='min'||k==='max'?null:0):v;applyFilters();});
 $('#reset-filters').onclick=()=>{resetFilters(true);state.category='all';updateView();toast('Filters cleared.');};
 $('#filters-toggle').onclick=()=>{state.filtersOpen=!state.filtersOpen;syncScreener();};
}
async function loadScores(retry=true){
 try{const r=await request('/api/scores');state.scores=r.scores||{};state.research=r.research||(r.research===null?{mode:'legacy'}:null);state.scoreError=null;if($('#error-banner').textContent===SERVER_OLD)error('');}
 catch(e){state.scoreError={message:e.message,status:e.status||0};
  if(e.status===404)error(SERVER_OLD);
  else if(retry)setTimeout(()=>loadScores(false),4000);}
 if(state.view==='browse'||state.view==='watch'){renderList();renderDetail();}else if(state.view==='invest')renderInvest();
}
async function loadTicker(){
 try{const r=await request('/api/movers?period=week');const items=[];for(const g of MOVER_GRADES)for(const m of (r.grades?.[g]?.movers||[]).slice(0,3)){const c=cardById(m.card_id);if(c)items.push({c,g,m});}state.ticker=items;}catch{state.ticker=[];}
 renderTicker();
}
function renderTicker(){
 const el=$('#ticker');if(!el)return;const items=state.ticker||[];
 if(!items.length){el.innerHTML=state.ticker?'<span class="tick-empty">No confirmed weekly movers in the current data</span>':'';return;}
 const row=items.map(({c,g,m})=>`<button class="tick-item" data-tick="${c.id}" data-grade="${g}" title="${esc(c.name)} · ${esc(c.setName)} · ${gradeNames[g]}: ${wholeMoney(m.from)} → ${wholeMoney(m.to)} this week"><span>${esc(c.name)}</span><small>${shortGrade(g)}</small><b class="pl up">${pct(m.change)}</b></button>`).join('');
 el.innerHTML=`<div class="ticker-track">${row}<span aria-hidden="true" class="ticker-dup">${row}</span></div>`;
 el.querySelectorAll('[data-tick]').forEach(b=>b.onclick=()=>openCard(b.dataset.tick,b.dataset.grade));
}

// ---------- Views ----------

// ---------- Market: indices, Pokémon demand, set trends ----------
// Everything here reads the precomputed metrics (/api/market-overview, /api/indices, /api/index,
// /api/lifecycle), rebuilt on the server after each update and nightly. Index levels come from guide
// prices; "Typical card" is the equal-weighted index, "By value" weights cards by price.
const MARKET_TABS=[['overview','Overview'],['char','Pokémon'],['set','Sets'],['tier','Rarity'],['artist','Artists'],['screen','Screener']];
const RET_KEYS=[['ret_1d','1D'],['ret_7d','7D'],['ret_30d','30D'],['ret_90d','90D'],['ret_1y','1Y']];
// The equal-weighted ("typical card") version of a return, where one exists.
const retOf=(r,k)=>state.market.weight==='eq'&&r?.['eq_'+k]!==undefined?r['eq_'+k]:r?.[k];
const retCell=v=>v==null?'<span class="pl flat">—</span>':`<span class="pl ${v>0?'up':v<0?'down':'flat'}">${pct(v)}</span>`;
const times=v=>v==null?'—':v.toFixed(v>=10?0:v>=3?1:2)+'×';
const share=v=>v==null?'—':v>0&&v<.095?(v*100).toFixed(1)+'%':Math.round(v*100)+'%';
const marketKey=(...parts)=>[state.marketLang,state.market.grade,...parts].join('|');
const bigMoney=v=>v==null?'—':Math.abs(v)>=1e6?'$'+(v/1e6).toFixed(Math.abs(v)>=1e7?0:1)+'M':compact(v);
const ageText=release=>{const m=Math.max(0,Math.round((Date.now()-Date.parse(release+'T00:00:00Z'))/2629800000));return m<24?m+' mo':(m/12).toFixed(m<120?1:0)+' yr';};
// A small line of the last year's month ends, green when it ends higher than it started.
function sparkSvg(points,{w=84,h=24}={}){
 const vals=(points||[]).map(p=>state.market.weight==='eq'?p[2]:p[1]).filter(v=>v>0);
 if(vals.length<2)return '<span class="spark empty"></span>';
 const lo=Math.min(...vals),hi=Math.max(...vals),X=i=>1+i*(w-2)/(vals.length-1),Y=v=>h-2-(v-lo)/(hi-lo||1)*(h-4);
 return `<svg class="spark ${vals.at(-1)>=vals[0]?'up':'down'}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${vals.map((v,i)=>X(i).toFixed(1)+','+Y(v).toFixed(1)).join(' ')}"/></svg>`;
}
async function loadMarket(kind,force=false){
 if(kind==='screen'){if(state.view==='market')renderMarket();return;}
 const key=marketKey(kind),have=state.market.data[key];
 if(have&&!force&&Date.now()-have._at<FRESH_MS)return;
 try{
  const r=kind==='overview'?await request('/api/market-overview?lang='+state.marketLang+'&grade='+state.market.grade):await request('/api/indices?spark=1&kind='+kind+'&lang='+state.marketLang+'&grade='+state.market.grade);
  r._at=Date.now();state.market.data[key]=r;state.market.error=null;
 }catch(e){if(!have)state.market.error=e.message;}
 if(state.view==='market')renderMarket();
}
async function loadIndex(id,force=false){
 const key=marketKey('index',id),have=state.market.data[key];
 if(have&&!force&&Date.now()-have._at<FRESH_MS)return;
 try{const r=await request('/api/index?id='+encodeURIComponent(id)+'&grade='+state.market.grade);r._at=Date.now();state.market.data[key]=r;state.market.error=null;}
 catch(e){state.market.data[key]={_at:Date.now(),missing:e.message};}
 if(state.view==='market'&&state.market.index===id)renderMarket();
}
async function loadLifecycle(era){
 const key=marketKey('life',era);if(state.market.data[key])return;
 try{const r=await request('/api/lifecycle?lang='+state.marketLang+'&grade='+state.market.grade+'&era='+era);r._at=Date.now();state.market.data[key]=r;}catch(e){state.market.data[key]={_at:Date.now(),curves:[],typical:[],error:e.message};}
 if(state.view==='market'&&state.market.tab==='set')renderMarket();
}
// Extra Pokémon views, each loaded once per language and grade: money flow, undervalued cards, and the
// other language's character indices for English vs Japanese demand.
// Load another tab's data for the overview once, even if it fails (no retry loop on re-render).
const marketTried=new Set();
function ensureMarket(kind){const key=marketKey(kind);if(marketTried.has(key))return;marketTried.add(key);loadMarket(kind);}
async function loadMarketExtra(name,path){
 const key=marketKey(name);if(state.market.data[key])return;state.market.data[key]={loading:true};
 try{const r=await request(path);r._at=Date.now();state.market.data[key]=r;}catch(e){state.market.data[key]={error:e.message,_at:Date.now()};}
 if(state.view==='market')renderMarket();
}
function openIndex(id){state.market.index=id;state.market.memberSort={key:'price',dir:-1};renderMarket();loadIndex(id);$("#market-view").scrollTop=0;globalThis.scrollTo?.(0,0);}
const KIND_LABEL={all:'Market',top100:'Top 100',era:'Era',set:'Set',char:'Pokémon',tier:'Rarity tier',artist:'Artist'};
// Sortable tables: columns are [key, label, render(row), {num, title}].
function sortRows(rows,sort){const {key,dir}=sort,val=r=>typeof key==='function'?key(r):r[key];return [...rows].sort((a,b)=>{const x=val(a),y=val(b);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return (typeof x==='string'?x.localeCompare(y):x-y)*dir;});}
function marketTable(rows,columns,sort,{id,rowAttr}){
 const head=columns.map(([key,label,,opt={}])=>{const k=opt.sortKey||key,on=sort.key===k||(typeof sort.key==='string'&&sort.key===k);return `<th class="${opt.num?'num':''}"${opt.title?` title="${esc(opt.title)}"`:''}>${opt.nosort?esc(label):`<button data-sort="${esc(typeof k==='string'?k:key)}" class="${on?'on':''}">${esc(label)}${on?(sort.dir<0?' ↓':' ↑'):''}</button>`}</th>`;}).join('');
 return `<div class="table-wrap"><table class="market-table" id="${id}"><thead><tr>${head}</tr></thead><tbody>${rows.map(r=>`<tr ${rowAttr(r)} tabindex="0">${columns.map(([,,render,opt={}])=>`<td class="${opt.num?'num':''}">${render(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function wireTable(view,id,sortState,rerender,open){
 const t=view.querySelector('#'+id);if(!t)return;
 t.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{const k=b.dataset.sort;if(sortState.key===k)sortState.dir*=-1;else{sortState.key=k;sortState.dir=-1;}rerender();});
 t.querySelectorAll('tbody tr').forEach(tr=>{tr.onclick=()=>open(tr);tr.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();open(tr);}};});
}
// Squarified treemap of `items` ({value}) in a w×h box. Returns [{item,x,y,w,h}].
function treemap(items,w,h){
 const out=[],list=items.filter(i=>i.value>0).sort((a,b)=>b.value-a.value),total=list.reduce((n,i)=>n+i.value,0);if(!total)return out;
 let x=0,y=0,W=w,H=h,rest=list.map(i=>({item:i,area:i.value/total*w*h}));
 const worst=(row,side)=>{const s=row.reduce((n,r)=>n+r.area,0),mx=Math.max(...row.map(r=>r.area)),mn=Math.min(...row.map(r=>r.area));return Math.max(side*side*mx/(s*s),s*s/(side*side*mn));};
 while(rest.length){
  const side=Math.min(W,H),row=[rest[0]];let i=1;
  while(i<rest.length&&worst([...row,rest[i]],side)<=worst(row,side)){row.push(rest[i]);i++;}
  const s=row.reduce((n,r)=>n+r.area,0);
  if(W>=H){const cw=s/H;let cy=y;for(const r of row){const rh=r.area/cw;out.push({item:r.item,x,y:cy,w:cw,h:rh});cy+=rh;}x+=cw;W-=cw;}
  else{const rh=s/W;let cx=x;for(const r of row){const rw=r.area/rh;out.push({item:r.item,x:cx,y,w:rw,h:rh});cx+=rw;}y+=rh;H-=rh;}
  rest=rest.slice(i);
 }
 return out;
}
const heatColor=v=>{if(v==null)return 'var(--panel-3)';const a=Math.min(1,Math.abs(v)/.5);return v>=0?`color-mix(in srgb, var(--up) ${Math.round(18+a*62)}%, var(--panel))`:`color-mix(in srgb, var(--down) ${Math.round(18+a*62)}%, var(--panel))`;};
function marketHead(){
 const m=state.market,d=m.data[marketKey('overview')]||m.data[marketKey(m.tab)],run=d?.run;
 const built=run?.finished_at?'Metrics built '+new Date(run.finished_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
 const seg=(name,list,on)=>`<div class="segmented" role="group" aria-label="${name}">${list.map(([k,l])=>`<button data-m-${name.toLowerCase()}="${k}" class="${on===k?'active':''}" aria-pressed="${on===k}">${l}</button>`).join('')}</div>`;
 return `<section class="panel movers-head market-head"><div><h2>${m.index?'Index':'Market terminal'}</h2><p>Indices for the whole market, each era, set, Pokémon, rarity tier and artist, from guide prices read every day. ${esc(built)}</p></div><div class="head-actions">${seg('Lang',LANGS.map(l=>[l.id,l.label]),state.marketLang)}${seg('Grade',MOVER_GRADES.map(g=>[g,shortGrade(g)]),m.grade)}${seg('Weight',[['eq','Typical card'],['value','By value']],m.weight)}</div></section>`
  +(m.index?'':`<nav class="market-tabs" aria-label="Market sections">${MARKET_TABS.map(([k,l])=>`<button data-m-tab="${k}" class="${m.tab===k?'active':''}" aria-pressed="${m.tab===k}">${l}</button>`).join('')}</nav>`);
}
function noMetrics(){return `<div class="panel empty-state"><strong>No market metrics yet</strong><p>They are built after Update sales or a guide sweep, and every night. Run a sweep to build them now.</p><button class="button primary" id="m-sweep">${icon('refresh')} Sweep guide prices</button></div>`;}
function renderMarket(){
 const view=$('#market-view'),m=state.market;
 if(m.index){renderIndexPage(view);return;}
 const kind=m.tab,d=m.data[marketKey(kind)];
 if(kind==='screen'){view.innerHTML=marketHead()+screenerView();wireMarket(view);wireScreen(view);return;}
 let body;
 if(!d)body=m.error?`<div class="panel empty-state"><strong>The market couldn't be loaded.</strong><p>${esc(m.error)}</p><button class="button" id="m-retry">Try again</button></div>`:'<div class="loading"><span class="spinner"></span>Loading the market…</div>';
 else if(!d.run?.as_of)body=noMetrics();
 else body=kind==='overview'?overviewView(d):indexTableView(kind,d);
 view.innerHTML=marketHead()+body;
 wireMarket(view);
 if(d?.run?.as_of&&kind!=='overview')wireIndexTable(view,kind);
}
function wireMarket(view){
 const m=state.market,reload=()=>{renderMarket();if(m.index)loadIndex(m.index);else loadMarket(m.tab);};
 view.querySelectorAll('[data-m-tab]').forEach(b=>b.onclick=()=>{m.tab=b.dataset.mTab;m.index=null;reload();});
 view.querySelectorAll('[data-m-lang]').forEach(b=>b.onclick=()=>{state.marketLang=b.dataset.mLang;if(m.index)m.index=m.index.replace(/^(en|ja):/,state.marketLang+':');reload();});
 view.querySelectorAll('[data-m-grade]').forEach(b=>b.onclick=()=>{m.grade=b.dataset.mGrade;reload();});
 view.querySelectorAll('[data-m-weight]').forEach(b=>b.onclick=()=>{m.weight=b.dataset.mWeight;renderMarket();});
 view.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>openIndex(b.dataset.index));
 view.querySelectorAll('[data-m-period]').forEach(b=>b.onclick=()=>{m.period=b.dataset.mPeriod;renderMarket();});
 view.querySelectorAll('[data-heat-by]').forEach(b=>b.onclick=()=>{m.heatBy=b.dataset.heatBy;renderMarket();});
 view.querySelectorAll('.movers-panel [data-card],.tape [data-card]').forEach(b=>b.onclick=()=>openCard(b.dataset.card,m.grade));
 if($('#tape-more'))$('#tape-more').onclick=()=>{m.tapeAll=true;renderMarket();};
 if($('#m-retry'))$('#m-retry').onclick=()=>{m.error=null;reload();};
 if($('#m-sweep'))$('#m-sweep').onclick=startSweep;
 if($('#m-back'))$('#m-back').onclick=()=>{m.index=null;renderMarket();loadMarket(m.tab);};
 wireCharts(view);wireImages();
}
function overviewView(d){
 const m=state.market,idx=d.indices,b=d.breadth||{};
 const order=[...idx.filter(i=>i.kind==='all'),...idx.filter(i=>i.kind==='top100'),...state.series.map(s=>idx.find(i=>i.kind==='era'&&i.key===s.id)).filter(Boolean)];
 const cards=order.map(i=>`<button class="index-card" data-index="${esc(i.index_id)}"><span class="index-kind">${esc(KIND_LABEL[i.kind])}</span><strong>${esc(i.name)}</strong><span class="index-rets">${[['ret_30d','30D'],['ret_1y','1Y']].map(([k,l])=>`<span><small>${l}</small>${retCell(retOf(i,k))}</span>`).join('')}</span>${sparkSvg(i.spark,{w:150,h:34})}<small class="index-foot">${i.priced.toLocaleString()} cards · ${bigMoney(i.value)}</small></button>`).join('');
 const total=(b.up_30d||0)+(b.down_30d||0),upShare=total?b.up_30d/total:0;
 const breadth=`<section class="panel breadth"><div class="panel-head"><div><h2>Market breadth</h2><p>${(b.priced||0).toLocaleString()} priced ${shortGrade(m.grade)} cards · guide prices</p></div></div><div class="breadth-body"><div class="breadth-bar" role="img" aria-label="${b.up_30d||0} cards up and ${b.down_30d||0} down over 30 days"><i class="up" style="width:${(upShare*100).toFixed(1)}%"></i><i class="down" style="width:${((1-upShare)*100).toFixed(1)}%"></i></div><div class="breadth-stats"><div><small>Up 30D</small><b class="pl up">${(b.up_30d||0).toLocaleString()}</b></div><div><small>Down 30D</small><b class="pl down">${(b.down_30d||0).toLocaleString()}</b></div><div><small>52-week highs</small><b>${(b.highs||0).toLocaleString()}</b></div><div><small>52-week lows</small><b>${(b.lows||0).toLocaleString()}</b></div><div><small>Sales, 30 days</small><b>${(b.sales_30d||0).toLocaleString()}</b></div></div></div></section>`;
 const periods=[['ret_1d','1D'],['ret_7d','7D'],['ret_30d','30D'],['ret_1y','1Y']],period=m.period||'ret_30d';
 const by=m.heatBy,chars=m.data[marketKey('char')];
 if(by==='char'&&!chars)ensureMarket('char');
 const groups={set:d.sets,tier:idx.filter(i=>i.kind==='tier'),char:(chars?.rows||[]).filter(r=>r.priced>=3).sort((a,b)=>b.value-a.value).slice(0,80)};
 const tiles=treemap(groups[by].map(s=>({...s,value:s.value})),1000,520);
 const what={set:'set',char:'Pokémon (the 80 most valuable, 3+ cards)',tier:'rarity tier'}[by];
 const heat=`<section class="panel heat-panel"><div class="panel-head"><div><h2>Heatmap</h2><p>Each box is a ${what}, sized by the total guide value of its cards and coloured by its index change. Select one to open it.</p></div><div class="head-actions"><div class="segmented" role="group" aria-label="Group by">${[['set','Sets'],['char','Pokémon'],['tier','Rarity']].map(([k,l])=>`<button data-heat-by="${k}" class="${by===k?'active':''}" aria-pressed="${by===k}">${l}</button>`).join('')}</div><div class="segmented" role="group" aria-label="Period">${periods.map(([k,l])=>`<button data-m-period="${k}" class="${period===k?'active':''}" aria-pressed="${period===k}">${l}</button>`).join('')}</div></div></div>
  <div class="heatmap" role="list">${tiles.map(t=>{const v=retOf(t.item,period),big=t.w>70&&t.h>34;return `<button role="listitem" class="heat-tile" data-index="${esc(t.item.index_id)}" style="left:${(t.x/10).toFixed(3)}%;top:${(t.y/5.2).toFixed(3)}%;width:${(t.w/10).toFixed(3)}%;height:${(t.h/5.2).toFixed(3)}%;background:${heatColor(v)}" title="${esc(t.item.name)} · ${v==null?'no change data':pct(v)} · ${bigMoney(t.item.value)}">${big?`<span>${esc(t.item.name)}</span><b>${v==null?'—':pct(v)}</b>`:''}</button>`;}).join('')}</div></section>`;
 const tiers=idx.filter(i=>i.kind==='tier'),best=sortRows(tiers,{key:r=>retOf(r,'ret_1y'),dir:-1});
 const tierPanel=`<section class="panel"><div class="panel-head"><div><h2>Rarity tiers · 1 year</h2><p>Which kinds of card have done best.</p></div></div><ol class="tier-list">${best.map(i=>`<li><button data-index="${esc(i.index_id)}"><span>${esc(i.name)}</span><small>${i.priced.toLocaleString()} cards</small>${sparkSvg(i.spark)}${retCell(retOf(i,'ret_1y'))}</button></li>`).join('')}</ol></section>`;
 return `<div class="index-cards">${cards}</div><div class="market-grid">${breadth}${tierPanel}</div>${heat}${moversPanel(d,period)}${tapePanel()}<p class="sales-note">Guide prices are PriceCharting's (ungraded is mixed condition; Grade 9 includes other graders). Indices are chain-linked, so cards joining or leaving never move them. Past changes are not a forecast.</p>`;
}
// ---------- Screener ----------
// Filters and sorts every card of the Market's language and grade on its metrics (/api/screen). The screen
// is remembered in this browser; named screens are saved to the account (/api/screens).
const jsonClone=v=>JSON.parse(JSON.stringify(v));
const SCREEN_KEY='futuresight-screen',SCREEN_DEFAULT={filters:{},eras:[],tiers:[],query:'',sort:{field:'price',dir:-1}};
const SCREEN_COLUMNS=['price','ret_30d','ret_1y','premium','char_premium','sales_90d','gem_rate','set_age'];
const SCREEN_PRESETS=[
 ['Cheap vs peers, still selling',{premium:[null,.8],sales_90d:[2,null]},{field:'premium',dir:1}],
 ['Momentum with volume',{ret_30d:[.1,null],sales_90d:[3,null]},{field:'ret_30d',dir:-1}],
 ['Pullbacks in popular Pokémon',{char_premium:[2,null],from_high:[null,-.25]},{field:'from_high',dir:1}],
 ['Wide PSA 10 spreads, high gem rate',{spread_10_9:[4,null],gem_rate:[.4,null]},{field:'spread_10_9',dir:-1}],
];
function savedScreen(){try{const v=JSON.parse(localStorage.getItem(SCREEN_KEY)||'null');if(v&&typeof v==='object'&&v.filters&&typeof v.filters==='object')return {...SCREEN_DEFAULT,...v};}catch{}return jsonClone(SCREEN_DEFAULT);}
function storeScreen(){try{localStorage.setItem(SCREEN_KEY,JSON.stringify(state.market.screen));}catch{}}
const screenSpec=()=>{const sc=state.market.screen;return {lang:state.marketLang,grade:state.market.grade,filters:sc.filters,eras:sc.eras,tiers:sc.tiers,query:sc.query,sort:sc.sort};};
// Shown and entered in percent for pct fields; sent as fractions.
const PCT_KINDS=new Set(['ret','pct']);
const toInput=(kind,v)=>v==null?'':PCT_KINDS.has(kind)?+(v*100).toFixed(2):v,fromInput=(kind,v)=>v===''||v==null?null:PCT_KINDS.has(kind)?Number(v)/100:Number(v);
function fieldText(kind,v){if(v==null)return '—';return kind==='money'?money(v):kind==='ret'?retCell(v):kind==='pct'?share(v):kind==='x'?times(v):kind==='int'?Math.round(v).toLocaleString():v.toFixed(2);}
async function runScreenNow(){
 const m=state.market,spec=screenSpec(),key=JSON.stringify(spec);if(m.screenData?.key===key&&!m.screenData.error)return;
 m.screenData={key,loading:true,prev:m.screenData?.rows?m.screenData:null};
 try{const r=await send('/api/screen','POST',{screen:spec,limit:m.screenLimit||100});m.fields=r.fields;if(m.screenData.key===key)m.screenData={key,...r};}
 catch(e){if(m.screenData.key===key)m.screenData={key,error:e.message};}
 if(state.view==='market'&&m.tab==='screen')renderMarket();
}
async function loadScreens(){try{state.market.screens=(await request('/api/screens')).screens;}catch{state.market.screens=[];}if(state.view==='market'&&state.market.tab==='screen')renderMarket();}
function screenerView(){
 const m=state.market,sc=m.screen??=savedScreen();
 if(!m.screens){m.screens=[];loadScreens();}
 const key=JSON.stringify(screenSpec());if(m.screenData?.key!==key)runScreenNow();
 const d=m.screenData?.loading?m.screenData.prev:m.screenData,fields=m.fields||d?.fields||[],F=new Map(fields.map(f=>[f[0],f]));
 const filterRows=Object.entries(sc.filters).map(([k,[lo,hi]])=>{const f=F.get(k)||[k,k,'num'],unit=PCT_KINDS.has(f[2])?'%':f[2]==='money'?'$':f[2]==='x'?'×':'';return `<div class="screen-filter"><span>${esc(f[1])}</span><label>Min<input type="number" step="any" data-sf-min="${k}" value="${toInput(f[2],lo)}" aria-label="${esc(f[1])} minimum"></label><label>Max<input type="number" step="any" data-sf-max="${k}" value="${toInput(f[2],hi)}" aria-label="${esc(f[1])} maximum"></label><small>${unit}</small><button class="icon-button" data-sf-remove="${k}" aria-label="Remove ${esc(f[1])} filter">×</button></div>`;}).join('');
 const add=`<select id="sf-add" aria-label="Add a filter"><option value="">Add a filter…</option>${fields.filter(f=>!(f[0] in sc.filters)).map(f=>`<option value="${f[0]}">${esc(f[1])}</option>`).join('')}</select>`;
 const eras=`<div class="segmented era-pick" role="group" aria-label="Eras">${state.series.map(x=>`<button data-sf-era="${x.id}" class="${sc.eras.includes(x.id)?'active':''}" aria-pressed="${sc.eras.includes(x.id)}">${marketSeriesLabel(x.id)}</button>`).join('')}</div>`;
 const saved=`<div class="screen-saved"><select id="sf-saved" aria-label="Saved screens"><option value="">Saved screens${m.screens.length?' ('+m.screens.length+')':''}</option>${m.screens.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select><input id="sf-name" type="text" maxlength="60" placeholder="Name this screen" aria-label="Screen name"><button class="button" id="sf-save">Save</button>${m.screens.length?`<button class="link-button" id="sf-delete">Delete selected</button>`:''}</div>`;
 const presets=`<div class="screen-presets"><span class="muted">Start from</span>${SCREEN_PRESETS.map(([l],i)=>`<button class="chip" data-sf-preset="${i}">${esc(l)}</button>`).join('')}<button class="link-button" id="sf-reset">Clear</button></div>`;
 const cols=[...new Set([...SCREEN_COLUMNS,...Object.keys(sc.filters),sc.sort.field])].filter(k=>F.has(k));
 let table;
 if(!d)table=m.screenData?.error?`<div class="panel empty-state"><strong>The screen couldn't run.</strong><p>${esc(m.screenData.error)}</p></div>`:loadingBox('Running the screen…');
 else if(!d.run?.as_of)table=noMetrics();
 else{
  const head=cols.map(k=>{const f=F.get(k),on=sc.sort.field===k;return `<th class="num"><button data-sf-sort="${k}" class="${on?'on':''}">${esc(f[1])}${on?(sc.sort.dir<0?' ↓':' ↑'):''}</button></th>`;}).join('');
  const body=d.rows.map(r=>{const c=cardById(r.card_id);return `<tr data-card="${esc(r.card_id)}" tabindex="0"><td>${c?`<span class="member-card"><img src="${c.image}"${c.imageAlt?` data-alt="${c.imageAlt}"`:''} alt="" loading="lazy"><span><b>${esc(c.name)}</b><small>${esc(c.setName)} · ${numberCaption(c)}</small></span></span>`:esc(r.card_id)}</td><td>${esc(r.char||'—')}</td>${cols.map(k=>`<td class="num">${fieldText(F.get(k)[2],r[k])}</td>`).join('')}</tr>`;}).join('');
  table=`<div class="table-tools"><span class="muted">${d.total.toLocaleString()} cards match${d.total>d.rows.length?' · showing '+d.rows.length:''}${m.screenData?.loading?' · updating…':''}</span><button class="button" id="sf-csv">${icon('download')} Export CSV</button></div><div class="table-wrap"><table class="market-table" id="sf-table"><thead><tr><th>Card</th><th>Pokémon</th>${head}</tr></thead><tbody>${body}</tbody></table></div>${d.total>d.rows.length&&d.rows.length<500?'<button class="button show-more" id="sf-more">Show more</button>':''}`;
 }
 return `<section class="panel screener-panel"><div class="panel-head"><div><h2>Screener</h2><p>Every ${state.marketLang==='ja'?'Japanese':'English'} ${shortGrade(m.grade)} card, filtered and sorted on its market metrics, its Pokémon's demand and its set. Percentages are entered as percent (10 = 10%). Cards without a value for a filtered field are left out.</p></div></div>
  <div class="screen-controls">${presets}<div class="screen-filters">${filterRows}${add}</div><div class="screen-row"><input type="search" id="sf-query" placeholder="Name, set or number" value="${esc(sc.query)}" aria-label="Search">${eras}</div>${saved}</div>${table}</section>`;
}
let screenTimer;
function screenChanged(now=false){storeScreen();clearTimeout(screenTimer);if(now)renderMarket();else screenTimer=setTimeout(renderMarket,400);}
function wireScreen(view){
 const m=state.market,sc=m.screen,F=new Map((m.fields||[]).map(f=>[f[0],f]));
 view.querySelectorAll('[data-sf-min],[data-sf-max]').forEach(input=>input.oninput=()=>{const k=input.dataset.sfMin||input.dataset.sfMax,kind=F.get(k)?.[2],v=fromInput(kind,input.value);if(v!=null&&!Number.isFinite(v))return;sc.filters[k][input.dataset.sfMin?0:1]=v;screenChanged();});
 view.querySelectorAll('[data-sf-remove]').forEach(b=>b.onclick=()=>{delete sc.filters[b.dataset.sfRemove];screenChanged(true);});
 const add=view.querySelector('#sf-add');if(add)add.onchange=()=>{if(add.value){sc.filters[add.value]=[null,null];screenChanged(true);}};
 view.querySelectorAll('[data-sf-era]').forEach(b=>b.onclick=()=>{const e=b.dataset.sfEra;sc.eras=sc.eras.includes(e)?sc.eras.filter(x=>x!==e):[...sc.eras,e];screenChanged(true);});
 view.querySelectorAll('[data-sf-sort]').forEach(b=>b.onclick=()=>{const k=b.dataset.sfSort;sc.sort=sc.sort.field===k?{field:k,dir:-sc.sort.dir}:{field:k,dir:-1};screenChanged(true);});
 view.querySelectorAll('[data-sf-preset]').forEach(b=>b.onclick=()=>{const [,filters,sort]=SCREEN_PRESETS[Number(b.dataset.sfPreset)];sc.filters=jsonClone(filters);sc.sort={...sort};screenChanged(true);});
 const reset=view.querySelector('#sf-reset');if(reset)reset.onclick=()=>{m.screen=jsonClone(SCREEN_DEFAULT);screenChanged(true);};
 const q=view.querySelector('#sf-query');if(q)q.oninput=()=>{sc.query=q.value;screenChanged();};
 const more=view.querySelector('#sf-more');if(more)more.onclick=()=>{m.screenLimit=Math.min(500,(m.screenLimit||100)+100);m.screenData=null;renderMarket();};
 view.querySelectorAll('#sf-table tbody tr').forEach(tr=>{tr.onclick=()=>openCard(tr.dataset.card,m.grade);tr.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();openCard(tr.dataset.card,m.grade);}};});
 const pick=view.querySelector('#sf-saved');if(pick)pick.onchange=()=>{const x=m.screens.find(s=>String(s.id)===pick.value);if(!x)return;const {lang,grade,...rest}=x.screen;state.marketLang=lang;m.grade=grade;m.screen={...SCREEN_DEFAULT,...rest};m.screenName=x.name;screenChanged(true);};
 const save=view.querySelector('#sf-save');if(save)save.onclick=async()=>{const name=view.querySelector('#sf-name').value.trim()||m.screenName;if(!name){toast('Name the screen first.');return;}try{m.screens=(await send('/api/screens','POST',{name,screen:screenSpec()})).screens;m.screenName=name;toast('Screen saved.');renderMarket();}catch(e){error(e.message);}};
 const del=view.querySelector('#sf-delete');if(del)del.onclick=async()=>{const id=view.querySelector('#sf-saved').value;if(!id){toast('Choose a saved screen to delete.');return;}try{m.screens=(await send('/api/screens','DELETE',{id:Number(id)})).screens;toast('Screen deleted.');renderMarket();}catch(e){error(e.message);}};
 const csv=view.querySelector('#sf-csv');if(csv)csv.onclick=exportScreen;
}
// Every matching card (up to 20,000) with every field, as a CSV file.
async function exportScreen(){
 try{
  const r=await send('/api/screen','POST',{screen:screenSpec(),export:true}),fields=r.fields;
  const cell=v=>v==null?'':typeof v==='number'?String(v):/[",\n]/.test(v)?'"'+String(v).replaceAll('"','""')+'"':String(v);
  const lines=[['card_id','name','set','number','language','grade','pokemon',...fields.map(f=>f[0])].join(',')];
  for(const x of r.rows){const c=cardById(x.card_id);lines.push([x.card_id,c?.name,c?.setName,c?.numberLabel,x.lang,x.grade,x.char,...fields.map(f=>x[f[0]])].map(cell).join(','));}
  downloadText('futuresight-screen-'+state.marketLang+'-'+state.market.grade+'.csv',lines.join('\n'),'text/csv');
  toast(r.rows.length.toLocaleString()+' cards exported.');
 }catch(e){error(e.message);}
}
function downloadText(name,text,type){
 if(typeof document.createElement!=='function'||typeof URL?.createObjectURL!=='function')return;
 const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
// Biggest moves over the heatmap's period: sets, Pokémon (5+ priced cards) and single cards ($20+), up and down.
function moversPanel(d,period){
 const m=state.market,p={ret_1d:'1d',ret_7d:'7d',ret_30d:'30d',ret_1y:'1y'}[period],key=marketKey('cardmovers',p),cm=m.data[key];
 if(!cm)loadMarketExtra('cardmovers|'+p,'/api/card-movers?lang='+state.marketLang+'&grade='+m.grade+'&period='+p);
 const chars=m.data[marketKey('char')];if(!chars)ensureMarket('char');
 const top=(rows,dir)=>sortRows(rows.filter(r=>{const v=retOf(r,period);return v!=null&&(dir>0?v>0:v<0);}),{key:r=>retOf(r,period),dir:-dir}).slice(0,5);
 const list=(rows,dir)=>rows.length?rows.map(r=>`<li><button data-index="${esc(r.index_id)}"><span>${esc(r.name)}</span><small>${r.priced} cards</small>${retCell(retOf(r,period))}</button></li>`).join(''):'<li class="sales-note">None</li>';
 const col=(title,rows)=>`<div class="mover-col"><h3>${title}</h3><ol class="tier-list up-list">${list(top(rows,1),1)}</ol><ol class="tier-list down-list">${list(top(rows,-1),-1)}</ol></div>`;
 const cardList=rows=>rows?.length?rows.slice(0,5).map(r=>{const c=cardById(r.card_id);return `<li><button data-card="${esc(r.card_id)}"><span>${esc(c?.name||r.card_id)}</span><small>${esc(c?.setName||'')} · ${money(r.price)}</small>${retCell(r.ret)}</button></li>`;}).join(''):'<li class="sales-note">None</li>';
 const cardsCol=!cm||cm.loading?`<div class="mover-col"><h3>Cards</h3>${loadingBox('Loading…')}</div>`:cm.error?`<div class="mover-col"><h3>Cards</h3><p class="sales-note">${esc(cm.error)}</p></div>`:`<div class="mover-col"><h3>Cards <small>$20+</small></h3><ol class="tier-list up-list">${cardList(cm.up)}</ol><ol class="tier-list down-list">${cardList(cm.down)}</ol></div>`;
 return `<section class="panel movers-panel"><div class="panel-head"><div><h2>Biggest moves · ${esc({ret_1d:'1 day',ret_7d:'7 days',ret_30d:'30 days',ret_1y:'1 year'}[period])}</h2><p>Gainers on top, decliners below, from guide prices; change the period on the heatmap. Cards count only when matching sales back the move (sold median near the guide, or 2+ sales in 90 days)${cm?.unbacked?`; ${cm.unbacked.toLocaleString()} unbacked guide moves are left out`:''}.</p></div></div><div class="movers-grid">${col('Sets',d.sets)}${col('Pokémon',(chars?.rows||[]).filter(r=>r.priced>=5))}${col('Rarity tiers',d.indices.filter(i=>i.kind==='tier'))}${cardsCol}</div></section>`;
}
// The newest reported sales across every card, against each card's guide.
function tapePanel(){
 const m=state.market,t=m.data[marketKey('tape')];
 if(!t)loadMarketExtra('tape','/api/tape?lang='+state.marketLang+'&grade='+m.grade);
 const body=!t||t.loading?loadingBox('Loading sales…'):t.error?`<p class="sales-note">${esc(t.error)}</p>`:t.sales?.length?`<div class="tape">${t.sales.slice(0,m.tapeAll?60:15).map(x=>{const c=cardById(x.card_id);return `<button class="tape-row" data-card="${esc(x.card_id)}"><span class="tape-date">${date(x.event_at)}</span><span class="tape-card"><b>${esc(c?.name||x.card_id)}</b><small>${esc(c?.setName||'')} · ${c?numberCaption(c):''}${x.condition&&m.grade==='raw'?' · '+esc(x.condition):''}</small></span><b class="tape-price">${money(x.price)}</b><span class="tape-vs">${x.vs_guide==null?'':retCell(x.vs_guide)+'<small> vs guide</small>'}</span></button>`;}).join('')}</div>${!m.tapeAll&&t.sales.length>15?'<button class="button show-more" id="tape-more">Show more</button>':''}`:'<p class="sales-note">No sales recorded yet.</p>';
 return `<section class="panel"><div class="panel-head"><div><h2>Sales tape</h2><p>The newest ${shortGrade(m.grade)} sales found on card pages${m.grade==='raw'?' (any condition)':''}, against the card's guide. New sales appear as card pages are read.</p></div></div>${body}</section>`;
}
// Columns per kind. Pokémon add demand: the premium their cards sell at over same-era, same-rarity cards.
function indexColumns(kind){
 const name=['name',kind==='char'?'Pokémon':kind==='set'?'Set':kind==='tier'?'Rarity tier':'Artist',r=>`<b>${esc(r.name)}</b>${kind==='set'&&r.release?`<small>${esc(r.series||'')} · ${ageText(r.release)} old</small>`:''}`];
 const ret=([k,l])=>[k,l,r=>retCell(retOf(r,k)),{num:true,sortKey:k}];
 const common=[ret(['ret_30d','30D']),ret(['ret_90d','90D']),ret(['ret_1y','1Y']),['spark','12 months',r=>sparkSvg(r.spark),{nosort:true}],['breadth_30d','Breadth',r=>share(r.breadth_30d),{num:true,title:'Share of its priced cards up over 30 days'}],['priced','Cards',r=>r.priced.toLocaleString(),{num:true}],['sales_90d','Sales 90D',r=>r.sales_90d==null?'—':r.sales_90d.toLocaleString(),{num:true,title:'Matching sales in the 90 days before each card was last read'}],['value','Value',r=>bigMoney(r.value),{num:true,title:'Total guide value of its priced cards'}]];
 if(kind==='char')return [name,['premium','Demand',r=>times(r.premium),{num:true,title:'How many times more its cards sell for than same-era, same-rarity cards (shrunk toward 1× for Pokémon with few cards)'}],['demand_change','Demand 1Y',r=>retCell(r.demand_change),{num:true,title:'Change in the demand premium over the last year'}],...common];
 if(kind==='set')return [name,...common,['top5_share','Top 5',r=>share(r.top5_share),{num:true,title:'Share of the set\'s value in its 5 most valuable cards'}],['gem_rate','Gem rate',r=>share(r.gem_rate),{num:true,title:'PSA 10s as a share of all PSA-graded copies'}],['pop_growth_90d','Grading 90D',r=>r.pop_growth_90d==null?'—':pct(r.pop_growth_90d),{num:true,title:'Growth in PSA-graded copies over 90 days, among cards with a population reading from then (fills as card pages are read)'}]];
 return [name,...common];
}
function indexTableView(kind,d){
 const m=state.market,minCards=kind==='set'||kind==='tier'?1:m.minCards,q=m.query.trim().toLowerCase();
 const rows=d.rows.map(r=>({...r,demand_change:r.premium&&r.premium_1y?r.premium/r.premium_1y-1:null})).filter(r=>r.priced>=minCards&&(!q||r.name.toLowerCase().includes(q)));
 const sort=m.sorts[kind]||(m.sorts[kind]={key:kind==='char'?'premium':kind==='set'?'value':'ret_1y',dir:-1});
 const sorted=sortRows(rows,{...sort,key:['ret_30d','ret_90d','ret_1y'].includes(sort.key)?r=>retOf(r,sort.key):sort.key});
 const intro={char:'Demand is how many times more a Pokémon\'s cards sell for than same-era, same-rarity cards of other Pokémon. Demand 1Y shows whether that premium is growing or fading. Returns are its cards\' index.',set:'Each set as a sector: its index, how widely its cards are rising, how concentrated its value is, and how often its graded copies get a 10.',tier:'Rarity tiers across every set: which kinds of card collectors are paying up for.',artist:'Illustrators, from the Japanese checklist. English cards take the illustrator of their verified Japanese printing.'}[kind];
 let extra='';
 if(kind==='char'){
  const big=rows.filter(r=>r.priced>=8&&r.demand_change!=null),up=sortRows(big,{key:'demand_change',dir:-1}).slice(0,5),down=sortRows(big,{key:'demand_change',dir:1}).slice(0,5);
  const list=(title,items)=>`<section class="panel demand-panel"><div class="panel-head"><div><h2>${title}</h2><p>Pokémon with 8+ priced cards, by change in demand premium over a year.</p></div></div><ol class="tier-list">${items.map(i=>`<li><button data-index="${esc(i.index_id)}"><span>${esc(i.name)}</span><small>${times(i.premium_1y)} → ${times(i.premium)}</small>${sparkSvg(i.spark)}${retCell(i.demand_change)}</button></li>`).join('')||'<li class="sales-note">Not enough history yet.</li>'}</ol></section>`;
  extra=`<div class="market-grid">${list('Rising demand',up)}${list('Fading demand',down)}</div>`;
  const views=[['board','Leaderboard'],['flow','Money flow'],['cheap','Undervalued'],['lang','English vs Japanese']];
  const pick=`<nav class="market-tabs sub-tabs" aria-label="Pokémon views">${views.map(([k,l])=>`<button data-char-view="${k}" class="${m.charView===k?'active':''}" aria-pressed="${m.charView===k}">${l}</button>`).join('')}</nav>`;
  if(m.charView==='flow')return pick+flowView();
  if(m.charView==='cheap')return pick+undervaluedView();
  if(m.charView==='lang')return pick+langDemandView(d);
  extra=pick+extra;
 }
 if(kind==='set')extra=lifecycleView();
 const filters=`<div class="table-tools"><input type="search" id="m-query" placeholder="Search ${kind==='char'?'Pokémon':kind==='set'?'sets':kind==='tier'?'tiers':'artists'}" value="${esc(m.query)}" aria-label="Search">${kind==='char'||kind==='artist'?`<label>At least <select id="m-min">${[3,5,8,15,30].map(n=>`<option value="${n}" ${m.minCards===n?'selected':''}>${n} cards</option>`).join('')}</select></label>`:''}<span class="muted">${sorted.length.toLocaleString()} shown</span></div>`;
 return `${extra}<section class="panel"><div class="panel-head"><div><h2>${esc(MARKET_TABS.find(t=>t[0]===kind)[1])}</h2><p>${esc(intro)}</p></div></div>${filters}${marketTable(sorted.slice(0,m.limit),indexColumns(kind),sort,{id:'m-table',rowAttr:r=>`data-open-index="${esc(r.index_id)}"`})}${sorted.length>m.limit?`<button class="button show-more" id="m-more">Show more</button>`:''}</section>`;
}
const loadingBox=t=>`<div class="loading"><span class="spinner"></span>${t}</div>`;
// Money flow: each Pokémon's share of the market's matching sales value per month.
function flowView(){
 const m=state.market,d=m.data[marketKey('flow')];
 if(!d)loadMarketExtra('flow','/api/flows?kind=char&lang='+state.marketLang+'&grade='+m.grade);
 if(!d||d.loading)return loadingBox('Loading money flow…');
 if(d.error)return `<div class="panel empty-state"><strong>Money flow couldn't be loaded.</strong><p>${esc(d.error)}</p></div>`;
 const months=d.market.map(r=>r[0]),last=months.slice(-4,-1),prior=months.slice(-7,-4);
 const shareOver=(rows,list)=>{const v=rows.filter(r=>list.includes(r[0])).reduce((n,r)=>n+r[2],0),t=d.market.filter(r=>list.includes(r[0])).reduce((n,r)=>n+r[2],0);return t>0?v/t:null;};
 const rows=d.indices.map(i=>({...i,index_id:i.id,share:shareOver(i.rows,last),before:shareOver(i.rows,prior),sales:i.rows.filter(r=>last.includes(r[0])).reduce((n,r)=>n+r[1],0)})).map(r=>({...r,change:r.share!=null&&r.before>0?r.share/r.before-1:null}));
 const palette=[C.accent,'var(--info)','var(--warn)','#c07cff','#ff8fb8','#7dd3fc'];
 const top=rows.slice(0,6),series=top.map((r,i)=>({label:r.name,color:palette[i],points:months.slice(0,-1).map(ym=>{const x=r.rows.find(q=>q[0]===ym);return [ym,x?.[3]!=null?x[3]*100:0,monthLabel(ym)];})}));
 const chart=months.length>2?lineChart({series,height:230,width:820,label:'Share of sales value by Pokémon',format:v=>v.toFixed(1)+'%',tick:v=>v.toFixed(0)+'%'}):'<div class="chart-empty">Not enough months yet.</div>';
 const thin=d.market.filter(r=>r[3]<d.market.at(-1)[3]*.5).map(r=>r[0]);
 const sort=m.sorts.flow||(m.sorts.flow={key:'share',dir:-1});
 const cols=[['name','Pokémon',r=>`<b>${esc(r.name)}</b>`],['share','Share, last 3 mo',r=>share(r.share),{num:true,title:'Share of the market\'s matching sales value in the last three whole months'}],['before','3 months before',r=>share(r.before),{num:true}],['change','Change',r=>retCell(r.change),{num:true}],['recent','Sales value',r=>bigMoney(r.recent),{num:true}],['sales','Sales',r=>r.sales.toLocaleString(),{num:true}]];
 return `<section class="panel"><div class="panel-head"><div><h2>Money flow</h2><p>Each Pokémon's share of all matching ${shortGrade(m.grade)} sales value per month: where collectors are spending. The current month is left out until it ends.</p></div></div><div class="panel-sub">${chart}</div>${marketTable(sortRows(rows,sort),cols,sort,{id:'m-flow',rowAttr:r=>`data-open-index="${esc(r.index_id)}"`})}<p class="sales-note">Counted from each card's page, which lists only its ~30 most recent sales, so a busy card counts only from the first whole month after its oldest listed sale${thin.length?`; ${thin.map(monthLabel).join(', ')} rest on fewer than half the cards and are less reliable`:''}. Sales are matched to the exact card and grade.</p></section>`;
}
// Cards of in-demand Pokémon that sell well under their Pokémon's usual premium.
function undervaluedView(){
 const m=state.market,d=m.data[marketKey('cheap')];
 if(!d)loadMarketExtra('cheap','/api/undervalued?lang='+state.marketLang+'&grade='+m.grade);
 if(!d||d.loading)return loadingBox('Finding undervalued cards…');
 if(d.error)return `<div class="panel empty-state"><strong>The list couldn't be loaded.</strong><p>${esc(d.error)}</p></div>`;
 const sort=m.sorts.cheap||(m.sorts.cheap={key:'ratio',dir:1}),r0=d.rules;
 const cols=[['name','Card',r=>{const c=cardById(r.card_id);return c?`<span class="member-card"><img src="${c.image}"${c.imageAlt?` data-alt="${c.imageAlt}"`:''} alt="" loading="lazy"><span><b>${esc(c.name)}</b><small>${esc(c.setName)} · ${numberCaption(c)}</small></span></span>`:esc(r.card_id);}],['character','Pokémon',r=>esc(r.character)],['demand','Its demand',r=>times(r.demand),{num:true,title:'How many times more this Pokémon\'s cards sell for than same-era, same-rarity cards'}],['premium','This card',r=>times(r.premium),{num:true,title:'This card\'s price over same-era, same-rarity cards'}],['ratio','Share of demand',r=>share(r.ratio),{num:true,title:'This card\'s premium as a share of its Pokémon\'s'}],['price','Price',r=>money(r.price),{num:true}],['ret_1y','1Y',r=>retCell(r.ret_1y),{num:true}],['sales_90d','Sales 90D',r=>r.sales_90d??'—',{num:true}]];
 const rows=sortRows(d.rows.map(r=>({...r,name:cardById(r.card_id)?.name||r.card_id})),sort);
 return `<section class="panel"><div class="panel-head"><div><h2>Undervalued cards of in-demand Pokémon</h2><p>Pokémon whose cards sell at ${r0.minDemand}× or more over same-era, same-rarity cards (${r0.minCards}+ priced), and their cards priced at ${Math.round(r0.maxShare*100)}% or less of that premium, from $${r0.minPrice}. A card can be cheap for a reason (weaker art, a big print run), so look into each one.</p></div></div>${rows.length?marketTable(rows.slice(0,m.limit),cols,sort,{id:'m-cheap',rowAttr:r=>`data-card="${esc(r.card_id)}"`}):'<p class="sales-note">No card qualifies for this language and grade.</p>'}</section>`;
}
// Demand for each Pokémon in English and Japanese cards side by side.
function langDemandView(d){
 const m=state.market,other=state.marketLang==='en'?'ja':'en',key=[other,m.grade,'char'].join('|'),o=m.data[key];
 if(!o){m.data[key]={loading:true};request('/api/indices?kind=char&lang='+other+'&grade='+m.grade).then(r=>{r._at=Date.now();m.data[key]=r;},e=>{m.data[key]={error:e.message};}).finally(()=>{if(state.view==='market')renderMarket();});}
 if(!o||o.loading)return loadingBox('Loading the other language…');
 if(o.error)return `<div class="panel empty-state"><strong>Couldn't load ${other==='ja'?'Japanese':'English'} demand.</strong><p>${esc(o.error)}</p></div>`;
 const here=new Map(d.rows.filter(r=>r.priced>=m.minCards).map(r=>[r.key,r])),there=new Map(o.rows.filter(r=>r.priced>=m.minCards).map(r=>[r.key,r]));
 const en=state.marketLang==='en'?here:there,ja=state.marketLang==='en'?there:here;
 const rows=[...en.keys()].filter(k=>ja.has(k)).map(k=>({key:k,name:k,index_id:state.marketLang+':char:'+k,en:en.get(k).premium,ja:ja.get(k).premium,en_cards:en.get(k).priced,ja_cards:ja.get(k).priced,en_1y:en.get(k).premium_1y,ja_1y:ja.get(k).premium_1y})).map(r=>({...r,gap:r.en>0&&r.ja>0?r.ja/r.en:null}));
 const sort=m.sorts.lang||(m.sorts.lang={key:'gap',dir:-1});
 const cols=[['name','Pokémon',r=>`<b>${esc(r.name)}</b>`],['en','English demand',r=>times(r.en),{num:true}],['ja','Japanese demand',r=>times(r.ja),{num:true}],['gap','Japanese ÷ English',r=>times(r.gap),{num:true,title:'Above 1×: Japanese collectors pay relatively more for this Pokémon'}],['en_cards','EN cards',r=>r.en_cards,{num:true}],['ja_cards','JA cards',r=>r.ja_cards,{num:true}]];
 return `<section class="panel"><div class="panel-head"><div><h2>English vs Japanese demand</h2><p>Each Pokémon's demand premium among English cards and among Japanese cards (${m.minCards}+ priced in each). Each language is measured against its own peers, so the two are comparable as multiples. A Pokémon in much higher demand in one language can be a signal for the other.</p></div><label>At least <select id="m-min">${[3,5,8,15,30].map(n=>`<option value="${n}" ${m.minCards===n?'selected':''}>${n} cards</option>`).join('')}</select></label></div>${rows.length?marketTable(sortRows(rows,sort).slice(0,m.limit),cols,sort,{id:'m-lang',rowAttr:r=>`data-open-index="${esc(r.index_id)}"`}):'<p class="sales-note">No Pokémon has enough priced cards in both languages.</p>'}</section>`;
}
// The sets picked on the lifecycle chart side by side.
function setCompare(ids,curves,life,idx){
 const rows=state.market.data[marketKey('set')]?.rows||[];if(!ids.length)return '';
 const cell=(label,f)=>`<tr><th>${label}</th>${ids.map(id=>{const r=rows.find(x=>x.key===id),c=curves.find(x=>x.set_id===id);return `<td class="num">${f(r,c)}</td>`;}).join('')}</tr>`;
 const vsTypical=c=>{if(!c)return null;const last=c.points.at(-1),typ=life.typical.find(t=>t[0]===last[0])?.[1];return typ?last[idx]/typ-1:null;};
 return `<div class="table-wrap set-compare"><table class="market-table compact"><thead><tr><th></th>${ids.map(id=>`<th class="num"><button class="link-button" data-index="${esc(state.marketLang+':set:'+id)}">${esc(curves.find(c=>c.set_id===id)?.name||id)}</button></th>`).join('')}</tr></thead><tbody>
  ${cell('Age',(r,c)=>c?c.points.at(-1)[0]+' mo':'—')}${cell('vs era median',(r,c)=>retCell(vsTypical(c)))}${cell('30D',r=>retCell(retOf(r,'ret_30d')))}${cell('1Y',r=>retCell(retOf(r,'ret_1y')))}${cell('From peak',r=>retCell(r?.drawdown))}${cell('Cards priced',r=>r?r.priced.toLocaleString():'—')}${cell('Value',r=>bigMoney(r?.value))}${cell('Top 5 share',r=>share(r?.top5_share))}${cell('Breadth 30D',r=>share(r?.breadth_30d))}${cell('Gem rate',r=>share(r?.gem_rate))}${cell('Sales 90D',r=>r?.sales_90d==null?'—':r.sales_90d.toLocaleString())}${cell('Grading 90D',r=>r?.pop_growth_90d==null?'—':pct(r.pop_growth_90d))}</tbody></table></div>`;
}
// Sets of one era on the same clock: each set's index by months since release, against the era's median path.
function lifecycleView(){
 const m=state.market,era=m.era||state.series.at(-2)?.id||'SV',d=m.data[marketKey('life',era)];
 if(!d)loadLifecycle(era);
 const pick=`<div class="segmented era-pick" role="group" aria-label="Era">${state.series.map(s=>`<button data-m-era="${s.id}" class="${era===s.id?'active':''}" aria-pressed="${era===s.id}">${marketSeriesLabel(s.id)}</button>`).join('')}</div>`;
 let chart='<div class="loading"><span class="spinner"></span>Loading set histories…</div>',notes='';
 if(d){
  const curves=d.curves.filter(c=>c.start<=3),shown=(m.lifeSets[era]||curves.slice(-4).map(c=>c.set_id)).filter(id=>curves.some(c=>c.set_id===id));
  const months=Math.max(0,...curves.filter(c=>shown.includes(c.set_id)).map(c=>c.points.at(-1)[0]),...d.typical.map(t=>t[0]));
  const idx=state.market.weight==='eq'?2:1,palette=['var(--info)','var(--warn)','#c07cff','#ff8fb8','#7dd3fc','#fca5a5'];
  const series=[];
  if(d.typical.length>=2)series.push({label:'Era median',color:C.accent,points:Array.from({length:months+1},(_,i)=>[String(i),d.typical.find(t=>t[0]===i)?.[1]??null,'Month '+i])});
  shown.forEach((id,n)=>{const c=curves.find(x=>x.set_id===id);series.push({label:c.name,color:palette[n%palette.length],dash:false,points:Array.from({length:months+1},(_,i)=>[String(i),c.points.find(p=>p[0]===i)?.[idx]??null,'Month '+i])});});
  chart=series.length?lineChart({series,height:260,width:820,label:'Set index by months since release',format:v=>v.toFixed(1),tick:v=>v.toFixed(0)}):'<div class="chart-empty">No set in this era has an index from its first months yet.</div>';
  // Where each set sits now against the era's median at the same age.
  notes=setCompare(shown,curves,d,idx)+`<div class="life-sets">${curves.map(c=>{const last=c.points.at(-1),typ=d.typical.find(t=>t[0]===last[0])?.[1],vs=typ?last[idx]/typ-1:null;return `<label class="life-set"><input type="checkbox" data-life="${c.set_id}" ${shown.includes(c.set_id)?'checked':''}><span>${esc(c.name)}<small>${last[0]} mo · ${last[idx].toFixed(0)}${vs!=null?' · '+(vs>=0?'above':'below')+' typical by '+Math.abs(Math.round(vs*100))+'%':''}</small></span></label>`;}).join('')}</div>`;
 }
 return `<section class="panel lifecycle"><div class="panel-head"><div><h2>Set lifecycles</h2><p>Each set's index from its first month (=100), by months since release, with the era's median path. Shows whether a set is still in its post-release dip, recovering, or running ahead of its era.</p></div>${pick}</div><div class="life-chart">${chart}</div>${notes}</section>`;
}
function wireIndexTable(view,kind){
 const m=state.market;
 wireTable(view,'m-table',m.sorts[kind],renderMarket,tr=>openIndex(tr.dataset.openIndex));
 view.querySelectorAll('[data-char-view]').forEach(b=>b.onclick=()=>{m.charView=b.dataset.charView;renderMarket();});
 wireTable(view,'m-flow',m.sorts.flow,renderMarket,tr=>openIndex(tr.dataset.openIndex));
 wireTable(view,'m-lang',m.sorts.lang,renderMarket,tr=>openIndex(tr.dataset.openIndex));
 wireTable(view,'m-cheap',m.sorts.cheap,renderMarket,tr=>openCard(tr.dataset.card,m.grade));
 const q=view.querySelector('#m-query');if(q)q.oninput=()=>{m.query=q.value;const pos=q.selectionStart;renderMarket();const again=$('#m-query');again.focus();again.setSelectionRange?.(pos,pos);};
 const min=view.querySelector('#m-min');if(min)min.onchange=()=>{m.minCards=Number(min.value);renderMarket();};
 const more=view.querySelector('#m-more');if(more)more.onclick=()=>{m.limit+=100;renderMarket();};
 view.querySelectorAll('[data-m-era]').forEach(b=>b.onclick=()=>{m.era=b.dataset.mEra;renderMarket();});
 view.querySelectorAll('[data-life]').forEach(c=>c.onchange=()=>{const era=m.era||state.series.at(-2)?.id||'SV',d=m.data[marketKey('life',era)],cur=m.lifeSets[era]||d.curves.filter(x=>x.start<=3).slice(-4).map(x=>x.set_id);m.lifeSets[era]=c.checked?[...cur,c.dataset.life]:cur.filter(id=>id!==c.dataset.life);renderMarket();});
}
function renderIndexPage(view){
 const m=state.market,id=m.index,d=m.data[marketKey('index',id)];
 const back=`<button class="link-button back-link" id="m-back">${icon('chev-left')} ${esc(MARKET_TABS.find(t=>t[0]===m.tab)?.[1]||'Market')}</button>`;
 if(!d){view.innerHTML=marketHead()+back+'<div class="loading"><span class="spinner"></span>Loading the index…</div>';wireMarket(view);return;}
 if(d.missing){view.innerHTML=marketHead()+back+`<div class="panel empty-state"><strong>No data for this index</strong><p>${esc(d.missing)}</p></div>`;wireMarket(view);return;}
 const x=d.metrics,kind=x.kind,range=m.range||'1y',cut={'6m':183,'1y':366,'3y':1096,all:1e6}[range],since=new Date(Date.now()-cut*86400000).toISOString().slice(0,10);
 // Levels are month-end before the last 100 days and daily after. Charts take month ends (and today) for a
 // year or more, and weekly points for six months, so the spacing stays even.
 const monthEnd=day=>new Date(Date.parse(day+'T00:00:00Z')+86400000).getUTCDate()===1,lastDay=d.history.at(-1)?.[0];
 const weekly=day=>Math.round((Date.parse(lastDay)-Date.parse(day))/86400000)%7===0;
 const hist=d.history.filter(h=>h[0]>=since&&(h[0]===lastDay||(range==='6m'?weekly(h[0])&&Date.parse(lastDay)-Date.parse(h[0])<100*86400000||monthEnd(h[0])&&Date.parse(lastDay)-Date.parse(h[0])>=100*86400000:monthEnd(h[0])))),base=hist[0];
 const chart=hist.length>=2?lineChart({series:[{label:'Typical card',color:C.accent,area:m.weight==='eq',points:hist.map(h=>[h[0],h[2]/base[2]*100,date(h[0])])},{label:'By value',color:'var(--info)',dash:m.weight==='eq',area:m.weight!=='eq',points:hist.map(h=>[h[0],h[1]/base[1]*100,date(h[0])])}],height:250,width:820,label:d.name+' index',format:v=>v.toFixed(1),tick:v=>v.toFixed(0)}):'<div class="chart-empty">Not enough history yet.</div>';
 const prem=kind==='char'||kind==='artist'||kind==='set'?hist.filter(h=>h[5]!=null):[];
 const premChart=prem.length>=2?`<div class="panel-sub"><h3>${kind==='char'?'Demand premium':'Premium over peers'}</h3><p class="sales-note">How many times more these cards sell for than same-era, same-rarity cards, over time.</p>${lineChart({series:[{label:'Premium',color:'var(--warn)',points:prem.map(h=>[h[0],h[5],date(h[0])])}],height:150,width:820,label:'Premium over time',format:v=>v.toFixed(2)+'×',tick:v=>v.toFixed(1)+'×'})}</div>`:'';
 const stat=(label,value,title='')=>`<div${title?` title="${esc(title)}"`:''}><small>${label}</small><b>${value}</b></div>`;
 const stats=`<div class="index-stats">${RET_KEYS.map(([k,l])=>stat(l,retCell(retOf(x,k)))).join('')}${stat('52-week range',x.low_52w!=null?`${(x.low_52w/x.level*100-100).toFixed(0)}% to +${(x.high_52w/x.level*100-100).toFixed(0)}%`:'—','Low and high of the value-weighted level over 52 weeks, against today')}${stat('From peak',retCell(x.drawdown))}${stat('Volatility',x.volatility==null?'—':Math.round(x.volatility*100)+'%','Annualised, from month-end levels')}${stat('Cards',`${x.priced.toLocaleString()} / ${x.members.toLocaleString()}`)}${stat('Value',bigMoney(x.value))}${stat('Breadth 30D',share(x.breadth_30d),'Share of priced cards up over 30 days')}${stat('Top 5',share(x.top5_share),'Share of value in the 5 most valuable cards')}${stat('Gem rate',share(x.gem_rate))}${x.premium!=null?stat(kind==='char'?'Demand':'Premium',times(x.premium)+(x.premium_1y?` <small>${times(x.premium_1y)} a year ago</small>`:'')):''}</div>`;
 const ranges=`<div class="segmented" role="group" aria-label="Range">${[['6m','6M'],['1y','1Y'],['3y','3Y'],['all','All']].map(([k,l])=>`<button data-m-range="${k}" class="${range===k?'active':''}" aria-pressed="${range===k}">${l}</button>`).join('')}</div>`;
 const sort=m.memberSort,cols=[['name','Card',r=>{const c=cardById(r.card_id);return c?`<span class="member-card"><img src="${c.image}"${c.imageAlt?` data-alt="${c.imageAlt}"`:''} alt="" loading="lazy"><span><b>${esc(c.name)}</b><small>${esc(c.setName)} · ${numberCaption(c)}</small></span></span>`:esc(r.card_id);}],['price','Price',r=>money(r.price),{num:true}],['ret_30d','30D',r=>retCell(r.ret_30d),{num:true}],['ret_1y','1Y',r=>retCell(r.ret_1y),{num:true}],['premium','vs peers',r=>times(r.premium),{num:true,title:'Price over the median of same-era, same-rarity cards'}],['sales_90d','Sales 90D',r=>r.sales_90d??'—',{num:true}],['days_since_sale','Last sale',r=>r.days_since_sale==null?'—':r.days_since_sale+' d',{num:true}]];
 const members=sortRows(d.members.map(r=>({...r,name:cardById(r.card_id)?.name||r.card_id})),sort);
 const carry=kind==='char'||kind==='artist'?premiumSources(d):'';
 view.innerHTML=marketHead()+back+`<section class="panel index-page"><div class="panel-head"><div><span class="index-kind">${esc(KIND_LABEL[kind]||kind)} · ${shortGrade(m.grade)}</span><h2>${esc(d.name)}</h2><p>Level ${x.level.toFixed(1)} (value-weighted, from 100 at its start) · as of ${date(x.as_of)}</p></div>${ranges}</div>${stats}<div class="panel-sub index-chart">${chart}</div>${premChart}${state.signals?`<div class="panel-sub">${signalForm(id,m.grade,[['move-30d','Index moves over 30 days','%',10],['move-7d','Index moves over 7 days','%',5],...(kind==='char'?[['rank','Demand rank moves','places',5]]:[])],'index')}</div>`:''}</section>${carry}
  <section class="panel"><div class="panel-head"><div><h2>Cards</h2><p>${members.length.toLocaleString()} cards · select one to open it.</p></div></div>${marketTable(members.slice(0,m.memberLimit),cols,sort,{id:'m-members',rowAttr:r=>`data-card="${esc(r.card_id)}"`})}${members.length>m.memberLimit?`<button class="button show-more" id="m-more-members">Show more</button>`:''}</section>`;
 wireMarket(view);
 view.querySelectorAll('[data-m-range]').forEach(b=>b.onclick=()=>{m.range=b.dataset.mRange;renderMarket();});
 wireTable(view,'m-members',sort,renderMarket,tr=>openCard(tr.dataset.card,m.grade));
 view.querySelectorAll('.entry-card').forEach(b=>b.onclick=()=>openCard(b.dataset.card,m.grade));
 wireSignalForms(view);if(!state.signals)loadSignals(true);
 const more=view.querySelector('#m-more-members');if(more)more.onclick=()=>{m.memberLimit+=100;renderMarket();};
}
// For a Pokémon (or artist): which eras, sets and rarity tiers carry its premium, and the cheapest way in.
function premiumSources(d){
 const priced=d.members.filter(r=>r.price>0),med=xs=>{const v=xs.filter(x=>x!=null).sort((a,b)=>a-b);return v.length?v[Math.floor(v.length/2)]:null;};
 if(priced.length<3)return '';
 const group=(label,keyOf,nameOf,limit)=>{const g=new Map();for(const r of priced){const k=keyOf(r);if(k==null)continue;(g.get(k)||g.set(k,[]).get(k)).push(r);}
  const rows=[...g].map(([k,list])=>({name:nameOf(k),n:list.length,prem:med(list.map(r=>r.premium)),price:med(list.map(r=>r.price)),value:list.reduce((n,r)=>n+r.price,0)})).filter(r=>r.prem!=null).sort((a,b)=>b.prem-a.prem).slice(0,limit);
  return rows.length?`<div class="carry-group"><h3>${label}</h3><table class="market-table compact"><thead><tr><th></th><th class="num">Cards</th><th class="num" title="Median price over same-era, same-rarity cards">vs peers</th><th class="num">Median</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td class="num">${r.n}</td><td class="num">${times(r.prem)}</td><td class="num">${money(r.price)}</td></tr>`).join('')}</tbody></table></div>`:'';};
 const era=group('By era',r=>cardById(r.card_id)?.series,k=>state.series.find(x=>x.id===k)?.name||k,9),set=group('By set',r=>cardById(r.card_id)?.setId,k=>state.sets.find(x=>x.id===k)?.name||k,8),tier=group('By rarity tier',r=>r.tier,k=>d.tiers?.[k]||k,8);
 const liquid=priced.filter(r=>r.sales_90d>0).sort((a,b)=>a.price-b.price)[0],cheapest=[...priced].sort((a,b)=>a.price-b.price)[0],entry=liquid||cheapest,c=entry&&cardById(entry.card_id);
 const entryHtml=c?`<button class="entry-card" data-card="${esc(entry.card_id)}"><img src="${c.image}"${c.imageAlt?` data-alt="${c.imageAlt}"`:''} alt="" loading="lazy"><span><small>Entry point${liquid?' · cheapest with sales in 90 days':' · cheapest priced'}</small><b>${esc(c.name)}</b><small>${esc(c.setName)} · ${numberCaption(c)}</small></span><strong>${money(entry.price)}</strong></button>`:'';
 return `<section class="panel"><div class="panel-head"><div><h2>Where the premium comes from</h2><p>Median premium over same-era, same-rarity cards by era, set and rarity tier, among ${priced.length} priced ${shortGrade(state.market.grade)} cards.</p></div></div>${entryHtml}<div class="carry-grid">${era}${tier}${set}</div></section>`;
}
// Starts a guide sweep (every set listing) and follows it; metrics are rebuilt when it ends.
async function startSweep(){
 try{
  const r=await send('/api/sweep','POST',{langs:[state.marketLang]});
  if(r.unavailable||r.warning){toast(r.warning||'Guide sweeps run only on the FutureSight server.');return;}
  if(!r.job){toast('Every set was swept in the last 20 hours.');return;}
  toast(r.joined?'A guide sweep is already running. Metrics rebuild when it ends.':'Guide sweep started: '+r.job.total+' listings. Metrics rebuild when it ends.');
 }catch(e){toast(e.message);}
}

const PAGES={
 market:{eyebrow:'MARKET <span>TERMINAL</span>',title:'Market',description:'Indices, Pokémon demand and set trends across every card.',crumb:'Market',name:'Market'},
 invest:{eyebrow:'MARKET <span>INVESTMENTS</span>',title:'Potential investments',description:'High-demand cards whose sales history suggests a closer look.',crumb:'Market',name:'Investments'},
 movers:{eyebrow:'MARKET <span>MOVERS</span>',title:'Top movers',description:'Which cards rose the most in sold price, by grade.',crumb:'Market',name:'Top movers'},
 dex:{eyebrow:'YOUR COLLECTION <span>DEX</span>',title:'Your Dex',description:'Every card you own, what it is worth today, and how it has done since you bought it.',crumb:'Your workspace',name:'Dex'},
 alerts:{eyebrow:'WATCHLIST <span>ALERTS</span>',title:'Listing alerts',description:'Get told when a watched card is listed at or under your buy limit.',crumb:'Your workspace',name:'Alerts'},
 settings:{eyebrow:'YOUR WORKSPACE <span>SETTINGS</span>',title:'Settings',description:'Make FutureSight comfortable for the way you collect.',crumb:'Your workspace',name:'Settings'},
};
function updateView(){
 const v=state.view,catalogView=v==='browse'||v==='watch';
 if(!catalogView&&state.focus)setFocus(false);
 for(const name of ['browse','market','movers','invest','watch','dex','alerts','settings']){const nav=$('#'+name+'-nav');nav.classList.toggle('active',v===name);nav.setAttribute('aria-current',v===name?'page':'false');}
 for(const s of ['#screener','#summary-grid','#workspace','#heading-tools'])$(s).hidden=!catalogView;
 for(const name of Object.keys(PAGES))$('#'+name+'-view').hidden=v!==name;
 const set=activeSet(),era=activeSeries(),partial=state.setId==='all'&&state.eras.length<state.series.length,name=set?.name||(state.setId==='all'?(partial?state.eras.map(marketSeriesLabel).join(' · ')+' sets':'All sets'):'All '+(era?.name||'')+' sets');
 const page=PAGES[v];
 if(page){
  $('#page-eyebrow').innerHTML=page.eyebrow;$('#page-title').textContent=page.title;$('#page-description').textContent=page.description;
  $('#breadcrumb-series').textContent=page.crumb;$('#breadcrumb-set').textContent=page.name;
  if(v==='dex'){loadDex().then(()=>{if(state.view==='dex')renderDex();});renderDex();}
  else if(v==='alerts'){if(!state.alerts.data)loadAlerts();renderAlerts();}
  else if(v==='market'){renderMarket();if(state.market.index)loadIndex(state.market.index);else loadMarket(state.market.tab);}
  else if(v==='movers'){renderMovers();loadMovers(state.movers.period);}
  else if(v==='invest'){renderInvest();loadInvest();}
  else if(v==='settings')renderSettings();
  $('#'+v+'-view').scrollTop=0;
  return;
 }
 $('#page-eyebrow').innerHTML='SET EXPLORER <span id="set-code"></span>';
 $('#page-title').textContent=v==='watch'?'Your watchlist':set?name:state.setId==='all'?(partial?'Explore '+state.eras.length+' eras':'Explore every set'):'Explore the '+(era?.name||'')+' era';
 $('#page-description').textContent=v==='watch'?'Your saved cards and buy targets, across every set.':'A closer look at your next pickup.';
 $('#breadcrumb-series').textContent=state.setId==='all'?'All series':era?.label||'Series';$('#breadcrumb-set').textContent=name;$('#sidebar-set').textContent=name;
 const catalogYears=state.sets.length?`${state.sets[0].release.slice(0,4)}–${state.sets.at(-1).release.slice(0,4)}`:'';
 $('#sidebar-year').textContent='English · '+(set?set.release.slice(0,4):state.setId==='all'?catalogYears:era?.years||'');$('#series-symbol').textContent=state.setId==='all'?'ALL':era?.id||'XY';
 $('#set-code').textContent=set?.id.toUpperCase()||(state.setId==='all'?'ALL SETS':(era?.id||'')+' ERA');
 $('#set-select').value=state.setId;
 $('#set-scope').textContent=v==='watch'?'Filtering your saved cards':`${state.sets.length} sets across ${state.series.length} eras · ${catalogYears}`;syncScreener();
 const sourceSet=set||state.sets.find(s=>s.id===cardById(state.selected)?.setId);if(sourceSet){$('#set-market-source').href=sourceSet.marketSource;$('#set-checklist-source').href=sourceSet.checklistSource;}
 stats();
 const scope=scopedCards(),present=new Set(scope.map(c=>c.category));if(scope.some(c=>c.name.endsWith('EX')))present.add('Pokémon EX');
 if(!['chase','all'].includes(state.category)&&!present.has(state.category))state.category='all';
 document.querySelectorAll('[data-category]').forEach(b=>{b.hidden=!['chase','all'].includes(b.dataset.category)&&!present.has(b.dataset.category);b.classList.toggle('active',b.dataset.category===state.category);b.setAttribute('aria-pressed',String(b.dataset.category===state.category));});
 state.limit=60;$('#card-list').scrollTop=0;$('#detail').scrollTop=0;const visible=filteredCards();if(!visible.some(c=>c.id===state.selected)){state.selected=visible[0]?.id||null;resetDetailVersion();}renderList();renderDetail();
 if(state.selected&&!state.full[state.selected]&&state.markets[state.selected]?.light)loadCard(state.selected);
}
function setOptions(){
 const opt=s=>`<option value="${s.id}">${esc(s.name)} · ${s.total} cards</option>`;
 const en=s=>s.lang!=='ja',ja=s=>s.lang==='ja';
 return `<option value="all">All sets in selected eras</option>`+state.series.map(e=>`<option value="era:${e.id}">All ${esc(e.name)} sets</option>`).join('')+state.series.map(e=>`<optgroup label="${esc(e.label)}">${state.sets.filter(s=>s.series===e.id&&en(s)).map(opt).join('')}</optgroup>`).join('')
  +state.series.map(e=>{const list=state.sets.filter(s=>s.series===e.id&&ja(s));return list.length?`<optgroup label="Japanese · ${esc(e.label)}">${list.map(opt).join('')}</optgroup>`:'';}).join('');
}
$('#search').oninput=e=>{state.query=e.target.value.toLowerCase().trim();state.limit=60;$('#card-list').scrollTop=0;renderList();};
$('#grade').onchange=e=>{state.grade=e.target.value;state.detailGrade=null;updateView();};
$('#sort').onchange=e=>{state.sort=e.target.value;renderList();};
document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{state.category=b.dataset.category;updateView();});
$('#browse-nav').onclick=()=>{state.view='browse';updateView();};$('#watch-nav').onclick=()=>{state.view='watch';state.setId='all';state.category='all';state.query='';$('#search').value='';resetFilters(true);updateView();};
$('#dex-nav').onclick=()=>{state.view='dex';updateView();};$('#market-nav').onclick=()=>{state.view='market';updateView();};$('#movers-nav').onclick=()=>{state.view='movers';updateView();};$('#invest-nav').onclick=()=>{state.view='invest';updateView();};$('#alerts-nav').onclick=()=>{state.view='alerts';updateView();};$('#settings-nav').onclick=()=>{state.view='settings';updateView();};
$('#set-select').onchange=e=>{const v=e.target.value;state.setId=v;if(v==='all')state.eras=state.series.map(x=>x.id);else if(v.startsWith('era:'))state.eras=[v.slice(4)];else{const set=state.sets.find(x=>x.id===v);if(set&&!state.eras.includes(set.series))state.eras=[...state.eras,set.series];}state.category='all';state.query='';$('#search').value='';updateView();};
wireScreener();
$('#show-more').onclick=()=>{state.limit+=24;renderList();};$('#refresh-set').onclick=refreshSet;
$('#method-button').onclick=$('#sources-button').onclick=()=>$('#method-dialog').showModal();$('#close-method').onclick=()=>$('#method-dialog').close();
for(const id of ['#method-dialog','#dex-dialog'])$(id).onclick=e=>{if(e.target===$(id)){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
async function init(){
 try{const [catalog,watch]=await Promise.all([request('/api/catalog'),request('/api/watchlist').catch(e=>{error(e.message);return {watchlist:[]};})]);
  state.sets=catalog.sets;state.series=catalog.series||[{id:'XY',name:'XY',label:'XY Series',years:'2014–2016'}];state.marketSeries=state.series.map(series=>series.id);state.eras=state.series.map(series=>series.id);state.cards=catalog.cards;state.appearance=applyAppearance(state.appearance,false);
  $('#set-select').innerHTML=setOptions();$('#set-select').value=state.setId;
  state.markets=Object.fromEntries(Object.entries(catalog.markets).map(([id,m])=>[id,expandMarket(m)]));state.watch=watch.watchlist;
  const checked=Object.values(catalog.markets).map(m=>m?.research?.checkedAt||m?.observedAt).filter(Boolean).sort().at(-1);
  updateView();const checkedText=checked?'Sales checked '+new Date(checked).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Dated source snapshots';$('#snapshot-label').textContent=checkedText;$('#status-data').textContent=checkedText+' · '+state.cards.filter(c=>c.eligible).length.toLocaleString()+' rare cards';
  loadScores();loadTicker();resumeUpdate();
  loadDex().then(()=>{stats();renderList();if(state.view==='dex')renderDex();});
  loadAlerts(true);setInterval(()=>{if(document.visibilityState!=='hidden')loadAlerts(true);},60000);
 }catch(e){error(e.message);$('#card-list').innerHTML='<div class="empty-state"><strong>Couldn’t load the set.</strong><p>Keep this page open and try again.</p><button class="button" id="retry-load">Try again</button></div>';$('#retry-load').onclick=init;}
}
document.addEventListener?.('keydown',e=>{
 if(!state.focus||document.querySelector('dialog[open]'))return;
 if(e.key==='Escape'){e.preventDefault();setFocus(false);return;}
 if(/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName||''))return;
 if(e.key==='ArrowLeft'||e.key==='ArrowRight'){const n=focusNeighbors()[e.key==='ArrowLeft'?'prev':'next'];if(n){e.preventDefault();select(n.id);}}
});
if($('#detail-backdrop'))$('#detail-backdrop').onclick=()=>setFocus(false);
init();

// Build label beside the logo: "Beta · v1.0.0" or "Local test · v1.1.0-dev", so copies are never confused.
async function loadBuild(){try{const r=await fetch('/api/version',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;const b=await r.json(),el=$('#build-badge');if(!el||!b?.label)return;el.textContent=b.label;el.className='build-badge '+(b.channel||'local');el.title=b.channel==='beta'?'This is the build beta testers use.':b.channel==='local-test'?'Local test copy: changes here do not reach beta testers.':'Local copy';el.hidden=false;if(b.channel!=='beta'&&typeof document!=='undefined')document.title=document.title.replace(/^(\[[^\]]*\] )?/,b.channel==='local-test'?'[Local test] ':'');}catch{}}
loadBuild();

// Signed-in account: name in the navigation and a sign-out button.
(async()=>{
 const box=$('#account');if(!box)return;
 try{const r=await fetch('/api/auth/me',{credentials:'same-origin'});if(r.status===401){location.replace('/login');return;}if(!r.ok)return;const {user}=await r.json();$('#account-name').textContent=user.username;box.hidden=false;}catch{return;}
 $('#sign-out').onclick=async()=>{try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});}finally{location.replace('/login');}};
})();

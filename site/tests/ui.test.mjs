import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {cards,sets,series} from '../data/catalog.mjs';
import {snapshots} from '../data/market.mjs';
import {analyze,gradeNames,trendProjection} from '../lib/analysis.mjs';
import {summarize,portfolioSeries,priceHistory,entryValue,MIN_PURCHASE_DATE} from '../lib/portfolio.mjs';
import {topMovers} from '../lib/movers.mjs';
import {potentialInvestments} from '../lib/invest.mjs';
import {investmentScores} from '../lib/score.mjs';
import {normalizeCosts,costSummary,netReturn,maxBuyPrice,DEFAULT_COSTS} from '../lib/investment-costs.mjs';
import {investmentTable,investmentView} from '../lib/investment.mjs';
const investData=potentialInvestments(cards.map(c=>[c,snapshots[c.id]]));
const moverData=topMovers(cards.map(c=>[c,snapshots[c.id]]),'week');
const scoreData=investmentScores(cards.map(c=>[c,snapshots[c.id]]));

// Exercise the UI's controls and rendered output without a browser runtime.
function workspace(){
 const elements=new Map();
 class Element{
  constructor(){this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.dataset={};this.classList={toggle(){}};}
  set innerHTML(html){this.html=html;for(const m of html.matchAll(/id="([^"]+)"/g))if(!elements.has('#'+m[1]))elements.set('#'+m[1],new Element());}
  get innerHTML(){return this.html||'';}
  setAttribute(){} querySelectorAll(){return [];} querySelector(){return null;} addEventListener(){} showModal(){} close(){}
 }
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const m of html.matchAll(/id="([^"]+)"/g))elements.set('#'+m[1],new Element());
 const categories=[...html.matchAll(/data-category="([^"]+)"/g)].map(m=>{const e=new Element();e.dataset.category=m[1];return e;});
 const document={querySelector:s=>elements.get(s)||null,querySelectorAll:s=>s==='[data-category]'?categories:[]};
 const responses={'/api/catalog':{cards,sets,series,markets:snapshots,local:true},'/api/watchlist':{watchlist:[]},'/api/movers':moverData,'/api/investments':investData,'/api/scores':{grades:scoreData.grades,scores:scoreData.scores},'/api/market':{market:null,score:null},'/api/collection':{collection:[],markets:{}},'/api/alerts':{alerts:[],unseen:0,settings:{enabled:false,intervalMinutes:30,ebay:{configured:false},notify:{ntfy:'',discord:''}},searches:[],live:false}};
 const calls=[];
 const context=vm.createContext({document,normalizeCosts,costSummary,netReturn,maxBuyPrice,DEFAULT_COSTS,analyze,computeAnalysis:analyze,gradeNames,trendProjection,summarize,portfolioSeries,priceHistory,entryValue,MIN_PURCHASE_DATE,Intl,Date,AbortController,Object,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,calls,fetch:async url=>{const path=url.split('?')[0];calls.push(url);let r=responses[path];if(typeof r==='function')r=r(url);if(r?.__response)return r.__response;const headers=new Headers({'Content-Type':'application/json'});if(r&&r.__status)return {ok:false,status:r.__status,headers,json:async()=>r.body};return {ok:true,status:200,headers,json:async()=>r||{}};}});
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'').replace(/init\(\);\s*$/,'');
 vm.runInContext(source,context);
 return {context,responses,calls,e:s=>elements.get(s),run:s=>vm.runInContext(s,context)};
}
test('Tunnel redirects and non-JSON failures are explained instead of becoming empty data',async()=>{
 const ui=workspace();
 ui.responses['/api/probe']={__response:{type:'opaqueredirect'}};
 await assert.rejects(ui.run("request('/api/probe')"),/connection to FutureSight was interrupted/);
 ui.responses['/api/probe']={__response:new Response('Unauthorized',{status:401})};
 await assert.rejects(ui.run("request('/api/probe')"),/sign-in has ended/);
 ui.responses['/api/probe']={__response:new Response('Bad Gateway',{status:502})};
 await assert.rejects(ui.run("request('/api/probe')"),/HTTP 502/);
 ui.responses['/api/probe']={scores:{test:[1,2,3]}};
 assert.deepEqual(await ui.run("request('/api/probe')"),ui.responses['/api/probe']);
});

test('Wizards era and vintage card coverage render in Browse',async()=>{
 const ui=workspace();await ui.run('init()');assert.match(ui.e('#set-select').innerHTML,/Wizards of the Coast/);assert.match(ui.e('#set-select').innerHTML,/Aquapolis/);
 ui.e('#set-select').onchange({target:{value:'era:WOTC'}});assert.equal(ui.run('filteredCards().filter(c=>!c.japanese).length'),741);assert.match(ui.e('#page-title').textContent,/Wizards of the Coast/);
 ui.run("state.selected='base1-4';state.grade='psa9';renderDetail()");const detail=ui.e('#detail').innerHTML;assert.match(detail,/Standard \/ unlimited/);assert.match(detail,/not complete eBay sales history/);
});
test('Set picker, all-set search, and Radiant Collection render correct cards',async()=>{
 const ui=workspace();await ui.run('init()');
 assert.match(ui.e('#set-select').innerHTML,/Evolutions/);assert.equal(ui.e('#page-title').textContent,'Explore every set');
 // The first view is every set and every rare, not one set.
 assert.equal(ui.run('state.setId'),'all');assert.equal(ui.run('state.category'),'all');assert.equal(ui.e('#set-select').value,'all');
 assert.equal(ui.run('filteredCards().length'),ui.run('state.cards.filter(c=>c.eligible).length'));
 ui.e('#set-select').onchange({target:{value:'g1'}});assert.equal(ui.e('#page-title').textContent,'Generations');assert.match(ui.e('#set-count').innerHTML,/37/);
 ui.e('#grade').onchange({target:{value:'raw'}});ui.e('#search').oninput({target:{value:'RC30'}});assert.match(ui.e('#card-list').innerHTML,/Gardevoir/);assert.match(ui.e('#card-list').innerHTML,/RC30\/RC32/);assert.doesNotMatch(ui.e('#card-list').innerHTML,/\/160/);
 ui.e('#set-select').onchange({target:{value:'all'}});ui.run("state.category='all';updateView();");ui.e('#search').oninput({target:{value:'Flashfire'}});
 assert.equal(ui.run('filteredCards().length'),46);assert.match(ui.e('#set-count').innerHTML,new RegExp(String(cards.filter(c=>c.eligible).length)));
 ui.e('#search').oninput({target:{value:''}});ui.e('#set-select').onchange({target:{value:'era:EX'}});assert.match(ui.e('#set-count').innerHTML,new RegExp('^'+cards.filter(c=>c.eligible&&c.series==='EX').length+' '));assert.equal(ui.e('#page-title').textContent,'Explore the EX era');
 // English only: the original 687 EX-era rares.
 ui.run("toggleLang('ja')");assert.match(ui.e('#set-count').innerHTML,/^687 /);ui.run("toggleLang('ja')");
 ui.e('#set-select').onchange({target:{value:'col1'}});ui.e('#search').oninput({target:{value:'SL10'}});assert.match(ui.e('#card-list').innerHTML,/Rayquaza/);assert.match(ui.e('#card-list').innerHTML,/#SL10 · Shiny rare/);
 ui.e('#search').oninput({target:{value:''}});ui.e('#set-select').onchange({target:{value:'era:BW'}});assert.match(ui.e('#set-count').innerHTML,new RegExp('^'+cards.filter(c=>c.eligible&&c.series==='BW').length+' '));assert.equal(ui.e('#page-title').textContent,'Explore the Black & White era');
 ui.e('#set-select').onchange({target:{value:'bw11'}});ui.e('#search').oninput({target:{value:'RC24'}});assert.match(ui.e('#card-list').innerHTML,/Mew EX/);assert.match(ui.e('#card-list').innerHTML,/RC24\/RC25/);
 ui.e('#set-select').onchange({target:{value:'era:SM'}});assert.match(ui.e('#set-count').innerHTML,new RegExp('^'+cards.filter(c=>c.eligible&&c.series==='SM').length+' '));assert.equal(ui.run("filteredCards().filter(c=>!c.japanese).length")+0>0,true);ui.run("toggleLang('ja')");assert.match(ui.e('#set-count').innerHTML,/^1380 /);ui.run("toggleLang('ja')");assert.equal(ui.e('#page-title').textContent,'Explore the Sun & Moon era');
 ui.e('#set-select').onchange({target:{value:'sm115'}});ui.e('#search').oninput({target:{value:'SV49'}});assert.match(ui.e('#card-list').innerHTML,/Charizard GX/);assert.match(ui.e('#card-list').innerHTML,/SV49\/SV94/);
 ui.e('#set-select').onchange({target:{value:'dc1'}});ui.e('#search').oninput({target:{value:'Groudon'}});assert.match(ui.e('#card-list').innerHTML,/Team Magma/);assert.match(ui.e('#card-list').innerHTML,/15\/34/);
});
test('Watchlist opens across sets and keeps saved limits with their own card',async()=>{
 const ui=workspace();await ui.run('init()');
 ui.run("state.watch=[{card_id:'xy1-55',grade:'psa9',target:25},{card_id:'xy5-55',grade:'psa9',target:150}]");
 ui.e('#watch-nav').onclick();assert.equal(ui.run('state.setId'),'all');assert.equal(ui.run('filteredCards().length'),2);
 assert.match(ui.e('#card-list').innerHTML,/\$25\.00/);assert.match(ui.e('#card-list').innerHTML,/\$150/);
 ui.e('#set-select').onchange({target:{value:'xy1'}});assert.equal(ui.run('filteredCards()[0].id'),'xy1-55');assert.match(ui.e('#detail').innerHTML,/XY Base Set/);
 ui.e('#set-select').onchange({target:{value:'xy12'}});assert.equal(ui.run('filteredCards().length'),0);assert.match(ui.e('#detail').innerHTML,/Select a card/);
});

test('Dex and Alerts views open without the set browser',async()=>{
 const ui=workspace();await ui.run('init()');
 ui.e('#dex-nav').onclick();assert.equal(ui.e('#workspace').hidden,true);assert.equal(ui.e('#dex-view').hidden,false);assert.equal(ui.e('#page-title').textContent,'Your Dex');
 ui.run("state.dex.loaded=true;state.dex.entries=[{id:1,card_id:'xy5-151',grade:'psa9',quantity:1,purchase_price:1000,purchase_date:'2025-01-15',created_at:'2025-01-15T00:00:00Z'}];renderDex();");
 assert.match(ui.e('#dex-view').innerHTML,/Primal Groudon EX/);assert.match(ui.e('#dex-view').innerHTML,/Value vs\. cost/);
 ui.e('#alerts-nav').onclick();assert.equal(ui.e('#alerts-view').hidden,false);assert.equal(ui.e('#dex-view').hidden,true);await ui.run('loadAlerts()');assert.match(ui.e('#alerts-view').innerHTML,/Alert settings/);
 ui.e('#browse-nav').onclick();assert.equal(ui.e('#workspace').hidden,false);
});
test('Dex date entry uses bounded month, day, and year controls',async()=>{
 const ui=workspace();await ui.run('init()');ui.run('openDexDialog({})');const form=ui.e('#dex-form').innerHTML;
 assert.match(form,/id="dex-date-month"/);assert.match(form,/id="dex-date-day"/);assert.match(form,/id="dex-date-year"/);assert.match(form,/>2010</);assert.doesNotMatch(form,/value="2009"/);assert.match(form,/Today/);assert.match(form,/2010 or later/);
});
test('Card detail places labeled 1Y, 2Y, and 3Y trend estimates beside reported sales',async()=>{
 const ui=workspace();await ui.run('init()');ui.run("state.selected='xy5-147';state.grade='psa9';renderDetail()");const detail=ui.e('#detail').innerHTML;
 assert.match(detail,/Simple trend projection/);assert.match(detail,/illustrative/);assert.match(detail,/future accuracy is unverified/);assert.match(detail,/not investment advice/);
});
test('Top movers shows PSA 10, PSA 9 and raw lists and opens a card in its grade',async()=>{
 const ui=workspace();await ui.run('init()');
 ui.e('#movers-nav').onclick();assert.equal(ui.e('#movers-view').hidden,false);assert.equal(ui.e('#workspace').hidden,true);assert.equal(ui.e('#page-title').textContent,'Top movers');
 await ui.run('loadMovers("week")');const html=ui.e('#movers-view').innerHTML;
 assert.match(html,/PSA 10/);assert.match(html,/PSA 9/);assert.match(html,/Raw NM/);assert.match(html,/\$25 or more/);
 const first=moverData.grades.psa9.movers[0];assert.match(html,new RegExp('data-mover="'+first.card_id+'" data-grade="psa9"'));
 ui.run(`openCard('${first.card_id}','psa9')`);assert.equal(ui.run('state.view'),'browse');assert.equal(ui.run('state.grade'),'psa9');assert.equal(ui.run('state.selected'),first.card_id);
 ui.e('#movers-nav').onclick();ui.run("state.movers.period='month';renderMovers()");assert.match(ui.e('#movers-view').innerHTML,/Finding this month/);
});
test('Investments lists picks with their signals and character demand, by grade',async()=>{
 const ui=workspace();await ui.run('init()');
 ui.e('#invest-nav').onclick();assert.equal(ui.e('#invest-view').hidden,false);assert.equal(ui.e('#movers-view').hidden,true);assert.equal(ui.e('#page-title').textContent,'Potential investments');
 await ui.run('loadInvest()');let html=ui.e('#invest-view').innerHTML;
 const first=investData.grades.psa10.picks[0];
 assert.match(html,new RegExp('data-invest="'+first.card_id+'"'));assert.match(html,/Steady uptrend|Recovering from highs|Cheap vs\. similar cards/);
 assert.match(html,new RegExp(first.demand.character+' demand'));assert.match(html,/Not investment advice/);assert.match(html,/Why it's listed/);assert.match(html,/Not met/);assert.match(html,/✓/);
 ui.run("state.invest.grade='raw';renderInvest()");html=ui.e('#invest-view').innerHTML;
 assert.match(html,new RegExp('data-invest="'+investData.grades.raw.picks[0].card_id+'" data-grade="raw"'));
 ui.run(`openCard('${first.card_id}','psa10')`);assert.equal(ui.run('state.view'),'browse');assert.equal(ui.run('state.grade'),'psa10');
});
test('Scores that cannot load say why: an old server gets a restart message, other failures retry',async()=>{
 const ui=workspace();ui.responses['/api/scores']={__status:404,body:{error:'Not found.'}};await ui.run('init()');await ui.run('loadScores(false)');
 assert.match(ui.e('#error-banner').textContent,/older server code/);assert.equal(ui.e('#error-banner').hidden,false);
 assert.match(ui.e('#detail').innerHTML,/Close the FutureSight window and start it again/);assert.match(ui.e('#detail').innerHTML,/id="score-retry"/);
 assert.doesNotMatch(ui.e('#detail').innerHTML,/Scores could not be loaded\.</);
 // After the server is restarted, Try again loads the scores and clears the banner.
 ui.responses['/api/scores']={grades:scoreData.grades,scores:scoreData.scores};await ui.run('loadScores()');
 assert.equal(ui.e('#error-banner').hidden,true);assert.equal(ui.run('state.scoreError'),null);assert.ok(ui.run('state.scores'));
 const other=workspace();other.responses['/api/scores']={__status:500,body:{error:'Disk is busy.'}};await other.run('init()');await other.run('loadScores(false)');
 assert.doesNotMatch(other.e('#error-banner').textContent,/older server/,'a plain failure does not claim the server is old');assert.match(other.e('#detail').innerHTML,/Disk is busy/);
});
test('Top movers and Investments reload after prices change instead of showing a stuck list',async()=>{
 const ui=workspace();await ui.run('init()');
 const count=p=>ui.calls.filter(u=>u.startsWith(p)&&(p!=='/api/movers'||u.includes('series='))).length,settle=()=>new Promise(r=>setImmediate(r));
 ui.e('#movers-nav').onclick();await settle();const base=count('/api/movers');assert.equal(base,1,'opening the tab loads the list once');
 assert.match(ui.e('#movers-view').innerHTML,/data-recalc/);assert.match(ui.e('#movers-view').innerHTML,/data-update-sales/);
 await ui.run('loadMovers("week")');assert.equal(count('/api/movers'),base,'a fresh list is reused');
 ui.run('Object.values(state.movers.data).forEach(d=>d._at-=60000)');await ui.run('loadMovers("week")');assert.equal(count('/api/movers'),base+1,'an old list is asked for again');
 // The server's newer answer replaces the list, and a failed refresh keeps the old one.
 ui.responses['/api/movers']={...moverData,checkedAt:'2030-01-02T12:00:00.000Z'};
 ui.run('Object.values(state.movers.data).forEach(d=>d._at-=60000)');await ui.run('loadMovers("week")');assert.match(ui.e('#movers-view').innerHTML,/Jan 2, 2030/);
 ui.responses['/api/movers']={__status:500,body:{error:'boom'}};await ui.run('loadMovers("week",true)');assert.match(ui.e('#movers-view').innerHTML,/Jan 2, 2030/);assert.doesNotMatch(ui.e('#movers-view').innerHTML,/couldn't be loaded/);
 // Recalculate drops every cached list and loads the movers, scores and ticker again.
 ui.responses['/api/movers']={...moverData,checkedAt:'2030-03-04T12:00:00.000Z'};const before=ui.calls.length;
 await ui.run('recalculate()');const after=ui.calls.slice(before);
 assert.ok(after.some(u=>u.startsWith('/api/movers')));assert.ok(after.some(u=>u.startsWith('/api/scores')));assert.match(ui.e('#movers-view').innerHTML,/Mar 4, 2030/);assert.match(ui.e('#toast').textContent,/Recalculated/);
 ui.e('#invest-nav').onclick();await settle();const n=count('/api/investments');assert.equal(n,1);
 ui.responses['/api/investments']={...investData,checkedAt:'2030-05-06T12:00:00.000Z'};await ui.run('recalculate()');
 assert.equal(count('/api/investments'),n+1);assert.match(ui.e('#invest-view').innerHTML,/May 6, 2030/);assert.match(ui.e('#invest-view').innerHTML,/data-recalc/);
 // Saving a refreshed card also discards the cached lists, so the next visit sees its new prices.
 await ui.run('loadMovers("week")');assert.ok(ui.run('Object.keys(state.movers.data).length')>0);ui.run('dropMarketCaches()');
 assert.equal(ui.run('Object.keys(state.movers.data).length+Object.keys(state.invest.data).length'),0);
});
test('Update sales fetches in batches from the Movers and Investments tabs and then rebuilds the list',async()=>{
 const ui=workspace();await ui.run('init()');
 const posted=[];ui.responses['/api/research']=url=>{const ids=new URL('http://x'+url).searchParams.get('ids').split(',');posted.push(ids);return {count:ids.length,total:ids.length,done:true,markets:{},failures:[]};};
 ui.e('#movers-nav').onclick();await ui.run('loadMovers("week")');await new Promise(r=>setImmediate(r));const m=ui.calls.filter(u=>u.startsWith('/api/movers')).length;
 await ui.run('updateMarketSales()');
 // Cards read within the last FRESH_HOURS are skipped (bundled captures can be that recent).
 const n=ui.run("state.cards.filter(c=>c.source&&c.eligible&&langOf(c)==='en'&&Date.now()-checkedAt(c)>=FRESH_HOURS*3600000).length");
 assert.equal(posted.length,Math.ceil(n/4));assert.ok(posted.every(b=>b.length>=1&&b.length<=4));assert.equal(new Set(posted.flat()).size,n,'each card once');
 assert.ok(ui.calls.filter(u=>u.startsWith('/api/movers')).length>m,'the list is rebuilt once the sales are in');
});
test('Update sales resumes: recently read cards are skipped, unread cards go first, failures are retried once',async()=>{
 const ui=workspace();await ui.run('init()');ui.context.setTimeout=f=>{f();return 0;};
 const scope=ui.run("state.cards.filter(c=>c.source&&c.eligible&&c.setId==='xy5').map(c=>c.id)");assert.ok(scope.length>8);
 ui.run(`state.markets['${scope[0]}']={...(state.markets['${scope[0]}']||{}),research:{status:'full',checkedAt:new Date().toISOString()}}`);
 ui.run(`state.markets['${scope[1]}']={...(state.markets['${scope[1]}']||{}),research:{status:'full',checkedAt:'2020-01-01T00:00:00.000Z'}}`);
 const posted=[];let failed=false;
 ui.responses['/api/research']=url=>{const ids=new URL('http://x'+url).searchParams.get('ids').split(',');posted.push(ids);const failures=failed?[]:[{card_id:ids[0],message:'The price source is unavailable (503).'}];failed=true;return {count:ids.length-failures.length,markets:{},failures,done:true};};
 await ui.run("refreshSales(['xy5'],['en'])");
 const all=posted.flat();
 assert.ok(!all.includes(scope[0]),'a card read in the last few hours is skipped');
 assert.equal(all.length,scope.length,'every other card once, plus one retry');
 assert.deepEqual(posted.at(-1),[posted[0][0]],'the failed card is tried again at the end');
 // First pass order: never-read cards, then the oldest reads first.
 const order=posted.slice(0,-1).flat(),readAt=id=>ui.run(`Date.parse(state.markets['${id}']?.research?.checkedAt||'')||0`),at=order.indexOf(scope[1]);
 assert.ok(order.slice(0,at).every(id=>readAt(id)===0),'unread cards come before cards read earlier');
 assert.ok(order.slice(at+1).every(id=>readAt(id)===0||readAt(id)>=readAt(scope[1]))&&order.slice(at+1).some(id=>readAt(id)>0)===order.some(id=>id!==scope[1]&&readAt(id)>0),'then the oldest reads first');
 assert.match(ui.e('#toast').textContent,/1 already checked/);assert.doesNotMatch(ui.e('#toast').textContent,/could not be read/);
});
test('Settings offers persistent light, dark, and soft-contrast appearances',async()=>{
 const ui=workspace();await ui.run('init()');ui.e('#settings-nav').onclick();assert.equal(ui.e('#settings-view').hidden,false);assert.equal(ui.e('#page-title').textContent,'Settings');
 const html=ui.e('#settings-view').innerHTML;assert.match(html,/Terminal/);assert.match(html,/Light/);assert.match(html,/Soft contrast/);assert.match(html,/saved in this browser/);
});

test('Advanced filters screen by era, price, activity and investment score, and the old $250–$350 toggle is gone',async()=>{
 const ui=workspace();await ui.run('init()');await ui.run('loadScores()');
 assert.doesNotMatch(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),/budget|250–\$350/);
 ui.e('#set-select').onchange({target:{value:'all'}});ui.run("state.category='all';updateView();");
 const total=ui.run('filteredCards().length');assert.equal(total,cards.filter(c=>c.eligible).length);
 // Price range for the selected grade
 ui.run("state.filters.min=100;state.filters.max=500;applyFilters();");
 const priced=ui.run("filteredCards().map(c=>analyze(state.markets[c.id],state.grade).current)");
 assert.ok(priced.length>0&&priced.every(p=>p>=100&&p<=500));assert.match(ui.e('#active-filters').innerHTML,/\$100–\$500 · PSA 9/);
 // Activity score
 ui.run("state.filters.activity=60;applyFilters();");
 assert.ok(ui.run("filteredCards().every(c=>analyze(state.markets[c.id],state.grade).score>=60)"));
 // Investment score, shown in each row
 ui.run("state.filters={min:null,max:null,activity:0,invest:70};applyFilters();");
 const ids=ui.run('filteredCards().map(c=>c.id)');assert.ok(ids.length>20);
 assert.ok(ids.every(id=>scoreData.scores[id][1]>=70));assert.match(ui.e('#card-list').innerHTML,/score-pill (good|strong)/);assert.match(ui.e('#active-filters').innerHTML,/Inv\. score 70\+/);
 // Sorting by investment score
 ui.e('#sort').onchange({target:{value:'invest'}});const sorted=ui.run('filteredCards().map(c=>scoreOf(c.id))');assert.deepEqual(sorted,[...sorted].sort((a,b)=>b-a));
 // Era chips: removing eras narrows the screen, and the last era can't be removed
 ui.run("for(const e of [...state.eras])if(e!=='XY')toggleEra(e);");assert.equal(ui.run('state.setId'),'era:XY');
 assert.ok(ui.run("filteredCards().every(c=>c.series==='XY')"));ui.run("toggleEra('XY')");assert.equal(ui.run('state.setId'),'era:XY');
 ui.run("toggleEra('SM')");assert.equal(ui.run('state.setId'),'all');assert.equal(ui.run('state.eras.join()'),'XY,SM');
 assert.ok(ui.run("filteredCards().every(c=>['XY','SM'].includes(c.series))"));assert.equal(ui.e('#page-title').textContent,'Explore 2 eras');
 // Clearing restores everything
 ui.e('#reset-filters').onclick();assert.equal(ui.run('filterCount()'),0);assert.equal(ui.run('state.eras.length'),ui.run('state.series.length'));
});
test('Research rank screens and sorts like the other scores, per grade, and hides when rolled back',async()=>{
 const NOW=Date.parse('2026-10-06T20:00:00Z'),release=Object.fromEntries(sets.map(s=>[s.id,s.release]));
 const t=investmentTable(cards.filter(c=>(c.lang||'en')==='en').map(c=>[c,snapshots[c.id]]),{now:NOW,release});
 const ui=workspace();ui.responses['/api/scores']={grades:scoreData.grades,scores:scoreData.scores,research:{modelVersion:t.modelVersion,mode:'shadow',languages:['en'],ranks:t.ranks,status:t.status,gate:t.gate}};
 await ui.run('init()');await ui.run('loadScores()');
 ui.e('#set-select').onchange({target:{value:'all'}});ui.run("state.category='all';updateView();");
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="research-min"/);assert.match(html,/<option value="research"/);assert.match(html,/data-preset="research"/);
 // The slider keeps cards whose rank for the selected grade meets the threshold.
 ui.e('#research-min').oninput({target:{value:'70'}});
 assert.equal(ui.run('state.filters.research'),70);assert.equal(ui.run('filterCount()'),1);
 const psa9=ui.run('filteredCards().map(c=>c.id)');assert.ok(psa9.length>50);
 assert.ok(psa9.every(id=>t.ranks[id][1]>=70));assert.equal(ui.e('#research-out').textContent,'70+');
 assert.match(ui.e('#active-filters').innerHTML,/Research 70\+/);
 // The score column shows the research rank while the filter is on.
 assert.equal(ui.e('#score-head').textContent,'RES');assert.match(ui.e('#card-list').innerHTML,/score-pill research/);
 // Another grade gives that grade's ranks.
 ui.run("state.grade='psa10';applyFilters();");const psa10=ui.run('filteredCards().map(c=>c.id)');
 assert.ok(psa10.every(id=>t.ranks[id][0]>=70));assert.notDeepEqual(psa10,psa9);
 // Sorting: highest rank first, unranked cards last.
 ui.run("state.filters.research=0;applyFilters();");assert.equal(ui.e('#score-head').textContent,'INV');
 ui.e('#sort').onchange({target:{value:'research'}});assert.equal(ui.e('#score-head').textContent,'RES');
 const ranks=ui.run("filteredCards().map(c=>researchRankOf(c.id)??-1)");assert.deepEqual(ranks,[...ranks].sort((a,b)=>b-a));assert.ok(ranks[0]>90&&ranks.at(-1)===-1);
 // The quick screen sets the same filter.
 assert.equal(ui.run('JSON.stringify(PRESETS.research)'),'{"research":70}');
 // Japanese-only scope: no Japanese ranks yet, so the empty list says why.
 ui.run("state.filters.research=60;setLangMode('ja');");assert.equal(ui.run('filteredCards().length'),0);assert.match(ui.e('#card-list').innerHTML,/Research ranks cover English cards only for now/);
 ui.run("setLangMode('all');");
 // A Japanese card's panel says why it has no research rank instead of loading forever.
 assert.match(ui.run("researchBox(state.cards.find(c=>c.japanese))"),/Not shown for Japanese cards/);
 assert.doesNotMatch(ui.run("researchBox(state.cards.find(c=>c.id==='xy5-151'))"),/Not shown/);
 // Clear filters resets it.
 ui.e('#reset-filters').onclick();assert.equal(ui.run('state.filters.research'),0);assert.equal(ui.run('filterCount()'),0);
 // Legacy mode (rollback): slider, sort option and preset are hidden and an active value is dropped.
 ui.run("state.filters.research=80;state.sort='research';state.research={mode:'legacy'};syncScreener();renderList();");
 assert.equal(ui.e('#research-block').hidden,true);assert.equal(ui.e('#sort-research').hidden,true);assert.equal(ui.e('#preset-research').hidden,true);
 assert.equal(ui.run('state.filters.research'),0);assert.equal(ui.run('state.sort'),'featured');assert.equal(ui.e('#score-head').textContent,'INV');
});
test('Card detail shows the investment score with its breakdown',async()=>{
 const ui=workspace();await ui.run('init()');await ui.run('loadScores()');
 const id=Object.entries(scoreData.scores).find(([,v])=>v[1]!=null)[0];
 ui.run(`state.scoreDetail[${JSON.stringify(id)}]=${JSON.stringify(Object.fromEntries(Object.entries(scoreData.full.get(id))))};state.selected=${JSON.stringify(id)};renderDetail();`);
 const html=ui.e('#detail').innerHTML;assert.match(html,/Investment score/);assert.match(html,new RegExp('<strong>'+scoreData.scores[id][1]+'</strong>'));
 for(const label of ['Demand','Momentum','Value','Liquidity','Stability'])assert.match(html,new RegExp(label));
 assert.match(html,/not a forecast or investment advice/);assert.match(html,/Activity score/);
 const unscored=cards.find(c=>c.eligible&&c.setId==='xy5'&&scoreData.scores[c.id]?.[1]==null).id;ui.run(`state.selected='${unscored}';renderDetail();`);assert.match(ui.e('#detail').innerHTML,/Investment score[\s\S]*—/);
});

test('Card details expand into a reading view with grade tabs, previous/next and close',async()=>{
 const ui=workspace();await ui.run('init()');ui.run("state.selected='xy5-147';state.grade='psa9';renderDetail()");
 assert.match(ui.e('#detail').innerHTML,/id="detail-focus"/);assert.doesNotMatch(ui.e('#detail').innerHTML,/focus-bar/);
 ui.e('#detail-focus').onclick();
 const html=ui.e('#detail').innerHTML;assert.equal(ui.run('state.focus'),true);assert.equal(ui.e('#detail-backdrop').hidden,false);
 assert.match(html,/class="focus-bar"/);assert.match(html,/class="focus-grid"/);assert.match(html,/Wailord EX/);
 for(const part of ['Investment score','Reported sales','Recent sales','Sales coverage','Five-year scenarios'])assert.ok(html.includes(part),part);
 assert.match(html,/data-focus-grade="psa10"/);assert.match(html,/sale-chart wide/);
 const list=ui.run('filteredCards().map(c=>c.id)'),i=list.indexOf('xy5-147');assert.match(html,new RegExp(`${i+1} of ${list.length}`));
 // Up to 24 sales in the reading view instead of 8.
 const rows=(html.match(/class="sale-row"/g)||[]).length,all=ui.run("analyze(state.markets['xy5-147'],'psa9').all.length");assert.equal(rows,Math.min(24,all));
 ui.e('#focus-next').onclick();await new Promise(r=>setImmediate(r));assert.equal(ui.run('state.selected'),list[i+1]);assert.equal(ui.run('state.focus'),true,'stays expanded while stepping');
 ui.run("state.view='dex';updateView()");assert.equal(ui.run('state.focus'),false,'leaving Browse closes the reading view');
 ui.run("state.view='browse';updateView();setFocus(true);setFocus(false)");assert.equal(ui.e('#detail-backdrop').hidden,true);assert.doesNotMatch(ui.e('#detail').innerHTML,/focus-bar/);
});
test('Wizards and every modern era use the same expanded information view',async()=>{
 const ui=workspace();await ui.run('init()');
 for(const [id,name] of [['base1-4','Charizard'],['swsh7-215','Umbreon VMAX'],['sv1-1','Pineco'],['me1-1','Bulbasaur'],['me55c-4','Charizard']]){
  ui.run(`state.selected=${JSON.stringify(id)};renderDetail();setFocus(true)`);
  const html=ui.e('#detail').innerHTML;
  assert.match(html,/class="focus-grid"/);assert.match(html,new RegExp(name));
  for(const part of ['Investment score','Reported sales','Sales coverage','Five-year scenarios'])assert.ok(html.includes(part),part);
  ui.run('setFocus(false)');
 }
});

test('Stylesheet avoids backdrop-filter, which made scrolling over overlays run at about 20 fps',()=>{
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/backdrop-filter/,'blur behind a scrolling layer is re-computed every frame');
});

test('FutureSight branding and opening animation are wired safely',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),intro=readFileSync(new URL('../public/intro.js',import.meta.url),'utf8'),css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 assert.match(html,/<title>FutureSight/);assert.doesNotMatch(html,/Primal Watch/);
 assert.match(html,/<symbol id="fs-glint"/);assert.match(html,/id="brand-mark"[^>]*>.*<use href="#fs-glint"\/>/);
 assert.ok(html.indexOf('/intro.js')<html.indexOf('/app.js'),'intro runs before the app script');
 assert.match(html,/prefers-reduced-motion: reduce/,'never auto-plays with reduced motion');assert.match(html,/futuresight-intro-seen/);
 assert.match(html,/localStorage\.getItem\('primal-watch-theme-v2'\)/,'old theme choice still applies');
 assert.match(css,/html\.intro-pending::before\{[^}]*animation:intro-failsafe/,'the cover clears itself if the script never runs');
 assert.doesNotMatch(intro+css,/filter:\s*blur|backdrop-filter/,'no blur during the animation');
 assert.match(intro,/addEventListener\('pointerdown',skip\)/);assert.match(intro,/addEventListener\('keydown',onKey,true\)/);
});
test('Settings shows the opening animation controls when the intro script is present',async()=>{
 const ui=workspace();await ui.run('init()');
 let inserted='';ui.e('#settings-view').insertAdjacentHTML=(where,markup)=>{inserted+=markup;};
 ui.run("globalThis.futureSightIntro={enabled:()=>false,setEnabled(){},play(){}};renderSettings()");
 assert.match(inserted,/Opening animation/);assert.match(inserted,/id="intro-replay"/);assert.doesNotMatch(inserted,/id="intro-enabled" checked/);
});

test('Research rank panel: shadow label, evidence, price check and withheld forecast',async()=>{
 const NOW=Date.parse('2026-10-06T20:00:00Z'),release=Object.fromEntries(sets.map(s=>[s.id,s.release]));
 const t=investmentTable(cards.filter(c=>c.setId==='xy5').map(c=>[c,snapshots[c.id]]),{now:NOW,release}),id='xy5-151';
 const inv=Object.fromEntries(['raw','psa9','psa10'].map(g=>{const a=analyze(snapshots[id],g,15,NOW);return [g,investmentView(t,id,g,{reference:a.fair,referenceLabel:a.priceLabel})];}));
 const ui=workspace();ui.responses['/api/scores']={grades:scoreData.grades,scores:scoreData.scores,research:{modelVersion:t.modelVersion,mode:'shadow',ranks:t.ranks,status:t.status,gate:t.gate}};
 ui.responses['/api/market']={market:snapshots[id],score:null,investment:inv};
 await ui.run('init()');await ui.run(`select('${id}')`);ui.run("state.grade='psa9';renderDetail()");
 let html=ui.e('#detail').innerHTML;
 assert.match(html,/Research rank/);assert.match(html,/Shadow · unvalidated/);assert.match(html,/Limited evidence/);assert.match(html,/PSA and BGS mixed/);
 assert.match(html,/Break-even price/);assert.match(html,/validation gate/);assert.doesNotMatch(html,/chance of profit:/);
 assert.match(html,/not been validated against later prices/);
 // Typing an asking price updates the check without a re-render.
 ui.e('#ask-price').value='5000';ui.e('#ask-price').oninput();assert.match(ui.e('#cost-out').innerHTML,/At \$5,000\.00 asking/);assert.match(ui.e('#cost-out').innerHTML,/class="down"/);
 // Legacy mode (rollback) hides the panel entirely.
 ui.run("state.research={mode:'legacy'};renderDetail()");assert.doesNotMatch(ui.e('#detail').innerHTML,/Research rank/);
});
test('Info-screen grade and language tabs change only the shown card, not the list',async()=>{
 const ui=workspace();await ui.run('init()');await ui.run("select('ja-sv2a-201')");ui.run("state.grade='psa9';updateView()");
 const list=ui.e('#card-list').innerHTML;
 ui.run("showGrade('psa10')");
 assert.equal(ui.run('state.selected'),'ja-sv2a-201','same card stays open');assert.equal(ui.run('state.grade'),'psa9','list grade is untouched');
 assert.notEqual(ui.e('#grade').value,'psa10');assert.equal(ui.e('#card-list').innerHTML,list,'list is not re-filtered');
 assert.match(ui.e('#detail').innerHTML,/JAPANESE PSA 10 PRICES/);assert.match(ui.e('#detail').innerHTML,/data-detail-grade="psa10" class="active"/);
 ui.run("showVersion('en')");
 assert.equal(ui.run('state.selected'),'ja-sv2a-201');assert.equal(ui.run('shownCard().id'),'sv3pt5-199');assert.match(ui.e('#detail').innerHTML,/data-detail-grade="psa10" class="active"/);
 // Picking another card starts it in the list's grade and its own printing.
 const other=ui.run("filteredCards().find(c=>c.id!=='ja-sv2a-201'&&c.japanese).id");await ui.run(`select('${other}')`);
 assert.equal(ui.run('shownCard().id'),other);assert.equal(ui.run('viewGrade()'),'psa9');
 // The list grade picker takes over the info screen again.
 ui.run("showGrade('raw')");ui.e('#grade').onchange({target:{value:'psa10'}});assert.equal(ui.run('viewGrade()'),'psa10');
});
test('Japanese cards: language switch, set picker groups, info-screen language and grade tabs',async()=>{
 const ui=workspace();await ui.run('init()');
 const all=ui.run('filteredCards().length'),jp=ui.run('filteredCards().filter(c=>c.japanese).length');
 assert.ok(jp>5000,'Japanese cards are in the default all-cards view');
 assert.match(ui.e('#set-select').innerHTML,/Japanese · Scarlet/);
 assert.match(ui.e('#lang-chips').innerHTML,/data-lang-mode="all" class="active"/);
 ui.run("setLangMode('en')");assert.equal(ui.run('filteredCards().length'),all-jp);assert.match(ui.e('#active-filters').innerHTML,/English only/);
 ui.run("setLangMode('ja')");assert.equal(ui.run('filteredCards().length'),jp);assert.ok(ui.run('filteredCards().every(c=>c.japanese)'));assert.match(ui.e('#active-filters').innerHTML,/Japanese only/);
 ui.run("setLangMode('all')");assert.equal(ui.run('filteredCards().length'),all);
 // Search matches Japanese names too.
 ui.e('#search').oninput({target:{value:'リザードンex'}});assert.match(ui.e('#card-list').innerHTML,/JP<\/span>/);ui.e('#search').oninput({target:{value:''}});
 // Japanese card: no price, English tab available, grade tabs, no refresh button.
 ui.run("state.selected='ja-sv2a-201';renderDetail()");let html=ui.e('#detail').innerHTML;
 assert.match(html,/JAPANESE PSA 9 PRICES/);assert.match(html,/English version/);assert.match(html,/data-version="sv3pt5-199"/);assert.doesNotMatch(html,/リザードン|ポケモンカード151/,'English only by default');
 ui.run("state.showJapanese=true;renderDetail()");assert.match(ui.e('#detail').innerHTML,/<p class="name-ja" lang="ja">リザードンex · /);ui.run("state.showJapanese=false;renderDetail()");html=ui.e('#detail').innerHTML;assert.match(html,/Special Art Rare \(SAR\)/);
 assert.match(html,/data-detail-lang="ja" class="active"/);assert.match(html,/data-detail-grade="psa10"/);
 assert.match(html,/Not matched yet/);assert.match(html,/id="refresh-card"[^>]*>[\s\S]*?Find prices/);assert.doesNotMatch(html,/SUGGESTED MAXIMUM PRICE/);
 // Swap the info screen to English: the list selection stays, the English card is shown.
 ui.run("showVersion('en')");html=ui.e('#detail').innerHTML;assert.equal(ui.run('state.selected'),'ja-sv2a-201');assert.equal(ui.run('shownCard().id'),'sv3pt5-199');
 assert.match(html,/data-detail-lang="en" class="active"/);assert.match(html,/Japanese version/);assert.match(html,/data-version="ja-sv2a-201"/);
 // Grade tabs work in either language; the language choice carries over.
 ui.run("state.grade='psa10';updateView()");assert.equal(ui.run('shownCard().id'),'sv3pt5-199');assert.match(ui.e('#detail').innerHTML,/data-detail-grade="psa10" class="active"/);
 ui.run("showVersion('ja')");assert.equal(ui.run('shownCard().id'),'ja-sv2a-201');assert.match(ui.e('#detail').innerHTML,/JAPANESE PSA 10 PRICES/);
 // Reading view has the same language tabs beside the grade tabs.
 ui.run("setFocus(true)");assert.match(ui.e('#detail').innerHTML,/class="grade-tab lang-tab active" data-detail-lang="ja"/);ui.run("setFocus(false)");
 // An English card with no Japanese printing keeps its English page and says so.
 const lone=ui.run("state.cards.find(c=>!c.japanese&&c.eligible&&!c.japaneseIds).id");ui.run(`select('${lone}')`);
 assert.equal(ui.run('shownCard().id'),lone);assert.match(ui.e('#detail').innerHTML,/No verified Japanese counterpart of this printing/);
 // Choosing a Browse language resets the info screen to follow it.
 ui.run("setLangMode('en')");assert.equal(ui.run('state.detailLang'),null);
 // Once matched to its product (Find prices / Update sales), a Japanese card gets the full price panel.
 ui.run("setLangMode('all');applyMapping({sources:{'ja-sv2a-201':{source:'https://www.pricecharting.com/game/pokemon-japanese-scarlet-&-violet-151/charizard-ex-201',name:'Charizard EX'}},markets:{'ja-sv2a-201':{guide:{raw:327,grade9:381.97,psa10:546.14},observedAt:'2026-10-07T00:00:00Z',source:'PriceCharting',sales:[]}}},'ja-sv2a');state.selected='ja-sv2a-201';state.detailLang=null;state.grade='psa10';renderDetail()");
 html=ui.e('#detail').innerHTML;assert.doesNotMatch(html,/Not matched yet/);assert.match(html,/\$546\.14/);assert.match(html,/Japanese printing · price-guide product “Charizard EX”/);assert.match(html,/scored and ranked against Japanese cards only/);
 for(const c of cards.filter(c=>c.setId==='ja-sv2a')){c.source=null;c.sourceVerified=false;delete c.pcName;delete c.mapTried;}
});

test('Top movers and Investments switch language and rank each language separately',async()=>{
 const ui=workspace();await ui.run('init()');
 ui.e('#movers-nav').onclick();await ui.run('loadMovers("week")');
 assert.match(ui.e('#movers-view').innerHTML,/data-market-lang="en" class="active"/);assert.ok(ui.calls.some(u=>u.startsWith('/api/movers?')&&u.includes('lang=en')));
 ui.run("state.marketLang='ja'");await ui.run('loadMovers("week",true)');assert.ok(ui.calls.some(u=>u.startsWith('/api/movers?')&&u.includes('lang=ja')));
 assert.match(ui.e('#movers-view').innerHTML,/ranked only against other Japanese cards/);
 ui.e('#invest-nav').onclick();await ui.run('loadInvest(true)');assert.ok(ui.calls.some(u=>u.startsWith('/api/investments?')&&u.includes('lang=ja')));
});


test('Language switching refuses unreviewed, ambiguous and unrelated printings in both layouts',async()=>{
 const ui=workspace();await ui.run('init()');
 ui.run("select('sm115-67')");
 assert.equal(ui.run("counterpart(cardById('sm115-67'),'ja').id"),'ja-sm10-105');
 ui.run("state.cards=state.cards.map(c=>c.id==='sm115-67'?{...c,japaneseIds:[]}:c);renderDetail()");
 assert.match(ui.e('#detail').innerHTML,/data-detail-lang="ja"[^>]*disabled/);
 ui.run("showVersion('ja','ja-sm12a-193')");assert.equal(ui.run('shownCard().id'),'sm115-67');
 ui.run("setFocus(true)");assert.match(ui.e('#detail').innerHTML,/data-detail-lang="ja"[^>]*disabled/);
 ui.run("setFocus(false);select('sv3pt5-199');showVersion('ja','ja-sv2a-006')");
 assert.equal(ui.run('shownCard().id'),'sv3pt5-199');
 ui.run("showVersion('ja')");assert.equal(ui.run('shownCard().id'),'ja-sv2a-201');
 ui.run("showVersion('en');showVersion('ja')");assert.equal(ui.run('shownCard().id'),'ja-sv2a-201');
 ui.run("state.cards=state.cards.map(c=>c.id==='sv3pt5-199'?{...c,japaneseIds:['ja-sv2a-201','ja-sv2a-006']}:c)");
 assert.equal(ui.run("counterpart(cardById('sv3pt5-199'),'ja')"),null);
 ui.run("state.cards=state.cards.map(c=>c.id==='sv3pt5-199'?{...c,japaneseIds:['ja-sv2a-201']}:c.id==='ja-sv2a-201'?{...c,englishId:'sv3pt5-6'}:c)");
 assert.equal(ui.run("counterpart(cardById('sv3pt5-199'),'ja')"),null);
});

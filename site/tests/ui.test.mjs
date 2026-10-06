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
 const context=vm.createContext({document,analyze,computeAnalysis:analyze,gradeNames,trendProjection,summarize,portfolioSeries,priceHistory,entryValue,MIN_PURCHASE_DATE,Intl,Date,AbortController,Object,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,calls,fetch:async url=>{const path=url.split('?')[0];calls.push(url);let r=responses[path];if(typeof r==='function')r=r(url);if(r&&r.__status)return {ok:false,status:r.__status,json:async()=>r.body};return {ok:true,json:async()=>r||{}};}});
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'').replace(/init\(\);\s*$/,'');
 vm.runInContext(source,context);
 return {context,responses,calls,e:s=>elements.get(s),run:s=>vm.runInContext(s,context)};
}
test('Wizards era and vintage card coverage render in Browse',async()=>{
 const ui=workspace();await ui.run('init()');assert.match(ui.e('#set-select').innerHTML,/Wizards of the Coast/);assert.match(ui.e('#set-select').innerHTML,/Aquapolis/);
 ui.e('#set-select').onchange({target:{value:'era:WOTC'}});assert.equal(ui.run('filteredCards().length'),741);assert.match(ui.e('#page-title').textContent,/Wizards of the Coast/);
 ui.run("state.selected='base1-4';state.grade='psa9';renderDetail()");const detail=ui.e('#detail').innerHTML;assert.match(detail,/Standard \/ unlimited/);assert.match(detail,/not complete eBay sales history/);
});
test('Set picker, all-set search, and Radiant Collection render correct cards',async()=>{
 const ui=workspace();await ui.run('init()');
 assert.match(ui.e('#set-select').innerHTML,/Evolutions/);assert.equal(ui.e('#page-title').textContent,'Primal Clash');
 ui.e('#set-select').onchange({target:{value:'g1'}});assert.equal(ui.e('#page-title').textContent,'Generations');assert.match(ui.e('#set-count').innerHTML,/37/);
 ui.e('#grade').onchange({target:{value:'raw'}});ui.e('#search').oninput({target:{value:'RC30'}});assert.match(ui.e('#card-list').innerHTML,/Gardevoir/);assert.match(ui.e('#card-list').innerHTML,/RC30\/RC32/);assert.doesNotMatch(ui.e('#card-list').innerHTML,/\/160/);
 ui.e('#set-select').onchange({target:{value:'all'}});ui.run("state.category='all';updateView();");ui.e('#search').oninput({target:{value:'Flashfire'}});
 assert.equal(ui.run('filteredCards().length'),46);assert.match(ui.e('#set-count').innerHTML,/5001/);
 ui.e('#search').oninput({target:{value:''}});ui.e('#set-select').onchange({target:{value:'era:EX'}});assert.match(ui.e('#set-count').innerHTML,/687/);assert.equal(ui.e('#page-title').textContent,'Explore the EX era');
 ui.e('#set-select').onchange({target:{value:'col1'}});ui.e('#search').oninput({target:{value:'SL10'}});assert.match(ui.e('#card-list').innerHTML,/Rayquaza/);assert.match(ui.e('#card-list').innerHTML,/#SL10 · Shiny rare/);
 ui.e('#search').oninput({target:{value:''}});ui.e('#set-select').onchange({target:{value:'era:BW'}});assert.match(ui.e('#set-count').innerHTML,/553/);assert.equal(ui.e('#page-title').textContent,'Explore the Black & White era');
 ui.e('#set-select').onchange({target:{value:'bw11'}});ui.e('#search').oninput({target:{value:'RC24'}});assert.match(ui.e('#card-list').innerHTML,/Mew EX/);assert.match(ui.e('#card-list').innerHTML,/RC24\/RC25/);
 ui.e('#set-select').onchange({target:{value:'era:SM'}});assert.match(ui.e('#set-count').innerHTML,/1380/);assert.equal(ui.e('#page-title').textContent,'Explore the Sun & Moon era');
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
 assert.match(ui.e('#detail').innerHTML,/Close the Primal Watch window and start it again/);assert.match(ui.e('#detail').innerHTML,/id="score-retry"/);
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
 const posted=[];ui.responses['/api/research']=url=>{posted.push(url);return {count:4,total:8,done:posted.length>1,nextOffset:4,markets:{}};};
 ui.e('#movers-nav').onclick();await ui.run('loadMovers("week")');await new Promise(r=>setImmediate(r));const m=ui.calls.filter(u=>u.startsWith('/api/movers')).length;
 await ui.run('updateMarketSales()');
 assert.equal(posted.length,2);assert.match(posted[0],/set=all&offset=0/);assert.match(posted[1],/offset=4/);
 assert.ok(ui.calls.filter(u=>u.startsWith('/api/movers')).length>m,'the list is rebuilt once the sales are in');
});
test('Settings offers persistent light, dark, and soft-contrast appearances',async()=>{
 const ui=workspace();await ui.run('init()');ui.e('#settings-nav').onclick();assert.equal(ui.e('#settings-view').hidden,false);assert.equal(ui.e('#page-title').textContent,'Settings');
 const html=ui.e('#settings-view').innerHTML;assert.match(html,/Terminal/);assert.match(html,/Light/);assert.match(html,/Soft contrast/);assert.match(html,/saved in this browser/);
});

test('Advanced filters screen by era, price, activity and investment score, and the old $250–$350 toggle is gone',async()=>{
 const ui=workspace();await ui.run('init()');await ui.run('loadScores()');
 assert.doesNotMatch(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),/budget|250–\$350/);
 ui.e('#set-select').onchange({target:{value:'all'}});ui.run("state.category='all';updateView();");
 const total=ui.run('filteredCards().length');assert.equal(total,5001);
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
 ui.run("toggleEra('WOTC');toggleEra('EX');toggleEra('DP');toggleEra('BW');toggleEra('SM');");assert.equal(ui.run('state.setId'),'era:XY');
 assert.ok(ui.run("filteredCards().every(c=>c.series==='XY')"));ui.run("toggleEra('XY')");assert.equal(ui.run('state.setId'),'era:XY');
 ui.run("toggleEra('SM')");assert.equal(ui.run('state.setId'),'all');assert.equal(ui.run('state.eras.join()'),'XY,SM');
 assert.ok(ui.run("filteredCards().every(c=>['XY','SM'].includes(c.series))"));assert.equal(ui.e('#page-title').textContent,'Explore 2 eras');
 // Clearing restores everything
 ui.e('#reset-filters').onclick();assert.equal(ui.run('filterCount()'),0);assert.equal(ui.run('state.eras.length'),6);
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

test('Stylesheet avoids backdrop-filter, which made scrolling over overlays run at about 20 fps',()=>{
 const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/backdrop-filter/,'blur behind a scrolling layer is re-computed every frame');
});


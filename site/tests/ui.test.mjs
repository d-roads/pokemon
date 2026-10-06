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
 const context=vm.createContext({document,analyze,computeAnalysis:analyze,gradeNames,trendProjection,summarize,portfolioSeries,priceHistory,entryValue,MIN_PURCHASE_DATE,Intl,Date,AbortController,Object,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,fetch:async url=>({ok:true,json:async()=>responses[url.split('?')[0]]||{}})});
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'').replace(/init\(\);\s*$/,'');
 vm.runInContext(source,context);
 return {context,e:s=>elements.get(s),run:s=>vm.runInContext(s,context)};
}
test('Set picker, all-set search, and Radiant Collection render correct cards',async()=>{
 const ui=workspace();await ui.run('init()');
 assert.match(ui.e('#set-select').innerHTML,/Evolutions/);assert.equal(ui.e('#page-title').textContent,'Primal Clash');
 ui.e('#set-select').onchange({target:{value:'g1'}});assert.equal(ui.e('#page-title').textContent,'Generations');assert.match(ui.e('#set-count').innerHTML,/37/);
 ui.e('#grade').onchange({target:{value:'raw'}});ui.e('#search').oninput({target:{value:'RC30'}});assert.match(ui.e('#card-list').innerHTML,/Gardevoir/);assert.match(ui.e('#card-list').innerHTML,/RC30\/RC32/);assert.doesNotMatch(ui.e('#card-list').innerHTML,/\/160/);
 ui.e('#set-select').onchange({target:{value:'all'}});ui.run("state.category='all';updateView();");ui.e('#search').oninput({target:{value:'Flashfire'}});
 assert.equal(ui.run('filteredCards().length'),46);assert.match(ui.e('#set-count').innerHTML,/4260/);
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
 assert.match(detail,/Simple trend projection/);assert.match(detail,/>1Y</);assert.match(detail,/>2Y</);assert.match(detail,/>3Y</);assert.match(detail,/not investment advice/);
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
test('Settings offers persistent light, dark, and soft-contrast appearances',async()=>{
 const ui=workspace();await ui.run('init()');ui.e('#settings-nav').onclick();assert.equal(ui.e('#settings-view').hidden,false);assert.equal(ui.e('#page-title').textContent,'Settings');
 const html=ui.e('#settings-view').innerHTML;assert.match(html,/Terminal/);assert.match(html,/Light/);assert.match(html,/Soft contrast/);assert.match(html,/saved in this browser/);
});

test('Advanced filters screen by era, price, activity and investment score, and the old $250–$350 toggle is gone',async()=>{
 const ui=workspace();await ui.run('init()');await ui.run('loadScores()');
 assert.doesNotMatch(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),/budget|250–\$350/);
 ui.e('#set-select').onchange({target:{value:'all'}});ui.run("state.category='all';updateView();");
 const total=ui.run('filteredCards().length');assert.equal(total,4260);
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
 ui.run("toggleEra('EX');toggleEra('DP');toggleEra('BW');toggleEra('SM');");assert.equal(ui.run('state.setId'),'era:XY');
 assert.ok(ui.run("filteredCards().every(c=>c.series==='XY')"));ui.run("toggleEra('XY')");assert.equal(ui.run('state.setId'),'era:XY');
 ui.run("toggleEra('SM')");assert.equal(ui.run('state.setId'),'all');assert.equal(ui.run('state.eras.join()'),'XY,SM');
 assert.ok(ui.run("filteredCards().every(c=>['XY','SM'].includes(c.series))"));assert.equal(ui.e('#page-title').textContent,'Explore 2 eras');
 // Clearing restores everything
 ui.e('#reset-filters').onclick();assert.equal(ui.run('filterCount()'),0);assert.equal(ui.run('state.eras.length'),5);
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

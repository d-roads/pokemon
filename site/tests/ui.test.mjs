import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {cards,sets} from '../data/catalog.mjs';
import {snapshots} from '../data/market.mjs';
import {analyze,gradeNames,trendProjection} from '../lib/analysis.mjs';
import {summarize,portfolioSeries,priceHistory,entryValue,MIN_PURCHASE_DATE} from '../lib/portfolio.mjs';

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
 const responses={'/api/catalog':{cards,sets,series:[{id:'XY',name:'XY',label:'XY Series',years:'2014–2016'},{id:'BW',name:'Black & White',label:'Black & White Series',years:'2011–2013'},{id:'SM',name:'Sun & Moon',label:'Sun & Moon Series',years:'2017–2019'}],markets:snapshots,local:true},'/api/watchlist':{watchlist:[]},'/api/collection':{collection:[],markets:{}},'/api/alerts':{alerts:[],unseen:0,settings:{enabled:false,intervalMinutes:30,ebay:{configured:false},notify:{ntfy:'',discord:''}},searches:[],live:false}};
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
 assert.equal(ui.run('filteredCards().length'),46);assert.match(ui.e('#set-count').innerHTML,/2827/);
 ui.e('#search').oninput({target:{value:''}});ui.e('#set-select').onchange({target:{value:'era:BW'}});assert.match(ui.e('#set-count').innerHTML,/553/);assert.equal(ui.e('#page-title').textContent,'Explore the Black & White era');
 ui.e('#set-select').onchange({target:{value:'bw11'}});ui.e('#search').oninput({target:{value:'RC24'}});assert.match(ui.e('#card-list').innerHTML,/Mew EX/);assert.match(ui.e('#card-list').innerHTML,/RC24\/RC25/);
 ui.e('#set-select').onchange({target:{value:'era:SM'}});assert.match(ui.e('#set-count').innerHTML,/1380/);assert.equal(ui.e('#page-title').textContent,'Explore the Sun & Moon era');
 ui.e('#set-select').onchange({target:{value:'sm115'}});ui.e('#search').oninput({target:{value:'SV49'}});assert.match(ui.e('#card-list').innerHTML,/Charizard GX/);assert.match(ui.e('#card-list').innerHTML,/SV49\/SV94/);
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

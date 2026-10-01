import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {cards,sets} from '../data/catalog.mjs';
import {snapshots} from '../data/market.mjs';
import {analyze,gradeNames} from '../lib/analysis.mjs';

// Exercise the UI's controls and rendered output without a browser runtime.
function workspace(){
 const elements=new Map();
 class Element{
  constructor(){this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.dataset={};this.classList={toggle(){}};}
  set innerHTML(html){this.html=html;for(const m of html.matchAll(/id="([^"]+)"/g))if(!elements.has('#'+m[1]))elements.set('#'+m[1],new Element());}
  get innerHTML(){return this.html||'';}
  setAttribute(){} querySelectorAll(){return [];} showModal(){} close(){}
 }
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const m of html.matchAll(/id="([^"]+)"/g))elements.set('#'+m[1],new Element());
 const categories=[...html.matchAll(/data-category="([^"]+)"/g)].map(m=>{const e=new Element();e.dataset.category=m[1];return e;});
 const document={querySelector:s=>{assert.ok(elements.has(s),'Missing UI element '+s);return elements.get(s);},querySelectorAll:s=>s==='[data-category]'?categories:[]};
 const context=vm.createContext({document,analyze,computeAnalysis:analyze,gradeNames,Intl,Date,AbortController,setTimeout:()=>0,clearTimeout(){},fetch:async url=>({ok:true,json:async()=>url==='/api/catalog'?{cards,sets,markets:snapshots,local:true}:{watchlist:[]}})});
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*;\s*/,'').replace(/init\(\);\s*$/,'');
 vm.runInContext(source,context);
 return {context,e:s=>elements.get(s),run:s=>vm.runInContext(s,context)};
}
test('Set picker, all-set search, and Radiant Collection render correct cards',async()=>{
 const ui=workspace();await ui.run('init()');
 assert.match(ui.e('#set-select').innerHTML,/Evolutions/);assert.equal(ui.e('#page-title').textContent,'Primal Clash');
 ui.e('#set-select').onchange({target:{value:'g1'}});assert.equal(ui.e('#page-title').textContent,'Generations');assert.match(ui.e('#set-count').innerHTML,/37/);
 ui.e('#grade').onchange({target:{value:'raw'}});ui.e('#search').oninput({target:{value:'RC30'}});assert.match(ui.e('#card-list').innerHTML,/Gardevoir/);assert.match(ui.e('#card-list').innerHTML,/RC30\/RC32/);assert.doesNotMatch(ui.e('#card-list').innerHTML,/\/160/);
 ui.e('#set-select').onchange({target:{value:'all'}});ui.run("state.category='all';updateView();");ui.e('#search').oninput({target:{value:'Flashfire'}});
 assert.equal(ui.run('filteredCards().length'),46);assert.match(ui.e('#set-count').innerHTML,/894/);
});
test('Watchlist opens across sets and keeps saved limits with their own card',async()=>{
 const ui=workspace();await ui.run('init()');
 ui.run("state.watch=[{card_id:'xy1-55',grade:'psa9',target:25},{card_id:'xy5-55',grade:'psa9',target:150}]");
 ui.e('#watch-nav').onclick();assert.equal(ui.run('state.setId'),'all');assert.equal(ui.run('filteredCards().length'),2);
 assert.match(ui.e('#card-list').innerHTML,/\$25\.00/);assert.match(ui.e('#card-list').innerHTML,/\$150/);
 ui.e('#set-select').onchange({target:{value:'xy1'}});assert.equal(ui.run('filteredCards()[0].id'),'xy1-55');assert.match(ui.e('#detail').innerHTML,/XY Base Set/);
 ui.e('#set-select').onchange({target:{value:'xy12'}});assert.equal(ui.run('filteredCards().length'),0);assert.match(ui.e('#detail').innerHTML,/Select a card/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {cards} from '../data/catalog.mjs';
import {validateEntry,entryValue,summarize,portfolioSeries,priceHistory,valueAt,allocation,concentration,whatIf,versusMarket} from '../lib/portfolio.mjs';
const now=Date.parse('2026-10-01T12:00:00Z');
const market={guide:{psa10:600},sales:[100,110,120].map((price,i)=>({grade:'psa9',date:'2026-09-2'+i,price})),history:{grade9:[['2026-06',9000],['2026-07',9500],['2026-08',10500],['2026-09',11000]],psa10:[['2026-08',60000]]}};
test('Dex entries are validated before saving',()=>{
 assert.deepEqual(validateEntry({card_id:'xy5-151',grade:'psa9'},{cards,today:'2026-10-01'}).entry,{card_id:'xy5-151',grade:'psa9',quantity:1,purchase_price:null,purchase_date:null,notes:'',sold_price:null,sold_date:null});
 assert.equal(validateEntry({card_id:'xy5-151',grade:'psa9',purchase_price:'12.345'},{cards}).entry.purchase_price,12.35);
 assert.equal(validateEntry({card_id:'xy5-151',grade:'raw',purchase_date:'2010-01-01'},{cards,today:'2026-10-01'}).errors.length,0);
 assert.equal(validateEntry({card_id:'xy5-151',grade:'raw',purchase_date:'2009-12-31'},{cards,today:'2026-10-01',existingPurchaseDate:'2009-12-31'}).errors.length,0);
 for(const bad of [{card_id:'x',grade:'psa9'},{card_id:'xy5-151',grade:'cgc10'},{card_id:'xy5-151',grade:'raw',quantity:1.5},{card_id:'xy5-151',grade:'raw',purchase_date:'2009-12-31'},{card_id:'xy5-151',grade:'raw',purchase_date:'2026-02-30'},{card_id:'xy5-151',grade:'raw',purchase_date:'2026-10-02'}])assert.ok(validateEntry(bad,{cards,today:'2026-10-01'}).errors.length,JSON.stringify(bad));
});
test('An entry is worth its sold median, with P/L against what was paid',()=>{
 const v=entryValue({grade:'psa9',quantity:2,purchase_price:90},market,now);
 assert.equal(v.unit,110);assert.equal(v.value,220);assert.equal(v.cost,180);assert.equal(v.pl,40);assert.ok(Math.abs(v.plPct-0.2222)<0.001);assert.equal(v.basis,'sold median');
 const g=entryValue({grade:'psa10',quantity:1,purchase_price:700},market,now);assert.equal(g.unit,600);assert.equal(g.basis,'source guide');assert.equal(g.pl,-100);
 const none=entryValue({grade:'raw',quantity:1,purchase_price:5},{},now);assert.equal(none.value,null);assert.equal(none.pl,null);
});
test('Collection totals compare only cards that have both a price and a cost',()=>{
 const s=summarize([{card_id:'a',grade:'psa9',quantity:1,purchase_price:100},{card_id:'b',grade:'raw',quantity:1,purchase_price:50},{card_id:'a',grade:'psa10',quantity:1,purchase_price:null}],id=>id==='a'?market:{},now);
 assert.equal(s.value,710);assert.equal(s.cost,150);assert.equal(s.comparedCost,100);assert.equal(s.pl,10);assert.equal(s.unpriced,1);assert.equal(s.noCost,1);assert.equal(s.cards,3);
});
test('Value over time follows monthly history from each purchase month',()=>{
 assert.deepEqual(priceHistory(market,'psa9')[0],['2026-06',90]);assert.equal(valueAt(priceHistory(market,'psa9'),'2026-07'),95);assert.equal(valueAt(priceHistory(market,'psa9'),'2026-05'),null);
 const series=portfolioSeries([{card_id:'a',grade:'psa9',quantity:1,purchase_price:92,purchase_date:'2026-07-04'}],()=>market,now);
 assert.deepEqual(series.map(p=>p.month),['2026-07','2026-08','2026-09','2026-10']);
 assert.deepEqual(series.map(p=>p.value),[95,105,110,110]);assert.ok(series.every(p=>p.cost===92));
 assert.deepEqual(portfolioSeries([],()=>market,now),[]);
});

test('A sale needs a price and a date on or after the purchase, and moves the entry to realized P/L',()=>{
 const ok=validateEntry({card_id:'xy5-151',grade:'psa9',purchase_price:100,purchase_date:'2025-01-01',sold_price:'150.005',sold_date:'2026-02-01'},{cards,today:'2026-10-01'});
 assert.deepEqual(ok.errors,[]);assert.equal(ok.entry.sold_price,150.01);assert.equal(ok.entry.sold_date,'2026-02-01');
 for(const bad of [{sold_price:150},{sold_date:'2026-02-01'},{sold_price:150,sold_date:'2024-12-31'},{sold_price:150,sold_date:'2026-10-02'},{sold_price:-1,sold_date:'2026-02-01'}])
  assert.ok(validateEntry({card_id:'xy5-151',grade:'psa9',purchase_price:100,purchase_date:'2025-01-01',...bad},{cards,today:'2026-10-01'}).errors.length,JSON.stringify(bad));
 const s=summarize([{card_id:'a',grade:'psa9',quantity:1,purchase_price:100},{card_id:'a',grade:'psa9',quantity:2,purchase_price:80,sold_price:130,sold_date:'2026-08-15'}],()=>market,now);
 assert.equal(s.value,110,'the sold copies are not in the collection');assert.equal(s.cards,1);assert.equal(s.entries,1);
 assert.equal(s.realized,100);assert.equal(s.proceeds,260);assert.equal(s.realizedCost,160);assert.equal(s.sold,1);
 const series=portfolioSeries([{card_id:'a',grade:'psa9',quantity:1,purchase_price:92,purchase_date:'2026-07-04',sold_price:120,sold_date:'2026-08-20'}],()=>market,now);
 assert.deepEqual(series.map(p=>[p.month,p.value]),[['2026-07',95],['2026-08',120],['2026-09',0],['2026-10',0]],'valued at the sale price in its month, gone after');
});
test('Analytics: allocation splits shared cards, concentration, what-if moves and the market comparison',()=>{
 const rows=[{card_id:'x',grade:'psa10',quantity:1,value:600},{card_id:'y',grade:'psa9',quantity:1,value:300},{card_id:'z',grade:'raw',quantity:1,value:100},{card_id:'w',grade:'raw',quantity:1,value:500,sold:true}];
 const meta={x:{lang:'en',chars:['Charizard'],setName:'Base Set',series:'WOTC'},y:{lang:'en',chars:['Pikachu','Zekrom'],setName:'Team Up',series:'SM'},z:{lang:'en',chars:[],setName:'Base Set',series:'WOTC'}};
 const metrics={'x|psa10':{beta:2,volatility:.5,sales_90d:3},'y|psa9':{beta:1,volatility:.3,sales_90d:0}};
 assert.deepEqual(allocation(rows,meta,'char').map(a=>[a.key,a.value]),[['Charizard',600],['Pikachu',150],['Zekrom',150],['Other',100]]);
 assert.deepEqual(allocation(rows,meta,'setName').map(a=>[a.key,a.share]),[['Base Set',.7],['Team Up',.3]]);
 assert.deepEqual(allocation(rows,meta,'grade').map(a=>a.key),['psa10','psa9','raw']);
 const c=concentration(rows,meta,metrics);
 assert.equal(c.total,1000);assert.equal(c.top.card_id,'x');assert.equal(c.top.share,.6);assert.ok(Math.abs(c.effective-1/(.36+.09+.01))<1e-9);
 assert.equal(c.char.key,'Charizard');assert.ok(Math.abs(c.beta-(2*600+300)/900)<1e-9);assert.equal(c.betaCovered,.9);assert.equal(c.illiquid,.4,'y has no sales, z no metrics');
 const m=whatIf(rows,meta,metrics,{dim:'market',move:-.1});assert.ok(Math.abs(m.change-(-120-30-10))<1e-9,'each card by its beta, 1 if unknown');
 const p=whatIf(rows,meta,metrics,{dim:'char',key:'Pikachu',move:.2});assert.ok(Math.abs(p.change-30)<1e-9,'half of y');assert.equal(p.affected,300);
 assert.equal(whatIf(rows,meta,metrics,{dim:'setName',key:'Base Set',move:-1}).after,300);
 const hist=v=>({history:{psa10:v.map((c,i)=>['2026-0'+(i+1),c*100]),grade9:v.map((c,i)=>['2026-0'+(i+1),c*50]),raw:v.map((c,i)=>['2026-0'+(i+1),c*10])}});
 const markets={x:hist([10,12,15]),y:hist([10,10,10]),z:hist([10,10,10])},levels={'en|psa10':[['2026-01',100],['2026-02',100],['2026-03',110]],'en|psa9':[['2026-01',100],['2026-02',100],['2026-03',110]],'en|raw':[['2026-01',100],['2026-02',100],['2026-03',110]]};
 const held=rows.filter(r=>!r.sold);
 const v=versusMarket(held,meta,id=>markets[id],levels,['2026-01','2026-02','2026-03']);
 assert.equal(v.start,'2026-01');assert.deepEqual(v.points.map(x=>x[0]),['2026-01','2026-02','2026-03']);
 // Start: 1,000 + 500 + 100 = 1,600. Mine at March: 1,500 + 500 + 100 = 2,100. Market: 1,600 × 1.1.
 assert.ok(Math.abs(v.mine-(2100/1600-1))<1e-9);assert.ok(Math.abs(v.market-.1)<1e-9);
 assert.equal(versusMarket(held,meta,id=>markets[id],{},['2026-01','2026-02']),null,'no benchmark, no comparison');
});

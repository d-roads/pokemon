import test from 'node:test';
import assert from 'node:assert/strict';
import {analyze,median,trendProjection} from '../lib/analysis.mjs';
import {cards,sets} from '../data/catalog.mjs';
import {snapshots} from '../data/market.mjs';
const now=Date.parse('2026-10-01T00:00:00Z');
test('All XY, Black & White, requested Sun & Moon, and Double Crisis catalogs are complete and uniquely keyed',()=>{assert.equal(cards.length,5923);assert.equal(sets.length,43);assert.equal(cards.filter(c=>c.series==='XY').length,1865);assert.equal(cards.filter(c=>c.series==='BW').length,1336);assert.equal(cards.filter(c=>c.series==='SM').length,2722);assert.equal(new Set(cards.map(c=>c.id)).size,5923);for(const set of sets){const subset=cards.filter(c=>c.setId===set.id);assert.equal(subset.length,set.total,set.name);for(let n=1;n<=set.printedTotal;n++)assert.ok(subset.some(c=>c.number===n),set.name+' #'+n);}assert.equal(cards.find(c=>c.id==='xy5-151').name,'Primal Groudon EX');assert.equal(cards.find(c=>c.id==='xy5-164').name,'Weakness Policy');assert.equal(cards.find(c=>c.id==='dc1-15').name,"Team Magma's Groudon EX");});
test('Generations includes all Radiant Collection cards with correct labels',()=>{for(let n=1;n<=32;n++){const c=cards.find(c=>c.id==='g1-RC'+n);assert.ok(c);assert.equal(c.numberLabel,'RC'+n+'/RC32');assert.equal(c.printedTotal,32);}assert.equal(cards.find(c=>c.id==='g1-RC5').name,'Charizard');});
test('Wailord PSA 9 uses matching sales and applies the buy discount',()=>{const a=analyze({sales:[['2026-09-24',350],['2026-08-09',257],['2026-07-01',304.95],['2026-04-24',250],['2026-04-09',202.51],['2026-04-05',178.38]].map(([date,price])=>({grade:'psa9',date,price}))},'psa9',15,now);assert.equal(a.usable.length,6);assert.equal(a.current,253.5);assert.equal(a.target,215.47);assert.ok(a.target<a.current);});
test('Old PSA 10 sales do not produce a fresh target',()=>{const a=analyze({sales:[{grade:'psa10',date:'2021-01-22',price:500}],guide:{psa10:3394.2}},'psa10',15,now);assert.equal(a.target,null);assert.equal(a.confidence,'Insufficient');});
test('A single expensive PSA 10 sale does not produce a recommendation',()=>{const a=analyze({sales:[{grade:'psa10',date:'2026-08-18',price:10000}],guide:{psa10:9935.14}},'psa10',15,now);assert.equal(a.target,null);assert.equal(a.current,10000);});
test('Raw mixed-condition transactions never enter a near-mint target',()=>{const a=analyze({sales:[{grade:'raw',date:'2026-09-30',price:80,condition:'MP'},{grade:'raw',date:'2026-09-23',price:190,condition:'NM'},{grade:'raw',date:'2026-09-14',price:130,condition:'NM'}]},'raw',15,now);assert.equal(a.usable.length,2);assert.equal(a.target,null);});
test('Other grading companies cannot affect PSA estimates',()=>{const sales=[100,110,120].map((price,i)=>({grade:'psa9',date:`2026-09-${20+i}`,price}));sales.push({grade:'cgc9',date:'2026-09-29',price:5000});const a=analyze({sales},'psa9',15,now);assert.equal(a.current,110);assert.equal(a.all.length,3);});
test('Sparse guides and missing data leave demand and target unknown',()=>{const a=analyze(undefined,'psa9',15,now);assert.equal(a.target,null);assert.equal(a.score,null);assert.equal(a.current,null);});
test('Median handles odd and even samples',()=>{assert.equal(median([5,1,3]),3);assert.equal(median([6,2,4,0]),3);assert.equal(median([]),null);});
test('Trend projection uses the trailing-year regression slope as yearly dollar growth',()=>{
 const sales=[['2025-12-05',100],['2026-03-15',110],['2026-06-23',120],['2026-10-01',130]].map(([date,price])=>({date,price}));
 const p=trendProjection(sales,130,now);assert.equal(p.available,true);assert.equal(p.sampleCount,4);assert.ok(Math.abs(p.annualIncrease-36.52425)<.001);assert.deepEqual(p.values,[166.52,203.05,239.57]);
});
test('Trend projection fails closed when recent evidence is too sparse',()=>{
 assert.equal(trendProjection([{date:'2026-01-01',price:100},{date:'2026-09-01',price:120}],120,now).reason,'Not enough information');
 assert.equal(trendProjection([{date:'2024-01-01',price:100},{date:'2026-09-01',price:120},{date:'2026-09-15',price:130}],130,now).available,false);
});
test('Recent matching sales take precedence over an older price regime',()=>{const sales=[100,110,120].map((price,i)=>({grade:'psa9',date:'2026-09-'+(20+i),price}));sales.push(...[400,450,500].map((price,i)=>({grade:'psa9',date:'2026-05-'+(20+i),price})));const a=analyze({sales},'psa9',15,now);assert.equal(a.windowDays,30);assert.equal(a.current,110);assert.equal(a.target,93.5);});
test('Duplicate and future transactions cannot create a recommendation',()=>{const s={id:'same',grade:'psa9',date:'2026-09-29',price:100};const a=analyze({sales:[s,s,s,{grade:'psa9',date:'2026-12-01',price:999}]},'psa9',15,now);assert.equal(a.sampleCount,1);assert.equal(a.target,null);assert.equal(a.all.length,1);});
test('A recent played copy cannot make stale near-mint evidence fresh',()=>{const sales=[100,110,120].map((price,i)=>({grade:'raw',date:'2026-06-'+(1+i),price,condition:'NM'}));sales.push({grade:'raw',date:'2026-09-29',price:20,condition:'HP'});assert.equal(analyze({sales},'raw',15,now).target,null);});
test('The rare catalog excludes commons and includes Sun & Moon and Double Crisis chase cards',()=>{assert.equal(cards.filter(c=>c.eligible).length,2835);assert.equal(cards.filter(c=>c.eligible&&c.series==='XY').length,902);assert.equal(cards.filter(c=>c.eligible&&c.series==='BW').length,553);assert.equal(cards.filter(c=>c.eligible&&c.series==='SM').length,1380);assert.equal(cards.filter(c=>c.setId==='dc1'&&c.eligible).length,8);assert.equal(cards.filter(c=>c.setId==='xyp').length,211);assert.equal(cards.find(c=>c.id==='xy5-1').eligible,false);assert.equal(cards.find(c=>c.id==='xy5-3').eligible,true);assert.equal(cards.find(c=>c.id==='xyp-XY121').chase,true);assert.equal(cards.find(c=>c.id==='sm115-SV49').numberLabel,'SV49/SV94');assert.equal(cards.find(c=>c.id==='sm115-SV49').category,'Shiny GX');assert.equal(cards.find(c=>c.id==='sm115-SV49').chase,true);assert.equal(cards.find(c=>c.id==='dc1-15').chase,true);});
test('Mixed-grader guides cannot masquerade as a PSA 9 market price',()=>{const a=analyze({guide:{grade9:400}},'psa9',15,now);assert.equal(a.current,null);assert.equal(a.guidePrice,400);assert.equal(a.target,null);});
test('Black & White sets keep their own numbering, Radiant Collection and secret rares',()=>{
 const lt=cards.filter(c=>c.setId==='bw11');assert.equal(lt.length,140);assert.equal(cards.find(c=>c.id==='bw11-RC24').numberLabel,'RC24/RC25');assert.equal(cards.find(c=>c.id==='bw11-RC24').category,'Full art');
 assert.equal(cards.find(c=>c.id==='bw7-137').category,'ACE SPEC');assert.equal(cards.find(c=>c.id==='bw4-100').category,'Secret rare');assert.equal(cards.find(c=>c.id==='dv1-21').category,'Secret rare');
 assert.equal(cards.find(c=>c.id==='bw4-98').name,'Mewtwo EX');assert.ok(cards.find(c=>c.id==='bw4-98').chase);assert.equal(cards.find(c=>c.id==='bw1-1').eligible,false);
 assert.equal(sets.find(s=>s.id==='bw1').marketSource,'https://www.pricecharting.com/console/pokemon-black-&-white');
});
test('Source links keep apostrophes and use verified PriceCharting product names',()=>{
 const url=id=>cards.find(c=>c.id===id).source;
 assert.equal(url('xy5-157'),'https://www.pricecharting.com/game/pokemon-primal-clash/archie%27s-ace-in-the-hole-157');
 assert.equal(url('xy8-162'),'https://www.pricecharting.com/game/pokemon-breakthrough/giovanni%27s-scheme-162');
 assert.equal(url('xy12-108'),'https://www.pricecharting.com/game/pokemon-evolutions/misty%27s-determination-108');
 assert.equal(url('xyp-XY158'),'https://www.pricecharting.com/game/pokemon-promo/mega-beedrill-ex-xy158');
 assert.equal(url('xy9-92'),'https://www.pricecharting.com/game/pokemon-breakpoint/ho-oh-ex-92');
 assert.equal(url('xy7-66'),'https://www.pricecharting.com/game/pokemon-ancient-origins/porygon-z-66');
 assert.equal(url('xy12-53'),'https://www.pricecharting.com/game/pokemon-evolutions/mew-holo-53');
 for(const c of cards)assert.match(c.source,/^https:\/\/www\.pricecharting\.com\/game\/pokemon-[a-z0-9&-]+\/[a-z0-9%&-]+$/,c.id);
});

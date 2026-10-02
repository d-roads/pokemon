import test from 'node:test';
import assert from 'node:assert/strict';
import {cards} from '../data/catalog.mjs';
import {snapshots} from '../data/market.mjs';
import {analyze} from '../lib/analysis.mjs';
import {charactersOf,marketContext,potentialInvestments,uptrendSignal,recoveringSignal,INVEST_RULES} from '../lib/invest.mjs';

const END=Math.floor(Date.parse('2026-10-01T00:00:00Z')/86400000),NOW=END*86400000+43200000;
const day=n=>new Date((END-n)*86400000).toISOString().slice(0,10);
const market=(grade,rows,extra={})=>({observedAt:'2026-10-01T12:00:00Z',guide:{},sales:rows.map(([ago,price],i)=>({id:grade+i,grade,date:day(ago),price,condition:'NM'})),...extra});

test('Characters ignore card mechanics and forms, and split Tag Teams',()=>{
 assert.deepEqual(charactersOf('M Charizard EX'),['Charizard']);
 assert.deepEqual(charactersOf('Primal Groudon EX'),['Groudon']);
 assert.deepEqual(charactersOf('Pikachu-EX'),['Pikachu']);
 assert.deepEqual(charactersOf('Alolan Ninetales GX'),['Ninetales']);
 assert.deepEqual(charactersOf("Team Aqua's Kyogre EX"),['Kyogre']);
 assert.deepEqual(charactersOf('Shining Mew'),['Mew']);
 assert.deepEqual(charactersOf('Giratina ◇'),['Giratina']);
 assert.deepEqual(charactersOf('Black Kyurem EX'),['Kyurem']);
 assert.deepEqual(charactersOf('Dusk Mane Necrozma GX'),['Necrozma']);
 assert.deepEqual(charactersOf('Reshiram & Charizard GX'),['Reshiram','Charizard']);
 assert.deepEqual(charactersOf('Mega Sableye & Tyranitar GX'),['Sableye','Tyranitar']);
 assert.deepEqual(charactersOf('Raichu & Alolan Raichu GX'),['Raichu','Raichu']);
 assert.deepEqual(charactersOf('Ho-Oh BREAK'),['Ho-Oh']);
 assert.deepEqual(charactersOf('Ho Oh'),['Ho-Oh']);
});

test('A steady uptrend needs a clear, consistent rise across the year',()=>{
 // Monthly sales rising ~40% over the year with small noise.
 const rows=[];for(let m=0;m<12;m++)for(const k of [0,9])rows.push([m*30+k,100*Math.pow(1.4,(360-m*30-k)/365)*(k?1.03:.97)]);
 const a=analyze(market('psa10',rows),'psa10',15,NOW),s=uptrendSignal(a,END);
 assert.ok(s);assert.ok(s.growth>.3&&s.growth<.5,'growth '+s.growth);assert.equal(s.sales,24);
 // A flat year, a single late spike, or a too-steep run do not count.
 const flat=[];for(let m=0;m<12;m++)flat.push([m*30,100+(m%2?3:-3)],[m*30+9,100]);
 assert.equal(uptrendSignal(analyze(market('psa10',flat),'psa10',15,NOW),END),null);
 const spike=[...flat.slice(2),[1,240],[3,230]];
 assert.equal(uptrendSignal(analyze(market('psa10',spike),'psa10',15,NOW),END),null);
 const steep=[];for(let m=0;m<12;m++)steep.push([m*30,100*Math.pow(4,(360-m*30)/365)],[m*30+9,100*Math.pow(4,(351-m*30)/365)]);
 assert.equal(uptrendSignal(analyze(market('psa10',steep),'psa10',15,NOW),END),null,'+300%/yr is a surge, not steady');
 // Too few sales.
 assert.equal(uptrendSignal(analyze(market('psa10',rows.slice(0,6)),'psa10',15,NOW),END),null);
});

test('Recovering needs a held high, a real drawdown, and recent sales turning up',()=>{
 const history=[];for(let i=0;i<48;i++){const y=2022+Math.floor(i/12),m=String(i%12+1).padStart(2,'0');history.push([y+'-'+m,i<12?(20000+i*500):i<24?(26000-(i-12)*1000):(10000+(i%3)*100)]);}
 const recent=[[2,110],[10,108],[20,112],[30,109]],prior=[[50,95],[70,96],[90,94],[120,97]];
 const a=analyze(market('psa10',[...recent,...prior]),'psa10',15,NOW);
 const s=recoveringSignal(a,history,END);
 assert.ok(s);assert.ok(s.drawdown>.5);assert.ok(s.rise>.1);assert.match(s.peakMonth,/^2022|^2023/);
 // Sales still falling: no signal.
 const falling=analyze(market('psa10',[[2,90],[10,88],[20,91],[30,89],...prior]),'psa10',15,NOW);
 assert.equal(recoveringSignal(falling,history,END),null);
 // A one-month blip is not a held high.
 const blip=history.map(([ym],i)=>[ym,i===10?40000:10000+(i%4)*200]);
 assert.equal(recoveringSignal(a,blip,END),null);
});

test('Investments over the real data follow every rule',()=>{
 const entries=cards.map(c=>[c,snapshots[c.id]]),ctx=marketContext(entries),r=potentialInvestments(entries);
 assert.ok(Number.isFinite(r.rules.demandCut));
 // The demand cut keeps roughly the top quarter of characters.
 const scores=[...ctx.characters.values()].map(c=>c.score),share=scores.filter(s=>s>=r.rules.demandCut).length/scores.length;
 assert.ok(share>=.2&&share<=.32,'share '+share);
 for(const big of ['Charizard','Pikachu','Mew','Rayquaza','Umbreon'])assert.ok(ctx.characters.get(big).score>=r.rules.demandCut,big+' should be high demand');
 for(const [grade,col] of Object.entries(r.grades)){
  assert.ok(col.picks.length<=20);assert.ok(col.qualified>=col.picks.length);
  const per=new Map();
  for(const p of col.picks){
   assert.equal(p.grade,grade);assert.ok(p.price>=25);assert.ok(p.signals.length>=1);assert.ok(p.demand.score>=r.rules.demandCut);
   assert.equal(p.checks.length,3);assert.equal(p.checks.filter(c=>c.hit).length,p.signals.length);
   assert.ok(p.thesis.includes(p.demand.character)&&p.thesis.includes('Not a forecast'));
   if(p.signals.some(s=>s.type==='uptrend'))assert.match(p.thesis,/a year across \d+ sales/);
   per.set(p.demand.character,(per.get(p.demand.character)||0)+1);
   const card=cards.find(c=>c.id===p.card_id);assert.ok(card.eligible);
   assert.ok(!charactersOf(card.name).includes('Aggron'),'Aggron is not a top-quarter demand character');
   for(const s of p.signals){
    if(s.type==='uptrend')assert.ok(s.growth>=.15&&s.growth<=1.5&&s.sales>=8);
    if(s.type==='recovering')assert.ok(s.drawdown>=.4&&s.rise>=.05);
    if(s.type==='cheap'){assert.ok(s.ratio<=.65&&s.peers>=4);assert.notEqual(card.category,'Promo');}
   }
  }
  for(const n of per.values())assert.ok(n<=INVEST_RULES.perCharacter);
 }
 assert.ok(r.grades.psa10.picks.length>0&&r.grades.raw.picks.length>0);
});

// Japanese out-of-sample check of the frozen research rank (investment-backtest-ja.config.json).
//
// The English study chose the weights; nothing is selected or tuned here. Japanese prices live
// only in a FutureSight database (their products are mapped per database in source_map), so the
// input is a SQLite file. It is read-only and its contents are fingerprinted in the results.
//
// Usage (repository root):
//   node tools/research/backtest-japanese.mjs <database.sqlite>
// Writes tools/research/investment-backtest-ja-results.json.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {buildUniverse,buildObservations,baskets,summary,dateBootstrap,portfolio,linearScore,avg,sha256} from './backtest-investment.mjs';
import {monthIndex as month} from '../../site/lib/investment-features.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
export function loadJaConfig(file=path.join(here,'investment-backtest-ja.config.json')){const raw=readFileSync(file);return {config:JSON.parse(raw),hash:sha256(raw)};}

// Japanese cards with their saved market records, products applied as the server does.
export async function loadJapanese(dbFile){
 const {DatabaseSync}=await import('node:sqlite');
 const {cards,sets}=await import(pathToFileURL(path.join(root,'site/data/catalog.mjs')).href);
 const {numberOnlyAllowed}=await import(pathToFileURL(path.join(root,'site/lib/japanese.mjs')).href);
 const db=new DatabaseSync(dbFile,{readOnly:true}),byId=new Map(cards.map(c=>[c.id,c]));
 const japanese=[],mapped=new Set();
 for(const row of db.prepare('SELECT card_id,rule FROM source_map').all()){const c=byId.get(row.card_id);if(c?.japanese&&(row.rule!=='number-only'||numberOnlyAllowed(c)))mapped.add(c.id);}
 const snapshots={},fingerprint=[];
 for(const row of db.prepare("SELECT card_id,payload,fetched_at FROM market_cache WHERE card_id LIKE 'ja-%' ORDER BY card_id").all()){if(!mapped.has(row.card_id))continue;snapshots[row.card_id]=JSON.parse(row.payload);fingerprint.push(row.card_id+'|'+row.fetched_at);}
 for(const c of cards)if(c.japanese)japanese.push(c);
 db.close();
 return {cards:japanese,sets,snapshots,input:{file:path.basename(dbFile),mappedCards:mapped.size,marketRecords:fingerprint.length,withHistory:Object.values(snapshots).filter(m=>m.history&&Object.keys(m.history).length).length,sha256:sha256(fingerprint.join('\n'))}};
}

export function evaluate({config,hash},{cards,sets,snapshots,input}){
 const release=new Map(sets.map(s=>[s.id,month(s.release)])),w=config.weights,S=r=>linearScore(r,w);
 const eligible=cards.filter(c=>!config.unsupportedSeries.includes(c.series));
 const universe=buildUniverse(eligible,snapshots,config);
 const {observations,cohorts}=buildObservations(universe,release,config);
 const B=(rows,o={})=>summary(baskets(rows,S,config,o));
 const all=baskets(observations,S,config),dates=[...new Set(all.map(b=>b.date))];
 const dateLifts=dates.map(d=>({date:d,lift:avg(all.filter(b=>b.date===d).map(b=>b.lift)),baskets:all.filter(b=>b.date===d).length}));
 const delayed=observations.map(r=>({...r,p:r.next||r.p,noTrade:!r.next,future:r.lagFuture}));
 const held=observations.filter(r=>r.hold),st=config.stress;
 const results={config:{version:config.version,sha256:hash},weights:w,input,
  inventory:{...universe.inventory,japaneseCards:cards.length,observations:observations.length,uniqueCards:new Set(observations.map(r=>r.id)).size,sets:new Set(observations.map(r=>r.set)).size,eras:[...new Set(observations.map(r=>r.era))]},
  cohorts,overall:summary(all),dateLifts,
  byGrade:Object.fromEntries(config.grades.map(g=>[g,B(observations.filter(r=>r.g===g))])),
  byEra:Object.fromEntries([...new Set(observations.map(r=>r.era))].map(e=>[e,B(observations.filter(r=>r.era===e))])),
  heldSets:B(held),heldSetIds:[...new Set(held.map(r=>r.set))].sort(),
  horizons:Object.fromEntries(config.horizons.map(h=>[h,B(observations,{h})])),
  delayed:B(delayed),
  executionStress:B(delayed.map(r=>({...r,p:r.p*(1+st.buySlippage)*(1+st.acquisitionTax),future:Object.fromEntries(Object.entries(r.future).map(([h,p])=>[h,p*(1-st.exitSlippage)]))})),{haircut:st.saleHaircut,exitFixed:st.fixed}),
  dateBootstrap:dateBootstrap(all,config),
  portfolio:(({baskets:_,...rest})=>rest)(portfolio(observations,S,{...config,portfolio:{budget:2000,maxPerSet:3,maxPerCharacter:2}})),
  baskets:all};
 results.valueOnly=summary(baskets(observations,r=>linearScore(r,[0,1,0]),config));
 const pass={
  lift:results.overall.baskets>0&&results.overall.lift>0,
  delayed:results.delayed.baskets>0&&results.delayed.lift>0,
  heldSets:results.heldSets.baskets>0&&results.heldSets.lift>0,
  dates:dateLifts.length>0&&dateLifts.filter(d=>d.lift>0).length>dateLifts.length/2,
  coverage:dates.length>=config.gate.minEntryDates&&results.inventory.uniqueCards>=100&&results.inventory.sets>=5,
 };
 const values={lift:results.overall.lift,delayed:results.delayed.lift,heldSets:results.heldSets.lift,dates:dateLifts.filter(d=>d.lift>0).length+' of '+dateLifts.length,coverage:{dates:dates.length,cards:results.inventory.uniqueCards,sets:results.inventory.sets}};
 results.gate={checks:config.gate.checks.map(c=>({...c,pass:!!pass[c.id],value:values[c.id]})),passed:Object.values(pass).every(Boolean)};
 results.gate.recommendation=results.gate.passed?'shadow':'off';
 return results;
}

async function main(){
 const dbFile=process.argv[2];if(!dbFile)throw new Error('Usage: node tools/research/backtest-japanese.mjs <database.sqlite>');
 const cfg=loadJaConfig(),data=await loadJapanese(path.resolve(dbFile)),results=evaluate(cfg,data);
 results.provenance={scriptSha256:sha256(readFileSync(fileURLToPath(import.meta.url))),node:process.version,ranAt:new Date().toISOString()};
 for(const b of results.baskets)delete b.h;
 const file=path.join(here,'investment-backtest-ja-results.json');
 writeFileSync(file,JSON.stringify(results,(k,v)=>typeof v==='number'&&!Number.isInteger(v)?Math.round(v*1e8)/1e8:v,1)+'\n');
 const o=results.overall,pp=x=>(x*100).toFixed(2)+' pp';
 console.log(`Japanese, frozen weights ${JSON.stringify(results.weights)}: ${o.baskets} baskets, net ${(o.meanNet*100).toFixed(2)}% vs all-card ${(o.baseline*100).toFixed(2)}% (${pp(o.lift)}); delayed ${pp(results.delayed.lift)}; held-out sets ${pp(results.heldSets.lift)}.`);
 for(const c of results.gate.checks)console.log(` ${c.pass?'✓':'✗'} ${c.label}: ${JSON.stringify(c.value)}`);
 console.log('Gate:',results.gate.passed?'PASSED':'NOT PASSED','→ FUTURESIGHT_JA_RESEARCH default',results.gate.recommendation);
 console.log('Wrote',path.relative(root,file));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e);process.exit(1);});

// Saving and reading market metrics (metrics.mjs) in the database.
//
//   price_points   each card's guide price per grade on the days it was read: a row when the price changes,
//                  and again after METRIC_RULES.heartbeat days so an unchanged price is known to be current
//   card_metrics   one row per card and grade: today's returns, risk, liquidity, population, relative value
//   index_metrics  one row per index and grade: the same for the market, each era, set, Pokémon, tier, artist
//   market_index   index levels per day (daily for the last 100 days, month-end before that)
//   metrics_runs   when each rebuild ran
//
// A rebuild reads every saved record once, a page at a time, and replaces the metric tables. Rows of a
// rebuild carry its stamp; rows the rebuild did not write are removed at the end.
import {buildMetrics,cardFacts,dayNum,dayStr,METRIC_GRADES,METRIC_GUIDE_KEY,METRIC_RULES,TIER_LABEL} from './metrics.mjs';
import {mergeMarket} from './sales.mjs';

export const METRIC_TABLES=[
 'CREATE TABLE IF NOT EXISTS price_points (card_id TEXT NOT NULL, grade TEXT NOT NULL, day TEXT NOT NULL, price REAL NOT NULL, PRIMARY KEY (card_id, grade, day)) WITHOUT ROWID',
 'CREATE TABLE IF NOT EXISTS card_metrics (card_id TEXT NOT NULL, grade TEXT NOT NULL, lang TEXT NOT NULL, as_of TEXT NOT NULL, price REAL, sold REAL, ret_1d REAL, ret_7d REAL, ret_30d REAL, ret_90d REAL, ret_1y REAL, high_52w REAL, low_52w REAL, drawdown REAL, volatility REAL, sales_30d INTEGER, sales_90d INTEGER, value_90d REAL, days_since_sale INTEGER, spread_10_9 REAL, spread_10_raw REAL, pop_total INTEGER, pop_10 INTEGER, gem_rate REAL, pop_growth_90d REAL, lang_gap REAL, premium REAL, beta REAL, correl REAL, built TEXT, PRIMARY KEY (card_id, grade)) WITHOUT ROWID',
 'CREATE TABLE IF NOT EXISTS index_metrics (index_id TEXT NOT NULL, grade TEXT NOT NULL, lang TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, as_of TEXT NOT NULL, level REAL, ret_1d REAL, ret_7d REAL, ret_30d REAL, ret_90d REAL, ret_1y REAL, eq_ret_30d REAL, eq_ret_90d REAL, eq_ret_1y REAL, high_52w REAL, low_52w REAL, drawdown REAL, volatility REAL, members INTEGER, priced INTEGER, value REAL, top5_share REAL, up_30d INTEGER, down_30d INTEGER, breadth_30d REAL, sales_30d INTEGER, sales_90d INTEGER, value_90d REAL, premium REAL, premium_90d REAL, premium_1y REAL, gem_rate REAL, pop_growth_90d REAL, built TEXT, PRIMARY KEY (index_id, grade)) WITHOUT ROWID',
 'CREATE INDEX IF NOT EXISTS index_metrics_kind ON index_metrics (lang, kind, grade)',
 'CREATE TABLE IF NOT EXISTS market_index (index_id TEXT NOT NULL, grade TEXT NOT NULL, day TEXT NOT NULL, level REAL, level_eq REAL, members INTEGER, value REAL, premium REAL, built TEXT, PRIMARY KEY (index_id, grade, day)) WITHOUT ROWID',
 'CREATE TABLE IF NOT EXISTS index_flows (index_id TEXT NOT NULL, grade TEXT NOT NULL, month TEXT NOT NULL, sales INTEGER, value REAL, covered INTEGER, built TEXT, PRIMARY KEY (index_id, grade, month)) WITHOUT ROWID',
 'CREATE TABLE IF NOT EXISTS metrics_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT, as_of TEXT, cards INTEGER, indices INTEGER, ms INTEGER, error TEXT)',
];
export const CARD_COLUMNS=['card_id','grade','lang','as_of','price','sold','ret_1d','ret_7d','ret_30d','ret_90d','ret_1y','high_52w','low_52w','drawdown','volatility','sales_30d','sales_90d','value_90d','days_since_sale','spread_10_9','spread_10_raw','pop_total','pop_10','gem_rate','pop_growth_90d','lang_gap','premium','beta','correl'];
export const INDEX_COLUMNS=['index_id','grade','lang','kind','key','as_of','level','ret_1d','ret_7d','ret_30d','ret_90d','ret_1y','eq_ret_30d','eq_ret_90d','eq_ret_1y','high_52w','low_52w','drawdown','volatility','members','priced','value','top5_share','up_30d','down_30d','breadth_30d','sales_30d','sales_90d','value_90d','premium','premium_90d','premium_1y','gem_rate','pop_growth_90d'];
// Columns added after a table was first made. Metric tables are rebuilt in full, so a new column only
// needs to exist; it fills on the next rebuild.
const MET_ADDED={card_metrics:{beta:'REAL',correl:'REAL'},index_metrics:{pop_growth_90d:'REAL'}};
export async function ensureMetricTables(db){
 for(const sql of METRIC_TABLES)await db.prepare(sql).run();
 for(const [table,cols] of Object.entries(MET_ADDED)){
  const have=new Set(((await db.prepare(`PRAGMA table_info(${table})`).all()).results||[]).map(r=>r.name));
  for(const [name,type] of Object.entries(cols))if(!have.has(name))await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
 }
}
const MET_HISTORY_COLUMNS=['index_id','grade','day','level','level_eq','members','value','premium'];

// The database calls here finish without letting other requests run (node:sqlite is synchronous), so a
// rebuild gives way between pages and batches.
const metYield=()=>new Promise(r=>(globalThis.setImmediate||setTimeout)(r));
// Many rows in one statement: the rows travel as one JSON parameter (D1 allows 100 bound values). Rows are
// objects (read by column name) or arrays in column order; `extra` values are appended to every row.
// Statements are made and run a few at a time, so a large rebuild never holds all its JSON at once.
async function metWriteRows(db,table,columns,rows,{extra=[],size=2000,per=2}={}){
 const all=[...columns,...extra.map(([c])=>c)],tail=extra.map(([,v])=>v);
 const sql=`INSERT OR REPLACE INTO ${table} (${all.join(',')}) SELECT ${all.map((_,i)=>`json_extract(value,'$[${i}]')`).join(',')} FROM json_each(?)`;
 const values=r=>Array.isArray(r)?[...r,...tail]:[...columns.map(c=>r[c]??null),...tail];
 for(let i=0;i<rows.length;i+=size*per){
  const batch=[];
  for(let j=i;j<Math.min(rows.length,i+size*per);j+=size)batch.push(db.prepare(sql).bind(JSON.stringify(rows.slice(j,j+size).map(values))));
  await db.batch(batch);await metYield();
 }
}

// A guide price read on `day` becomes a point when it differs from the newest saved one, or that one is
// `heartbeat` days old. A second read on the same day replaces that day's point.
export function newPoint(points,day,price,rules=METRIC_RULES){
 if(!(price>0))return null;
 const lastPoint=points?.at(-1);
 if(!lastPoint||day>lastPoint[0]&&(lastPoint[1]!==price||day-lastPoint[0]>=rules.heartbeat))return [day,price];
 if(day===lastPoint[0]&&lastPoint[1]!==price)return [day,price];
 return null;
}

let metRunning=null;
export const rebuildState=()=>metRunning?{running:true,startedAt:metRunning.startedAt}:{running:false};
// Rebuild every metric table. `cards` is the catalog, `snapshots` the bundled records (merged under saved ones).
export function rebuildMetrics(db,{cards,snapshots,today=dayNum(new Date().toISOString()),rules=METRIC_RULES,pageSize=200,log=()=>{}}){
 if(metRunning)return metRunning.promise;
 const startedAt=new Date().toISOString();
 const promise=(async()=>{
  const t0=Date.now(),stamp=startedAt,byId=new Map(cards.map(c=>[c.id,c]));
  await db.prepare('INSERT INTO metrics_runs (started_at) VALUES (?)').bind(startedAt).run();
  try{
   // Daily guide points saved so far.
   const daily=new Map();
   for(const r of (await db.prepare('SELECT card_id,grade,day,price FROM price_points ORDER BY card_id,grade,day').all()).results||[]){const per=daily.get(r.card_id)||daily.set(r.card_id,{raw:[],psa9:[],psa10:[]}).get(r.card_id);per[r.grade]?.push([dayNum(r.day),r.price]);}
   // PSA population over time.
   const pops=new Map();
   for(const r of (await db.prepare("SELECT card_id,counts,captured_at FROM population_observations WHERE grader = 'PSA' ORDER BY captured_at").all()).results||[]){try{const counts=JSON.parse(r.counts);if(Array.isArray(counts))(pops.get(r.card_id)||pops.set(r.card_id,[]).get(r.card_id)).push([dayNum(r.captured_at),counts]);}catch{}}
   const facts=new Map(),points=[];
   const take=(id,market)=>{
    const card=byId.get(id);if(!card?.eligible||!market)return;
    const per=daily.get(id)||daily.set(id,{raw:[],psa9:[],psa10:[]}).get(id);
    for(const g of METRIC_GRADES){
     const key=METRIC_GUIDE_KEY[g],seen=market.guideSources?.[key]?.observedAt||market.observedAt;if(!seen)continue;
     const day=dayNum(seen);if(!(day<=today))continue;
     const p=newPoint(per[g],day,market.guide?.[key],rules);if(!p)continue;
     if(per[g].at(-1)?.[0]===day)per[g][per[g].length-1]=p;else per[g].push(p);
     points.push({card_id:id,grade:g,day:dayStr(day),price:p[1]});
    }
    facts.set(id,cardFacts(card,market,per,pops.get(id),today,rules));
   };
   // Saved records, a page at a time, merged over the bundled snapshot as everywhere else.
   let after='';
   for(;;){
    const rows=(await db.prepare('SELECT card_id,payload FROM market_cache WHERE card_id > ? ORDER BY card_id LIMIT ?').bind(after,pageSize).all()).results||[];
    if(!rows.length)break;
    for(const r of rows){let m=null;try{m=JSON.parse(r.payload);}catch{}take(r.card_id,mergeMarket(snapshots[r.card_id],m));}
    after=rows.at(-1).card_id;
    await metYield();
   }
   let n=0;for(const [id,m] of Object.entries(snapshots)){if(facts.has(id))continue;take(id,m);if(++n%200===0)await metYield();}
   log(`Metrics: read ${facts.size} cards in ${Date.now()-t0} ms.`);
   const t1=Date.now(),built=await buildMetrics(cards,facts,today,rules,{pause:metYield});
   log(`Metrics: computed ${built.cardRows.length} card rows, ${built.indexRows.length} index rows, ${built.historyRows.length} index levels in ${Date.now()-t1} ms.`);
   const t2=Date.now(),extra=[['built',stamp]];
   await metWriteRows(db,'price_points',['card_id','grade','day','price'],points);
   await metWriteRows(db,'card_metrics',CARD_COLUMNS,built.cardRows,{extra});
   await metWriteRows(db,'index_metrics',INDEX_COLUMNS,built.indexRows,{extra});
   await metWriteRows(db,'market_index',MET_HISTORY_COLUMNS,built.historyRows,{extra});
   await metWriteRows(db,'index_flows',['index_id','grade','month','sales','value','covered'],built.flowRows,{extra});
   await db.batch(['card_metrics','index_metrics','market_index','index_flows'].map(t=>db.prepare(`DELETE FROM ${t} WHERE built IS NOT ?`).bind(stamp)));
   log(`Metrics: saved in ${Date.now()-t2} ms.`);
   const summary={as_of:dayStr(today),cards:facts.size,indices:new Set(built.indexRows.map(r=>r.index_id)).size,ms:Date.now()-t0,points:points.length};
   await db.prepare('UPDATE metrics_runs SET finished_at = ?, as_of = ?, cards = ?, indices = ?, ms = ? WHERE started_at = ?').bind(new Date().toISOString(),summary.as_of,summary.cards,summary.indices,summary.ms,startedAt).run();
   return summary;
  }catch(e){
   await db.prepare('UPDATE metrics_runs SET finished_at = ?, error = ? WHERE started_at = ?').bind(new Date().toISOString(),String(e.message).slice(0,500),startedAt).run().catch(()=>{});
   throw e;
  }
 })().finally(()=>{metRunning=null;});
 metRunning={startedAt,promise};
 return promise;
}
export async function lastRun(db){return await db.prepare('SELECT started_at,finished_at,as_of,cards,indices,ms,error FROM metrics_runs ORDER BY id DESC LIMIT 1').first();}

// ---------- Reading ----------
// A display name for an index id.
export function indexName(id,{sets,series}){
 const [lang,kind,...rest]=id.split(':'),key=rest.join(':'),ja=lang==='ja'?' (Japanese)':'';
 if(kind==='all')return (lang==='ja'?'All Japanese':'All English')+' cards';
 if(kind==='top100')return 'Top 100 '+(lang==='ja'?'Japanese':'English')+' cards';
 if(kind==='set')return (sets.find(s=>s.id===key)?.name||key)+ja;
 if(kind==='era')return (series.find(s=>s.id===key)?.label||series.find(s=>s.id===key)?.name||key)+ja;
 if(kind==='tier')return (TIER_LABEL[key]||key)+ja;
 return key+ja;
}
// Rows without the rebuild stamp.
const metPlain=row=>{const {built:_,...rest}=row;return rest;};
export async function cardMetrics(db,id){
 const rows=(await db.prepare('SELECT * FROM card_metrics WHERE card_id = ?').bind(id).all()).results||[];
 return Object.fromEntries(rows.map(r=>[r.grade,metPlain(r)]));
}
export async function indexList(db,{lang,kind,grade}){
 return ((await db.prepare('SELECT * FROM index_metrics WHERE lang = ? AND kind = ? AND grade = ?').bind(lang,kind,grade).all()).results||[]).map(metPlain);
}
export async function indexDetail(db,id,grade){
 const metrics=await db.prepare('SELECT * FROM index_metrics WHERE index_id = ? AND grade = ?').bind(id,grade).first();
 if(!metrics)return null;
 const history=((await db.prepare('SELECT day,level,level_eq,members,value,premium FROM market_index WHERE index_id = ? AND grade = ? ORDER BY day').bind(id,grade).all()).results||[]).map(r=>[r.day,r.level,r.level_eq,r.members,r.value,r.premium]);
 return {metrics:metPlain(metrics),history};
}
// card_metrics rows for many cards, 100 at a time.
export async function cardMetricsFor(db,ids,grade){
 const out={};
 for(let i=0;i<ids.length;i+=99){const part=ids.slice(i,i+99),r=await db.prepare(`SELECT * FROM card_metrics WHERE grade = ? AND card_id IN (${part.map(()=>'?').join(',')})`).bind(grade,...part).all();for(const row of r.results||[])out[row.card_id]=metPlain(row);}
 return out;
}
// Month-end levels (equal- and value-weighted) of every index of one kind, for sparklines: the last
// `months` month ends and today. Ids of a kind share a prefix, so this reads one key range.
export async function indexSparks(db,{lang,kind,grade,days}){
 const lo=`${lang}:${kind}:`,hi=`${lang}:${kind};`,out={};
 const list=days.map(()=>'?').join(',');
 const rows=(await db.prepare(`SELECT index_id,day,level,level_eq FROM market_index WHERE index_id >= ? AND index_id < ? AND grade = ? AND day IN (${list})`).bind(lo,hi,grade,...days).all()).results||[];
 for(const r of rows)(out[r.index_id]||=[]).push([r.day,r.level,r.level_eq]);
 for(const v of Object.values(out))v.sort((a,b)=>a[0].localeCompare(b[0]));
 return out;
}
// Breadth across every priced card of a language and grade: how many rose or fell over 30 days, and how
// many sit at a new 52-week high or low.
export async function marketBreadth(db,{lang,grade}){
 return await db.prepare(`SELECT COUNT(*) AS cards,COUNT(price) AS priced,SUM(ret_30d > 0) AS up_30d,SUM(ret_30d < 0) AS down_30d,SUM(ret_7d > 0) AS up_7d,SUM(ret_7d < 0) AS down_7d,
  SUM(price IS NOT NULL AND high_52w IS NOT NULL AND price >= high_52w) AS highs,SUM(price IS NOT NULL AND low_52w IS NOT NULL AND price <= low_52w AND high_52w > low_52w) AS lows,
  SUM(sales_30d) AS sales_30d,SUM(sales_90d) AS sales_90d,MAX(as_of) AS as_of FROM card_metrics WHERE lang = ? AND grade = ?`).bind(lang,grade).first();
}
// Month-end levels of every set index in a language, for lifecycle curves.
export async function setHistories(db,{lang,grade}){
 const out={};
 const rows=(await db.prepare('SELECT index_id,day,level,level_eq FROM market_index WHERE index_id >= ? AND index_id < ? AND grade = ? ORDER BY index_id,day').bind(`${lang}:set:`,`${lang}:set;`,grade).all()).results||[];
 for(const r of rows){const d=new Date(r.day+'T00:00:00Z'),next=new Date(d.getTime()+86400000);if(next.getUTCDate()!==1)continue;(out[r.index_id.slice(lang.length+5)]||=[]).push([r.day.slice(0,7),r.level,r.level_eq]);}
 return out;
}
// index_metrics rows for the named indices (every grade).
export async function indexRowsFor(db,ids){
 const out=[];
 for(let i=0;i<ids.length;i+=99){const part=ids.slice(i,i+99);out.push(...(((await db.prepare(`SELECT * FROM index_metrics WHERE index_id IN (${part.map(()=>'?').join(',')})`).bind(...part).all()).results)||[]).map(metPlain));}
 return out;
}

// One card's saved history: daily guide prices per grade and PSA population over time
// ([day, total, PSA 10, PSA 9], one row per day on which the counts changed).
export async function cardHistory(db,id){
 const points={raw:[],psa9:[],psa10:[]};
 for(const r of (await db.prepare('SELECT grade,day,price FROM price_points WHERE card_id = ? ORDER BY day').bind(id).all()).results||[])points[r.grade]?.push([r.day,r.price]);
 const pop=[];
 for(const r of (await db.prepare("SELECT counts,captured_at FROM population_observations WHERE card_id = ? AND grader = 'PSA' ORDER BY captured_at").bind(id).all()).results||[]){
  let c;try{c=JSON.parse(r.counts);}catch{continue;}if(!Array.isArray(c))continue;
  const row=[r.captured_at.slice(0,10),c.reduce((a,b)=>a+(b||0),0),c[9]||0,c[8]||0];
  if(pop.at(-1)?.[0]===row[0])pop[pop.length-1]=row;else if(!pop.length||pop.at(-1)[1]!==row[1]||pop.at(-1)[2]!==row[2])pop.push(row);
 }
 return {points,pop};
}
// An index's typical-card level over time, every grade.
export async function indexLevels(db,id){
 const out={};
 for(const r of (await db.prepare('SELECT grade,day,level_eq FROM market_index WHERE index_id = ? ORDER BY day').bind(id).all()).results||[])(out[r.grade]||=[]).push([r.day,r.level_eq]);
 return out;
}

// Money flow for every index of one kind: sales value per month and its share of the language's whole market
// (both counted over the same covered cards' pages).
export async function indexFlows(db,{lang,kind,grade}){
 const rows=(await db.prepare('SELECT index_id,month,sales,value,covered FROM index_flows WHERE index_id >= ? AND index_id < ? AND grade = ? ORDER BY month').bind(`${lang}:${kind}:`,`${lang}:${kind};`,grade).all()).results||[];
 const all=new Map((((await db.prepare('SELECT month,sales,value,covered FROM index_flows WHERE index_id = ? AND grade = ?').bind(`${lang}:all:all`,grade).all()).results)||[]).map(r=>[r.month,r]));
 const out={};
 for(const r of rows){const t=all.get(r.month);(out[r.index_id]||=[]).push([r.month,r.sales,r.value,t?.value>0?r.value/t.value:null]);}
 return {indices:out,market:[...all.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(r=>[r.month,r.sales,r.value,r.covered])};
}

// Biggest card moves over a period, up and down, among cards worth at least `minPrice`. A thinly traded
// card's guide can jump on one odd sale (a PSA 10 guide going from $239 to $8,600), so a move counts only
// when matching sales back it: the sold median within 35% of the guide, or `minSales` sales in 90 days
// and a change under `maxRet` (10 = +1,000%).
export const MOVER_CHECKS={minPrice:20,minSales:2,maxRet:10,soldBand:.35};
export async function cardMovers(db,{lang,grade,period,limit=10,rules=MOVER_CHECKS}){
 const col={'1d':'ret_1d','7d':'ret_7d','30d':'ret_30d','90d':'ret_90d','1y':'ret_1y'}[period];if(!col)return null;
 const rows=(await db.prepare(`SELECT card_id,price,sold,${col} AS ret,sales_90d,days_since_sale FROM card_metrics WHERE lang = ? AND grade = ? AND price >= ? AND ${col} IS NOT NULL AND ${col} != 0`).bind(lang,grade,rules.minPrice).all()).results||[];
 const backed=r=>r.sold>0&&Math.abs(r.price/r.sold-1)<=rules.soldBand||(r.sales_90d>=rules.minSales&&r.ret<rules.maxRet);
 const ok=rows.filter(backed);
 return {up:ok.filter(r=>r.ret>0).sort((a,b)=>b.ret-a.ret).slice(0,limit),down:ok.filter(r=>r.ret<0).sort((a,b)=>a.ret-b.ret).slice(0,limit),unbacked:rows.length-ok.length,rules};
}

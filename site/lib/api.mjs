import {manualSearchQuery,affiliateOptions} from './ebay-links.mjs';
import {cards,sets,series} from '../data/catalog.mjs';
import {snapshots,observedAt} from '../data/market.mjs';
import {database} from './db.mjs';
import {parseMarket,parseSet,parseSetPage,listingCursor,listingPageUrl,sourceFetch} from './provider.mjs';
import {mergeMarket} from './sales.mjs';
import {lightMarket} from './payload.mjs';
import {topMovers,PERIODS} from './movers.mjs';
import {potentialInvestments} from './invest.mjs';
import {investmentScores} from './score.mjs';
import {validateEntry} from './portfolio.mjs';
import {DEFAULT_SETTINGS,normalizeSettings,updateSettings,publicSettings,hasListingAccess,runScan,sendNotifications,ebaySearchUrl,alertLimit} from './alerts.mjs';
import {isPlainObject,oneOf,optionalPrice,boundedText,optionalText,shapeError} from './schema.mjs';
import {reportError} from './report.mjs';
import {analyze} from './analysis.mjs';
import {recordObservations,observationStatements} from './observations.mjs';
import {pacer,startJob,cancelJob,jobStatus} from './updater.mjs';
import {investmentTable,investmentView,scoreMode,modelVersion,archiveScores,researchLanguages,mergeInvestmentTables} from './investment.mjs';
import {DEFAULT_COSTS,maxBuyPrice,netReturn,COST_PROFILE_VERSION} from './investment-costs.mjs';
import {parseJapaneseListing,matchJapaneseListing,listingGuide,numberOnlyAllowed,JA_MAP_VERSION} from './japanese.mjs';
import {METRIC_GRADES,indexKeysOf,dayNum,dayStr} from './metrics.mjs';
import {METRIC_TABLES,rebuildMetrics,rebuildState,lastRun,cardMetrics,indexList,indexDetail,indexName,cardMetricsFor,indexSparks,marketBreadth,setHistories} from './metrics-store.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const cardById=new Map(cards.map(c=>[c.id,c]));
const seriesIds=series.map(item=>item.id);
function insightSeries(url){const raw=url.searchParams.get('series');if(raw==null)return seriesIds;const requested=new Set(raw.split(',').map(value=>value.trim().toUpperCase()).filter(Boolean));if(!requested.size||[...requested].some(id=>!seriesIds.includes(id)))return null;return seriesIds.filter(id=>requested.has(id));}
async function cachedMarkets(db){const r=await db.prepare('SELECT card_id,payload FROM market_cache').all();return Object.fromEntries((r.results||[]).map(r=>[r.card_id,JSON.parse(r.payload)]));}
// Saved records for the named cards only, 100 at a time (D1 allows 100 bound values per query).
async function cachedMarketsFor(db,ids){
 const out={},list=[...new Set(ids)];
 for(let i=0;i<list.length;i+=100){const part=list.slice(i,i+100),r=await db.prepare(`SELECT card_id,payload FROM market_cache WHERE card_id IN (${part.map(()=>'?').join(',')})`).bind(...part).all();for(const row of r.results||[])out[row.card_id]=JSON.parse(row.payload);}
 return out;
}
async function cachedMarket(db,id){const row=await db.prepare('SELECT payload FROM market_cache WHERE card_id = ?').bind(id).first();return row?JSON.parse(row.payload):null;}
async function readWatch(db,user){const r=await db.prepare('SELECT card_id,grade,target,created_at FROM watchlist WHERE user_id = ? ORDER BY created_at DESC').bind(user).all();return r.results||[];}
async function readCollection(db,user){const r=await db.prepare('SELECT id,card_id,grade,quantity,purchase_price,purchase_date,notes,created_at,updated_at FROM collection WHERE user_id = ? ORDER BY COALESCE(purchase_date,substr(created_at,1,10)) DESC,id DESC').bind(user).all();return r.results||[];}
// Every capture is also appended to the observation log (best effort: a logging failure never blocks a refresh).
async function logCapture(db,env,ctx,card,captured){try{await recordObservations(db,card,captured);}catch(e){console.error('Observation log:',e.message);ctx?.waitUntil?.(reportError(env,e,{source:'observations'}));}}
// Japanese cards get their price source when their set is mapped (source_map). The mapping is
// loaded once per process and applied to the catalog's card objects, so every route sees it.
let sourceMapLoaded=null;
// A card known only by its Japanese name takes the price guide's English product name.
// A card with no catalog image takes the matched product's photo.
function applySource(card,row){card.source=row.url;card.sourceVerified=true;if(row.name)card.pcName=row.name;if(row.product_id)card.pcProductId=row.product_id;if(card.nameIsJapanese&&row.name){card.nameOriginal??=card.name;card.name=row.name;card.nameFromGuide=true;}if(row.image&&card.imagePlaceholder){card.placeholderImage??=card.image;card.image=row.image;card.imagePlaceholder=false;card.imageFromGuide=true;}}
// Tests reset the mapping between databases.
export function forgetSourceMap(){sourceMapLoaded=null;for(const c of cards)if(c.japanese){c.source=null;c.sourceVerified=false;delete c.pcName;delete c.pcProductId;if('nameOriginal' in c){c.name=c.nameOriginal;delete c.nameOriginal;delete c.nameFromGuide;}if(c.imageFromGuide){c.image=c.placeholderImage;c.imagePlaceholder=true;delete c.imageFromGuide;}}}
async function ensureSourceMap(db){
 if(!sourceMapLoaded)sourceMapLoaded=(async()=>{
  const r=await db.prepare('SELECT card_id,url,product_id,name,rule FROM source_map').all(),wrong=[];
  for(const row of r.results||[]){const c=cardById.get(row.card_id);if(!c||!c.japanese)continue;if(row.rule==='number-only'&&!numberOnlyAllowed(c)){wrong.push(row.card_id);continue;}applySource(c,row);}
  // Matches made by number alone in Pokédex-numbered sets (before ja-map-2026.10.08) named another card: forget them and their prices.
  if(wrong.length)await db.batch(wrong.flatMap(id=>[db.prepare('DELETE FROM source_map WHERE card_id = ?').bind(id),db.prepare('DELETE FROM market_cache WHERE card_id = ?').bind(id)]));
 })().catch(e=>{sourceMapLoaded=null;throw e;});
 return sourceMapLoaded;
}
// A whole listing (every page), kept for 15 minutes: the three promo sets share one listing.
// Pages are read one at a time with a short pause; a "too many requests" answer waits and retries.
const listingMemo=new Map();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function listingPage(url,env){
 for(let attempt=0;;attempt++){
  try{return await sourceFetch(url,env);}
  catch(e){if(attempt<3&&/\(429\)/.test(e.message)){await pause(env.LISTING_RETRY_MS??15000*(attempt+1));continue;}throw e;}
 }
}
// Card pages during Update sales: a busy answer (429, 5xx) or a timeout is retried twice before the
// card is reported as failed, so one slow response does not leave a card without its sales.
async function cardPage(url,env){
 for(let attempt=0;;attempt++){
  try{return await sourceFetch(url,env);}
  catch(e){if(attempt<2&&/\((?:429|5\d\d)\)|timeout|aborted|fetch failed/i.test(e.message)){await pause(env.CAPTURE_RETRY_MS??4000*(attempt+1));continue;}throw e;}
 }
}
// With a pace (the guide sweep job) every page waits its turn and a busy answer is left to the job to
// retry; `first` is the first page when the job has already read it.
async function japaneseListing(source,env,{pace=null,first=null}={}){
 const hit=listingMemo.get(source);if(!pace&&hit&&Date.now()-hit.at<900000)return hit.value;
 const rows=[];let cursor=null,pages=0;const seen=new Set();
 do{
  const url=source+'?view=table'+(cursor?'&cursor='+encodeURIComponent(cursor):'');let html;
  if(!pages&&first!=null)html=first;
  else if(pace){await pace.wait();html=await sourceFetch(url,env);pace.ok();}
  else{if(pages)await pause(env.LISTING_PAUSE_MS??800);html=await listingPage(url,env);}
  const page=parseJapaneseListing(html);
  rows.push(...page.rows);cursor=page.cursor;pages++;
  if(cursor&&seen.has(cursor))break;if(cursor)seen.add(cursor);
 }while(cursor&&pages<40);
 const value={rows,pages};listingMemo.set(source,{at:Date.now(),value});return value;
}
export function forgetListings(){listingMemo.clear();}
// Read every page of a Japanese set's listing, match products to cards, save the matches and their guide prices.
async function mapJapaneseSet(db,env,ctx,set,{listing=null}={}){
 if(!set.marketSource)return {mapped:0,unmatched:[],warning:'This Japanese set has no price-guide listing.'};
 const {rows,pages}=listing||await japaneseListing(set.marketSource,env);
 const setCards=cards.filter(c=>c.setId===set.id&&c.eligible),{matches,unmatched}=matchJapaneseListing(rows,setCards),now=new Date().toISOString(),cached=await cachedMarketsFor(db,[...matches.keys()]),markets={},sources={};
 const statements=[];
 for(const [id,row] of matches){
  const card=cardById.get(id),url='https://www.pricecharting.com'+row.path;
  statements.push(db.prepare('INSERT INTO source_map (card_id,url,product_id,name,rule,map_version,mapped_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(card_id) DO UPDATE SET url=excluded.url,product_id=excluded.product_id,name=excluded.name,rule=excluded.rule,map_version=excluded.map_version,mapped_at=excluded.mapped_at').bind(id,url,row.productId,row.name,row.rule,JA_MAP_VERSION,now));
  applySource(card,{url,product_id:row.productId,name:row.name,image:row.image});sources[id]={source:url,name:row.name,image:card.imageFromGuide?card.image:null};
  const g=listingGuide(row,card,now);if(!Object.keys(g.guide).length)continue;
  const m=mergeMarket(mergeMarket(snapshots[id],cached[id]),g);markets[id]=m;
  statements.push(cacheStatement(db,id,m));
  await logCapture(db,env,ctx,card,g);
 }
 if(statements.length)await db.batch(statements);
 return {mapped:matches.size,total:setCards.length,unmatched,pages,sources,markets:Object.fromEntries(Object.entries(markets).map(([id,m])=>[id,lightMarket(m)]))};
}
const marketStatement=(db,card,market)=>cacheStatement(db,card.id,market);
async function saveMarket(db,card,market){await marketStatement(db,card,market).run();}
// Read one card's page, merge it with what is saved and store the price and its observation rows in one
// transaction. Only this card's cached record is read. If the observation rows cannot be written,
// the price is still saved (as logCapture does).
async function captureCard(db,env,ctx,card,html){
 const live=parseMarket(html,card),market=mergeMarket(mergeMarket(snapshots[card.id],await cachedMarket(db,card.id)),live),save=marketStatement(db,card,market);
 let observed=null;try{observed=observationStatements(db,card,live);}catch(e){console.error('Observation log:',e.message);ctx?.waitUntil?.(reportError(env,e,{source:'observations'}));}
 if(!observed){await save.run();return market;}
 try{await db.batch([save,...observed.statements]);}
 catch(e){console.error('Observation log:',e.message);ctx?.waitUntil?.(reportError(env,e,{source:'observations'}));await save.run();}
 return market;
}
async function input(request){if(!request.headers.get('Content-Type')?.includes('application/json'))throw new Error('Send JSON data.');const raw=await request.text();if(raw.length>8192)throw new Error('The request was too large.');const body=JSON.parse(raw);if(!isPlainObject(body))throw new Error('Send a JSON object.');return body;}
export async function readSettings(db,user){const row=await db.prepare('SELECT payload FROM alert_settings WHERE user_id = ?').bind(user).first();return normalizeSettings(row?JSON.parse(row.payload):DEFAULT_SETTINGS);}
async function writeSettings(db,user,settings){await db.prepare('INSERT INTO alert_settings (user_id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(user,JSON.stringify(settings),new Date().toISOString()).run();}
// Market-wide views (movers, investments) are recomputed only when saved market data changes.
const insightMemo=new Map();
async function insight(db,key,compute){
 const sig=await db.prepare('SELECT COUNT(*) AS n, MAX(fetched_at) AS t FROM market_cache').first();
 const stamp=key+'|'+(sig?.n||0)+'|'+(sig?.t||'')+'|'+new Date().toISOString().slice(0,10);
 if(!insightMemo.has(stamp)){
  for(const k of insightMemo.keys())if(k.startsWith(key+'|'))insightMemo.delete(k);
  // The pending calculation is memoised, so simultaneous requests share one run. A failed run is forgotten.
  insightMemo.set(stamp,(async()=>{const cached=await cachedMarkets(db);return compute(cards.map(c=>[c,cached[c.id]?mergeMarket(snapshots[c.id],cached[c.id]):snapshots[c.id]]));})().catch(e=>{insightMemo.delete(stamp);throw e;}));
 }
 return insightMemo.get(stamp);
}
// Languages are never mixed: a Japanese card is scored, ranked and compared only against other
// Japanese cards (prices, demand and PSA gem rates differ a lot from English printings).
const LANGUAGES=['en','ja'],langOf=c=>c.lang||'en';
const inLanguage=(entries,lang)=>entries.filter(([card])=>langOf(card)===lang);
function insightLanguage(url){const raw=url.searchParams.get('lang');return raw==null?'en':LANGUAGES.includes(raw)?raw:null;}
const scoreTable=db=>insight(db,'scores',entries=>{
 const parts=LANGUAGES.map(lang=>investmentScores(inLanguage(entries,lang)));
 return {checkedAt:parts.map(p=>p.checkedAt).filter(Boolean).sort().at(-1)||null,grades:parts[0].grades,scores:Object.assign({},...parts.map(p=>p.scores)),full:new Map(parts.flatMap(p=>[...p.full]))};
});
// Research cache keys carry the model version, cost profile, horizon and bundled dataset revision;
// the market-cache count, newest capture and day are added by insight().
const RELEASE=Object.fromEntries(sets.map(s=>[s.id,s.release]));
const DATASET_REVISION=observedAt+'|'+cards.length;
// ---------- Light records ----------
// The catalog list needs only each card's guide prices and recent sales (lightMarket), so a light copy
// is saved beside every record. light_key ties it to the record it was made from (bundled dataset,
// capture time and payload size): a record rewritten without it is rebuilt on the next read, never trusted.
const LIGHT_REV='light-1|'+DATASET_REVISION,LIGHT_DAYS=400;
// Every sale is kept in the saved copy; the catalog trims to the last LIGHT_DAYS when it reads.
const lightOf=(id,market)=>JSON.stringify(lightMarket(mergeMarket(snapshots[id],market),0));
function cacheStatement(db,id,market){
 const payload=JSON.stringify(market);
 return db.prepare("INSERT INTO market_cache (card_id,payload,fetched_at,light,light_key) VALUES (?,?,?,?,?||'|'||?||'|'||octet_length(?)) ON CONFLICT(card_id) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,light=excluded.light,light_key=excluded.light_key").bind(id,payload,market.observedAt,lightOf(id,market),LIGHT_REV,market.observedAt,payload);
}
// Databases made before light records and sweeps existed get the new columns and table once. The trigger clears the light
// copy whenever a record is rewritten without one (an import tool, an older build).
const columnsReady=new WeakMap();
function ensureColumns(db){
 if(!columnsReady.has(db))columnsReady.set(db,(async()=>{
  try{await db.prepare('SELECT light,light_key FROM market_cache LIMIT 0').all();}
  catch{for(const name of ['light','light_key'])await db.prepare(`ALTER TABLE market_cache ADD COLUMN ${name} TEXT`).run().catch(()=>{});}
  await db.prepare('CREATE TABLE IF NOT EXISTS set_sweeps (set_id TEXT PRIMARY KEY NOT NULL, swept_at TEXT NOT NULL, pages INTEGER, priced INTEGER, wanted INTEGER)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS nightly_runs (day TEXT PRIMARY KEY NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, summary TEXT)').run();
  for(const sql of METRIC_TABLES)await db.prepare(sql).run();
  await db.prepare('CREATE TRIGGER IF NOT EXISTS market_cache_light AFTER UPDATE OF payload ON market_cache WHEN NEW.light_key IS OLD.light_key BEGIN UPDATE market_cache SET light = NULL, light_key = NULL WHERE card_id = NEW.card_id; END').run();
 })().catch(e=>{columnsReady.delete(db);throw e;}));
 return columnsReady.get(db);
}
const snapshotLight=new Map();
const trimLight=(light,since)=>light&&{...light,s:(light.s||[]).filter(x=>x[0]>=since)};
// Light records for every card with market data. Only records whose light copy is missing or out of
// date are parsed in full, and their light copy is saved for next time.
async function catalogMarkets(db,now=Date.now()){
 const since=new Date(now-LIGHT_DAYS*86400000).toISOString().slice(0,10),markets={},repairs=[];
 const rows=(await db.prepare("SELECT card_id,fetched_at,octet_length(payload) AS size,light,CASE WHEN light_key = ?||'|'||fetched_at||'|'||octet_length(payload) THEN NULL ELSE payload END AS payload FROM market_cache").bind(LIGHT_REV).all()).results||[];
 for(const row of rows){
  let text=row.light;
  if(row.payload!=null){text=lightOf(row.card_id,JSON.parse(row.payload));repairs.push(db.prepare("UPDATE market_cache SET light = ?, light_key = ?||'|'||fetched_at||'|'||octet_length(payload) WHERE card_id = ? AND fetched_at = ? AND octet_length(payload) = ?").bind(text,LIGHT_REV,row.card_id,row.fetched_at,row.size));}
  const light=trimLight(JSON.parse(text),since);if(light)markets[row.card_id]=light;
 }
 for(const id of Object.keys(snapshots)){
  if(id in markets)continue;
  if(!snapshotLight.has(id))snapshotLight.set(id,lightMarket(snapshots[id],0));
  const light=trimLight(snapshotLight.get(id),since);if(light)markets[id]=light;
 }
 for(let i=0;i<repairs.length;i+=200)await db.batch(repairs.slice(i,i+200)).catch(e=>console.error('Light records:',e.message));
 return markets;
}
// The research rank is a frozen model fit on English data. Japanese cards get their own table (ranked
// only against Japanese cards) when FUTURESIGHT_JA_RESEARCH=shadow; by default English only.
const researchFor=(db,mode,langs=['en'])=>insight(db,['research',modelVersion(),mode,COST_PROFILE_VERSION,'h12',DATASET_REVISION,langs.join('+')].join(':'),entries=>mergeInvestmentTables(langs.map(lang=>investmentTable(inLanguage(entries,lang),{release:RELEASE,mode,lang}))));
// Shadow evaluation: archive both systems' outputs once per model and day, before outcomes exist.
const archived=new Set();
async function archiveOnce(db,env,ctx,merged){
 for(const table of merged.parts||[merged])await archivePart(db,env,ctx,table);
}
async function archivePart(db,env,ctx,table){
 const key=table.modelVersion+'|'+table.asOf.slice(0,10);if(archived.has(key))return;archived.add(key);
 const task=(async()=>{
  const seen=await db.prepare('SELECT 1 AS x FROM score_observations WHERE model_version = ? AND as_of = ? LIMIT 1').bind(table.modelVersion,table.asOf.slice(0,10)).first();
  if(!seen)await archiveScores(db,table,await scoreTable(db),{runInfo:{datasetRevision:DATASET_REVISION}});
 })().catch(e=>{archived.delete(key);console.error('Score archive:',e.message);return reportError(env,e,{source:'archive'});});
 if(ctx?.waitUntil)ctx.waitUntil(task);else await task;
}
function marketInvestment(table,card,market){
 if(!table)return null;
 const out={};for(const g of ['raw','psa9','psa10']){const a=analyze(market,g);out[g]=investmentView(table,card.id,g,{reference:a.fair,referenceLabel:a.fair?a.priceLabel:null});}
 return out;
}
// ---------- Update sales as a server job ----------
// Node only: a Worker request cannot outlive its response, so there env.BACKGROUND_JOBS is unset and
// the page falls back to /api/research batches. One job runs at a time and is shared by every account.
let updateJob=null;
const FRESH_HOURS=6,RATE_DEFAULT=1;
const inUpdateScope=(card,scopes,langs)=>card.eligible&&card.source&&langs.includes(langOf(card))&&scopes.some(sc=>sc==='all'||(sc.startsWith('era:')?card.series===sc.slice(4):card.setId===sc));
const validScope=sc=>typeof sc==='string'&&(sc==='all'||(sc.startsWith('era:')&&series.some(s=>s.id===sc.slice(4)))||sets.some(s=>s.id===sc));
// The same order as the page used: cards read in the last 6 hours are skipped, never-read cards come
// first (most valuable first), then the oldest reads. Only two small fields of each saved record are read.
async function updateQueue(db,scopes,langs,now=Date.now()){
 const inScope=cards.filter(c=>inUpdateScope(c,scopes,langs));
 const saved=new Map(((await db.prepare("SELECT card_id,json_extract(payload,'$.research.checkedAt') AS checked,json_extract(payload,'$.guide') AS guide FROM market_cache").all()).results||[]).map(r=>[r.card_id,r]));
 const rows=inScope.map(card=>{
  const row=saved.get(card.id),snap=snapshots[card.id];let guide=snap?.guide||{};
  if(row?.guide)try{guide={...guide,...JSON.parse(row.guide)};}catch{}
  return {card,checked:Date.parse(row?.checked||snap?.research?.checkedAt||'')||0,value:Math.max(guide.psa10||0,guide.grade9||0,guide.raw||0)};
 });
 const queue=rows.filter(r=>now-r.checked>=FRESH_HOURS*3600000).sort((a,b)=>(a.checked?1:0)-(b.checked?1:0)||a.checked-b.checked||b.value-a.value);
 return {queue:queue.map(r=>r.card),grand:inScope.length};
}
// Light records for the cards a job saved, read 100 at a time (D1 allows 100 bound values per query).
async function lightMarkets(db,ids){
 const out={};
 for(let i=0;i<ids.length;i+=100){
  const part=ids.slice(i,i+100),r=await db.prepare(`SELECT card_id,payload FROM market_cache WHERE card_id IN (${part.map(()=>'?').join(',')})`).bind(...part).all();
  for(const row of r.results||[])out[row.card_id]=lightMarket(mergeMarket(snapshots[row.card_id],JSON.parse(row.payload)));
 }
 return out;
}
async function updateRoute(request,env,ctx,db,url,user){
 if(!env.BACKGROUND_JOBS)return json({job:null,unavailable:true});
 if(request.method==='GET'){
  const status=jobStatus(updateJob,url.searchParams.get('since'));
  if(status)status.markets=await lightMarkets(db,status.changed);
  return json({job:status,mine:!!updateJob&&updateJob.owner===user});
 }
 if(request.method==='DELETE'){
  if(updateJob?.state==='running'&&updateJob.owner!==user)return json({error:'Only the account that started this update can stop it.'},403);
  cancelJob(updateJob);return json({job:jobStatus(updateJob,0,0)});
 }
 if(request.method!=='POST')return json({error:'Unsupported request.'},405);
 // Someone else's update is already running: follow it instead of starting another.
 if(updateJob?.state==='running')return json({job:jobStatus(updateJob,0,0),joined:true,mine:updateJob.owner===user});
 const body=await input(request);
 const scopes=body.scopes,langs=body.langs??LANGUAGES;
 if(!Array.isArray(scopes)||!scopes.length||scopes.length>40||!scopes.every(validScope))return json({error:'Choose the sets or eras to update.'},400);
 if(!Array.isArray(langs)||!langs.length||!langs.every(l=>LANGUAGES.includes(l)))return json({error:'Choose English or Japanese.'},400);
 if(env.NETWORK_DISABLED)return json({job:null,warning:'Live sales refresh is unavailable in this workspace. Showing the last researched sales.'});
 const {queue,grand}=await updateQueue(db,scopes,langs);
 if(!queue.length)return json({job:null,total:0,grand});
 const job=startUpdateJob(env,db,queue,{owner:user,info:{grand,skipped:grand-queue.length}});
 return json({job:jobStatus(job,0,0),mine:true});
}
function startUpdateJob(env,db,queue,{owner,info}){
 const job=updateJob=startJob(queue,{owner,pace:sourcePace(db,env),fetchPage:page=>sourceFetch(page,env),capture:(card,html)=>captureCard(db,env,null,card,html),info});
 job.finished.then(()=>{console.log(`Update sales ${job.state}: ${job.updated} of ${job.total} cards saved, ${job.failures.size} failed, in ${Math.round((Date.parse(job.finishedAt)-Date.parse(job.startedAt))/60000)} min.`);if(job.updated&&!job.nightly)queueRebuild(env);});
 return job;
}
// Every job that reads the price source shares one pace per database, so an update and a sweep
// running together still stay within FUTURESIGHT_UPDATE_RATE pages a second.
const paces=new WeakMap();
function sourcePace(db,env){
 const configured=Number(env.FUTURESIGHT_UPDATE_RATE),rate=configured>0?Math.min(10,configured):RATE_DEFAULT;
 let p=paces.get(db);if(!p||p.max!==rate){p=pacer({rate});p.max=rate;paces.set(db,p);}
 return p;
}
// ---------- Guide-price sweep ----------
// One request per listing page instead of one per card: a set's PriceCharting listing shows the
// ungraded, Grade 9 and PSA 10 guide price of every product, about 150 rows a page. A few hundred
// pages cover every set. Sales history and population still need each card's own page (Update sales).
let sweepJob=null;
const SWEEP_FRESH_HOURS=20;
// Save guide-only captures: each card's merged record and its observation rows in one transaction,
// 50 cards per batch.
async function saveGuides(db,env,ctx,guides){
 const ids=Object.keys(guides),cached=await cachedMarketsFor(db,ids),markets={},groups=[];
 for(const id of ids){
  const card=cardById.get(id),m=mergeMarket(mergeMarket(snapshots[id],cached[id]),guides[id]),list=[cacheStatement(db,id,m)];markets[id]=m;
  try{const o=observationStatements(db,card,guides[id]);if(o)list.push(...o.statements);}catch(e){console.error('Observation log:',e.message);ctx?.waitUntil?.(reportError(env,e,{source:'observations'}));}
  groups.push(list);
 }
 for(let i=0;i<groups.length;i+=50)await db.batch(groups.slice(i,i+50).flat());
 return markets;
}
async function recordSweeps(db,rows){
 const now=new Date().toISOString();
 if(rows.length)await db.batch(rows.map(([id,pages,priced,wanted])=>db.prepare('INSERT INTO set_sweeps (set_id,swept_at,pages,priced,wanted) VALUES (?,?,?,?,?) ON CONFLICT(set_id) DO UPDATE SET swept_at=excluded.swept_at,pages=excluded.pages,priced=excluded.priced,wanted=excluded.wanted').bind(id,now,pages,priced,wanted)));
}
// English sets sharing one listing (the promo listing, a set and its trainer gallery) are read together,
// page by page, until every rare card is found or the listing ends. With a pace (the sweep job) each page
// waits its turn and a busy answer is left to the job to retry; without one (a single set from the page)
// pages are read with a short pause and retried here.
async function sweepEnglish(db,env,ctx,group,{pace=null,first=null}={}){
 const bySet=group.map(set=>[set,cards.filter(c=>c.setId===set.id&&c.eligible&&c.source)]),wanted=bySet.reduce((n,[,list])=>n+list.length,0),guides={},now=new Date().toISOString();
 let cursor=null,pages=0;const seen=new Set();
 for(;;){
  const url=listingPageUrl(group[0].marketSource,cursor);let html;
  if(!pages&&first!=null)html=first;
  else if(pace){await pace.wait();html=await sourceFetch(url,env);pace.ok();}
  else{if(pages)await pause(env.LISTING_PAUSE_MS??800);html=await listingPage(url,env);}
  pages++;
  for(const [,list] of bySet)for(const [id,g] of Object.entries(parseSetPage(html,list,now).guides))guides[id]??=g;
  cursor=listingCursor(html);
  if(!cursor||seen.has(cursor)||pages>=40||Object.keys(guides).length>=wanted)break;
  seen.add(cursor);
 }
 if(!Object.keys(guides).length)throw new Error('The set price guide could not be read.');
 const markets=await saveGuides(db,env,ctx,guides);
 await recordSweeps(db,bySet.map(([set,list])=>[set.id,pages,list.filter(c=>guides[c.id]).length,list.length]));
 return {pages,wanted,priced:Object.keys(guides).length,markets};
}
async function sweepJapanese(db,env,ctx,group,{pace=null,first=null}={}){
 const listing=await japaneseListing(group[0].marketSource,env,{pace,first}),rows=[];let priced=0,wanted=0;
 for(const set of group){const r=await mapJapaneseSet(db,env,ctx,set,{listing}),n=Object.keys(r.markets||{}).length;priced+=n;wanted+=r.total||0;rows.push([set.id,listing.pages,n,r.total||0]);}
 await recordSweeps(db,rows);
 return {pages:listing.pages,wanted,priced};
}
// Listings to read: one per source page, with every set in scope that uses it.
const inSweepScope=(set,scopes)=>scopes.some(sc=>sc==='all'||(sc.startsWith('era:')?set.series===sc.slice(4):set.id===sc));
function sweepGroups(langs,scopes=['all']){
 const groups=new Map();
 for(const set of sets){
  const lang=set.lang||'en';if(!set.marketSource||!langs.includes(lang)||!inSweepScope(set,scopes))continue;
  if(!cards.some(c=>c.setId===set.id&&c.eligible&&(lang==='ja'||c.source)))continue;
  const g=groups.get(set.marketSource)||groups.set(set.marketSource,{id:set.id,lang,sets:[]}).get(set.marketSource);g.sets.push(set);
 }
 return [...groups.values()].map(g=>({...g,id:g.sets.map(s=>s.id).join('+'),source:g.lang==='ja'?g.sets[0].marketSource+'?view=table':g.sets[0].marketSource}));
}
// Listings swept in the last SWEEP_FRESH_HOURS are skipped unless forced; the oldest go first.
async function sweepQueue(db,langs,{scopes=['all'],force=false,now=Date.now()}={}){
 const swept=new Map(((await db.prepare('SELECT set_id,swept_at FROM set_sweeps').all()).results||[]).map(r=>[r.set_id,Date.parse(r.swept_at)||0]));
 const groups=sweepGroups(langs,scopes),last=g=>Math.min(...g.sets.map(s=>swept.get(s.id)||0));
 const queue=groups.filter(g=>force||now-last(g)>=SWEEP_FRESH_HOURS*3600000).sort((a,b)=>last(a)-last(b)||a.id.localeCompare(b.id));
 return {queue,grand:groups.length};
}
// Starts the sweep, or returns the one already running. Also used by the nightly schedule.
export async function startSweep(env,{langs=LANGUAGES,scopes=['all'],force=false,owner=null}={}){
 const db=database(env);await ensureColumns(db);await ensureSourceMap(db).catch(e=>console.error('Source map:',e.message));
 if(sweepJob?.state==='running')return {job:sweepJob,joined:true};
 if(env.NETWORK_DISABLED)return {job:null,warning:'Live price sweeps are unavailable in this workspace.'};
 const {queue,grand}=await sweepQueue(db,langs,{scopes,force});
 if(!queue.length)return {job:null,grand};
 const pace=sourcePace(db,env);
 const job=sweepJob=startJob(queue,{owner,pace,concurrency:2,fetchPage:url=>sourceFetch(url,env),capture:(group,html)=>(group.lang==='ja'?sweepJapanese:sweepEnglish)(db,env,null,group.sets,{pace,first:html}),info:{grand,skipped:grand-queue.length}});
 job.finished.then(()=>{console.log(`Guide sweep ${job.state}: ${job.updated} of ${job.total} listings read, ${job.failures.size} failed, in ${Math.round((Date.parse(job.finishedAt)-Date.parse(job.startedAt))/60000)} min.`);if(job.updated&&owner!=='nightly')queueRebuild(env);});
 return {job};
}
// When each set's guide prices were last swept.
async function sweepSummary(db){
 const r=(await db.prepare('SELECT COUNT(*) AS sets, MIN(swept_at) AS oldest, MAX(swept_at) AS newest, SUM(priced) AS priced FROM set_sweeps').first())||{};
 return {sets:r.sets||0,oldest:r.oldest||null,newest:r.newest||null,priced:r.priced||0,listings:sweepGroups(LANGUAGES).length};
}
async function sweepRoute(request,env,db,url,user){
 if(!env.BACKGROUND_JOBS)return json({job:null,unavailable:true,summary:await sweepSummary(db)});
 const mine=()=>!!sweepJob&&sweepJob.owner===user;
 if(request.method==='GET'){
  const status=jobStatus(sweepJob,url.searchParams.get('since'),20);
  if(status){const ids=new Set(status.changed.flatMap(id=>id.split('+')));status.markets=await lightMarkets(db,cards.filter(c=>ids.has(c.setId)).map(c=>c.id));}
  return json({job:status,mine:mine(),summary:await sweepSummary(db)});
 }
 if(request.method==='DELETE'){
  if(sweepJob?.state==='running'&&sweepJob.owner!==user)return json({error:'Only the account that started this sweep can stop it.'},403);
  cancelJob(sweepJob);return json({job:jobStatus(sweepJob,0,0)});
 }
 if(request.method!=='POST')return json({error:'Unsupported request.'},405);
 const body=await input(request),langs=body.langs??LANGUAGES,scopes=body.scopes??['all'];
 if(!Array.isArray(scopes)||!scopes.length||scopes.length>40||!scopes.every(validScope))return json({error:'Choose the sets or eras to sweep.'},400);
 if(!Array.isArray(langs)||!langs.length||!langs.every(l=>LANGUAGES.includes(l)))return json({error:'Choose English or Japanese.'},400);
 const r=await startSweep(env,{langs,scopes,force:body.force===true,owner:user});
 return json({job:jobStatus(r.job,0,0),joined:!!r.joined,mine:mine(),grand:r.grand??null,warning:r.warning||null});
}
// ---------- Metrics ----------
// A rebuild reads every saved record (metrics-store.mjs). One runs at a time; a request made while one
// runs starts another once it ends, so the newest prices are always included. Node only.
let rebuildAgain=false;
export function queueRebuild(env){
 if(!env.BACKGROUND_JOBS)return null;
 const db=database(env);
 if(rebuildState().running){rebuildAgain=true;return null;}
 const p=ensureColumns(db).then(()=>rebuildMetrics(db,{cards,snapshots,log:m=>console.log(m)}));
 p.then(r=>console.log(`Metrics rebuilt: ${r.cards} cards, ${r.indices} indices, ${r.points} new daily prices, in ${Math.round(r.ms/1000)} s.`),e=>{console.error('Metrics:',e.message);reportError(env,e,{source:'metrics'});})
  .finally(()=>{if(rebuildAgain){rebuildAgain=false;queueRebuild(env);}});
 return p;
}
const INDEX_KINDS=['all','top100','era','set','char','tier','artist'];
// The last 12 month ends before `asOf`, then `asOf` itself: the points of a sparkline.
function sparkDays(asOf){const t=dayNum(asOf),d=new Date(t*86400000),out=[];for(let k=12;k>=1;k--)out.push(dayStr(Math.floor(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-k+1,0)/86400000)));out.push(asOf);return [...new Set(out)];}
// Each set's index by months since release, rebased to 100 at its first month, and the era's median path.
function lifecycle(histories,lang,era){
 const curves=[];
 for(const set of sets){
  if((set.lang||'en')!==lang||(era&&set.series!==era))continue;const h=histories[set.id];if(!h?.length)continue;
  const [ry,rm]=set.release.split('-').map(Number),age=ym=>{const [y,m]=ym.split('-').map(Number);return (y-ry)*12+(m-rm);};
  const points=h.map(([ym,level,eq])=>[age(ym),level,eq]).filter(p=>p[0]>=0);if(points.length<2)continue;
  const base=points[0];curves.push({set_id:set.id,name:set.name,release:set.release,series:set.series,start:base[0],points:points.map(([m,l,e])=>[m,Math.round(l/base[1]*1000)/10,Math.round(e/base[2]*1000)/10])});
 }
 // Sets whose index starts within 3 months of release, so their paths begin at the same point.
 const early=curves.filter(c=>c.start<=3),typical=[];
 for(let m=0;m<=120;m++){const v=early.map(c=>c.points.find(p=>p[0]===m)?.[2]).filter(x=>x!=null).sort((a,b)=>a-b);if(v.length>=3)typical.push([m,v[Math.floor(v.length/2)],v.length]);}
 return {curves,typical};
}
// Cards in an index: from the catalog, except Top 100 which is today's most valuable cards.
async function indexMembers(db,id,grade){
 const [lang,kind]=id.split(':');
 if(kind==='top100')return ((await db.prepare('SELECT card_id FROM card_metrics WHERE lang = ? AND grade = ? AND price > 0 ORDER BY price DESC LIMIT 100').bind(lang,grade).all()).results||[]).map(r=>r.card_id);
 return cards.filter(c=>c.eligible&&indexKeysOf(c,cardById).includes(id)).map(c=>c.id);
}
// ---------- Nightly ----------
// Card pages (sales history and PSA population) are read on a schedule by tier; guide prices for every
// card come from the sweep each night. Watched and owned cards and cards worth $1,000+ are read daily,
// $100–$1,000 weekly, the rest monthly. FUTURESIGHT_NIGHTLY_PAGES caps one night's card pages.
export const REFRESH_TIERS=[['daily',1,'Watched, owned, or worth $1,000+'],['weekly',7,'Worth $100–$1,000'],['monthly',30,'Under $100']];
const NIGHTLY_PAGES=1500,TIER_SLACK_HOURS=4;
async function tieredQueue(db,now=Date.now()){
 const keep=new Set([...((await db.prepare('SELECT DISTINCT card_id FROM watchlist').all()).results||[]),...((await db.prepare('SELECT DISTINCT card_id FROM collection').all()).results||[])].map(r=>r.card_id));
 const values=new Map(((await db.prepare('SELECT card_id,MAX(price) AS value FROM card_metrics GROUP BY card_id').all()).results||[]).map(r=>[r.card_id,r.value]));
 const saved=new Map(((await db.prepare("SELECT card_id,json_extract(payload,'$.research.checkedAt') AS checked,json_extract(payload,'$.guide') AS guide FROM market_cache").all()).results||[]).map(r=>[r.card_id,r]));
 const tiers=Object.fromEntries(REFRESH_TIERS.map(([t])=>[t,{cards:0,due:0}])),rows=[];
 for(const card of cards){
  if(!card.eligible||!card.source)continue;
  const row=saved.get(card.id),snap=snapshots[card.id];let guide=snap?.guide||{};
  if(row?.guide)try{guide={...guide,...JSON.parse(row.guide)};}catch{}
  const value=values.get(card.id)??Math.max(guide.psa10||0,guide.grade9||0,guide.raw||0),checked=Date.parse(row?.checked||snap?.research?.checkedAt||'')||0;
  const rank=keep.has(card.id)||value>=1000?0:value>=100?1:2,[tier,days]=REFRESH_TIERS[rank];
  tiers[tier].cards++;
  if(now-checked<days*86400000-TIER_SLACK_HOURS*3600000)continue;
  tiers[tier].due++;rows.push({card,rank,checked,value});
 }
 rows.sort((a,b)=>a.rank-b.rank||(a.checked?1:0)-(b.checked?1:0)||a.checked-b.checked||b.value-a.value);
 return {queue:rows.map(r=>r.card),tiers};
}
const localDay=(d=new Date())=>d.toLocaleDateString('en-CA');
// Sweep every listing, then read the card pages that are due, then rebuild the metrics. Runs once a day.
export async function runNightly(env,{force=false}={}){
 const db=database(env);await ensureColumns(db);await ensureSourceMap(db).catch(()=>{});
 const day=localDay(),started=new Date().toISOString();
 if(!force&&await db.prepare('SELECT 1 AS x FROM nightly_runs WHERE day = ?').bind(day).first())return null;
 await db.prepare('INSERT INTO nightly_runs (day,started_at) VALUES (?,?) ON CONFLICT(day) DO UPDATE SET started_at=excluded.started_at,finished_at=NULL,summary=NULL').bind(day,started).run();
 const summary={};
 try{
  const sweep=await startSweep(env,{owner:'nightly'});if(sweep.job){await sweep.job.finished;summary.sweep={listings:sweep.job.updated,failed:sweep.job.failures.size};}
  if(updateJob?.state==='running')await updateJob.finished;
  const {queue,tiers}=await tieredQueue(db),configured=Number(env.FUTURESIGHT_NIGHTLY_PAGES),budget=configured>0?configured:NIGHTLY_PAGES;
  summary.tiers=tiers;
  if(queue.length&&!env.NETWORK_DISABLED){const job=startUpdateJob(env,db,queue.slice(0,budget),{owner:'nightly',info:{grand:queue.length,skipped:Math.max(0,queue.length-budget)}});job.nightly=true;await job.finished;summary.pages={read:job.updated,failed:job.failures.size,due:queue.length};}
  const rebuilt=await queueRebuild(env);if(rebuilt)summary.metrics={cards:rebuilt.cards,indices:rebuilt.indices};
 }catch(e){summary.error=e.message;reportError(env,e,{source:'nightly'});}
 await db.prepare('UPDATE nightly_runs SET finished_at = ?, summary = ? WHERE day = ?').bind(new Date().toISOString(),JSON.stringify(summary),day).run();
 return summary;
}
export async function fullMarket(db,id){return mergeMarket(snapshots[id],await cachedMarket(db,id))||null;}
async function alertState(db,user){
 const settings=await readSettings(db,user);
 const alerts=(await db.prepare('SELECT id,card_id,grade,listing_id,title,price,shipping,total,currency,url,image,buying_option,limit_price,limit_source,market_price,seller,listed_at,found_at,seen FROM alerts WHERE user_id = ? AND dismissed = 0 ORDER BY found_at DESC,id DESC LIMIT 200').bind(user).all()).results||[];
 const lastRun=await db.prepare('SELECT started_at,finished_at,checked,found,error FROM alert_runs WHERE user_id = ? ORDER BY id DESC LIMIT 1').bind(user).first();
 return {settings:publicSettings(settings),alerts,unseen:alerts.filter(a=>!a.seen).length,lastRun:lastRun||null,live:hasListingAccess(settings)&&settings.enabled};
}
export async function scanForUser(env,user,options={}){
 const db=database(env),settings=await readSettings(db,user);
 if(env.NETWORK_DISABLED)return {checked:0,found:[],skipped:[],error:'Live listing scans are unavailable in this workspace.'};
 const markets=await cachedMarketsFor(db,(await readWatch(db,user)).map(w=>w.card_id));
 return runScan({db,user,cards,marketFor:id=>mergeMarket(snapshots[id],markets[id]),settings,fetchImpl:env.fetch||fetch,...options});
}
export async function api(request,env,ctx){
 if(env.DB)await ensureSourceMap(database(env)).catch(e=>console.error('Source map:',e.message));
 const url=new URL(request.url),path=url.pathname;
 try{
  const db=database(env),user=env.LOCAL_USER_ID||request.headers.get('oai-authenticated-user-id');
  await ensureColumns(db);
  if(request.method!=='GET' && request.method!=='HEAD'){
   const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'This action must be made from your FutureSight page.'},403);
   if(!user)return json({error:'Sign in to save your watchlist.'},401);
  }
  if(path==='/api/catalog' && request.method==='GET'){
   return json({sets,series,cards,markets:await catalogMarkets(db),local:!!env.LOCAL_USER_ID});
  }
  if(path==='/api/watchlist'){
   if(!user)return json({error:'Sign in to view your watchlist.'},401);
   if(['POST','DELETE'].includes(request.method)){
    let body;try{body=await input(request);}catch{return json({error:'The watchlist request was invalid.'},400);}
    const {card_id,grade,target}=body;
    const problem=shapeError(body,[['card_id',id=>cardById.has(id),'Choose a card from the catalog and a supported grade.'],['grade',oneOf('raw','psa9','psa10'),'Choose a card from the catalog and a supported grade.'],['target',optionalPrice(1000000),'Enter a price between $0.01 and $1,000,000.']]);
    if(problem)return json({error:problem},400);
    if(request.method==='DELETE')await db.prepare('DELETE FROM watchlist WHERE user_id = ? AND card_id = ? AND grade = ?').bind(user,card_id,grade).run();
    else await db.prepare('INSERT INTO watchlist (user_id,card_id,grade,target,created_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,card_id,grade) DO UPDATE SET target=excluded.target').bind(user,card_id,grade,target??null,new Date().toISOString()).run();
   }else if(request.method!=='GET')return json({error:'Method not allowed.'},405);
   return json({watchlist:await readWatch(db,user)});
  }
  if(path==='/api/collection'){
   if(!user)return json({error:'Sign in to view your Dex.'},401);
   if(['POST','PUT'].includes(request.method)){
    let body;try{body=await input(request);}catch{return json({error:'The Dex request was invalid.'},400);}
    let id=null,current=null;
    if(request.method==='PUT'){
     id=Number(body.id);if(!Number.isInteger(id))return json({error:'Choose a Dex entry to update.'},400);
     current=await db.prepare('SELECT purchase_date FROM collection WHERE id = ? AND user_id = ?').bind(id,user).first();
     if(!current)return json({error:'That Dex entry was not found.'},404);
    }
    const {errors,entry}=validateEntry(body,{cards,existingPurchaseDate:current?.purchase_date??null});if(errors.length)return json({error:errors[0],errors},400);
    const now=new Date().toISOString();
    if(request.method==='POST')await db.prepare('INSERT INTO collection (user_id,card_id,grade,quantity,purchase_price,purchase_date,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(user,entry.card_id,entry.grade,entry.quantity,entry.purchase_price,entry.purchase_date,entry.notes,now,now).run();
    else await db.prepare('UPDATE collection SET card_id = ?, grade = ?, quantity = ?, purchase_price = ?, purchase_date = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(entry.card_id,entry.grade,entry.quantity,entry.purchase_price,entry.purchase_date,entry.notes,now,id,user).run();
   }else if(request.method==='DELETE'){
    let body;try{body=await input(request);}catch{return json({error:'The Dex request was invalid.'},400);}
    await db.prepare('DELETE FROM collection WHERE id = ? AND user_id = ?').bind(Number(body.id),user).run();
   }else if(request.method!=='GET')return json({error:'Method not allowed.'},405);
   const collection=await readCollection(db,user),markets={};
   if(url.searchParams.get('markets')!=='0')for(const id of new Set(collection.map(e=>e.card_id)))markets[id]=await fullMarket(db,id);
   return json({collection,markets});
  }
  if(path==='/api/alerts'){
   if(!user)return json({error:'Sign in to view alerts.'},401);
   if(request.method==='PATCH'){
    let body;try{body=await input(request);}catch{return json({error:'The alert request was invalid.'},400);}
    if(body.all==='seen')await db.prepare('UPDATE alerts SET seen = 1 WHERE user_id = ?').bind(user).run();
    else if(Number.isInteger(body.id)){if(body.dismissed)await db.prepare('UPDATE alerts SET dismissed = 1, seen = 1 WHERE id = ? AND user_id = ?').bind(body.id,user).run();else await db.prepare('UPDATE alerts SET seen = 1 WHERE id = ? AND user_id = ?').bind(body.id,user).run();}
    else return json({error:'Choose an alert.'},400);
   }else if(request.method!=='GET')return json({error:'Method not allowed.'},405);
   const state=await alertState(db,user),watch=await readWatch(db,user),settings=await readSettings(db,user);
   const cached=await cachedMarketsFor(db,watch.map(w=>w.card_id));
   const affiliate=affiliateOptions(env);
   const searches=watch.map(w=>{const card=cardById.get(w.card_id);if(!card)return null;const limit=alertLimit(w,mergeMarket(snapshots[w.card_id],cached[w.card_id]),settings);return {card_id:w.card_id,grade:w.grade,limit:limit?.limit??null,limit_source:limit?.source??null,query:manualSearchQuery(card,w.grade),url:ebaySearchUrl(card,w.grade,null,{auctions:settings.includeAuctions,affiliate}),limitedUrl:limit?ebaySearchUrl(card,w.grade,limit.limit,{auctions:settings.includeAuctions,affiliate}):null};}).filter(Boolean);
   return json({...state,searches,affiliate});
  }
  if(path==='/api/alerts/settings'){
   if(!user)return json({error:'Sign in to change alerts.'},401);
   if(request.method==='POST'){
    let body;try{body=await input(request);}catch{return json({error:'The settings request was invalid.'},400);}
    const {settings,errors}=updateSettings(await readSettings(db,user),body);if(errors.length)return json({error:errors[0],errors},400);
    if(settings.enabled&&!hasListingAccess(settings))return json({error:'Add credentials for the selected listing provider before turning on live alerts.'},400);
    await writeSettings(db,user,settings);
   }else if(request.method!=='GET')return json({error:'Method not allowed.'},405);
   return json({settings:publicSettings(await readSettings(db,user))});
  }
  if(path==='/api/alerts/scan'&&request.method==='POST'){
   const result=await scanForUser(env,user);
   return json({checked:result.checked,found:result.found.length,skipped:result.skipped,error:result.error,...await alertState(db,user)});
  }
  if(path==='/api/alerts/test'&&request.method==='POST'){
   if(env.NETWORK_DISABLED)return json({sent:0,error:'Notifications are unavailable in this workspace.'});
   const settings=await readSettings(db,user);if(!settings.notify.ntfy&&!settings.notify.discord)return json({error:'Add an ntfy topic or a Discord webhook first.'},400);
   const sample={card_id:'xy5-151',grade:'psa9',card_name:'Primal Groudon EX',set_name:'Primal Clash',number_label:'151/160',title:'Test alert from FutureSight',total:1500,shipping:0,limit_price:1600,market_price:1999,url:'https://www.ebay.com/'};
   const r=await sendNotifications([sample],settings,env.fetch||fetch);return json(r.sent?{sent:r.sent}:{sent:0,error:'The notification could not be delivered. Check the topic or webhook.'});
  }
  if(path==='/api/movers' && request.method==='GET'){
   const period=url.searchParams.get('period')||'week';if(!PERIODS[period])return json({error:'Choose week or month.'},400);
   const included=insightSeries(url);if(!included)return json({error:'Choose one or more supported eras.'},400);const selected=new Set(included),key=included.join(',');
   const lang=insightLanguage(url);if(!lang)return json({error:'Choose English or Japanese.'},400);
   const result=await insight(db,'movers:'+lang+':'+period+':'+key,entries=>topMovers(inLanguage(entries,lang).filter(([card])=>selected.has(card.series)),period));return json({...result,series:included,lang});
  }
  if(path==='/api/investments' && request.method==='GET'){
   const included=insightSeries(url);if(!included)return json({error:'Choose one or more supported eras.'},400);const selected=new Set(included),key=included.join(',');
   const lang=insightLanguage(url);if(!lang)return json({error:'Choose English or Japanese.'},400);
   const result=await insight(db,'investments:'+lang+':'+key,entries=>potentialInvestments(inLanguage(entries,lang).filter(([card])=>selected.has(card.series)))),mode=scoreMode(env);
   if(mode==='legacy')return json({...result,series:included,lang});
   // The shortlist and the card panel read the same research table, so they cannot disagree.
   const t=await researchFor(db,mode,researchLanguages(env)),grades={};
   for(const [g,col] of Object.entries(result.grades)){
    let removed=0;const picks=[];
    for(const p of col.picks){
     const card=cardById.get(p.card_id),v=investmentView(t,p.card_id,g,{reference:p.price,referenceLabel:p.priceLabel});
     const research=v?{rank:v.rank,evidenceStatus:v.evidenceStatus,breakEven:maxBuyPrice(p.price,DEFAULT_COSTS,0),forecast:v.forecast?{conservativeExit:v.forecast.conservativeExit,maxBuyPrice:v.forecast.maxBuyPrice}:null}:null;
     // With a validated forecast, a pick that cannot clear the hurdle at its own price is dropped.
     if(mode==='candidate'&&v?.forecast&&!(netReturn(p.price,v.forecast.conservativeExit,DEFAULT_COSTS)>DEFAULT_COSTS.hurdle)){removed++;continue;}
     if(card)picks.push({...p,research});
    }
    grades[g]={...col,picks,removedByNetReturn:removed};
   }
   return json({...result,grades,series:included,lang,research:{modelVersion:t.modelVersion,mode:t.mode,gate:t.gate}});
  }
  if(path==='/api/scores' && request.method==='GET'){
   const {checkedAt,grades,scores}=await scoreTable(db),mode=scoreMode(env);
   if(mode==='legacy')return json({checkedAt,grades,scores,research:null});
   const t=await researchFor(db,mode,researchLanguages(env));await archiveOnce(db,env,ctx,t);
   return json({checkedAt,grades,scores,research:{modelVersion:t.modelVersion,mode:t.mode,asOf:t.asOf,horizonMonths:t.horizonMonths,languages:t.languages,ranks:t.ranks,status:t.status,gate:t.gate}});
  }
  if(path==='/api/market' && request.method==='GET'){
   const card=cardById.get(url.searchParams.get('id'));if(!card)return json({error:'That card is not in the catalog.'},404);
   let market=await fullMarket(db,card.id);const mode=scoreMode(env);
   const extras=async()=>({score:(await scoreTable(db)).full.get(card.id)||null,investment:mode==='legacy'?null:marketInvestment(await researchFor(db,mode,researchLanguages(env)),card,market)});
   if(url.searchParams.get('refresh')==='1'){
    let mapping=null;
    if(card.japanese&&!card.source){try{mapping=await mapJapaneseSet(db,env,ctx,sets.find(s=>s.id===card.setId));market=await fullMarket(db,card.id);}catch(e){return json({market,refreshed:false,warning:e.message,...await extras()});}}
    if(card.japanese&&!card.source)return json({market,refreshed:false,mapping,warning:'No exact price-guide product was found for this Japanese card, so it stays unpriced.',...await extras()});
    if(!card.source)return json({market,refreshed:false,warning:card.japanese?'No exact price-guide product was found for this Japanese card.':'This card has no price source.',...await extras()});
    try{const live=parseMarket(await sourceFetch(card.source,env),card);market=mergeMarket(market,live);await saveMarket(db,card,market);await logCapture(db,env,ctx,card,live);return json({market,refreshed:true,mapping,...await extras()});}
    catch(e){return json({market,refreshed:false,mapping,warning:e.message,...await extras()});}
   }
   return json({market,refreshed:false,...await extras()});
  }
  if(path==='/api/refresh' && request.method==='POST'){
   const set=sets.find(s=>s.id===(url.searchParams.get('set')||'xy5'));
   if(!set)return json({error:'Choose a set to refresh.'},400);
   // Japanese sets: match every card to its exact product, then save those products' guide prices.
   if(set.lang==='ja'){try{const r=await mapJapaneseSet(db,env,ctx,set);return json({refreshed:r.mapped>0,count:r.mapped,...r});}catch(e){return json({refreshed:false,count:0,warning:e.message});}}
   try{
    const r=await sweepEnglish(db,env,ctx,[set]);
    return json({markets:Object.fromEntries(Object.entries(r.markets).map(([id,m])=>[id,lightMarket(m)])),refreshed:true,count:r.priced,pages:r.pages});
   }catch(e){return json({refreshed:false,warning:e.message});}
  }
  if(path==='/api/update')return await updateRoute(request,env,ctx,db,url,user);
  if(path==='/api/sweep')return await sweepRoute(request,env,db,url,user);
  if(path==='/api/metrics'&&request.method==='GET'){
   const card=cardById.get(url.searchParams.get('id'));if(!card)return json({error:'That card is not in the catalog.'},404);
   return json({card_id:card.id,grades:await cardMetrics(db,card.id),indices:indexKeysOf(card,cardById).map(id=>({id,name:indexName(id,{sets,series})})),run:await lastRun(db)});
  }
  if(path==='/api/indices'&&request.method==='GET'){
   const lang=insightLanguage(url),kind=url.searchParams.get('kind')||'set',grade=url.searchParams.get('grade')||'psa10';
   if(!lang||!INDEX_KINDS.includes(kind)||!METRIC_GRADES.includes(grade))return json({error:'Choose a language, index kind and grade.'},400);
   const run=await lastRun(db),sparks=url.searchParams.get('spark')==='1'&&run?.as_of?await indexSparks(db,{lang,kind,grade,days:sparkDays(run.as_of)}):null;
   const rows=(await indexList(db,{lang,kind,grade})).map(r=>({...r,name:indexName(r.index_id,{sets,series}),...(sparks?{spark:sparks[r.index_id]||[]}:{})}));
   return json({lang,kind,grade,rows,run});
  }
  if(path==='/api/market-overview'&&request.method==='GET'){
   const lang=insightLanguage(url),grade=url.searchParams.get('grade')||'psa10';
   if(!lang||!METRIC_GRADES.includes(grade))return json({error:'Choose a language and grade.'},400);
   const run=await lastRun(db),named=r=>({...r,name:indexName(r.index_id,{sets,series})});
   if(!run?.as_of)return json({lang,grade,run,indices:[],sets:[],breadth:null});
   const days=sparkDays(run.as_of),lists=await Promise.all(['all','top100','era','tier'].map(kind=>indexList(db,{lang,kind,grade})));
   const sparks=Object.assign({},...await Promise.all(['all','top100','era','tier'].map(kind=>indexSparks(db,{lang,kind,grade,days}))));
   const setRows=(await indexList(db,{lang,kind:'set',grade})).map(r=>{const set=sets.find(s=>s.id===r.key);return {...named(r),series:set?.series,release:set?.release};});
   return json({lang,grade,run,indices:lists.flat().map(r=>({...named(r),spark:sparks[r.index_id]||[]})),sets:setRows,breadth:await marketBreadth(db,{lang,grade})});
  }
  if(path==='/api/lifecycle'&&request.method==='GET'){
   const lang=insightLanguage(url),grade=url.searchParams.get('grade')||'psa10',era=url.searchParams.get('era')||null;
   if(!lang||!METRIC_GRADES.includes(grade)||(era&&!series.some(s=>s.id===era)))return json({error:'Choose a language, grade and era.'},400);
   return json({lang,grade,era,...lifecycle(await setHistories(db,{lang,grade}),lang,era)});
  }
  if(path==='/api/index'&&request.method==='GET'){
   const id=url.searchParams.get('id')||'',grade=url.searchParams.get('grade')||'psa10';
   if(!METRIC_GRADES.includes(grade)||!/^(?:en|ja):[a-z0-9]+:.{1,120}$/i.test(id))return json({error:'Choose an index and grade.'},400);
   const detail=await indexDetail(db,id,grade);if(!detail)return json({error:'That index has no data yet.'},404);
   const ids=await indexMembers(db,id,grade),metrics=await cardMetricsFor(db,ids,grade);
   const members=ids.map(card_id=>({card_id,...metrics[card_id]})).sort((a,b)=>(b.price||0)-(a.price||0));
   return json({id,name:indexName(id,{sets,series}),grade,...detail,members});
  }
  if(path==='/api/metrics/rebuild'){
   if(request.method==='POST'){if(!env.BACKGROUND_JOBS)return json({unavailable:true});queueRebuild(env);}
   else if(request.method!=='GET')return json({error:'Unsupported request.'},405);
   return json({...rebuildState(),run:await lastRun(db)});
  }
  if(path==='/api/schedule'&&request.method==='GET'){
   const {tiers}=await tieredQueue(db),last=await db.prepare('SELECT day,started_at,finished_at,summary FROM nightly_runs ORDER BY day DESC LIMIT 1').first();
   const hour=Number(env.FUTURESIGHT_UPDATE_HOUR),configured=Number(env.FUTURESIGHT_NIGHTLY_PAGES);
   return json({enabled:!!env.BACKGROUND_JOBS&&Number.isInteger(hour)&&hour>=0&&hour<=23&&env.FUTURESIGHT_UPDATE_HOUR!=='',hour:Number.isInteger(hour)?hour:null,pages:configured>0?configured:NIGHTLY_PAGES,tiers:REFRESH_TIERS.map(([id,days,label])=>({id,days,label,...tiers[id]})),last:last?{...last,summary:last.summary?JSON.parse(last.summary):null}:null,sweeps:await sweepSummary(db),metrics:{...rebuildState(),run:await lastRun(db)}});
  }
  if(path==='/api/research'&&request.method==='POST'){
   // Cards named by id (at most 4 per call): the page orders the queue, skips cards checked recently and retries failures.
   const captureBatch=async batch=>{
    const markets={},failures=[];
    await Promise.all(batch.map(async card=>{try{markets[card.id]=lightMarket(await captureCard(db,env,ctx,card,await cardPage(card.source,env)));}catch(e){failures.push({card_id:card.id,message:e.message});}}));
    return {markets,failures};
   };
   if(url.searchParams.has('ids')){
    const ids=[...new Set(url.searchParams.get('ids').split(',').filter(Boolean))],batch=ids.map(id=>cardById.get(id));
    if(!ids.length||ids.length>4||batch.some(c=>!c||!c.eligible||!c.source))return json({error:'Choose up to 4 rare cards with a price source.'},400);
    if(env.NETWORK_DISABLED)return json({refreshed:false,attempted:0,total:ids.length,done:true,warning:'Live sales refresh is unavailable in this workspace. Showing the last researched sales.'});
    const {markets,failures}=await captureBatch(batch);
    return json({refreshed:Object.keys(markets).length>0,markets,count:Object.keys(markets).length,attempted:batch.length,total:batch.length,done:true,failures});
   }
   const scopeId=url.searchParams.get('set')||'xy5',offset=Number(url.searchParams.get('offset')||0);
   const era=scopeId.startsWith('era:')?scopeId.slice(4).toUpperCase():null;
   if(scopeId!=='all'&&!era&&!sets.some(s=>s.id===scopeId))return json({error:'Choose a supported set.'},400);
   if(era&&!series.some(s=>s.id===era))return json({error:'Choose a supported era.'},400);
   // Only cards with a price source are fetched; Japanese cards join once their products are verified.
   const lang=url.searchParams.get('lang');if(lang&&!LANGUAGES.includes(lang))return json({error:'Choose English or Japanese.'},400);
   const scope=cards.filter(c=>c.eligible&&c.source&&(!lang||langOf(c)===lang)&&(scopeId==='all'||(era?c.series===era:c.setId===scopeId)));
   if(!Number.isInteger(offset)||offset<0||offset>scope.length)return json({error:'Invalid sales batch.'},400);
   if(env.NETWORK_DISABLED)return json({refreshed:false,attempted:0,total:scope.length,done:true,warning:'Live sales refresh is unavailable in this workspace. Showing the last researched sales.'});
   const batch=scope.slice(offset,offset+4),{markets,failures}=await captureBatch(batch);
   const nextOffset=offset+batch.length;
   return json({refreshed:Object.keys(markets).length>0,markets,count:Object.keys(markets).length,attempted:batch.length,nextOffset,total:scope.length,done:nextOffset>=scope.length,failures});
  }
  // Crashes in the page are forwarded here so the Sentry address stays on the server. Does nothing unless SENTRY_DSN is set.
  if(path==='/api/report'&&request.method==='POST'){
   let body;try{body=await input(request);}catch{return json({error:'The report was invalid.'},400);}
   const problem=shapeError(body,[['message',boundedText(1,500),'The report was invalid.'],['stack',optionalText(4000),'The report was invalid.']]);if(problem)return json({error:problem},400);
   const error=new Error(body.message);error.name='BrowserError';error.stack=body.stack||'';
   const task=reportError(env,error,{source:'browser'});ctx?.waitUntil?.(task);
   return json({ok:true,sent:await task});
  }
  return json({error:'Not found.'},404);
 }catch(e){console.error('FutureSight API:',e.message);ctx?.waitUntil?.(reportError(env,e,{source:'api',route:path}));return json({error:'Saved data is temporarily unavailable. Please try again.'},503);}
}

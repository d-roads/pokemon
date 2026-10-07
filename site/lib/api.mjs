import {cards,sets,series} from '../data/catalog.mjs';
import {snapshots,observedAt} from '../data/market.mjs';
import {database} from './db.mjs';
import {parseMarket,parseSet,sourceFetch} from './provider.mjs';
import {mergeMarket} from './sales.mjs';
import {lightMarket} from './payload.mjs';
import {topMovers,PERIODS} from './movers.mjs';
import {potentialInvestments} from './invest.mjs';
import {investmentScores} from './score.mjs';
import {validateEntry} from './portfolio.mjs';
import {DEFAULT_SETTINGS,normalizeSettings,updateSettings,publicSettings,hasEbayKeys,runScan,sendNotifications,ebaySearchUrl,alertLimit} from './alerts.mjs';
import {isPlainObject,oneOf,optionalPrice,boundedText,optionalText,shapeError} from './schema.mjs';
import {reportError} from './report.mjs';
import {analyze} from './analysis.mjs';
import {recordObservations} from './observations.mjs';
import {investmentTable,investmentView,scoreMode,modelVersion,archiveScores} from './investment.mjs';
import {DEFAULT_COSTS,maxBuyPrice,netReturn,COST_PROFILE_VERSION} from './investment-costs.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const cardById=new Map(cards.map(c=>[c.id,c]));
const seriesIds=series.map(item=>item.id);
function insightSeries(url){const raw=url.searchParams.get('series');if(raw==null)return seriesIds;const requested=new Set(raw.split(',').map(value=>value.trim().toUpperCase()).filter(Boolean));if(!requested.size||[...requested].some(id=>!seriesIds.includes(id)))return null;return seriesIds.filter(id=>requested.has(id));}
async function cachedMarkets(db){const r=await db.prepare('SELECT card_id,payload FROM market_cache').all();return Object.fromEntries((r.results||[]).map(r=>[r.card_id,JSON.parse(r.payload)]));}
async function cachedMarket(db,id){const row=await db.prepare('SELECT payload FROM market_cache WHERE card_id = ?').bind(id).first();return row?JSON.parse(row.payload):null;}
async function readWatch(db,user){const r=await db.prepare('SELECT card_id,grade,target,created_at FROM watchlist WHERE user_id = ? ORDER BY created_at DESC').bind(user).all();return r.results||[];}
async function readCollection(db,user){const r=await db.prepare('SELECT id,card_id,grade,quantity,purchase_price,purchase_date,notes,created_at,updated_at FROM collection WHERE user_id = ? ORDER BY COALESCE(purchase_date,substr(created_at,1,10)) DESC,id DESC').bind(user).all();return r.results||[];}
// Every capture is also appended to the observation log (best effort: a logging failure never blocks a refresh).
async function logCapture(db,env,ctx,card,captured){try{await recordObservations(db,card,captured);}catch(e){console.error('Observation log:',e.message);ctx?.waitUntil?.(reportError(env,e,{source:'observations'}));}}
async function saveMarket(db,card,market){await db.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?) ON CONFLICT(card_id) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(card.id,JSON.stringify(market),market.observedAt).run();}
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
const scoreTable=db=>insight(db,'scores',entries=>investmentScores(entries));
// Research cache keys carry the model version, cost profile, horizon and bundled dataset revision;
// the market-cache count, newest capture and day are added by insight().
const RELEASE=Object.fromEntries(sets.map(s=>[s.id,s.release]));
const DATASET_REVISION=observedAt+'|'+cards.length;
const researchFor=(db,mode)=>insight(db,['research',modelVersion(),mode,COST_PROFILE_VERSION,'h12',DATASET_REVISION].join(':'),entries=>investmentTable(entries,{release:RELEASE,mode}));
// Shadow evaluation: archive both systems' outputs once per model and day, before outcomes exist.
const archived=new Set();
async function archiveOnce(db,env,ctx,table){
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
export async function fullMarket(db,id){return mergeMarket(snapshots[id],await cachedMarket(db,id))||null;}
async function alertState(db,user){
 const settings=await readSettings(db,user);
 const alerts=(await db.prepare('SELECT id,card_id,grade,listing_id,title,price,shipping,total,currency,url,image,buying_option,limit_price,limit_source,market_price,seller,listed_at,found_at,seen FROM alerts WHERE user_id = ? AND dismissed = 0 ORDER BY found_at DESC,id DESC LIMIT 200').bind(user).all()).results||[];
 const lastRun=await db.prepare('SELECT started_at,finished_at,checked,found,error FROM alert_runs WHERE user_id = ? ORDER BY id DESC LIMIT 1').bind(user).first();
 return {settings:publicSettings(settings),alerts,unseen:alerts.filter(a=>!a.seen).length,lastRun:lastRun||null,live:hasEbayKeys(settings)&&settings.enabled};
}
export async function scanForUser(env,user,options={}){
 const db=database(env),settings=await readSettings(db,user);
 if(env.NETWORK_DISABLED)return {checked:0,found:[],skipped:[],error:'Live listing scans are unavailable in this workspace.'};
 const markets=await cachedMarkets(db);
 return runScan({db,user,cards,marketFor:id=>mergeMarket(snapshots[id],markets[id]),settings,fetchImpl:env.fetch||fetch,...options});
}
export async function api(request,env,ctx){
 const url=new URL(request.url),path=url.pathname;
 try{
  const db=database(env),user=env.LOCAL_USER_ID||request.headers.get('oai-authenticated-user-id');
  if(request.method!=='GET' && request.method!=='HEAD'){
   const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'This action must be made from your FutureSight page.'},403);
   if(!user)return json({error:'Sign in to save your watchlist.'},401);
  }
  if(path==='/api/catalog' && request.method==='GET'){
   const cached=await cachedMarkets(db),markets={};
   for(const id of new Set([...Object.keys(snapshots),...Object.keys(cached)])){const m=cached[id]?mergeMarket(snapshots[id],cached[id]):snapshots[id];if(m)markets[id]=lightMarket(m);}
   return json({sets,series,cards,markets,local:!!env.LOCAL_USER_ID});
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
   const cached=await cachedMarkets(db);
   const searches=watch.map(w=>{const card=cardById.get(w.card_id);if(!card)return null;const limit=alertLimit(w,mergeMarket(snapshots[w.card_id],cached[w.card_id]),settings);return {card_id:w.card_id,grade:w.grade,limit:limit?.limit??null,limit_source:limit?.source??null,url:ebaySearchUrl(card,w.grade,limit?.limit,{auctions:settings.includeAuctions})};}).filter(Boolean);
   return json({...state,searches});
  }
  if(path==='/api/alerts/settings'){
   if(!user)return json({error:'Sign in to change alerts.'},401);
   if(request.method==='POST'){
    let body;try{body=await input(request);}catch{return json({error:'The settings request was invalid.'},400);}
    const {settings,errors}=updateSettings(await readSettings(db,user),body);if(errors.length)return json({error:errors[0],errors},400);
    if(settings.enabled&&!hasEbayKeys(settings))return json({error:'Add your eBay Client ID and Client Secret before turning on live alerts.'},400);
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
   const result=await insight(db,'movers:'+period+':'+key,entries=>topMovers(entries.filter(([card])=>selected.has(card.series)),period));return json({...result,series:included});
  }
  if(path==='/api/investments' && request.method==='GET'){
   const included=insightSeries(url);if(!included)return json({error:'Choose one or more supported eras.'},400);const selected=new Set(included),key=included.join(',');
   const result=await insight(db,'investments:'+key,entries=>potentialInvestments(entries.filter(([card])=>selected.has(card.series)))),mode=scoreMode(env);
   if(mode==='legacy')return json({...result,series:included});
   // The shortlist and the card panel read the same research table, so they cannot disagree.
   const t=await researchFor(db,mode),grades={};
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
   return json({...result,grades,series:included,research:{modelVersion:t.modelVersion,mode:t.mode,gate:t.gate}});
  }
  if(path==='/api/scores' && request.method==='GET'){
   const {checkedAt,grades,scores}=await scoreTable(db),mode=scoreMode(env);
   if(mode==='legacy')return json({checkedAt,grades,scores,research:null});
   const t=await researchFor(db,mode);await archiveOnce(db,env,ctx,t);
   return json({checkedAt,grades,scores,research:{modelVersion:t.modelVersion,mode:t.mode,asOf:t.asOf,horizonMonths:t.horizonMonths,ranks:t.ranks,status:t.status,gate:t.gate}});
  }
  if(path==='/api/market' && request.method==='GET'){
   const card=cardById.get(url.searchParams.get('id'));if(!card)return json({error:'That card is not in the catalog.'},404);
   let market=await fullMarket(db,card.id);const mode=scoreMode(env);
   const extras=async()=>({score:(await scoreTable(db)).full.get(card.id)||null,investment:mode==='legacy'?null:marketInvestment(await researchFor(db,mode),card,market)});
   if(url.searchParams.get('refresh')==='1'){
    if(!card.source)return json({market,refreshed:false,warning:'Japanese prices are not loaded yet. They arrive once each Japanese card is matched to its exact price-guide product.',...await extras()});
    try{const live=parseMarket(await sourceFetch(card.source,env),card);market=mergeMarket(market,live);await saveMarket(db,card,market);await logCapture(db,env,ctx,card,live);return json({market,refreshed:true,...await extras()});}
    catch(e){return json({market,refreshed:false,warning:e.message,...await extras()});}
   }
   return json({market,refreshed:false,...await extras()});
  }
  if(path==='/api/refresh' && request.method==='POST'){
   const set=sets.find(s=>s.id===(url.searchParams.get('set')||'xy5'));
   if(!set)return json({error:'Choose a set to refresh.'},400);
   // Japanese sets have no verified price products yet (Japanese work, task 2).
   if(set.lang==='ja')return json({refreshed:false,count:0,warning:'Japanese prices are not loaded yet. They arrive once each Japanese card is matched to its exact price-guide product.'});
   try{
    const guides=parseSet(await sourceFetch(set.marketSource,env),cards.filter(c=>c.setId===set.id&&c.eligible)),cached=await cachedMarkets(db),markets={};
    for(const [id,g] of Object.entries(guides)){const previous=mergeMarket(snapshots[id],cached[id]);markets[id]=mergeMarket(previous,g);await logCapture(db,env,ctx,cardById.get(id),g);}
    await db.batch(Object.entries(markets).map(([id,m])=>db.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?) ON CONFLICT(card_id) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(id,JSON.stringify(m),m.observedAt)));
    return json({markets:Object.fromEntries(Object.entries(markets).map(([id,m])=>[id,lightMarket(m)])),refreshed:true,count:Object.keys(markets).length});
   }catch(e){return json({refreshed:false,warning:e.message});}
  }
  if(path==='/api/research'&&request.method==='POST'){
   const scopeId=url.searchParams.get('set')||'xy5',offset=Number(url.searchParams.get('offset')||0);
   const era=scopeId.startsWith('era:')?scopeId.slice(4).toUpperCase():null;
   if(scopeId!=='all'&&!era&&!sets.some(s=>s.id===scopeId))return json({error:'Choose a supported set.'},400);
   if(era&&!series.some(s=>s.id===era))return json({error:'Choose a supported era.'},400);
   // Only cards with a price source are fetched; Japanese cards join once their products are verified.
   const scope=cards.filter(c=>c.eligible&&c.source&&(scopeId==='all'||(era?c.series===era:c.setId===scopeId)));
   if(!Number.isInteger(offset)||offset<0||offset>scope.length)return json({error:'Invalid sales batch.'},400);
   if(env.NETWORK_DISABLED)return json({refreshed:false,attempted:0,total:scope.length,done:true,warning:'Live sales refresh is unavailable in this workspace. Showing the last researched sales.'});
   const batch=scope.slice(offset,offset+4),cached=await cachedMarkets(db),markets={},failures=[];
   await Promise.all(batch.map(async card=>{try{const live=parseMarket(await sourceFetch(card.source,env),card),market=mergeMarket(mergeMarket(snapshots[card.id],cached[card.id]),live);await saveMarket(db,card,market);await logCapture(db,env,ctx,card,live);markets[card.id]=lightMarket(market);}catch(e){failures.push({card_id:card.id,message:e.message});}}));
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

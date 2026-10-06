import {cards,sets,series} from '../data/catalog.mjs';
import {snapshots} from '../data/market.mjs';
import {database} from './db.mjs';
import {parseMarket,parseSet,sourceFetch} from './provider.mjs';
import {mergeMarket} from './sales.mjs';
import {lightMarket} from './payload.mjs';
import {topMovers,PERIODS} from './movers.mjs';
import {potentialInvestments} from './invest.mjs';
import {investmentScores} from './score.mjs';
import {validateEntry} from './portfolio.mjs';
import {DEFAULT_SETTINGS,normalizeSettings,updateSettings,publicSettings,hasEbayKeys,runScan,sendNotifications,ebaySearchUrl,alertLimit} from './alerts.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const cardById=new Map(cards.map(c=>[c.id,c]));
const seriesIds=series.map(item=>item.id);
function insightSeries(url){const raw=url.searchParams.get('series');if(raw==null)return seriesIds;const requested=new Set(raw.split(',').map(value=>value.trim().toUpperCase()).filter(Boolean));if(!requested.size||[...requested].some(id=>!seriesIds.includes(id)))return null;return seriesIds.filter(id=>requested.has(id));}
async function cachedMarkets(db){const r=await db.prepare('SELECT card_id,payload FROM market_cache').all();return Object.fromEntries((r.results||[]).map(r=>[r.card_id,JSON.parse(r.payload)]));}
async function cachedMarket(db,id){const row=await db.prepare('SELECT payload FROM market_cache WHERE card_id = ?').bind(id).first();return row?JSON.parse(row.payload):null;}
async function readWatch(db,user){const r=await db.prepare('SELECT card_id,grade,target,created_at FROM watchlist WHERE user_id = ? ORDER BY created_at DESC').bind(user).all();return r.results||[];}
async function readCollection(db,user){const r=await db.prepare('SELECT id,card_id,grade,quantity,purchase_price,purchase_date,notes,created_at,updated_at FROM collection WHERE user_id = ? ORDER BY COALESCE(purchase_date,substr(created_at,1,10)) DESC,id DESC').bind(user).all();return r.results||[];}
async function saveMarket(db,card,market){await db.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?) ON CONFLICT(card_id) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(card.id,JSON.stringify(market),market.observedAt).run();}
async function input(request){if(!request.headers.get('Content-Type')?.includes('application/json'))throw new Error('Send JSON data.');const raw=await request.text();if(raw.length>8192)throw new Error('The request was too large.');return JSON.parse(raw);}
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
export async function api(request,env){
 const url=new URL(request.url),path=url.pathname;
 try{
  const db=database(env),user=env.LOCAL_USER_ID||request.headers.get('oai-authenticated-user-id');
  if(request.method!=='GET' && request.method!=='HEAD'){
   const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'This action must be made from your Primal Watch page.'},403);
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
    if(!cardById.has(card_id)||!['raw','psa9','psa10'].includes(grade))return json({error:'Choose a card from the catalog and a supported grade.'},400);
    if(target!=null && (typeof target!=='number'||!Number.isFinite(target)||target<=0||target>1000000))return json({error:'Enter a price between $0.01 and $1,000,000.'},400);
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
   const sample={card_id:'xy5-151',grade:'psa9',card_name:'Primal Groudon EX',set_name:'Primal Clash',number_label:'151/160',title:'Test alert from Primal Watch',total:1500,shipping:0,limit_price:1600,market_price:1999,url:'https://www.ebay.com/'};
   const r=await sendNotifications([sample],settings,env.fetch||fetch);return json(r.sent?{sent:r.sent}:{sent:0,error:'The notification could not be delivered. Check the topic or webhook.'});
  }
  if(path==='/api/movers' && request.method==='GET'){
   const period=url.searchParams.get('period')||'week';if(!PERIODS[period])return json({error:'Choose week or month.'},400);
   const included=insightSeries(url);if(!included)return json({error:'Choose one or more supported eras.'},400);const selected=new Set(included),key=included.join(',');
   const result=await insight(db,'movers:'+period+':'+key,entries=>topMovers(entries.filter(([card])=>selected.has(card.series)),period));return json({...result,series:included});
  }
  if(path==='/api/investments' && request.method==='GET'){
   const included=insightSeries(url);if(!included)return json({error:'Choose one or more supported eras.'},400);const selected=new Set(included),key=included.join(',');
   const result=await insight(db,'investments:'+key,entries=>potentialInvestments(entries.filter(([card])=>selected.has(card.series))));return json({...result,series:included});
  }
  if(path==='/api/scores' && request.method==='GET'){
   const {checkedAt,grades,scores}=await scoreTable(db);return json({checkedAt,grades,scores});
  }
  if(path==='/api/market' && request.method==='GET'){
   const card=cardById.get(url.searchParams.get('id'));if(!card)return json({error:'That card is not in the catalog.'},404);
   let market=await fullMarket(db,card.id);
   if(url.searchParams.get('refresh')==='1'){
    try{const live=parseMarket(await sourceFetch(card.source,env),card);market=mergeMarket(market,live);await saveMarket(db,card,market);return json({market,refreshed:true,score:(await scoreTable(db)).full.get(card.id)||null});}
    catch(e){return json({market,refreshed:false,warning:e.message,score:(await scoreTable(db)).full.get(card.id)||null});}
   }
   return json({market,refreshed:false,score:(await scoreTable(db)).full.get(card.id)||null});
  }
  if(path==='/api/refresh' && request.method==='POST'){
   const set=sets.find(s=>s.id===(url.searchParams.get('set')||'xy5'));
   if(!set)return json({error:'Choose a set to refresh.'},400);
   try{
    const guides=parseSet(await sourceFetch(set.marketSource,env),cards.filter(c=>c.setId===set.id&&c.eligible)),cached=await cachedMarkets(db),markets={};
    for(const [id,g] of Object.entries(guides)){const previous=mergeMarket(snapshots[id],cached[id]);markets[id]=mergeMarket(previous,g);}
    await db.batch(Object.entries(markets).map(([id,m])=>db.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?) ON CONFLICT(card_id) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(id,JSON.stringify(m),m.observedAt)));
    return json({markets:Object.fromEntries(Object.entries(markets).map(([id,m])=>[id,lightMarket(m)])),refreshed:true,count:Object.keys(markets).length});
   }catch(e){return json({refreshed:false,warning:e.message});}
  }
  if(path==='/api/research'&&request.method==='POST'){
   const scopeId=url.searchParams.get('set')||'xy5',offset=Number(url.searchParams.get('offset')||0);
   const era=scopeId.startsWith('era:')?scopeId.slice(4).toUpperCase():null;
   if(scopeId!=='all'&&!era&&!sets.some(s=>s.id===scopeId))return json({error:'Choose a supported set.'},400);
   if(era&&!series.some(s=>s.id===era))return json({error:'Choose a supported era.'},400);
   const scope=cards.filter(c=>c.eligible&&(scopeId==='all'||(era?c.series===era:c.setId===scopeId)));
   if(!Number.isInteger(offset)||offset<0||offset>scope.length)return json({error:'Invalid sales batch.'},400);
   if(env.NETWORK_DISABLED)return json({refreshed:false,attempted:0,total:scope.length,done:true,warning:'Live sales refresh is unavailable in this workspace. Showing the last researched sales.'});
   const batch=scope.slice(offset,offset+4),cached=await cachedMarkets(db),markets={},failures=[];
   await Promise.all(batch.map(async card=>{try{const market=mergeMarket(mergeMarket(snapshots[card.id],cached[card.id]),parseMarket(await sourceFetch(card.source,env),card));await saveMarket(db,card,market);markets[card.id]=lightMarket(market);}catch(e){failures.push({card_id:card.id,message:e.message});}}));
   const nextOffset=offset+batch.length;
   return json({refreshed:Object.keys(markets).length>0,markets,count:Object.keys(markets).length,attempted:batch.length,nextOffset,total:scope.length,done:nextOffset>=scope.length,failures});
  }
  return json({error:'Not found.'},404);
 }catch(e){console.error('Primal Watch API:',e.message);return json({error:'Saved data is temporarily unavailable. Please try again.'},503);}
}

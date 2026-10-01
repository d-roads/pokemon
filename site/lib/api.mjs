import {cards,sets} from '../data/catalog.mjs';
import {snapshots} from '../data/market.mjs';
import {database} from './db.mjs';
import {parseMarket,parseSet,sourceFetch} from './provider.mjs';
import {mergeMarket} from './sales.mjs';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function cachedMarkets(db){const r=await db.prepare('SELECT card_id,payload FROM market_cache').all();return Object.fromEntries((r.results||[]).map(r=>[r.card_id,JSON.parse(r.payload)]));}
async function readWatch(db,user){const r=await db.prepare('SELECT card_id,grade,target,created_at FROM watchlist WHERE user_id = ? ORDER BY created_at DESC').bind(user).all();return r.results||[];}
async function saveMarket(db,card,market){await db.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?) ON CONFLICT(card_id) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(card.id,JSON.stringify(market),market.observedAt).run();}
async function input(request){if(!request.headers.get('Content-Type')?.includes('application/json'))throw new Error('Send JSON data.');const raw=await request.text();if(raw.length>8192)throw new Error('The request was too large.');return JSON.parse(raw);}
export async function api(request,env){
 const url=new URL(request.url),path=url.pathname;
 try{
  const db=database(env),user=env.LOCAL_USER_ID||request.headers.get('oai-authenticated-user-id');
  if(request.method!=='GET' && request.method!=='HEAD'){
   const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'This action must be made from your Primal Watch page.'},403);
   if(!user)return json({error:'Sign in to save your watchlist.'},401);
  }
  if(path==='/api/catalog' && request.method==='GET'){const cached=await cachedMarkets(db),markets={...snapshots};for(const [id,m]of Object.entries(cached))markets[id]=mergeMarket(snapshots[id],m);return json({sets,cards,markets,local:!!env.LOCAL_USER_ID});}
  if(path==='/api/watchlist'){
   if(!user)return json({error:'Sign in to view your watchlist.'},401);
   if(['POST','DELETE'].includes(request.method)){
    let body;try{body=await input(request);}catch{return json({error:'The watchlist request was invalid.'},400);}
    const {card_id,grade,target}=body;
    if(!cards.some(c=>c.id===card_id)||!['raw','psa9','psa10'].includes(grade))return json({error:'Choose an XY card and a supported grade.'},400);
    if(target!=null && (typeof target!=='number'||!Number.isFinite(target)||target<=0||target>1000000))return json({error:'Enter a price between $0.01 and $1,000,000.'},400);
    if(request.method==='DELETE')await db.prepare('DELETE FROM watchlist WHERE user_id = ? AND card_id = ? AND grade = ?').bind(user,card_id,grade).run();
    else await db.prepare('INSERT INTO watchlist (user_id,card_id,grade,target,created_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,card_id,grade) DO UPDATE SET target=excluded.target').bind(user,card_id,grade,target??null,new Date().toISOString()).run();
   }else if(request.method!=='GET')return json({error:'Method not allowed.'},405);
   return json({watchlist:await readWatch(db,user)});
  }
  if(path==='/api/market' && request.method==='GET'){
   const card=cards.find(c=>c.id===url.searchParams.get('id'));if(!card)return json({error:'That card is not in the XY catalog.'},404);
   const row=await db.prepare('SELECT payload,fetched_at FROM market_cache WHERE card_id = ?').bind(card.id).first();
   let market=mergeMarket(snapshots[card.id],row?JSON.parse(row.payload):null)||null;
   const age=row?(Date.now()-Date.parse(row.fetched_at))/3600000:Infinity;
   if(url.searchParams.get('refresh')==='1'||age>6){
    try{const live=parseMarket(await sourceFetch(card.source,env),card);market=mergeMarket(market,live);await saveMarket(db,card,market);return json({market,refreshed:true});}
    catch(e){return json({market,refreshed:false,warning:e.message});}
   }
   return json({market,refreshed:false});
  }
  if(path==='/api/refresh' && request.method==='POST'){
   const set=sets.find(s=>s.id===(url.searchParams.get('set')||'xy5'));
   if(!set)return json({error:'Choose a set to refresh.'},400);
   try{
    const guides=parseSet(await sourceFetch(set.marketSource,env),cards.filter(c=>c.setId===set.id&&c.eligible)),cached=await cachedMarkets(db),markets={};
    for(const [id,g] of Object.entries(guides)){const previous=mergeMarket(snapshots[id],cached[id]);markets[id]=mergeMarket(previous,g);}
    await db.batch(Object.entries(markets).map(([id,m])=>db.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?) ON CONFLICT(card_id) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at').bind(id,JSON.stringify(m),m.observedAt)));
    return json({markets,refreshed:true,count:Object.keys(markets).length});
   }catch(e){return json({refreshed:false,warning:e.message});}
  }
  if(path==='/api/research'&&request.method==='POST'){
   const setId=url.searchParams.get('set')||'xy5',offset=Number(url.searchParams.get('offset')||0);
   if(setId!=='all'&&!sets.some(s=>s.id===setId))return json({error:'Choose a supported XY set.'},400);
   const scope=cards.filter(c=>c.eligible&&(setId==='all'||c.setId===setId));
   if(!Number.isInteger(offset)||offset<0||offset>scope.length)return json({error:'Invalid sales batch.'},400);
   if(env.NETWORK_DISABLED)return json({refreshed:false,attempted:0,total:scope.length,done:true,warning:'Live sales refresh is unavailable in this workspace. Showing the last researched sales.'});
   const batch=scope.slice(offset,offset+4),cached=await cachedMarkets(db),markets={},failures=[];
   await Promise.all(batch.map(async card=>{try{const market=mergeMarket(mergeMarket(snapshots[card.id],cached[card.id]),parseMarket(await sourceFetch(card.source,env),card));await saveMarket(db,card,market);markets[card.id]=market;}catch(e){failures.push({card_id:card.id,message:e.message});}}));
   const nextOffset=offset+batch.length;
   return json({refreshed:Object.keys(markets).length>0,markets,count:Object.keys(markets).length,attempted:batch.length,nextOffset,total:scope.length,done:nextOffset>=scope.length,failures});
  }
  return json({error:'Not found.'},404);
 }catch(e){console.error('Primal Watch API:',e.message);return json({error:'Saved data is temporarily unavailable. Please try again.'},503);}
}

// Market alerts: rules on a card's or an index's metrics, checked after every metrics rebuild.
//
//   price     a card's guide crosses a level (above or below)
//   move      a card's or index's change over 7 or 30 days reaches a % (up, down or either way)
//   pop       a card's PSA population grows by a % since the rule was set (or last fired)
//   volume    a card's sales in 30 days reach a multiple of its 90-day monthly average (and 3+)
//   spread    a card's PSA 10 / PSA 9 spread widens by a % since the rule was set (or last fired)
//   extreme   a card's guide sets a new 52-week high or low
//   rank      a Pokémon's demand rank (among Pokémon with 5+ priced cards) moves by N places
//
// Each rule keeps a little state (a baseline, or whether it is armed) so it fires once per crossing,
// not on every rebuild while the condition holds. A rule fires again only after the condition clears.
export const SIGNAL_KINDS=['price','move','pop','volume','spread','extreme','rank'];
export const SIGNAL_LIMITS={rules:100,events:200,rankMinCards:5};
const PERIODS={'7d':'ret_7d','30d':'ret_30d'};
export const SIGNAL_TABLES=[
 'CREATE TABLE IF NOT EXISTS metric_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, kind TEXT NOT NULL, target TEXT NOT NULL, grade TEXT NOT NULL, params TEXT NOT NULL, state TEXT, created_at TEXT NOT NULL, checked_at TEXT, fired_at TEXT)',
 'CREATE INDEX IF NOT EXISTS metric_alerts_user ON metric_alerts (user_id)',
 'CREATE TABLE IF NOT EXISTS metric_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, alert_id INTEGER, kind TEXT NOT NULL, target TEXT NOT NULL, grade TEXT NOT NULL, title TEXT NOT NULL, body TEXT, value REAL, fired_at TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0, dismissed INTEGER NOT NULL DEFAULT 0)',
 'CREATE INDEX IF NOT EXISTS metric_events_user ON metric_events (user_id, dismissed, fired_at)',
];
const isIndex=t=>/^(?:en|ja):[a-z0-9]+:/.test(t);

// Check a new rule. `cardOk(id)` and `indexOk(id)` say whether the target exists.
export function normalizeRule(input,{cardOk,indexOk}){
 const r=input&&typeof input==='object'?input:{},errors=[];
 const kind=SIGNAL_KINDS.includes(r.kind)?r.kind:null;if(!kind)errors.push('Choose an alert type.');
 const grade=['raw','psa9','psa10'].includes(r.grade)?r.grade:null;if(!grade)errors.push('Choose a grade.');
 const target=typeof r.target==='string'?r.target:'';
 const onIndex=isIndex(target);
 if(kind==='move'?!(onIndex?indexOk(target):cardOk(target)):kind==='rank'?!(onIndex&&target.split(':')[1]==='char'&&indexOk(target)):!cardOk(target))errors.push(kind==='rank'?'Choose a Pokémon.':'Choose a card'+(kind==='move'?' or an index':'')+'.');
 const p=r.params&&typeof r.params==='object'?r.params:{},params={};
 const num=(k,lo,hi,msg)=>{const v=Number(p[k]);if(!Number.isFinite(v)||v<lo||v>hi)errors.push(msg);else params[k]=v;};
 if(kind==='price'){num('level',.01,10000000,'Enter a price level.');params.dir=p.dir==='below'?'below':'above';}
 if(kind==='move'){num('pct',.01,20,'Enter a move between 1% and 2,000%.');params.period=PERIODS[p.period]?p.period:'30d';params.dir=['up','down'].includes(p.dir)?p.dir:'either';}
 if(kind==='pop'||kind==='spread')num('pct',.01,20,'Enter a change between 1% and 2,000%.');
 if(kind==='volume')num('mult',1.1,50,'Enter a multiple between 1.1× and 50×.');
 if(kind==='rank')num('places',1,500,'Enter a number of places.');
 return {rule:{kind,grade,target,params},errors};
}

// What a rule's target reads now. `cardRows` maps "card|grade" to card_metrics rows, `indexRows` maps
// "index|grade" to index_metrics rows, `ranks` maps "index|grade" to its demand rank.
function reading(rule,{cardRows,indexRows,ranks}){
 const key=rule.target+'|'+rule.grade;
 if(rule.kind==='rank')return ranks.get(key)!=null?{rank:ranks.get(key)}:null;
 if(rule.kind==='move'&&isIndex(rule.target)){const r=indexRows.get(key);return r?{...r,ret_30d:r.eq_ret_30d??r.ret_30d}:null;}
 return cardRows.get(key)||null;
}
const pctText=v=>(v>=0?'+':'−')+Math.abs(v*100).toFixed(1)+'%';
const usd=v=>'$'+Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
// Evaluate one rule against its reading. Returns {state, fire, value, text} (`state` is the new state).
export function evaluateRule(rule,now){
 const s=rule.state||{},p=rule.params;
 if(!now)return {state:s,fire:false};
 switch(rule.kind){
  case 'price':{
   const v=now.price;if(v==null)return {state:s,fire:false};
   const side=v>=p.level?'above':'below',fire=s.side!=null&&s.side!==side&&side===p.dir;
   return {state:{side},fire,value:v,text:`Guide ${usd(v)}, ${side} your ${usd(p.level)} level`};
  }
  case 'move':{
   const v=now[PERIODS[p.period]];if(v==null)return {state:{armed:s.armed??true},fire:false};
   const hit=p.dir==='up'?v>=p.pct:p.dir==='down'?v<=-p.pct:Math.abs(v)>=p.pct,armed=s.armed??true;
   return {state:{armed:!hit},fire:hit&&armed,value:v,text:`${pctText(v)} over ${p.period==='7d'?'7':'30'} days`};
  }
  case 'pop':{
   const v=now.pop_total;if(!(v>0))return {state:s,fire:false};
   if(!(s.base>0))return {state:{base:v},fire:false};
   const g=v/s.base-1,fire=g>=p.pct;
   return {state:{base:fire?v:s.base},fire,value:g,text:`PSA population ${s.base.toLocaleString()} → ${v.toLocaleString()} (${pctText(g)})`};
  }
  case 'volume':{
   const a=now.sales_30d,b=now.sales_90d;if(a==null||!(b>0))return {state:{armed:s.armed??true},fire:false};
   const avg=b/3,hit=a>=3&&a>=p.mult*avg,armed=s.armed??true;
   return {state:{armed:!hit},fire:hit&&armed,value:a/avg,text:`${a} sales in 30 days, ${(a/avg).toFixed(1)}× its usual month`};
  }
  case 'spread':{
   const v=now.spread_10_9;if(!(v>0))return {state:s,fire:false};
   if(!(s.base>0))return {state:{base:v},fire:false};
   const g=v/s.base-1,fire=g>=p.pct;
   return {state:{base:fire?v:s.base},fire,value:g,text:`PSA 10 / PSA 9 spread ${s.base.toFixed(2)}× → ${v.toFixed(2)}×`};
  }
  case 'extreme':{
   const {price:v,high_52w:h,low_52w:l}=now;if(v==null||h==null||l==null||!(h>l))return {state:{at:null},fire:false};
   const at=v>=h?'high':v<=l?'low':null,fire=at!=null&&s.at!==at&&s.at!==undefined;
   return {state:{at},fire,value:v,text:`New 52-week ${at}: ${usd(v)}`};
  }
  case 'rank':{
   const v=now.rank;if(v==null)return {state:s,fire:false};
   if(s.base==null)return {state:{base:v},fire:false};
   const moved=s.base-v,fire=Math.abs(moved)>=p.places;
   return {state:{base:fire?v:s.base},fire,value:v,text:`Demand rank ${s.base} → ${v} (${moved>0?'up':'down'} ${Math.abs(moved)})`};
  }
 }
 return {state:s,fire:false};
}

// ---------- Database ----------
const sigReady=new WeakMap();
export function ensureSignalTables(db){
 if(!sigReady.has(db))sigReady.set(db,(async()=>{for(const sql of SIGNAL_TABLES)await db.prepare(sql).run();})().catch(e=>{sigReady.delete(db);throw e;}));
 return sigReady.get(db);
}
// Demand ranks of every Pokémon of a language and grade, by premium, among those with enough priced cards.
async function demandRanks(db,lang,grade){
 const rows=(await db.prepare("SELECT index_id,premium FROM index_metrics WHERE lang = ? AND kind = 'char' AND grade = ? AND priced >= ? AND premium IS NOT NULL ORDER BY premium DESC").bind(lang,grade,SIGNAL_LIMITS.rankMinCards).all()).results||[];
 return new Map(rows.map((r,i)=>[r.index_id+'|'+grade,i+1]));
}
// Readings for a set of rules, read in as few queries as practical.
async function readings(db,rules){
 const cardRows=new Map(),indexRows=new Map(),ranks=new Map();
 for(const r of rules){
  const key=r.target+'|'+r.grade;
  if(r.kind==='rank'){if(!ranks.has(key))for(const [k,v] of await demandRanks(db,r.target.split(':')[0],r.grade))ranks.set(k,v);if(!ranks.has(key))ranks.set(key,null);}
  else if(isIndex(r.target)){if(!indexRows.has(key))indexRows.set(key,await db.prepare('SELECT * FROM index_metrics WHERE index_id = ? AND grade = ?').bind(r.target,r.grade).first());}
  else if(!cardRows.has(key))cardRows.set(key,await db.prepare('SELECT * FROM card_metrics WHERE card_id = ? AND grade = ?').bind(r.target,r.grade).first());
 }
 return {cardRows,indexRows,ranks};
}
const parseRule=r=>({...r,params:JSON.parse(r.params||'{}'),state:r.state?JSON.parse(r.state):null});
// Save a rule with its baseline taken from today's metrics, so it fires only on a change from here.
export async function createRule(db,user,rule,now=new Date().toISOString()){
 await ensureSignalTables(db);
 const n=(await db.prepare('SELECT COUNT(*) AS n FROM metric_alerts WHERE user_id = ?').bind(user).first())?.n||0;
 if(n>=SIGNAL_LIMITS.rules)return {error:'You can keep up to '+SIGNAL_LIMITS.rules+' market alerts. Delete one first.'};
 const ctx=await readings(db,[rule]),{state}=evaluateRule({...rule,state:null},reading(rule,ctx));
 await db.prepare('INSERT INTO metric_alerts (user_id,kind,target,grade,params,state,created_at) VALUES (?,?,?,?,?,?,?)').bind(user,rule.kind,rule.target,rule.grade,JSON.stringify(rule.params),JSON.stringify(state),now).run();
 return {ok:true};
}
export async function listRules(db,user){await ensureSignalTables(db);return ((await db.prepare('SELECT * FROM metric_alerts WHERE user_id = ? ORDER BY id DESC').bind(user).all()).results||[]).map(parseRule);}
export async function listEvents(db,user){
 await ensureSignalTables(db);
 const events=(await db.prepare('SELECT id,alert_id,kind,target,grade,title,body,value,fired_at,seen FROM metric_events WHERE user_id = ? AND dismissed = 0 ORDER BY fired_at DESC,id DESC LIMIT ?').bind(user,SIGNAL_LIMITS.events).all()).results||[];
 return {events,unseen:events.filter(e=>!e.seen).length};
}
// Check every rule (or one account's) against today's metrics. `name(target)` gives a display name.
// Returns the new events per account.
export async function checkSignals(db,{user=null,name=t=>t,now=new Date().toISOString()}={}){
 await ensureSignalTables(db);
 const rules=((await (user?db.prepare('SELECT * FROM metric_alerts WHERE user_id = ?').bind(user):db.prepare('SELECT * FROM metric_alerts')).all()).results||[]).map(parseRule);
 const ctx=await readings(db,rules),fired=new Map();
 for(const rule of rules){
  const out=evaluateRule(rule,reading(rule,ctx));
  await db.prepare('UPDATE metric_alerts SET state = ?, checked_at = ?'+(out.fire?', fired_at = ?':'')+' WHERE id = ?').bind(...[JSON.stringify(out.state),now,...(out.fire?[now]:[]),rule.id]).run();
  if(!out.fire)continue;
  const title=name(rule.target)+(isIndex(rule.target)?'':' · '+{raw:'Raw',psa9:'PSA 9',psa10:'PSA 10'}[rule.grade])+': '+out.text;
  await db.prepare('INSERT INTO metric_events (user_id,alert_id,kind,target,grade,title,body,value,fired_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(rule.user_id,rule.id,rule.kind,rule.target,rule.grade,title,out.text,out.value??null,now).run();
  (fired.get(rule.user_id)||fired.set(rule.user_id,[]).get(rule.user_id)).push({title,body:out.text,target:rule.target,grade:rule.grade,kind:rule.kind});
 }
 return fired;
}

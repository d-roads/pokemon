// Import market data collected into one FutureSight database (e.g. a working copy filled by a
// research capture run) into another one, such as the local test copy.
//
// Merges, never overwrites:
//   market_cache   each card's record is merged with mergeMarket(older, newer), so sales from both
//                  sides are kept and the newer capture's guide, history and population win.
//   *_observations append-only research logs, copied with INSERT OR IGNORE on their unique keys.
//   source_map     Japanese product matches, copied only for cards the target has not mapped.
// A Japanese card's prices are only imported when both databases map it to the same product, and
// any card whose saved source differs between the two is skipped and reported.
// Accounts, sessions, invites, watchlists, Dex entries, alerts and score archives are not touched.
//
// Safety: refuses the beta folder (…/primal-watch/site/…), refuses a file named primal-watch.sqlite
// unless --allow-main-db, refuses while a FutureSight server answers on --port (default 5180, the
// local test copy; stop it first), and writes a VACUUM INTO backup next to the target first.
//
// Usage: node tools/research/import-collected.mjs --from <source.sqlite> --to <target.sqlite>
//          [--dry-run] [--port=5180] [--allow-main-db]
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OBSERVATIONS=['market_observations','sales_observations','guide_observations','population_observations'];

// Why the target must not be written, or null.
export function targetProblem(target,{allowMainDb=false}={}){
 const norm=path.resolve(target).replace(/\\/g,'/');
 if(/\/primal-watch\/site\//i.test(norm))return 'This is the beta folder. The beta database is never imported into.';
 if(/(^|\/)primal-watch\.sqlite$/i.test(norm)&&!allowMainDb)return 'This is a main FutureSight database (primal-watch.sqlite). Pass --allow-main-db if it is not the beta.';
 if(!existsSync(target))return 'The target database does not exist.';
 return null;
}
export async function serverRunning(port,{timeoutMs=1500}={}){
 try{const r=await fetch(`http://127.0.0.1:${port}/api/version`,{signal:AbortSignal.timeout(timeoutMs)});return r.status>0;}catch{return false;}
}
const observedTime=m=>Date.parse(m?.observedAt||m?.research?.checkedAt||0)||0;
// The merged record: the older record first, so the newer capture's fields win.
export function mergeRecords(target,source,mergeMarket){
 if(!source)return target;if(!target)return mergeMarket(null,source);
 return observedTime(source)>=observedTime(target)?mergeMarket(target,source):mergeMarket(source,target);
}

// Order-insensitive form for "did anything change": object keys sorted, sales compared as a set.
export function canonical(v,key=''){
 if(Array.isArray(v)){const items=v.map(x=>canonical(x));return key==='sales'?items.map(x=>JSON.stringify(x)).sort():items;}
 if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k],k)]));
 return v;
}
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

export async function importCollected({from,to,dryRun=false,allowMainDb=false,port=5180,backup=true,log=console.log}){
 const {DatabaseSync}=await import('node:sqlite');
 const {mergeMarket}=await import(pathToFileURL(path.join(root,'site/lib/sales.mjs')).href);
 if(path.resolve(from)===path.resolve(to))throw new Error('Source and target are the same file.');
 const problem=targetProblem(to,{allowMainDb});if(problem)throw new Error(problem);
 if(port&&await serverRunning(port))throw new Error(`A FutureSight server is running on port ${port}. Close it first: it loads product matches only at start.`);
 const src=new DatabaseSync(from,{readOnly:true}),dst=new DatabaseSync(to);
 dst.exec('PRAGMA journal_mode = WAL');dst.exec(readFileSync(path.join(root,'site/db/schema.sql'),'utf8'));
 const report={from:path.basename(from),to:path.basename(to),dryRun,backup:null,market:{added:0,merged:0,unchanged:0,skipped:[]},sourceMap:{added:0,kept:0},observations:{}};
 if(backup&&!dryRun){report.backup=to.replace(/\.sqlite$/,'')+'.before-import-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite';dst.exec(`VACUUM INTO '${report.backup.replace(/'/g,"''")}'`);}
 const srcMap=new Map(src.prepare('SELECT * FROM source_map').all().map(r=>[r.card_id,r])),dstMap=new Map(dst.prepare('SELECT * FROM source_map').all().map(r=>[r.card_id,r]));
 const getTarget=dst.prepare('SELECT payload,fetched_at FROM market_cache WHERE card_id = ?');
 const put=dst.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?) ON CONFLICT(card_id) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at');
 const putMap=dst.prepare('INSERT OR IGNORE INTO source_map (card_id,url,product_id,name,rule,map_version,mapped_at) VALUES (?,?,?,?,?,?,?)');
 dst.exec('BEGIN IMMEDIATE');
 try{
  for(const row of src.prepare('SELECT card_id,payload,fetched_at FROM market_cache ORDER BY card_id').iterate()){
   const id=row.card_id,source=JSON.parse(row.payload),existing=getTarget.get(id),target=existing?JSON.parse(existing.payload):null;
   if(id.startsWith('ja-')){
    const a=srcMap.get(id),b=dstMap.get(id);
    if(!a){report.market.skipped.push({id,why:'not mapped in the source'});continue;}
    if(b&&b.url!==a.url){report.market.skipped.push({id,why:'mapped to a different product in the target'});continue;}
    if(!b){if(!dryRun)putMap.run(a.card_id,a.url,a.product_id,a.name,a.rule,a.map_version,a.mapped_at);dstMap.set(id,a);report.sourceMap.added++;}else report.sourceMap.kept++;
   }
   if(target?.sourceUrl&&source.sourceUrl&&target.sourceUrl!==source.sourceUrl){report.market.skipped.push({id,why:'different source page'});continue;}
   const merged=mergeRecords(target,source,mergeMarket),text=JSON.stringify(merged);
   if(existing&&same(merged,target)){report.market.unchanged++;continue;}
   const fetched=[existing?.fetched_at,row.fetched_at].filter(Boolean).sort().at(-1);
   if(!dryRun)put.run(id,text,fetched);
   report.market[existing?'merged':'added']++;
  }
  for(const table of OBSERVATIONS){
   const cols=src.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name).filter(c=>c!=='id');
   const before=dst.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
   if(!dryRun){const ins=dst.prepare(`INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`);for(const r of src.prepare(`SELECT ${cols.join(',')} FROM ${table}`).iterate())ins.run(...cols.map(c=>r[c]));}
   report.observations[table]={before,after:dst.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n};
  }
  dst.exec(dryRun?'ROLLBACK':'COMMIT');
 }catch(e){dst.exec('ROLLBACK');throw e;}
 finally{src.close();dst.close();}
 const {skipped,...market}=report.market;
 log(JSON.stringify({...report,market:{...market,skipped:skipped.length}},null,1));
 return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const arg=name=>{const i=process.argv.indexOf(name);if(i>0)return process.argv[i+1];return process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1);};
 const from=arg('--from'),to=arg('--to');
 if(!from||!to){console.error('Usage: node tools/research/import-collected.mjs --from <source.sqlite> --to <target.sqlite> [--dry-run] [--port=5180] [--allow-main-db]');process.exit(2);}
 importCollected({from,to,dryRun:process.argv.includes('--dry-run'),allowMainDb:process.argv.includes('--allow-main-db'),port:Number(arg('--port')||5180)})
  .then(r=>{if(r.market.skipped.length)console.log('Skipped cards:',r.market.skipped.slice(0,20).map(s=>s.id+' ('+s.why+')').join(', ')+(r.market.skipped.length>20?' …':''));if(r.backup)console.log('Backup:',r.backup);})
  .catch(e=>{console.error('Import stopped:',e.message);process.exit(1);});
}

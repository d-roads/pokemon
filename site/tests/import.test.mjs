import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {importCollected,targetProblem,serverRunning} from '../../tools/research/import-collected.mjs';

const sql=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
const market=(observedAt,guide,sales,url='https://www.pricecharting.com/game/pokemon-sandstorm/sableye-10',history)=>JSON.stringify({observedAt,guide,sales,source:'PriceCharting',sourceUrl:url,status:'researched',...(history?{history}:{})});
const sale=(id,date,price)=>({id,grade:'raw',date,price,condition:'NM'});
function make(dir,name,rows){const db=new DatabaseSync(join(dir,name));db.exec(sql);rows(db);db.close();return join(dir,name);}
const quiet={log(){}};

function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'fs-import-'));
 const source=make(dir,'collected.sqlite',db=>{
  const ins=db.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?)');
  ins.run('ex2-10',market('2026-10-07T08:00:00Z',{raw:12},[sale('a','2026-10-01',12)],undefined,{raw:[['2025-01',1000]]}),'2026-10-07T08:00:00Z');
  ins.run('ex2-5',market('2026-10-07T08:00:00Z',{raw:30},[sale('c','2026-09-30',30)]),'2026-10-07T08:00:00Z');
  ins.run('dp1-1',market('2026-10-07T08:00:00Z',{raw:8},[],'https://www.pricecharting.com/game/other/page'),'2026-10-07T08:00:00Z');
  for(const [id,url] of [['ja-sm12a-001','https://pc/ja/one'],['ja-sm12a-002','https://pc/ja/two'],['ja-sm12a-003','https://pc/ja/three']]){
   db.prepare('INSERT INTO source_map (card_id,url,product_id,name,rule,map_version,mapped_at) VALUES (?,?,?,?,?,?,?)').run(id,url,'1','Card','name','v','2026-10-07');
   ins.run(id,market('2026-10-07T08:00:00Z',{psa10:50},[],url),'2026-10-07T08:00:00Z');
  }
  ins.run('ja-sm12a-004',market('2026-10-07T08:00:00Z',{psa10:50},[],'https://pc/ja/four'),'2026-10-07T08:00:00Z');
  db.prepare("INSERT INTO guide_observations (card_id,guide,period,price,price_basis,event_at,captured_at,parser_version,content_hash,recorded_at) VALUES ('ex2-10','raw','2025-01',10,'guide','2025-01','2026-10-07','p','h1','2026-10-07')").run();
 });
 const target=make(dir,'local-test.sqlite',db=>{
  const ins=db.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?)');
  // The target's own capture is newer than the collected one for this card.
  ins.run('ex2-10',market('2026-10-07T12:00:00Z',{raw:15},[sale('b','2026-10-07',15)]),'2026-10-07T12:00:00Z');
  ins.run('dp1-1',market('2026-10-01T00:00:00Z',{raw:7},[]),'2026-10-01T00:00:00Z');
  db.prepare('INSERT INTO source_map (card_id,url,product_id,name,rule,map_version,mapped_at) VALUES (?,?,?,?,?,?,?)').run('ja-sm12a-002','https://pc/ja/two','1','Card','name','v','2026-10-07');
  db.prepare('INSERT INTO source_map (card_id,url,product_id,name,rule,map_version,mapped_at) VALUES (?,?,?,?,?,?,?)').run('ja-sm12a-003','https://pc/ja/OTHER','9','Card','name','v','2026-10-07');
  db.prepare("INSERT INTO watchlist (user_id,card_id,grade,target,created_at) VALUES ('u1','ex2-10','raw',10,'2026-10-01')").run();
 });
 return {dir,source,target};
}

test('Import merges collected markets without losing newer target data or touching user tables',async()=>{
 const {source,target}=fixture();
 const r=await importCollected({from:source,to:target,port:0,log:quiet.log});
 assert.ok(r.backup&&existsSync(r.backup),'backup written first');
 const db=new DatabaseSync(target,{readOnly:true}),get=id=>JSON.parse(db.prepare('SELECT payload FROM market_cache WHERE card_id = ?').get(id)?.payload||'null');
 const sableye=get('ex2-10');
 assert.equal(sableye.guide.raw,15,'the newer target guide wins');assert.equal(sableye.observedAt,'2026-10-07T12:00:00Z');
 assert.deepEqual(sableye.sales.map(s=>s.id).sort(),['a','b'],'sales from both sides are kept');assert.ok(sableye.history?.raw,'the collected history is added');
 assert.equal(get('ex2-5').guide.raw,30,'a card the target lacked is added');
 assert.equal(get('dp1-1').guide.raw,7,'a different source page is skipped');
 // Japanese: copied with its product when the target has none, merged when both agree, skipped when they differ or the source has no product.
 assert.equal(get('ja-sm12a-001').guide.psa10,50);assert.equal(db.prepare("SELECT url FROM source_map WHERE card_id='ja-sm12a-001'").get().url,'https://pc/ja/one');
 assert.equal(get('ja-sm12a-002').guide.psa10,50);
 assert.equal(get('ja-sm12a-003'),null);assert.equal(db.prepare("SELECT url FROM source_map WHERE card_id='ja-sm12a-003'").get().url,'https://pc/ja/OTHER');
 assert.equal(get('ja-sm12a-004'),null);
 assert.deepEqual(r.market.skipped.map(s=>s.id).sort(),['dp1-1','ja-sm12a-003','ja-sm12a-004']);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM guide_observations').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM watchlist').get().n,1);
 db.close();
 // Running it again changes nothing.
 const again=await importCollected({from:source,to:target,port:0,backup:false,log:quiet.log});
 assert.equal(again.market.added+again.market.merged,0);assert.equal(again.sourceMap.added,0);
 assert.equal(again.observations.guide_observations.after,again.observations.guide_observations.before);
});

test('Import dry run writes nothing',async()=>{
 const {dir,source,target}=fixture(),before=readdirSync(dir).length;
 const r=await importCollected({from:source,to:target,port:0,dryRun:true,log:quiet.log});
 assert.ok(r.market.added>0);assert.equal(r.backup,null);assert.equal(readdirSync(dir).length,before);
 const db=new DatabaseSync(target,{readOnly:true});assert.equal(db.prepare("SELECT COUNT(*) AS n FROM market_cache WHERE card_id='ex2-5'").get().n,0);db.close();
});

test('Import refuses the beta, a main database, the same file and a running server',async t=>{
 assert.match(targetProblem('C:/Users/x/primal-watch/site/data/local-test.sqlite'),/beta folder/);
 assert.match(targetProblem('C:\\Users\\x\\primal-watch\\site\\data\\primal-watch.sqlite'),/beta folder/);
 assert.match(targetProblem('/home/x/repo/site/data/primal-watch.sqlite'),/--allow-main-db/);
 assert.match(targetProblem('/nowhere/local-test.sqlite'),/does not exist/);
 const {source,target}=fixture();
 await assert.rejects(importCollected({from:source,to:source,port:0,log:quiet.log}),/same file/);
 // Test the HTTP probe and refusal without requiring a listening socket.
 const port=5180,requests=[];
 t.mock.method(globalThis,'fetch',async url=>{requests.push(url);return new Response('{}',{status:200});});
 assert.equal(await serverRunning(port),true);
 await assert.rejects(importCollected({from:source,to:target,port,log:quiet.log}),/running on port/);
 assert.deepEqual(requests,[`http://127.0.0.1:${port}/api/version`,`http://127.0.0.1:${port}/api/version`]);
});

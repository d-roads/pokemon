import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {pacer,startJob,cancelJob,jobStatus} from '../lib/updater.mjs';
import {api} from '../lib/api.mjs';
import {cards,sets} from '../data/catalog.mjs';
const sql=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');

test('Pacer spaces requests evenly, halves and pauses when busy, and recovers slowly',async()=>{
 let t=0;const p=pacer({rate:4,recoverAfter:3,now:()=>t,sleep:async ms=>{t+=ms;}}),starts=[];
 for(let i=0;i<4;i++){await p.wait();starts.push(t);}
 assert.deepEqual(starts,[0,250,500,750]);
 p.busy();assert.equal(p.rate,2);
 await p.wait();assert.equal(t,750+15000,'everyone waits out the pause');
 await p.wait();assert.equal(t,15750+500,'then at half the pace');
 for(let i=0;i<3;i++)p.ok();assert.equal(p.rate,2.25);
 for(let i=0;i<10;i++)p.busy();assert.equal(p.rate,0.5,'never below the floor');
});

test('A job retries busy and timed-out pages, records other failures and pages through its progress',async()=>{
 const busy=[],pace={rate:3,wait:async()=>{},ok(){},busy(){busy.push(1);}},tries={},saved=[];
 const queue=['a','b','c','d'].map(id=>({id,source:'u/'+id}));
 const fetchPage=async url=>{
  const id=url.slice(2);tries[id]=(tries[id]||0)+1;
  if(id==='b'&&tries[id]<3)throw new Error('The price source is unavailable (429). Showing saved observations.');
  if(id==='c')throw new Error('The operation was aborted due to timeout');
  if(id==='d')throw new Error('The price source is unavailable (404). Showing saved observations.');
  return 'html:'+id;
 };
 const job=startJob(queue,{fetchPage,capture:async(card,html)=>{saved.push(html);},pace,concurrency:2});
 await job.finished;
 assert.equal(job.state,'done');assert.deepEqual(tries,{a:1,b:3,c:3,d:1});assert.equal(busy.length,2);
 assert.deepEqual(saved.sort(),['html:a','html:b']);
 const first=jobStatus(job,0,1);
 assert.deepEqual([first.done,first.updated,first.failed,first.changed.length,first.next],[4,2,2,1,1]);
 assert.equal(jobStatus(job,first.next).changed.length,1);assert.equal(jobStatus(job,first.next+1).changed.length,0);
 assert.deepEqual(first.failures.map(f=>f.card_id).sort(),['c','d']);
});

test('Cancelling stops a job before its next page',async()=>{
 const pace={rate:3,wait:async()=>{},ok(){},busy(){}};let job;
 job=startJob(['a','b','c'].map(id=>({id,source:id})),{fetchPage:async()=>'html',capture:async()=>{cancelJob(job);},pace,concurrency:1});
 await job.finished;
 assert.equal(job.state,'cancelled');assert.equal(job.done,1);assert.ok(job.finishedAt);
});

// Mirrors PriceCharting's product page markup (see provider.test.mjs).
const row=(title,price,id)=>`<tr id="${id}"><td class="date">2026-09-24</td><td class="image"></td><td class="title"><a target="_blank" href="https://www.ebay.com/itm/${id.replace(/\D/g,'')}">${title}</a> [eBay]</td><td class="numeric"><span class="js-price">$${price}</span></td><td class="numeric listed-price"></td></tr>`;
const page=`<html>PriceCharting<h1 id="product_name" class="chart_title" title="959976">Wailord EX #147 <a href="/console/pokemon-primal-clash">Pokemon Primal Clash</a></h1><table><tr><td id="used_price"><span class="price js-price">$27.00</span></td><td id="graded_price"><span class="price js-price">$265.49</span></td><td id="manual_only_price"><span class="price js-price">$533.78</span></td></tr></table><div class="completed-auctions-graded"><table><tbody>${row('Wailord EX 147/160 PSA 9','350.00','ebay-123456789')}</tbody></table></div><script>VGPC.chart_data = {"used":[[1609484400000,0],[1612162800000,1500]],"graded":[[1612162800000,20000]],"manualonly":[]};\nVGPC.pop_data = {"psa":[0,0,0,0,1,2,5,40,120,30]};</script></html>`;
const req=(path,method='GET',body,user='collector-a')=>new Request('https://primal.test'+path,{method,headers:{'oai-authenticated-user-id':user,Origin:'https://primal.test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});

test('Update sales runs on the server: recent reads are skipped, each card is saved with its observations, progress is shared',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(sql);
 const stmt=(query,values=[])=>({bind(...v){return stmt(query,v)},all:async()=>({results:sqlite.prepare(query).all(...values)}),first:async()=>sqlite.prepare(query).get(...values)||null,run:async()=>sqlite.prepare(query).run(...values)});
 const DB={prepare:stmt,batch:async items=>{sqlite.exec('BEGIN');try{const out=[];for(const s of items)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const scope=cards.filter(c=>c.setId==='xy5'&&c.eligible&&c.source),wailord=scope.find(c=>c.id==='xy5-147'),other=scope.find(c=>c!==wailord);
 // Every other card in the set was read just now, so only two are due.
 const now=new Date().toISOString(),insert=sqlite.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?)');
 for(const c of scope)if(c!==wailord&&c!==other)insert.run(c.id,JSON.stringify({guide:{raw:1},research:{status:'full',checkedAt:now}}),now);
 const fetched=[];
 const env={DB,BACKGROUND_JOBS:true,FUTURESIGHT_UPDATE_RATE:'1',fetch:async url=>{fetched.push(url);return url===wailord.source?new Response(page):new Response('missing',{status:404});}};
 assert.deepEqual(await(await api(req('/api/update','POST',{scopes:['xy5'],langs:['en']}),{DB,NETWORK_DISABLED:true})).json(),{job:null,unavailable:true},'no background jobs: the page reads batches itself');
 assert.equal((await api(req('/api/update','POST',{scopes:['nowhere']}),env)).status,400);
 assert.equal((await api(req('/api/update','POST',{scopes:['xy5'],langs:['fr']}),env)).status,400);
 const started=await(await api(req('/api/update','POST',{scopes:['xy5'],langs:['en']}),env)).json();
 assert.equal(started.mine,true);assert.equal(started.job.state,'running');assert.equal(started.job.total,2);assert.equal(started.job.skipped,scope.length-2);
 // Another account follows the running job instead of starting a second one, and cannot stop it.
 const joined=await(await api(req('/api/update','POST',{scopes:['all']},'collector-b'),env)).json();
 assert.equal(joined.joined,true);assert.equal(joined.mine,false);assert.equal(joined.job.id,started.job.id);
 assert.equal((await api(req('/api/update','DELETE',null,'collector-b'),env)).status,403);
 let status;
 for(let i=0;i<100;i++){status=(await(await api(req('/api/update?since=0'),env)).json()).job;if(status.state!=='running')break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(status.state,'done');assert.equal(status.updated,1);assert.equal(status.failed,1);assert.equal(fetched.length,2);
 assert.deepEqual(status.changed,['xy5-147']);assert.equal(status.next,1);
 assert.equal(status.failures[0].card_id,other.id);assert.match(status.failures[0].message,/404/);
 assert.ok(status.markets['xy5-147'].research.checkedAt,'the page gets the new light record');
 const saved=JSON.parse(sqlite.prepare("SELECT payload FROM market_cache WHERE card_id='xy5-147'").get().payload);
 assert.equal(saved.research.status,'full');
 assert.equal(sqlite.prepare("SELECT count(*) AS n FROM market_observations WHERE card_id='xy5-147'").get().n,1);
 assert.ok(sqlite.prepare("SELECT count(*) AS n FROM sales_observations WHERE card_id='xy5-147'").get().n>=1);
 assert.equal(sqlite.prepare("SELECT count(*) AS n FROM population_observations WHERE card_id='xy5-147'").get().n,1);
 // Only the card that could not be read is due again.
 const again=await(await api(req('/api/update','POST',{scopes:['xy5'],langs:['en']}),env)).json();
 assert.equal(again.job.total,1);assert.equal(again.job.grand,scope.length);assert.notEqual(again.job.id,started.job.id);
 assert.equal((await api(req('/api/update','DELETE'),env)).status,200);
 // Its one page may already be read before the cancel arrives; either way the job ends.
 for(let i=0;i<100&&(status.id!==again.job.id||status.state==='running');i++){status=(await(await api(req('/api/update'),env)).json()).job;await new Promise(r=>setTimeout(r,20));}
 assert.ok(['cancelled','done'].includes(status.state));assert.ok(fetched.length<=3);
});

// Mirrors a PriceCharting set listing: one product row per card, ungraded / Grade 9 / PSA 10 guide prices.
const listingRow=(card,i,[raw,g9,p10])=>`<tr id="product-${9000+i}" data-product="${9000+i}"><td class="photo"></td><td class="title" title="${9000+i}"><a href="/game/pokemon-primal-clash/x-${i}">${card.name} #${card.number}</a></td><td class="price numeric used_price"><span class="js-price">$${raw}</span></td><td class="price numeric cib_price"><span class="js-price">$${g9}</span></td><td class="price numeric new_price"><span class="js-price">$${p10}</span></td></tr>`;
const listing=(rows,cursor)=>`<html>PriceCharting<table id="games_table"><thead><tr><th>Card</th><th>Ungraded</th><th>Grade 9</th><th>PSA 10</th></tr></thead><tbody>${rows.join('')}</tbody></table>${cursor?`<form method="POST" action="" class="next_page js-next-page"><input type="hidden" name="cursor" value="${cursor}" /></form>`:''}</html>`;

test('The guide sweep reads every page of a set listing, saves guide prices with observations and skips fresh sets',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(sql);
 const stmt=(query,values=[])=>({bind(...v){return stmt(query,v)},all:async()=>({results:sqlite.prepare(query).all(...values)}),first:async()=>sqlite.prepare(query).get(...values)||null,run:async()=>sqlite.prepare(query).run(...values)});
 const DB={prepare:stmt,batch:async items=>{sqlite.exec('BEGIN');try{const out=[];for(const s of items)out.push(await s.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const set=sets.find(s=>s.id==='xy5'),scope=cards.filter(c=>c.setId==='xy5'&&c.eligible&&c.source),half=Math.ceil(scope.length/2);
 const price=i=>[10+i,100+i,1000+i];
 const page1=listing(scope.slice(0,half).map((c,i)=>listingRow(c,i,price(i))),'150'),page2=listing(scope.slice(half).map((c,i)=>listingRow(c,half+i,price(half+i))));
 const fetched=[];
 const env={DB,BACKGROUND_JOBS:true,FUTURESIGHT_UPDATE_RATE:'10',fetch:async url=>{fetched.push(url);return url===set.marketSource?new Response(page1):url===set.marketSource+'?cursor=150'?new Response(page2):new Response('missing',{status:404});}};
 assert.equal((await api(req('/api/sweep','POST',{scopes:['nowhere']}),env)).status,400);
 assert.deepEqual((await(await api(req('/api/sweep','POST',{scopes:['xy5']}),{DB})).json()).unavailable,true,'no background jobs where requests cannot outlive their response');
 const started=await(await api(req('/api/sweep','POST',{scopes:['xy5'],langs:['en']}),env)).json();
 assert.equal(started.job.total,1);assert.equal(started.mine,true);
 let status;
 for(let i=0;i<100;i++){status=await(await api(req('/api/sweep?since=0'),env)).json();if(status.job.state!=='running')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(status.job.state,'done');assert.deepEqual(status.job.changed,['xy5']);assert.equal(fetched.length,2,'both pages, nothing else');
 const last=scope.at(-1),i=scope.length-1;
 const g=status.job.markets[last.id].guide;assert.deepEqual([g.raw,g.grade9,g.psa10],[10+i,100+i,1000+i],'the page gets light records for the swept set');
 const saved=JSON.parse(sqlite.prepare('SELECT payload FROM market_cache WHERE card_id = ?').get(last.id).payload);assert.equal(saved.guide.psa10,1000+i);
 assert.equal(sqlite.prepare("SELECT count(*) AS n FROM guide_observations WHERE period='current' AND card_id = ?").get(last.id).n,3);
 assert.deepEqual({...sqlite.prepare("SELECT pages,priced,wanted FROM set_sweeps WHERE set_id='xy5'").get()},{pages:2,priced:scope.length,wanted:scope.length});
 assert.equal(status.summary.sets,1);
 // Swept just now: nothing to do unless forced.
 const fresh=await(await api(req('/api/sweep','POST',{scopes:['xy5'],langs:['en']}),env)).json();assert.equal(fresh.job,null);assert.equal(fresh.grand,1);
 const forced=await(await api(req('/api/sweep','POST',{scopes:['xy5'],langs:['en'],force:true}),env)).json();assert.equal(forced.job.total,1);
 for(let i=0;i<100;i++){status=await(await api(req('/api/sweep'),env)).json();if(status.job.state!=='running')break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(status.job.state,'done');assert.equal(fetched.length,4);
});

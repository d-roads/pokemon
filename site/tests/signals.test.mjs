import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {evaluateRule,normalizeRule} from '../lib/signals.mjs';
import {alertLimit,sendMessages} from '../lib/alerts.mjs';
import {api} from '../lib/api.mjs';

// Run a rule over a sequence of readings, as successive rebuilds would; returns which steps fired.
const run=(rule,readings)=>{let state=null;return readings.map(now=>{const r=evaluateRule({...rule,state},now);state=r.state;return r.fire;});};

test('Price levels fire once per crossing, never on the reading they were set at',()=>{
 const rule={kind:'price',params:{level:100,dir:'above'}};
 assert.deepEqual(run(rule,[{price:90},{price:105},{price:110},{price:95},{price:101}]),[false,true,false,false,true]);
 assert.deepEqual(run(rule,[{price:120},{price:130}]),[false,false],'already above when set');
 assert.deepEqual(run({kind:'price',params:{level:100,dir:'below'}},[{price:120},{price:99},{price:98}]),[false,true,false]);
});
test('Moves and unusual volume re-arm only after the condition clears',()=>{
 const move={kind:'move',params:{pct:.1,period:'30d',dir:'either'}};
 assert.deepEqual(run(move,[{ret_30d:.02},{ret_30d:-.12},{ret_30d:-.15},{ret_30d:.01},{ret_30d:.11}]),[false,true,false,false,true]);
 assert.deepEqual(run({kind:'move',params:{pct:.1,period:'7d',dir:'up'}},[{ret_7d:0},{ret_7d:-.2},{ret_7d:.2}]),[false,false,true]);
 const vol={kind:'volume',params:{mult:2}};
 assert.deepEqual(run(vol,[{sales_30d:2,sales_90d:6},{sales_30d:6,sales_90d:9},{sales_30d:9,sales_90d:12},{sales_30d:2,sales_90d:9},{sales_30d:2,sales_90d:2}]),[false,true,false,false,false],'6 ≥ 2 × 3, then still high; 2 sales is too few however low the average');
});
test('Population jumps, spread widening and demand rank compare with a baseline that resets when they fire',()=>{
 assert.deepEqual(run({kind:'pop',params:{pct:.1}},[{pop_total:100},{pop_total:105},{pop_total:111},{pop_total:115},{pop_total:123}]),[false,false,true,false,true]);
 assert.deepEqual(run({kind:'spread',params:{pct:.2}},[{spread_10_9:2},{spread_10_9:2.3},{spread_10_9:2.5},{spread_10_9:2.6}]),[false,false,true,false]);
 assert.deepEqual(run({kind:'rank',params:{places:3}},[{rank:10},{rank:8},{rank:6},{rank:5},{rank:9}]),[false,false,true,false,true]);
 const e=evaluateRule({kind:'rank',params:{places:3},state:{base:10}},{rank:6});assert.match(e.text,/up 4/);
});
test('New 52-week highs and lows fire when the guide first reaches one',()=>{
 const r={kind:'extreme',params:{}},x=(price,high=100,low=50)=>({price,high_52w:high,low_52w:low});
 assert.deepEqual(run(r,[x(80),x(100),x(110,110),x(90,110),x(50)]),[false,true,false,false,true]);
 assert.deepEqual(run(r,[x(100),x(105,105)]),[false,false],'at a high when set');
});
test('Rules are checked: kinds, targets and numbers',()=>{
 const ok={cardOk:id=>id==='base1-4',indexOk:id=>id.startsWith('en:')};
 assert.deepEqual(normalizeRule({kind:'price',target:'base1-4',grade:'psa10',params:{level:'500',dir:'below'}},ok),{rule:{kind:'price',grade:'psa10',target:'base1-4',params:{level:500,dir:'below'}},errors:[]});
 assert.ok(normalizeRule({kind:'rank',target:'en:set:base1',grade:'psa10',params:{places:2}},ok).errors.length,'demand rank is for Pokémon');
 assert.deepEqual(normalizeRule({kind:'move',target:'en:set:base1',grade:'psa10',params:{pct:.1}},ok).errors,[],'moves work on indices');
 assert.ok(normalizeRule({kind:'pop',target:'en:set:base1',grade:'psa10',params:{pct:.1}},ok).errors.length,'population is per card');
 assert.ok(normalizeRule({kind:'nope',target:'base1-4',grade:'psa10'},ok).errors.length);
 assert.ok(normalizeRule({kind:'volume',target:'base1-4',grade:'psa10',params:{mult:.5}},ok).errors.length);
});
test('With too few sales, live listing alerts can use a discount to fair value (the guide)',()=>{
 const market={guide:{psa10:1000},sales:[]};
 assert.equal(alertLimit({grade:'psa10'},market,{useSuggested:true}),null,'off by default');
 assert.deepEqual(alertLimit({grade:'psa10'},market,{useSuggested:true,useFair:true,fairDiscount:.2}),{limit:800,source:'20% below fair value (guide)'});
 assert.equal(alertLimit({grade:'psa10',target:500},market,{useFair:true}).source,'your limit');
});
test('Messages go to ntfy and Discord',async()=>{
 const sent=[];const r=await sendMessages([{title:'Charizard: Guide $31,000',body:'above your level'}],{notify:{ntfy:'fs-topic',discord:'https://discord.com/api/webhooks/1/x'}},async(url,o)=>{sent.push([url,o]);return {ok:true};});
 assert.equal(r.sent,2);assert.match(sent[0][0],/ntfy\.sh\/fs-topic/);assert.equal(sent[0][1].body,'above your level');assert.match(sent[1][1].body,/Charizard/);
});

function adapter(sqlite){
 const stmt=(query,values=[])=>({bind(...v){return stmt(query,v)},all:async()=>({results:sqlite.prepare(query).all(...values)}),first:async()=>sqlite.prepare(query).get(...values)||null,run:async()=>sqlite.prepare(query).run(...values)});
 return {prepare:stmt,batch:async items=>{const out=[];for(const s of items)out.push(await s.run());return out;}};
}
const req=(path,method='GET',body,user='collector-a')=>new Request('https://primal.test'+path,{method,headers:{'oai-authenticated-user-id':user,Origin:'https://primal.test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('Market alert routes: create with a baseline, check, see, dismiss and delete, per account',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
 const env={DB:adapter(sqlite),NETWORK_DISABLED:true};
 await api(req('/api/catalog'),env);
 sqlite.prepare("INSERT INTO card_metrics (card_id,grade,lang,as_of,price,built) VALUES ('base1-4','psa10','en','2026-10-14',24000,'x')").run();
 sqlite.prepare("INSERT INTO index_metrics (index_id,grade,lang,kind,key,as_of,ret_30d,eq_ret_30d,built) VALUES ('en:set:base1','psa10','en','set','base1','2026-10-14',.01,.02,'x')").run();
 assert.equal((await api(req('/api/signals','POST',{kind:'price',target:'base1-4',grade:'psa10',params:{}}),env)).status,400);
 let r=await(await api(req('/api/signals','POST',{kind:'price',target:'base1-4',grade:'psa10',params:{level:30000,dir:'above'}}),env)).json();
 assert.equal(r.rules.length,1);assert.deepEqual(r.rules[0].state,{side:'below'});assert.match(r.rules[0].name,/Charizard/);
 await api(req('/api/signals','POST',{kind:'move',target:'en:set:base1',grade:'psa10',params:{pct:.1,period:'30d'}}),env);
 sqlite.prepare("UPDATE card_metrics SET price = 31000").run();sqlite.prepare("UPDATE index_metrics SET eq_ret_30d = .15").run();
 r=await(await api(req('/api/signals/check','POST',{}),env)).json();
 assert.equal(r.unseen,2);assert.ok(r.events.some(e=>e.kind==='price'&&/above your \$30,000\.00 level/.test(e.title)));assert.ok(r.events.some(e=>e.kind==='move'&&/Base Set: \+15\.0% over 30 days/.test(e.title)),'indices use the typical-card return');
 r=await(await api(req('/api/signals/check','POST',{}),env)).json();assert.equal(r.events.length,2,'nothing fires twice');
 assert.equal((await(await api(req('/api/signals','GET',null,'collector-b'),env)).json()).rules.length,0,'another account sees none');
 await api(req('/api/signals','DELETE',{id:r.rules[0].id},'collector-b'),env);assert.equal((await(await api(req('/api/signals'),env)).json()).rules.length,2);
 r=await(await api(req('/api/signals','PATCH',{id:r.events[0].id,dismissed:true}),env)).json();assert.equal(r.events.length,1);
 r=await(await api(req('/api/signals','PATCH',{all:'seen'}),env)).json();assert.equal(r.unseen,0);
 r=await(await api(req('/api/signals','DELETE',{id:r.rules[0].id}),env)).json();assert.equal(r.rules.length,1);
});

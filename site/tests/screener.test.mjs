import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {normalizeScreen,screenRows,runScreen,SCREEN_FIELDS} from '../lib/screener.mjs';
import {api} from '../lib/api.mjs';
import {cards,sets} from '../data/catalog.mjs';

const card=id=>cards.find(c=>c.id===id);
test('A screen is checked: unknown fields and bad numbers are refused, swapped bounds are put in order',()=>{
 assert.deepEqual(normalizeScreen({filters:{price:[500,100]}}).screen.filters,{price:[100,500]});
 assert.match(normalizeScreen({filters:{nope:[1,2]}}).errors[0],/Unknown filter/);
 assert.match(normalizeScreen({filters:{price:['x',null]}}).errors[0],/numbers/);
 const {screen}=normalizeScreen({lang:'xx',grade:'psa8',filters:{price:[null,'']},eras:['WOTC','NOPE'],tiers:['sir','nope'],sort:{field:'nope'}},{eraIds:['WOTC']});
 assert.deepEqual(screen,{lang:'en',grade:'psa10',filters:{},eras:['WOTC'],tiers:['sir'],query:'',sort:{field:'price',dir:-1}});
 assert.ok(SCREEN_FIELDS.some(f=>f[0]==='char_premium')&&SCREEN_FIELDS.some(f=>f[0]==='set_age'));
});

test('Screens filter on card metrics, the lead Pokémon\'s demand and set age, and sort with blanks last',()=>{
 const metrics=[{card_id:'base1-4',grade:'psa10',lang:'en',price:9000,high_52w:12000,premium:4,sales_90d:3},{card_id:'base1-2',grade:'psa10',lang:'en',price:800,high_52w:800,premium:.7,sales_90d:5},{card_id:'sv3pt5-199',grade:'psa10',lang:'en',price:300,premium:2,sales_90d:null}];
 const chars=[{key:'Charizard',premium:5,premium_1y:4,eq_ret_1y:.2},{key:'Blastoise',premium:2,premium_1y:2.5,eq_ret_1y:-.1}];
 const setRows=[{key:'base1',eq_ret_1y:.3}];
 const rows=screenRows(null,{cards,sets,metrics,chars,setRows,today:Date.parse('2026-10-14')});
 const zard=rows.find(r=>r.card_id==='base1-4');
 assert.equal(zard.char,'Charizard');assert.equal(zard.char_premium,5);assert.ok(Math.abs(zard.char_demand_1y-.25)<1e-9);assert.equal(zard.char_ret_1y,.2);
 assert.equal(zard.from_high,-.25);assert.equal(zard.set_ret_1y,.3);assert.ok(zard.set_age>=330&&zard.set_age<=335,'Base Set: January 1999');assert.equal(zard.series,'WOTC');assert.equal(zard.tier,'holo');
 const run=filters=>runScreen(normalizeScreen({filters,sort:{field:'sales_90d',dir:-1}}).screen,rows,{cards}).map(r=>r.card_id);
 assert.deepEqual(run({}),['base1-2','base1-4','sv3pt5-199'],'blank values sort last');
 assert.deepEqual(run({char_premium:[3,null]}),['base1-4','sv3pt5-199'],'both Charizard');
 assert.deepEqual(run({sales_90d:[1,null]}),['base1-2','base1-4'],'a card without the value is left out');
 assert.deepEqual(runScreen(normalizeScreen({query:'blastoise'}).screen,rows,{cards}).map(r=>r.card_id),['base1-2']);
 assert.deepEqual(runScreen(normalizeScreen({eras:['SV']},{eraIds:['SV','WOTC']}).screen,rows,{cards}).map(r=>r.card_id),['sv3pt5-199']);
});

function adapter(sqlite){
 const stmt=(query,values=[])=>({bind(...v){return stmt(query,v)},all:async()=>({results:sqlite.prepare(query).all(...values)}),first:async()=>sqlite.prepare(query).get(...values)||null,run:async()=>sqlite.prepare(query).run(...values)});
 return {prepare:stmt,batch:async items=>{const out=[];for(const s of items)out.push(await s.run());return out;}};
}
const req=(path,method='GET',body,user='collector-a')=>new Request('https://primal.test'+path,{method,headers:{'oai-authenticated-user-id':user,Origin:'https://primal.test','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('The screen route runs screens and saved screens belong to one account',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
 const env={DB:adapter(sqlite),NETWORK_DISABLED:true};
 await api(req('/api/catalog'),env);
 const ins=sqlite.prepare("INSERT INTO card_metrics (card_id,grade,lang,as_of,price,premium,sales_90d,built) VALUES (?,?,?,?,?,?,?,?)");
 ins.run('base1-4','psa10','en','2026-10-14',9000,4,3,'x');ins.run('base1-2','psa10','en','2026-10-14',800,.7,5,'x');ins.run('base1-4','psa9','en','2026-10-14',2000,3,1,'x');
 sqlite.prepare("INSERT INTO metrics_runs (started_at,finished_at,as_of) VALUES ('2026-10-14T00:00:00Z','2026-10-14T00:01:00Z','2026-10-14')").run();
 let r=await(await api(req('/api/screen','POST',{screen:{grade:'psa10',filters:{premium:[1,null]}}}),env)).json();
 assert.equal(r.total,1);assert.equal(r.rows[0].card_id,'base1-4');assert.equal(r.rows[0].price,9000);assert.ok(r.fields.length>20);
 r=await(await api(req('/api/screen','POST',{screen:{grade:'psa10'},limit:1}),env)).json();assert.equal(r.total,2);assert.equal(r.rows.length,1);
 assert.equal((await api(req('/api/screen','POST',{screen:{filters:{nope:[1,2]}}}),env)).status,400);
 assert.equal((await api(req('/api/screens','POST',{name:'',screen:{}}),env)).status,400);
 r=await(await api(req('/api/screens','POST',{name:'Cheap',screen:{grade:'psa9',filters:{premium:[null,.8]}}}),env)).json();
 assert.equal(r.screens.length,1);assert.equal(r.screens[0].screen.grade,'psa9');assert.deepEqual(r.screens[0].screen.filters,{premium:[null,.8]});
 r=await(await api(req('/api/screens','POST',{name:'Cheap',screen:{grade:'psa10'}}),env)).json();assert.equal(r.screens.length,1,'same name replaces');assert.equal(r.screens[0].screen.grade,'psa10');
 assert.equal((await(await api(req('/api/screens','GET',null,'collector-b'),env)).json()).screens.length,0,'another account sees none');
 await api(req('/api/screens','DELETE',{id:r.screens[0].id},'collector-b'),env);
 assert.equal((await(await api(req('/api/screens'),env)).json()).screens.length,1,'another account cannot delete it');
 r=await(await api(req('/api/screens','DELETE',{id:r.screens[0].id}),env)).json();assert.equal(r.screens.length,0);
});

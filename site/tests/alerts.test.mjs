import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {cards} from '../data/catalog.mjs';
import {listingMatches,searchQuery,candidates,listingPrice,runScan,updateSettings,publicSettings,ntfyUrl,ebaySearchUrl,alertLimit,resetTokenCache,serpapiItems,serpapiListings,hasListingAccess} from '../lib/alerts.mjs';
const card=id=>cards.find(c=>c.id===id);
const groudon=card('xy5-151'),umbreon=card('xy10-119'),mrayquaza=card('xy6-105'),promo=card('xyp-XY121'),rc=card('bw11-RC24'),shiny=card('sm115-SV49'),tag=card('sm9-170');
const serpResult=(extra={})=>({product_id:'123456789012',title:'Primal Groudon EX 151/160 PSA 9',link:'https://www.ebay.com/itm/123456789012',price:{raw:'$100.00',extracted:100},shipping:'+$4.00 delivery',buying_format:'buy_it_now',...extra});
test('SerpApi accepts only exact USD listing prices with known shipping and an item URL',()=>{
 const results=[serpResult(),serpResult({price:{from:{raw:'$90.00',extracted:90},to:{raw:'$110.00',extracted:110}}}),serpResult({shipping:'Shipping calculated at checkout'}),serpResult({price:{raw:'C$100.00',extracted:100}}),serpResult({link:'https://www.ebay.com/itm/123456789012?var=42'}),serpResult({link:'https://ebay.com.evil.test/itm/123456789012'}),serpResult({buying_format:'unknown'})];
 const items=serpapiItems({organic_results:results});assert.equal(items.length,1);
 assert.equal(candidates(items,groudon,'psa9',104,{}).length,1);
 assert.equal(candidates(items,groudon,'psa9',103,{}).length,0,'shipping counts toward the limit');
 assert.equal(candidates(items,groudon,'psa10',104,{}).length,0);
 assert.equal(serpapiItems({organic_results:[serpResult({shipping:'Free shipping'})]})[0].shippingOptions[0].shippingCost.value,0);
});
test('SerpApi settings retain blank secrets, clear explicitly and expose no key',()=>{
 const {settings,errors}=updateSettings({},{provider:'serpapi',serpapi:{apiKey:'private-key'}});assert.deepEqual(errors,[]);
 assert.equal(hasListingAccess(settings),true);assert.equal(publicSettings(settings).configured,true);
 assert.equal(publicSettings(settings).ebay.configured,false);assert.ok(!JSON.stringify(publicSettings(settings)).includes('private-key'));
 assert.equal(updateSettings(settings,{serpapi:{apiKey:''}}).settings.serpapi.apiKey,'private-key');
 assert.equal(hasListingAccess(updateSettings(settings,{serpapi:{clear:true}}).settings),false);
 assert.equal(hasListingAccess({...settings,provider:'ebay'}),false);
 assert.ok(updateSettings(settings,{provider:'unknown'}).errors.length);
});
test('SerpApi scans use live search results and store and notify once without eBay credentials',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));const db=dbAdapter(sqlite);
 sqlite.prepare('INSERT INTO watchlist (user_id,card_id,grade,target,created_at) VALUES (?,?,?,?,?)').run('me',groudon.id,'psa9',104,'2026-10-01T00:00:00Z');
 const calls=[];let notified=0;
 const options={db,user:'me',cards,marketFor:()=>null,settings:{provider:'serpapi',serpapi:{apiKey:'private-key'}},notify:async found=>{notified+=found.length;},fetchImpl:async url=>{
  const u=new URL(url);calls.push(u);assert.equal(u.hostname,'serpapi.com');assert.equal(u.searchParams.get('engine'),'ebay');assert.equal(u.searchParams.get('_sop'),'10');assert.equal(u.searchParams.get('buying_format'),'BIN');
  assert.equal(u.searchParams.get('_udhi'),'104');assert.equal(u.searchParams.get('api_key'),'private-key');
  return Response.json({search_metadata:{status:'Success'},organic_results:[serpResult(),serpResult({product_id:'234567890123',link:'https://www.ebay.com/itm/234567890123',title:'Primal Groudon EX 151/160 PSA 10'})]});
 }};
 const first=await runScan(options);assert.equal(first.error,null);assert.equal(first.checked,1);assert.equal(first.found.length,1);
 assert.equal((await runScan(options)).found.length,0);assert.equal(notified,1);assert.equal(calls.length,2);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM alerts').get().n,1);sqlite.close();
});
test('SerpApi failures report access and quota problems without exposing a key',async()=>{
 const settings={serpapi:{apiKey:'private-key'}};
 await assert.rejects(serpapiListings(groudon,'psa9',104,settings,{fetchImpl:async()=>new Response('{}',{status:401})}),/did not accept/);
 await assert.rejects(serpapiListings(groudon,'psa9',104,settings,{fetchImpl:async()=>new Response('{}',{status:429})}),/allowance/);
 await assert.rejects(serpapiListings(groudon,'psa9',104,settings,{fetchImpl:async()=>{throw Error('url?api_key=private-key');}}),e=>!e.message.includes('private-key')&&e.message.includes('could not be reached'));
 await assert.rejects(serpapiListings(groudon,'psa9',104,settings,{fetchImpl:async()=>Response.json({error:'private-key'})}),e=>!e.message.includes('private-key'));
});
test('Search words drop the Mega prefix and EX suffix but keep the number and grade',()=>{
 assert.equal(searchQuery(groudon,'psa9'),'pokemon Primal Groudon 151 PSA 9');
 assert.equal(searchQuery(mrayquaza,'psa10'),'pokemon Rayquaza 105 PSA 10');
 assert.equal(searchQuery(promo,'raw'),'pokemon Charizard XY121');
 assert.equal(searchQuery(rc,'psa9'),'pokemon Mew RC24 PSA 9');
});
test('Listings must match the card, number, grade and exclusions',()=>{
 assert.ok(listingMatches('Primal Groudon EX 151/160 Full Art Primal Clash PSA 9 MINT',groudon,'psa9'));
 assert.ok(listingMatches('2015 Pokemon XY Primal Clash #151 Primal Groudon EX PSA 9',groudon,'psa9'));
 assert.ok(!listingMatches('Primal Groudon EX 151/160 PSA 10 GEM MINT',groudon,'psa9'),'wrong grade');
 assert.ok(!listingMatches('Primal Groudon EX 151/160 CGC 9',groudon,'psa9'),'other grader');
 assert.ok(!listingMatches('Primal Groudon EX 86/160 PSA 9',groudon,'psa9'),'wrong number');
 assert.ok(!listingMatches('Primal Groudon EX 151/160 PSA 9 Japanese',groudon,'psa9'),'language');
 assert.ok(!listingMatches('Pokemon lot Primal Groudon EX 151/160 PSA 9',groudon,'psa9'),'lot');
 assert.ok(!listingMatches('Primal Kyogre EX 151/160 PSA 9',groudon,'psa9'),'wrong name');
 assert.ok(listingMatches('M Rayquaza EX 105/108 Roaring Skies Full Art PSA 10',mrayquaza,'psa10'));
 assert.ok(listingMatches('Mega Rayquaza EX #105 Roaring Skies PSA 10 Gem Mint',mrayquaza,'psa10'));
 assert.ok(!listingMatches('Rayquaza EX 104/108 Roaring Skies PSA 10',mrayquaza,'psa10'),'non-Mega card');
 assert.ok(listingMatches('Umbreon EX 119/124 Fates Collide Full Art NM',umbreon,'raw'));
 assert.ok(!listingMatches('Umbreon EX 119/124 Fates Collide Full Art Heavily Played',umbreon,'raw'),'played raw');
 assert.ok(listingMatches('Charizard EX XY121 Black Star Promo PSA 9',promo,'psa9'));
 assert.ok(!listingMatches('Charizard EX XY29 Black Star Promo PSA 9',promo,'psa9'));
 assert.ok(listingMatches('Mew EX RC24/RC25 Legendary Treasures Full Art PSA 9',rc,'psa9'));
 assert.ok(!listingMatches('Mew EX 24/113 Legendary Treasures PSA 9',rc,'psa9'));
 assert.ok(listingMatches('Charizard GX SV49/SV94 Hidden Fates PSA 10',shiny,'psa10'));
 assert.ok(listingMatches('Latias & Latios GX 170/181 Team Up PSA 9',tag,'psa9'));
});
const item=(o={})=>({itemId:'v1|1234|0',title:'Primal Groudon EX 151/160 Primal Clash PSA 9',price:{value:'1499.00',currency:'USD'},shippingOptions:[{shippingCostType:'FIXED',shippingCost:{value:'5.00',currency:'USD'}}],buyingOptions:['FIXED_PRICE','BEST_OFFER'],itemWebUrl:'https://www.ebay.com/itm/1234',image:{imageUrl:'https://i.ebayimg.com/1.jpg'},seller:{username:'cards4u'},itemCreationDate:'2026-10-01T10:00:00.000Z',...o});
test('Prices include listed shipping and respect the limit',()=>{
 assert.deepEqual(listingPrice(item()),{price:1499,shipping:5,total:1504});
 assert.equal(listingPrice(item({price:{value:'10',currency:'GBP'}})),null);
 const s={includeAuctions:false};
 assert.equal(candidates([item()],groudon,'psa9',1504,s).length,1);
 assert.equal(candidates([item()],groudon,'psa9',1500,s).length,0,'shipping pushes it over');
 assert.equal(candidates([item({buyingOptions:['AUCTION'],currentBidPrice:{value:'200',currency:'USD'}})],groudon,'psa9',1504,s).length,0,'auctions off by default');
 assert.equal(candidates([item({buyingOptions:['AUCTION'],currentBidPrice:{value:'200',currency:'USD'}})],groudon,'psa9',1504,{includeAuctions:true})[0].total,205);
 assert.equal(candidates([item({itemWebUrl:'https://evil.example/itm/1'})],groudon,'psa9',2000,s).length,0,'only eBay links');
});
test('Settings validation masks keys and accepts ntfy topics or URLs',()=>{
 assert.equal(ntfyUrl('futuresight-7f3k'),'https://ntfy.sh/futuresight-7f3k');assert.equal(ntfyUrl('https://ntfy.example.com/my_topic'),'https://ntfy.example.com/my_topic');assert.equal(ntfyUrl('a b'),null);
 const {settings,errors}=updateSettings({},{ebay:{clientId:'Me-App-PRD-1234567',clientSecret:'PRD-s3cret'}});assert.deepEqual(errors,[]);
 const pub=publicSettings(settings);assert.equal(pub.ebay.configured,true);assert.ok(!JSON.stringify(pub).includes('s3cret'));
 assert.equal(updateSettings(settings,{ebay:{clientId:'Me-App-PRD-1234567',clientSecret:''}}).settings.ebay.clientSecret,'PRD-s3cret');
 assert.equal(updateSettings(settings,{ebay:{clear:true}}).settings.ebay.clientId,'');
 assert.ok(ebaySearchUrl(groudon,'psa9',1500).includes('_udhi=1500'));
});
test('Alert limits use your limit first, then the suggested target if allowed',()=>{
 const market={sales:[100,110,120].map((price,i)=>({grade:'psa9',date:'2026-09-2'+i,price}))},now=Date.parse('2026-10-01');
 assert.deepEqual(alertLimit({grade:'psa9',target:95},market,{},now),{limit:95,source:'your limit'});
 assert.deepEqual(alertLimit({grade:'psa9',target:null},market,{useSuggested:true},now),{limit:93.5,source:'suggested target'});
 assert.equal(alertLimit({grade:'psa9',target:null},market,{useSuggested:false},now),null);
});
function dbAdapter(sqlite){const stmt=(query,values=[])=>({bind(...v){return stmt(query,v)},all:async()=>({results:sqlite.prepare(query).all(...values)}),first:async()=>sqlite.prepare(query).get(...values)||null,run:async()=>sqlite.prepare(query).run(...values)});return {prepare:stmt};}
test('A scan stores each matching listing once and notifies only for new ones',async()=>{
 resetTokenCache();
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));const db=dbAdapter(sqlite);
 sqlite.prepare('INSERT INTO watchlist (user_id,card_id,grade,target,created_at) VALUES (?,?,?,?,?)').run('me','xy5-151','psa9',1600,'2026-10-01T00:00:00Z');
 const calls=[];const fetchImpl=async(url,init)=>{calls.push(String(url));
  if(String(url).includes('/oauth2/token'))return new Response(JSON.stringify({access_token:'tok',expires_in:7200}),{status:200});
  if(String(url).includes('/item_summary/search')){assert.equal(init.headers.Authorization,'Bearer tok');assert.match(String(url),/price%3A%5B\.\.1600%5D/);return new Response(JSON.stringify({itemSummaries:[item(),item({itemId:'v1|9|0',title:'Primal Groudon EX 151/160 PSA 10',itemWebUrl:'https://www.ebay.com/itm/9'})]}),{status:200});}
  return new Response('ok',{status:200});};
 const settings={enabled:true,ebay:{clientId:'id',clientSecret:'secret'},notify:{ntfy:'futuresight-test'}};
 let notified=[];const notify=async found=>{notified.push(...found);};
 const first=await runScan({db,user:'me',cards,marketFor:()=>null,settings,fetchImpl,notify,now:Date.parse('2026-10-01T12:00:00Z')});
 assert.equal(first.error,null);assert.equal(first.checked,1);assert.equal(first.found.length,1);assert.equal(first.found[0].total,1504);assert.equal(notified.length,1);
 const second=await runScan({db,user:'me',cards,marketFor:()=>null,settings,fetchImpl,notify,now:Date.parse('2026-10-01T12:30:00Z')});
 assert.equal(second.found.length,0);assert.equal(notified.length,1);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM alerts').get().n,1);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM alert_runs').get().n,2);
 assert.equal(calls.filter(u=>u.includes('oauth2')).length,1,'token is reused');
});
test('A rejected eBay key is reported without storing alerts',async()=>{
 resetTokenCache();
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));const db=dbAdapter(sqlite);
 sqlite.prepare('INSERT INTO watchlist (user_id,card_id,grade,target,created_at) VALUES (?,?,?,?,?)').run('me','xy5-151','psa9',1600,'2026-10-01T00:00:00Z');
 const r=await runScan({db,user:'me',cards,marketFor:()=>null,settings:{ebay:{clientId:'bad',clientSecret:'bad'}},fetchImpl:async()=>new Response('{}',{status:401}),notify:async()=>{}});
 assert.match(r.error,/did not accept/);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM alerts').get().n,0);
});

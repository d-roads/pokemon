// Japanese cards: catalog and links to English cards (task 1); matching to exact PriceCharting
// products, Japanese sale and listing rules, and language-separated rankings (task 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {api,forgetSourceMap,forgetListings} from '../lib/api.mjs';
import {parseJapaneseListing,matchJapaneseListing,japaneseTitleMatches} from '../lib/japanese.mjs';
import {matchesCard} from '../lib/sales.mjs';
import {listingMatches,searchQuery} from '../lib/alerts.mjs';
import {parseMarket,parseSet} from '../lib/provider.mjs';
import {runScan,resetTokenCache} from '../lib/alerts.mjs';
import {cards,sets} from '../data/catalog.mjs';
import japanese from '../data/japanese-catalogs.json' with {type:'json'};
const sql=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
function dbAdapter(sqlite){const stmt=(query,values=[])=>({bind(...v){return stmt(query,v)},all:async()=>({results:sqlite.prepare(query).all(...values)}),first:async()=>sqlite.prepare(query).get(...values)||null,run:async()=>sqlite.prepare(query).run(...values)});return {prepare:stmt,batch:async items=>{const out=[];for(const s of items)out.push(await s.run());return out;}};}
const sqlite=new DatabaseSync(':memory:');sqlite.exec(sql);const DB=dbAdapter(sqlite);
const req=(path,method='GET')=>new Request('https://primal.test'+path,{method,headers:{'oai-authenticated-user-id':'collector-a',Origin:'https://primal.test','Content-Type':'application/json'}});
const byId=new Map(cards.map(c=>[c.id,c]));
const ja=cards.filter(c=>c.japanese),jaSets=sets.filter(s=>s.lang==='ja');

test('Japanese sets and cards are in the catalog with unique ids, eras and no price source',()=>{
 assert.ok(jaSets.length>=100,'Japanese sets with card lists');
 assert.equal(ja.length,japanese.reduce((n,s)=>n+s.cards.length,0));
 assert.equal(new Set(cards.map(c=>c.id)).size,cards.length,'card ids are unique across languages');
 const eras=new Set(['WOTC','EX','DP','BW','XY','SM','SWSH','SV','ME']);
 for(const c of ja){
  assert.ok(c.id.startsWith('ja-'));assert.equal(c.lang,'ja');assert.ok(eras.has(c.series),c.id);
  assert.equal(c.eligible,true);assert.equal(c.source,null);assert.equal(c.sourceVerified,false);
  assert.ok(c.name&&(c.nameJa||c.counterpartReference)&&c.numberLabel,c.id);
  // TCGdex scans use the case-sensitive path TCGdex reports (ja/SV/SV2a/...); otherwise the product photo, else a placeholder.
  assert.match(c.image,/^(?:https:\/\/assets\.tcgdex\.net\/ja\/[A-Z][^/]*\/[A-Z][^/]*\/[^/]+\/high\.webp|https:\/\/storage\.googleapis\.com\/images\.pricecharting\.com\/[a-z0-9]+\/240\.jpg|data:image\/svg\+xml,)/,c.id);
  assert.equal(!!c.imagePlaceholder,c.image.startsWith('data:'),c.id);
  if(c.nameIsJapanese&&c.nameEn)assert.equal(c.name,c.nameEn,'an English guide name is shown by default: '+c.id);
 }
 for(const s of jaSets){assert.ok(s.id.startsWith('ja-'));assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(s.release),s.id);assert.ok(s.checklistSource.includes('tcgdex'));}
 // English cards keep their own data; only the cross-reference is added.
 assert.ok(cards.filter(c=>!c.japanese).every(c=>c.lang!=='ja'));
});

test('Links between Japanese and English cards point both ways and to real English cards',()=>{
 const linked=ja.filter(c=>c.englishId);
 assert.ok(linked.length>5700,'explicit printing references enable switching');
 assert.ok(ja.filter(c=>c.englishCandidateIds?.length&&!c.englishId).length>0,'unverified candidates stay disabled');
 for(const c of linked){const e=byId.get(c.englishId);assert.ok(e&&!e.japanese,c.id);assert.ok(e.japaneseIds?.includes(c.id),c.id);}
 for(const e of cards.filter(c=>c.japaneseIds))for(const id of e.japaneseIds)assert.equal(byId.get(id)?.englishId,e.id);
 // Known pairs: same artwork, matching rarity class.
 const pair=(jaId,enId)=>assert.equal(byId.get(jaId)?.englishId,enId,jaId);
 pair('ja-sv2a-201','sv3pt5-199'); // Charizard ex SAR -> Special Illustration Rare
 pair('ja-sv2a-006','sv3pt5-6');   // regular Charizard ex -> regular, not the full art
 pair('ja-pmcg1-011','base1-15');  // Venusaur holo
 // Unlinked cards say why: several candidates or none.
 for(const c of ja.filter(c=>!c.englishId))assert.equal(typeof c.englishCandidates,'number');
});

test('Japanese rarity codes follow each era and names are English where known',()=>{
 assert.equal(byId.get('ja-sv2a-201').rarity,'Special Art Rare (SAR)');
 assert.equal(byId.get('ja-sv2a-201').name,'Charizard ex');assert.equal(byId.get('ja-sv2a-201').nameJa,'リザードンex');
 const sm=ja.filter(c=>c.series==='SM'&&/Hyper Rare \(HR\)/.test(c.rarity)),sv=ja.filter(c=>['SV','ME'].includes(c.series)&&/HR/.test(c.rarity));
 assert.ok(sm.length>0);assert.equal(sv.length,0,'from Scarlet & Violet the gold card is UR, not HR');
 const named=ja.filter(c=>!c.nameIsJapanese).length;assert.ok(named/ja.length>0.75,'most cards carry an English name');
});

// PriceCharting markup, as captured from the live Japanese listing and product pages (Oct 7, 2026).
const listingRow=(id,slug,title,used,cib,nw,photo)=>`<tr id="product-${id}" data-product="${id}"><td class="image"><a href="https://www.pricecharting.com/game/pokemon-japanese-scarlet-&amp;-violet-151/${slug}">${photo?`<img class="photo" loading="lazy" src="https://storage.googleapis.com/images.pricecharting.com/${photo}/60.jpg" />`:''}</a></td><td class="title" title="${id}"><a href="/game/pokemon-japanese-scarlet-&amp;-violet-151/${slug}">${title}</a></td><td class="price numeric used_price"><span class="js-price">$${used}</span></td><td class="price numeric cib_price"><span class="js-price">$${cib}</span></td><td class="price numeric new_price"><span class="js-price">$${nw}</span></td></tr>`;
const listing=(rows,cursor)=>`<html><table>${rows.join('')}</table>${cursor?`<form><input type="hidden" name="cursor" value="${cursor}"></form>`:''}</html>`;
const saleRow=(title,price,id,date='2026-09-29')=>`<tr id="ebay-${id}"><td class="date">${date}</td><td class="image"></td><td class="title"><a target="_blank" class="js-ebay-completed-sale" href="https://www.ebay.com/itm/${id}?nordt=true">${title}</a></td><td class="numeric"><span class="js-price">$${price}</span></td><td class="numeric listed-price"></td></tr>`;
const section=(name,rows)=>`<div class="completed-auctions-${name}"><table><tbody>${rows.join('')}</tbody></table></div>`;
const productPage=(...sections)=>`<html>PriceCharting<h1 id="product_name" class="chart_title" title="5326231">Charizard EX #201 <a href="/console/pokemon-japanese-scarlet-&-violet-151">Pokemon Japanese Scarlet &amp; Violet 151</a></h1><table><tr><td id="used_price"><span class="price js-price">$327.00</span></td><td id="graded_price"><span class="price js-price">$381.97</span></td><td id="manual_only_price"><span class="price js-price">$546.14</span></td></tr></table>${sections.join('')}<script>VGPC.chart_data = {"used":[[1693526400000,30000],[1696118400000,32700]],"graded":[],"manualonly":[]};
VGPC.pop_data = {"psa":[0,0,0,0,0,0,1,4,90,410]};</script></html>`;

test('Listing pages are read and Japanese cards are matched to exact products only',()=>{
 const page=parseJapaneseListing(listing([
  listingRow(5326231,'charizard-ex-201','Charizard EX #201','327.00','381.97','546.14','nw6zzppucvgyxgqd'),
  listingRow(5326232,'charizard-ex-201-master-ball','Charizard EX [Master Ball] #201','900.00','',''),
  listingRow(5326214,'pikachu-173','Pikachu #173','28.41','52.64','106.44'),
  listingRow(5326300,'bulbasaur-166','Bulbasaur #166','12.00','',''),
  listingRow(5326301,'bulbasaur-166-2','Bulbasaur #166','10.00','','')],'150'));
 assert.equal(page.cursor,'150');assert.equal(page.rows.length,5);
 assert.deepEqual(page.rows[0],{productId:'5326231',path:'/game/pokemon-japanese-scarlet-&-violet-151/charizard-ex-201',title:'Charizard EX #201',name:'Charizard EX',number:'201',variant:false,prices:[327,381.97,546.14],image:'https://storage.googleapis.com/images.pricecharting.com/nw6zzppucvgyxgqd/240.jpg'});
 assert.equal(page.rows[2].image,null,'no photo, no image');
 assert.equal(page.rows[1].variant,true);
 const set=cards.filter(c=>c.setId==='ja-sv2a');
 const {matches,unmatched}=matchJapaneseListing(page.rows,set);
 assert.equal(matches.get('ja-sv2a-201').productId,'5326231','the plain product, never the Master Ball variant');
 assert.equal(matches.get('ja-sv2a-201').rule,'number+name');
 assert.equal(matches.get('ja-sv2a-173')?.productId,'5326214');
 // Two products with the same name and number: left unmatched rather than guessed.
 const c166=set.find(c=>c.number===166);assert.equal(c166.name,'Bulbasaur');assert.ok(!matches.has(c166.id));
 assert.match(unmatched.find(u=>u.id===c166.id).reason,/several products/);
 // Wizards-era Japanese cards are listed by Pokédex number, with a name check.
 const wotc=cards.find(c=>c.id==='ja-pmcg1-011');// Venusaur
 const w=matchJapaneseListing(parseJapaneseListing(listing([listingRow(1,'venusaur-3','Venusaur #3','100','200','900'),listingRow(2,'ivysaur-2','Ivysaur #2','5','','')])).rows,[wotc]);
 assert.equal(w.matches.get('ja-pmcg1-011')?.productId,'1');
});

test('Pokédex-numbered sets never match a trainer by number alone, and older such matches are forgotten',async()=>{
 // Devolution Spray is #086 in the Japanese Expansion Pack; PriceCharting's #86 there is Seel (Pokédex number).
 const spray=cards.find(c=>c.id==='ja-pmcg1-086');assert.ok(spray&&!spray.dexId?.length);
 const page=parseJapaneseListing(listing([listingRow(1,'seel-86','Seel #86','5.00','','')]));
 const {matches}=matchJapaneseListing(page.rows,[spray]);assert.equal(matches.size,0);
 const s=new DatabaseSync(':memory:');s.exec(sql);const db=dbAdapter(s);
 s.prepare('INSERT INTO source_map (card_id,url,product_id,name,rule,map_version,mapped_at) VALUES (?,?,?,?,?,?,?)').run('ja-pmcg1-086','https://www.pricecharting.com/game/pokemon-japanese-expansion-pack/seel-86','1','Seel','number-only','ja-map-2026.10.07','2026-10-07T00:00:00Z');
 s.prepare('INSERT INTO source_map (card_id,url,product_id,name,rule,map_version,mapped_at) VALUES (?,?,?,?,?,?,?)').run('ja-sv2a-201','https://www.pricecharting.com/game/pokemon-japanese-scarlet-&-violet-151/charizard-ex-201','2','Charizard EX','number+name','ja-map-2026.10.07','2026-10-07T00:00:00Z');
 s.prepare('INSERT INTO market_cache (card_id,payload,fetched_at) VALUES (?,?,?)').run('ja-pmcg1-086',JSON.stringify({guide:{raw:5},sales:[],observedAt:'2026-10-07T00:00:00Z'}),'2026-10-07T00:00:00Z');
 forgetSourceMap();
 try{
  await api(req('/api/catalog'),{DB:db,NETWORK_DISABLED:true});
  assert.equal(byId.get('ja-pmcg1-086').source,null);assert.notEqual(byId.get('ja-pmcg1-086').name,'Seel');
  assert.ok(byId.get('ja-sv2a-201').source,'name matches are kept');
  assert.equal(s.prepare("SELECT count(*) n FROM source_map WHERE card_id='ja-pmcg1-086'").get().n,0);
  assert.equal(s.prepare("SELECT count(*) n FROM market_cache WHERE card_id='ja-pmcg1-086'").get().n,0);
 }finally{forgetSourceMap();}
});
test('Japanese sale titles: Japanese printing, right card and number, no other language',()=>{
 const card=byId.get('ja-sv2a-201');
 for(const t of ['2023 Pokemon Japanese 151 Charizard EX SAR 201 NM Japanese 201/165','2023 POKEMON JAPANESE SV2A-POKEMON 151 SPECIAL ART RARE #201 CHARIZARD EX PSA 9 #201','Pokemon Card Game Charizard ex SAR 201/165 sv2a 151 Scarlet & Violet TCG Holo Japanese'])assert.equal(japaneseTitleMatches(t,card),true,t);
 for(const t of ['Charizard ex 199/165 English 151','Charizard ex 201/165 korean','Charizard ex lot 201/165','Charizard ex 006/165 Japanese','Charizard ex 201/165 Master Ball Japanese'])assert.equal(japaneseTitleMatches(t,card),false,t);
 // Words in the set's or card's own name are not listing exclusions: Dream League, Reset Stamp, Iron Bundle.
 const piplup=cards.find(c=>c.id==='ja-sm11b-052');
 assert.equal(japaneseTitleMatches('Piplup #52 Pokemon Japanese Dream League',piplup),true);
 assert.equal(japaneseTitleMatches('Piplup CHR 052/049 SM11b Cosmic Eclipse Dream League Japanese',piplup),true);
 assert.equal(japaneseTitleMatches('Piplup 052/049 Dream League lot of 3',piplup),false);
 assert.equal(japaneseTitleMatches('Piplup 052/049 Dream League English',piplup),false);
 const stamp={...cards.find(c=>c.id==='ja-sm10a-068'),pcName:'Reset Stamp',nameFromGuide:true};assert.equal(cards.find(c=>c.id==='ja-sm10a-068').name,'Reset Stamp','English guide name by default');
 assert.equal(japaneseTitleMatches('Reset Stamp 068/054 UR Japanese',stamp),true);
 // The shared matcher sends Japanese cards to these rules and still rejects Japanese titles for English cards.
 assert.equal(matchesCard('Charizard ex 201/165 Japanese',card),true);
 assert.equal(matchesCard('Charizard ex 199/165 Japanese 151',byId.get('sv3pt5-199')),false);
 // Real titles from PriceCharting: series names with "&" are not a second card; VS and web were only
 // printed as 1st Edition; elsewhere 1st Edition is another product.
 assert.equal(japaneseTitleMatches('2022 POKEMON JAPANESE SWORD & SHIELD VSTAR UNIVERSE FULL ART/LEAFEON VSTAR PSA 9 #210',byId.get('ja-s12a-210')),true);
 assert.equal(japaneseTitleMatches("Falkner's Skarmory 007/141 VS Series 1st Edition Japanese Pokémon Card",{...byId.get('ja-vs1-007'),name:"Falkner's Skarmory",nameFromGuide:true}),true);
 assert.equal(japaneseTitleMatches('Vileplume 1st Ed Holo Wind from the Sea 004/087 Holo Japanese',byId.get('ja-e3-004')),false);
 assert.equal(japaneseTitleMatches('Pikachu & Zekrom GX 001/095 Japanese',byId.get('ja-sm9-001')),false,'a tag team must name its own partners');
 const wotc={...byId.get('ja-pmcg1-011'),name:'Venusaur'};
 assert.equal(japaneseTitleMatches('1996 POKEMON BASE SET JAPANESE #3 VENUSAUR-HOLO PSA 9',wotc),true);
 assert.equal(japaneseTitleMatches('Pokemon PSA 6/5/7 Venusaur Charizard Blastoise #3-6-9 Holo Base Set Japanese',wotc),false);
});

test('Mapping a Japanese set saves verified products and guide prices; refresh then reads Japanese sales',async()=>{
 const s=new DatabaseSync(':memory:');s.exec(sql);const db=dbAdapter(s),env={DB:db,NETWORK_DISABLED:false,LISTING_PAUSE_MS:0,LISTING_RETRY_MS:0};
 const realFetch=globalThis.fetch,asked=[];let limited=1;forgetListings();
 globalThis.fetch=async url=>{url=String(url);asked.push(url);
  if(url.includes('/console/pokemon-japanese-scarlet-&-violet-151?view=table&cursor=150'))return new Response(listing([listingRow(5326214,'pikachu-173','Pikachu #173','28.41','52.64','106.44')]));
  if(url.includes('/console/pokemon-japanese-scarlet-&-violet-151?view=table')&&limited-->0)return new Response('slow down',{status:429});
  if(url.includes('/console/pokemon-japanese-scarlet-&-violet-151?view=table'))return new Response(listing([listingRow(5326231,'charizard-ex-201','Charizard EX #201','327.00','381.97','546.14')],'150'));
  if(url.includes('/game/pokemon-japanese-scarlet-&-violet-151/charizard-ex-201'))return new Response(productPage(
   section('used',[saleRow('2023 Pokemon Japanese 151 Charizard EX SAR 201 NM Japanese 201/165',323.99,1001),saleRow('Charizard ex 199/165 English 151 SIR',150,1002),saleRow('Charizard ex 201/165 Korean',90,1003)]),
   section('graded',[saleRow('2023 POKEMON JAPANESE SV2A-POKEMON 151 SPECIAL ART RARE #201 CHARIZARD EX PSA 9 #201',295,1004)]),
   section('manual-only',[saleRow('2023 Pokemon SV 151 JP Charizard ex Special Art Rare #201/165 PSA 10 GEM MINT',606,1005)])));
  return new Response('not found',{status:404});};
 try{
  forgetSourceMap();
  const r=await(await api(req('/api/refresh?set=ja-sv2a','POST'),env)).json();
  assert.equal(r.refreshed,true);assert.equal(r.mapped,2);assert.equal(r.pages,2,'a 429 is retried, then both pages are read');
  assert.equal(r.sources['ja-sv2a-201'].source,'https://www.pricecharting.com/game/pokemon-japanese-scarlet-&-violet-151/charizard-ex-201');
  assert.deepEqual(r.markets['ja-sv2a-201'].guide,{raw:327,grade9:381.97,psa10:546.14});
  assert.equal(s.prepare('SELECT count(*) n FROM source_map').get().n,2);
  const card=byId.get('ja-sv2a-201');assert.equal(card.sourceVerified,true);assert.equal(card.pcName,'Charizard EX');
  // Update sales now includes the matched Japanese cards, and only them with lang=ja.
  const research=await(await api(req('/api/research?set=era:SV&lang=ja','POST'),{DB:db,NETWORK_DISABLED:true})).json();assert.equal(research.total,2);
  // Full page: only the Japanese sales of this card count.
  const m=await(await api(req('/api/market?id=ja-sv2a-201&refresh=1'),env)).json();
  assert.equal(m.refreshed,true,m.warning);
  assert.deepEqual(m.market.sales.map(x=>[x.grade,x.price]).sort(),[['psa10',606],['psa9',295],['raw',323.99]]);
  assert.equal(m.market.research.excluded.raw,2);
  // The mapping survives a restart: a fresh process reads it back from the database.
  forgetSourceMap();assert.equal(card.source,null);
  await api(req('/api/catalog'),env);assert.equal(card.source,r.sources['ja-sv2a-201'].source);
  // Observations record the language.
  assert.ok(s.prepare("SELECT count(*) n FROM sales_observations WHERE card_id='ja-sv2a-201' AND language='ja'").get().n>=3);
 }finally{globalThis.fetch=realFetch;forgetSourceMap();forgetListings();}
});

test('An unmatched Japanese card stays unpriced but a manual limit enables Japanese listing alerts',async()=>{
 forgetSourceMap();
 const card=byId.get('ja-sv2a-201');
 assert.throws(()=>parseMarket('<h1 id="product_name">Charizard EX #201</h1>PriceCharting',card),/not loaded yet/);
 resetTokenCache();
 const s=new DatabaseSync(':memory:');s.exec(sql);const db=dbAdapter(s);
 s.prepare('INSERT INTO watchlist (user_id,card_id,grade,target,created_at) VALUES (?,?,?,?,?)').run('me','ja-sv2a-201','psa10',null,'2026-10-01T00:00:00Z');
 const searched=[];const fetchImpl=async url=>{if(String(url).includes('/oauth2/token'))return new Response(JSON.stringify({access_token:'t',expires_in:7200}),{status:200});searched.push(String(url));return new Response(JSON.stringify({itemSummaries:[]}),{status:200});};
 const settings={enabled:true,ebay:{clientId:'id',clientSecret:'secret'},notify:{ntfy:'t'}};
 let r=await runScan({db,user:'me',cards,marketFor:()=>null,settings,fetchImpl,notify:async()=>{}});
 assert.equal(r.checked,0);assert.equal(searched.length,0);assert.match(r.skipped[0].reason,/Japanese card has no matched price product/);
 // A collector's explicit target does not require price-guide data.
 s.prepare('UPDATE watchlist SET target = 500 WHERE user_id = ?').run('me');
 r=await runScan({db,user:'me',cards,marketFor:()=>null,settings,fetchImpl,notify:async()=>{}});
 assert.equal(r.checked,1);assert.match(decodeURIComponent(searched[0]),/japanese/i);
 // Once matched, it is still searched as a Japanese listing and only Japanese titles qualify.
 card.source='https://www.pricecharting.com/game/pokemon-japanese-scarlet-&-violet-151/charizard-ex-201';card.sourceVerified=true;card.pcName='Charizard EX';
 try{
  assert.match(searchQuery(card,'psa10'),/japanese/i);
  assert.equal(listingMatches('Charizard ex SAR 201/165 Pokemon 151 Japanese PSA 10',card,'psa10'),true);
  assert.equal(listingMatches('Charizard ex SAR 201/165 Pokemon 151 PSA 10',card,'psa10'),false,'must say Japanese');
  assert.equal(listingMatches('Charizard ex SIR 199/165 Pokemon 151 PSA 10',byId.get('sv3pt5-199'),'psa10'),true,'English rules unchanged');
  assert.equal(listingMatches('Charizard ex SIR 199/165 Pokemon 151 Japanese PSA 10',byId.get('sv3pt5-199'),'psa10'),false);
  r=await runScan({db,user:'me',cards,marketFor:()=>null,settings,fetchImpl,notify:async()=>{}});
  assert.equal(r.checked,1);assert.match(decodeURIComponent(searched[0]),/japanese/i);
 }finally{forgetSourceMap();}
});

test('With no Japanese prices loaded, movers, investments and scores contain no Japanese cards',async()=>{
 const env={DB,NETWORK_DISABLED:true};
 const scores=await(await api(req('/api/scores'),env)).json();
 assert.ok(Object.keys(scores.scores||{}).every(id=>!id.startsWith('ja-')));
 assert.ok(Object.keys(scores.scores).length>1000);
 const movers=await(await api(req('/api/movers?period=month'),env)).json(),moved=Object.values(movers.grades).flatMap(g=>g.movers);
 assert.ok(moved.length>0);assert.ok(moved.every(m=>!m.card_id.startsWith('ja-')));
 const invest=await(await api(req('/api/investments'),env)).json(),picks=Object.values(invest.grades).flatMap(g=>g.picks);
 assert.ok(picks.length>0);assert.ok(picks.every(p=>!p.card_id.startsWith('ja-')));
});

test('Rankings never mix languages: lang=en|ja on movers and investments, scores per language',async()=>{
 const env={DB,NETWORK_DISABLED:true};
 const jm=await(await api(req('/api/movers?period=month&lang=ja'),env)).json();
 assert.equal(jm.lang,'ja');assert.ok(Object.values(jm.grades).every(g=>g.movers.length===0),'no Japanese prices yet, so no Japanese movers');
 const em=await(await api(req('/api/movers?period=month&lang=en'),env)).json(),dm=await(await api(req('/api/movers?period=month'),env)).json();
 assert.equal(em.lang,'en');assert.deepEqual(em.grades,dm.grades,'English is the default');
 const ji=await(await api(req('/api/investments?lang=ja'),env)).json();assert.equal(ji.lang,'ja');assert.ok(Object.values(ji.grades).every(g=>g.picks.length===0));
 assert.equal((await api(req('/api/movers?lang=fr'),env)).status,400);assert.equal((await api(req('/api/investments?lang=fr'),env)).status,400);
 // English scores are exactly what English cards alone produce.
 const {investmentScores}=await import('../lib/score.mjs'),{snapshots}=await import('../data/market.mjs');
 const alone=investmentScores(cards.filter(c=>!c.japanese).map(c=>[c,snapshots[c.id]]));
 const served=(await(await api(req('/api/scores'),env)).json()).scores;
 for(const id of Object.keys(alone.scores).slice(0,200))assert.deepEqual(served[id],alone.scores[id],id);
});

test('TAG and ACE are graders only with a grade: Tag All Stars, TAG TEAM and ACE SPEC titles count',async()=>{
 const {gradeOf}=await import('../lib/sales.mjs');
 assert.equal(gradeOf('Bounsweet 012/173 Tag All Stars Japanese LP'),'raw');
 assert.equal(gradeOf('Pikachu & Zekrom GX TAG TEAM 33/181 NM'),'raw');
 assert.equal(gradeOf('ACE SPEC Prime Catcher 157/162'),'raw');
 assert.equal(gradeOf('Charizard Tag Team PSA 10'),'psa10');
 for(const t of ['TAG 10 PRISTINE Charizard ex 201/165','Charizard ex TAG 9 MINT','Charizard ACE 10 Japanese','Charizard CGC 9'])assert.equal(gradeOf(t),null,t);
});

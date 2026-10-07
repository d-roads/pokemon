import test from 'node:test';
import assert from 'node:assert/strict';
import {cards} from '../data/catalog.mjs';
import {manualSearchQuery,manualSearchUrl,affiliateOptions,ebayAffiliateLink} from '../lib/ebay-links.mjs';
const card=id=>cards.find(c=>c.id===id);
test('Manual template identifies the printing and accommodates PSA/Mega seller spellings',()=>{
 const query=manualSearchQuery(card('xy5-151'),'psa9');
 assert.match(query,/Pokemon Primal Groudon EX Primal Clash 151 \("PSA 9",PSA9\)/);
 assert.match(query,/-proxy -replica -lot -bundle/);
 assert.match(manualSearchQuery(card('xy6-105'),'psa10'),/\(M,Mega\) Rayquaza EX Roaring Skies 105/);
 assert.match(manualSearchQuery(card('xyp-XY121'),'psa9'),/Charizard EX Promo XY121/);
 assert.match(manualSearchQuery(card('bw11-RC24'),'psa9'),/RC24/);
 assert.doesNotMatch(manualSearchQuery(card('xy5-151'),'psa9',{broad:true}),/Primal Clash/);
});
test('Japanese and vintage templates use the native printing, with padded-number alternatives',()=>{
 const venusaur=manualSearchQuery(card('ja-pmcg1-011'),'psa9');
 assert.match(venusaur,/Japanese Venusaur Base \(003,3\)/);assert.doesNotMatch(venusaur,/\b11\b|011|102/);
 assert.match(manualSearchQuery(card('ja-sv2a-201'),'psa10'),/Japanese Charizard ex 151 201/);
 assert.match(manualSearchQuery(card('ja-sv2a-006'),'psa9'),/\(006,6\)/);
 const trainer=manualSearchQuery(card('ja-pmcg1-091'),'psa9');assert.doesNotMatch(trainer,/091|\b91\b|\b035\b/);
});
test('Raw manual searches ask for near mint and exclude graded cards',()=>{
 const query=manualSearchQuery(card('sv3pt5-199'),'raw');
 assert.match(query,/\(NM,"near mint"\)/);assert.match(query,/-PSA -BGS -CGC -SGC -graded/);
 assert.doesNotMatch(query,/\bRaw\b/);
});
test('Manual URLs preserve optional decimal caps, auctions and edited queries',()=>{
 const c=card('xy5-151'),url=new URL(manualSearchUrl(c,'psa9',1499.95));
 assert.equal(url.searchParams.get('_udhi'),'1499.95');assert.equal(url.searchParams.get('_sop'),'12');assert.equal(url.searchParams.get('LH_BIN'),'1');
 const broad=new URL(manualSearchUrl(c,'psa9',null,{auctions:true,query:'Pokemon Groudon 151 PSA9'}));
 assert.equal(broad.searchParams.get('_nkw'),'Pokemon Groudon 151 PSA9');assert.equal(broad.searchParams.has('_udhi'),false);assert.equal(broad.searchParams.has('LH_BIN'),false);
});
test('EPN is opt-in and preserves search filters with exactly one campaign',()=>{
 const c=card('sv3pt5-199'),plain=manualSearchUrl(c,'psa10',99.95);
 for(const campaign of ['', 'not-a-campaign','0'])assert.equal(manualSearchUrl(c,'psa10',99.95,{affiliate:affiliateOptions({EBAY_EPN_CAMPAIGN_ID:campaign})}),plain);
 const affiliate=affiliateOptions({EBAY_EPN_CAMPAIGN_ID:'5331234567',EBAY_EPN_CUSTOM_ID:'manual-search'}),url=new URL(manualSearchUrl(c,'psa10',99.95,{affiliate}));
 assert.equal(url.searchParams.get('campid'),'5331234567');assert.equal(url.searchParams.get('mkrid'),'711-53200-19255-0');assert.equal(url.searchParams.get('mkcid'),'1');assert.equal(url.searchParams.get('mkevt'),'1');assert.equal(url.searchParams.get('toolid'),'10001');
 assert.equal(url.searchParams.get('_udhi'),'99.95');assert.equal(url.searchParams.get('_nkw'),manualSearchQuery(c,'psa10'));assert.equal(url.searchParams.get('customid'),'manual-search');
 assert.equal(new URL(ebayAffiliateLink(url.toString(),affiliate)).searchParams.getAll('campid').length,1);
 assert.equal(ebayAffiliateLink('https://ebay.com.evil.test/sch/i.html',affiliate),'https://ebay.com.evil.test/sch/i.html');
});

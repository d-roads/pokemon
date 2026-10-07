// Listing alerts: look for newly posted listings of watched cards priced at or below the buy limit.
//
// Live listings come from the eBay Browse API (item_summary/search) with the collector's own
// eBay developer keys. Every listing is re-checked against the card number, grade and listing
// exclusions before it can become an alert, and each listing alerts only once.
import {gradeOf,conditionOf,collector,EXCLUDED_LISTING} from './sales.mjs';
import {analyze} from './analysis.mjs';

export const EBAY_CATEGORY='183454';
export const DEFAULT_SETTINGS={enabled:false,intervalMinutes:30,includeAuctions:false,useSuggested:true,ebay:{clientId:'',clientSecret:''},notify:{ntfy:'',discord:''}};
const GRADE_QUERY={raw:'',psa9:'PSA 9',psa10:'PSA 10'};

export function normalizeSettings(raw){
 const s=raw&&typeof raw==='object'?raw:{};
 return {enabled:!!s.enabled,intervalMinutes:Math.min(720,Math.max(10,Math.round(Number(s.intervalMinutes)||DEFAULT_SETTINGS.intervalMinutes))),includeAuctions:!!s.includeAuctions,useSuggested:s.useSuggested!==false,
  ebay:{clientId:String(s.ebay?.clientId||'').trim().slice(0,200),clientSecret:String(s.ebay?.clientSecret||'').trim().slice(0,200)},
  notify:{ntfy:String(s.notify?.ntfy||'').trim().slice(0,300),discord:String(s.notify?.discord||'').trim().slice(0,300)}};
}
// Merge a settings update. Blank secrets keep the saved value so the page never needs to hold them.
export function updateSettings(current,input){
 const base=normalizeSettings(current),next=normalizeSettings({...base,...input,ebay:{...base.ebay,...(input?.ebay||{})},notify:{...base.notify,...(input?.notify||{})}});
 if(input?.ebay&&!input.ebay.clientSecret)next.ebay.clientSecret=base.ebay.clientSecret;
 if(input?.ebay?.clear)next.ebay={clientId:'',clientSecret:''};
 const errors=[];
 if(next.notify.ntfy&&!ntfyUrl(next.notify.ntfy))errors.push('Enter an ntfy topic (letters, numbers, - or _) or an https:// ntfy URL.');
 if(next.notify.discord&&!/^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(next.notify.discord))errors.push('Enter a Discord webhook URL that starts with https://discord.com/api/webhooks/.');
 return {settings:next,errors};
}
export const hasEbayKeys=s=>!!(s?.ebay?.clientId&&s?.ebay?.clientSecret);
export function publicSettings(s){
 const n=normalizeSettings(s),id=n.ebay.clientId;
 return {enabled:n.enabled,intervalMinutes:n.intervalMinutes,includeAuctions:n.includeAuctions,useSuggested:n.useSuggested,notify:n.notify,
  ebay:{configured:hasEbayKeys(n),clientId:id?id.slice(0,6)+'…'+id.slice(-4):'',hasSecret:!!n.ebay.clientSecret}};
}
export function ntfyUrl(value){
 const v=String(value||'').trim();
 if(/^[A-Za-z0-9_-]{4,64}$/.test(v))return 'https://ntfy.sh/'+v;
 if(/^https:\/\/[a-z0-9.-]+(?::\d+)?\/[A-Za-z0-9_-]{4,64}$/i.test(v))return v;
 return null;
}

// Search words for a card: its name without the Mega prefix or EX suffix (sellers write these many
// ways), its collector number, and the grade. Results are filtered strictly afterwards.
export function searchQuery(card,grade){
 const core=card.name.replace(/^M\s+/,'').replace(/\s*(?:EX|BREAK)$/,'').replace(/[^\p{L}\p{N}' .-]/gu,' ').replace(/\s+/g,' ').trim();
 const num=String(card.number).toUpperCase().startsWith('XY')?'XY'+Number(String(card.number).slice(2)):String(card.number);
 return ['pokemon',core,num,GRADE_QUERY[grade]].filter(Boolean).join(' ');
}

const words=s=>s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean);
export function listingMatches(title,card,grade){
 const t=String(title||'');
 if(!t||EXCLUDED_LISTING.test(t)||/\b(?:you pick|pick your|choose|complete set|binder|booster (?:pack|box)|sealed|(?:case|pack|box) break)\b/i.test(t))return false;
 if((t.match(/\s&\s/g)||[]).length>(card.name.match(/\s&\s/g)||[]).length)return false;
 if(gradeOf(t)!==grade)return false;
 if(grade==='raw'&&['Damaged','HP','MP'].includes(conditionOf(t)))return false;
 const tw=new Set(words(t)),core=words(card.name.replace(/^M\s+/,'').replace(/\s*(?:EX|BREAK)$/,''));
 if(!core.filter(w=>w.length>2).every(w=>tw.has(w)))return false;
 if(/^M\s/.test(card.name)&&!/\b(?:m|mega)\b/i.test(t))return false;
 if(/\bEX$/.test(card.name)&&!/\bex\b/i.test(t))return false;
 if(/\bBREAK$/.test(card.name)&&!/\bbreak\b/i.test(t))return false;
 const expected=collector(card.number),prefix=expected.match(/^[A-Z]+/)?.[0]||'',total=prefix+card.printedTotal;
 const numbered=[...t.matchAll(/\b((?:XY|RC|SV)?\s*\d+[a-z]?)\s*\/\s*((?:XY|RC|SV)?\s*\d+[a-z]?)\b/gi)];
 if(expected.startsWith('XY'))return [...t.matchAll(/\bXY\s*0*(\d+)(?![a-z\d])/gi)].some(m=>'XY'+Number(m[1])===expected);
 if(numbered.length)return numbered.every(m=>collector(m[1])===expected&&collector(m[2])===total);
 const parts=expected.match(/^([A-Z]*)(\d+)([A-Z]?)$/);if(!parts)return false;
 return new RegExp((parts[1]?'\\b'+parts[1]+'\\s*0*':'(?:#|\\bno\\.?\\s*|\\b)0*')+parts[2]+parts[3]+'(?![a-z\\d/])','i').test(t);
}

// The price an alert is measured against: the collector's own limit, else the suggested target.
export function alertLimit(watch,market,settings,now=Date.now()){
 if(watch.target>0)return {limit:watch.target,source:'your limit'};
 if(normalizeSettings(settings).useSuggested){const a=analyze(market,watch.grade,15,now);if(a.target>0)return {limit:a.target,source:'suggested target'};}
 return null;
}

export function listingPrice(item){
 const price=Number(item?.price?.value);if(!(price>0)||(item.price.currency&&item.price.currency!=='USD'))return null;
 const costs=(item.shippingOptions||[]).map(o=>o?.shippingCost).filter(c=>c&&(!c.currency||c.currency==='USD')).map(c=>Number(c.value)).filter(v=>v>=0);
 const shipping=costs.length?Math.min(...costs):null;
 return {price,shipping,total:Math.round((price+(shipping??0))*100)/100};
}

export function ebaySearchUrl(card,grade,limit,{auctions=false}={}){
 const p=new URLSearchParams({_nkw:searchQuery(card,grade),_sacat:EBAY_CATEGORY,_sop:'10'});
 if(limit>0)p.set('_udhi',String(Math.floor(limit)));
 if(!auctions)p.set('LH_BIN','1');
 return 'https://www.ebay.com/sch/i.html?'+p.toString();
}

let tokenCache=null;
export async function ebayToken(settings,fetchImpl=fetch,now=Date.now()){
 const {clientId,clientSecret}=settings.ebay;
 if(tokenCache&&tokenCache.key===clientId&&tokenCache.expires>now+60000)return tokenCache.token;
 const basic=typeof btoa==='function'?btoa(clientId+':'+clientSecret):Buffer.from(clientId+':'+clientSecret).toString('base64');
 const r=await fetchImpl('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:'Basic '+basic},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope'),signal:AbortSignal.timeout(15000)});
 const body=await r.json().catch(()=>({}));
 if(!r.ok||!body.access_token)throw new Error(r.status===401?'eBay did not accept these API keys. Check the Client ID and Client Secret.':'eBay sign-in failed ('+r.status+').');
 tokenCache={key:clientId,token:body.access_token,expires:now+Number(body.expires_in||7200)*1000};
 return body.access_token;
}
export function resetTokenCache(){tokenCache=null;}

export async function searchListings(card,grade,limit,settings,{fetchImpl=fetch,token}){
 const filter=['price:[..'+Math.ceil(limit)+']','priceCurrency:USD','buyingOptions:{'+(settings.includeAuctions?'FIXED_PRICE|BEST_OFFER|AUCTION':'FIXED_PRICE|BEST_OFFER')+'}'].join(',');
 const url='https://api.ebay.com/buy/browse/v1/item_summary/search?'+new URLSearchParams({q:searchQuery(card,grade),category_ids:EBAY_CATEGORY,filter,sort:'newlyListed',limit:'50'});
 const r=await fetchImpl(url,{headers:{Authorization:'Bearer '+token,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US',Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(r.status===429)throw new Error('eBay rate limit reached. Alerts will retry on the next scan.');
 if(!r.ok)throw new Error('eBay search failed ('+r.status+').');
 const body=await r.json();return body.itemSummaries||[];
}

// Turn search results into alert candidates for one watched card and grade.
export function candidates(items,card,grade,limit,settings){
 const out=[];
 for(const item of items){
  const opts=item.buyingOptions||[];
  if(!settings.includeAuctions&&!opts.some(o=>o==='FIXED_PRICE'||o==='BEST_OFFER'))continue;
  if(!listingMatches(item.title,card,grade))continue;
  const p=listingPrice(item);if(!p)continue;
  const auctionOnly=opts.includes('AUCTION')&&!opts.includes('FIXED_PRICE');
  const price=auctionOnly&&item.currentBidPrice?Number(item.currentBidPrice.value):p.price;
  const total=Math.round((price+(p.shipping??0))*100)/100;
  if(!(total<=limit))continue;
  out.push({listing_id:String(item.itemId||item.legacyItemId||item.itemWebUrl),title:String(item.title).slice(0,200),price,shipping:p.shipping,total,currency:'USD',url:item.itemWebUrl||item.itemAffiliateWebUrl,image:item.image?.imageUrl||item.thumbnailImages?.[0]?.imageUrl||null,buying_option:auctionOnly?'Auction':opts.includes('FIXED_PRICE')?'Buy It Now':'Best Offer',seller:item.seller?.username||null,listed_at:item.itemCreationDate||null});
 }
 return out.filter(c=>/^https:\/\/(?:www\.)?ebay\.com\//.test(c.url||''));
}

const changes=r=>Number(r?.changes??r?.meta?.changes??0);

export async function runScan({db,user,cards,marketFor,settings,fetchImpl=fetch,now=Date.now(),notify=sendNotifications}){
 const s=normalizeSettings(settings);
 const started=new Date(now).toISOString();
 if(!hasEbayKeys(s))return {checked:0,found:[],skipped:[],error:'Add your eBay API keys to scan live listings.'};
 const watch=(await db.prepare('SELECT card_id,grade,target FROM watchlist WHERE user_id = ? ORDER BY created_at DESC').bind(user).all()).results||[];
 const byId=new Map(cards.map(c=>[c.id,c])),found=[],skipped=[];let checked=0,error=null;
 try{
  const token=await ebayToken(s,fetchImpl,now);
  for(const w of watch.slice(0,60)){
   const card=byId.get(w.card_id);if(!card){skipped.push({card_id:w.card_id,grade:w.grade,reason:'Not in catalog'});continue;}
   // Listing matching rejects Japanese titles for English cards; Japanese cards need their own rules (task 2).
   if(card.japanese){skipped.push({card_id:w.card_id,grade:w.grade,reason:'Listing alerts for Japanese cards are not available yet.'});continue;}
   const market=marketFor(card.id),limit=alertLimit(w,market,s,now);
   if(!limit){skipped.push({card_id:w.card_id,grade:w.grade,reason:'No buy limit yet. Set one on the card to get alerts.'});continue;}
   const items=await searchListings(card,w.grade,limit.limit,s,{fetchImpl,token});checked++;
   const marketPrice=analyze(market,w.grade,15,now).current;
   for(const c of candidates(items,card,w.grade,limit.limit,s)){
    const r=await db.prepare('INSERT OR IGNORE INTO alerts (user_id,card_id,grade,listing_id,title,price,shipping,total,currency,url,image,buying_option,limit_price,limit_source,market_price,seller,listed_at,found_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
     .bind(user,card.id,w.grade,c.listing_id,c.title,c.price,c.shipping,c.total,c.currency,c.url,c.image,c.buying_option,limit.limit,limit.source,marketPrice??null,c.seller,c.listed_at,started).run();
    if(changes(r)>0)found.push({...c,card_id:card.id,grade:w.grade,limit_price:limit.limit,limit_source:limit.source,market_price:marketPrice??null,card_name:card.name,set_name:card.setName,number_label:card.numberLabel});
   }
  }
 }catch(e){error=e.message;}
 if(found.length)await notify(found,s,fetchImpl).catch(()=>{});
 await db.prepare('INSERT INTO alert_runs (user_id,started_at,finished_at,checked,found,error) VALUES (?,?,?,?,?,?)').bind(user,started,new Date().toISOString(),checked,found.length,error).run();
 return {checked,found,skipped,error};
}

const money=v=>'$'+Number(v).toFixed(2);
const gradeLabel={raw:'Raw NM',psa9:'PSA 9',psa10:'PSA 10'};
export function alertMessage(a){
 const below=a.market_price>0?Math.round((1-a.total/a.market_price)*100):null;
 return {title:a.card_name+' '+gradeLabel[a.grade]+' listed at '+money(a.total),
  body:a.set_name+' #'+a.number_label+' · '+money(a.total)+(a.shipping==null?' + shipping':' with shipping')+' · limit '+money(a.limit_price)+(below>0?' · '+below+'% under market':'')+'\n'+a.title};
}
export async function sendNotifications(found,settings,fetchImpl=fetch){
 const s=normalizeSettings(settings),jobs=[];
 for(const a of found.slice(0,10)){
  const m=alertMessage(a);
  const topic=ntfyUrl(s.notify.ntfy);
  if(topic)jobs.push(fetchImpl(topic,{method:'POST',headers:{Title:m.title.replace(/[^\x20-\x7e]/g,''),Click:a.url,Tags:'moneybag'},body:m.body,signal:AbortSignal.timeout(10000)}));
  if(s.notify.discord)jobs.push(fetchImpl(s.notify.discord,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'FutureSight',embeds:[{title:m.title.slice(0,250),url:a.url,description:m.body.slice(0,1000),...(a.image?{thumbnail:{url:a.image}}:{})}]}),signal:AbortSignal.timeout(10000)}));
 }
 const results=await Promise.allSettled(jobs);
 return {sent:results.filter(r=>r.status==='fulfilled'&&r.value.ok).length,attempted:jobs.length};
}

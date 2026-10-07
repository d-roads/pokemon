// Shared by the server and browser so every manual search uses the same template.
const manualWords=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}' .-]/gu,' ').replace(/\s+/g,' ').trim();
export function manualSearchQuery(card,grade,{broad=false}={}){
 let name=manualWords(card.pcName||card.name).replace(/^M\s+/,'(M,Mega) ');
 let set=manualWords(card.setName).replace(/^EX\s+/,'').replace(/\s+ex$/i,'');
 // Promos have their own printed code; "Black Star Promos" is rarely in seller titles.
 if(/promo/i.test(set))set='Promo';
 // The local checklist position on early Japanese cards was never a printed card number.
 const printed=card.numbering?card.pokedexNumber||'':String(card.numberText??card.number);
 const unpadded=printed.replace(/^([A-Z]*)0+(?=\d)/,'$1');
 const num=printed!==unpadded?'('+printed+','+unpadded+')':printed;
 if(card.japanese&&card.numbering)set=({'ja-pmcg1':'Base','ja-pmcg2':'Jungle','ja-pmcg3':'Fossil','ja-pmcg4':'Rocket','ja-pmcg5':'Gym','ja-pmcg6':'Gym','ja-neo1':'Neo Genesis','ja-neo2':'Neo Discovery','ja-neo3':'Neo Revelation','ja-neo4':'Neo Destiny'})[card.setId]||set;
 if(card.japanese&&/^(?:Scarlet (?:and )?Violet |Pokemon Card )?151$/i.test(set))set='151';
 const gradeTerm={psa9:'("PSA 9",PSA9)',psa10:'("PSA 10",PSA10)',raw:'(NM,"near mint") -PSA -BGS -CGC -SGC -graded'}[grade]||'';
 const printing=card.nativeFirstEdition?'"1st edition"':card.nativeWinner?'Winner':card.nativeStamp?manualWords(card.nativeStamp):'';
 return ['Pokemon',card.japanese?'Japanese':'',name,broad?'':set,num,printing,gradeTerm,'-proxy -replica -lot -bundle',card.japanese?'':'-japanese -korean -chinese'].filter(Boolean).join(' ');
}
export function affiliateOptions(env={}){
 const campaignId=String(env.EBAY_EPN_CAMPAIGN_ID||'').trim();
 return {enabled:/^[1-9]\d{5,19}$/.test(campaignId),campaignId,customId:String(env.EBAY_EPN_CUSTOM_ID||'futuresight-manual').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64)};
}
export function ebayAffiliateLink(target,affiliate={}){
 if(!affiliate.enabled||!/^\d{6,20}$/.test(affiliate.campaignId||''))return target;
 let url;try{url=new URL(target);}catch{return target;}
 if(url.protocol!=='https:'||!['ebay.com','www.ebay.com'].includes(url.hostname)||!/^\/sch\/i\.html$/.test(url.pathname))return target;
 // Official US EPN click-link parameters; no redirects, impression requests or user identifiers.
 for(const [key,value] of Object.entries({mkevt:'1',mkcid:'1',mkrid:'711-53200-19255-0',campid:affiliate.campaignId,toolid:'10001',customid:affiliate.customId||'futuresight-manual'}))url.searchParams.set(key,value);
 return url.toString();
}
export function manualSearchUrl(card,grade,limit,{auctions=false,broad=false,query,affiliate}={}){
 const params=new URLSearchParams({_nkw:String(query??manualSearchQuery(card,grade,{broad})).trim().slice(0,1000),_sacat:'183454',_sop:'12'});
 if(Number(limit)>0&&Number.isFinite(Number(limit)))params.set('_udhi',Number(limit).toFixed(2));
 if(!auctions)params.set('LH_BIN','1');
 return ebayAffiliateLink('https://www.ebay.com/sch/i.html?'+params,affiliate);
}

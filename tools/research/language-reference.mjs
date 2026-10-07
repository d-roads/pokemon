// Numbered printing relationships from reference tables. No name/artist similarity inference.
export const referenceText=s=>String(s).replace(/cite[^†]*†([^†]*)(?:†[^]*)?/g,'$1').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
export function referencePages(text){
 return text.split(/\n?--------------------------------------------------------------------------------\n?/).filter(Boolean).map(chunk=>{
  const requested=chunk.match(/Source: open\(\{"ref_id":"(https:[^"]+)"/),canonical=chunk.match(/Redirected to URL: ([^;\n]+)/);
  const url=canonical?.[1]||requested?.[1]||chunk.match(/\((https:\/\/[^\n]+)\)\n/)?.[1];
  const lines=[...chunk.matchAll(/L(\d+):\s*([\s\S]*?)(?=L\d+:|$)/g)].map(m=>({n:Number(m[1]),text:referenceText(m[2])}));
  return {url,requested:requested?.[1],total:Number(chunk.match(/Total lines: (\d+)/)?.[1]||0),lines,error:/^Internal Error/.test(chunk)};
 });
}
export const setKey=s=>String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,'and').replace(/[^a-zA-Z0-9]/g,'').toLowerCase();
export const numberKey=s=>String(s).split('/')[0].trim().toUpperCase().replace(/^([A-Z]*)0+(?=\d)/,'$1');
export function numberedTableRows(page){
 const rows=[];
 for(const line of page.lines){
  const cells=line.text.split('|').map(s=>s.trim());
  if(cells.length<6)continue;
  // The numbered EN and JP printings each end their own expansion/rarity block.
  // Empty rowspan continuations MUST NOT inherit a counterpart from the previous row.
  const nums=cells.map((s,i)=>/^([A-Z]*\d+[A-Z]*|[!?])(?:\/(?:[A-Z]*\d+|[A-Z][A-Z-]*))?$/i.test(s)?i:-1).filter(i=>i>=0);
  if(nums.length===1){
   const i=nums[0],before=cells.slice(0,i).filter(Boolean),after=cells.slice(i+1).filter(Boolean);
   if(after.length===1&&before.length)rows.push({enSet:before.at(-1),enNumber:cells[i],jaSet:after[0],jaNumber:null,source:page.url,line:line.n,kind:'unnumbered-table'});
   continue;
  }
  if(nums.length!==2)continue;
  const [enN,jaN]=nums;
  const nonEmptyBefore=n=>cells.slice(0,n).map((s,i)=>({s,i})).filter(({s})=>s&&!/^[-—]+$/.test(s));
  const e=nonEmptyBefore(enN),j=nonEmptyBefore(jaN).filter(x=>x.i>enN);
  if(!e.length||!j.length)continue;
  // Renderer drops rarity symbols; literal rarity abbreviations can survive.
  const rarity=/^(?:C|U|R|RR|RRR|SR|SAR|AR|UR|HR|CHR|CSR|S|SSR|K|PR|ACE|Rare.*|Common|Uncommon|Promo|Double rare|Illustration rare|Ultra Rare)$/i;
  const enSet=e.filter(x=>!rarity.test(x.s)).at(-1)?.s,jaSet=j.filter(x=>!rarity.test(x.s)).at(-1)?.s;
  if(enSet&&jaSet)rows.push({enSet,enNumber:cells[enN],jaSet,jaNumber:cells[jaN],source:page.url,line:line.n,kind:'numbered-table'});
 }
 // Card infobox: require an explicit EN set+number followed by JP set+number.
 // Consecutive JP-only reprints are not paired with the previous English entry.
 let enSet=null,enNumber=null,jaSet=null,start=null;
 for(const line of page.lines){
  const s=line.text;
  const e=s.match(/^English (?:expansion|Deck|Half Deck|Deck Kit) (.+)$/i);
  const j=s.match(/^Japanese (?:expansion|Deck|Half Deck|Deck Kit|Subset) (.+)$/i);
  const en=s.match(/^English card no\. (.+)$/i),ja=s.match(/^Japanese card no\. (.+)$/i);
  if(e){enSet=e[1];enNumber=null;jaSet=null;start=line.n;}
  else if(en){enNumber=en[1];}
  else if(j){if(jaSet){enSet=null;enNumber=null;}jaSet=j[1];}
  else if(ja){if(enSet&&enNumber&&jaSet)rows.push({enSet,enNumber,jaSet,jaNumber:ja[1],source:page.url,line:start,kind:'numbered-infobox'});enSet=null;enNumber=null;jaSet=null;}
  else if(/^Expansion |^Japanese card|^English card|^For more information|^##/.test(s)){enSet=null;enNumber=null;jaSet=null;}
 }
 return rows;
}

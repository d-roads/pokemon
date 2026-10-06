// Acquisition and resale costs, net return and the highest price worth paying.
// Shared by the server and the page (served as /investment-costs.mjs).
//
//   A       = B × (1 + tax) + Cin                         what buying actually costs
//   Rnet(E) = [E − F(E) − Cout − Chold] / A − 1           F(E) = marketplace fees on the sale
//   Bmax    = {[E − F(E) − Cout − Chold] / (1 + h) − Cin} / (1 + tax)
// F depends on the sale price only, so Bmax has this closed form even for tiered fees.
// A negative Bmax means no purchase price clears the hurdle.
//
// The default profile is the research scenario (15% sale-side haircut, $5 in, $5 out). It is a
// stated assumption, not a reconstruction of anyone's real fees: marketplace fees vary by
// category and account and may apply to shipping and tax as well. Edit it to match yours.
export const COST_PROFILE_VERSION='costs-2026.10.06';
export const DEFAULT_COSTS=Object.freeze({
 version:COST_PROFILE_VERSION,currency:'USD',effective:'2026-10-06',
 taxRate:0,shippingIn:5,saleFeeRate:.15,saleFixedFee:0,feeTiers:null,shippingOut:5,holdingCost:0,hurdle:0,
 label:'Research scenario: 15% of the sale price in fees, $5 to buy in, $5 to ship out, no tax',
});
const IC_LIMITS={taxRate:[0,.3],shippingIn:[0,1000],saleFeeRate:[0,.5],saleFixedFee:[0,1000],shippingOut:[0,1000],holdingCost:[0,100000],hurdle:[-.5,5]};
const icRound2=v=>Math.round(v*100)/100;

// Validate user-supplied assumptions; unknown keys are ignored, bad values reported.
export function normalizeCosts(input={},base=DEFAULT_COSTS){
 const costs={...base},errors=[];
 for(const [key,[lo,hi]] of Object.entries(IC_LIMITS)){
  if(input[key]==null||input[key]==='')continue;
  const v=Number(input[key]);
  if(!Number.isFinite(v)||v<lo||v>hi){errors.push(`${key} must be between ${lo} and ${hi}.`);continue;}
  costs[key]=v;
 }
 if(input.feeTiers!=null){
  const t=input.feeTiers;
  if(!Array.isArray(t)||t.length>6||t.some((x,i)=>!(x&&Number.isFinite(x.rate)&&x.rate>=0&&x.rate<=.5&&(x.upTo==null||Number.isFinite(x.upTo)&&x.upTo>0&&(i===0||x.upTo>t[i-1].upTo)))))errors.push('Fee tiers must be up to six {upTo, rate} steps in increasing order.');
  else costs.feeTiers=t.map(x=>({upTo:x.upTo??null,rate:x.rate}));
 }
 if(JSON.stringify(costs)!==JSON.stringify(base))costs.label='Custom assumptions';
 return {costs,errors};
}
// Marketplace fees on a sale at gross price E: marginal tiers if given, else a flat rate, plus a fixed fee.
export function saleFee(E,c=DEFAULT_COSTS){
 if(!(E>0))return 0;
 let fee=c.saleFixedFee||0;
 if(Array.isArray(c.feeTiers)&&c.feeTiers.length){let prev=0;for(const t of c.feeTiers){const top=t.upTo??Infinity;if(E>prev)fee+=(Math.min(E,top)-prev)*t.rate;prev=top;if(E<=top)break;}}
 else fee+=E*(c.saleFeeRate||0);
 return fee;
}
export const acquisitionCost=(ask,c=DEFAULT_COSTS)=>ask>0?ask*(1+(c.taxRate||0))+(c.shippingIn||0):null;
export const netProceeds=(E,c=DEFAULT_COSTS)=>E>0?E-saleFee(E,c)-(c.shippingOut||0)-(c.holdingCost||0):null;
export function netReturn(ask,E,c=DEFAULT_COSTS){
 const A=acquisitionCost(ask,c),P=netProceeds(E,c);
 return A>0&&P!=null?P/A-1:null;
}
// Highest item price whose net return at exit E meets the hurdle h. null when none is positive.
export function maxBuyPrice(E,c=DEFAULT_COSTS,h=c.hurdle||0){
 const P=netProceeds(E,c);if(P==null||h<=-1)return null;
 const B=(P/(1+h)-(c.shippingIn||0))/(1+(c.taxRate||0));
 return B>0?Math.floor(B*100)/100:null;
}
// Everything the card panel needs for one asking price, at today's sold median (not a forecast).
export function costSummary({ask=null,reference=null,costs=DEFAULT_COSTS}={}){
 const hurdle=costs.hurdle||0;
 return {
  ask,reference,costs,
  acquisition:ask>0?icRound2(acquisitionCost(ask,costs)):null,
  proceedsAtReference:reference>0?icRound2(netProceeds(reference,costs)):null,
  netReturnAtReference:ask>0&&reference>0?netReturn(ask,reference,costs):null,
  breakEven:reference>0?maxBuyPrice(reference,costs,0):null,
  maxForHurdle:reference>0?maxBuyPrice(reference,costs,hurdle):null,
  hurdle,
 };
}

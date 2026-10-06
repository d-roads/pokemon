// Regularized net-return model (plan.md section 6): fitting helpers used offline by
// tools/research/train-investment-model.mjs, and prediction used by the app.
//
//   y  = ln(P[t+12] / P[t])                                   log price change over the horizon
//   mu = b0 + b_grade + bM·M + bV·V + bQ·Q + bP·ln P + bA·ln(1 + age months)
//   b  = argmin Σ w·Huber(y − mu) + λ·Σ(non-intercept b²)
// Features are centred and scaled by training medians and IQRs and clipped to [−5, 5]. Grade
// offsets are penalised toward the pooled intercept. A conservative exit is
//   E10 = price × exp(mu + q10), q10 = 10th percentile of residuals on a separate later window.
// Nothing is trained on a request; the app only reads a frozen artifact, and only shows its
// output when that artifact passed the promotion gate.
export const MODEL_FEATURES=['M','V','Q','lnP','lnAge'];
export const MODEL_GRADES=['raw','grade9','psa10'];
export const quantile=(sorted,q)=>{if(!sorted.length)return null;const i=(sorted.length-1)*q,lo=Math.floor(i),hi=Math.ceil(i);return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);};

export function fitTransforms(rows,features=MODEL_FEATURES){
 const t={};
 for(const f of features){const v=rows.map(r=>r[f]).filter(Number.isFinite).sort((a,b)=>a-b),med=quantile(v,.5),iqr=quantile(v,.75)-quantile(v,.25);t[f]={median:med,iqr,constant:!(iqr>0)};}
 return t;
}
export const scaled=(x,tr)=>tr.constant?0:Math.max(-5,Math.min(5,(x-tr.median)/tr.iqr));
// Design row: pooled intercept, one offset per guide grade, then scaled features.
export function designRow(r,transforms,features=MODEL_FEATURES){return [1,...MODEL_GRADES.map(g=>+(r.g===g)),...features.map(f=>scaled(r[f],transforms[f]))];}
export const PENALIZED=x=>x.map((_,i)=>i===0?0:1);

function imSolve(A,b){
 const n=b.length,M=A.map((row,i)=>[...row,b[i]]);
 for(let c=0;c<n;c++){
  let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;
  if(Math.abs(M[p][c])<1e-12)throw new Error('Singular system');
  [M[c],M[p]]=[M[p],M[c]];
  for(let r=0;r<n;r++){if(r===c)continue;const f=M[r][c]/M[c][c];if(f)for(let k=c;k<=n;k++)M[r][k]-=f*M[c][k];}
 }
 return M.map((row,i)=>row[n]/row[i]);
}
export const huber=(r,d)=>Math.abs(r)<=d?r*r/2:d*(Math.abs(r)-d/2);
// Iteratively reweighted least squares for a weighted Huber loss with a ridge penalty.
export function fitHuberRidge(X,y,w,{lambda,delta,iterations=50,tol=1e-9}){
 const p=X[0].length,pen=PENALIZED(X[0]);let beta=new Array(p).fill(0);
 for(let it=0;it<iterations;it++){
  const A=Array.from({length:p},()=>new Array(p).fill(0)),b=new Array(p).fill(0);
  for(let i=0;i<X.length;i++){
   const x=X[i],r=y[i]-x.reduce((s,v,j)=>s+v*beta[j],0),u=w[i]*(Math.abs(r)<=delta||it===0?1:delta/Math.abs(r));
   for(let j=0;j<p;j++){b[j]+=u*x[j]*y[i];for(let k=j;k<p;k++)A[j][k]+=u*x[j]*x[k];}
  }
  // Huber's IRLS minimises Σ u·r²/2, so the ridge term λ·Σb² enters as 2λ on the diagonal.
  for(let j=0;j<p;j++){A[j][j]+=2*lambda*pen[j];for(let k=0;k<j;k++)A[j][k]=A[k][j];}
  const next=imSolve(A,b),moved=Math.max(...next.map((v,j)=>Math.abs(v-beta[j])));beta=next;
  if(moved<tol)break;
 }
 return beta;
}
export const predictRow=(beta,x)=>x.reduce((s,v,j)=>s+v*beta[j],0);

// App-side forecast from a frozen artifact. Returns null unless the artifact covers this grade.
export function modelForecast(artifact,{grade,features,price,ageMonths}){
 if(!artifact?.coefficients||!(price>0)||!features)return null;
 const g={raw:'raw',psa9:'grade9',psa10:'psa10'}[grade];
 const row={g,M:features.M,V:features.V,Q:features.Q,lnP:Math.log(price),lnAge:Math.log(1+Math.max(0,ageMonths??0))};
 if(MODEL_FEATURES.some(f=>!Number.isFinite(row[f])))return null;
 const mu=predictRow(artifact.coefficients,designRow(row,artifact.transforms,artifact.features));
 const q10=artifact.calibration?.q10;
 return {mu,expected:price*Math.exp(mu),E10:Number.isFinite(q10)?price*Math.exp(mu+q10):null,horizonMonths:artifact.horizonMonths};
}

// FutureSight opening animation.
// Glint (the mascot) flies a loop around the screen, stops in the middle for a happy twirl with a sparkle burst,
// then flies to the top-left corner and becomes the header logo.
// Plays once per browser tab (the page's head script decides), never with reduced motion unless replayed from Settings,
// and any click, tap or key skips it. Only transform and opacity are animated, so it stays on the compositor and smooth
// while the catalog loads underneath. No blur filters (see the scrolling note in style.css).

const SEEN_KEY='futuresight-intro-seen';
const COLORS=['#fff6c8','#ffd45e','#7dfbcd','#ffffff','#b9a8ff','#ff9fc8','#4cc9e0'];
const rand=(a,b)=>a+Math.random()*(b-a);
const pick=list=>list[Math.floor(Math.random()*list.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wait=ms=>new Promise(r=>setTimeout(r,ms));

// Catmull-Rom spline through points, re-sampled by arc length so the flight speed is even.
function spline(points){
 const at=(i,t)=>{const p0=points[Math.max(i-1,0)],p1=points[i],p2=points[i+1],p3=points[Math.min(i+2,points.length-1)];const t2=t*t,t3=t2*t;
  const f=k=>.5*(2*p1[k]+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3);return [f(0),f(1)];};
 const samples=[];const steps=40;
 for(let i=0;i<points.length-1;i++)for(let j=0;j<steps;j++)samples.push(at(i,j/steps));
 samples.push(points[points.length-1]);
 const lengths=[0];for(let i=1;i<samples.length;i++)lengths.push(lengths[i-1]+Math.hypot(samples[i][0]-samples[i-1][0],samples[i][1]-samples[i-1][1]));
 const total=lengths[lengths.length-1];
 return s=>{const d=clamp(s,0,1)*total;let lo=0,hi=lengths.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(lengths[mid]<d)lo=mid;else hi=mid;}
  const span=lengths[hi]-lengths[lo]||1,u=(d-lengths[lo])/span;return [samples[lo][0]+(samples[hi][0]-samples[lo][0])*u,samples[lo][1]+(samples[hi][1]-samples[lo][1])*u];};
}

// Pose along a path: position, facing (flip when moving left) and a gentle bank into the direction of travel.
function pose(path,s,scale=1){
 const [x,y]=path(s),[x2,y2]=path(Math.min(1,s+.012)),[x0,y0]=path(Math.max(0,s-.012));
 const dx=x2-x0,dy=y2-y0,face=dx<-.5?-1:1,bank=clamp(Math.atan2(dy,Math.abs(dx)||.001)*180/Math.PI*.5,-26,26)+8;
 return {x,y,face,bank,scale};
}
const transform=p=>`translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) rotate(${(p.face*p.bank).toFixed(1)}deg) scale(${(p.face*p.scale).toFixed(3)},${p.scale.toFixed(3)})`;

function sparkle(layer,x,y,{dx=0,dy=0,size=10,duration=1000,delay=0,spin=200,fall=30,round=false}={}){
 const el=document.createElement('i');el.className='intro-spark'+(round?' round':'');
 el.style.cssText=`left:${x}px;top:${y}px;width:${size}px;height:${size}px;margin:${-size/2}px 0 0 ${-size/2}px;background:${pick(COLORS)}`;
 layer.append(el);
 const a=el.animate([
  {transform:'translate(0,0) scale(0) rotate(0deg)',opacity:1},
  {offset:.22,transform:`translate(${dx*.55}px,${dy*.55}px) scale(1) rotate(${spin*.4}deg)`,opacity:1},
  {transform:`translate(${dx}px,${dy+fall}px) scale(.15) rotate(${spin}deg)`,opacity:0}
 ],{duration,delay,easing:'cubic-bezier(.2,.75,.3,1)',fill:'both'});
 a.onfinish=()=>el.remove();
 return a;
}

function build(size){
 const overlay=document.createElement('div');overlay.className='intro';overlay.setAttribute('aria-hidden','true');
 const stars=Array.from({length:46},()=>`<i class="intro-star" style="left:${rand(0,100).toFixed(1)}%;top:${rand(0,100).toFixed(1)}%;animation-delay:${rand(0,2.4).toFixed(2)}s;animation-duration:${rand(1.6,3.2).toFixed(2)}s;--s:${rand(1,2.6).toFixed(1)}px"></i>`).join('');
 overlay.innerHTML=`<div class="intro-dim"></div><div class="intro-stars">${stars}</div><div class="intro-fx"></div>
  <div class="intro-title"><span>future<b>sight</b></span><small>card terminal</small></div>
  <div class="intro-mascot" style="width:${size}px;height:${size}px;margin:${-size/2}px 0 0 ${-size/2}px"><div class="intro-glow"></div><div class="intro-ring"></div><div class="intro-sprite"></div></div>
  <p class="intro-skip">Click or press any key to skip</p>`;
 // Copy the mascot artwork from the page's sprite so the logo and the animation stay identical.
 const symbol=document.getElementById('fs-glint');
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 64 64');svg.setAttribute('class','intro-svg');
 if(symbol)for(const child of symbol.children)svg.append(child.cloneNode(true));
 overlay.querySelector('.intro-sprite').append(svg);
 return overlay;
}

let running=null;
export function play({force=false}={}){
 if(running)return running;
 const root=document.documentElement;
 if(!force&&!root.classList.contains('intro-pending'))return Promise.resolve(false);
 if(typeof Element==='undefined'||!Element.prototype.animate){root.classList.remove('intro-pending');return Promise.resolve(false);}
 try{sessionStorage.setItem(SEEN_KEY,'1');}catch{}
 const W=innerWidth,H=innerHeight,size=Math.round(clamp(Math.min(W,H)*.19,76,150));
 const overlay=build(size);document.body.append(overlay);
 root.classList.add('intro-playing');root.classList.remove('intro-pending');
 const mascot=overlay.querySelector('.intro-mascot'),sprite=overlay.querySelector('.intro-sprite'),svg=overlay.querySelector('.intro-svg');
 const fx=overlay.querySelector('.intro-fx'),title=overlay.querySelector('.intro-title'),dim=overlay.querySelector('.intro-dim');
 const anims=new Set(),track=a=>{anims.add(a);a.addEventListener?.('finish',()=>anims.delete(a));return a;};
 let skipped=false,frame=0,done;
 const finished=new Promise(r=>done=r);

 const finish=()=>{
  if(!overlay.isConnected)return;
  cancelAnimationFrame(frame);removeEventListener('keydown',onKey,true);
  const logo=document.getElementById('brand-mark');
  root.classList.remove('intro-playing');
  if(logo){logo.classList.remove('landed');void logo.offsetWidth;logo.classList.add('landed');setTimeout(()=>logo.classList.remove('landed'),900);}
  const fade=overlay.animate([{opacity:1},{opacity:0}],{duration:skipped?180:260,easing:'ease-out',fill:'forwards'});
  fade.onfinish=()=>{for(const a of anims)a.cancel();overlay.remove();running=null;done(!skipped);};
 };
 const skip=()=>{if(skipped)return;skipped=true;for(const a of anims)a.pause();finish();};
 const onKey=e=>{if(e.key==='Tab')return;skip();};
 overlay.addEventListener('pointerdown',skip);addEventListener('keydown',onKey,true);

 (async()=>{
  // 1. Fly in from the lower left and loop around the screen, ending in the middle.
  const center=[W*.5,H*.44];
  const flight=spline([[-size,H*.92],[W*.2,H*.32],[W*.52,H*.16],[W*.83,H*.36],[W*.74,H*.72],[W*.42,H*.76],[W*.3,H*.5],center]);
  const FLY=2500,N=64,ease=t=>1-Math.pow(1-t,1.7);
  const frames=Array.from({length:N+1},(_,i)=>({transform:transform(pose(flight,ease(i/N))),offset:i/N}));
  frames[N].transform=transform({x:center[0],y:center[1],face:1,bank:0,scale:1});
  svg.classList.add('flying');
  const fly=track(mascot.animate(frames,{duration:FLY,easing:'linear',fill:'forwards'}));
  // A trail of twinkles behind the mascot while it flies.
  const start=performance.now();let last=0;
  const trail=now=>{const t=(now-start)/FLY;if(t>=1||skipped)return;
   if(now-last>48){last=now;const p=pose(flight,ease(t));const back=size*.32;
    sparkle(fx,p.x-p.face*back+rand(-6,6),p.y+size*.2+rand(-6,6),{dx:rand(-18,18),dy:rand(-10,22),size:rand(4,9),duration:rand(520,820),spin:rand(90,240),fall:14,round:Math.random()<.35});}
   frame=requestAnimationFrame(trail);};
  frame=requestAnimationFrame(trail);
  await fly.finished.catch(()=>{});if(skipped)return;
  svg.classList.remove('flying');

  // 2. The happy twirl: squash, hop, spin, sparkle burst, land.
  const TWIRL=1350;
  track(sprite.animate([
   {transform:'translateY(0) scale(1,1) rotate(0deg)'},
   {offset:.12,transform:'translateY(6%) scale(1.16,.82) rotate(0deg)',easing:'cubic-bezier(.3,0,.2,1)'},
   {offset:.32,transform:'translateY(-30%) scale(.9,1.12) rotate(0deg)',easing:'cubic-bezier(.4,0,.2,1)'},
   {offset:.56,transform:'translateY(-30%) scale(1.06,1.06) rotate(360deg)',easing:'cubic-bezier(.5,0,.8,.4)'},
   {offset:.72,transform:'translateY(4%) scale(1.18,.84) rotate(360deg)'},
   {offset:.85,transform:'translateY(-4%) scale(.95,1.06) rotate(360deg)'},
   {transform:'translateY(0) scale(1,1) rotate(360deg)'}
  ],{duration:TWIRL,fill:'forwards'}));
  setTimeout(()=>{if(skipped)return;svg.classList.add('happy');
   const cx=center[0],cy=center[1]-size*.3,reach=clamp(Math.min(W,H)*.34,140,320);
   for(let i=0;i<40;i++){const a=i/40*Math.PI*2+rand(-.12,.12),d=reach*rand(.45,1);
    track(sparkle(fx,cx,cy,{dx:Math.cos(a)*d,dy:Math.sin(a)*d,size:rand(7,17),duration:rand(950,1550),spin:rand(160,420)*(Math.random()<.5?-1:1),fall:rand(20,60),round:i%4===0}));}
   for(let i=0;i<14;i++)track(sparkle(fx,cx+rand(-reach*.6,reach*.6),cy+rand(-reach*.5,reach*.5),{size:rand(5,10),duration:rand(700,1100),delay:rand(120,520),spin:180,fall:6}));
   track(mascot.querySelector('.intro-ring').animate([{transform:'scale(.35)',opacity:.95},{transform:'scale(3.4)',opacity:0}],{duration:900,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'}));
   track(mascot.querySelector('.intro-glow').animate([{transform:'scale(.6)',opacity:0},{offset:.25,transform:'scale(1.5)',opacity:.9},{transform:'scale(1.8)',opacity:0}],{duration:1300,easing:'ease-out',fill:'forwards'}));
   track(title.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:450,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'}));
  },TWIRL*.5);
  await wait(TWIRL+420);if(skipped)return;
  svg.classList.remove('happy');

  // 3. Fly to the top-left corner and shrink into the logo, turning to face right as it lands.
  const logo=document.getElementById('brand-mark');const r=logo?.getBoundingClientRect();
  const target=r&&r.width?[r.left+r.width/2,r.top+r.height/2,r.width/size]:[34,28,36/size];
  const home=spline([center,[center[0]+W*.06,center[1]+H*.04],[W*.32,H*.22],[target[0]+W*.06,target[1]+H*.03],[target[0],target[1]]]);
  const HOME=1050,M=36;
  const homeFrames=Array.from({length:M+1},(_,i)=>{const t=i/M,s=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;const p=pose(home,s,1+(target[2]-1)*Math.pow(t,1.4));if(t>.9){p.face=1;p.bank=0;}return {transform:transform(p),offset:t};});
  svg.classList.add('flying');
  track(title.animate([{opacity:1},{opacity:0}],{duration:300,fill:'forwards'}));
  track(dim.animate([{opacity:1},{opacity:0}],{duration:HOME,delay:150,easing:'ease-in',fill:'forwards'}));
  track(overlay.querySelector('.intro-stars').animate([{opacity:1},{opacity:0}],{duration:HOME*.8,fill:'forwards'}));
  track(overlay.querySelector('.intro-skip').animate([{opacity:1},{opacity:0}],{duration:250,fill:'forwards'}));
  const back=track(mascot.animate(homeFrames,{duration:HOME,easing:'linear',fill:'forwards'}));
  const homeStart=performance.now();last=0;
  const homeTrail=now=>{const t=(now-homeStart)/HOME;if(t>=.92||skipped)return;
   if(now-last>40){last=now;const s=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;const [x,y]=home(s);sparkle(fx,x+rand(-5,5),y+rand(-5,5),{dx:rand(-14,14),dy:rand(-8,16),size:rand(3,8)*(1-t*.6),duration:rand(450,700),spin:150,fall:10,round:Math.random()<.4});}
   frame=requestAnimationFrame(homeTrail);};
  frame=requestAnimationFrame(homeTrail);
  await back.finished.catch(()=>{});if(skipped)return;
  // A small twinkle where it lands, in its own layer so it outlives the overlay.
  const land=document.createElement('div');land.className='intro-land';land.setAttribute('aria-hidden','true');document.body.append(land);
  for(let i=0;i<10;i++){const a=i/10*Math.PI*2;sparkle(land,target[0],target[1],{dx:Math.cos(a)*30,dy:Math.sin(a)*30,size:rand(4,8),duration:rand(550,750),spin:180,fall:4,round:i%3===0});}
  setTimeout(()=>land.remove(),900);
  mascot.style.visibility='hidden';
  finish();
 })();
 running=finished;
 return finished;
}

// Exposed for the Replay button in Settings.
window.futureSightIntro={play,
 enabled(){try{return localStorage.getItem('futuresight-intro')!=='off';}catch{return true;}},
 setEnabled(on){try{if(on)localStorage.removeItem('futuresight-intro');else localStorage.setItem('futuresight-intro','off');}catch{}}};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>play());else play();

// FutureSight landing page: sign in / create account, plus the animated card-vault background.
const $=s=>document.querySelector(s);
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Forms ----------
// These mirror the server's rules (lib/accounts.mjs) so mistakes show before sending.
const USER_RE=/^[A-Za-z0-9](?:[A-Za-z0-9]|[._-](?=[A-Za-z0-9])){2,19}$/;
const BANNED=/[<>"'`\\;&]/;
function userProblem(v){
 if(!v)return 'Enter a username.';
 if(v.length<3||v.length>20)return 'Usernames are 3–20 characters.';
 if(/[^A-Za-z0-9._-]/.test(v))return 'Usernames can use letters, numbers, period, hyphen and underscore only.';
 if(!USER_RE.test(v))return 'Usernames start and end with a letter or number, with no two symbols in a row.';
 return '';
}
function passProblem(v){
 if(!v)return 'Enter a password.';
 if(v.length<5||v.length>64)return 'Passwords are 5–64 characters.';
 if(!/^[\x21-\x7e]+$/.test(v))return 'Passwords use standard keyboard characters, with no spaces.';
 if(BANNED.test(v))return 'Passwords cannot contain < > " \' ` \\ ; &';
 return '';
}

const tabs={in:$('#tab-in'),up:$('#tab-up')},forms={in:$('#form-in'),up:$('#form-up')};
function show(which,focus=true){
 for(const k of ['in','up']){const on=k===which;tabs[k].setAttribute('aria-selected',on);tabs[k].tabIndex=on?0:-1;forms[k].hidden=!on;}
 if(focus)forms[which].querySelector('input').focus();
}
tabs.in.onclick=()=>show('in');tabs.up.onclick=()=>show('up');
$('.tabs').addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const next=tabs.in.getAttribute('aria-selected')==='true'?'up':'in';show(next,false);tabs[next].focus();}});
if(location.hash==='#create')show('up',false);

function fail(form,text,field){
 const msg=form.querySelector('.msg');msg.className='msg';msg.textContent=text;
 form.querySelectorAll('input').forEach(i=>i.removeAttribute('aria-invalid'));
 if(field){const input=form.elements[field];input.setAttribute('aria-invalid','true');input.focus();}
 const pass=$('#pass');pass.classList.remove('shake');void pass.offsetWidth;if(!reduce)pass.classList.add('shake');
}
async function submit(form,route,body){
 const button=form.querySelector('.go'),label=button.textContent;button.disabled=true;button.textContent=route==='login'?'Signing in…':'Creating account…';
 try{
  const r=await fetch('/api/auth/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin'});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){fail(form,data.error||'Something went wrong. Try again.');return;}
  const msg=form.querySelector('.msg');msg.className='msg ok';msg.textContent=route==='login'?'Signed in. Opening FutureSight…':'Account created. Opening FutureSight…';
  location.replace('/');
 }catch{fail(form,'FutureSight could not be reached. Check that the server is running.');}
 finally{button.disabled=false;button.textContent=label;}
}
forms.in.addEventListener('submit',e=>{
 e.preventDefault();const f=forms.in,username=f.elements.username.value.trim(),password=f.elements.password.value;
 if(!username)return fail(f,'Enter your username.','username');
 if(!password)return fail(f,'Enter your password.','password');
 submit(f,'login',{username,password});
});
forms.up.addEventListener('submit',e=>{
 e.preventDefault();const f=forms.up,username=f.elements.username.value.trim(),password=f.elements.password.value,repeat=f.elements.repeat.value;
 let p=userProblem(username);if(p)return fail(f,p,'username');
 p=passProblem(password);if(p)return fail(f,p,'password');
 if(repeat!==password)return fail(f,'The two passwords do not match.','repeat');
 submit(f,'signup',{username,password,repeat});
});
// Live feedback on the sign-up fields once something has been typed.
for(const [name,check] of [['username',userProblem],['password',passProblem]]){
 const input=forms.up.elements[name];
 input.addEventListener('input',()=>{const p=input.value&&check(name==='username'?input.value.trim():input.value);input.toggleAttribute('aria-invalid',!!p);if(p)input.setAttribute('aria-invalid','true');forms.up.querySelector('.msg').textContent=p||'';});
}
forms.up.elements.repeat.addEventListener('input',e=>{const bad=e.target.value&&e.target.value!==forms.up.elements.password.value;e.target.toggleAttribute('aria-invalid',bad);if(bad)e.target.setAttribute('aria-invalid','true');});
$('#pass-no').textContent='No. '+String(1+Math.floor(Math.random()*151)).padStart(3,'0');

// ---------- Set tape ----------
const SETS=[['Base Set',1999],['Jungle',1999],['Fossil',1999],['Team Rocket',2000],['Neo Genesis',2000],['Neo Destiny',2002],['Skyridge',2003],['EX Dragon',2003],['EX Deoxys',2005],['EX Dragon Frontiers',2006],['Diamond & Pearl',2007],['Legends Awakened',2008],['HeartGold SoulSilver',2010],['Call of Legends',2011],['Black & White',2011],['Legendary Treasures',2013],['XY',2014],['Primal Clash',2015],['Evolutions',2016],['Sun & Moon',2017],['Hidden Fates',2019],['Cosmic Eclipse',2019],['Sword & Shield',2020],['Evolving Skies',2021],['Celebrations',2021],['Crown Zenith',2023],['151',2023],['Paldean Fates',2024],['Prismatic Evolutions',2025],['Mega Evolution',2025],['Ascended Heroes',2026],['30th Celebration',2026]];
const tape=$('#tape'),items=SETS.map(([n,y])=>`<span><i>✦</i><b>${n}</b>${y}</span>`).join('');tape.innerHTML=items+items;

// ---------- Card tilt + foil ----------
const pass=$('#pass');
if(!reduce&&matchMedia('(pointer:fine)').matches){
 addEventListener('pointermove',e=>{
  const r=pass.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
  const near=Math.max(Math.abs(x-.5),Math.abs(y-.5))<1.1;
  pass.style.setProperty('--mx',(x*100).toFixed(1)+'%');pass.style.setProperty('--my',(y*100).toFixed(1)+'%');
  pass.style.setProperty('--ry',near?((x-.5)*9).toFixed(2)+'deg':'0deg');pass.style.setProperty('--rx',near?((.5-y)*7).toFixed(2)+'deg':'0deg');
 },{passive:true});
}

// ---------- Window chart: a price line that keeps drawing itself, with Glint riding it ----------
const W=300,H=112,line=$('#wline'),fill=$('#wline-fill'),glint=$('.window-glint'),win=$('.window');
let pts=[],seed=Math.random()*1000;
const noise=t=>Math.sin(t*.9+seed)*14+Math.sin(t*2.3+seed*2)*7+Math.sin(t*.27)*10;
function drawWindow(t){
 const n=34,drift=t*.0009;pts=[];
 for(let i=0;i<=n;i++){const u=i/n,trend=H*.78-u*H*.42;pts.push([u*W,Math.max(8,Math.min(H-6,trend+noise(u*6+drift)))]);}
 const d=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
 line.setAttribute('d',d);fill.setAttribute('d',d+` L${W} ${H} L0 ${H} Z`);
 const k=(t*.00006)%1,idx=Math.floor(k*n),f=k*n-idx,a=pts[idx],b=pts[idx+1]||a;
 const sx=win.clientWidth/W,sy=(win.clientHeight-8)/H,x=(a[0]+(b[0]-a[0])*f)*sx-22,y=(a[1]+(b[1]-a[1])*f)*sy-30;
 glint.style.setProperty('--gx',x.toFixed(1)+'px');glint.style.setProperty('--gy',y.toFixed(1)+'px');
}

// ---------- Background: drifting holo cards, stars and comets ----------
const canvas=$('#sky'),ctx=canvas.getContext('2d');
let w=0,h=0,dpr=1,cards=[],stars=[],comets=[],last=0,running=true;
const rand=(a,b)=>a+Math.random()*(b-a);
const FOIL=['#7cf3d6','#9b8cff','#ffd36e','#ff9bd2'];
function resize(){
 dpr=Math.min(2,devicePixelRatio||1);w=innerWidth;h=innerHeight;canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
 const count=Math.round(Math.min(22,Math.max(9,w*h/70000)));
 cards=Array.from({length:count},()=>newCard(true));
 stars=Array.from({length:Math.round(w*h/9000)},()=>({x:rand(0,w),y:rand(0,h),r:rand(.3,1.3),p:rand(0,6.3),s:rand(.4,1.4)}));
}
function newCard(anywhere){
 const z=rand(.35,1);return {x:rand(-40,w+40),y:anywhere?rand(-60,h+60):h+120,z,size:44+z*58,vy:-(6+z*16),vx:rand(-4,4),rot:rand(-.5,.5),vr:rand(-.08,.08),flip:rand(0,6.3),vf:rand(.25,.7),hue:Math.floor(rand(0,FOIL.length))};
}
function roundRect(x,y,cw,ch,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+cw,y,x+cw,y+ch,r);ctx.arcTo(x+cw,y+ch,x,y+ch,r);ctx.arcTo(x,y+ch,x,y,r);ctx.arcTo(x,y,x+cw,y,r);ctx.closePath();}
function drawCard(c,t){
 const cw=c.size,ch=c.size*1.4,face=Math.cos(c.flip),sx=Math.max(.06,Math.abs(face));
 ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.rot);ctx.scale(sx,1);ctx.globalAlpha=.1+c.z*.3;
 const g=ctx.createLinearGradient(-cw/2,-ch/2,cw/2,ch/2),shift=(Math.sin(t*.0004+c.flip)+1)/2;
 g.addColorStop(0,FOIL[c.hue]);g.addColorStop(.25+shift*.5,FOIL[(c.hue+1)%4]);g.addColorStop(1,FOIL[(c.hue+2)%4]);
 roundRect(-cw/2,-ch/2,cw,ch,cw*.09);ctx.fillStyle=g;ctx.fill();
 roundRect(-cw/2+cw*.07,-ch/2+cw*.07,cw*.86,ch-cw*.14,cw*.06);ctx.fillStyle=face>0?'#161b52':'#1c2266';ctx.fill();
 if(face>0){
  // Front: an art window with a little rising price line, and a name bar.
  ctx.fillStyle='#2a3290';roundRect(-cw*.34,-ch*.36,cw*.68,ch*.38,cw*.04);ctx.fill();
  ctx.strokeStyle=FOIL[c.hue];ctx.lineWidth=1.6;ctx.beginPath();
  for(let i=0;i<=6;i++){const px=-cw*.3+i*cw*.1,py=-ch*.08-i*ch*.035+Math.sin(i*1.7+c.hue)*ch*.03;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();
  ctx.fillStyle='#ffffff30';roundRect(-cw*.34,ch*.08,cw*.5,ch*.05,2);ctx.fill();roundRect(-cw*.34,ch*.18,cw*.62,ch*.04,2);ctx.fill();roundRect(-cw*.34,ch*.26,cw*.44,ch*.04,2);ctx.fill();
 }else{
  // Back: a four-point star gem like Glint's.
  const r=cw*.2;ctx.fillStyle=FOIL[(c.hue+2)%4];ctx.beginPath();
  for(let i=0;i<8;i++){const a=i*Math.PI/4-Math.PI/2,rr=i%2?r*.38:r;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fill();
 }
 ctx.restore();
}
function frame(t){
 const dt=Math.min(.05,(t-(last||t))/1000);last=t;
 ctx.clearRect(0,0,w,h);
 for(const s of stars){ctx.globalAlpha=.25+.45*(Math.sin(t*.001*s.s+s.p)+1)/2;ctx.fillStyle='#dfe3ff';ctx.fillRect(s.x,s.y,s.r,s.r);}
 ctx.globalAlpha=1;
 if(!reduce&&Math.random()<dt*.18)comets.push({x:rand(w*.2,w*1.1),y:rand(-20,h*.35),v:rand(380,560),life:1});
 for(const m of comets){m.x-=m.v*dt;m.y+=m.v*.42*dt;m.life-=dt*.7;const g=ctx.createLinearGradient(m.x,m.y,m.x+120,m.y-50);g.addColorStop(0,'#fff6c8');g.addColorStop(.25,'#7cf3d6aa');g.addColorStop(1,'#7cf3d600');ctx.globalAlpha=Math.max(0,m.life);ctx.strokeStyle=g;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(m.x,m.y);ctx.lineTo(m.x+120,m.y-50);ctx.stroke();}
 comets=comets.filter(m=>m.life>0);ctx.globalAlpha=1;
 for(const c of cards){c.x+=c.vx*dt;c.y+=c.vy*dt;c.rot+=c.vr*dt;c.flip+=c.vf*dt;if(c.y<-140)Object.assign(c,newCard(false));drawCard(c,t);}
 ctx.globalAlpha=1;drawWindow(t);
 if(running&&!reduce)requestAnimationFrame(frame);
}
addEventListener('resize',()=>{resize();if(reduce)frame(performance.now());});
document.addEventListener('visibilitychange',()=>{running=!document.hidden;if(running&&!reduce){last=0;requestAnimationFrame(frame);}});
resize();requestAnimationFrame(frame);

(()=>{'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob(['importScripts("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js")'],{type:'text/javascript'}));
const THEMES={dark:['Dark',[17,17,17],[224,224,224]],midnight:['Midnight',[9,14,30],[196,212,242]],warm:['Warm Dark',[26,21,15],[232,214,184]],contrast:['High Contrast',[0,0,0],[255,255,255]],original:['Original']};
const OPTS={bright:['Brightness',[25,40,55,70,85],55,v=>v+'%'],warm:['Warmth',['Neutral','Slightly Warm','Warm'],1],contrast:['Contrast',['Low','Comfortable','High'],1],text:['Text',['Normal','Bright'],0],dark:['Page',['Dark','Very Dark'],0]};
const S={theme:'dark',night:true,keep:true,layout:'auto',dual:false,swapped:false,ver:0,o:{bright:85,warm:0,contrast:1,text:0,dark:0}};
try{Object.assign(S.o,JSON.parse(localStorage.pnr||'{}'))}catch(e){}
if(!OPTS.bright[1].includes(S.o.bright))S.o.bright=55;
const dpr=Math.min(devicePixelRatio||1,2),MAXPX=innerWidth<700?3e6:6e6,B=document.body,wide=()=>innerWidth>=900;
const eff=()=>S.night?S.theme:'original',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let PA,PB,act,target=null;
const AP=()=>act;

/* ---------- dark treatment (runs in a Web Worker so scrolling never stalls) ---------- */
function darkenBuf(d,w,h,bg,tx,keepOn,scanned){
 const B=16,bw=Math.ceil(w/B),bh=Math.ceil(h/B),keep=new Uint8Array(bw*bh);
 if(keepOn&&!scanned){for(let by=0;by<bh;by++)for(let bx=0;bx<bw;bx++){let mid=0,n=0;
  for(let y=by*B;y<Math.min(h,by*B+B);y+=2)for(let x=bx*B;x<Math.min(w,bx*B+B);x+=2){const k=(y*w+x)*4,L=d[k]*.299+d[k+1]*.587+d[k+2]*.114,sat=Math.max(d[k],d[k+1],d[k+2])-Math.min(d[k],d[k+1],d[k+2]);
   n++;if((L>35&&L<220)||sat>60)mid++}
  keep[by*bw+bx]=mid/n>.55?1:0}}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(keep[((y/B)|0)*bw+((x/B)|0)])continue;
  const k=(y*w+x)*4,r=d[k],g=d[k+1],b=d[k+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),L=r*.299+g*.587+b*.114;
  if(scanned||mx-mn<45){const t=L/255;d[k]=tx[0]+(bg[0]-tx[0])*t;d[k+1]=tx[1]+(bg[1]-tx[1])*t;d[k+2]=tx[2]+(bg[2]-tx[2])*t}
  else if(L>195){const f=.42;d[k]=r*f+bg[0]*.5;d[k+1]=g*f+bg[1]*.5;d[k+2]=b*f+bg[2]*.5}
  else if(L<95){const f=1.7;d[k]=Math.min(255,r*f+40);d[k+1]=Math.min(255,g*f+40);d[k+2]=Math.min(255,b*f+40)}
 }}
let W=null,jid=0;const jobs=new Map();
try{W=new Worker(URL.createObjectURL(new Blob(['const f='+darkenBuf.toString()+';onmessage=e=>{const m=e.data,d=new Uint8ClampedArray(m.buf);f(d,m.w,m.h,m.bg,m.tx,m.keep,m.scanned);postMessage({id:m.id,buf:m.buf},[m.buf])}'])));
 W.onmessage=e=>{const j=jobs.get(e.data.id);jobs.delete(e.data.id);j&&j(e.data.buf)};
 W.onerror=()=>{W=null;jobs.forEach(j=>j(null));jobs.clear()}}catch(e){W=null}
function palette(){const th=THEMES[S.theme];let bg=th[1].slice(),tx=th[2].slice();
 if(S.o.dark)bg=bg.map(v=>v*.35);if(S.o.text)tx=tx.map(v=>v+(255-v)*.6);return[bg,tx]}
function darken(ctx,w,h,scanned){
 const img=ctx.getImageData(0,0,w,h),[bg,tx]=palette(),keep=S.keep;
 const local=()=>{const i2=ctx.getImageData(0,0,w,h);darkenBuf(i2.data,w,h,bg,tx,keep,scanned);ctx.putImageData(i2,0,0)};
 if(!W){local();return Promise.resolve()}
 return new Promise(res=>{const id=++jid;
  jobs.set(id,buf=>{buf?ctx.putImageData(new ImageData(new Uint8ClampedArray(buf),w,h),0,0):local();res()});
  W.postMessage({id,buf:img.data.buffer,w,h,bg,tx,keep,scanned},[img.data.buffer])})}
const scanCache=new WeakMap();
async function isScan(pg){let v=scanCache.get(pg);if(v===undefined){v=(await pg.getTextContent()).items.length===0;scanCache.set(pg,v)}return v}
async function raster(pg,sc,rot,ts,h){
 const r=(pg.rotate+rot)%360;let vp=pg.getViewport({scale:sc,rotation:r});
 const cap=Math.sqrt(MAXPX/(vp.width*vp.height));if(cap<1)vp=pg.getViewport({scale:sc*cap,rotation:r});
 const c=document.createElement('canvas');c.width=Math.floor(vp.width);c.height=Math.floor(vp.height);
 const ctx=c.getContext('2d');h.t=pg.render({canvasContext:ctx,viewport:vp,background:'#ffffff'});await h.t.promise;h.t=null;
 if(eff()!=='original')await darken(ctx,c.width,c.height,ts);return c}

/* ---------- render queue: nearest-to-screen first, stale jobs dropped ---------- */
const Q=[];let running=0;
function enqueue(j){Q.push(j);pump()}
function pump(){while(running<2&&Q.length){let bi=0,bp=Infinity;
 for(let i=0;i<Q.length;i++){if(!Q[i].ok()){Q.splice(i--,1);continue}const p=Q[i].pri();if(p<bp){bp=p;bi=i}}
 if(!Q.length)return;const j=Q.splice(bi,1)[0];running++;j.run().finally(()=>{running--;pump()})}}

/* ---------- one reader pane (the app has two) ---------- */
class Pane{
constructor(id){this.id=id;const r=this.root=document.createElement('section');r.className='pane';r.id='p'+id;r._p=this;
 r.innerHTML=`<div class="pbar"><b class="pn">Empty</b><button class="ib sm" data-a="x" aria-label="Close this PDF"><svg class="ic"><use href="#i-x"/></svg></button></div>
<div class="rd"><div class="vw"></div></div>
<div class="empty"><button class="btn primary" data-a="open">Choose PDF</button><span>or drop a PDF here</span></div>
<div class="busy" hidden>Rendering…</div>
<nav class="pager"><button class="ib" data-a="pv" aria-label="Previous page"><svg class="ic"><use href="#i-prev"/></svg></button><span class="pg"><input class="pi" value="1" inputmode="numeric" aria-label="Page"> / <span class="pt">1</span></span><button class="ib" data-a="nx" aria-label="Next page"><svg class="ic"><use href="#i-next"/></svg></button></nav>`;
 const q=s=>r.querySelector(s);this.rd=q('.rd');this.vw=q('.vw');this.pn=q('.pn');this.pi=q('.pi');this.pt=q('.pt');this.bz=q('.busy');
 Object.assign(this,{pdf:null,pages:[],els:[],tops:[],hs:[],live:new Set(),scale:1,rot:0,fit:'width',cur:1,matches:[],mi:-1,texts:null,nb:0,buf:null,name:''});
 const rd=this.rd,vw=this.vw;
 r.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a)return;
  ({pv:()=>this.goTo(this.cur-1),nx:()=>this.goTo(this.cur+1),open:()=>pick(this),x:()=>{this.clear();const o=this===PA?PB:PA;if(act===this&&o.pdf)setActive(o);else{ui();syncThumbs()}}})[a.dataset.a]()});
 r.addEventListener('pointerdown',()=>{if(act!==this)setActive(this)},true);
 this.pi.onchange=()=>this.goTo(parseInt(this.pi.value));this.pi.onfocus=()=>this.pi.select();
 let raf=0;rd.addEventListener('scroll',()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;this.update();this.track()})},{passive:true});
 /* pinch / ctrl-wheel: GPU-scale the pages while the fingers move, re-render crisp once at the end */
 let pz=null,ww=null,wt;
 const org=(cx,cy)=>{vw.style.transformOrigin=`${cx+rd.scrollLeft}px ${cy+rd.scrollTop}px`;vw.style.willChange='transform'};
 rd.addEventListener('touchstart',e=>{if(e.touches.length!==2||!this.pdf)return;const[a,b]=e.touches,rc=rd.getBoundingClientRect();
  pz={d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),r:1,cx:(a.clientX+b.clientX)/2-rc.left,cy:(a.clientY+b.clientY)/2-rc.top};org(pz.cx,pz.cy)},{passive:true});
 rd.addEventListener('touchmove',e=>{if(!pz||e.touches.length!==2)return;e.preventDefault();const[a,b]=e.touches;
  pz.r=clamp(Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)/pz.d,.25/this.scale,5/this.scale);vw.style.transform=`scale(${pz.r})`},{passive:false});
 rd.addEventListener('touchend',e=>{if(!pz||e.touches.length>1)return;const z=pz;pz=null;this.commit(z.r,z.cx,z.cy)});
 rd.addEventListener('wheel',e=>{if(!e.ctrlKey||!this.pdf)return;e.preventDefault();
  if(!ww){const rc=rd.getBoundingClientRect();ww={r:1,cx:e.clientX-rc.left,cy:e.clientY-rc.top};org(ww.cx,ww.cy)}
  ww.r=clamp(ww.r*Math.exp(-e.deltaY*.01),.25/this.scale,5/this.scale);vw.style.transform=`scale(${ww.r})`;
  clearTimeout(wt);wt=setTimeout(()=>{const z=ww;ww=null;this.commit(z.r,z.cx,z.cy)},140)},{passive:false});
 /* only a real width change re-fits: mobile URL-bar / keyboard height changes never rebuild */
 let rw=0,rh=0,rt;new ResizeObserver(()=>{clearTimeout(rt);rt=setTimeout(()=>{const w=rd.clientWidth,h=rd.clientHeight;
  if(!w||!h){rw=0;this.dropAll();return}
  if(!rw||Math.abs(w-rw)>=2||(this.fit==='page'&&Math.abs(h-rh)>=120)){rw=w;rh=h;this.relayout()}else this.update()},100)}).observe(rd)}
vp(pg,s){return pg.getViewport({scale:s,rotation:(pg.rotate+this.rot)%360})}
key(){return this.scale.toFixed(3)+'|'+this.rot+'|'+S.ver}
find(y){const t=this.tops;let lo=0,hi=t.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(t[m]<=y)lo=m;else hi=m-1}return lo}
setDoc(pdf,pages,buf,name){this.clear();Object.assign(this,{pdf,pages,buf,name,scale:1,rot:0,fit:'width',cur:1,matches:[],mi:-1,texts:null});
 this.root.classList.add('has');this.pn.textContent=name;this.pt.textContent=pages.length;this.pi.value=1;
 this.els=pages.map(()=>{const e=document.createElement('div');e.className='page';this.vw.appendChild(e);return e});this.relayout({i:0,f:0})}
clear(){this.dropAll();const d=this.pdf;this.vw.textContent='';Object.assign(this,{pdf:null,pages:[],els:[],tops:[],hs:[],buf:null,name:'',texts:null,matches:[],mi:-1});
 d&&d.destroy();this.root.classList.remove('has');this.pn.textContent='Empty'}
anchor(){if(!this.tops.length)return{i:0,f:0};const i=this.find(this.rd.scrollTop);return{i,f:(this.rd.scrollTop-this.tops[i])/(this.hs[i]||1)}}
size(){this.pages.forEach((pg,i)=>{const v=this.vp(pg,this.scale),s=this.els[i].style;s.width=v.width+'px';s.height=v.height+'px'});
 this.tops=this.els.map(e=>e.offsetTop);this.hs=this.els.map(e=>e.offsetHeight)}
relayout(a){if(!this.pdf||!this.rd.clientWidth)return;a=a||this.anchor();
 if(this.fit){const v=this.vp(this.pages[0],1),w=this.rd.clientWidth,pad=w<700?14:48,fw=(w-pad)/v.width;
  this.scale=Math.max(.2,this.fit==='width'?fw:Math.min((this.rd.clientHeight-40)/v.height,fw))}
 this.size();this.rd.scrollTop=this.tops[a.i]+a.f*this.hs[a.i];this.update();this.track(true);if(act===this)ui()}
commit(r,cx,cy){const rd=this.rd,vw=this.vw,sl=rd.scrollLeft,st=rd.scrollTop;
 vw.style.transform='';vw.style.willChange='';vw.style.transformOrigin='';
 if(Math.abs(r-1)<.02)return;this.fit=null;this.scale=clamp(this.scale*r,.25,5);this.size();
 rd.scrollLeft=(cx+sl)*r-cx;rd.scrollTop=(cy+st)*r-cy;this.update();if(act===this)ui()}
zoom(f){if(!this.pdf)return;this.fit=null;this.scale=clamp(this.scale*f,.25,5);this.relayout()}
update(){if(!this.pdf)return;const rd=this.rd,h=rd.clientHeight;if(!h||!this.tops.length)return;const t=rd.scrollTop,k=this.key();
 for(let i=this.find(t-h*.8),b=this.find(t+h*1.6);i<=b;i++)this.want(i,k);
 const fa=this.find(t-h*2.5),fb=this.find(t+h*3.5);this.live.forEach(i=>{if(i<fa||i>fb)this.release(i)})}
want(i,k){const el=this.els[i];this.live.add(i);if(el._k===k||el._q===k)return;
 if(el._h&&el._h.t)el._h.t.cancel();el._q=k;
 enqueue({ok:()=>el._q===k&&this.live.has(i),pri:()=>Math.abs(this.tops[i]+this.hs[i]/2-this.rd.scrollTop-this.rd.clientHeight/2),run:()=>this.draw(i,k)})}
release(i){const el=this.els[i];this.live.delete(i);if(!el)return;if(el._h&&el._h.t)el._h.t.cancel();el._q=el._k=null;
 const c=el.firstChild;if(c){c.width=c.height=0;el.textContent=''}}
dropAll(){[...this.live].forEach(i=>this.release(i))}
async draw(i,k){const el=this.els[i],pg=this.pages[i],h=el._h={};this.busy(1);
 try{const ts=await isScan(pg);if(el._q!==k)return;
  const c=await raster(pg,this.scale*dpr,this.rot,ts,h);
  if(el._q!==k||!this.live.has(i)){c.width=c.height=0;return}
  if(!el.firstChild)c.className='fi';el.replaceChildren(c);el._k=k; /* old canvas stays until the new one is ready: no blank flash */
 }catch(e){if(el._q===k)el._q=null}finally{el._h=null;this.busy(-1)}}
busy(d){this.nb=Math.max(0,this.nb+d);if(this.nb>0){if(!this._bt)this._bt=setTimeout(()=>this.bz.hidden=false,500)}else{clearTimeout(this._bt);this._bt=0;this.bz.hidden=true}}
track(force){if(!this.tops.length)return;const c=this.find(this.rd.scrollTop+this.rd.clientHeight/3)+1;if(c!==this.cur||force){this.cur=c;if(document.activeElement!==this.pi)this.pi.value=c;if(act===this)ui()}}
goTo(n,instant){if(!this.pdf)return;n=clamp(n|0||1,1,this.pages.length);this.cur=n;const t=this.tops[n-1]-12,far=Math.abs(t-this.rd.scrollTop)>this.rd.clientHeight*3;
 instant||far?this.rd.scrollTop=t:this.rd.scrollTo({top:t,behavior:'smooth'});this.pi.value=n;if(act===this)ui()}
}

/* ---------- thumbnails (follow the active pane) ---------- */
const thumbs=$('#thumbs');let ths=[],thDoc=null,thCur=-1;
const tio=new IntersectionObserver(es=>es.forEach(e=>{const el=e.target;if(e.isIntersecting&&(!el._done||el._v!==S.ver)&&B.classList.contains('s-thumbs'))renderThumb(el)}),{root:thumbs,rootMargin:'400px'});
function syncThumbs(){const p=AP();if(!p||p.pdf===thDoc)return;thDoc=p.pdf;thumbs.innerHTML='';ths=[];thCur=-1;tio.disconnect();if(!p.pdf)return;
 p.pages.forEach((pg,i)=>{const v=pg.getViewport({scale:1}),w=130,h=w*v.height/v.width,el=document.createElement('div');el.className='th';el._i=i;el._p=p;
  el.innerHTML=`<span class="box" style="width:${w}px;height:${h}px"></span>${i+1}`;el.onclick=()=>p.goTo(i+1);thumbs.appendChild(el);ths.push(el);tio.observe(el)});ui()}
async function renderThumb(el){el._done=1;el._v=S.ver;const p=el._p,pg=p.pages[el._i];if(!pg)return;const v=pg.getViewport({scale:1});
 try{const c=await raster(pg,130/v.width,p.rot,false,{});if(!el.isConnected)return;c.style.cssText='width:130px;height:auto';el.firstChild.replaceChildren(c)}catch(e){}}
function refreshThumbs(){ths.forEach(t=>{if(t._done){tio.unobserve(t);tio.observe(t)}})}

/* ---------- status / active pane ---------- */
function ui(){const p=AP();if(!p)return;
 $('#fn').textContent=p.name||'—';$('#fp').textContent=p.pdf?p.pages.length+' pages':'';$('#zv').textContent=Math.round(p.scale*100)+'%';
 $('#st').textContent=p.pdf?`Page ${p.cur} of ${p.pages.length} • ${Math.round(p.scale*100)}% • ${THEMES[eff()][0]}`:'';
 if(p.pdf===thDoc&&thCur!==p.cur-1){ths[thCur]&&ths[thCur].classList.remove('cur');thCur=p.cur-1;const t=ths[thCur];
  if(t){t.classList.add('cur');if(B.classList.contains('s-thumbs'))thumbs.scrollTop=t.offsetTop-thumbs.clientHeight/2}}}
function setActive(p){act=p;PA.root.classList.toggle('act',p===PA);PB.root.classList.toggle('act',p===PB);syncThumbs();ui()}

/* ---------- file loading ---------- */
const file=$('#file');
function pick(p){target=p;file.value='';file.click()}
$('#choose').onclick=()=>pick(PA);$('#newf').onclick=()=>pick(AP());
file.onchange=()=>file.files[0]&&load(file.files[0],target||AP());
const drop=$('#drop');
['dragover','dragenter'].forEach(e=>document.addEventListener(e,x=>{x.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(e=>document.addEventListener(e,x=>{x.preventDefault();drop.classList.remove('over')}));
document.addEventListener('drop',e=>{const f=e.dataTransfer.files[0],h=e.target.closest&&e.target.closest('.pane');f&&load(f,h?h._p:AP())});
async function load(f,p){
 if(f.type!=='application/pdf'&&!/\.pdf$/i.test(f.name))return alert('Please choose a PDF file.');
 let buf,pdf,pages;
 try{buf=await f.arrayBuffer();pdf=await pdfjsLib.getDocument({data:buf.slice(0)}).promise;
  pages=await Promise.all([...Array(pdf.numPages)].map((_,i)=>pdf.getPage(i+1)))}
 catch(e){return alert('Could not open this PDF (it may be corrupted or password-protected).')}
 $('#landing').hidden=true;$('#app').hidden=false;
 p.setDoc(pdf,pages,buf,f.name);$('#q').value='';$('#qc').textContent='';
 setActive(p);closeAll();if(wide()&&!S.dual)openP('thumbs');
}

/* ---------- dual PDF ---------- */
const panes=$('#panes'),split=document.createElement('div');split.id='split';
PA=new Pane('A');PB=new Pane('B');panes.append(PA.root,split,PB.root);act=PA;PA.root.classList.add('act');
let lastMode='';
function layoutApply(){const m=S.layout==='auto'?(wide()?'side':'stack'):S.layout;panes.classList.toggle('side',m==='side');panes.classList.toggle('stack',m==='stack');
 if(m!==lastMode){lastMode=m;PA.root.style.flex=PB.root.style.flex=''}
 $('#lay span').textContent='Layout: '+({auto:'Auto',side:'Side by side',stack:'Top / bottom'})[S.layout]}
function setDual(on){S.dual=on;B.classList.toggle('dual',on);$('#dualM').classList.toggle('on',on);layoutApply();
 if(on){if(wide())B.classList.remove(P.thumbs);syncScrim();if(!PB.pdf)pick(PB);else setActive(PB)}else{PB.dropAll();setActive(PA)}}
$('#dualBtn').onclick=$('#dualM').onclick=()=>setDual(!S.dual);
$('#lay').onclick=()=>{S.layout={auto:'side',side:'stack',stack:'auto'}[S.layout];lastMode='';layoutApply()};
$('#swap').onclick=()=>{S.swapped=!S.swapped;PA.root.style.order=S.swapped?3:1;PB.root.style.order=S.swapped?1:3;split.style.order=2;PA.root.style.flex=PB.root.style.flex=''};
split.onpointerdown=e=>{split.setPointerCapture(e.pointerId);split.classList.add('drag')};
split.onpointermove=e=>{if(!split.hasPointerCapture(e.pointerId))return;const rc=panes.getBoundingClientRect(),side=panes.classList.contains('side'),
 pct=clamp(((side?e.clientX-rc.left:e.clientY-rc.top)/(side?rc.width:rc.height))*100,20,80),f=S.swapped?PB:PA,o=S.swapped?PA:PB;
 f.root.style.flex=`0 0 calc(${pct}% - 6px)`;o.root.style.flex='1 1 0'};
split.onpointerup=split.onpointercancel=()=>split.classList.remove('drag');
layoutApply();

/* ---------- menu, panels ---------- */
const sc=$('#scrim'),P={menu:'s-menu',thumbs:'s-thumbs',comfort:'s-comfort'};
function syncScrim(){const o=B.classList.contains('s-menu')||(!wide()&&(B.classList.contains('s-thumbs')||B.classList.contains('s-comfort')));
 sc.className=o?(B.classList.contains('s-menu')&&innerWidth>=700?'on':'on dim'):'';$('#more').setAttribute('aria-expanded',B.classList.contains('s-menu'))}
function kickThumbs(){ths.forEach(t=>{if(!t._done){tio.unobserve(t);tio.observe(t)}});thCur=-1;ui()}
function openP(k,on=true){if(on&&k!=='menu'&&!wide())closeAll();
 if(on&&k==='menu')B.classList.remove(P.thumbs,P.comfort);B.classList.toggle(P[k],on);syncScrim();if(k==='thumbs'&&on)setTimeout(kickThumbs,0)}
function closeAll(){Object.values(P).forEach(c=>B.classList.remove(c));syncScrim()}
const tgl=k=>openP(k,!B.classList.contains(P[k]));
$('#more').onclick=()=>tgl('menu');
$('#tSide').onclick=$('#tSide2').onclick=()=>{B.classList.remove(P.menu);tgl('thumbs')};
$('#tSet').onclick=()=>{B.classList.remove(P.menu);tgl('comfort')};
sc.onclick=closeAll;
$('#menu').addEventListener('click',e=>{const b=e.target.closest('.mi');if(b&&!['night','tSide2','tSet','lay'].includes(b.id))setTimeout(()=>{B.classList.remove(P.menu);syncScrim()},120)});
thumbs.addEventListener('click',e=>{if(!wide()&&e.target.closest('.th'))setTimeout(closeAll,150)});
let rz;addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{layoutApply();syncScrim()},150)});
$('#zi').onclick=()=>AP().zoom(1.15);$('#zo').onclick=()=>AP().zoom(1/1.15);
$('#fw').onclick=()=>{const p=AP();p.fit='width';p.relayout()};$('#fpg').onclick=()=>{const p=AP();p.fit='page';p.relayout()};
$('#rot').onclick=()=>{const p=AP();if(!p.pdf)return;p.rot=(p.rot+90)%360;p.relayout();refreshThumbs()};
$('#prev')&&0;
const de=document.documentElement,canFS=!!de.requestFullscreen,fs=()=>document.fullscreenElement?document.exitFullscreen():de.requestFullscreen();
if(!canFS)$('#full').hidden=true;$('#full').onclick=fs;
const blobURL=()=>URL.createObjectURL(new Blob([AP().buf],{type:'application/pdf'}));
$('#dl').onclick=()=>{if(!AP().pdf)return;const a=document.createElement('a');a.href=blobURL();a.download=AP().name;a.click()};
$('#pr').onclick=()=>{if(!AP().pdf)return;const f=document.createElement('iframe');f.style.cssText='position:fixed;width:0;height:0;border:0';
 f.src=blobURL();document.body.appendChild(f);f.onload=()=>{try{f.contentWindow.print()}catch(e){window.open(f.src)}}};
function focus(on){B.classList.toggle('focus',on);$('#exitF').hidden=!on;closeAll();
 if(canFS){if(on&&!document.fullscreenElement)de.requestFullscreen().catch(()=>{});if(!on&&document.fullscreenElement)document.exitFullscreen()}}
$('#focus').onclick=()=>focus(!B.classList.contains('focus'));$('#exitF').onclick=()=>focus(false);

/* ---------- comfort ---------- */
function restyle(){S.ver++;[PA,PB].forEach(p=>p.update());refreshThumbs();applyComfort()}
function setNight(v){S.night=v;B.classList.toggle('night',v);restyle()}
$('#night').onclick=()=>setNight(!S.night);
$('#themes').innerHTML=Object.entries(THEMES).map(([k,v])=>`<button class="chip" data-t="${k}">${v[0]}</button>`).join('');
$('#themes').onclick=e=>{const t=e.target.dataset.t;if(!t)return;S.theme=t;S.night=t!=='original';B.classList.toggle('night',S.night);restyle()};
$('#keep').onchange=e=>{S.keep=e.target.checked;restyle()};
$$('.opt').forEach(o=>{const k=o.dataset.k,[,vals,,fmt]=OPTS[k];
 o.querySelector('.seg').innerHTML=vals.map((v,i)=>`<button class="chip" data-i="${i}">${fmt?fmt(v):v}</button>`).join('');
 o.onclick=e=>{const i=e.target.dataset.i;if(i==null)return;S.o[k]=k==='bright'?vals[i]:+i;localStorage.pnr=JSON.stringify(S.o);
  if(k==='dark'||k==='text')restyle();else applyComfort()}});
function syncChips(){$$('#themes .chip').forEach(c=>c.classList.toggle('on',c.dataset.t===eff()));
 $$('.opt').forEach(o=>{const k=o.dataset.k;o.querySelectorAll('.chip').forEach((c,i)=>c.classList.toggle('on',k==='bright'?OPTS.bright[1][i]===S.o.bright:S.o[k]===i))})}
/* filter sits on the viewport-sized scroller, not the tall page stack, so scrolling stays on the GPU fast path */
function applyComfort(){const w=[0,.18,.38][S.o.warm],c=[.9,1,1.15][S.o.contrast],b=S.night?S.o.bright/55:1;
 const f=`brightness(${Math.min(1.5,b)}) contrast(${c}) sepia(${S.night?w:0})`;[PA,PB].forEach(p=>p.rd.style.filter=f);syncChips();ui()}

/* ---------- search (active pane) ---------- */
async function getTexts(p){if(p.texts)return p.texts;const t=[];for(const pg of p.pages)t.push((await pg.getTextContent()).items.map(i=>i.str).join(' ').toLowerCase());return p.texts=t}
async function search(){const p=AP(),q=$('#q').value.trim().toLowerCase();p.matches=[];p.mi=-1;if(!q||!p.pdf){$('#qc').textContent='';mark();return}
 $('#qc').textContent='…';(await getTexts(p)).forEach((t,pi)=>{let i=-1;while((i=t.indexOf(q,i+1))>-1)p.matches.push(pi)});
 $('#qc').textContent=p.matches.length?'':'0';if(p.matches.length)step(1)}
function step(d){const p=AP();if(!p.matches.length)return;p.mi=(p.mi+d+p.matches.length)%p.matches.length;p.goTo(p.matches[p.mi]+1);
 $('#qc').textContent=`${p.mi+1}/${p.matches.length}`;mark()}
function mark(){const p=AP();p.els.forEach((e,i)=>e.classList.toggle('hit',p.mi>=0&&p.matches[p.mi]===i))}
function openSearch(){$('#sbar').hidden=false;B.classList.remove(P.menu);syncScrim();setTimeout(()=>{$('#q').focus();$('#q').select()},60)}
function closeSearch(){$('#sbar').hidden=true;$('#q').blur()}
$('#sBtn').onclick=()=>$('#sbar').hidden?openSearch():closeSearch();$('#sBtn2').onclick=openSearch;$('#sx').onclick=closeSearch;
let sd;$('#q').oninput=()=>{clearTimeout(sd);sd=setTimeout(search,250)};
$('#q').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();step(e.shiftKey?-1:1)}};
$('#qn').onclick=()=>step(1);$('#qp').onclick=()=>step(-1);

/* ---------- shortcuts ---------- */
addEventListener('keydown',e=>{const p=AP();if(!p||!p.pdf)return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();openSearch();return}
 if(/INPUT/.test(e.target.tagName)){if(e.key==='Escape'){e.target.blur();if(e.target.id==='q')closeSearch()}return}
 const k=e.key;
 if(k==='ArrowLeft')p.goTo(p.cur-1);else if(k==='ArrowRight')p.goTo(p.cur+1);
 else if(k==='+'||k==='=')p.zoom(1.15);else if(k==='-')p.zoom(1/1.15);
 else if(k==='f'||k==='F'){p.fit='page';p.relayout()}else if(k==='w'||k==='W'){p.fit='width';p.relayout()}
 else if(k==='d'||k==='D')setDual(!S.dual);
 else if(k==='n'||k==='N')setNight(!S.night);
 else if(k==='Escape'){if(B.classList.contains('focus'))focus(false);else closeAll()}});
syncChips();
})();

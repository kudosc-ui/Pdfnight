(()=>{'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob(['importScripts("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js")'],{type:'text/javascript'}));
const THEMES={dark:['Dark',[17,17,17],[224,224,224]],midnight:['Midnight',[9,14,30],[196,212,242]],warm:['Warm Dark',[26,21,15],[232,214,184]],contrast:['High Contrast',[0,0,0],[255,255,255]],original:['Original']};
const OPTS={bright:['Brightness',[25,40,55,70,85],55,v=>v+'%'],warm:['Warmth',['Neutral','Slightly Warm','Warm'],1],contrast:['Contrast',['Low','Comfortable','High'],1],text:['Text',['Normal','Bright'],0],dark:['Page',['Dark','Very Dark'],0]};
const S={pdf:null,pages:[],buf:null,name:'',scale:1,rot:0,fit:'width',theme:'dark',night:true,keep:true,cur:1,
 o:{bright:85,warm:0,contrast:1,text:0,dark:0},matches:[],mi:-1,els:[],ths:[]};
try{Object.assign(S.o,JSON.parse(localStorage.pnr||'{}'))}catch(e){}
const dpr=Math.min(devicePixelRatio||1,1.5);
const reader=$('#reader'),viewer=$('#viewer');

/* ---------- file loading ---------- */
const file=$('#file');
$('#choose').onclick=()=>file.click();$('#newf').onclick=()=>file.click();
file.onchange=()=>file.files[0]&&load(file.files[0]);
const drop=$('#drop');
['dragover','dragenter'].forEach(e=>document.addEventListener(e,x=>{x.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(e=>document.addEventListener(e,x=>{x.preventDefault();drop.classList.remove('over')}));
document.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];f&&load(f)});
async function load(f){
 if(f.type!=='application/pdf'&&!/\.pdf$/i.test(f.name))return alert('Please choose a PDF file.');
 try{S.buf=await f.arrayBuffer();S.name=f.name;
  S.pdf=await pdfjsLib.getDocument({data:S.buf.slice(0)}).promise;
  S.pages=await Promise.all([...Array(S.pdf.numPages)].map((_,i)=>S.pdf.getPage(i+1)));
 }catch(e){return alert('Could not open this PDF (it may be corrupted or password-protected).')}
 $('#landing').hidden=true;$('#app').hidden=false;
 $('#fn').textContent=f.name;$('#fp').textContent=S.pdf.numPages+' pages';$('#pgTot').textContent=S.pdf.numPages;
 S.cur=1;S.rot=0;S.fit='width';S.matches=[];$('#qc').textContent='';$('#q').value='';
 build();
}

/* ---------- layout & lazy rendering ---------- */
const io=new IntersectionObserver(es=>es.forEach(e=>{const el=e.target,i=el._i;
 if(e.isIntersecting){if(!el._done)renderPage(el,i)}else if(el._done){el.innerHTML='';el._done=0;el._t++}}),{root:reader,rootMargin:'900px 0px'});
const tio=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting&&!e.target._done)renderThumb(e.target)}),{root:$('#thumbs'),rootMargin:'400px'});
const eff=()=>S.night?S.theme:'original';
function baseVP(p){return p.getViewport({scale:1,rotation:(p.rotate+S.rot)%360})}
function computeFit(){const v=baseVP(S.pages[0]);
 if(S.fit==='width')S.scale=(reader.clientWidth-60)/v.width;
 else if(S.fit==='page')S.scale=Math.min((reader.clientHeight-40)/v.height,(reader.clientWidth-60)/v.width)}
function build(){
 io.disconnect();viewer.innerHTML='';S.els=[];computeFit();
 S.pages.forEach((p,i)=>{const v=p.getViewport({scale:S.scale,rotation:(p.rotate+S.rot)%360});
  const el=document.createElement('div');el.className='page';el._i=i;el._t=0;
  el.style.width=v.width+'px';el.style.height=v.height+'px';viewer.appendChild(el);S.els.push(el);io.observe(el)});
 $('#zv').textContent=Math.round(S.scale*100)+'%';
 if(!S.ths.length||S.ths._doc!==S.pdf)buildThumbs();
 refreshThumbs();goTo(S.cur,true);applyComfort();
}
function paint(canvas,page,scale,scanned){
 const vp=page.getViewport({scale:scale*dpr,rotation:(page.rotate+S.rot)%360});
 canvas.width=Math.floor(vp.width);canvas.height=Math.floor(vp.height);
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 return page.render({canvasContext:ctx,viewport:vp,background:'#ffffff'}).promise.then(()=>{
  if(eff()!=='original')darken(ctx,canvas.width,canvas.height,scanned)});
}
async function renderPage(el,i){
 const t=++el._t;el._done=1;busyN++;$("#busy").hidden=false;
 const p=S.pages[i];
 const scanned=(await p.getTextContent()).items.length===0;
 const c=document.createElement('canvas');
 try{await paint(c,p,S.scale,scanned)}catch(e){}
 if(t!==el._t){busyN--;return}el.innerHTML='';el.appendChild(c);
 $('#busy').hidden=!!(--busyN<=0);
}
let busyN=0;
/* ---------- smart dark treatment ---------- */
function palette(){const th=THEMES[S.theme];let bg=th[1].slice(),tx=th[2].slice();
 if(S.o.dark)bg=bg.map(v=>v*.35);if(S.o.text)tx=tx.map(v=>v+(255-v)*.6);return[bg,tx]}
function darken(ctx,w,h,scanned){
 const[bg,tx]=palette(),img=ctx.getImageData(0,0,w,h),d=img.data,B=16,bw=Math.ceil(w/B),bh=Math.ceil(h/B),keep=new Uint8Array(bw*bh);
 if(S.keep&&!scanned){ // detect photo-like blocks: many mid-tone/coloured pixels
  for(let by=0;by<bh;by++)for(let bx=0;bx<bw;bx++){let mid=0,n=0;
   for(let y=by*B;y<Math.min(h,by*B+B);y+=2)for(let x=bx*B;x<Math.min(w,bx*B+B);x+=2){const k=(y*w+x)*4,L=d[k]*.299+d[k+1]*.587+d[k+2]*.114,sat=Math.max(d[k],d[k+1],d[k+2])-Math.min(d[k],d[k+1],d[k+2]);
    n++;if((L>35&&L<220)||sat>60)mid++}
   keep[by*bw+bx]=mid/n>.55?1:0}
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(keep[((y/B)|0)*bw+((x/B)|0)])continue;
  const k=(y*w+x)*4,r=d[k],g=d[k+1],b=d[k+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),L=r*.299+g*.587+b*.114;
  if(scanned||mx-mn<45){const t=L/255;d[k]=tx[0]+(bg[0]-tx[0])*t;d[k+1]=tx[1]+(bg[1]-tx[1])*t;d[k+2]=tx[2]+(bg[2]-tx[2])*t}
  else if(L>195){const f=.42;d[k]=r*f+bg[0]*.5;d[k+1]=g*f+bg[1]*.5;d[k+2]=b*f+bg[2]*.5} // light tinted fills
  else if(L<95){const f=1.7;d[k]=Math.min(255,r*f+40);d[k+1]=Math.min(255,g*f+40);d[k+2]=Math.min(255,b*f+40)} // dark coloured text/lines
 }
 ctx.putImageData(img,0,0);
}
/* ---------- thumbnails ---------- */
function buildThumbs(){const box=$('#thumbs');box.innerHTML='';S.ths=[];S.ths._doc=S.pdf;tio.disconnect();
 S.pages.forEach((p,i)=>{const v=p.getViewport({scale:1}),w=130,h=w*v.height/v.width;
  const el=document.createElement('div');el.className='th';el._i=i;
  el.innerHTML=`<span class="box" style="width:${w}px;height:${h}px"></span>${i+1}`;
  el.onclick=()=>goTo(i+1);box.appendChild(el);S.ths.push(el);tio.observe(el)})}
async function renderThumb(el){el._done=1;const p=S.pages[el._i],v=p.getViewport({scale:1}),c=document.createElement('canvas');
 const scanned=false;try{await paint(c,p,130/v.width/dpr,scanned)}catch(e){}c.style.width='130px';c.style.height='auto';
 el.firstChild.innerHTML='';el.firstChild.appendChild(c)}
function refreshThumbs(){S.ths.forEach(t=>{if(t._done){t._done=0;tio.unobserve(t);tio.observe(t)}})}

/* ---------- navigation ---------- */
function goTo(n,instant){n=Math.max(1,Math.min(S.pdf.numPages,n|0||1));S.cur=n;
 const el=S.els[n-1];if(el)reader.scrollTop=el.offsetTop-12;ui()}
function ui(){$('#pgIn').value=S.cur;$('#st').textContent=`Page ${S.cur} of ${S.pdf.numPages} • ${Math.round(S.scale*100)}% • ${THEMES[eff()][0]}`;
 S.ths.forEach((t,i)=>t.classList.toggle('cur',i===S.cur-1));const t=S.ths[S.cur-1];if(t)t.scrollIntoView({block:'nearest'})}
let raf=0;reader.addEventListener('scroll',()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;if(!S.els.length)return;
 const mid=reader.scrollTop+reader.clientHeight/3;let lo=0;for(let i=0;i<S.els.length;i++){if(S.els[i].offsetTop<=mid)lo=i;else break}
 if(lo+1!==S.cur){S.cur=lo+1;ui()}})});
$('#prev').onclick=()=>goTo(S.cur-1);$('#next').onclick=()=>goTo(S.cur+1);
$('#pgIn').onchange=e=>goTo(parseInt(e.target.value));
function zoom(f){S.fit=null;S.scale=Math.max(.25,Math.min(5,S.scale*f));build()}
$('#zi').onclick=()=>zoom(1.15);$('#zo').onclick=()=>zoom(1/1.15);
$('#fw').onclick=()=>{S.fit='width';build()};$('#fpg').onclick=()=>{S.fit='page';build()};
$('#rot').onclick=()=>{S.rot=(S.rot+90)%360;build()};
addEventListener('resize',()=>{if(S.fit&&S.pdf)build()});
const fs=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
$('#full').onclick=fs;
$('#dl').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([S.buf],{type:'application/pdf'}));a.download=S.name;a.click()};
$('#pr').onclick=()=>{const f=document.createElement('iframe');f.style.cssText='position:fixed;width:0;height:0;border:0';
 f.src=URL.createObjectURL(new Blob([S.buf],{type:'application/pdf'}));document.body.appendChild(f);f.onload=()=>{try{f.contentWindow.print()}catch(e){window.open(f.src)}}};
$('#tSide').onclick=()=>{const t=$('#thumbs');t.hidden=!t.hidden;if(S.fit)build()};
$('#tSet').onclick=()=>{const t=$('#comfort');t.hidden=!t.hidden;if(S.fit)build()};
function focus(on){document.body.classList.toggle('focus',on);$('#exitF').hidden=!on;if(on&&!document.fullscreenElement)document.documentElement.requestFullscreen().catch(()=>{});
 if(!on&&document.fullscreenElement)document.exitFullscreen();setTimeout(()=>S.fit&&build(),50)}
$('#focus').onclick=()=>focus(!document.body.classList.contains('focus'));$('#exitF').onclick=()=>focus(false);
function setNight(v){S.night=v;document.body.classList.toggle('night',v);build()}
$('#night').onclick=()=>setNight(!S.night);

/* ---------- comfort panel ---------- */
$('#themes').innerHTML=Object.entries(THEMES).map(([k,v])=>`<button class="chip" data-t="${k}">${v[0]}</button>`).join('');
$('#themes').onclick=e=>{const t=e.target.dataset.t;if(!t)return;S.theme=t;S.night=t!=='original';document.body.classList.toggle('night',S.night);syncChips();build()};
$('#keep').onchange=e=>{S.keep=e.target.checked;build()};
$$('.opt').forEach(o=>{const k=o.dataset.k,[,vals,def,fmt]=OPTS[k];
 o.querySelector('.seg').innerHTML=vals.map((v,i)=>`<button class="chip" data-i="${i}">${fmt?fmt(v):v}</button>`).join('');
 o.onclick=e=>{const i=e.target.dataset.i;if(i==null)return;S.o[k]=k==='bright'?vals[i]:+i;localStorage.pnr=JSON.stringify(S.o);syncChips();
  if(k==='dark'||k==='text')build();else applyComfort()}});
function syncChips(){$$('#themes .chip').forEach(c=>c.classList.toggle('on',c.dataset.t===(S.night?S.theme:'original')));
 $$('.opt').forEach(o=>{const k=o.dataset.k;o.querySelectorAll('.chip').forEach((c,i)=>c.classList.toggle('on',k==='bright'?OPTS.bright[1][i]===S.o.bright:S.o[k]===i))})}
function applyComfort(){const w=[0,.18,.38][S.o.warm],c=[.9,1,1.15][S.o.contrast],b=S.night?S.o.bright/55:1;
 viewer.style.filter=`brightness(${Math.min(1.5,b*(S.night?1:1))}) contrast(${c}) sepia(${S.night?w:0})`;syncChips();ui()}
if(!OPTS.bright[1].includes(S.o.bright))S.o.bright=55;

/* ---------- search ---------- */
let texts=null;
async function getTexts(){if(texts&&texts._d===S.pdf)return texts;texts=[];texts._d=S.pdf;
 for(const p of S.pages)texts.push((await p.getTextContent()).items.map(i=>i.str).join(' ').toLowerCase());return texts}
async function search(){const q=$('#q').value.trim().toLowerCase();S.matches=[];S.mi=-1;if(!q||!S.pdf){$('#qc').textContent='';mark();return}
 $('#qc').textContent='…';(await getTexts()).forEach((t,pi)=>{let i=-1;while((i=t.indexOf(q,i+1))>-1)S.matches.push(pi)});
 $('#qc').textContent=S.matches.length?'':'0';if(S.matches.length)step(1)}
function step(d){if(!S.matches.length)return;S.mi=(S.mi+d+S.matches.length)%S.matches.length;goTo(S.matches[S.mi]+1);
 $('#qc').textContent=`${S.mi+1}/${S.matches.length}`;mark()}
function mark(){S.els.forEach((e,i)=>e.classList.toggle('hit',S.mi>=0&&S.matches[S.mi]===i))}
let sd;$('#q').oninput=()=>{clearTimeout(sd);sd=setTimeout(search,250)};
$('#q').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();step(e.shiftKey?-1:1)}};
$('#qn').onclick=()=>step(1);$('#qp').onclick=()=>step(-1);

/* ---------- shortcuts ---------- */
addEventListener('keydown',e=>{if(!S.pdf)return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();$('#q').focus();$('#q').select();return}
 if(/INPUT/.test(e.target.tagName)){if(e.key==='Escape')e.target.blur();return}
 const k=e.key;
 if(k==='ArrowLeft')goTo(S.cur-1);else if(k==='ArrowRight')goTo(S.cur+1);
 else if(k==='+'||k==='=')zoom(1.15);else if(k==='-')zoom(1/1.15);
 else if(k==='f'||k==='F'){S.fit='page';build()}else if(k==='w'||k==='W'){S.fit='width';build()}
 else if(k==='n'||k==='N')setNight(!S.night);
 else if(k==='Escape'&&document.body.classList.contains('focus'))focus(false)});

/* keep the busy indicator honest */
new MutationObserver(()=>{});syncChips();
})();

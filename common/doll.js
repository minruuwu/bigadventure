/* Paper-doll renderer shared by the login page and the camp page.
   Based on assets/character_test/weapon_tune.html (same layer order, cut line, hair tint). */
(function(global){
'use strict';
var PAD=4,N=48,CUTROW=31,PERIOD=2000,WAX=[5/Math.hypot(5,11),-11/Math.hypot(5,11)],WG=[25,26];
var HAIR=[{n:'棕',h:0,s:112,l:11},{n:'紅',h:-13,s:160,l:17},{n:'金',h:37,s:141,l:44},{n:'藍',h:-152,s:190,l:39},{n:'綠',h:124,s:198,l:-4},{n:'黑',h:0,s:20,l:-30},{n:'白',h:0,s:0,l:90},{n:'粉',h:-36,s:170,l:54}];
var SKINN=['普通','淺色','深色'];
/* index 5 is 光頭 (kept for saved data). hair_06.png, hair_07.png ... are detected automatically and use index 6, 7 ... */
var STYLEN=['髮型 1','髮型 2','髮型 3','髮型 4','髮型 5','光頭'];
var STYLE_ORDER=[0,1,2,3,4,5];
function pad2(n){return (n<10?'0':'')+n}
function probeSeq(url,from,out){return loadImg(url(from)).then(function(im){if(!im||from>60)return out;out.push({n:from,im:im});return probeSeq(url,from+1,out)})}
/* numbered extras (hair_06…, job06…): remember how many exist (per browser session), load those in parallel, then probe onward */
function probeRun(url,key,from){var k=0,out=[];try{k=+sessionStorage.getItem(key)||0}catch(e){}
 var ns=[];for(var n=from;n<=Math.max(from,k+1);n++)ns.push(n);
 return Promise.all(ns.map(function(n){return loadImg(url(n))})).then(function(ims){var i=0;for(;i<ims.length&&ims[i];i++)out.push({n:ns[i],im:ims[i]});
  return i===ims.length?probeSeq(url,ns[ns.length-1]+1,out):out}).then(function(list){try{sessionStorage.setItem(key,String(list.length?list[list.length-1].n:from-1))}catch(e){}return list})}
function probeHairs(base,q,from){return probeRun(function(n){return base+'character/hair_'+pad2(n)+'.png'+q},'hairMax',from)}
/* job names / serials from data/job_info.csv (index 0 = job01) */
var JOBN=['戰士','魔法師','遊蕩者','牧師','鍊金士'],JOBSN=['job01','job02','job03','job04','job05'];
function loadJobs(base,q){return fetch(base+'data/job_info.csv'+q).then(function(r){return r.ok?r.text():''}).then(function(t){
  t.replace(/^\uFEFF/,'').split(/\r?\n/).slice(1).forEach(function(line){var c=line.split(','),m=/^job(\d+)$/.exec(c[0]||'');if(m&&c[1]){JOBN[+m[1]-1]=c[1].trim();JOBSN[+m[1]-1]=c[0]}})}).catch(function(){})}

function mk(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c}
function loadImg(src){return new Promise(function(res){var im=new Image();im.onload=function(){res(im)};im.onerror=function(){res(null)};im.src=src})}
function rgb2hsl(r,g,b){r/=255;g/=255;b/=255;var mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,h=0,s=0,dl=mx-mn;if(dl){s=l>.5?dl/(2-mx-mn):dl/(mx+mn);if(mx===r)h=((g-b)/dl+(g<b?6:0));else if(mx===g)h=(b-r)/dl+2;else h=(r-g)/dl+4;h*=60}return[h,s,l]}
function hue2rgb(p,q,t){if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p}
function hsl2rgb(h,s,l){h/=360;if(!s){var v=Math.round(l*255);return[v,v,v]}var q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;return[Math.round(hue2rgb(p,q,h+1/3)*255),Math.round(hue2rgb(p,q,h)*255),Math.round(hue2rgb(p,q,h-1/3)*255)]}
function tintRGB(r,g,b,t){var a=rgb2hsl(r,g,b),h=(a[0]+t.h+720)%360,s=Math.min(1,Math.max(0,a[1]*t.s/100)),l=a[2];if(t.l>0)l=l+(1-l)*t.l/100;else if(t.l<0)l=l*(1+t.l/100);return hsl2rgb(h,s,Math.min(1,Math.max(0,l)))}
function makeHair(img,t){var c=mk(40,40),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);var d=x.getImageData(0,0,40,40),p=d.data,B=tintRGB(123,63,52,t),out=new Uint8Array(1600),q=[],i;
 var al=new Uint8Array(1600);for(i=0;i<1600;i++)al[i]=p[i*4+3];
 for(i=0;i<1600;i++){if(al[i]>0&&al[i]<12)p[i*4+3]=0;else if(al[i]>0&&al[i]<40){var ix=i%40,iy=(i-ix)/40,solid=0;for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){var nx=ix+dx,ny=iy+dy;if((dx||dy)&&nx>=0&&nx<40&&ny>=0&&ny<40&&al[ny*40+nx]>=40)solid++}if(!solid)p[i*4+3]=0}}
 var clean=mk(40,40);clean.getContext('2d').putImageData(d,0,0);
 function push(n){if(n>=0&&!out[n]&&p[n*4+3]===0){out[n]=1;q.push(n)}}
 for(i=0;i<40;i++){push(i);push(1560+i);push(i*40);push(i*40+39)}
 while(q.length){var n=q.pop(),cx=n%40,cy=(n-cx)/40;if(cx>0)push(n-1);if(cx<39)push(n+1);if(cy>0)push(n-40);if(cy<39)push(n+40)}
 for(i=0;i<1600;i++){if(!out[i]){p[i*4]=B[0];p[i*4+1]=B[1];p[i*4+2]=B[2];p[i*4+3]=255}else p[i*4+3]=0}
 x.putImageData(d,0,0);x.drawImage(clean,0,0);return c}

var A={skins:[],eyes:[],styles:[],outfits:[],backs:[],hairT:[]};
/* outfit indexes in menu order: job01–05, then job06… as they are found */
var OUTFIT_ORDER=[0,1,2,3,4];
function load(base,v){var q='?v='+(v||'1'),jobs=[];
 ['body_a','body_b','body_c'].forEach(function(n,i){jobs.push(loadImg(base+'character/'+n+'.png'+q).then(function(im){A.skins[i]=im}))});
 for(var i=1;i<=8;i++)(function(i){jobs.push(loadImg(base+'character/eyes_'+i+'.png'+q).then(function(im){A.eyes[i-1]=im}))})(i);
 for(i=1;i<=5;i++)(function(i){jobs.push(loadImg(base+'character/hair_0'+i+'.png'+q).then(function(im){A.styles[i-1]=im}));jobs.push(loadImg(base+'character/job0'+i+'.png'+q).then(function(im){A.outfits[i-1]=im}))})(i);
 jobs.push(loadJobs(base,q));
 /* outfits job06+ are detected automatically; every outfit may have a back layer jobNN_b.png (drawn under the weapon) */
 var outfitsDone=Promise.all(jobs.slice()).then(function(){return probeRun(function(n){return base+'character/job'+pad2(n)+'.png'+q},'jobMax',6)}).then(function(list){
   OUTFIT_ORDER.length=0;[0,1,2,3,4].forEach(function(i){OUTFIT_ORDER.push(i)});list.forEach(function(o){A.outfits[o.n-1]=o.im;OUTFIT_ORDER.push(o.n-1)});
   return Promise.all(OUTFIT_ORDER.map(function(i){return loadImg(base+'character/job'+pad2(i+1)+'_b.png'+q).then(function(im){A.backs[i]=im||null})}))});
 jobs.push(outfitsDone);
 jobs.push(probeHairs(base,q,6).then(function(list){STYLE_ORDER.length=0;[0,1,2,3,4].forEach(function(i){STYLE_ORDER.push(i)});
   list.forEach(function(h){A.styles[h.n]=h.im;STYLEN[h.n]='髮型 '+h.n;STYLE_ORDER.push(h.n)});STYLE_ORDER.push(5)}));
 return Promise.all(jobs).then(function(){A.styles[5]=mk(40,40);A.styles.forEach(function(h,si){if(h)A.hairT[si]=HAIR.map(function(t){return si===5?h:makeHair(h,t)})})})}

/* swatch color sampled from an image (most common opaque, non-outline color) */
function swatch(img){var c=mk(40,40),x=c.getContext('2d');x.drawImage(img,0,0);var d=x.getImageData(0,0,40,40).data,cnt={},best=null,bn=0;
 for(var i=0;i<1600;i++){if(d[i*4+3]<200)continue;var r=d[i*4],g=d[i*4+1],b=d[i*4+2];if(r+g+b<90||r+g+b>720)continue;var k=r+','+g+','+b;cnt[k]=(cnt[k]||0)+1;if(cnt[k]>bn){bn=cnt[k];best=k}}
 return best?'rgb('+best+')':'#888'}
function hairColor(i){var c=tintRGB(123,63,52,HAIR[i]);return 'rgb('+c.join(',')+')'}

/* weapon / shield pieces on the 48x48 grid */
var PC={},HC={};
function ringOf(img){var c=mk(40,40),x=c.getContext('2d');x.drawImage(img,0,0);var d=x.getImageData(0,0,40,40).data,Am=new Uint8Array(N*N),R=new Uint8Array(N*N),X,Y,dx,dy;
 for(Y=0;Y<40;Y++)for(X=0;X<40;X++)if(d[(Y*40+X)*4+3]>10)Am[(Y+PAD)*N+X+PAD]=1;
 for(Y=0;Y<N;Y++)for(X=0;X<N;X++){if(Am[Y*N+X])continue;for(dy=-1;dy<=1;dy++)for(dx=-1;dx<=1;dx++){var a=X+dx,b=Y+dy;if(a>=0&&a<N&&b>=0&&b<N&&Am[b*N+a])R[Y*N+X]=1}}
 return{A:Am,R:R,art:c}}
function pieces(img,key,cut,outline,split){var k=key+'|'+cut+'|'+outline+'|'+split;if(PC[k])return PC[k];
 var g=ringOf(img),under=mk(N,N),over=mk(N,N),ux=under.getContext('2d'),ox=over.getContext('2d'),ud=ux.createImageData(N,N),od=ox.createImageData(N,N);
 var src=mk(N,N),sx=src.getContext('2d');sx.drawImage(g.art,PAD,PAD);var sd=sx.getImageData(0,0,N,N).data,X,Y,i;
 for(Y=0;Y<N;Y++)for(X=0;X<N;X++){i=Y*N+X;var tgt=ud;
  if(split){var ax=X-PAD,ay=Y-PAD;if((ax+.5-WG[0])*WAX[0]+(ay+.5-WG[1])*WAX[1]>=cut)tgt=od}
  if(g.A[i]){tgt.data[i*4]=sd[i*4];tgt.data[i*4+1]=sd[i*4+1];tgt.data[i*4+2]=sd[i*4+2];tgt.data[i*4+3]=sd[i*4+3]}
  else if(outline&&g.R[i]){tgt.data[i*4]=10;tgt.data[i*4+1]=7;tgt.data[i*4+2]=5;tgt.data[i*4+3]=255}}
 ux.putImageData(ud,0,0);ox.putImageData(od,0,0);return(PC[k]={under:under,over:over,g:g})}
/* halo ring masks around weapon(+shield), outside the black outline */
function haloMasks(key,wg,ox,oy,sg){if(HC[key])return HC[key];var M=new Uint8Array(N*N),X,Y;
 function add(g,dx,dy){for(Y=0;Y<N;Y++)for(X=0;X<N;X++){if(g.A[Y*N+X]||g.R[Y*N+X]){var a=X+dx,b=Y+dy;if(a>=0&&b>=0&&a<N&&b<N)M[b*N+a]=1}}}
 if(wg)add(wg,ox,oy);if(sg)add(sg,0,0);
 var L=[null,mk(N,N),mk(N,N),mk(N,N)],ctxs=L.map(function(c){return c&&c.getContext('2d')});
 for(Y=0;Y<N;Y++)for(X=0;X<N;X++){if(M[Y*N+X])continue;var d=9;for(var dy=-4;dy<=4;dy++)for(var dx=-4;dx<=4;dx++){var a=X+dx,b=Y+dy;if(a>=0&&b>=0&&a<N&&b<N&&M[b*N+a]){var dd=Math.hypot(dx,dy);if(dd<d)d=dd}}
  var lv=d<=1.5?1:d<=2.6?2:d<=3.7?3:0;if(!lv)continue;var ok=lv===1?true:lv===2?((X+Y)%2===0):((X%2===0)&&(Y%2===0));if(ok){ctxs[lv].fillStyle='#fff';ctxs[lv].fillRect(X,Y,1,1)}}
 return(HC[key]=L)}
var TC={};
function tinted(mask,key,col){var k=key+col;if(!TC[k]){var c=mk(N,N),x=c.getContext('2d');x.drawImage(mask,0,0);x.globalCompositeOperation='source-in';x.fillStyle=col;x.fillRect(0,0,N,N);TC[k]=c}return TC[k]}

/* draw one frame into a 48x48 offscreen canvas.
   s = {skin,style,hair,eyes,outfit, weapon:{img,key,cut,ox,oy}|null, shield:{img,key}|null, halo:[colors], breath, outline} */
var off=mk(N,N),octx=off.getContext('2d');
function squash(img,d){octx.drawImage(img,0,CUTROW,40,40-CUTROW,PAD,PAD+CUTROW,40,40-CUTROW);if(CUTROW-d>0)octx.drawImage(img,0,0,40,CUTROW-d,PAD,PAD+d,40,CUTROW-d)}
function frame(s,now){var d=s.breath===false?0:(function(){var u=now/PERIOD;u-=Math.floor(u);return Math.round(u<.5?2*u:2*(1-u))})(),closed=(now%4000)<130,ol=s.outline!==false;
 octx.clearRect(0,0,N,N);
 octx.fillStyle='rgba(0,0,0,.38)';var sy=PAD;octx.fillRect(PAD+14,sy+34,7,1);octx.fillRect(PAD+12,sy+35,11,1);octx.fillRect(PAD+11,sy+36,13,1);octx.fillRect(PAD+10,sy+37,15,1);octx.fillRect(PAD+12,sy+38,11,1);
 var w=s.weapon,pc=w&&w.img?pieces(w.img,w.key,w.cut,ol,true):null,sh=s.shield&&s.shield.img?pieces(s.shield.img,s.shield.key,0,ol,false):null;
 if(s.halo&&s.halo.length&&(pc||sh)){var hk=(w?w.key+'|'+w.cut+'|'+w.ox+'|'+w.oy:'')+'|'+(sh?s.shield.key:''),hm=haloMasks(hk,pc&&pc.g,w?w.ox:0,w?w.oy:0,sh&&sh.g);
  for(var L=3;L>=1;L--){var col=s.halo[L-1];if(!col)continue;var ph=Math.sin(now/1000*2*Math.PI/2.6+L*1.1);octx.globalAlpha=Math.max(.2,Math.min(.8,Math.round((.42+.22*ph)*5)/5));octx.drawImage(tinted(hm[L],hk+'|'+L,col),0,d)}
  octx.globalAlpha=1}
 if(A.backs[s.outfit])squash(A.backs[s.outfit],d);
 if(pc)octx.drawImage(pc.under,w.ox,w.oy+d);
 squash(A.skins[s.skin],d);squash(A.outfits[s.outfit],d);
 if(pc)octx.drawImage(pc.over,w.ox,w.oy+d);
 if(!closed)octx.drawImage(A.eyes[s.eyes],PAD,PAD+d);
 octx.drawImage(A.hairT[s.style][s.hair],PAD,PAD+d);
 if(sh)octx.drawImage(sh.under,0,d);
 return off}
function draw(canvas,s,now){var f=frame(s,now),x=canvas.getContext('2d');x.clearRect(0,0,canvas.width,canvas.height);x.imageSmoothingEnabled=false;x.drawImage(f,0,0,N,N,0,0,canvas.width,canvas.height)}

global.Doll={makeHair:makeHair,N:N,HAIR:HAIR,SKINN:SKINN,STYLEN:STYLEN,STYLE_ORDER:STYLE_ORDER,OUTFIT_ORDER:OUTFIT_ORDER,JOBN:JOBN,JOBSN:JOBSN,assets:A,load:load,draw:draw,swatch:swatch,hairColor:hairColor,loadImg:loadImg};
})(window);

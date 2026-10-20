/* Bottom navigation helpers shared by the game pages.
   - NavIcons.go(key): page links (camp = 營火廣場, forge, char = 角色換裝).
   - NavIcons.apply(tabsEl): swaps tab icons for hand-drawn ones when assets/icons/nav/<name>.png exists
     (cropped, scaled to fit, outlined), and draws the 角色 tab as the player's head-and-chest portrait.
   Buttons need data-k = camp | forge | adv | char | set. */
(function(g){
'use strict';
var BASE='../assets/',FILES={camp:'camp',forge:'forge',adv:'adventure',set:'settings'};
var LINKS={camp:'../camp/index.html',forge:'../forge/index.html',char:'../character/index.html',adv:'../battle/index.html'};
var cache={},player=null,lastTabs=null,dollLoading=false,headKey='',headCv=null;
var DPR=3,BOX_W=58,BOX_H=45,OUT=2; /* css px */
/* pixel-art icons: a whole number of screen pixels per art pixel, about 2.4 css px (7 device px on a 3x phone) */
var dpr=Math.max(1,Math.round(g.devicePixelRatio||1)),PXS=Math.max(2,Math.round(2.4*dpr))/dpr,PXSF=Math.max(2,Math.round(2.06*dpr))/dpr;
var PXSA=Math.max(1,Math.round(1.33*dpr))/dpr;
function pxs(k){return k==='forge'?PXSF:(k==='adv'||k==='set')?PXSA:PXS}

/* processed icons are kept for the browser session so the next page shows them straight away */
function ssGet(k){try{return JSON.parse(sessionStorage.getItem('navicon2:'+k)||'null')}catch(e){return null}}
function ssSet(k,v){try{sessionStorage.setItem('navicon2:'+k,JSON.stringify(v))}catch(e){}}
function save(k,c){try{ssSet(k,{u:c.toDataURL(),css:c.__css,px:!!c.__pixel,hd:!!c.__head,key:c.__key||''})}catch(e){}}
function restore(k,cb){var v=ssGet(k);if(!v)return;var im=new Image();im.onload=function(){var c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;
  c.getContext('2d').drawImage(im,0,0);c.__css=v.css;c.__pixel=v.px;c.__head=v.hd;c.__key=v.key;cb(c)};im.src=v.u}

function go(k){if(LINKS[k]){location.href=LINKS[k];return true}return false}

/* small images (<= 32 px tall) are pixel art: shown as-is at 2 css px per pixel, may poke above the bar.
   bigger ones: crop transparent margins, fit into BOX_W x BOX_H css px at 3x, smooth scale, then a dark outline */
function processIcon(img,ol){
  if(img.naturalHeight<=32){var q=document.createElement('canvas');q.width=img.naturalWidth;q.height=img.naturalHeight;q.getContext('2d').drawImage(img,0,0);
    q.__css=[q.width*PXS,q.height*PXS];q.__pixel=true;return q}
  var w=img.naturalWidth,h=img.naturalHeight,t=document.createElement('canvas');t.width=w;t.height=h;var tx=t.getContext('2d');tx.drawImage(img,0,0);
  var d=tx.getImageData(0,0,w,h).data,x0=w,y0=h,x1=-1,y1=-1;
  for(var y=0;y<h;y++)for(var x=0;x<w;x++)if(d[(y*w+x)*4+3]>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
  if(x1<0)return null;var cw=x1-x0+1,ch=y1-y0+1,sc=Math.min(BOX_W/cw,BOX_H/ch)*(ol?1.09*1.15:1),W=Math.round(cw*sc*DPR),H=Math.round(ch*sc*DPR),P=OUT*DPR;
  var s=document.createElement('canvas');s.width=W;s.height=H;var sx=s.getContext('2d');sx.imageSmoothingEnabled=true;sx.imageSmoothingQuality='high';sx.drawImage(img,x0,y0,cw,ch,0,0,W,H);
  var sd=sx.getImageData(0,0,W,H);for(var i=3;i<sd.data.length;i+=4)sd.data[i]=sd.data[i]>=120?255:0;sx.putImageData(sd,0,0);
  var sil=document.createElement('canvas');sil.width=W;sil.height=H;var lx=sil.getContext('2d');lx.drawImage(olScaled(ol,x0,y0,cw,ch,W,H)||s,0,0);lx.globalCompositeOperation='source-in';lx.fillStyle='#080503';lx.fillRect(0,0,W,H);
  var c=document.createElement('canvas');c.width=W+2*P;c.height=H+2*P;var cx=c.getContext('2d');
  for(var dy=-P;dy<=P;dy++)for(var dx=-P;dx<=P;dx++)if(dx*dx+dy*dy<=P*P)cx.drawImage(sil,P+dx,P+dy);
  cx.drawImage(s,P,P);c.__css=[(W+2*P)/DPR,(H+2*P)/DPR];c.__geo={x0:x0,y0:y0,sc:sc,P:P,cw:cw,ch:ch};return c}

/* optional outline-source image (camp_tent.png): the outline follows only these pixels, so the soft night sky around the tent gets none */
function olScaled(ol,x0,y0,cw,ch,W,H){if(!ol)return null;var o=document.createElement('canvas');o.width=W;o.height=H;var ox=o.getContext('2d');ox.imageSmoothingEnabled=true;ox.imageSmoothingQuality='high';ox.drawImage(ol,x0,y0,cw,ch,0,0,W,H);
  var od=ox.getImageData(0,0,W,H);for(var i=3;i<od.data.length;i+=4)od.data[i]=od.data[i]>=120?255:0;ox.putImageData(od,0,0);return o}
function load(k){if(k in cache)return;cache[k]=null;var im=new Image(),tn=null;
  im.onload=function(){if(k==='camp'&&!tn){tn=new Image();tn.onload=im.onload;tn.onerror=function(){cache[k]=false};tn.src=BASE+'icons/nav/camp_tent.png?v=3';return}
    var c=k==='adv'?advIcon(im):k==='set'?pixIcon(im):processIcon(im,tn);cache[k]=c||false;if(c){if(c.__pixel)c.__css=[c.width*pxs(k),c.height*pxs(k)];save(k,c)}if(lastTabs)apply(lastTabs)};im.onerror=function(){cache[k]=false};
  im.src=BASE+'icons/nav/'+FILES[k]+'.png?v='+(k==='adv'||k==='set'?4:3)}
/* warm start from this session's saved copies (fresh files still load and replace them) */
Object.keys(FILES).forEach(function(k){if(k==='adv'||k==='set')return;restore(k,function(c){if(c.__pixel)c.__css=[c.width*pxs(k),c.height*pxs(k)];if(!cache[k]){cache[k]=c;if(lastTabs)apply(lastTabs)}})});
restore('head2',function(c){c.__css=[34*PXS,25*PXS];if(!headCv){headCv=c;headKey='';if(lastTabs)apply(lastTabs)}});

/* head-and-chest portrait: 22x24 crop of the 48px doll, 1px outline, shown at 3x and allowed to poke above the bar */
function headCanvas(){var D=g.Doll;if(!player||!D)return headCv;
  if(!(D.assets.skins&&D.assets.skins.length&&D.assets.hairT&&D.assets.hairT.length)){
    if(!dollLoading){dollLoading=true;D.load(BASE,'1').then(function(){if(lastTabs)apply(lastTabs)})}return headCv}
  var look={skin:D.val(player.skin,0),style:D.val(player.style,0),hair:player.hair|0,eyes:D.val(player.eyes,5),outfit:player.outfit==null?(player.job|0):D.val(player.outfit,0),bare:player.outfit==null&&!D.assets.outfits[player.job|0],weapon:null,shield:null,halo:[],breath:false};
  var key=JSON.stringify(look);if(headCv&&(key===headKey||key===headCv.__key)){headKey=key;headCv.__look=look;return headCv}
  var c=document.createElement('canvas');c.width=34;c.height=25;renderHead(look,1000,c);
  c.__css=[34*PXS,25*PXS];c.__head=true;c.__key=key;c.__look=look;headKey=key;headCv=c;save('head2',c);return c}
var HD=document.createElement('canvas');HD.width=HD.height=48;
function renderHead(look,now,c,glow){var D=g.Doll;D.draw(HD,look,now);
  var X0=6,Y0=5,W=32,H=24,src=HD.getContext('2d').getImageData(X0,Y0,W,H).data;
  var x=c.getContext('2d'),o=x.createImageData(W+2,H+1);function A(i,j){return i>=0&&j>=0&&i<W&&j<H?src[(j*W+i)*4+3]:0}
  for(var j=-1;j<H;j++)for(var i=-1;i<=W;i++){var k=((j+1)*(W+2)+(i+1))*4;
    if(A(i,j)>0){var s=(j*W+i)*4;o.data[k]=src[s];o.data[k+1]=src[s+1];o.data[k+2]=src[s+2];o.data[k+3]=255}
    else if(A(i+1,j)||A(i-1,j)||A(i,j+1)||A(i,j-1)){o.data[k]=8;o.data[k+1]=5;o.data[k+2]=3;o.data[k+3]=255}}
  if(glow>0)eyeGlow(o,src,glow,W,H,W+2);
  x.putImageData(o,0,0)}
/* eyes brighten toward warm white and bloom faintly onto the skin beside them (only eye pixels that are really visible, not hidden under hair) */
var EGL=[255,244,196],eyeCache={};
function eyePixels(i){if(eyeCache[i])return eyeCache[i];var c=document.createElement('canvas');c.width=c.height=40;var x=c.getContext('2d');x.drawImage(g.Doll.assets.eyes[i],0,0);
  var d=x.getImageData(0,0,40,40).data,list=[];for(var y=0;y<40;y++)for(var xx=0;xx<40;xx++){var k=(y*40+xx)*4;if(d[k+3]===255)list.push([xx,y,d[k],d[k+1],d[k+2]])}
  return(eyeCache[i]=list)}
function eyeGlow(o,src,e,W,H,ow){
  var eyes=HA.look&&g.Doll.ix('eyes',HA.look.eyes);if(eyes==null||!g.Doll.assets.eyes[eyes])return;
  var vis=[],mark={},add=new Float32Array(ow*(H+1)),d=o.data,n,k;
  eyePixels(eyes).forEach(function(p){var i=p[0]-2,j=p[1]-1;if(i<0||j<0||i>=W||j>=H)return;var s=(j*W+i)*4;
    if(src[s]!==p[2]||src[s+1]!==p[3]||src[s+2]!==p[4]||src[s+3]!==255)return;vis.push([i+1,j+1]);mark[(j+1)*ow+i+1]=1});
  vis.forEach(function(v){for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;var nx=v[0]+dx,ny=v[1]+dy;if(nx<0||ny<0||nx>=ow||ny>H)continue;n=ny*ow+nx;if(mark[n])continue;
    var f=(dx&&dy?0.09:0.2)*e;if(f>add[n])add[n]=f}});
  for(n=0;n<add.length;n++)if(add[n]>0){k=n*4;if(d[k+3]!==255||d[k]+d[k+1]+d[k+2]<60)continue;for(var c=0;c<3;c++)d[k+c]+=(EGL[c]-d[k+c])*add[n]}
  var f=0.3+0.65*e;vis.forEach(function(v){k=(v[1]*ow+v[0])*4;for(var c=0;c<3;c++)d[k+c]+=(EGL[c]-d[k+c])*f})}

/* 角色 tab (current page): while selected the portrait stops breathing and blinking; the eyes glow slowly and a grainy halo rises from the shoulders.
   The halo is the portrait's own outline pulled upward, fading out before the top edge. Values tuned in the simulation: height 40px, zoom 1.0, strength 1.3, 5.1 s cycle. */
var HA={el:null,look:null,run:false,last:0,t0:0,halo:null,fkey:null,f0:null,f1:null},HH={H:40,zoom:1,power:1.3,period:5.1,W:34,CELL:PXS};
var HB4=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5],HAL=[0,48,92,138,184,226],HSC=document.createElement('canvas');HSC.width=34;HSC.height=25;
function hHash(n){var s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s)}
function hSmooth(a,b,x){x=Math.min(1,Math.max(0,(x-a)/(b-a)));return x*x*(3-2*x)}
function hSilhouette(){renderHead(Object.assign({},HA.look,{breath:false}),1000,HSC,0);var d=HSC.getContext('2d').getImageData(0,0,34,25).data,m=new Uint8Array(850);for(var i=0;i<850;i++)m[i]=d[i*4+3]>0?1:0;return m}
/* f0 = steady glow hugging the outline, f1 = the part pulled upward (it gets the rising ripple) */
function hBuild(W,Hc){
  var S=hSilhouette(),k=HH.zoom,f0=new Float32Array(W*Hc),f1=new Float32Array(W*Hc),Sm=Math.max(5,Math.floor(Hc/k-25-1)),cx,cy,s,dx,dy;
  for(cy=0;cy<Hc;cy++)for(cx=0;cx<W;cx++){
    var sx=(cx+.5-W/2)/k+17,sy=25-(Hc-cy-.5)/k,a0=0,a1=0;
    for(s=0;s<=Sm;s++){var yy=sy+s,v=0;
      for(dy=-1;dy<=1;dy++)for(dx=-1;dx<=1;dx++){var ix=Math.floor(sx)+dx,iy=Math.floor(yy)+dy;if(ix>=0&&ix<34&&iy>=0&&iy<25&&S[iy*34+ix]){var q=(dx||dy)?0.6:1;if(q>v)v=q}}
      if(!v)continue;var w=v*Math.pow(1-s/Sm,1.5);if(s<=1){if(w>a0)a0=w}else if(w>a1)a1=w}
    var ex=Math.abs((cx+.5-W/2)/(W/2)),tp=(1-hSmooth(0.55,1,ex))*hSmooth(0,0.28,(cy+.5)/Hc),i=cy*W+cx;
    f0[i]=a0*tp;f1[i]=a1*tp}
  HA.f0=f0;HA.f1=f1}
function haloDraw(t,e){var h=HA.halo,el=HA.el,W=HH.W,C=HH.CELL,Hc=29;if(!h||!el.parentNode)return;
  if(h.parentNode!==el.parentNode)el.parentNode.appendChild(h);
  if(h.width!==W||h.height!==Hc){h.width=W;h.height=Hc;h.style.width=W*C+'px';h.style.height=Hc*C+'px';HA.fkey=null}
  h.style.left=(el.offsetLeft+el.offsetWidth/2-W*C/2)+'px';h.style.top=(el.offsetTop+el.offsetHeight-Hc*C)+'px';
  var key=(el.__navFrom&&el.__navFrom.__key)||'k';if(HA.fkey!==key){hBuild(W,Hc);HA.fkey=key}
  var x=h.getContext('2d'),img=x.createImageData(W,Hc),d=img.data,pulse=0.62+0.38*e,cx,cy,F0,F1;
  for(cy=0;cy<Hc;cy++)for(cx=0;cx<W;cx++){var i=cy*W+cx;F0=HA.f0[i];F1=HA.f1[i];if(F0<=0&&F1<=0)continue;
    var ph=hHash(cx)*2.4+hHash(cx+31)*0.8*Math.sin(cy*.3),w=0.5+0.5*Math.sin(cy*0.5+t*4.5+ph);
    var I=Math.min(1,(F0*0.8+F1*(0.2+0.8*w)*1.1)*pulse*HH.power),v=I*5,lv=Math.floor(v)+((v-Math.floor(v))>(HB4[(cy&3)*4+(cx&3)]+.5)/16?1:0);
    if(lv<=0)continue;if(lv>5)lv=5;var k=i*4;
    if(lv>=4){d[k]=255;d[k+1]=238;d[k+2]=180}else{d[k]=255;d[k+1]=186;d[k+2]=88}d[k+3]=HAL[lv]}
  /* grains that float up from the shoulders and fade */
  var y0=Hc-8,y1=Math.round(Hc*0.3);
  for(var p=0;p<9;p++){var per=2.3+(p%3)*0.8,u=((t+hHash(p)*per)/per)%1,gx=Math.round(W/2+(hHash(p+9)*2-1)*Math.min(11,W/2-3)),gy=Math.round(y0-u*(y0-y1));
    if(gx<0||gx>=W||gy<0||gy>=Hc)continue;var kk=(gy*W+gx)*4;d[kk]=EGL[0];d[kk+1]=EGL[1];d[kk+2]=EGL[2];d[kk+3]=Math.round(230*(1-u)*Math.min(1,HH.power))}
  x.putImageData(img,0,0)}
function headAnimOn(el,look){HA.el=el;HA.look=look;HA.fkey=null;
  if(!HA.halo){var h=document.createElement('canvas');h.style.cssText='position:absolute;pointer-events:none;z-index:1;image-rendering:pixelated;flex:none';HA.halo=h}
  if(!HA.run){HA.run=true;HA.t0=performance.now();requestAnimationFrame(headTick)}}
function headTick(now){if(!HA.el||!HA.el.isConnected||!HA.look||!g.Doll){HA.run=false;if(HA.halo&&HA.halo.parentNode)HA.halo.parentNode.removeChild(HA.halo);return}
  if(HA.last&&now-HA.last<42){requestAnimationFrame(headTick);return}HA.last=now;
  var t=(now-HA.t0)/1000,e=0.5+0.5*Math.sin(t*2*Math.PI/HH.period-Math.PI/2);e=0.22+0.78*e;
  renderHead(Object.assign({},HA.look,{breath:false}),1000,HA.el,e);haloDraw(t,e);requestAnimationFrame(headTick)}

/* ---- 冒險 tab: a treasure-map scroll. Other pages: rolled up (the two side rolls pushed together).
   On the adventure page it unrolls, the red route glows (a light runs along it) and a cross sparkle blinks at the route's end. ---- */
var AV={cv:null,img:null,sel:false,t0:0,run:false,last:0},AC=[2,6,45,37]; /* crop of the 48x48 art: x, y, w, h */
var APATH=[[16,21],[17,22],[18,23],[20,23],[21,22],[23,22],[24,22],[25,23],[29,25],[30,25],[30,27],[29,28],[30,29],[32,29],[33,28],[34,28],[35,27],[36,27]],AEND=[37,26],ALR=[2,8],ARR=[41,46];
/* 48px 像素圖（記事的墨水瓶）：裁掉透明邊，照像素放大 */
function pixIcon(im){var w=im.naturalWidth,h=im.naturalHeight,t=document.createElement('canvas');t.width=w;t.height=h;var tx=t.getContext('2d');tx.drawImage(im,0,0);var d=tx.getImageData(0,0,w,h).data,x0=w,y0=h,x1=-1,y1=-1;
  for(var y=0;y<h;y++)for(var x=0;x<w;x++)if(d[(y*w+x)*4+3]>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}if(x1<0)return null;
  var c=document.createElement('canvas');c.width=x1-x0+1;c.height=y1-y0+1;c.getContext('2d').drawImage(t,x0,y0,c.width,c.height,0,0,c.width,c.height);c.__pixel=true;return c}
function advIcon(im){var c=document.createElement('canvas');c.width=AC[2];c.height=AC[3];c.__img=im;c.__pixel=true;c.__adv=true;advDraw(c,0,0,false);return c}
function aP(x,col,X,Y,a){if(a<=0)return;x.globalAlpha=Math.min(1,a);x.fillStyle=col;x.fillRect(X,Y,1,1)}
function advDraw(cv,u,t,lit){var im=cv.__img||AV.img;if(!im)return;var x=cv.getContext('2d');x.imageSmoothingEnabled=false;x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,cv.width,cv.height);x.globalAlpha=1;x.translate(-AC[0],-AC[1]);
  var lw=ALR[1]-ALR[0]+1,rw=ARR[1]-ARR[0]+1,cx=24,lx=Math.round(ALR[0]+(cx-lw-ALR[0])*(1-u)),rx=Math.round(ARR[0]+(cx-ARR[0])*(1-u)),a0=lx+lw;
  if(rx>a0){x.save();x.beginPath();x.rect(a0,0,rx-a0,48);x.clip();x.drawImage(im,0,0);x.restore()}
  x.drawImage(im,ALR[0],0,lw,48,lx,0,lw,48);x.drawImage(im,ARR[0],0,rw,48,rx,0,rw,48);
  if(lit&&u>=0.98){var br=.55+.25*Math.sin(t/380),head=((t%1800)/1300)*APATH.length;x.globalCompositeOperation='lighter';
    APATH.forEach(function(p,i){var d=head-i,k=d>=0&&d<4?1-d/4:0;aP(x,'#ff5a3c',p[0],p[1],br*.55+k*.6);[[-1,0],[1,0],[0,-1],[0,1]].forEach(function(o){aP(x,'#ff3a1a',p[0]+o[0],p[1]+o[1],br*.18+k*.3)})});
    var ph=(t%1400)/1400,s=ph<.55?Math.sin(ph/.55*Math.PI):0,L=Math.round(2+s*5),E0=AEND[0],E1=AEND[1];
    if(s>0.02){for(var gy=-3;gy<=3;gy++)for(var gx=-3;gx<=3;gx++){var gr=Math.sqrt(gx*gx+gy*gy);if(gr<=3.3)aP(x,'#ffcf70',E0+gx,E1+gy,.28*s*(1-gr/3.6))}
      aP(x,'#ffffff',E0,E1,1);[[1,0],[-1,0],[0,1],[0,-1]].forEach(function(o){aP(x,'#fff6d0',E0+o[0],E1+o[1],.9*s+.1)});
      for(var j=2;j<=L;j++){var f=(1-(j-1)/L)*s;[[j,0],[-j,0],[0,j],[0,-j]].forEach(function(o){aP(x,'#fff2b0',E0+o[0],E1+o[1],Math.min(1,f*1.3))});
        if(j<=Math.ceil(L/2))[[j,1],[j,-1],[-j,1],[-j,-1],[1,j],[-1,j],[1,-j],[-1,-j]].forEach(function(o){aP(x,'#ffd27a',E0+o[0],E1+o[1],f*.55)})}
      for(var d2=1;d2<=Math.round(1+s*2);d2++)[[d2,d2],[-d2,d2],[d2,-d2],[-d2,-d2]].forEach(function(o){aP(x,'#ffb060',E0+o[0],E1+o[1],.6*s*(1-d2/4))})}
    x.globalCompositeOperation='source-over'}
  x.globalAlpha=1;x.setTransform(1,0,0,1,0,0)}
function advOn(c,sel){c.__img=c.__navFrom&&c.__navFrom.__img;AV.img=c.__img;AV.cv=c;AV.sel=sel;AV.t0=performance.now();if(!sel){advDraw(c,0,0,false);return}
  if(!AV.run){AV.run=true;requestAnimationFrame(advTick)}}
function advTick(now){if(!AV.cv||!AV.cv.isConnected||!AV.sel){AV.run=false;return}
  if(AV.last&&now-AV.last<33){requestAnimationFrame(advTick);return}AV.last=now;
  var k=Math.min(1,Math.max(0,(now-AV.t0-150)/450));advDraw(AV.cv,k*k*(3-2*k),now,true);requestAnimationFrame(advTick)}

function place(btn,src){var old=btn.querySelector('canvas');if(!old||old.__navFrom===src)return;
  var c=document.createElement('canvas');c.width=src.width;c.height=src.height;c.getContext('2d').drawImage(src,0,0);c.__navFrom=src;
  c.style.width=src.__css[0]+'px';c.style.height=src.__css[1]+'px';
  c.style.flex='none';
  if(src.__head||src.__pixel){c.style.imageRendering='pixelated';c.style.marginTop=(48-src.__css[1])+'px';c.style.position='relative';c.style.zIndex='2';if(btn.getAttribute('data-k')==='forge')c.style.top='6px';btn.style.overflow='visible'}
  else{var mv=btn.getAttribute('data-k')==='camp'?3:0;/* 營地往上一格 */c.style.margin=((48-src.__css[1])/2-mv)+'px -6px '+((48-src.__css[1])/2+mv)+'px';}
  old.replaceWith(c);
  if(btn.getAttribute('data-k')==='forge'&&src.__pixel&&btn.getAttribute('aria-selected')==='true')sparksOn(btn,c,src);
  if(btn.getAttribute('data-k')==='camp'&&!src.__pixel&&btn.getAttribute('aria-selected')==='true')campOn(btn,c);
  if(btn.getAttribute('data-k')==='adv'&&src.__adv){c.style.top=PXSA+'px';advOn(c,btn.getAttribute('aria-selected')==='true')} /* 地圖往下一格 */
  if(btn.getAttribute('data-k')==='char'&&src.__head&&src.__look&&btn.getAttribute('aria-selected')==='true')headAnimOn(c,src.__look)}

/* ---- camp tab (current page): warm light through the tent door, a breathing grainy halo over it, and a chat bubble ---- */
var CF={state:0,icon:null,lit:null,halo:null,HX:0,HY:0,cv:null,btn:null,iconEl:null,run:false,last:0,t0:0},LT=[255,232,165];
function campBuild(img,mimg,tent){
  var w=img.naturalWidth,h=img.naturalHeight,t=document.createElement('canvas');t.width=w;t.height=h;var tx=t.getContext('2d');tx.drawImage(img,0,0);
  var id=tx.getImageData(0,0,w,h),d=id.data,door=[],x,y,i;
  /* the door slit comes from camp_door.png (same size, opaque where the slit is), since the night sky is dark too */
  var mt=document.createElement('canvas');mt.width=w;mt.height=h;var mtx=mt.getContext('2d');mtx.drawImage(mimg,0,0);var md0=mtx.getImageData(0,0,w,h).data;
  for(y=0;y<h;y++)for(x=0;x<w;x++)if(md0[(y*w+x)*4+3]>200)door.push([x,y])
  if(!door.length)return false;
  /* lit copy of the drawing: the slit becomes light and light seeps ~3.6px onto the canvas around it */
  var ld=new Uint8ClampedArray(d);
  for(y=0;y<h;y++)for(x=0;x<w;x++){i=(y*w+x)*4;if(d[i+3]<200)continue;var md=99;
    for(var k=0;k<door.length;k++){var dx=x-door[k][0],dy=y-door[k][1],dd=dx*dx+dy*dy;if(dd<md)md=dd}md=Math.sqrt(md);
    var q=md===0?1:md<=2.6?0.3*(1-md/2.6):0;if(q>0)for(var c=0;c<3;c++)ld[i+c]=d[i+c]+(LT[c]-d[i+c])*q}
  var litSrc=document.createElement('canvas');litSrc.width=w;litSrc.height=h;litSrc.getContext('2d').putImageData(new ImageData(ld,w,h),0,0);
  var mask=document.createElement('canvas');mask.width=w;mask.height=h;var mx=mask.getContext('2d');mx.fillStyle='#fff';door.forEach(function(p){mx.fillRect(p[0],p[1],1,1)});
  var a=processIcon(img,tent),b=processLitIcon(litSrc,mask,img,tent);if(!a||!b)return false;
  CF.icon=a;CF.lit=b.c;CF.geo=a.__geo;
  /* tent + its outline as a mask, so the twinkling stars can be hidden behind the tent */
  (function(){var G=a.__geo,P=G.P,W=a.width-2*P,H=a.height-2*P,t0=olScaled(tent,G.x0,G.y0,G.cw,G.ch,W,H),m=document.createElement('canvas');m.width=a.width;m.height=a.height;var mx=m.getContext('2d');
    for(var dy=-P;dy<=P;dy++)for(var dx=-P;dx<=P;dx++)if(dx*dx+dy*dy<=P*P)mx.drawImage(t0,P+dx,P+dy);CF.mask=m;
    var sl=document.createElement('canvas');sl.width=a.width;sl.height=a.height;CF.sl=sl})();CF.stars=[];
  [[18,10],[41,8],[46,19],[24,17],[12,24],[37,14],[49,30],[14,34]].forEach(function(p,n){if(d[(p[1]*w+p[0])*4+3]>200)CF.stars.push({x:p[0],y:p[1],ph:n*1.9+.7,sp:.55+(n%3)*.2})});
  CF.doorC=b.doorC;CF.halo=null;CF.haloR=0;return true}
/* halo centred on the tent door, sized to stay inside the tab; chunky 1-css-px grain, 7 soft levels, softer over the tent */
function makeHalo(rx){var ry=Math.round(rx*0.78),a=CF.icon,HW=rx*2,HH=ry*2,hc=document.createElement('canvas');hc.width=HW;hc.height=HH;var hx=hc.getContext('2d');
  var ox=rx-CF.doorC[0],oy=ry-CF.doorC[1],BAY=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]],CELL=3,ia=a.getContext('2d').getImageData(0,0,a.width,a.height).data,x,y;
  for(y=0;y<HH;y+=CELL)for(x=0;x<HW;x+=CELL){var ex=(x+1.5-rx)/rx,ey=(y+1.5-ry)/ry,dist=Math.sqrt(ex*ex+ey*ey);if(dist>=1)continue;
    var v=Math.pow(1-dist,0.95)*7.2,lv=Math.floor(v)+(((v-Math.floor(v))*16>BAY[(y/CELL)%4][(x/CELL)%4])?1:0);if(lv<=0)continue;
    var al=(34+Math.min(6,lv-1)*31)/255*0.5,ix=x-ox,iy=y-oy;
    if(ix>=0&&iy>=0&&ix<a.width&&iy<a.height&&ia[(iy*a.width+ix)*4+3]>0)al*=0.68;
    hx.fillStyle='rgba(252,226,156,'+al.toFixed(3)+')';hx.fillRect(x,y,CELL,CELL)}
  return hc}
/* same geometry as processIcon, but the outline next to the lit slit (and dark seam pixels there) take the light colour */
function processLitIcon(src,mask,orig,ol){
  var w=orig.naturalWidth,h=orig.naturalHeight,t=document.createElement('canvas');t.width=w;t.height=h;var tx=t.getContext('2d');tx.drawImage(orig,0,0);
  var d=tx.getImageData(0,0,w,h).data,x0=w,y0=h,x1=-1,y1=-1;
  for(var y=0;y<h;y++)for(var x=0;x<w;x++)if(d[(y*w+x)*4+3]>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
  var cw=x1-x0+1,ch=y1-y0+1,sc=Math.min(BOX_W/cw,BOX_H/ch)*(ol?1.09*1.15:1),W=Math.round(cw*sc*DPR),H=Math.round(ch*sc*DPR),P=OUT*DPR;
  var s=document.createElement('canvas');s.width=W;s.height=H;var sx=s.getContext('2d');sx.imageSmoothingEnabled=true;sx.imageSmoothingQuality='high';sx.drawImage(src,x0,y0,cw,ch,0,0,W,H);
  var sd=sx.getImageData(0,0,W,H);for(var i=3;i<sd.data.length;i+=4)sd.data[i]=sd.data[i]>=120?255:0;sx.putImageData(sd,0,0);
  var sil=document.createElement('canvas');sil.width=W;sil.height=H;var lx=sil.getContext('2d');lx.drawImage(olScaled(ol,x0,y0,cw,ch,W,H)||s,0,0);lx.globalCompositeOperation='source-in';lx.fillStyle='#080503';lx.fillRect(0,0,W,H);
  var m=document.createElement('canvas');m.width=W;m.height=H;var mx=m.getContext('2d');mx.imageSmoothingEnabled=true;mx.drawImage(mask,x0,y0,cw,ch,0,0,W,H);
  var md=mx.getImageData(0,0,W,H);for(i=0;i<md.data.length;i+=4){var on=md.data[i+3]>60;md.data[i]=LT[0];md.data[i+1]=LT[1];md.data[i+2]=LT[2];md.data[i+3]=on?255:0}mx.putImageData(md,0,0);
  var c=document.createElement('canvas');c.width=W+2*P;c.height=H+2*P;var cx=c.getContext('2d'),R=P+1,dx,dy;
  for(dy=-P;dy<=P;dy++)for(dx=-P;dx<=P;dx++)if(dx*dx+dy*dy<=P*P)cx.drawImage(sil,P+dx,P+dy);
  var ring=document.createElement('canvas');ring.width=c.width;ring.height=c.height;var rx=ring.getContext('2d');
  for(dy=-R;dy<=R;dy++)for(dx=-R;dx<=R;dx++)if(dx*dx+dy*dy<=R*R)rx.drawImage(m,P+dx,P+dy);
  cx.globalCompositeOperation='source-atop';cx.drawImage(ring,0,0);cx.globalCompositeOperation='source-over';
  cx.drawImage(s,P,P);
  var od=cx.getImageData(0,0,c.width,c.height),rd=rx.getImageData(0,0,c.width,c.height).data,o=od.data;
  for(i=0;i<o.length;i+=4)if(rd[i+3]&&o[i+3]&&(o[i]+o[i+1]+o[i+2])/3<110){o[i]=LT[0];o[i+1]=LT[1];o[i+2]=LT[2]}
  cx.putImageData(od,0,0);
  /* door foot (bottom-most slit pixel) in this canvas */
  var sxs=0,sys=0,n=0,mk=mask.getContext('2d').getImageData(0,0,w,h).data;for(y=0;y<h;y++)for(x=0;x<w;x++)if(mk[(y*w+x)*4+3]){sxs+=x;sys+=y;n++}
  return {c:c,doorC:[(sxs/n+.5-x0)*sc*DPR+P,(sys/n+.5-y0)*sc*DPR+P]}}
var BUB=['..ooooooooo..','.o.........o.','o...........o','o...........o','o...........o','.o.........o.','..ooooo.oooo.','......o.o....','.......o.....'];
function drawBubble(x,ox,oy,nd){var S=7;
  x.fillStyle='#f4ecd6';[[2,1,10,1],[1,2,11,4],[2,5,10,5],[7,6,7,6]].forEach(function(r){x.fillRect(ox+r[0]*S,oy+r[1]*S,(r[2]-r[0]+1)*S,(r[3]-r[1]+1)*S)});
  x.fillStyle='#080503';BUB.forEach(function(row,j){for(var i=0;i<row.length;i++)if(row[i]==='o')x.fillRect(ox+i*S,oy+j*S,S,S)});
  x.fillStyle='#462d19';for(var k=0;k<nd;k++)x.fillRect(ox+(3+k*3)*S,oy+3*S,S,S)}
function campOn(btn,iconEl){
  if(CF.state===0){CF.state=1;var im=new Image(),mi=new Image(),ti=new Image();im.onload=function(){mi.onload=function(){ti.onload=function(){CF.state=campBuild(im,mi,ti)?2:3;if(CF.state===2&&CF.btn&&CF.btn.isConnected)campOn(CF.btn,CF.iconEl)};ti.onerror=function(){CF.state=3};ti.src=BASE+'icons/nav/camp_tent.png?v=3'};mi.onerror=function(){CF.state=3};mi.src=BASE+'icons/nav/camp_door.png?v=3'};im.onerror=function(){CF.state=3};im.src=BASE+'icons/nav/camp.png?v=3'}
  CF.btn=btn;CF.iconEl=iconEl;if(CF.state!==2)return;
  if(!CF.cv){CF.cv=document.createElement('canvas');CF.cv.style.cssText='position:absolute;left:0;top:-34px;pointer-events:none;z-index:3'}
  var bw0=btn.clientWidth,EX=Math.round(bw0*.3),EY=20,bw=bw0+2*EX,bh=btn.clientHeight+34+EY;CF.EX=EX*DPR;CF.cv.style.left=(-EX)+'px';CF.cv.width=bw*DPR;CF.cv.height=bh*DPR;CF.cv.style.width=bw+'px';CF.cv.style.height=bh+'px';
  btn.appendChild(CF.cv);iconEl.style.visibility='hidden';
  requestAnimationFrame(function(){if(!iconEl.isConnected)return;var cx=iconEl.offsetLeft*DPR+CF.EX+CF.doorC[0],r=Math.floor(Math.min(cx,bw*DPR-cx)-3);r=Math.min(r,Math.round(30*DPR));r=Math.max(30,r-r%3);
    if(r!==CF.haloR){CF.haloR=r;CF.halo=makeHalo(r)}});
  if(!CF.run){CF.run=true;CF.t0=performance.now();requestAnimationFrame(campTick)}}
function campTick(now){if(!CF.cv||!CF.cv.isConnected||!CF.iconEl||!CF.iconEl.isConnected){CF.run=false;return}
  if(CF.last&&now-CF.last<48){requestAnimationFrame(campTick);return}CF.last=now;var t=(now-CF.t0)/1000;
  var x=CF.cv.getContext('2d'),ix=CF.iconEl.offsetLeft*DPR+CF.EX,iy=(CF.iconEl.offsetTop+34)*DPR;x.clearRect(0,0,CF.cv.width,CF.cv.height);
  var fl=.36+.08*Math.sin(t*.9)+.03*Math.sin(t*2.3),q=Math.min(1,0.66+0.12*(fl-0.36)/0.11),bf=0.42+0.58*(0.5+0.5*Math.sin(t*2*Math.PI/4));
  x.drawImage(CF.icon,ix,iy);x.globalAlpha=q;x.drawImage(CF.lit,ix,iy);if(CF.halo){x.globalAlpha=bf;x.drawImage(CF.halo,ix+CF.doorC[0]-CF.haloR,iy+CF.doorC[1]-Math.round(CF.haloR*0.78));x.globalAlpha=1}
  var G=CF.geo,cell=Math.max(2,Math.round(G.sc*DPR));
  var sx2=CF.sl.getContext('2d');sx2.clearRect(0,0,CF.sl.width,CF.sl.height);(CF.stars||[]).forEach(function(st){var v=Math.sin(t*st.sp*2.2+st.ph),sx=Math.round((st.x-G.x0+.5)*G.sc*DPR+G.P),sy=Math.round((st.y-G.y0+.5)*G.sc*DPR+G.P);
    if(v>.35){var a=Math.min(1,(v-.35)/.4);sx2.fillStyle='rgba(255,248,214,'+a.toFixed(2)+')';sx2.fillRect(sx-cell/2,sy-cell/2,cell,cell);
      if(v>.8){sx2.fillStyle='rgba(255,248,214,.55)';sx2.fillRect(sx-cell*1.5,sy-cell/2,cell,cell);sx2.fillRect(sx+cell*.5,sy-cell/2,cell,cell);sx2.fillRect(sx-cell/2,sy-cell*1.5,cell,cell);sx2.fillRect(sx-cell/2,sy+cell*.5,cell,cell)}}
    else if(v<-.55){sx2.fillStyle='rgba(8,11,34,.7)';sx2.fillRect(sx-cell/2,sy-cell/2,cell,cell)}});
  sx2.globalCompositeOperation='destination-out';sx2.drawImage(CF.mask,0,0);sx2.globalCompositeOperation='source-over';x.drawImage(CF.sl,ix,iy);
  /* a few warm light motes drifting up from the door, one chunky pixel each */
  for(var m=0;m<4;m++){var u=((t/3.4+m*.25)%1),mx=ix+CF.doorC[0]+Math.round(Math.sin(m*2.4+t*.8)*5*DPR)-3,my=iy+CF.doorC[1]-Math.round(u*16*DPR)-3*DPR,al=Math.sin(u*Math.PI)*.85;
    x.fillStyle='rgba(255,226,150,'+al.toFixed(2)+')';x.fillRect(mx-mx%3,my-my%3,3,3)}
  var ph=t%4;if(ph<2.4){var nd=ph<.6?1:ph<1.2?2:3,pop=Math.min(1,ph/.15);drawBubble(x,ix+110,iy-52+Math.round((1-pop)*8),nd)}
  requestAnimationFrame(campTick)}

/* sparks drifting up off the anvil while the forge tab is the current page (tiny canvas, ~20fps, stops when hidden) */
var SP={cv:null,parts:[],acc:0,last:0,run:false,w:0,h:0},SPX=10,SPY=18,SPS=PXSF;
function sparksOn(btn,icon,src){var W=src.width+2*SPX,H=src.height+SPY+2;
  if(!SP.cv){SP.cv=document.createElement('canvas');SP.cv.style.cssText='position:absolute;pointer-events:none;z-index:3;image-rendering:pixelated'}
  SP.cv.width=W;SP.cv.height=H;SP.cv.style.width=W*SPS+'px';SP.cv.style.height=H*SPS+'px';SP.w=src.width;SP.h=src.height;
  btn.appendChild(SP.cv);
  requestAnimationFrame(function(){if(!icon.isConnected)return;SP.cv.style.left=(icon.offsetLeft-SPX*SPS)+'px';SP.cv.style.top=(icon.offsetTop+6-SPY*SPS)+'px'});
  if(!SP.run){SP.run=true;requestAnimationFrame(sparkTick)}}
function sparkTick(now){if(!SP.cv||!SP.cv.isConnected){SP.run=false;return}
  if(SP.last&&now-SP.last<48){requestAnimationFrame(sparkTick);return}var dt=Math.min(.1,(now-SP.last)/1000||0);SP.last=now;
  SP.acc+=dt*6;while(SP.acc>1){SP.acc--;SP.parts.push({x:SPX+SP.w*(.16+Math.random()*.72),y:SPY+SP.h*(.28+Math.random()*.13),vx:Math.random()*3-1.5,vy:-(3.2+Math.random()*2.6),t:0,m:1.6+Math.random()*1.1,ph:Math.random()*6.28})}
  var x=SP.cv.getContext('2d');x.clearRect(0,0,SP.cv.width,SP.cv.height);
  SP.parts=SP.parts.filter(function(p){p.t+=dt;if(p.t>p.m)return false;p.x+=(p.vx+Math.sin(p.t*2+p.ph)*1.8)*dt;p.y+=p.vy*dt;p.vy*=1-dt*.3;
    var k=p.t/p.m;if(k>.85&&Math.floor(p.t*20)%2)return true;x.fillStyle=k<.3?'#fff6c8':k<.65?'#ffbe46':'#dc5f28';x.fillRect(Math.floor(p.x),Math.floor(p.y),1,1);return true});
  requestAnimationFrame(sparkTick)}

function apply(tabs){if(!tabs)return;lastTabs=tabs;
  Array.prototype.forEach.call(tabs.querySelectorAll('[data-k]'),function(b){var k=b.getAttribute('data-k');
    if(k==='char'){var h=headCanvas();if(h){place(b,h);
      /* the head may be the copy restored from this session: place() then returns early, so make sure the glow is running on the tab's canvas */
      var cur=b.querySelector('canvas');if(cur&&cur.__navFrom===h&&b.getAttribute('aria-selected')==='true'&&h.__head&&h.__look&&!(HA.run&&HA.el===cur))headAnimOn(cur,h.__look)}return}
    if(FILES[k]){load(k);if(cache[k])place(b,cache[k])}})}

function setPlayer(p){player=p;headKey='';if(lastTabs)apply(lastTabs)}

g.NavIcons={go:go,apply:apply,setPlayer:setPlayer};
})(window);

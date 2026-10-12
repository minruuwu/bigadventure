/* Bottom navigation helpers shared by the game pages.
   - NavIcons.go(key): page links (camp = 營火廣場, forge, char = 角色換裝).
   - NavIcons.apply(tabsEl): swaps tab icons for hand-drawn ones when assets/icons/nav/<name>.png exists
     (cropped, scaled to fit, outlined), and draws the 角色 tab as the player's head-and-chest portrait.
   Buttons need data-k = camp | forge | adv | char | set. */
(function(g){
'use strict';
var BASE='../assets/',FILES={camp:'camp',forge:'forge',adv:'adventure',set:'settings'};
var LINKS={camp:'../camp/index.html',forge:'../forge/index.html',char:'../character/index.html'};
var cache={},player=null,lastTabs=null,dollLoading=false,headKey='',headCv=null;
var DPR=3,BOX_W=58,BOX_H=45,OUT=2; /* css px */

function go(k){if(LINKS[k]){location.href=LINKS[k];return true}return false}

/* crop transparent margins, fit into BOX_W x BOX_H css px at 3x, smooth scale, then a dark outline */
function processIcon(img){
  var w=img.naturalWidth,h=img.naturalHeight,t=document.createElement('canvas');t.width=w;t.height=h;var tx=t.getContext('2d');tx.drawImage(img,0,0);
  var d=tx.getImageData(0,0,w,h).data,x0=w,y0=h,x1=-1,y1=-1;
  for(var y=0;y<h;y++)for(var x=0;x<w;x++)if(d[(y*w+x)*4+3]>8){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
  if(x1<0)return null;var cw=x1-x0+1,ch=y1-y0+1,sc=Math.min(BOX_W/cw,BOX_H/ch),W=Math.round(cw*sc*DPR),H=Math.round(ch*sc*DPR),P=OUT*DPR;
  var s=document.createElement('canvas');s.width=W;s.height=H;var sx=s.getContext('2d');sx.imageSmoothingEnabled=true;sx.imageSmoothingQuality='high';sx.drawImage(img,x0,y0,cw,ch,0,0,W,H);
  var sd=sx.getImageData(0,0,W,H);for(var i=3;i<sd.data.length;i+=4)sd.data[i]=sd.data[i]>=120?255:0;sx.putImageData(sd,0,0);
  var sil=document.createElement('canvas');sil.width=W;sil.height=H;var lx=sil.getContext('2d');lx.drawImage(s,0,0);lx.globalCompositeOperation='source-in';lx.fillStyle='#080503';lx.fillRect(0,0,W,H);
  var c=document.createElement('canvas');c.width=W+2*P;c.height=H+2*P;var cx=c.getContext('2d');
  for(var dy=-P;dy<=P;dy++)for(var dx=-P;dx<=P;dx++)if(dx*dx+dy*dy<=P*P)cx.drawImage(sil,P+dx,P+dy);
  cx.drawImage(s,P,P);c.__css=[(W+2*P)/DPR,(H+2*P)/DPR];return c}

function load(k){if(k in cache)return;cache[k]=null;var im=new Image();
  im.onload=function(){cache[k]=processIcon(im)||false;if(lastTabs)apply(lastTabs)};im.onerror=function(){cache[k]=false};
  im.src=BASE+'icons/nav/'+FILES[k]+'.png?v=1'}

/* head-and-chest portrait: 22x24 crop of the 48px doll, 1px outline, shown at 3x and allowed to poke above the bar */
function headCanvas(){var D=g.Doll;if(!player||!D)return null;
  if(!(D.assets.skins&&D.assets.skins.length&&D.assets.hairT&&D.assets.hairT.length)){
    if(!dollLoading){dollLoading=true;D.load(BASE,'1').then(function(){if(lastTabs)apply(lastTabs)})}return null}
  var look={skin:player.skin|0,style:player.style|0,hair:player.hair|0,eyes:player.eyes==null?5:player.eyes,outfit:player.outfit==null?(player.job|0):player.outfit,weapon:null,shield:null,halo:[],breath:false};
  var key=JSON.stringify(look);if(key===headKey&&headCv)return headCv;
  var d=document.createElement('canvas');d.width=d.height=48;D.draw(d,look,1000);
  var X0=12,Y0=5,W=22,H=24,src=d.getContext('2d').getImageData(X0,Y0,W,H).data,c=document.createElement('canvas');c.width=W+2;c.height=H+1;
  var x=c.getContext('2d'),o=x.createImageData(W+2,H+1);function A(i,j){return i>=0&&j>=0&&i<W&&j<H?src[(j*W+i)*4+3]:0}
  for(var j=-1;j<H;j++)for(var i=-1;i<=W;i++){var k=((j+1)*(W+2)+(i+1))*4;
    if(A(i,j)>0){var s=(j*W+i)*4;o.data[k]=src[s];o.data[k+1]=src[s+1];o.data[k+2]=src[s+2];o.data[k+3]=255}
    else if(A(i+1,j)||A(i-1,j)||A(i,j+1)||A(i,j-1)){o.data[k]=8;o.data[k+1]=5;o.data[k+2]=3;o.data[k+3]=255}}
  x.putImageData(o,0,0);c.__css=[(W+2)*3,(H+1)*3];c.__head=true;headKey=key;headCv=c;return c}

function place(btn,src){var old=btn.querySelector('canvas');if(!old||old.__navFrom===src)return;
  var c=document.createElement('canvas');c.width=src.width;c.height=src.height;c.getContext('2d').drawImage(src,0,0);c.__navFrom=src;
  c.style.width=src.__css[0]+'px';c.style.height=src.__css[1]+'px';
  if(src.__head){c.style.imageRendering='pixelated';c.style.marginTop=(48-src.__css[1])+'px';c.style.position='relative';c.style.zIndex='2';btn.style.overflow='visible'}
  else{c.style.margin=((48-src.__css[1])/2)+'px -6px';}
  old.replaceWith(c)}

function apply(tabs){if(!tabs)return;lastTabs=tabs;
  Array.prototype.forEach.call(tabs.querySelectorAll('[data-k]'),function(b){var k=b.getAttribute('data-k');
    if(k==='char'){var h=headCanvas();if(h)place(b,h);return}
    if(FILES[k]){load(k);if(cache[k])place(b,cache[k])}})}

function setPlayer(p){player=p;headKey='';if(lastTabs)apply(lastTabs)}

g.NavIcons={go:go,apply:apply,setPlayer:setPlayer};
})(window);

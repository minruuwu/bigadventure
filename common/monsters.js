/* 怪物立繪與待機動作（呼吸、眨眼、飛行、漂浮、蠕動）：從戰鬥頁抽出來，給記事頁的怪物圖鑑用。
   Monsters.load(BASE) → Promise；Monsters.src(k, now, ph) 取這一刻的圖（url）；Monsters.size(k) → [寬, 高]；
   Monsters.lift(k, now, ph) 離地高度；Monsters.squash(k, now, ph) → [sx, sy] 或 null；Monsters.scale(k)；Monsters.glow(k, now, U) → CSS filter。
   戰鬥頁目前還用自己那一份，之後改動要兩邊一起改（或讓戰鬥頁也改用這支）。 */
(function(g){
var SLIME=null,PSLIME=null,SKI={},SKC={};
var ANI={boar:{n:'野豬',f:'monster_04',leg:20,per:460,fx:'puff',at:[0,14]},snake:{n:'青蛇',f:'monster_05',leg:10,per:1700,sin:1,fx:'tongue',at:[0,4]},wolf:{n:'灰狼',f:'monster_06',leg:18,per:430,fx:'drool',at:[7,13]},dwolf:{n:'魔狼',f:'monster_07',leg:22,per:400,fx:'drool',at:[8,16]},bdragon:{n:'綠幼龍',f:'monster_09',leg:36,per:1300,sin:1,fx:'',at:[0,0]},queen:{n:'黑暗蛛后',f:'monster_boss_03',leg:36,per:1400,sin:1,still:1,fx:'queen',at:[13,8],eyes:[[0,0],[3,0]],hands:[[3,14],[30,14]]},dragon:{n:'綠龍',f:'monster_boss_02',leg:50,per:1500,sin:1,fx:'eye',at:[32,20]},worm:{n:'洞穴蠕蟲',f:'monster_14',still:1,fx:'drool',at:[11,17],dw:2,dl:5},sandworm:{n:'沙蟲',f:'monster_18',still:1,fx:'sand',at:[5,15]}};
var WORMS={worm:1,sandworm:1};/* 整隻伸縮蠕動的蟲類 */
/* still = 整張圖不切上下半身，改用 wormSq 整隻伸縮（以腳底為支點） */
function wormSq(now,ph){var b=Math.sin(now/190+ph);return[1-b*.04,1+b*.06]}
function aniFrame(k,now){var A=ANI[k],im=A.im;if(!im||!im.naturalWidth)return '';if(A.still)return im.src;A.c=A.c||{};var ph=(now%A.per)/A.per,dy=A.sin?(Math.sin(ph*Math.PI*2)>0?1:0):(ph<.5?1:0);if(A.c[dy])return A.c[dy];
  var w=im.naturalWidth,h=im.naturalHeight,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(im,0,A.leg,w,h-A.leg,0,A.leg,w,h-A.leg);x.drawImage(im,0,0,w,A.leg,0,dy,w,A.leg);return A.c[dy]=c.toDataURL()}
function aniDy(k,now){var A=ANI[k];if(A.still)return 0;var ph=(now%A.per)/A.per;return A.sin?(Math.sin(ph*Math.PI*2)>0?1:0):(ph<.5?1:0)}
/* 會飛的怪物：兩張圖輪播當拍翅（flap 毫秒換一張），整隻懸空 hov 格、上下浮動 amp 格（bper 毫秒一輪），換到第二張（收翅）時多往上提 1 格；cy = 身體中心離圖底幾格 */
var FLY={bat:{n:'暗影魔蝠',f:['monster_10_a','monster_10_b'],flap:150,hov:4,amp:2.5,bper:900,cy:26},ghost:{n:'亡魂',f:['monster_15','monster_15'],flap:1e12,hov:4,amp:2,bper:1400,cy:12},beholder:{n:'眼魔',f:['monster_boss_04','monster_boss_04_blink'],bl:3500,hov:5,amp:2.5,bper:1600,cy:16},fwraith:{n:'火焰幽魂',f:['monster_25','monster_25'],flap:1e12,hov:5,amp:2,bper:1500,cy:30},fdragon:{n:'炎王龍',f:['monster_boss_07','monster_boss_07'],flap:1e12,hov:7,amp:3,bper:1900,cy:45},wdragon:{n:'翔風龍',f:['monster_boss_08','monster_boss_08'],flap:1e12,hov:9,amp:3.5,bper:1600,cy:42},wydragon:{n:'浮空龍',f:['monster_28','monster_28'],flap:1e12,hov:6,amp:2.5,bper:1300,cy:22},idragon:{n:'冰咒龍',f:['monster_boss_09','monster_boss_09'],flap:1e12,hov:7,amp:3,bper:2100,cy:46},ldragon:{n:'雷暴龍',f:['monster_boss_10','monster_boss_10'],flap:1e12,hov:7,amp:3,bper:1500,cy:43}};/* bl = 眨眼週期（第二張是閉眼圖，眨 160 毫秒，不是拍翅） *//* 亡魂只有一張圖（flap 設很大＝不換圖），另外在 tick 若隱若現、idleOne 畫眼嘴紅光 */
function flyFr(k,now,ph){var F=FLY[k];if(F.bl)return((now+(ph||0)*4)%F.bl)<160?1:0;return Math.floor((now+(ph||0))/F.flap)%2}
/* 漂浮的怪（不是飛行圖組）：整隻離地 hov 格，上下浮動 amp 格，per 毫秒一個來回 */
var FLOAT={queen:{hov:6,amp:3,per:2400}};
function floatLift(k,now,ph){var F=FLOAT[k];return F?F.hov+F.amp*(1+Math.sin((now+(ph||0)*3)/F.per*Math.PI*2))/2:0}
function flyLift(k,now,ph){var F=FLY[k];if(!F)return 0;return F.hov+F.amp*(1+Math.sin((now+(ph||0)*3)/F.bper*Math.PI*2))/2+(!F.bl&&flyFr(k,now,ph)?1:0)}
function msz(k){return k==='sk'?[40,40]:FLY[k]?(FLY[k].im&&FLY[k].im[0]?[FLY[k].im[0].naturalWidth,FLY[k].im[0].naturalHeight]:[42,50]):LAY[k]?LAY[k].sz:ANI[k]&&ANI[k].im?[ANI[k].im.naturalWidth,ANI[k].im.naturalHeight]:[20,16]}
function skFrame(now){var bl=(now%3200)<180?1:0,dy=Math.sin(now/330)>0?1:0,k=bl+'_'+dy;if(SKC[k])return SKC[k];var im=SKI[bl];if(!im||!im.naturalWidth)return '';var c=document.createElement('canvas');c.width=40;c.height=40;var x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(im,0,34,40,6,0,34,40,6);x.drawImage(im,0,0,40,34,0,dy,40,34);return SKC[k]=c.toDataURL()}
/* 眼睛圖層型的怪物：_blink 是眼睛圖層，平常疊上去、眨眼時藏起來；膝蓋以上每 0.66 秒上下 1 格 */
var LAY={gob:{sz:[25,27],c:{},per:2900,kn:6},orc:{sz:[36,45],c:{},per:3400,kn:7},gobw:{sz:[24,27],c:{},per:2600,kn:6},golem:{sz:[44,45],c:{},per:3600,kn:7},cgolem:{sz:[44,45],c:{},per:3800,kn:7},spider:{sz:[48,30],c:{},per:3000,kn:8},troll:{sz:[49,53],c:{},per:1e12,kn:15,br:200},sandsnake:{sz:[31,36],c:{},per:3100,kn:12,br:380,tgp:2000},mummy:{sz:[26,45],c:{},per:1e12,kn:14,br:430},scorpion:{sz:[41,38],c:{},per:1e12,kn:10,br:360},croc:{sz:[46,35],c:{},per:1e12,kn:7,br:400},jackal:{sz:[48,36],c:{},per:1e12,kn:8,br:380},gorgon:{sz:[49,53],c:{},per:1e12,kn:13,br:420},ydragon:{sz:[40,32],c:{},per:1e12,kn:8,br:440},fydragon:{sz:[40,32],c:{},per:1e12,kn:8,br:400},iydragon:{sz:[40,33],c:{},per:1e12,kn:8,br:460},lydragon:{sz:[40,37],c:{},per:1e12,kn:8,br:300},sdragon:{sz:[61,54],c:{},per:1e12,kn:15,br:520},osiris:{sz:[95,83],c:{},per:1e12,kn:16,br:520}};/* tgp = 吐舌週期（舌頭圖層每週期快速吐兩下） *//* br = 起伏速度（預設 330，數字小 = 喘得快）；巨魔不眨眼，紅眼和鼻息在 idleOne 畫 */
function layFrame(k,now){var L=LAY[k],cl=(now%L.per)<160?1:0,dy=Math.sin(now/(L.br||330))>0?1:0,tq=L.tgp?now%L.tgp:9999,tg=L.tg&&((tq<150)||(tq>=300&&tq<450))?1:0,key=cl+'_'+dy+'_'+tg;if(L.c[key])return L.c[key];var b=L.base,e=L.eyes;if(!b||!b.naturalWidth||!L.bb)return '';
  var bb=L.bb,w=bb[2],h=bb[3],kn=h-L.kn,N=b.naturalWidth,c=document.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');x.imageSmoothingEnabled=false;
  var t=document.createElement('canvas');t.width=N;t.height=b.naturalHeight;var tx=t.getContext('2d');tx.drawImage(b,0,0);if(!cl&&e)tx.drawImage(e,0,0);if(tg)tx.drawImage(L.tg,0,0);
  x.drawImage(t,bb[0],bb[1]+kn,w,h-kn,0,kn,w,h-kn);x.drawImage(t,bb[0],bb[1],w,kn,0,dy,w,kn);return L.c[key]=c.toDataURL()}
function layInit(k,b,e){var L=LAY[k];L.base=b;L.eyes=e;if(!b)return;var W=b.naturalWidth,H=b.naturalHeight,gc=document.createElement('canvas');gc.width=W;gc.height=H;var gx=gc.getContext('2d');gx.drawImage(b,0,0);if(e)gx.drawImage(e,0,0);
  var gd=gx.getImageData(0,0,W,H).data,a0=W,b0=H,a1=-1,b1=-1;for(var y=0;y<H;y++)for(var xx=0;xx<W;xx++)if(gd[(y*W+xx)*4+3]>0){if(xx<a0)a0=xx;if(xx>a1)a1=xx;if(y<b0)b0=y;if(y>b1)b1=y}
  if(a1>=0){L.bb=[a0,b0,a1-a0+1,b1-b0+1];L.sz=[a1-a0+1,b1-b0+1]}}
function msrc(k,now,ph){if(FLY[k]){var fi=FLY[k].im&&FLY[k].im[flyFr(k,now,ph)];return fi&&fi.naturalWidth?fi.src:''}return k==='sk'?skFrame(now):LAY[k]?layFrame(k,now):ANI[k]?aniFrame(k,now):k==='pslime'?PSLIME:SLIME}
function mscale(k,boss){return k==='dragon'?1:k==='queen'?1.2:k==='bat'?.8:k==='cgolem'?1.2:k==='spider'?.9:k==='bdragon'?.8:k==='ghost'?1.4:k==='beholder'?1.8:k==='sandsnake'?.75:k==='mummy'?.78:k==='scorpion'?.7:k==='gorgon'?.68:k==='fwraith'?.55:k==='sdragon'?1.45:k==='osiris'?.95:k==='fdragon'?.95:k==='wdragon'?.8:k==='wydragon'?.85:k==='idragon'?.85:k==='ldragon'?.9:boss?(k==='sk'?1.5:1.2):1}
function monGlow(k,now,U){if(k==='queen'){/* 蘿絲：紫黑色輪廓光，慢慢脈動 */var aq=.6+.25*Math.sin(now/700),q1=Math.max(1,Math.round(U*1.2)),q2=Math.max(2,Math.round(U*3.2)),hq=function(x){return('0'+Math.round(x*255).toString(16)).slice(-2)};return 'drop-shadow(0 0 '+q1+'px #8a3ad8'+hq(aq)+') drop-shadow(0 0 '+q2+'px #3a0a5a'+hq(aq*.9)+')'}if(k!=='osiris')return '';var a=.55+.25*Math.sin(now/600),r1=Math.max(1,Math.round(U*1.3)),r2=Math.max(2,Math.round(U*3.5)),h=function(x){return('0'+Math.round(x*255).toString(16)).slice(-2)};return 'drop-shadow(0 0 '+r1+'px #6dff8a'+h(a)+') drop-shadow(0 0 '+r2+'px #2adf6a'+h(a*.7)+')'}
/* ---- 待機特效（法杖寶珠、火把火焰、口水、吐信、毒煙……）：跟戰鬥頁的 idleOne 同一份 ----
   Monsters.idle(ctx, U, m, now)：m = {k, lx, gy, lift, sc, ph}，座標以「格」為單位，U = 每格幾個畫面像素 */
var pctx=null,U=1,IMG={};
function VP(x,y,c,a){if(a<=0)return;pctx.globalAlpha=Math.min(1,a);pctx.fillStyle=c;var x0=Math.round(x*U),y0=Math.round(y*U);pctx.fillRect(x0,y0,Math.max(1,Math.round((x+1)*U)-x0),Math.max(1,Math.round((y+1)*U)-y0))}
function hsh(a,b){var x=Math.sin(a*127.1+b*311.7)*43758.5453;return x-Math.floor(x)}
var BHE=[[21,1,4,4,23.0,2.5],[14,2,4,4,16.0,4.5],[5,5,4,4,7.0,6.5],[28,9,4,4,29.5,11.0],[1,13,4,4,3.5,15.0],[27,17,4,4,29.0,18.5],[0,22,6,4,2.0,24.5],[29,22,4,4,31.5,24.0],[19,25,4,4,21.0,26.5],[11,27,4,4,13.5,29.0]];/* 眼魔觸手眼的位置 */
function idleOne(m,now){(function(){
  /* 哥布林巫師：法杖頂端的寶珠發出藍色光暈（跟著身體上下） */
  if(m.k==='gobw'&&m.alive){var GZ=msz('gobw'),gs=m.sc,gdy=Math.sin(now/330)>0?1:0,gx=m.lx-GZ[0]*gs/2+2*gs,gy2=m.gy-GZ[1]*gs+(1.5+gdy)*gs,gp=.7+.3*Math.sin((now+m.ph*3)/300);
    pctx.globalCompositeOperation='lighter';for(var gi=-5;gi<=5;gi++)for(var gj=-5;gj<=5;gj++){var gr=Math.sqrt(gi*gi+gj*gj);if(gr>5.3)continue;VP(gx+gi,gy2+gj,gr<2.5?'#7ec4ff':'#3d8bff',gp*(gr<2.5?.95:.75)*(1-gr/6.5))}pctx.globalCompositeOperation='source-over';
    if(Math.floor((now+m.ph*7)/170)%7===0)VP(gx+Math.round(Math.sin(now/90)*3),gy2-3-Math.floor((now%170)/60),'#e8f6ff',.85)}
  /* 眼魔：十隻觸手末端的眼睛各自閃黃光（錯開閃爍） */
  /* 眼魔：十隻觸手眼各自隨機眨眼——閉眼時從「觸手眼全閉」圖（monster_boss_04_tc）截那一顆的小方塊蓋上去；睜著的閃黃光；出手那一下全部睜開、更亮；睡眠全閉
     BHE = [截圖 x, y, 寬, 高, 光暈中心 x, y]（圖上的格子座標） */
  if(m.k==='beholder'&&m.alive){var BZ=msz('beholder'),bs=m.sc,bx0=m.lx-BZ[0]*bs/2,by0=m.gy-(m.lift||0)-BZ[1]*bs,slp=m.sfx&&m.sfx.fx.sleep,TC=IMG.monster_boss_04_tc;
    BHE.forEach(function(q,qi){
      var P=2300+qi*370,off=qi*911+Math.round(m.ph*13),tt=now+off,n=Math.floor(tt/P),h=((n*2654435761+qi*40503)>>>0)%1000,dur=h<100?1100+h*8:200+h%300,closed=slp||(!m.act&&(tt%P)<dur);
      if(closed){if(TC&&TC.naturalWidth){pctx.globalCompositeOperation='source-over';pctx.globalAlpha=1;pctx.imageSmoothingEnabled=false;pctx.drawImage(TC,q[0],q[1],q[2],q[3],Math.round((bx0+q[0]*bs)*U),Math.round((by0+q[1]*bs)*U),Math.round(q[2]*bs*U),Math.round(q[3]*bs*U))}return}
      var cx=bx0+q[4]*bs,cy=by0+q[5]*bs,fp=Math.sin((now+m.ph*3)/(230+qi*23)+qi*1.7),fa=m.act?1:.35+.65*Math.max(0,fp);pctx.globalCompositeOperation='lighter';
      for(var bi=-3;bi<=3;bi++)for(var bj=-3;bj<=3;bj++){var br=Math.sqrt(bi*bi+bj*bj);if(br>3.3)continue;VP(cx+bi-.5,cy+bj-.5,br<1.2?'#fff2a0':br<2.3?'#ffd23a':'#ffaa10',fa*(br<1.2?.8:br<2.3?.45:.2)*(m.act?1.3:1))}});pctx.globalCompositeOperation='source-over'}
  /* 歐西里斯：身體周圍一縷縷熒綠氣勁從腳邊緩緩往上飄、淡出 */
  if(m.k==='osiris'&&m.alive){var OZ=msz('osiris'),os2=m.sc,owd=OZ[0]*os2*.42,ot=now+m.ph*3;pctx.globalCompositeOperation='lighter';for(var oq=0;oq<12;oq++){var per5=2200+oq*190,u5=((ot+oq*377)%per5)/per5,cy5=Math.floor((ot+oq*377)/per5),ox5=m.lx+(((cy5*13+oq*29)%21)-10)/10*owd,oy5=m.gy-2-u5*OZ[1]*os2*.85,a5=Math.sin(u5*Math.PI)*.55;for(var k5=0;k5<5;k5++)VP(ox5+Math.sin(u5*6+oq+k5*.3)*1.5,oy5+k5*1.6,k5===0?'#d8ffe0':'#5aff8a',a5*(1-k5/5))}pctx.globalCompositeOperation='source-over'}
  /* 沙晶龍：紅眼一明一暗；藍色晶翼上一顆顆白色晶光亮了又滅（跟著上半身起伏） */
  if(m.k==='sdragon'&&m.alive){var DZ=msz('sdragon'),ds2=m.sc,ddy=Math.sin(now/520)>0?1:0,dx0=m.lx-DZ[0]*ds2/2,dy0=m.gy-DZ[1]*ds2,dt2=now+m.ph*3,dp=.7+.3*Math.sin(dt2/300),ex2=dx0+6.5*ds2-.5,ey2=dy0+(19.5+ddy)*ds2-.5;
    VP(ex2,ey2,'#ff5a3a',dp);[[-1,0],[1,0],[0,-1],[0,1]].forEach(function(o){VP(ex2+o[0],ey2+o[1],'#ff2a14',.45*dp)});[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(o){VP(ex2+o[0],ey2+o[1],'#ff200c',.18*dp)});
    pctx.globalCompositeOperation='lighter';[[36,14],[37,11],[38,15],[40,7],[41,3],[42,16],[45,4],[47,15],[50,15],[53,15]].forEach(function(q,qi){var per=1700+qi*230,u=((dt2+qi*590)%per)/per;if(u>.28)return;var a=Math.sin(u/.28*Math.PI),cx=dx0+(q[0]+.5)*ds2,cy=dy0+(q[1]+.5+ddy)*ds2;VP(cx,cy,'#ffffff',a);[[-1,0],[1,0],[0,-1],[0,1]].forEach(function(o){VP(cx+o[0]*ds2*.8,cy+o[1]*ds2*.8,'#bfe4ff',a*.6)});if(a>.6)[[-2,0],[2,0],[0,-2],[0,2]].forEach(function(o){VP(cx+o[0]*ds2*.8,cy+o[1]*ds2*.8,'#9ad0ff',a*.35)})});pctx.globalCompositeOperation='source-over'}
  /* 火焰幽魂：火把火焰搖曳（6 道火舌忽高忽低、左右擺）＋往上飄的火星 */
  /* 炎王龍：火苗只從身上原本畫著火的位置往上燒（圖上偏橘黃、上方透明的像素），大小不一、不規則跳動，不會脫離身體 */
  if(m.k==='fdragon'&&m.alive){var FZ=msz('fdragon'),fs=m.sc,fx0=m.lx-FZ[0]*fs/2,fy0=m.gy-(m.lift||0)-FZ[1]*fs,ft=now+m.ph*3,FP=IMG.__fdp;
    if(!FP){FP=[];var fim=IMG.monster_boss_07;if(fim&&fim.naturalWidth){var fw=fim.naturalWidth,fh=fim.naturalHeight,fc=document.createElement('canvas');fc.width=fw;fc.height=fh;var fcx=fc.getContext('2d');fcx.drawImage(fim,0,0);var fd=fcx.getImageData(0,0,fw,fh).data,cell={};
      for(var fy=0;fy<fh;fy++)for(var fxx=0;fxx<fw;fxx++){var q8=(fy*fw+fxx)*4;if(fd[q8+3]<200)continue;if(fy>0&&fd[q8-fw*4+3]>0)continue;var rr=fd[q8],gg=fd[q8+1],bb=fd[q8+2];if(!(rr>190&&gg>50&&bb<130))continue;var ck=Math.floor(fxx/7)+'_'+Math.floor(fy/7);if(cell[ck])continue;cell[ck]=1;FP.push([fxx,fy,hsh(fxx,fy)])}}
      if(FP.length)IMG.__fdp=FP}
    pctx.globalCompositeOperation='lighter';
    FP.forEach(function(q,qi){var r9=q[2],bx=fx0+(q[0]+.5)*fs,by=fy0+(q[1]+.5)*fs,base=(4+r9*7)*fs,
      n9=(Math.sin(ft/(85+r9*60)+qi*2.3)+Math.sin(ft/(47+r9*31)+qi*.7)*.6+Math.sin(ft/(150+qi%5*20))*.4)/2,hh=base*(.6+.4*n9);
      for(var col=-1;col<=1;col++){var hc=hh*(col===0?1:.55+.25*Math.sin(ft/(60+qi*7)+col*2)),xo=col*fs*.9;
        for(var k7=0;k7<hc;k7++){var f7=k7/hc,sw7=Math.sin(ft/(90+r9*40)+qi+f7*2.4)*(1+r9*1.5)*f7*f7*fs;VP(bx+xo+sw7,by-k7,f7<.25?'#fff4b0':f7<.55?'#ffb030':f7<.8?'#ff6a1a':'#d8301a',(col===0?.75:.5)*(1-f7*.55))}}});
    /* 火花：從火苗頂端飄出、一邊飄一邊左右晃，很快就熄掉 */
    if(FP.length)for(var e7=0;e7<10;e7++){var per7=900+e7*130,u7=((ft+e7*389)%per7)/per7,cy7=Math.floor((ft+e7*389)/per7),q7=FP[Math.floor(hsh(cy7,e7+11)*FP.length)];if(!q7)continue;
      var sx7=fx0+(q7[0]+.5)*fs+Math.sin(u7*7+e7)*2.2*fs*u7,sy7=fy0+(q7[1]+.5)*fs-(5+q7[2]*7)*fs*.7-u7*14*fs;VP(sx7,sy7,u7<.3?'#fff2b0':u7<.6?'#ffb040':'#ff5a1a',(1-u7)*.95);if(u7<.35)VP(sx7,sy7+1,'#ff8a20',(1-u7)*.4)}
    /* 全身火焰飄散：從身上隨機一點冒出小火焰，一邊往上飄、一邊左右晃、變小變暗，到 8～14 格高就散掉 */
    var BP=IMG.__fbp;if(!BP){BP=[];var bim=IMG.monster_boss_07;if(bim&&bim.naturalWidth){var bw=bim.naturalWidth,bh=bim.naturalHeight,bc=document.createElement('canvas');bc.width=bw;bc.height=bh;var bcx=bc.getContext('2d');bcx.drawImage(bim,0,0);var bd=bcx.getImageData(0,0,bw,bh).data,bcl={};
      for(var by2=0;by2<bh;by2++)for(var bx2=0;bx2<bw;bx2++){if(bd[(by2*bw+bx2)*4+3]<250)continue;var bk=Math.floor(bx2/5)+'_'+Math.floor(by2/5);if(bcl[bk])continue;bcl[bk]=1;BP.push([bx2,by2])}}if(BP.length)IMG.__fbp=BP}
    if(BP.length)for(var g7=0;g7<26;g7++){var pg=1100+g7*47,ug=((ft+g7*263)%pg)/pg,cg=Math.floor((ft+g7*263)/pg),pp=BP[Math.floor(hsh(cg,g7+29)*BP.length)];if(!pp)continue;
      var rise=(8+hsh(cg,g7)*6)*fs,gx=fx0+(pp[0]+.5)*fs+Math.sin(ug*6.5+g7)*(1.2+ug*2.2)*fs,gy=fy0+(pp[1]+.5)*fs-ug*rise,sz=ug<.35?2:1,ag=ug<.15?ug/.15:1-((ug-.15)/.85);
      var gc=ug<.25?'#fff0a0':ug<.55?'#ffa030':ug<.8?'#ff5a1a':'#b8280e';for(var gx2=0;gx2<sz;gx2++)for(var gy2=0;gy2<sz;gy2++)VP(gx+gx2,gy-gy2,gc,ag*.8);if(ug<.4)VP(gx,gy+sz,'#ff8a20',ag*.35)}
    pctx.globalCompositeOperation='source-over'}
  /* 翔風龍：三道風在身邊繞圈（斜的橢圓軌道），風頭亮、尾巴漸淡；繞到身後那半圈比較淡 */
  if(m.k==='wdragon'&&m.alive){var WZ2=msz('wdragon'),w2=m.sc,wcx=m.lx,wcy=m.gy-(m.lift||0)-WZ2[1]*w2*.5,wt2=now+m.ph*3;pctx.globalCompositeOperation='lighter';
    [[.62,.18,.35,2300,0],[.5,.26,-.25,1900,2.1],[.7,.12,.15,2700,4.2]].forEach(function(o,oi){var rx=WZ2[0]*w2*o[0],ry=WZ2[1]*w2*o[1],tl=WZ2[1]*w2*o[2],a0=wt2/o[3]*Math.PI*2+o[4],da=.8/rx,L=Math.round(Math.PI*1.1/da);
      for(var k8=0;k8<L;k8++){var a8=a0-k8*da,c8=Math.cos(a8),s8=Math.sin(a8),x8=wcx+c8*rx,y8=wcy+s8*ry+c8*tl*.5,f8=k8/L,back=s8<0?.3:1,al=(1-f8)*(1-f8*.6)*back,th=f8<.35?2:1;
        for(var t8=0;t8<th;t8++)VP(x8,y8+t8,f8<.12?'#ffffff':f8<.45?'#d6fff4':'#8ae8cc',al*(t8?.55:.95))}});
    for(var p8=0;p8<5;p8++){var u8=((wt2+p8*610)%2200)/2200,a9=u8*Math.PI*2+p8*1.3,x9=wcx+Math.cos(a9)*WZ2[0]*w2*.55,y9=wcy+Math.sin(a9)*WZ2[1]*w2*.2-u8*6;VP(x9,y9,'#d8fff4',Math.sin(u8*Math.PI)*.7)}
    pctx.globalCompositeOperation='source-over'}
  /* 冰咒龍：手上的冰晶星一圈淡藍光暈慢慢脈動；身上隨機位置的小雪結晶淡入、閃一下、淡出 */
  if(m.k==='idragon'&&m.alive){var IZ=msz('idragon'),is=m.sc,ix0=m.lx-IZ[0]*is/2,iy0=m.gy-(m.lift||0)-IZ[1]*is,it=now+m.ph*3,IP=IMG.__idp;
    if(!IP){IP=[];var iim=IMG.monster_boss_09;if(iim&&iim.naturalWidth){var iw=iim.naturalWidth,ih=iim.naturalHeight,ic=document.createElement('canvas');ic.width=iw;ic.height=ih;var icx=ic.getContext('2d');icx.drawImage(iim,0,0);var idd=icx.getImageData(0,0,iw,ih).data,icell={};
      for(var iy=2;iy<ih-2;iy++)for(var ixx=2;ixx<iw-2;ixx++){if(idd[(iy*iw+ixx)*4+3]<250)continue;var ik=Math.floor(ixx/8)+'_'+Math.floor(iy/8);if(icell[ik])continue;icell[ik]=1;IP.push([ixx,iy])}}
      if(IP.length)IMG.__idp=IP}
    pctx.globalCompositeOperation='lighter';
    /* 冰霧：身體四周幾團淡淡的白藍霧氣，慢慢繞著飄、時濃時淡（點陣霧，越外圈越稀） */
    pctx.globalCompositeOperation='source-over';
    for(var m9=0;m9<9;m9++){var pm=9000+m9*1300,um=((it+m9*1777)%pm)/pm,am=um*Math.PI*2*(m9%2?1:-1)+m9*.7,rxm=IZ[0]*is*(.42+.12*hsh(m9,1)),rym=IZ[1]*is*(.22+.1*hsh(m9,2)),cxm=m.lx+Math.cos(am)*rxm,cym=iy0+IZ[1]*is*(.58+.12*hsh(m9,3))+Math.sin(am)*rym,
      rm=(9+hsh(m9,4)*7)*is,dm=.55+.45*Math.sin(it/(1300+m9*170)+m9);
      for(var am2=-Math.ceil(rm);am2<=Math.ceil(rm);am2++)for(var bm2=-Math.ceil(rm*.6);bm2<=Math.ceil(rm*.6);bm2++){var rr2=Math.sqrt(am2*am2+(bm2/.6)*(bm2/.6))/rm;if(rr2>1)continue;
        if(rr2>.55&&((Math.round(cxm+am2)+Math.round(cym+bm2))&1))continue;VP(cxm+am2,cym+bm2,rr2<.4?'#f2fbff':'#cfeaff',(rr2<.4?.26:.16)*dm)}}
    pctx.globalCompositeOperation='lighter';
    var sx9=ix0+82*is,sy9=iy0+61*is,sp9=.65+.35*Math.sin(it/520),sr9=(7+2*Math.sin(it/520))*is;
    for(var a9=-Math.ceil(sr9);a9<=Math.ceil(sr9);a9++)for(var b9=-Math.ceil(sr9);b9<=Math.ceil(sr9);b9++){var r9=Math.sqrt(a9*a9+b9*b9);if(r9>sr9)continue;var f9=r9/sr9;VP(sx9+a9,sy9+b9,f9<.25?'#ffffff':f9<.5?'#c8f4ff':f9<.8?'#6ad0ff':'#3a8cff',sp9*(f9<.25?.55:f9<.5?.35:f9<.8?.2:.1))}
    if(IP.length)for(var q9=0;q9<7;q9++){var per9=1700+q9*230,u9=((it+q9*571)%per9)/per9,cy9=Math.floor((it+q9*571)/per9),pt=IP[Math.floor(hsh(cy9,q9+3)*IP.length)],al9=u9<.35?u9/.35:u9<.55?1:Math.max(0,1-(u9-.55)/.45);
      if(!pt)continue;var px9=ix0+(pt[0]+.5)*is,py9=iy0+(pt[1]+.5)*is,big=hsh(cy9,q9)>.5?2:1;VP(px9,py9,'#ffffff',al9);
      for(var d9=1;d9<=big;d9++){var ca=d9===big?'#bfeeff':'#ffffff',aa=al9*(d9===big?.7:.9);VP(px9-d9,py9,ca,aa);VP(px9+d9,py9,ca,aa);VP(px9,py9-d9,ca,aa);VP(px9,py9+d9,ca,aa)}
      if(big===2){VP(px9-1,py9-1,'#d8f6ff',al9*.5);VP(px9+1,py9-1,'#d8f6ff',al9*.5);VP(px9-1,py9+1,'#d8f6ff',al9*.5);VP(px9+1,py9+1,'#d8f6ff',al9*.5)}}
    pctx.globalCompositeOperation='source-over'}
  /* 雷暴龍／電擊龍：不時從身上往外迸出一道鋸齒閃電（黃藍交錯），一閃即逝；電擊龍少很多 */
  if((m.k==='ldragon'||m.k==='lydragon')&&m.alive){var boss=m.k==='ldragon',LZ=msz(m.k),ls=m.sc,lx0=m.lx-LZ[0]*ls/2,ly0=m.gy-(m.lift||0)-LZ[1]*ls,lt=now+m.ph*3,key=boss?'__lbp':'__lyp',LP=IMG[key];
    if(!LP){LP=[];var lim=IMG[boss?'monster_boss_10':'monster_30'];if(lim&&lim.naturalWidth){var lw=lim.naturalWidth,lh=lim.naturalHeight,lc=document.createElement('canvas');lc.width=lw;lc.height=lh;var lcx=lc.getContext('2d');lcx.drawImage(lim,0,0);var ld=lcx.getImageData(0,0,lw,lh).data,lcl={};
      for(var ly=0;ly<lh;ly++)for(var lxx=0;lxx<lw;lxx++){if(ld[(ly*lw+lxx)*4+3]<250)continue;var lk=Math.floor(lxx/6)+'_'+Math.floor(ly/6);if(lcl[lk])continue;lcl[lk]=1;LP.push([lxx,ly])}}if(LP.length)IMG[key]=LP}
    if(LP.length){pctx.globalCompositeOperation='lighter';var NB=boss?6:2;
      for(var b0=0;b0<NB;b0++){var per=boss?(700+b0*170):(2600+b0*900),ub=((lt+b0*311)%per)/per,cb=Math.floor((lt+b0*311)/per),on=boss?.22:.09;if(ub>on)continue;var al=1-ub/on,pt=LP[Math.floor(hsh(cb,b0+5)*LP.length)];if(!pt)continue;
        var sx=lx0+(pt[0]+.5)*ls,sy=ly0+(pt[1]+.5)*ls,an=Math.atan2(sy-(ly0+LZ[1]*ls*.5),sx-m.lx)+(hsh(cb,b0)-.5)*1.2,len=(boss?10+hsh(cb,b0+9)*10:6+hsh(cb,b0+9)*5)*ls,col=hsh(cb,b0+2)>.5?'#ffe34d':'#7fd8ff',px=sx,py=sy,seg=boss?5:3;
        for(var g=1;g<=seg;g++){var nx=sx+Math.cos(an)*len*g/seg+(g<seg?(hsh(cb*7+g,b0)-.5)*4:0),ny=sy+Math.sin(an)*len*g/seg+(g<seg?(hsh(cb*5+g,b0+1)-.5)*4:0),L=Math.max(1,Math.ceil(Math.abs(nx-px)+Math.abs(ny-py)));
          for(var s3=0;s3<=L;s3++){var qx=px+(nx-px)*s3/L,qy=py+(ny-py)*s3/L;VP(qx,qy,'#ffffff',al*.95);VP(qx+1,qy,col,al*.6);VP(qx,qy+1,col,al*.45)}px=nx;py=ny}}
      pctx.globalCompositeOperation='source-over'}}
  if(m.k==='fwraith'&&m.alive){var WZ=msz('fwraith'),ws=m.sc,wx0=m.lx-WZ[0]*ws/2,wy0=m.gy-(m.lift||0)-WZ[1]*ws,wt=now+m.ph*3,fbx=wx0+5*ws,fby=wy0+17*ws;pctx.globalCompositeOperation='lighter';
    [-2,-1,0,1,2,3].forEach(function(q){var hh=(q===0||q===1?13:Math.abs(q-.5)<2?10:6)*ws*(.7+.3*Math.sin(wt/(60+Math.abs(q)*13)+q*2.1)),sw3=Math.sin(wt/120+q)*1.3;for(var k6=0;k6<hh;k6++){var f6=k6/hh;VP(fbx+q*ws*.8+sw3*f6*2,fby-k6,f6<.3?'#fff2a0':f6<.65?'#ff9a2a':'#e0401a',(f6>.8?.35:.6)*(1-f6*.3))}});
    for(var e6=0;e6<3;e6++){var eu=((wt+e6*430)%1300)/1300,ex6=fbx+Math.sin(eu*7+e6)*3,ey6=fby-12*ws-eu*14;VP(ex6,ey6,eu<.5?'#ffd060':'#ff6a1a',1-eu)}
    pctx.globalCompositeOperation='source-over'}
  /* 金狼祭祀：左手藍火忽明忽暗、偶爾竄火星；法杖頂端寶珠一圈淡藍光暈慢慢脈動 */
  if(m.k==='jackal'&&m.alive){var JZ=msz('jackal'),js=m.sc,jdy=Math.sin(now/380)>0?1:0,jx0=m.lx-JZ[0]*js/2,jy0=m.gy-JZ[1]*js,jt=now+m.ph*3;pctx.globalCompositeOperation='lighter';
    /* 左手青藍火焰：5 道火舌各自忽高忽低、左右搖曳，底部白芯，往上轉青藍再到深藍；外圍一圈淡光 */
    var fx3=jx0+3.5*js,fy3=jy0+(19.5+jdy)*js;for(var a5=-4;a5<=4;a5++)for(var b5=-6;b5<=3;b5++){var r5=Math.sqrt(a5*a5+b5*b5*.5);if(r5>4.6)continue;VP(fx3+a5,fy3+b5-2,'#2a9cff',.16*(1-r5/5))}
    pctx.globalCompositeOperation='source-over';[-2,-1,0,1,2].forEach(function(q){var hh=Math.round((q===0?9:Math.abs(q)===1?7:4)*(.75+.25*Math.sin(jt/(70+Math.abs(q)*17)+q*1.9))),sw2=Math.sin(jt/110+q)*.8;
      for(var k5=0;k5<hh;k5++){var f5=k5/hh,xx5=fx3+q+sw2*f5*1.5,c5=f5<.25?'#e8fbff':f5<.6?'#5ee6ff':'#1a8cff';VP(xx5,fy3-k5,c5,f5>.85?.6:.95)}});
    pctx.globalCompositeOperation='lighter';var sp3=Math.floor(jt/150)%5;if(sp3<2)VP(fx3+Math.round(Math.sin(jt/50)*2),fy3-10-sp3*2-((jt%150)/60),'#c8f4ff',.9);
    /* 右邊法杖寶石：較大、較亮的青藍光暈，慢慢脈動 */var ox3=jx0+41*js,oy3=jy0+(7+jdy)*js,op3=.7+.3*Math.sin(jt/420);for(var a4=-9;a4<=9;a4++)for(var b4=-9;b4<=9;b4++){var r4=Math.sqrt(a4*a4+b4*b4);if(r4>9.2)continue;VP(ox3+a4,oy3+b4,r4<2?'#ffffff':r4<4?'#9ef0ff':r4<6.5?'#4ab4ff':'#2a6cff',op3*(r4<2?.8:r4<4?.5:r4<6.5?.26:.12)*(1-r4/11))}
    pctx.globalCompositeOperation='source-over'}
  /* 木乃伊：紅眼光暈＋嘴巴緩緩吐出紫色毒煙（往左上飄、變大變淡） */
  if(m.k==='mummy'&&m.alive){var QZ=msz('mummy'),qs=m.sc,qdy=Math.sin(now/430)>0?1:0,qx0=m.lx-QZ[0]*qs/2,qy0=m.gy-QZ[1]*qs,qp=.7+.3*Math.sin((now+m.ph*3)/320),ex=qx0+4.5*qs-.5,ey=qy0+(8.5+qdy)*qs-.5;
    VP(ex,ey,'#ff5a3a',qp);[[-1,0],[1,0],[0,-1],[0,1]].forEach(function(o){VP(ex+o[0],ey+o[1],'#ff2a14',.45*qp)});[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(o){VP(ex+o[0],ey+o[1],'#ff200c',.18*qp)});
    var mx1=qx0+4*qs,my1=qy0+(15+qdy)*qs,QP=Math.PI*2*430;/* 一次呼吸吐一口：從嘴巴前方往前（左）飄、稍微往上 */for(var qi=0;qi<2;qi++){var qt=(now+m.ph*3-qi*260)%QP;if(qt<0)qt+=QP;var qu=qt/(QP*.9);if(qu>1)continue;var qr=qi?1:1+Math.floor(qu*2.5),qa=(qi?.6:.85)*Math.sin(qu*Math.PI),cxm=mx1-2-qu*12+Math.sin(qu*3)*.8,cym=my1-qu*3;
      for(var aa=-qr;aa<=qr;aa++)for(var bb=-qr;bb<=qr;bb++){if(aa*aa+bb*bb>qr*qr+.5)continue;VP(cxm+aa,cym+bb,(aa+bb<0)?'#a05ad8':'#5a2a8a',qa*(aa*aa+bb*bb>=qr*qr-1?.75:1))}}}
  /* 洞穴巨魔：紅眼發光＋喘氣時嘴邊冒白氣（跟著上半身起伏） */
  if(m.k==='troll'&&m.alive){var TZ=msz('troll'),ts=m.sc,tdy=Math.sin(now/200)>0?1:0,tx0=m.lx-TZ[0]*ts/2,ty0=m.gy-TZ[1]*ts,tp=.7+.3*Math.sin((now+m.ph*3)/300);
    [[18,13],[23,13]].forEach(function(q){var ex=tx0+(q[0]+.5)*ts-.5,ey=ty0+(q[1]+tdy+.5)*ts-.5;VP(ex,ey,'#ff6a4a',tp);[[-1,0],[1,0],[0,-1],[0,1]].forEach(function(o){VP(ex+o[0],ey+o[1],'#ff2a14',.4*tp)});[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(o){VP(ex+o[0],ey+o[1],'#ff200c',.16*tp)})});
    var tc=(now+m.ph*3)%1260,mx0=tx0+17*ts,my0=ty0+(18+tdy)*ts;for(var ti=0;ti<4;ti++){var tu=(tc-ti*90)/700;if(tu<0||tu>1)continue;var px0=mx0-2-tu*9,py0=my0-tu*4-ti*.7,pa=(1-tu)*.9;VP(px0,py0,'#ffffff',pa);VP(px0+1,py0,'#e6e2d8',pa*.8);VP(px0,py0+1,'#e6e2d8',pa*.8);VP(px0+1,py0+1,'#cfcabd',pa*.6)}}
  /* 亡魂：兩眼、嘴巴透出微微紅光（跟著飄動與透明度） */
  if(m.k==='ghost'&&m.alive){var HZ=msz('ghost'),hs=m.sc,hx0=m.lx-HZ[0]*hs/2,hy0=m.gy-(m.lift||0)-HZ[1]*hs,hp=(.65+.35*Math.sin(now/420+m.ph))*Math.min(1,(m.gf||1)+.25);
    pctx.globalCompositeOperation='lighter';[[3,3],[3,4],[5,3],[5,4],[6,4],[4,6],[5,6],[5,7],[6,7],[6,8]].forEach(function(q){var cx=hx0+(q[0]+.5)*hs,cy=hy0+(q[1]+.5)*hs;VP(cx-.5,cy-.5,'#ff3a24',.4*hp);[[-1,0],[1,0],[0,-1],[0,1]].forEach(function(o){VP(cx-.5+o[0],cy-.5+o[1],'#c8160a',.14*hp)})});pctx.globalCompositeOperation='source-over'}
  var A=ANI[m.k];if(!A||!m.alive)return;var MZ=msz(m.k),sc=m.sc,ox=m.lx-MZ[0]*sc/2,oy=m.gy-(m.lift||0)-MZ[1]*sc,dy=aniDy(m.k,now),ax=ox+A.at[0]*sc,ay=oy+(A.at[1]+dy)*sc,t=now+m.ph*3;
  if(A.still&&WORMS[m.k]){var wq=wormSq(now,m.ph);ax=m.lx+(A.at[0]-MZ[0]/2)*sc*wq[0];ay=m.gy-(MZ[1]-A.at[1])*sc*wq[1]}
  if(A.fx==='puff'){var c=t%1800;for(var i=0;i<3;i++){var u=(c-i*120)/700;if(u<0||u>1)continue;VP(ax-2-u*7,ay-u*3-i,'#e8e4dc',(1-u)*.85)}}
  else if(A.fx==='queen'){/* 黑暗蛛后：兩眼紅光 + 雙手藍紫光暈 */var pu=.75+.25*Math.sin(t/260);A.eyes.forEach(function(o){var ex=ax+o[0]*sc;VP(ex,ay,'#ff5a3c',pu);VP(ex,ay,'#ffd0c0',.5*pu);[[-1,0],[1,0],[0,-1],[0,1]].forEach(function(q){VP(ex+q[0]*sc,ay+q[1]*sc,'#ff2a14',.45*pu)});[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(q){VP(ex+q[0]*sc,ay+q[1]*sc,'#ff200c',.2*pu)})});
    A.hands.forEach(function(hd,hn){var hx=ox+hd[0]*sc,hy=oy+(hd[1]+dy)*sc,hp=.8+.2*Math.sin((t+hn*700)/420),R=10;
      for(var hi=-R;hi<=R;hi++)for(var hj=-R;hj<=R;hj++){var hr=Math.sqrt(hi*hi+hj*hj);if(hr>R+.2)continue;VP(hx+hi,hy+hj,hr<2.5?'#f0e6ff':hr<4.8?'#b48cff':hr<7.4?'#8050ff':'#5a2ad0',hp*(hr<2.5?1:hr<4.8?.8:hr<7.4?.5:.28)*(1-hr/(R+2.5)))}
      var mp=Math.floor((t+hn*400)/190)%9;if(mp<3)VP(hx+Math.round(Math.sin((t+hn*300)/110)*3),hy-4-mp*2,'#e6dcff',.9)})}
  else if(A.fx==='eye'){/* 綠龍：藍眼發光（跟新圖的藍眼睛同色） */var pu=.75+.25*Math.sin(t/260);VP(ax,ay,'#c8f4ff',pu);[[-1,0],[1,0],[0,-1],[0,1]].forEach(function(o){VP(ax+o[0]*sc,ay+o[1]*sc,'#3ab8ff',.5*pu)});[[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]].forEach(function(o){VP(ax+o[0]*sc,ay+o[1]*sc,'#1a7aff',.22*pu)})}
  else if(A.fx==='drool'){/* dw = 口水寬幾格、dl = 最長幾格（蠕蟲嘴大，口水比較粗長） */var c2=t%2600,DL=A.dl||3,dr=function(ax){if(c2<1300){var len=1+Math.floor(c2/1300*DL);for(var j=0;j<len;j++)VP(ax,ay+1+j,'#d8ecf4',.85);VP(ax,ay+len,'#ffffff',.9)}
    else if(c2<1900){var u2=(c2-1300)/600,yy=ay+DL+1+u2*u2*(m.gy-ay-DL-1);VP(ax,yy,'#d8ecf4',.9);VP(ax,yy+1,'#ffffff',.7)}
    else if(c2<2150){var u3=(c2-1900)/250;VP(ax-1,m.gy-1,'#d8ecf4',.6*(1-u3));VP(ax+1,m.gy-1,'#d8ecf4',.6*(1-u3))}};for(var dq=0;dq<(A.dw||1);dq++)dr(ax+dq)}
  else if(A.fx==='sand'){/* 沙蟲：沙子從嘴巴左、下、右三處隨機零星落下（每顆每輪重新抽位置），偏灰白的沙色 */var SP=[[4,12],[7,16],[12,17],[17,16],[21,13]],wq2=wormSq(now,m.ph);for(var sq=0;sq<7;sq++){var per2=1300+sq*170,cyc2=Math.floor((t+sq*397)/per2),su=((t+sq*397)%per2)/per2;if(hsh(cyc2,sq)<.35)continue;var sp0=SP[Math.floor(hsh(cyc2,sq+40)*SP.length)],bx2=m.lx+(sp0[0]-MZ[0]/2)*sc*wq2[0],by2=m.gy-(MZ[1]-sp0[1])*sc*wq2[1],dr=(hsh(cyc2,sq+80)-.5)*4,sxx=bx2+dr*su,syy=by2+su*su*(m.gy-by2);
    VP(sxx,syy,sq%3===0?'#f6ecd2':sq%3===1?'#d6c29a':'#9a8460',.95);if(su>.92){VP(sxx-1,m.gy-1,'#d6c29a',.6);VP(sxx+1,m.gy-1,'#d6c29a',.6)}}}
  else if(A.fx==='tongue'){var c3=t%2200,fl=function(s0){var u=(c3-s0)/260;return u<0||u>1?0:Math.sin(u*Math.PI)},n2=Math.round(Math.max(fl(0),fl(320))*3);for(var q=1;q<=n2;q++)VP(ax-q,ay,'#d8344a',1);if(n2>=2){VP(ax-n2-1,ay-1,'#d8344a',1);VP(ax-n2-1,ay+1,'#d8344a',1)}}})()}
function idle(ctx,u,m,now){pctx=ctx;U=u;m.alive=m.alive!==false;m.act=m.act||0;try{idleOne(m,now)}catch(e){}ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over'}

var IMGF0={monster_01:'monsters/monster_01.png',monster_02:'monsters/monster_02.png',monster_02_blink:'monsters/monster_02_blink.png',
  monster_03:'monsters/monster_03.png?v=3',monster_03_blink:'monsters/monster_03_blink.png?v=2',monster_boss_01:'monsters/monster_boss_01.png',monster_boss_01_blink:'monsters/monster_boss_01_blink.png',
  monster_04:'monsters/monster_04.png',monster_05:'monsters/monster_05.png',monster_06:'monsters/monster_06.png?v=2',monster_boss_02:'monsters/monster_boss_02.png?v=5',
  monster_07:'monsters/monster_07.png?v=1',monster_08:'monsters/monster_08.png?v=1',monster_08_blink:'monsters/monster_08_blink.png?v=1',monster_09:'monsters/monster_09.png?v=2',
  monster_10_a:'monsters/monster_10_a.png?v=1',monster_10_b:'monsters/monster_10_b.png?v=1',monster_11:'monsters/monster_11.png?v=1',monster_11_blink:'monsters/monster_11_blink.png?v=1',monster_12:'monsters/monster_12.png?v=1',monster_12_blink:'monsters/monster_12_blink.png?v=1',monster_14:'monsters/monster_14.png?v=1',monster_boss_06:'monsters/monster_boss_06.png?v=1',monster_boss_05:'monsters/monster_boss_05.png?v=1',monster_25:'monsters/monster_25.png?v=1',monster_22:'monsters/monster_22.png?v=1',monster_23:'monsters/monster_23.png?v=1',monster_24:'monsters/monster_24.png?v=1',monster_26:'monsters/monster_26.png?v=1',monster_27:'monsters/monster_27.png?v=1',monster_28:'monsters/monster_28.png?v=1',monster_boss_07:'monsters/monster_boss_07.png?v=1',monster_boss_08:'monsters/monster_boss_08.png?v=1',monster_29:'monsters/monster_29.png?v=1',monster_boss_09:'monsters/monster_boss_09.png?v=1',monster_30:'monsters/monster_30.png?v=1',monster_boss_10:'monsters/monster_boss_10.png?v=1',monster_21:'monsters/monster_21.png?v=1',monster_20:'monsters/monster_20.png?v=1',monster_19:'monsters/monster_19.png?v=1',monster_19_blink:'monsters/monster_19_blink.png?v=1',monster_19_tongue:'monsters/monster_19_tongue.png?v=1',monster_18:'monsters/monster_18.png?v=1',monster_boss_04:'monsters/monster_boss_04.png?v=5',monster_boss_04_blink:'monsters/monster_boss_04_blink.png?v=5',monster_boss_04_tc:'monsters/monster_boss_04_tc.png?v=2',monster_17:'monsters/monster_17.png?v=1',monster_16:'monsters/monster_16.png?v=1',monster_15:'monsters/monster_15.png?v=1',monster_13:'monsters/monster_13.png?v=1',monster_13_blink:'monsters/monster_13_blink.png?v=1',monster_boss_03:'monsters/monster_boss_03.png?v=2',claw:'vfx/claw.png?v=1',blood_slash:'vfx/blood_slash.png?v=1'};
var IMGF={};Object.keys(IMGF0).forEach(function(k){if(/^monster/.test(k))IMGF[k]=IMGF0[k]});
function loadPx(src){return new Promise(function(res){var im=new Image();im.onload=function(){res(im)};im.onerror=function(){res(null)};im.src=src})}
var ready=null;
function load(BASE){if(ready)return ready;var ks=Object.keys(IMGF);ready=Promise.all(ks.map(function(k){return loadPx(BASE+IMGF[k])})).then(function(a){var I=IMG;ks.forEach(function(k,i){I[k]=a[i]});
function cropSl(m){if(!m)return null;var c=document.createElement('canvas');c.width=c.height=40;var x=c.getContext('2d');x.drawImage(m,0,0);var d=x.getImageData(0,0,40,40).data,x0=40,y0=40,x1=-1,y1=-1;for(var y=0;y<40;y++)for(var xx=0;xx<40;xx++)if(d[(y*40+xx)*4+3]>0){if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(y<y0)y0=y;if(y>y1)y1=y}
    var w=x1-x0+1,h=y1-y0+1,c2=document.createElement('canvas');c2.width=w;c2.height=h;c2.getContext('2d').drawImage(c,x0,y0,w,h,0,0,w,h);return c2.toDataURL()}
  SLIME=cropSl(I.monster_01);PSLIME=cropSl(I.monster_16)||SLIME;
  SKI[0]=I.monster_02;SKI[1]=I.monster_02_blink;layInit('gob',I.monster_03,I.monster_03_blink);layInit('orc',I.monster_boss_01,I.monster_boss_01_blink);layInit('gobw',I.monster_08,I.monster_08_blink);layInit('golem',I.monster_11,I.monster_11_blink);layInit('cgolem',I.monster_12,I.monster_12_blink);layInit('spider',I.monster_13,I.monster_13_blink);layInit('troll',I.monster_17,null);layInit('osiris',I.monster_boss_06,null);layInit('sdragon',I.monster_boss_05,null);layInit('croc',I.monster_22,null);layInit('jackal',I.monster_23,null);layInit('gorgon',I.monster_24,null);layInit('ydragon',I.monster_26,null);layInit('fydragon',I.monster_27,null);layInit('iydragon',I.monster_29,null);layInit('lydragon',I.monster_30,null);layInit('scorpion',I.monster_21,null);layInit('mummy',I.monster_20,null);layInit('sandsnake',I.monster_19,I.monster_19_blink);LAY.sandsnake.tg=I.monster_19_tongue;
  Object.keys(ANI).forEach(function(k){ANI[k].im=I[ANI[k].f]});Object.keys(FLY).forEach(function(k){FLY[k].im=FLY[k].f.map(function(f){return I[f]})});
  return true});return ready}
function lift(k,now,ph){return FLY[k]?flyLift(k,now,ph):FLOAT[k]?floatLift(k,now,ph):0}
function squash(k,now,ph){if(k==='slime'||k==='pslime'){var b=Math.sin(now/260+ph);return[1-b*.03,1+b*.05]}if(WORMS[k])return wormSq(now,ph);return null}
g.Monsters={idle:idle,load:load,src:msrc,size:msz,lift:lift,squash:squash,scale:function(k){return mscale(k,false)},glow:monGlow,fly:function(k){return !!FLY[k]}};
})(this);

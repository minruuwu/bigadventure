/* 劇情播放器：全畫面蓋在頁面上，播 assets/data/story/<id>.json 的劇本（格式見該檔的 note）
   Story.play({
     id:'prologue', base:'../assets/', v:版本,
     name:玩家姓名, hero:主角外觀（Doll.draw 用的 look），
     battle:function(kind){ return Promise }  // 劇本走到 ["battle",kind]：隱藏劇情、交給頁面打戰鬥，打贏後 resolve
     onJoin:function(npcId){}                // ["join",npc01]
     onDone:function(skipped,ch){}           // 播完或跳過；ch = 劇本 ["choice",key,…] 選到的值 {key:標籤, key_v:值}
   })
   需要先載入 common/doll.js、common/npc.js（NPC.load 完成）；有 common/music.js 就會放音樂。 */
(function(g){
'use strict';
var CSS='.sty{position:fixed;inset:0;z-index:9000;background:#0b0a0d;color:#ece4d6;font-family:"PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;overflow-y:auto;-webkit-user-select:none;user-select:none;cursor:pointer}'+
'.sty[hidden]{display:none!important}'+
'.sty-w{max-width:460px;margin:0 auto;display:flex;flex-direction:column;gap:10px;padding:calc(12px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) calc(16px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}'+
'.sty-h{display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:30px}.sty-t{font-size:14px;font-weight:700;color:#e7c26b;letter-spacing:.06em}'+
'.sty-skip{font:inherit;font-size:12px;color:#ece4d6;background:#3d2414;border:2px solid #6e4528;padding:4px 12px;cursor:pointer}'+
'.sty-st{position:relative;border:3px solid #6e4528;box-shadow:0 0 0 2px #2a1709;background:#000;line-height:0;cursor:pointer}'+
'.sty-st canvas{width:100%;height:auto;image-rendering:pixelated;display:block}'+
'.sty-n{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 22px;text-align:center;white-space:pre-line;line-height:1.9;font-size:15px;color:#ece6dc;letter-spacing:.05em;opacity:0;transition:opacity .5s;pointer-events:none}'+
'.sty-n.on{opacity:1}.sty-n.tt{font-size:18px;color:#e7c26b;letter-spacing:.12em}'+
'.sty-d{position:relative;padding-top:40px;overflow:hidden;transition:opacity .35s;cursor:pointer}.sty-d.off{opacity:0;pointer-events:none}'+
'.sty-pt{position:absolute;bottom:-32px;width:128px;height:128px;image-rendering:pixelated;pointer-events:none;z-index:2;transition:filter .2s steps(2)}'+
'.sty-pl{left:-16px}.sty-pr{right:-16px}.sty-pt.idle{filter:grayscale(1) brightness(.62)}'+
'.sty-b{position:relative;z-index:1;background:#0c0a09;color:#f2ede6;border:3px solid #6e4528;box-shadow:0 0 0 2px #2a1709,inset 0 0 0 2px #3d2414,inset 0 0 0 3px #9a6a3e;padding:8px 84px;height:84px;display:flex;flex-direction:column;gap:2px}'+
'.sty-nm{font-weight:700;font-size:14px;color:#d39a5c;min-height:1.2em}.sty-b.r .sty-nm{text-align:right}'+
'.sty-l{font-size:14px;line-height:1.55;min-width:0;height:4.65em;overflow:hidden}'+
'.sty-nx{position:absolute;right:88px;bottom:4px;font-size:11px;color:#b07a45;animation:stybob 1s steps(2) infinite}'+
'.sty-d.narr .sty-pt{visibility:hidden}.sty-d.narr .sty-b{padding:10px 16px}.sty-d.narr .sty-nm{display:none}.sty-d.narr .sty-l{color:#cfc6b8}.sty-d.narr .sty-nx{right:12px}'+
'.sty-d.noL .sty-pl,.sty-d.noR .sty-pr{visibility:hidden}'+
'@keyframes stybob{50%{transform:translateY(2px)}}'+
'.sty-cf{position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px}'+
'.sty-cf>div{background:#0c0a09;border:3px solid #6e4528;box-shadow:0 0 0 2px #2a1709,inset 0 0 0 2px #3d2414;padding:16px 18px;max-width:320px;display:flex;flex-direction:column;gap:12px;font-size:14px;line-height:1.6}'+
'.sty-cf .r{display:flex;gap:8px;justify-content:flex-end}.sty-cf button{font:inherit;font-size:13px;color:#ece4d6;background:#3d2414;border:2px solid #6e4528;padding:5px 14px;cursor:pointer}'+
'.sty-ch{position:fixed;inset:0;z-index:9050;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;cursor:default}'+
'.sty-ch>div{background:#0c0a09;border:3px solid #6e4528;box-shadow:0 0 0 2px #2a1709,inset 0 0 0 2px #3d2414;padding:14px;max-width:340px;width:100%;display:flex;flex-direction:column;gap:10px}'+
'.sty-ch h4{margin:0;font-size:14px;color:#e7c26b;text-align:center;letter-spacing:.06em}.sty-ch .g{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}'+
'.sty-ch button{font:inherit;font-size:12px;color:#ece4d6;background:#2a1709;border:2px solid #6e4528;padding:6px 2px 4px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px}.sty-ch button:hover,.sty-ch button:focus-visible{border-color:#e7c26b;outline:none}'+
'.sty-ch img{width:32px;height:38px;image-rendering:pixelated}'+
'@media (prefers-reduced-motion:reduce){.sty-nx{animation:none}}';
var SW=418,SH=235,BANDH=140,B4=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
var FR=['#5a1e12','#8c3418','#c0561f','#e08030','#f2aa4c','#ffd27e','#fff0c4'];
function mk(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
function loadImg(src){return new Promise(function(res){var im=new Image();im.onload=function(){res(im)};im.onerror=function(){res(null)};im.src=src})}
function anim(ms,fn){return new Promise(function(res){var t0=performance.now();(function f(t){var u=Math.min(1,(t-t0)/Math.max(1,ms));fn(u);if(u<1)requestAnimationFrame(f);else res()})(t0)})}
var sleep=function(ms){return new Promise(function(r){setTimeout(r,ms)})};
/* 長句自動分格：超過 40 字就在句末標點處切開 */
function splitLong(t,max){max=max||40;if(t.length<=max)return[t];var out=[],cur='';(t.match(/[^。！？]+[。！？」]*|[^。！？]+$/g)||[t]).forEach(function(seg){if(cur&&(cur+seg).length>max){out.push(cur);cur=seg}else cur+=seg});if(cur)out.push(cur);return out}
var cssOn=false;
function play(o){
  if(!cssOn){var st=el('style');st.textContent=CSS;document.head.appendChild(st);cssOn=true}
  var base=o.base||'../assets/',q=o.v?'?v='+o.v:'';
  return Promise.all([fetch(base+'data/story/'+o.id+'.json'+q).then(function(r){if(!r.ok)throw new Error('劇本讀取失敗');return r.json()})]).then(function(r){var doc=r[0],bgs=doc.bg||{},keys=Object.keys(bgs);
    return Promise.all(keys.map(function(k){return loadImg(base+'story/'+bgs[k]+q)})).then(function(ims){var IMG={};keys.forEach(function(k,i){IMG[k]=ims[i]});return run(o,doc,IMG)})})}
function run(o,doc,IMG){return new Promise(function(done){
  var root=el('div','sty'),w=el('div','sty-w'),hd=el('div','sty-h'),tt=el('span','sty-t',doc.title||''),sk=el('button','sty-skip','跳過');sk.type='button';hd.appendChild(tt);hd.appendChild(sk);
  var st=el('div','sty-st'),cv=mk(SW,SH),narr=el('div','sty-n');st.setAttribute('role','button');st.tabIndex=0;st.appendChild(cv);st.appendChild(narr);
  var dw=el('div','sty-d off'),pL=mk(32,32),pR=mk(32,32),bx=el('div','sty-b'),who=el('div','sty-nm'),line=el('div','sty-l'),nx=el('div','sty-nx','▼');
  pL.className='sty-pt sty-pl';pR.className='sty-pt sty-pr';dw.setAttribute('role','button');dw.tabIndex=0;bx.appendChild(who);bx.appendChild(line);bx.appendChild(nx);dw.appendChild(pL);dw.appendChild(pR);dw.appendChild(bx);
  w.appendChild(hd);w.appendChild(st);w.appendChild(dw);root.appendChild(w);document.body.appendChild(root);
  var cx=cv.getContext('2d'),lx=pL.getContext('2d'),rx=pR.getContext('2d'),f48=mk(48,48);[cx,lx,rx].forEach(function(c){c.imageSmoothingEnabled=false});
  var STEPS=(doc.steps||[]).slice(),pend=[];
  var NM=o.name||'冒險者',M=g.Music;
  /* 狀態 */
  var pic=null,picS=3,picOn=false,picA=0,scene='black',weather='none',rainAmt=0,rainTarget=0,ship=false,bolt=0,nextBolt=0,cam=-1,fadeA=0,xfFrom=null,xfA=0,pc=0,waiting=false,busy=false,heroShown=false,lastNPC=null,alive=true,band=null;
  var drops=[];for(var i=0;i<130;i++)drops.push({x:Math.random()*SW,y:Math.random()*SH,v:6+Math.random()*3,l:9+(Math.random()*7|0)});
  function setWeather(x){weather=x||'none';rainTarget=weather==='storm'?1:weather==='drizzle'?.28:0}
  function buildBand(){var src=IMG.village;band=mk(SW,BANDH);if(!src)return;var t=mk(SW,1).getContext('2d');t.drawImage(src,0,0);var top=t.getImageData(0,0,SW,1).data,b=band.getContext('2d'),d=b.createImageData(SW,BANDH);
    for(var y=0;y<BANDH;y++){var tt2=(y+1)/BANDH;for(var x=0;x<SW;x++){var th=(B4[(y&3)*4+(x&3)]+.5)/16,s=Math.min(1,Math.floor(tt2*10+th)/10),k=(y*SW+x)*4;d.data[k]=top[x*4]*s;d.data[k+1]=top[x*4+1]*s;d.data[k+2]=top[x*4+2]*s;d.data[k+3]=255}}b.putImageData(d,0,0)}
  buildBand();
  /* 爐火：只重新上色艾德蒙家原圖的火焰像素 */
  var FIRE=[];(function(){var im=IMG.house;if(!im)return;var c=mk(SW,SH).getContext('2d');c.drawImage(im,0,0);var d=c.getImageData(0,0,SW,SH).data,L=function(x,y){var k=(y*SW+x)*4;return d[k]*.3+d[k+1]*.59+d[k+2]*.11},inF=function(x,y){return x>=42&&x<=62&&y>=115&&y<=154&&L(x,y)>95};
    for(var y=115;y<=154;y++)for(var x=42;x<=62;x++)if(inF(x,y))FIRE.push({x:x,y:y,l:Math.min(1,(L(x,y)-95)/110),e:!inF(x,y-1)||!inF(x-1,y)||!inF(x+1,y)})})();
  function drawRain(amt,clip){if(amt<=0)return;var n=Math.floor(drops.length*amt);cx.fillStyle=amt>.5?'rgba(150,168,200,.55)':'rgba(160,175,205,.38)';
    for(var i=0;i<n;i++){var d=drops[i];if(clip&&!(d.x>=clip[0]&&d.x<=clip[2]&&d.y>=clip[1]&&d.y<=clip[3]))continue;for(var k=0;k<d.l;k++)cx.fillRect(Math.round(d.x+k/3),Math.round(d.y-k),1,1)}}
  function stepRain(){drops.forEach(function(d){d.y+=d.v;d.x-=d.v/3;if(d.y>SH+6){d.y=-Math.random()*20;d.x=Math.random()*(SW+60)}})}
  function drawShip(a){cx.save();cx.globalAlpha=a;cx.fillStyle='#06060a';cx.beginPath();cx.moveTo(0,SH);for(var x=0;x<=SW;x+=6)cx.lineTo(x,168+Math.sin(x/26)*10+Math.sin(x/9)*3);cx.lineTo(SW,SH);cx.fill();
    cx.translate(222,150);cx.rotate(-.32);cx.beginPath();cx.moveTo(-46,0);cx.lineTo(44,0);cx.lineTo(34,13);cx.lineTo(-38,13);cx.fill();cx.fillRect(-3,-62,3,62);cx.fillRect(-28,-38,2,38);
    cx.beginPath();cx.moveTo(1,-58);cx.lineTo(30,-36);cx.lineTo(18,-14);cx.lineTo(1,-12);cx.fill();cx.beginPath();cx.moveTo(-26,-34);cx.lineTo(-8,-22);cx.lineTo(-26,-10);cx.fill();cx.restore();
    cx.save();cx.globalAlpha=a;cx.fillStyle='#06060a';cx.beginPath();cx.moveTo(150,SH);for(var x2=150;x2<=300;x2+=5)cx.lineTo(x2,158-Math.max(0,22-Math.abs(x2-232)/2.6)+Math.sin(x2/7)*2);cx.lineTo(300,SH);cx.fill();cx.restore()}
  function drawHouse(t){cx.drawImage(IMG.house,0,0);var f=.6+.2*Math.sin(t/90)+.12*Math.sin(t/37),gr=cx.createRadialGradient(51,138,2,51,138,40);gr.addColorStop(0,'rgba(255,140,60,'+(.22*f)+')');gr.addColorStop(1,'rgba(255,120,40,0)');cx.fillStyle=gr;cx.fillRect(5,95,95,80);
    FIRE.forEach(function(p){var n=Math.sin(p.x*1.3+t/110)*.5+Math.sin(p.y*.8+t/65+p.x*.5)*.5,v=p.l*.8+.12+n*(p.e?.3:.18),k=Math.max(0,Math.min(FR.length-1,Math.round(v*(FR.length-1))));cx.fillStyle=FR[k];cx.fillRect(p.x,p.y,1,1)});
    var c=.6+.4*Math.sin(t/55+Math.sin(t/23)),g2=cx.createRadialGradient(213,110,0,213,110,14);g2.addColorStop(0,'rgba(255,200,110,'+(.32*c)+')');g2.addColorStop(1,'rgba(255,180,90,0)');cx.fillStyle=g2;cx.fillRect(196,94,34,34);cx.fillStyle='#ffe2a0';cx.fillRect(213,108+(c>.8?0:1),1,2);
    stepRain();drawRain(.5,[178,34,244,101])}
  function bgImg(s){return s&&s!=='black'&&s!=='house'?IMG[s]||null:null}/* 劇本 bg 裡登記的背景都能用（village、vnight、dawn、forest…） */
  function draw(t){if(rainAmt!==rainTarget&&!busy)rainAmt+=(rainTarget-rainAmt)*.02;cx.fillStyle='#000';cx.fillRect(0,0,SW,SH);
    if(cam>=0){cx.drawImage(band,0,SH-cam);if(IMG.village)cx.drawImage(IMG.village,0,SH+BANDH-cam)}
    else if(scene==='house'&&IMG.house)drawHouse(t);else{var b=bgImg(scene);if(b)cx.drawImage(b,0,0)}
    if(xfFrom&&cam<0){var fb=bgImg(xfFrom);if(fb){cx.save();cx.globalAlpha=xfA;cx.drawImage(fb,0,0);cx.restore()}}
    if(weather==='storm'&&cam<0&&scene==='black'&&t>nextBolt){bolt=t;nextBolt=t+2600+Math.random()*4200}
    if(bolt&&cam<0&&scene==='black'){var dt=t-bolt,a=0;if(dt<90)a=.85;else if(dt<150)a=.15;else if(dt<230)a=.6;else if(dt<700)a=.6*(1-(dt-230)/470);if(a>0){cx.fillStyle='rgba(200,210,235,'+a+')';cx.fillRect(0,0,SW,SH);if(ship)drawShip(Math.min(1,a*1.6))}}
    if(scene!=='house'){stepRain();drawRain(rainAmt)}
    picA+=((picOn?1:0)-picA)*.08;if(pic==='@portal'&&picA>.01)drawPortal(t,picA);else if(pic&&picA>.01){var pw=pic.width*picS,ph=pic.height*picS,px=Math.round(SW/2-pw/2),py=Math.round(SH*.42-ph/2+Math.sin(t/700)*2),gl=.55+.25*Math.sin(t/480),gr=cx.createRadialGradient(SW/2,py+ph/2,4,SW/2,py+ph/2,pw*1.1);
      gr.addColorStop(0,'rgba(235,240,250,'+(.35*gl*picA)+')');gr.addColorStop(1,'rgba(235,240,250,0)');cx.fillStyle=gr;cx.fillRect(px-pw,py-ph,pw*3,ph*3);cx.save();cx.globalAlpha=picA;cx.imageSmoothingEnabled=false;cx.drawImage(pic,px,py,pw,ph);cx.restore()}/* pic：畫面中央的圖（例如神秘的蛋），帶微弱光暈 */
    if(fadeA>0){cx.fillStyle='rgba(0,0,0,'+fadeA+')';cx.fillRect(0,0,SW,SH)}}
  /* 幻境入口（程式畫）：一圈虹彩光環，中間是慢慢旋轉的白、金、粉、紫漩渦（跟地圖上的幻境門同色系） */
  var PTC=mk(48,48),ptx=PTC.getContext('2d');
  function drawPortal(t,a){var N=48,C=24,tt=t/1000;ptx.clearRect(0,0,N,N);var op=Math.min(1,a);for(var y=0;y<N;y++)for(var x=0;x<N;x++){var dx=x+.5-C,dy=(y+.5-C)*1.15,r=Math.sqrt(dx*dx+dy*dy),an=Math.atan2(dy,dx),R=21*Math.min(1,.35+op*.65),col=null;
      if(r<R-2){var v=Math.sin(an*3+r*.42-tt*2.6)*.5+.5,k=1-r/R,wv=v*.6+k*.6;col=wv>1.02?'#ffffff':wv>.86?'#fff3c0':wv>.7?'#ffc8ee':wv>.55?'#ff8ad0':wv>.4?'#c050b0':wv>.25?'#5a1a6a':'#2a0a3a'}
      else if(r<R){var hu=(an/Math.PI/2+tt*.15)%1;col=hu<.25?'#fff3b0':hu<.5?'#b8f4ff':hu<.75?'#ffd0f0':'#d8c0ff'}
      if(col){ptx.fillStyle=col;ptx.fillRect(x,y,1,1)}}
    var px=Math.round(SW/2-48),py=Math.round(SH*.42-48),gr=cx.createRadialGradient(SW/2,SH*.42,6,SW/2,SH*.42,80);gr.addColorStop(0,'rgba(255,220,245,'+(.45*a)+')');gr.addColorStop(1,'rgba(255,180,230,0)');cx.fillStyle=gr;cx.fillRect(SW/2-90,SH*.42-90,180,180);
    cx.save();cx.globalAlpha=a;cx.drawImage(PTC,px,py,96,96);cx.restore();
    for(var i=0;i<14;i++){var l=((t/1000*.6+i*.37)%1),aa=i/14*6.283+t/2400,rr=44+l*18;cx.fillStyle=i%3?'rgba(255,240,255,'+(a*(1-l))+')':'rgba(180,240,255,'+(a*(1-l))+')';cx.fillRect(Math.round(SW/2+Math.cos(aa)*rr),Math.round(SH*.42+Math.sin(aa)*rr*.85),1,1)}}
  function portrait(ctx,lk,t,flip){ctx.clearRect(0,0,32,32);if(!lk||!g.Doll)return;Doll.draw(f48,lk,t);ctx.save();if(flip){ctx.translate(32,0);ctx.scale(-1,1)}ctx.drawImage(f48,8,4,32,32,0,0,32,32);ctx.restore()}
  var heroLook=o.hero?Object.assign({},o.hero,{weapon:null,shield:null,halo:[]}):null,npcLook={};
  function lookOf(id){if(!(id in npcLook))npcLook[id]=g.NPC?NPC.look(id,false):null;return npcLook[id]}
  function loop(t){if(!alive)return;if(!root.hidden){draw(t);portrait(lx,heroLook,t+400,false);portrait(rx,lastNPC?lookOf(lastNPC):null,t+700,true)}requestAnimationFrame(loop)}
  requestAnimationFrame(loop);
  /* 播放 */
  function showNarr(t,title){narr.classList.remove('on');narr.classList.toggle('tt',!!title);setTimeout(function(){narr.textContent=t;narr.classList.add('on')},280)}
  function hideNarr(){narr.classList.remove('on')}
  function showBox(v){dw.classList.toggle('off',!v)}
  function fadeTo(s,op){busy=true;showBox(false);hideNarr();return anim(500,function(u){fadeA=u}).then(function(){scene=s;cam=-1;setWeather(op&&op.weather);rainAmt=rainTarget;return sleep(150)}).then(function(){return anim(600,function(u){fadeA=1-u})}).then(function(){busy=false})}
  function isNpc(sp){return !!(g.NPC&&NPC.get(sp))}
  function fits(t){line.textContent=t;return line.scrollHeight<=line.clientHeight+1}
  /* 依對話框實際寬度分頁：放不下三行就換下一格，盡量在標點處斷開；對白的「」只包在頭尾 */
  function paginate(text,q){var out=[],i=0,n=text.length;while(i<n){var lo=i+1,hi=n,best=i+1;
      while(lo<=hi){var m=(lo+hi)>>1,t=(q&&i===0?'「':'')+text.slice(i,m)+(q&&m===n?'」':'');if(fits(t)){best=m;lo=m+1}else hi=m-1}
      if(best<n){for(var k=best;k>i+Math.floor((best-i)*.45);k--){if('。！？，、…；：」—'.indexOf(text[k-1])>=0){best=k;break}}}
      out.push((q&&i===0?'「':'')+text.slice(i,best)+(q&&best===n?'」':''));i=best}
    return out.length?out:['']}
  function speaker(sp,text){var narrM=sp==='N';dw.classList.toggle('narr',narrM);
    who.textContent=sp==='P'?NM:isNpc(sp)?NPC.get(sp).name:narrM?'':sp;pend=paginate(text,!narrM);line.textContent=pend.shift();
    if(sp==='P')heroShown=true;if(isNpc(sp))lastNPC=sp;var other=!narrM&&sp!=='P'&&!isNpc(sp);
    dw.classList.toggle('noL',!heroShown);dw.classList.toggle('noR',other||!lastNPC);bx.classList.toggle('r',sp!=='P'&&!narrM);
    pL.classList.toggle('idle',sp!=='P');pR.classList.toggle('idle',!isNpc(sp))}
  function next(){
    while(pc<STEPS.length&&alive){var s=STEPS[pc],op=s[2]||{};
      if(s[0]==='mark'||s[0]==='start'){pc++;continue}
      if(s[0]==='scene'){scene=s[1];cam=-1;setWeather(op.weather);rainAmt=rainTarget;pc++;continue}
      if(s[0]==='pic'){if(s[1]==='@portal'){pic='@portal';picOn=true}else if(s[1]&&IMG[s[1]]){pic=IMG[s[1]];picS=op.s||3;picOn=true}else picOn=false;pc++;continue}
      if(s[0]==='choice'){showBox(false);hideNarr();busy=true;askChoice(s[1],op).then(function(){busy=false;pc++;next()});return}
      if(s[0]==='bgm'){if(M)M.play(s[1],s[2]||1500);pc++;continue}
      if(s[0]==='bgmfade'){if(M)M.fade(s[1]||1500);pc++;continue}
      if(s[0]==='join'){if(o.onJoin)o.onJoin(s[1]);pc++;continue}
      if(s[0]==='stage'){showBox(false);if('ship' in op)ship=op.ship;if(op.bolt)setTimeout(function(){bolt=performance.now()},350);showNarr(fill(String(s[1])));waiting=true;return}
      if(s[0]==='notice'){showBox(false);showNarr('✦ '+fill(String(s[1]))+' ✦',true);waiting=true;return}
      if(s[0]==='say'){hideNarr();showBox(true);speaker(s[1],fill(String(s[2])));waiting=true;return}
      if(s[0]==='pan'){busy=true;hideNarr();sleep(600).then(function(){ship=false;var H=SH+BANDH;return anim(4200,function(u){var e=u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;cam=Math.round(e*H);rainAmt=1-(1-.28)*e})}).then(function(){scene='village';cam=-1;setWeather('drizzle');rainAmt=rainTarget;busy=false;pc++;next()});return}
      if(s[0]==='fade'){fadeTo(s[1],op).then(function(){pc++;next()});return}
      if(s[0]==='xfade'){busy=true;showBox(false);xfFrom=scene;scene=s[1];anim(s[2]||3000,function(u){xfA=1-u}).then(function(){xfFrom=null;busy=false;pc++;next()});return}
      if(s[0]==='battle'){showBox(false);hideNarr();busy=true;root.hidden=true;var p=o.battle?o.battle(s[1]):Promise.resolve();Promise.resolve(p).then(function(){root.hidden=false;scene='black';setWeather('none');rainAmt=0;busy=false;pc++;next()});return}
      if(s[0]==='end')break;
      pc++}
    finish(false)}
  /* 劇本變數：{name} 玩家名字、{key} = ["choice",key] 選到的標籤 */
  var CH={};function fill(x){return x.replace(/\{(\w+)\}/g,function(m,k){return k==='name'?NM:CH[k]!=null?CH[k]:m})}
  function askChoice(key,op){return new Promise(function(res){var ov=el('div','sty-ch'),bx2=el('div'),g2=el('div','g');if(op.title)bx2.appendChild(el('h4',null,op.title));
    (op.opts||[]).forEach(function(c){var b=el('button');b.type='button';if(c[2]){var im=el('img');im.src=(o.base||'../assets/')+c[2];im.alt='';b.appendChild(im)}b.appendChild(el('span',null,c[1]));b.addEventListener('click',function(ev){ev.stopPropagation();CH[key]=c[1];CH[key+'_v']=c[0];ov.remove();res()});g2.appendChild(b)});
    bx2.appendChild(g2);ov.appendChild(bx2);ov.addEventListener('click',function(ev){ev.stopPropagation()});root.appendChild(ov)})}
  function advance(){if(busy||!waiting)return;if(pend.length){line.textContent=pend.shift();return}waiting=false;pc++;next()}
  function finish(skipped){if(!alive)return;alive=false;root.remove();if(o.onDone)o.onDone(!!skipped,CH);done(!!skipped)}
  /* 劇情中點畫面任何地方都能前進（跳過按鈕與確認視窗除外） */
  root.addEventListener('click',function(ev){if(ev.target.closest&&ev.target.closest('.sty-skip,.sty-cf'))return;advance()});
  function onKey(ev){if(!alive){document.removeEventListener('keydown',onKey);return}if(root.hidden)return;if(ev.key==='Enter'||ev.key===' '){if(ev.target&&ev.target.closest&&ev.target.closest('.sty-skip,.sty-cf'))return;ev.preventDefault();advance()}}
  document.addEventListener('keydown',onKey);
  sk.addEventListener('click',function(){var cf=el('div','sty-cf'),bxx=el('div'),r=el('div','r'),no=el('button',null,'繼續觀看'),yes=el('button',null,'跳過');no.type=yes.type='button';
    bxx.appendChild(el('div',null,o.skipText||'確定要跳過「'+(doc.title||'劇情')+'」嗎？'));r.appendChild(no);r.appendChild(yes);bxx.appendChild(r);cf.appendChild(bxx);root.appendChild(cf);
    no.onclick=function(){cf.remove()};yes.onclick=function(){cf.remove();(STEPS.filter(function(s){return s[0]==='join'})).forEach(function(s){if(o.onJoin)o.onJoin(s[1])});if(M)M.fade(800);finish(true)}});
  if(o.noSkip)sk.hidden=true;
  next()})}
g.Story={play:play,splitLong:splitLong};
})(window);

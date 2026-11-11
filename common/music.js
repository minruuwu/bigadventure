/* 背景音樂：assets/audio/bgm_<name>.mp3
   - 預設關閉；記事頁的「音樂」開關、音量存在這台瀏覽器（localStorage：music.on、music.vol）
   - Music.play(name, ms)：換曲（交叉淡入淡出），循環播放
   - Music.page(name)：一般頁面用（營地、冒險、角色、鍛造、記事）：換頁時記住播到第幾秒，下一頁從同一秒接著播
   - Music.fade(ms)：淡出後停止；Music.stop()：馬上停止
   - 手機瀏覽器要玩家點過畫面才能出聲：被擋時會等下一次點擊再播 */
(function(g){
'use strict';
var BASE='../assets/',TR={},cur=null,curName='',fades=new Map(),pageName='',waitTap=false;
function ls(k,d){try{var v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function isOn(){return ls('music.on','0')==='1'}
function vol(){var v=parseFloat(ls('music.vol','0.7'));return isNaN(v)?0.7:Math.max(0,Math.min(1,v))}
function track(n){if(!TR[n]){var a=new Audio(BASE+'audio/bgm_'+n+'.mp3');a.loop=true;a.preload='auto';TR[n]=a}return TR[n]}
function anim(ms,fn){return new Promise(function(res){var t0=performance.now();(function f(t){var u=Math.min(1,(t-t0)/Math.max(1,ms));fn(u);if(u<1)requestAnimationFrame(f);else res()})(t0)})}
function fadeVol(a,to,ms,then){var tok={};fades.set(a,tok);var v0=a.volume;anim(ms,function(u){if(fades.get(a)===tok)a.volume=Math.max(0,Math.min(1,v0+(to-v0)*u))}).then(function(){if(fades.get(a)===tok&&then)then()})}
function tryPlay(a){var p=a.play();if(p&&p.catch)p.catch(function(){if(waitTap)return;waitTap=true;var go=function(){waitTap=false;document.removeEventListener('pointerdown',go,true);document.removeEventListener('keydown',go,true);if(cur===a&&isOn())a.play().catch(function(){})};document.addEventListener('pointerdown',go,true);document.addEventListener('keydown',go,true)})}
function play(name,ms,from){ms=ms==null?800:ms;var n=track(name);
  if(cur&&cur!==n){var o=cur;fadeVol(o,0,ms,function(){o.pause()})}
  if(cur===n&&!n.paused){fadeVol(n,vol(),ms);return}
  cur=n;curName=name;if(!isOn())return;
  try{n.currentTime=from||0}catch(e){}n.volume=0;tryPlay(n);fadeVol(n,vol(),ms)}
function fade(ms){if(!cur)return;var o=cur;cur=null;curName='';fadeVol(o,0,ms==null?1500:ms,function(){o.pause()})}
function stop(){Object.keys(TR).forEach(function(k){fades.delete(TR[k]);TR[k].pause()});cur=null;curName=''}
/* 一般頁面：同一首換頁時接著播 */
function posKey(n){return 'music.pos.'+n}
function savePos(){if(!pageName||!cur||curName!==pageName)return;try{sessionStorage.setItem(posKey(pageName),JSON.stringify({t:cur.currentTime,at:Date.now()}))}catch(e){}}
function page(name){pageName=name;var from=0;try{var o=JSON.parse(sessionStorage.getItem(posKey(name))||'null');if(o&&o.t>=0){var d=track(name).duration;from=o.t+(Date.now()-o.at)/1000;if(d>0)from=from%d}}catch(e){}play(name,600,from)}
/* 劇情、戰鬥播別首曲子之後，回到頁面音樂 */
function back(ms){if(pageName)play(pageName,ms==null?1200:ms)}
function setOn(v){lsSet('music.on',v?'1':'0');if(!v){Object.keys(TR).forEach(function(k){TR[k].pause()})}else if(cur){cur.volume=vol();tryPlay(cur)}else if(pageName)page(pageName)}
function setVol(v){lsSet('music.vol',String(v));if(cur&&!fades.has(cur))cur.volume=vol();else if(cur)cur.volume=vol()}
function init(base){if(base)BASE=base}
g.addEventListener('pagehide',savePos);
document.addEventListener('visibilitychange',function(){if(!cur)return;if(document.hidden){savePos();cur.pause()}else if(isOn())tryPlay(cur)});
setInterval(savePos,2000);
g.Music={init:init,play:play,fade:fade,stop:stop,page:page,back:back,isOn:isOn,setOn:setOn,vol:vol,setVol:setVol,current:function(){return curName}};
})(window);

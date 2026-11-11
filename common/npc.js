/* NPC 同伴：讀 assets/data/npc_info.csv，提供
   - NPC.load(base, v)            讀資料表與圖（base = 指到 assets/ 的路徑）
   - NPC.get(id) / NPC.list()     NPC 資料
   - NPC.on(me, id)               這位玩家是否已解鎖這位 NPC（劇情加入過）
   - NPC.player(id, me)           給戰鬥引擎用的「假玩家資料」：等級 = 主角人物等級、每級屬性自動分配、
                                  武器等級 = 人物等級（上限 w_max_lv）、固定減傷與抗性、技能依人物等級學會
   - NPC.look(id, withWeapon)     給 Doll.draw 用的外觀（身體＋眼睛圖層，可帶武器）
   - NPC.groups(id)               技能組（黑魔法、白魔法、禁咒…）：[{n, ids:[skill_id…]}]
   - NPC.cfg(me, id)              這位玩家替 NPC 設定的技能與符文（players/{uid}.npcs.<id>）
   NPC 的資料存在玩家自己的文件：npcs.<id> = {on, skills:{combat,reaction,passive}, ench:[…]}；入隊名單 npcParty = [id…] */
(function(g){
'use strict';
var ROWS=[],BY={},IMG={},ready=null;
function parseCSV(t){t=String(t||'').replace(/^﻿/,'');var rows=[],row=[],f='',q=false;
  for(var i=0;i<t.length;i++){var c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(f);rows.push(row);row=[];f=''}else f+=c}
  if(f!==''||row.length){row.push(f);rows.push(row)}
  var h=rows.shift()||[];return rows.filter(function(r){return r.some(function(x){return String(x).trim()!==''})}).map(function(r){var o={};h.forEach(function(k,j){o[k.trim()]=(r[j]==null?'':String(r[j])).trim()});return o})}
function num(x){var v=parseFloat(String(x==null?'':x).replace('%',''));return isNaN(v)?0:v}
function pn(x){var s=String(x==null?'':x);return /%/.test(s)?num(s)/100:num(s)}
function loadImg(src){return new Promise(function(res){var im=new Image();im.onload=function(){res(im)};im.onerror=function(){res(null)};im.src=src})}
function build(r){
  var skills=String(r.skills||'').split(';').map(function(s){var q=s.trim().split('@');return q[0]?{id:q[0].trim(),lv:parseInt(q[1],10)||1,g:(q[2]||'').trim()}:null}).filter(Boolean);
  var fixed={};String(r.fixed_stats||'').split(';').forEach(function(s){var q=s.split(':');if(q[0]&&q[1]!=null)fixed[q[0].trim()]=pn(q[1].trim())});
  var w=[];for(var i=1;i<=6;i++){if(r['w_stat_'+i])w.push({stat:r['w_stat_'+i],per:r['w_per_level_'+i]})}
  return{id:r.npc_id,name:r.npc_name,job:r.job_name||'',frame:r.frame||'',body:r.body,eyes:r.eyes,weapon:r.weapon||'',wimg:r.weapon_img||'',battle:r.battle==='1',
    lv:{str:num(r.lv_str),int:num(r.lv_int),agi:num(r.lv_agi),vit:num(r.lv_vit),luk:num(r.lv_luk)},w:w,wmax:parseInt(r.w_max_lv,10)||100,fixed:fixed,skills:skills,
    def:String(r.default_combat||'').split(';').map(function(s){return s.trim()}).filter(Boolean),desc:r.npc_desc||''}}
function load(base,v){if(ready)return ready;var q=v?'?v='+v:'';
  ready=fetch(base+'data/npc_info.csv'+q).then(function(x){return x.ok?x.text():''}).catch(function(){return ''}).then(function(t){
    ROWS=parseCSV(t).filter(function(r){return r.npc_id}).map(build);BY={};ROWS.forEach(function(n){BY[n.id]=n});
    return Promise.all(ROWS.map(function(n){return Promise.all([n.body,n.eyes,n.wimg].map(function(f){return f?loadImg(base+'npc/'+f+q):null})).then(function(a){IMG[n.id]={body:a[0],eyes:a[1],weapon:a[2]}})}))}).then(function(){return ROWS});
  return ready}
function get(id){return BY[id]||null}
function list(){return ROWS.slice()}
function cfg(me,id){var c=((me&&me.npcs)||{})[id];return c&&typeof c==='object'?c:{}}
function on(me,id){return !!cfg(me,id).on}
function heroLv(me){return Math.max(1,(me&&me.lv)|0||1)}
/* 技能依人物等級學會：{skill_id: 需要等級} */
function learnMap(n){var o={};n.skills.forEach(function(s){o[s.id]=s.lv});return o}
function groups(id){var n=get(id);if(!n)return[];var o=[],idx={};n.skills.forEach(function(s){if(s.g==='被動'||s.g==='反應')return;if(!(s.g in idx)){idx[s.g]=o.length;o.push({n:s.g,ids:[]})}o[idx[s.g]].ids.push(s.id)});return o}
function kindOf(id,sid){var n=get(id),s=n&&n.skills.filter(function(x){return x.id===sid})[0];return s?s.g:''}
/* 武器：w_stat / w_per_level 照 weapon_info 的 auto_stat 格式，讓引擎直接拿來算 */
function wrow(n){var r={};n.w.forEach(function(x,i){r['auto_stat_'+(i+1)]=x.stat;r['auto_per_level_'+(i+1)]=x.per});return r}
var WKEY={'劍':'weapon01','斧':'weapon02','匕':'weapon03','弓':'weapon04','槍':'weapon05','錘':'weapon06','杖':'weapon07','書':'weapon08'};
function player(id,me){var n=get(id);if(!n)return null;var lv=heroLv(me),c=cfg(me,id),al={};
  Object.keys(n.lv).forEach(function(k){al[k]=Math.round(n.lv[k]*(lv-1))});
  var lm=learnMap(n),sk=c.skills&&typeof c.skills==='object'?c.skills:{},wk=WKEY[n.weapon]||'',ws={};
  var combat=(Array.isArray(sk.combat)&&sk.combat.length?sk.combat:n.def).slice(0,4);
  if(wk)ws[wk]={lv:Math.min(n.wmax,lv),ench:Array.isArray(c.ench)?c.ench.slice(0,3):[]};
  return{uid:'npc:'+id,npc:id,name:n.name,jobSn:id,job:0,lv:lv,alloc:al,jobLv:{},weapon:n.weapon,weapons:ws,rs:(me&&me.rs)||{},pets:{},
    skills:{combat:combat,reaction:sk.reaction||'',passive:Array.isArray(sk.passive)?sk.passive.slice(0,4):[]},
    npcLearn:lm,wrow:wrow(n),npcFix:n.fixed}}
function look(id,withW){var n=get(id),im=IMG[id]||{};if(!n||!im.body)return null;
  var s={npc:{body:im.body,eyes:im.eyes},breath:true};
  if(withW!==false&&im.weapon)s.weapon={img:im.weapon,key:'npc:'+id,cut:1,ox:0,oy:0};
  return s}
function img(id){return IMG[id]||{}}
/* 職業圖示：assets/icons/jobs/framed/<npc_id>.png（各 NPC 自己的框色） */
function icon(base,id,v){return base+'icons/jobs/framed/'+id+'.png'+(v?'?v='+v:'')}
g.NPC={load:load,get:get,list:list,cfg:cfg,on:on,player:player,look:look,groups:groups,kindOf:kindOf,learnMap:learnMap,img:img,icon:icon,heroLv:heroLv,parseCSV:parseCSV};
})(window);

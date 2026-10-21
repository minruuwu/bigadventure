/* 戰棋模式（規格見 docs/tactics.md）
   10×10 地圖、依速度輪流、先移動再出手；普攻與技能共用一套「射程＋範圍」：single 單一格／line 直線貫穿／diamond 菱形。
   數值與結算全部交給 BattleEngine.session（跟自動戰鬥同一份規則），這裡只管站位、移動、選目標、冷卻、召喚站位。
   資料：job_attribute.csv move、monster_info.csv move／atk_range、weapon_info.csv range／area／area_size、
         skill_info.csv range／area／area_size／cost（cost = 冷卻回合）、job_info.csv skill_set（技能組名稱）。
   操作：輪到我方 → 藍格移動 → 走到後（或點自己原地）在人物右邊跳出選單：攻擊／現職技能組／額外技能組／等待／取消移動。
   還沒做：王 3×3、嘲諷／保護 2 格規則、小地圖與縮放、技能特效動畫、獎勵。
   由 battle/index.html 在網址帶 ?tactics=1 時呼叫 Tactics.start(ctx)。 */
(function (root) {
  'use strict';
  var N = 10;
  var STEP_MS = 90, THINK_MS = 320, AFTER_MS = 560;
  var PSPAWN = [[4, 8], [6, 8], [3, 9], [5, 9]];
  var MSPAWN = [[4, 1], [5, 1], [3, 1], [6, 1], [2, 1], [7, 1], [4, 0], [5, 0]];
  var MSPAWN_BOSS = [[6, 1], [2, 1], [6, 3], [2, 3], [7, 2], [1, 2], [8, 1], [0, 1]];
  var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var TYN = { damage: '傷害', heal: '治療', buff: '增益', debuff: '減益' };

  var CSS = '' +
    '#tacv[hidden]{display:none}#tacv{padding-top:env(safe-area-inset-top);padding-bottom:48px}' +
    '.tfx{position:absolute;inset:2px;width:calc(100% - 4px);height:calc(100% - 4px);pointer-events:none;z-index:30;image-rendering:pixelated}' +
    '.tnews{margin-top:8px;min-height:2.9em;padding:5px 10px;font-size:12.5px;line-height:1.45;font-weight:700;color:var(--fg);background:rgba(20,12,8,.86);box-shadow:0 0 0 2px #080503,inset 0 0 0 2px #6b4a2a;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    '.tnews.rd{color:var(--accent)}.tnews.ko{color:#ff9a8a}.tnews.sk{display:block;-webkit-line-clamp:unset;color:var(--fg)}.tnews.sk b{color:var(--gold)}.tnews.sk small{color:var(--dim);font-weight:700}' +
    '.ttop{display:flex;align-items:center;gap:6px;padding:2px 2px 6px}' +
    '.tq{flex:1;min-width:0;display:flex;align-items:center;gap:6px;overflow-x:auto;padding:2px;scrollbar-width:none}.tq::-webkit-scrollbar{display:none}' +
    '.tq>span{flex:none;font-size:11px;color:var(--dim);font-weight:700;margin-right:2px}' +
    '.tqi{flex:none;width:34px;height:34px;position:relative;background:#1a120c;box-shadow:0 0 0 2px #3b2713;display:flex;align-items:center;justify-content:center;overflow:hidden}' +
    '.tqi.p{box-shadow:0 0 0 2px #3f6a2c}.tqi.m{box-shadow:0 0 0 2px #8a2a20}.tqi.now{box-shadow:0 0 0 3px #ffd76a}.tqi.done{opacity:.35}' +
    '.tqi canvas,.tqi img{width:32px;height:32px;image-rendering:pixelated;object-fit:contain}' +
    '.tsb{flex:none;display:flex;flex-direction:column;gap:4px}' +
    '.tsb button{font:inherit;font-weight:900;font-size:11px;line-height:1.2;border:0;background:var(--btn);color:var(--fg);padding:3px 7px;cursor:pointer;box-shadow:0 0 0 2px #1d1008;white-space:nowrap}' +
    '.tsb button.on{background:#c9893f;color:#1d1008}.tsb button:disabled{opacity:.4;cursor:default}' +
    '.tb{position:relative;width:100%;aspect-ratio:1;background:#2a2119 no-repeat;image-rendering:pixelated;box-shadow:0 0 0 2px var(--edge),inset 0 0 0 2px var(--hi);touch-action:manipulation;user-select:none;-webkit-user-select:none}' +
    '.tg{position:absolute;inset:2px;display:grid;grid-template-columns:repeat(10,1fr);grid-template-rows:repeat(10,1fr)}' +
    '.tc{position:relative;border:0;padding:0;margin:0;background:rgba(0,0,0,.06);box-shadow:inset 0 0 0 1px rgba(0,0,0,.28);cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '.tc.k{background:rgba(0,0,0,.14)}' +
    '.tc.mv{background:rgba(47,100,190,.55)}.tc.mv.k{background:rgba(40,88,170,.6)}' +
    '.tc.sr{background:rgba(170,50,35,.32)}' +
    '.tc.rg::after{content:"";position:absolute;inset:2px;box-shadow:inset 0 0 0 2px #d4553f;pointer-events:none}' +
    '.tc.tgt{background:rgba(150,30,20,.55)}.tc.tgt::after{content:"";position:absolute;inset:1px;box-shadow:inset 0 0 0 3px #ff6a50;pointer-events:none}' +
    '.tc.tga{background:rgba(40,140,60,.45)}.tc.tga::after{content:"";position:absolute;inset:1px;box-shadow:inset 0 0 0 3px #7ee08a;pointer-events:none}' +
    '.tc.ar,.tc.ar.k,.tc.ar.mv{background:rgba(225,140,40,.62)}.tc.ar::after{content:"";position:absolute;inset:1px;box-shadow:inset 0 0 0 2px #ffcf6a;pointer-events:none}' +
    '.tc.cur::before{content:"";position:absolute;inset:0;box-shadow:inset 0 0 0 3px #ffd76a;pointer-events:none;z-index:1}' +
    '.tl{position:absolute;inset:2px;pointer-events:none}' +
    '.tu{position:absolute;width:10%;height:10%;transition:left .085s linear,top .085s linear,opacity .4s}' +
    '.tu canvas,.tu img{position:absolute;left:50%;bottom:6%;transform:translateX(-50%);image-rendering:pixelated;pointer-events:none}' +
    '.tu .hp{position:absolute;left:12%;right:12%;bottom:2%;height:4px;background:#1a0d08;box-shadow:0 0 0 1px #080503}.tu .hp i{display:block;height:100%;background:#5fd36a}.tu.m .hp i{background:#e0503a}' +
    '.tu.dead{opacity:0}' +
    '.tu.hit{animation:thit .25s}@keyframes thit{0%,100%{filter:none}40%{filter:brightness(2.2) saturate(0)}}' +
    '.tu.cast{animation:tcast .4s}@keyframes tcast{0%,100%{filter:none}50%{filter:brightness(1.7) drop-shadow(0 0 4px #ffd76a)}}' +
    '.tf{position:absolute;transform:translate(-50%,0);font-size:14px;font-weight:900;color:#fff;text-shadow:1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;pointer-events:none;white-space:nowrap;animation:tfl .9s ease-out forwards;z-index:5}' +
    '.tf.d{color:#ff8a70}.tf.h{color:#8ef09a}.tf.x{color:#c9d4e0;font-size:12px}.tf.s{color:#ffd76a;font-size:12px}' +
    '@keyframes tfl{0%{opacity:0;margin-top:4px}15%{opacity:1;margin-top:0}100%{opacity:0;margin-top:-22px}}' +
    /* 人物旁的指令選單 */
    '.tm{position:absolute;z-index:40;min-width:96px;max-width:58%;background:rgba(20,12,8,.94);box-shadow:0 0 0 2px #080503,inset 0 0 0 2px #6b4a2a,3px 3px 0 rgba(0,0,0,.45);padding:4px;display:flex;flex-direction:column;gap:3px}' +
    '.tm[hidden]{display:none}' +
    '.tm button{font:inherit;text-align:left;border:0;background:#3a2414;color:var(--fg);font-weight:900;font-size:14px;padding:6px 9px;cursor:pointer;line-height:1.2;position:relative;white-space:nowrap}' +
    '.tm button:active{background:#6b4a2a}.tm button:disabled{opacity:.38;cursor:default}' +
    '.tm button small{display:block;font-size:10.5px;font-weight:700;color:#c9b48a}' +
    '.tm button i{position:absolute;top:3px;right:5px;font-style:normal;font-size:10px;color:#ffb39e}' +
    '.tm .tmh{font-size:11px;color:var(--gold);font-weight:900;padding:2px 4px 0}' +
    '.tm .back{background:none;color:var(--dim);font-size:12px;padding:3px 6px}' +
    '.tm .sl{max-height:var(--tmh,260px);overflow-y:auto;display:flex;flex-direction:column;gap:3px}' +
    /* 地圖角落的單位資訊卡、狀態標籤、狀態說明 */
    '.tinfo{position:absolute;top:6px;left:6px;z-index:36;width:min(60%,230px);background:rgba(20,12,8,.93);box-shadow:0 0 0 2px #080503,inset 0 0 0 2px #6b4a2a,3px 3px 0 rgba(0,0,0,.45);padding:7px 9px;font-size:12px;line-height:1.45}' +
    '.tinfo[hidden]{display:none}.tinfo.r{left:auto;right:6px}' +
    '.tinfo .nm{font-weight:900;font-size:14px;display:flex;justify-content:space-between;gap:6px}.tinfo .nm small{color:var(--dim);font-weight:700;font-size:11px}' +
    '.tinfo .x{border:0;background:none;color:var(--dim);font:inherit;font-weight:900;padding:0 2px;cursor:pointer}' +
    '.tinfo .hpl{height:6px;background:#1a0d08;box-shadow:0 0 0 1px #080503;margin:3px 0}.tinfo .hpl i{display:block;height:100%;background:#5fd36a}.tinfo.m .hpl i{background:#e0503a}' +
    '.tinfo .sub{color:var(--dim);font-weight:700}' +
    '.tsts{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}' +
    '.tst{font:inherit;font-size:11px;font-weight:900;border:0;padding:1px 6px;cursor:pointer;line-height:1.5;box-shadow:0 0 0 1px #080503}' +
    '.tst.buff{background:#2f5a2a;color:#d8f5c8}.tst.debuff{background:#6a2420;color:#ffd6cc}.tst.on{outline:2px solid #ffd76a}' +
    '.tpop{position:relative;margin-top:6px;padding:6px 8px;background:#2b1d13;box-shadow:0 0 0 1px #080503,inset 0 0 0 1px #6b4a2a;font-size:12px;font-weight:500;line-height:1.5}' +
    '.tpop::before{content:"";position:absolute;top:-6px;left:var(--ax,14px);border:6px solid transparent;border-top:0;border-bottom-color:#6b4a2a}' +
    '.tpop b{font-weight:900}.tpop .k{font-size:10.5px;font-weight:900;margin-left:6px;padding:0 5px}.tpop .k.buff{background:#2f5a2a;color:#d8f5c8}.tpop .k.debuff{background:#6a2420;color:#ffd6cc}.tpop .t{color:var(--gold);font-weight:900;margin-top:2px}' +
    '.tcard{display:grid;grid-template-columns:44px 1fr;gap:10px;align-items:center}' +
    '.tav{width:44px;height:44px;background:#1a120c;box-shadow:0 0 0 2px #6b4a2a;display:flex;align-items:center;justify-content:center;overflow:hidden}.tav canvas,.tav img{width:42px;height:42px;image-rendering:pixelated;object-fit:contain}' +
    '.tnm{font-weight:900;font-size:15px}.tnm small{font-weight:700;font-size:12px;color:var(--dim);margin-left:6px}' +
    '.thp{height:6px;background:#1a0d08;box-shadow:0 0 0 1px #080503;margin-top:4px}.thp i{display:block;height:100%;background:#5fd36a}.thp.m i{background:#e0503a}' +
    '.thint{font-size:12px;color:var(--gold);margin:0;min-height:1.5em;text-shadow:1px 1px 0 #000;font-weight:700}' +
    '.tres{position:absolute;inset:0;z-index:60;background:rgba(6,4,2,.66);display:flex;align-items:center;justify-content:center;padding:10px}' +
    '#tacv .log{height:150px}';

  /* phase：move = 等玩家移動（或點自己開選單）／menu = 選單開著／sub = 技能組子選單／target = 選好招在點目標 */
  var lastNews = null, infoBox, infoU = null, infoSt = -1, cardSt = -1, PROT = 0, M0 = [], FX = [], fxc, fxx, ctx, S, root$, board, layer, menu, cells, units, order, oi, cur, busy, auto, done, evSeen, raf, lastDraw, loopOn, sel, pend, phase, subSn;

  function $(id) { return document.getElementById(id) }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  function key(x, y) { return x + ',' + y }
  function dist(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) }
  function pos(u) { return [u.tx, u.ty] }
  function living() { return units.filter(function (u) { return !u.dead && u.tx != null }) }
  function foesOf(u) { return living().filter(function (x) { return x.side !== u.side }) }
  function friendsOf(u) { return living().filter(function (x) { return x.side === u.side }) }
  /* 佔地：monster_info.csv size = 3 的王佔 3×3（以中心格 tx, ty 計），其他都 1 格。rad = 中心往外幾格 */
  function rad(u) { if (u._rad == null) u._rad = u.side === 'm' && int((ctx.D.mon[u.mid] || {}).size, 1) >= 3 ? 1 : 0; return u._rad }
  function fpAt(u, x, y) { var r = rad(u), out = []; for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) out.push([x + dx, y + dy]); return out }
  function cellsOf(u) { return fpAt(u, u.tx, u.ty) }
  function inFp(u, x, y) { var r = rad(u); return Math.abs(x - u.tx) <= r && Math.abs(y - u.ty) <= r }
  /* 兩組格子之間最近的曼哈頓距離 */
  function dmin(A, B) { var m = 1e9; A.forEach(function (a) { B.forEach(function (b) { var d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); if (d < m) m = d }) }); return m }
  function udist(a, b) { return dmin(cellsOf(a), cellsOf(b)) }
  function at(x, y) { var r = null; living().forEach(function (u) { if (inFp(u, x, y)) r = u }); return r }
  function onBoard(x, y) { return x >= 0 && y >= 0 && x < N && y < N }
  function int(v, dflt) { var n = parseInt(v, 10); return isNaN(n) ? dflt : n }
  function jobSn(p) { return p.jobSn || ('job' + ('0' + (((p.job | 0) + 1))).slice(-2)) }
  function mine() { return cur && cur.side === 'p' && !auto && !done && !busy }

  /* ---------- 規則：移動 ---------- */
  function moveOf(u) {
    var row = u.side === 'p' ? ctx.D.attr[jobSn(u.p || {})] : ctx.D.mon[u.mid];
    return Math.max(1, int(row && row.move, 4));
  }
  /* 可移動的格子（含原地）：曼哈頓步數、可穿過友軍、不能穿過敵人、不能停在有人的格子。
     3×3 的王以中心格移動：整塊要在地圖內，路上 9 格都不能碰到敵人，停下時 9 格都要沒有別人 */
  function occMap(u) { var m = {}; living().forEach(function (o) { if (o !== u) cellsOf(o).forEach(function (c) { m[key(c[0], c[1])] = o }) }); return m }
  function fits(u, x, y) { return fpAt(u, x, y).every(function (c) { return onBoard(c[0], c[1]) }) }
  function passOk(u, M, x, y) { return fits(u, x, y) && fpAt(u, x, y).every(function (c) { var o = M[key(c[0], c[1])]; return !o || o.side === u.side }) }
  function stopOk(u, M, x, y) { return fits(u, x, y) && fpAt(u, x, y).every(function (c) { return !M[key(c[0], c[1])] }) }
  function reach(u) {
    var mv = moveOf(u), out = {}, q = [[u.tx, u.ty, 0]], seen = {}, M = occMap(u);
    seen[key(u.tx, u.ty)] = 1;
    while (q.length) {
      var c = q.shift();
      if (stopOk(u, M, c[0], c[1])) out[key(c[0], c[1])] = { x: c[0], y: c[1], d: c[2] };
      if (c[2] >= mv) continue;
      DIRS.forEach(function (s) {
        var nx = c[0] + s[0], ny = c[1] + s[1], k = key(nx, ny);
        if (seen[k] || !passOk(u, M, nx, ny)) return;
        seen[k] = 1; q.push([nx, ny, c[2] + 1]);
      });
    }
    return out;
  }
  function pathTo(k, u) {
    var prev = {}, q = [[u.tx, u.ty]], s0 = key(u.tx, u.ty), M = occMap(u); prev[s0] = null;
    while (q.length) {
      var c = q.shift(), ck = key(c[0], c[1]);
      if (ck === k) break;
      DIRS.forEach(function (s) {
        var nx = c[0] + s[0], ny = c[1] + s[1], nk = key(nx, ny);
        if (nk in prev || !passOk(u, M, nx, ny)) return;
        prev[nk] = ck; q.push([nx, ny]);
      });
    }
    var path = [], p = k; while (p && p !== s0) { path.unshift(p.split(',').map(Number)); p = prev[p] }
    return path;
  }

  /* ---------- 規則：射程與範圍（普攻、技能共用） ----------
     act = {id, sk, r: 射程, a: single/line/diamond, s: area_size, side: foe/ally/self, others: 不含自己, cost} */
  function atkAct(u) {
    if (u._atk) return u._atk;
    var D = ctx.D, o;
    if (u.side === 'p') { var w = D.wpn[D.wbyname[u.weapon]] || {}; o = { r: int(w.range, 1), a: w.area || 'single', s: int(w.area_size, 0) } }
    else { var m = D.mon[u.mid] || {}; o = { r: int(m.atk_range, 1), a: 'single', s: 0 } }
    o.r = Math.max(1, o.r); o.id = 'atk'; o.sk = D.SK.atk; o.side = 'foe'; o.cost = 0;
    if (o.a === 'diamond' && !o.s) o.s = 1;
    return (u._atk = o);
  }
  function skAct(u, id) {
    if (id === 'atk') return atkAct(u);
    u._acts = u._acts || {}; if (u._acts[id]) return u._acts[id];
    var sk = ctx.D.SK[id]; if (!sk) return null;
    var w = sk.raw || {}, t = sk.t, wide = t === 'enemy_all' || t === 'ally_all' || t === 'ally_others';
    var side = t === 'self' ? 'self' : /^ally/.test(t) ? 'ally' : 'foe';
    /* 空白時：range → 自身 0、我方 3、其他跟普攻；area → 全體類 diamond 2、其他 single */
    var r = int(w.range, side === 'self' ? 0 : side === 'ally' ? 3 : atkAct(u).r);
    var a = w.area || (wide ? 'diamond' : 'single');
    var s = int(w.area_size, a === 'diamond' ? 2 : 0);
    return (u._acts[id] = { id: id, sk: sk, r: Math.max(0, r), a: a, s: s, side: side, others: t === 'ally_others', cost: Math.max(0, int(w.cost, 0)) });
  }
  /* 玩家的技能組：現職 + 額外一組（skills.extra，另一個職業）；只列已學會的戰鬥技能，依學會等級排 */
  function setsOf(u) {
    if (u.side !== 'p') return [];
    var p = u.p || {}, js = jobSn(p), ex = p.skills && typeof p.skills.extra === 'string' ? p.skills.extra : '', out = [];
    [js, ex].forEach(function (sn) {
      if (!sn || out.some(function (o) { return o.sn === sn })) return;
      var L = (u.learned || []).filter(function (k) { return k.j === sn }).slice().sort(function (a, b) { return a.lv - b.lv });
      if (sn === ex && !L.length) return;
      var row = (ctx.jobs || {})[sn] || {};
      out.push({ sn: sn, name: row.skill_set || row.job_name || '技能', ids: L.map(function (k) { return k.id }) });
    });
    return out;
  }
  /* 這個單位可以選的招：玩家 = 普攻 + 兩組技能；怪物 = 普攻 + 技能循環裡的招 */
  function actsOf(u) {
    var ids = u.side === 'p' ? [].concat.apply([], setsOf(u).map(function (o) { return o.ids })) : (u.cycle || []).filter(function (x, i, a) { return x !== 'atk' && a.indexOf(x) === i });
    return ['atk'].concat(ids).map(function (id) { return skAct(u, id) }).filter(Boolean);
  }
  function cdOf(u, id) { return (u.cd && u.cd[id]) || 0 }
  function usable(u, a) { return a.id === 'atk' || (!S.ctrl(u, 'seal') && cdOf(u, a.id) <= 0) }
  /* 這招能作用的對象（還沒看射程） */
  function pool(u, a) {
    if (a.side === 'self') return [u];
    var L = a.side === 'foe' ? foesOf(u).filter(function (t) { return !S.banished(t) }) : friendsOf(u);
    if (a.others) L = L.filter(function (t) { return t !== u });
    return L;
  }
  /* 距離都從出手者的佔地算起（3×3 的王從最靠近目標的那一格算）；目標也看整個佔地，蓋到好幾格只算一次 */
  /* 直線：從中心往上下左右延伸，跳過自己佔的格子，長度 = 射程 */
  function lineCells(u, P, dx, dy, r) { var out = [], R = rad(u); for (var i = R + 1; i <= R + r; i++) { var x = P[0] + dx * i, y = P[1] + dy * i; if (onBoard(x, y)) out.push([x, y]) } return out }
  function dirOf(u, P, c) { var R = rad(u), dx = c[0] - P[0], dy = c[1] - P[1]; if (dx && dy) return null; var d = Math.abs(dx + dy); if (d <= R) return null; return [Math.sign(dx), Math.sign(dy)] }
  /* 從 P 這格出手，點 c 這格會打到誰；不能點就回傳 null */
  function hitsAt(u, a, P, c) {
    var O = fpAt(u, P[0], P[1]), L = pool(u, a), inO = O.some(function (q) { return q[0] === c[0] && q[1] === c[1] });
    if (a.side === 'self' && a.a !== 'diamond') return inO ? [u] : null;
    if (a.a === 'line') {
      var dd = dirOf(u, P, c); if (!dd) return null;
      var Lc = lineCells(u, P, dd[0], dd[1], a.r); if (!Lc.some(function (q) { return q[0] === c[0] && q[1] === c[1] })) return null;
      var h = L.filter(function (t) { return t !== u && dmin(cellsOf(t), Lc) === 0 });
      return h.length ? h : null;
    }
    if (a.a === 'diamond') {
      if (a.r === 0) { if (!inO) return null; var h0 = L.filter(function (t) { return dmin(cellsOf(t), O) <= a.s }); return h0.length ? h0 : null }
      if (dmin(O, [c]) > a.r) return null;
      var h2 = L.filter(function (t) { return dmin(cellsOf(t), [c]) <= a.s });
      return h2.length ? h2 : null;
    }
    var t0 = at(c[0], c[1]); if (!t0 || L.indexOf(t0) < 0) return null;
    var d = dmin(O, cellsOf(t0));
    if (d > a.r || (a.side === 'foe' && d < 1)) return null;
    return [t0];
  }
  /* 這招的射程格（畫淡紅／紅框用） */
  function rangeCells(u, a, P) {
    var O = fpAt(u, P[0], P[1]), out = [];
    if (a.a === 'line') { DIRS.forEach(function (s) { out = out.concat(lineCells(u, P, s[0], s[1], a.r)) }); return out }
    if (a.a === 'diamond' && a.r === 0) return O.filter(function (q) { return onBoard(q[0], q[1]) });
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) { var d = dmin(O, [[x, y]]); if (d <= a.r && (d > 0 || a.side !== 'foe' || a.a === 'diamond')) out.push([x, y]) }
    return out;
  }
  /* 範圍預覽格：直線 = 那個方向整條；菱形 = 中心往外 s 格（射程 0 = 從自己的佔地往外） */
  function areaCells(u, a, P, c) {
    var out = [];
    if (a.a === 'line') { var dd = dirOf(u, P, c); return dd ? lineCells(u, P, dd[0], dd[1], a.r) : [] }
    if (a.a === 'diamond') { var C = a.r === 0 ? fpAt(u, P[0], P[1]) : [c]; for (var yy = 0; yy < N; yy++) for (var xx = 0; xx < N; xx++) if (dmin(C, [[xx, yy]]) <= a.s) out.push([xx, yy]); return out }
    return [c];
  }
  /* 從 P 出手所有可以點的格子與打到的人（打到同一批人的只留一個） */
  function choices(u, a, P) {
    if (a.side === 'self' && a.a !== 'diamond') return [{ c: P, h: [u] }];
    var out = [], seen = {};
    rangeCells(u, a, P).forEach(function (c) { var h = hitsAt(u, a, P, c); if (!h) return; var k = h.map(function (t) { return t.name }).sort().join('|') + (a.a === 'single' ? '' : '@' + c); if (a.a !== 'single' && a.a !== 'line') k = h.map(function (t) { return t.name }).sort().join('|'); if (seen[k]) return; seen[k] = 1; out.push({ c: c, h: h }) });
    return out;
  }
  function actLabel(a) {
    if (a.id === 'atk') return (a.a === 'line' ? '直線 ' : '射程 ') + a.r;
    if (a.a === 'diamond') return (a.r === 0 ? '自身周圍' : (a.side === 'ally' ? '我方範圍' : '範圍') + '・射程 ' + a.r);
    if (a.a === 'line') return '直線 ' + a.r;
    if (a.side === 'self') return '自身';
    return (a.side === 'ally' ? '我方單體' : '單體') + '・射程 ' + a.r;
  }

  /* ---------- 畫面 ---------- */
  function build() {
    if (!$('tacstyle')) { var st = el('style'); st.id = 'tacstyle'; document.head.appendChild(st) }
    $('tacstyle').textContent = CSS;
    root$ = ctx.root; root$.innerHTML = '';
    root$.appendChild(el('div', 'bhead', ctx.title + '・戰棋'));
    var top = el('div', 'ttop'), q = el('div', 'tq'); q.id = 'tq'; top.appendChild(q);
    var sb = el('div', 'tsb'); sb.innerHTML = '<button type="button" id="tauto">全隊自動</button><button type="button" id="tquit">離開</button>'; top.appendChild(sb);
    root$.appendChild(top);
    board = el('div', 'tb'); var g = el('div', 'tg'); cells = [];
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var c = el('button', 'tc' + ((x + y) % 2 ? ' k' : '')); c.type = 'button'; c.dataset.x = x; c.dataset.y = y;
      c.setAttribute('aria-label', '第 ' + (y + 1) + ' 列第 ' + (x + 1) + ' 格'); g.appendChild(c); cells.push(c);
    }
    board.appendChild(g); layer = el('div', 'tl'); board.appendChild(layer);
    fxc = el('canvas', 'tfx'); fxx = fxc.getContext('2d'); board.appendChild(fxc);
    menu = el('div', 'tm'); menu.hidden = true; menu.setAttribute('role', 'menu'); board.appendChild(menu);
    infoBox = el('div', 'tinfo'); infoBox.hidden = true; board.appendChild(infoBox);
    infoBox.addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (!b) return; if (b.classList.contains('x')) return hideInfo(); if (b.dataset.st != null) { infoSt = infoSt === +b.dataset.st ? -1 : +b.dataset.st; renderInfo() } });
    root$.appendChild(board);
    var nw = el('div', 'tnews'); nw.id = 'tnews'; nw.setAttribute('aria-live', 'polite'); root$.appendChild(nw);
    g.addEventListener('click', function (ev) { var c = ev.target.closest('.tc'); if (c) tap(+c.dataset.x, +c.dataset.y) });
    menu.addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b && !b.disabled) menuPick(b.dataset) });
    var pn = el('div', 'panel'); pn.style.marginTop = '12px';
    pn.innerHTML = '<div class="tcard"><div class="tav" id="tav"></div><div><div class="tnm" id="tnm"></div><div class="thp" id="thp"><i></i></div><div id="tcst"></div></div></div><p class="thint" id="thint"></p>';
    root$.appendChild(pn);
    var lp = el('div', 'panel'); lp.style.marginTop = '12px'; lp.innerHTML = '<h2>戰報</h2><div class="log" id="tlog"></div>'; root$.appendChild(lp);
    $('tauto').onclick = function () {
      if (done || auto) return; auto = true; $('tauto').classList.add('on'); $('tauto').disabled = true; closeMenu();
      if (cur && cur.side === 'p' && !busy) { var u = cur; pend = null; aiTurn(u).then(next) }
    };
    /* 離開 = 放棄（沒有獎勵）；按兩次才算，避免誤觸 */
    $('tquit').onclick = function () {
      if (done) { stop(); ctx.onExit(); return }
      var b = $('tquit');
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = '確定放棄？'; hint('再按一次「確定放棄？」就離開，這場不會有獎勵。'); setTimeout(function () { if (b.isConnected) { delete b.dataset.sure; b.textContent = '離開' } }, 3000); return }
      stop(); ctx.onExit();
    };
  }
  function sprite(u) {
    if (u.side === 'p') { var c = document.createElement('canvas'); c.width = c.height = 48; return c }
    var im = new Image(); im.draggable = false; im.alt = ''; return im;
  }
  function addNode(u) {
    var d = el('div', 'tu ' + u.side); u.node = d; u.sp = sprite(u); d.appendChild(u.sp);
    var hb = el('div', 'hp'); hb.appendChild(el('i')); d.appendChild(hb); u.hpn = hb.firstChild;
    layer.appendChild(d); sizeSprite(u); setPos(u); setHp(u);
  }
  function placeUnits() { layer.innerHTML = ''; units.forEach(addNode) }
  /* 人物、怪物用同一個像素倍率，維持原本戰鬥畫面的相對大小；人物（48 格紙娃娃）約 1.5 格高，超出格子沒關係 */
  /* SZ.p = 紙娃娃（48 px 畫布）佔幾格高；SZ.m = 怪物再乘的倍率（1 = 跟人物維持原本戰鬥畫面的比例）；SZ.b = 王再乘的倍率 */
  var SZ0 = { p: 2, m: 1, b: 1 }   /* 2026-10-21 定案：人物 2 格高、怪物 ×1、王 ×1 */, SZ = { p: SZ0.p, m: SZ0.m, b: SZ0.b };
  function spriteW(k, boss, cw) { var z = ctx.msz(k), sc = ctx.msc ? ctx.msc(k, boss) : 1, K = cw * SZ.p / 48 * SZ.m * (boss ? SZ.b : 1); return [z[0] * sc * K, z[1] * sc * K] }
  function sizeSprite(u) {
    var cw = board.clientWidth / N;
    if (u.side === 'p') { var s = cw * SZ.p; u.sp.style.width = u.sp.style.height = s + 'px'; u.sp.style.bottom = '-4%'; return }
    var w = spriteW(u.sprite, u.boss, cw); u.sp.style.width = w[0] + 'px'; u.sp.style.height = w[1] + 'px'; if (rad(u)) u.sp.style.bottom = '2%';
  }
  /* 比例調整面板（網址帶 &tune=1）：拉桿即時改大小，數值記在這台瀏覽器 */
  function tunePanel() {
    try { var o = JSON.parse(localStorage.getItem('tac.size') || 'null'); if (o) { SZ.p = +o.p || SZ0.p; SZ.m = +o.m || SZ0.m; SZ.b = +o.b || SZ0.b } } catch (e) {}
    var pn = el('div', 'panel'); pn.style.marginTop = '12px';
    function row(k, label, min, max) { return '<label style="display:grid;grid-template-columns:86px 1fr 46px;gap:8px;align-items:center;font-size:13px;font-weight:700">' + label + '<input type="range" data-k="' + k + '" min="' + min + '" max="' + max + '" step="0.05" value="' + SZ[k] + '"><b data-v="' + k + '"></b></label>' }
    pn.innerHTML = '<h2>比例調整（只影響這台瀏覽器的測試畫面）</h2>' + row('p', '人物（格高）', 0.8, 3) + row('m', '怪物倍率', 0.5, 2.5) + row('b', '王再乘', 0.5, 2) +
      '<label style="display:grid;grid-template-columns:86px 1fr;gap:8px;align-items:center;font-size:13px;font-weight:700">地圖展示<select id="tshow" style="font:inherit;font-size:13px;padding:4px;background:#2b1d13;color:var(--fg);border:2px solid #6b4a2a"><option value="">本關的怪</option><option value="n">全部一般怪物（' + kinds().filter(function (q) { return !q.boss }).length + ' 種）</option><option value="b">全部王（' + kinds().filter(function (q) { return q.boss }).length + ' 種）</option></select></label>' +
      '<div id="tzoo" style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px 8px;padding:8px 4px 4px;background:rgba(0,0,0,.25);box-shadow:inset 0 -3px 0 #3b2713"></div>' +
      '<p class="note" id="tsum" style="margin:0"></p><div class="tbtn" style="display:flex;gap:8px"><button type="button" id="treset" style="font:inherit;font-weight:900;border:0;background:var(--btn);color:var(--fg);padding:6px 12px;box-shadow:0 0 0 2px #1d1008">還原預設</button></div>';
    var info = $('tav') && $('tav').closest('.panel'); root$.insertBefore(pn, info || null);
    function sync() {
      [].forEach.call(pn.querySelectorAll('[data-v]'), function (b) { var k = b.getAttribute('data-v'); b.textContent = (k === 'p' ? SZ[k].toFixed(2) : '×' + SZ[k].toFixed(2)) });
      $('tsum').textContent = '目前：人物 ' + SZ.p.toFixed(2) + ' 格高、怪物 ×' + SZ.m.toFixed(2) + '、王再 ×' + SZ.b.toFixed(2) + '（截圖或抄這行給我就好）';
      units.forEach(function (u) { if (u.node) sizeSprite(u) }); SHOW.forEach(function (o) { sizeShow(o) }); zoo();
      try { localStorage.setItem('tac.size', JSON.stringify(SZ)) } catch (e) {}
    }
    pn.addEventListener('input', function (e) { var k = e.target.getAttribute('data-k'); if (k) { SZ[k] = +e.target.value; sync() } });
    $('tshow').onchange = function () { showcase(this.value) };
    $('treset').onclick = function () { SZ.p = SZ0.p; SZ.m = SZ0.m; SZ.b = SZ0.b; [].forEach.call(pn.querySelectorAll('input'), function (i) { i.value = SZ[i.getAttribute('data-k')] }); sync() };
    sync();
  }
  /* 每種怪物（同圖同王與否算一種），王排最後 */
  function kinds() {
    var seen = {}, out = [];
    Object.keys(ctx.D.mon).forEach(function (id) { var m = ctx.D.mon[id], k = m.sprite, boss = m.boss === '1'; if (!k || seen[k + boss]) return; seen[k + boss] = 1; out.push({ k: k, boss: boss, n: m.monster_name }) });
    return out.sort(function (a, b) { return (a.boss ? 1 : 0) - (b.boss ? 1 : 0) });
  }
  /* 展示：把全部怪物擺在地圖上（只是圖，不參加戰鬥） */
  var SHOW = [], SHOWPOS = { n: [[1, 1], [3, 1], [5, 1], [7, 1], [1, 3], [3, 3], [5, 3], [7, 3], [1, 5], [3, 5], [5, 5], [7, 5], [9, 2], [9, 4], [9, 6]], b: [[1, 4], [5, 4], [8, 4], [2, 1], [7, 1]] };
  function sizeShow(o) { var w = spriteW(o.k, o.boss, board.clientWidth / N); o.sp.style.width = w[0] + 'px'; o.sp.style.height = w[1] + 'px' }
  function showcase(mode) {
    SHOW.forEach(function (o) { o.node.remove() }); SHOW = [];
    S.M.forEach(function (m) { if (m.node) m.node.style.visibility = mode ? 'hidden' : '' });
    if (!mode) return;
    kinds().filter(function (q) { return mode === 'b' ? q.boss : !q.boss }).forEach(function (q, i) {
      var p = SHOWPOS[mode][i] || [i % N, 0], d = el('div', 'tu m'), im = new Image(); im.alt = q.n; im.title = q.n;
      d.appendChild(im); var lb = el('div', '', q.n); lb.style.cssText = 'position:absolute;left:50%;bottom:-14px;transform:translateX(-50%);font-size:10px;font-weight:900;white-space:nowrap;color:#fff;text-shadow:1px 1px 0 #000,-1px -1px 0 #000';
      d.appendChild(lb); d.style.left = (p[0] * 10) + '%'; d.style.top = (p[1] * 10) + '%'; d.style.zIndex = 10 + p[1];
      layer.appendChild(d); var o = { k: q.k, boss: q.boss, node: d, sp: im, ph: Math.random() * 900 }; SHOW.push(o); sizeShow(o);
    });
  }
  /* 對照列：一隻人物 + 每種怪物各一隻，用同一個格寬畫，底下的刻度是一格寬 */
  function zoo() {
    var box = $('tzoo'); if (!box) return; box.innerHTML = '';
    var cw = board.clientWidth / N, seen = {};
    var c = document.createElement('canvas'); c.width = c.height = 48; c.style.cssText = 'flex:none;image-rendering:pixelated;width:' + cw * SZ.p + 'px;height:' + cw * SZ.p + 'px;margin-bottom:' + (-cw * SZ.p * 0.04) + 'px';
    var me = S.P[0]; if (me) Doll.draw(c, me.look, 0); box.appendChild(c);
    Object.keys(ctx.D.mon).forEach(function (id) {
      var m = ctx.D.mon[id], k = m.sprite, boss = m.boss === '1'; if (!k || seen[k + boss]) return; seen[k + boss] = 1;
      var src = ctx.msrc(k, 0, 0); if (!src) return;
      var w = spriteW(k, boss, cw), im = new Image(); im.src = src; im.title = m.monster_name; im.alt = m.monster_name;
      im.style.cssText = 'flex:none;image-rendering:pixelated;width:' + w[0] + 'px;height:' + w[1] + 'px';
      box.appendChild(im);
    });
    var tick = el('div'); tick.style.cssText = 'flex:none;align-self:flex-end;width:' + cw + 'px;height:6px;background:#ffd76a;margin-left:6px'; tick.title = '一格寬'; box.appendChild(tick);
  }
  /* 地板：該關原本橫向戰鬥背景，從天空下方（BG 的 ft）裁到底，裁成正方形放大鋪滿 */
  function floor() {
    var g = ctx.bg; if (!g) return;
    var y0 = Math.max(0, g.ft != null ? g.ft : g.band), h = g.bh - y0, span = Math.max(0, g.bw - h), x0 = Math.round(span * (((ctx.lv || 1) * 0.37) % 1));
    var k = board.clientWidth / h;
    board.style.backgroundImage = 'url(' + g.src + ')';
    board.style.backgroundSize = (g.bw * k) + 'px ' + (g.bh * k) + 'px';
    board.style.backgroundPosition = (-x0 * k) + 'px ' + (-y0 * k) + 'px';
  }
  function setPos(u) { var R = rad(u); u.node.style.left = ((u.tx - R) * 10) + '%'; u.node.style.top = ((u.ty - R) * 10) + '%'; u.node.style.zIndex = 10 + u.ty + R; if (R) { u.node.style.width = u.node.style.height = ((2 * R + 1) * 10) + '%' } }
  function setHp(u) { u.hpn.style.width = Math.max(0, Math.min(100, u.hp / u.b.mhp * 100)) + '%'; u.node.classList.toggle('dead', !!u.dead) }
  function float(u, txt, cls, dy) {
    var f = el('div', 'tf ' + cls, txt); f.style.left = (u.tx * 10 + 5) + '%'; f.style.top = ((u.ty - rad(u)) * 10 - 2 - (dy || 0)) + '%';
    layer.appendChild(f); setTimeout(function () { f.remove() }, 950);
  }
  function flash(u, cls) { if (!u.node) return; u.node.classList.remove(cls); void u.node.offsetWidth; u.node.classList.add(cls) }
  function anim(now) {
    if (!loopOn) return;
    drawFx(now);
    if (!lastDraw || now - lastDraw >= 100) {
      lastDraw = now;
      units.forEach(function (u) {
        if (u.dead || !u.sp) return;
        if (u.side === 'p') Doll.draw(u.sp, u.look, now + u.ph);
        else { var s = ctx.msrc(u.sprite, now, u.ph); if (s && u.sp.getAttribute('src') !== s) u.sp.src = s }
      });
      SHOW.forEach(function (o) { var s2 = ctx.msrc(o.k, now, o.ph); if (s2 && o.sp.getAttribute('src') !== s2) o.sp.src = s2 });
    }
    raf = requestAnimationFrame(anim);
  }
  function icon(u) {
    if (u.side === 'p') {
      /* 人物：只截頭到胸口（跟隊伍頁、分頁列的頭像一樣：48 格紙娃娃取 (12,5) 起 22×24，不畫武器） */
      var hd = document.createElement('canvas'); hd.width = hd.height = 48; Doll.draw(hd, Object.assign({}, u.look, { weapon: null, shield: null, halo: [], breath: false }), 1000);
      var c = document.createElement('canvas'); c.width = 22; c.height = 24; c.getContext('2d').drawImage(hd, 12, 5, 22, 24, 0, 0, 22, 24); return c;
    }
    var im = new Image(); im.alt = ''; var s = ctx.msrc(u.sprite, 0, 0); if (s) im.src = s; return im;
  }
  function renderQueue() {
    var q = $('tq'); q.innerHTML = '<span>行動順序</span>';
    order.forEach(function (u, i) {
      if (u.dead) return;
      var b = el('div', 'tqi ' + u.side + (i === oi ? ' now' : i < oi ? ' done' : '')); b.title = u.name; b.appendChild(icon(u)); q.appendChild(b);
    });
  }
  function renderCard(u) {
    var av = $('tav'); av.innerHTML = ''; if (!u) return; av.appendChild(icon(u));
    var sets = setsOf(u).map(function (o) { return o.name }).join('／');
    var info = (u.side === 'p' ? (u.weapon || '徒手') + '・' : '') + '移動 ' + moveOf(u) + ' 格・普攻' + actLabel(atkAct(u)) + (sets ? '・' + sets : '');
    $('tnm').innerHTML = esc(u.name) + '<small>' + esc(info) + '</small>';
    $('thp').className = 'thp' + (u.side === 'm' ? ' m' : ''); $('thp').firstChild.style.width = Math.max(0, u.hp / u.b.mhp * 100) + '%';
    var cs = $('tcst'); cs.innerHTML = stChips(u, cardSt); cs.onclick = function (ev) { var b = ev.target.closest('button[data-st]'); if (!b) return; cardSt = cardSt === +b.dataset.st ? -1 : +b.dataset.st; renderCard(u) };
  }
  /* ---------- 狀態標籤與說明 ---------- */
  function stList(u) { return (u.st || []).filter(function (s) { return !s.paused || s.banish }) }
  function stTurns(s) { return s.banish ? '放逐中' : s.turns === 'attack' ? '直到下次攻擊' : '還剩 ' + s.turns + ' 次行動' }
  function stChips(u, open) {
    var L = stList(u); if (!L.length) return '';
    var h = '<div class="tsts">' + L.map(function (s, i) { var pol = s.pol === 'debuff' ? 'debuff' : 'buff'; return '<button type="button" class="tst ' + pol + (i === open ? ' on' : '') + '" data-st="' + i + '">' + esc(s.n) + (typeof s.turns === 'number' ? ' ' + s.turns : '') + '</button>' }).join('') + '</div>';
    var s = L[open];
    if (s) { var def = (ctx.D.STS || {})[s.n] || {}, pol = s.pol === 'debuff' ? 'debuff' : 'buff'; h += '<div class="tpop" role="note"><b>' + esc(s.n) + '</b><span class="k ' + pol + '">' + (pol === 'debuff' ? '減益' : '增益') + '</span><div>' + esc(def.d || '（沒有說明）') + '</div><div class="t">' + esc(stTurns(s)) + '</div></div>' }
    return h;
  }
  /* 地圖角落的資訊卡：預設左上，被點的單位在左上那一塊時改放右上 */
  function showInfo(u) { infoU = u; infoSt = -1; renderInfo() }
  function hideInfo() { infoU = null; infoBox.hidden = true }
  function renderInfo() {
    var u = infoU; if (!u || u.dead || u.tx == null) { hideInfo(); return }
    var R = rad(u), sz = R ? '・佔 ' + (2 * R + 1) + '×' + (2 * R + 1) : '';
    infoBox.className = 'tinfo' + (u.side === 'm' ? ' m' : '') + (u.tx < 5 && u.ty < 5 ? ' r' : '');
    infoBox.innerHTML = '<div class="nm"><span>' + esc(u.name) + (u.boss ? ' <small>王</small>' : '') + '</span><button type="button" class="x" aria-label="關閉">✕</button></div>' +
      '<div class="hpl"><i style="width:' + Math.max(0, Math.min(100, u.hp / u.b.mhp * 100)) + '%"></i></div>' +
      '<div class="sub">生命 ' + Math.max(0, Math.round(u.hp)) + '/' + u.b.mhp + '・移動 ' + moveOf(u) + '・普攻' + esc(actLabel(atkAct(u))) + sz + '</div>' +
      (stList(u).length ? stChips(u, infoSt) : '<div class="sub" style="margin-top:3px">沒有狀態</div>');
    infoBox.hidden = false;
  }
  function hint(t) { $('thint').textContent = t || '' }
  /* 地圖下方公告列：平常顯示最新戰報；選好招、在點目標時改顯示這招的說明 */
  function logNews() { var nw = $('tnews'); if (nw && lastNews) { nw.textContent = lastNews.t; nw.className = lastNews.c } }
  function skillNews(a) { var nw = $('tnews'); if (!nw) return; nw.className = 'tnews sk'; nw.innerHTML = '<b>' + esc(a.sk.n) + '</b>　' + esc(actDesc(a)) + '<br><small>' + esc(actInfo(a)) + '</small>' }
  /* 說明文字：跟技能書同一套（common/skilldesc.js），目標字眼換成戰棋的講法 */
  function actDesc(a) {
    if (a.id === 'atk') return a.a === 'line' ? '直線上的敵人各受到 100% 物理傷害（貫穿）。' : a.a === 'diamond' ? '範圍內的敵人各受到 100% 物理傷害。' : '對一個敵人造成 100% 物理傷害。';
    if (!root.SkillDesc || !a.sk.raw) return a.sk.ds || '';
    var sk = SkillDesc.fromRow(a.sk.raw), fx = SkillDesc.fromEff(ctx.D.EFF[a.id]);
    sk.p = '';
    sk.t = a.side === 'self' ? 'self' : a.a === 'single' ? (a.side === 'foe' ? 'enemy_single' : 'ally_single') : (a.side === 'foe' ? 'enemy_all' : a.others ? 'ally_others' : 'ally_all');
    return SkillDesc.text(sk, fx.st, fx.hl, function (n) { var d = ctx.D.STS[n]; return d ? d.d : '' })
      .replace('敵方全體', '範圍內的敵人').replace('其他隊友全體', '範圍內的其他隊友').replace('我方全體', '範圍內的隊友').replace('敵方單體', '一個敵人').replace('我方單體', '一位隊友');
  }
  function actInfo(a) {
    var t = a.id === 'atk' ? '普通攻擊' : (TYN[a.sk.ty] || '技能');
    var area = a.a === 'line' ? '直線 ' + a.r + ' 格（貫穿）' : a.a === 'diamond' ? (a.r === 0 ? '以自己為中心' : '射程 ' + a.r) + '・往外 ' + a.s + ' 格' : a.side === 'self' ? '自身' : '射程 ' + a.r;
    return t + '・' + area + (a.cost ? '・冷卻 ' + a.cost + ' 回合' : '');
  }
  function flushLog() {
    var box = $('tlog'); if (!box) return;
    /* 引擎在行動開始時就先開好一行空白戰報、出手後才填字，所以最後一行還是空的就先停，等填完再印 */
    for (; evSeen < S.ev.length; evSeen++) { var e = S.ev[evSeen]; if (!e.txt) { if (evSeen === S.ev.length - 1) break; continue } box.appendChild(el('div', 'lg' + (e.kind === 'round' ? ' rd' : '') + (e.dead || e.pko ? ' ko' : ''), e.txt)); lastNews = { t: e.txt, c: 'tnews' + (e.kind === 'round' ? ' rd' : '') + (e.dead || e.pko ? ' ko' : '') }; if (phase !== 'target') logNews() }
    box.scrollTop = box.scrollHeight;
  }
  function cell(x, y) { return cells[y * N + x] }
  function clearCells() { cells.forEach(function (c) { c.className = 'tc' + ((+c.dataset.x + +c.dataset.y) % 2 ? ' k' : '') }) }

  /* ---------- 指令選單（人物右邊；太靠右翻到左邊，太靠下往上長） ---------- */
  function openMenu(p) { phase = p || 'menu'; pend = null; sel = null; paint(); renderMenu(); logNews() }
  function closeMenu() { menu.hidden = true; menu.innerHTML = '' }
  function renderMenu() {
    var u = cur, h = '', sealed = S.ctrl(u, 'seal');
    if (phase === 'menu') {
      h += '<button type="button" data-act="atk">攻擊<small>' + esc(actLabel(atkAct(u))) + '</small></button>';
      setsOf(u).forEach(function (o) {
        var any = o.ids.some(function (id) { return usable(u, skAct(u, id)) });
        h += '<button type="button" data-set="' + o.sn + '"' + (o.ids.length && !sealed ? '' : ' disabled') + '>' + esc(o.name) + '<small>' + (sealed ? '封印中' : !o.ids.length ? '還沒學會技能' : any ? o.ids.length + ' 招' : '都在冷卻') + '</small></button>';
      });
      h += '<button type="button" data-act="wait">等待</button>';
      if (u.moved) h += '<button type="button" data-act="undo">↶ 取消移動</button>';
    } else {
      var o = setsOf(u).filter(function (x) { return x.sn === subSn })[0] || { name: '', ids: [] };
      h += '<button type="button" class="back" data-act="back">‹ 返回</button><div class="tmh">' + esc(o.name) + '</div><div class="sl">';
      o.ids.forEach(function (id) {
        var a = skAct(u, id), cd = cdOf(u, id);
        h += '<button type="button" data-sk="' + id + '"' + (usable(u, a) ? '' : ' disabled') + '>' + esc(a.sk.n) + '<small>' + esc((TYN[a.sk.ty] || '') + '・' + actLabel(a)) + '</small>' + (cd > 0 ? '<i>CD ' + cd + '</i>' : '') + '</button>';
      });
      h += '</div>';
    }
    menu.innerHTML = h; menu.hidden = false;
    placeMenu();
  }
  function placeMenu() {
    var W = board.clientWidth, H = board.clientHeight, cw = W / N;
    menu.style.setProperty('--tmh', Math.round(H * 0.62) + 'px');
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    var left = (cur.tx + 1) * cw + 4;
    if (left + mw > W - 2) left = cur.tx * cw - mw - 4;
    left = Math.max(2, Math.min(left, W - mw - 2));
    var top = cur.ty * cw - cw * 0.5;
    if (top + mh > H - 2) top = H - mh - 2;
    top = Math.max(2, top);
    menu.style.left = left + 'px'; menu.style.top = top + 'px';
  }
  function menuPick(d) {
    if (!mine()) return;
    if (d.act === 'atk') { sel = 'atk'; phase = 'target'; closeMenu(); paint(); skillNews(atkAct(cur)); return }
    if (d.act === 'wait') return doWait();
    if (d.act === 'undo') return undoMove();
    if (d.act === 'back') { phase = 'menu'; renderMenu(); paint(); return }
    if (d.set) { subSn = d.set; phase = 'sub'; renderMenu(); paint(); return }
    if (d.sk) {
      var a = skAct(cur, d.sk); if (!a || !usable(cur, a)) return;
      /* 自身技也要再點自己一下才施放 */
      sel = d.sk; phase = 'target'; closeMenu(); paint(); skillNews(a);
    }
  }

  /* 塗格子：藍 = 可移動；紅框 = 普攻射程；淡紅 = 技能射程；紅底／綠底 = 可以點的目標；橘 = 範圍預覽 */
  function paint() {
    clearCells();
    if (!cur || done) return;
    cellsOf(cur).forEach(function (q) { if (onBoard(q[0], q[1])) cell(q[0], q[1]).classList.add('cur') });
    if (!mine()) return;
    if (phase === 'move' || ((phase === 'menu' || phase === 'sub') && !cur.moved)) {
      cur.R = cur.moved ? null : reach(cur);
      if (cur.R) Object.keys(cur.R).forEach(function (k) { var r = cur.R[k]; if (r.d > 0) cell(r.x, r.y).classList.add('mv') });
      if (phase === 'move') hint(cur.moved ? '點自己（金框）打開指令選單。' : '點藍色格子移動；或點自己（金框）原地打開指令選單。');
      else hint('選一個指令；點藍色格子可以改站別的位置。');
      return;
    }
    if (phase !== 'target') { hint('選一個指令。'); return }
    var a = skAct(cur, sel) || atkAct(cur), P = pos(cur);
    rangeCells(cur, a, P).forEach(function (c) { cell(c[0], c[1]).classList.add(a.id === 'atk' ? 'rg' : 'sr') });
    var ch = choices(cur, a, P), tgCls = a.side === 'foe' ? 'tgt' : 'tga';
    ch.forEach(function (o) { o.h.forEach(function (t) { cellsOf(t).forEach(function (q) { if (onBoard(q[0], q[1])) cell(q[0], q[1]).classList.add(tgCls) }) }) });
    if (pend && pend.id === a.id) areaCells(cur, a, P, pend.c).forEach(function (c) { cell(c[0], c[1]).classList.add('ar') });
    var nm = a.sk.n;
    if (pend && pend.id === a.id) hint('「' + nm + '」會打到：' + pend.h.map(function (t) { return t.name }).join('、') + '。再點一次同一格確認；點其他地方回選單。');
    else if (!ch.length) hint('「' + nm + '」' + (a.a === 'single' ? '射程內沒有目標' : '範圍內沒有目標') + '：點任一格回選單。');
    else if (a.side === 'self' && a.a !== 'diamond') hint('點自己（綠框）施放「' + nm + '」；點其他地方回選單。');
    else if (a.a === 'single') hint('點' + (a.side === 'foe' ? '紅色的敵人' : '綠色的隊友') + '施放「' + nm + '」；點其他地方回選單。');
    else hint('點' + (a.a === 'line' ? '直線上的一格選方向' : '射程內一格（或亮起來的目標）') + '預覽範圍，再點同一格確認；點其他地方回選單。');
  }

  /* ---------- 流程 ---------- */
  function snapHp() { var o = new Map(); units.forEach(function (u) { o.set(u, { hp: u.hp, st: u.st.length }) }); return o }
  function showDiff(before, hit) {
    units.forEach(function (u) {
      if (!u.node) return;
      var b = before.get(u) || { hp: u.b.mhp, st: 0 };
      var d = Math.round(u.hp - b.hp);
      if (d < 0) { float(u, String(d), 'd'); flash(u, 'hit') }
      else if (d > 0) float(u, '+' + d, 'h');
      else if (hit && hit.indexOf(u) >= 0 && !u.dead && u.st.length <= b.st) float(u, '未命中', 'x');
      if (u.st.length > b.st && !u.dead) float(u, '＋狀態', 's', d ? 4 : 0);
      setHp(u);
    });
  }
  function lunge(u, c) {
    var dx = c[0] - u.tx, dy = c[1] - u.ty, L = Math.max(1, Math.abs(dx) + Math.abs(dy)), k = Math.min(0.35, 0.35 / L * 1.5);
    if (!dx && !dy) { flash(u, 'cast'); return wait(220) }
    u.node.style.left = ((u.tx + dx * k) * 10) + '%'; u.node.style.top = ((u.ty + dy * k) * 10) + '%';
    return wait(110).then(function () { setPos(u); return wait(90) });
  }
  function walk(u, path) {
    var p = Promise.resolve();
    path.forEach(function (c) { p = p.then(function () { u.tx = c[0]; u.ty = c[1]; setPos(u); return wait(STEP_MS) }) });
    return p;
  }
  /* ---------- 特效：沿用自動戰鬥同一套（index.html 的 tacFx），座標換成格子 ----------
     美術像素倍率 K = 格寬 × 人物格高 / 48（跟角色圖同一個比例），所以特效大小會跟著人物一起縮放 */
  function artK() { return board.clientWidth / N * SZ.p / 48 }
  function footXY(t) { var cw = board.clientWidth / N, K = artK(); return [(t.tx + 0.5) * cw / K, (t.ty + rad(t) + 0.94) * cw / K] }
  function bodyH(t) { if (t.side === 'p') return 30; var z = ctx.msz(t.sprite), sc = ctx.msc ? ctx.msc(t.sprite, t.boss) : 1; return z[1] * sc * SZ.m * (t.boss ? SZ.b : 1) }
  function chest(t) { var f = footXY(t); return [f[0], f[1] - (t.side === 'p' ? 15 : bodyH(t) * 0.45)] }
  function fxAdd(kind, o, delay, dur) { FX.push({ kind: kind, o: o, t0: performance.now() + (delay || 0), dur: dur || 900 }) }
  function drawFx(now) {
    if (!fxc) return;
    var dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.round(fxc.clientWidth * dpr), H = Math.round(fxc.clientHeight * dpr);
    if (fxc.width !== W || fxc.height !== H) { fxc.width = W; fxc.height = H } else if (!FX.length && !fxc._dirty) return;
    fxx.setTransform(1, 0, 0, 1, 0, 0); fxx.clearRect(0, 0, W, H); fxc._dirty = FX.length > 0;
    var sc = artK() * dpr;
    FX = FX.filter(function (f) { return now - f.t0 <= f.dur });
    FX.forEach(function (f) {
      var d = now - f.t0; if (d < 0) return;
      fxx.save();
      try {
        if (f.kind === 'ring' || f.kind === 'aoe') ownFx(f, d, sc);
        else if (ctx.fx) {
          if (f.o.rot) { var hx = f.o.hx * sc, hy = f.o.hy * sc; fxx.translate(hx, hy); if (f.o.flip) fxx.scale(-1, 1); fxx.rotate(f.o.rot); fxx.translate(-hx, -hy) }
          ctx.fx(fxx, sc, f.kind, f.o, d);
        }
      } catch (e) { }
      fxx.restore();
    });
  }
  /* 戰棋自己畫的：音波（一圈圈往外擴的像素環）、範圍技中心的光（菱形範圍淡出） */
  function ownFx(f, d, sc) {
    var o = f.o, cw = board.clientWidth / N, dpr = sc / artK();
    if (f.kind === 'ring') {
      for (var r = 0; r < 3; r++) { var u = (d - r * 110) / 520; if (u < 0 || u > 1) continue; var R = (0.3 + u * o.r) * cw * dpr; fxx.globalAlpha = 1 - u; fxx.strokeStyle = o.c; fxx.lineWidth = Math.max(2, 2 * dpr); fxx.setLineDash([4 * dpr, 3 * dpr]); fxx.beginPath(); fxx.arc((o.x + 0.5) * cw * dpr, (o.y + 0.55) * cw * dpr, R, 0, Math.PI * 2); fxx.stroke() }
      return;
    }
    var u2 = d / f.dur, a = u2 < 0.2 ? u2 / 0.2 : 1 - (u2 - 0.2) / 0.8;
    fxx.fillStyle = o.c; o.cells.forEach(function (q) { var k = Math.abs(q[0] - o.x) + Math.abs(q[1] - o.y); fxx.globalAlpha = Math.max(0, a * (0.45 - k * 0.08)); fxx.fillRect(q[0] * cw * dpr, q[1] * cw * dpr, cw * dpr, cw * dpr) });
  }
  var MELEE = { sword: 1, axe: 1, dagger: 1, spear: 1 };
  /* 放特效，回傳「打中」要等幾毫秒 */
  function playFx(u, a, c, h) {
    var info = ctx.fxInfo ? ctx.fxInfo(u, a.id) : null, ty = a.sk.ty;
    if (!info) return 200;
    var el = info.el || '', s0 = chest(u);
    if (ty === 'heal') { h.forEach(function (t) { var f = footXY(t); fxAdd('heal', { x: f[0], y: f[1], el: el }, 0, 1500) }); return 260 }
    if (ty === 'buff') { h.forEach(function (t) { var f = footXY(t); fxAdd('buff', { x: f[0], y: f[1], el: el, c: '#ffd76a' }, 0, 760) }); return 200 }
    if (a.a === 'diamond') fxAdd('aoe', { x: c[0], y: c[1], c: ELC_T[el] || (a.side === 'foe' ? '#ff9a5a' : '#8ef09a'), cells: areaCells(u, a, pos(u), c) }, 0, 650);
    if (ty === 'debuff') { if (info.wk === 'sonic') fxAdd('ring', { x: u.tx, y: u.ty, r: a.r + 0.5, c: info.c }, 0, 900); h.forEach(function (t) { var q = chest(t); fxAdd('burst', { x: q[0], y: q[1], el: PCOL_OK[el] ? el : 'dark', n: 14 }, 120, 900) }); return 260 }
    var hits = Math.max(1, a.sk.hits || 1), each = a.sk.p === 'random_each' && hits > 1;
    if (info.wk === 'sonic') fxAdd('ring', { x: u.tx, y: u.ty, r: Math.max(a.r, a.s || 0) + 0.5, c: info.c }, 0, 900);
    for (var k = 0; k < hits; k++) {
      (each ? [h[Math.floor(Math.random() * h.length)]] : h).forEach(function (t, i) {
        var q = chest(t), f = footXY(t), delay = k * 130 + (a.a === 'line' ? i * 60 : 0);
        if (info.wk === 'claw') { fxAdd('claw', { x: q[0], y: q[1] }, delay, 520); return }
        if (info.wk === 'sonic') { fxAdd('burst', { x: q[0], y: q[1], el: PCOL_OK[el] ? el : 'arc', n: 10 }, delay + 200, 800); return }
        var o = { e: { el: el, atk: info.atk, hit: info.hit }, wk: info.wk, c: info.c, sx: s0[0], sy: s0[1] - (info.wk === 'throw' ? 12 : 0), hx: q[0], hy: q[1], gy: f[1], scm: t.boss ? 1.4 : 1 };
        if (MELEE[info.wk]) { var dx = t.tx - u.tx, dy = t.ty - u.ty, ang = Math.atan2(dy, dx); if (Math.abs(ang) > Math.PI / 2) { o.flip = true; ang = Math.PI - ang; if (ang > Math.PI) ang -= 2 * Math.PI } o.rot = ang }
        fxAdd('hit', o, delay, 920);
      });
    }
    return (info.hit || 200) + (hits - 1) * 130;
  }
  var ELC_T = { fire: '#ff7a3a', frost: '#9ad8ff', lightning: '#ffe95a', wind: '#7cf0c4', nature: '#8ed65a', light: '#fff4c4', dark: '#8a4ae0' };
  var PCOL_OK = { fire: 1, frost: 1, lightning: 1, wind: 1, nature: 1, light: 1, dark: 1 };
  /* 出手：a = 招式、c = 點的格子、h = 打到的人；先放特效，打中的那一刻才結算、跳數字 */
  function cast(u, a, c, h) {
    var before = snapHp(), each = a.sk.p === 'random_each' && a.sk.hits > 1;
    var hitMs = playFx(u, a, c, h);
    return Promise.all([lunge(u, a.side === 'foe' ? c : pos(u)), wait(hitMs)]).then(function () {
      if (each) S.hooks.pool = h;
      S.hooks.area = a.a !== 'single';
      S.finish(u, { sk: a.id, tg: h });
      S.hooks.pool = null; S.hooks.area = false;
      if (a.cost > 0) { u.cd = u.cd || {}; u.cd[a.id] = a.cost + 1 }   /* 開始行動時先減 1，所以 +1：之後 cost 次行動都不能用 */
      placeSummons(u);
      /* 單體攻擊被保護者擋下：原目標沒掉血、同陣營有別人掉血 → 標「被保護」而不是「未命中」 */
      var prot = a.side === 'foe' && h.length === 1 && Math.round(h[0].hp) === Math.round(before.get(h[0]).hp) && units.some(function (x) { var b = before.get(x); return x !== h[0] && x.side === h[0].side && b && x.hp < b.hp });
      showDiff(before, a.side === 'foe' && !prot ? h : null); if (prot) float(h[0], '被保護', 's');
      flushLog(); renderCard(cur); if (infoU) renderInfo();
    });
  }
  /* 召喚：新叫出來的怪放在召喚者旁邊的空格；沒有空格就不召喚（docs/tactics.md「召喚」） */
  function placeSummons(src) {
    S.U.slice().forEach(function (m) {
      if (m.tx != null || m.dead) return;
      /* 召喚者佔地外圍一圈（先找正下方、再找左右、最後其他）；3×3 的王也一樣找外圍 */
      var spot = null, F = cellsOf(src), C = [];
      for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) if (dmin(F, [[x, y]]) === 1) C.push([x, y]);
      C.sort(function (p, q) { return (q[1] - p[1]) || (Math.abs(p[0] - src.tx) - Math.abs(q[0] - src.tx)) });
      C.some(function (c) { if (fpAt(m, c[0], c[1]).every(function (q) { return onBoard(q[0], q[1]) && !at(q[0], q[1]) })) { spot = c; return true } });
      if (!spot) { m.dead = true; [S.M, S.U].forEach(function (A) { var i = A.indexOf(m); if (i >= 0) A.splice(i, 1) }); var e = S.ev[S.ev.length - 1]; if (e) e.txt += '（' + m.name + ' 旁邊沒有空位，沒叫出來）'; return }
      m.tx = spot[0]; m.ty = spot[1]; m.ph = Math.random() * 900; addNode(m); float(m, '召喚', 's');
    });
  }
  function begin() {
    if (done) return;
    if (!S.alive(S.P) || !S.alive(S.M)) return end();
    if (!order || oi >= order.length - 1) { if (S.over()) return end(); order = S.round(); oi = -1; flushLog() }
    oi++;
    var u = order[oi];
    if (!u || u.dead || u.tx == null) return next();
    cur = u; u.moved = false; u.from = pos(u); sel = null; pend = null; phase = 'move'; closeMenu(); cardSt = -1;
    if (u.cd) Object.keys(u.cd).forEach(function (k) { if (u.cd[k] > 0) u.cd[k]-- });   /* 冷卻以自己的行動次數計（被控制跳過也算） */
    renderQueue(); renderCard(u);
    var before = snapHp(), ok = S.start(u);
    showDiff(before, null); flushLog(); renderCard(u); if (infoU) renderInfo();
    if (!ok) { busy = true; paint(); return wait(AFTER_MS).then(next) }
    if (u.side === 'p' && !auto) { busy = false; paint(); return }
    busy = true; paint();
    return wait(THINK_MS).then(function () { return aiTurn(u) }).then(next);
  }
  function next() { if (done) return; busy = false; pend = null; closeMenu(); paint(); if (!S.alive(S.P) || !S.alive(S.M)) return end(); setTimeout(begin, 60) }

  /* ---------- AI（怪物、按「全隊自動」後的我方） ----------
     每個可走的格子 × 每招可用的招 × 每個可以點的格子打分數，挑最高的；都沒有就往最近的敵人靠 */
  function statusOf(id) { return (ctx.D.EFF[id] || []).filter(function (e) { return e.effect_kind === 'status' && e.status_name }).map(function (e) { return e.status_name }) }
  function summons(id) { return (ctx.D.EFF[id] || []).some(function (e) { return e.effect_kind === 'summon' }) }
  function power(a) { var r = 0; a.sk.parts.forEach(function (p) { r += p.r }); return (r || 1) * (a.sk.hits || 1) }
  function score(u, a, h) {
    var ty = a.sk.ty, sts = statusOf(a.id), sc = 0;
    function lacks(t) { return sts.length && !t.st.some(function (s) { return sts.indexOf(s.n) >= 0 }) }
    if (ty === 'damage') h.forEach(function (t) { sc += power(a) * (1 + 0.3 * (1 - t.hp / t.b.mhp)) + (lacks(t) ? 0.3 : 0) });
    else if (ty === 'heal') h.forEach(function (t) { var miss = 1 - t.hp / t.b.mhp; if (miss > 0.25) sc += miss * 4 });
    else if (ty === 'debuff') h.forEach(function (t) { if (lacks(t)) sc += 1.1 });
    else h.forEach(function (t) { if (lacks(t)) sc += 0.7 });
    if (summons(a.id)) sc += 1.2;
    return sc;
  }
  function bestAt(u, P) {
    var best = null;
    actsOf(u).forEach(function (a) {
      if (!usable(u, a)) return;
      choices(u, a, P).forEach(function (o) { var s = score(u, a, o.h); if (s > 0 && (!best || s > best.s)) best = { a: a, c: o.c, h: o.h, s: s } });
    });
    return best;
  }
  function aiTurn(u) {
    busy = true; pend = null; closeMenu(); paint();
    var plan = null, R = u.moved ? null : reach(u);
    if (R) Object.keys(R).forEach(function (k) {
      var r = R[k], b = bestAt(u, [r.x, r.y]); if (!b) return;
      b.s -= r.d * 0.02; b.k = k;
      if (!plan || b.s > plan.s) plan = b;
    });
    else { plan = bestAt(u, pos(u)); if (plan) plan.k = key(u.tx, u.ty) }
    if (plan) return walk(u, pathTo(plan.k, u)).then(function () { paint(); return cast(u, plan.a, plan.c, plan.h) }).then(function () { return wait(AFTER_MS) });
    var fs = foesOf(u).filter(function (t) { return !S.banished(t) });
    if (!R || !fs.length) { S.wait(u); flushLog(); return wait(AFTER_MS) }
    var bk = null, bs = null;
    Object.keys(R).forEach(function (k) { var r = R[k], near = Math.min.apply(null, fs.map(function (t) { return dmin(fpAt(u, r.x, r.y), cellsOf(t)) })), s = near * 10 + r.d; if (bs == null || s < bs) { bs = s; bk = k } });
    return walk(u, pathTo(bk, u)).then(function () { S.wait(u); flushLog() }).then(function () { return wait(AFTER_MS) });
  }

  /* ---------- 玩家操作 ---------- */
  function go(a, c, h) { var u = cur; busy = true; pend = null; phase = 'busy'; logNews(); closeMenu(); paint(); cast(u, a, c, h).then(function () { return wait(AFTER_MS) }).then(next) }
  function tap(x, y) {
    var who = at(x, y);
    if (!mine()) { if (who) showInfo(who); else hideInfo(); return }
    var self = inFp(cur, x, y);
    if (phase === 'target') {
      var a = skAct(cur, sel) || atkAct(cur), P = pos(cur), c = [x, y], h = hitsAt(cur, a, P, c);
      /* 點到亮起來的目標本身（範圍技的中心不一定在他身上）：挑包含他、打到最多人的中心 */
      if (!h && who && a.a !== 'single') {
        var best = null;
        choices(cur, a, P).forEach(function (o) { if (o.h.indexOf(who) >= 0 && (!best || o.h.length > best.h.length)) best = o });
        if (best) { if (pend && pend.id === a.id && pend.c[0] === best.c[0] && pend.c[1] === best.c[1]) return go(a, best.c, best.h); pend = { id: a.id, c: best.c, h: best.h }; paint(); return }
      }
      if (h) {
        if (a.a === 'single') return go(a, c, h);
        if (pend && pend.id === a.id && pend.c[0] === x && pend.c[1] === y) return go(a, c, h);
        pend = { id: a.id, c: c, h: h }; paint(); return;
      }
      /* 點到別的地方：回選單（點到單位就順便看他的資料） */
      if (who) showInfo(who); else hideInfo();
      return openMenu('menu');
    }
    if (self) { showInfo(cur); return openMenu('menu') }
    /* 移動：還沒移動過、點藍格 → 走過去，走到後跳出選單 */
    if (!cur.moved && cur.R && cur.R[key(x, y)] && cur.R[key(x, y)].d > 0) {
      var u2 = cur, k = key(x, y); pend = null; busy = true; closeMenu(); paint();
      walk(u2, pathTo(k, u2)).then(function () { u2.moved = true; busy = false; openMenu('menu') });
      return;
    }
    if (phase === 'menu' || phase === 'sub') { closeMenu(); phase = 'move'; paint() }
    if (who) showInfo(who); else hideInfo();
  }
  function undoMove() { if (!cur || !cur.moved || busy) return; cur.tx = cur.from[0]; cur.ty = cur.from[1]; cur.moved = false; pend = null; setPos(cur); closeMenu(); phase = 'move'; paint() }
  function doWait() { if (!cur || cur.side !== 'p' || busy) return; busy = true; pend = null; closeMenu(); S.wait(cur); flushLog(); next() }

  function end() {
    if (done) return; done = true; busy = true; cur = null; closeMenu(); hideInfo(); clearCells(); flushLog(); renderQueue(); hint('');
    $('tauto').disabled = true;
    var r = S.res(), w = r === 'win', rw = w && ctx.reward ? ctx.reward({ mons: M0, lead: S.P[0] }) : null;
    var o = el('div', 'tres'); o.innerHTML = '<div class="rbox"><div class="rt ' + (w ? 'win' : 'lose') + '">' + (w ? '勝利' : '失敗') + '</div><p id="trtxt">' +
      (w ? (rw ? rw.html : '打倒了所有敵人！') : (r === 'draw' ? S.MAXR + ' 回合內沒分出勝負，' : '全隊倒下了，') + '這場沒有獎勵，下次再挑戰吧。') + '</p>' +
      '<button type="button" class="go" id="tback">確認結果</button></div>';
    board.appendChild(o); $('tback').onclick = function () { stop(); ctx.onExit() };
    o.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    /* 勝利：跟自動戰鬥同一套存檔（ctx.save）；存好之前不能按確認 */
    if (rw && ctx.save) ctx.save(rw.req, { msg: function (t) { var q = $('trsave'); if (q) q.textContent = t }, lock: function (v) { var b = $('tback'); if (b) b.disabled = v } });
  }
  function onResize() { if (loopOn) { floor(); units.forEach(function (u) { if (u.node) sizeSprite(u) }); if (!menu.hidden) placeMenu() } }
  function stop() { loopOn = false; if (raf) cancelAnimationFrame(raf); raf = 0; done = true }

  /* ctx: {root, title, P, M, D, jobs: job_info 依 u_sn, look(p), msrc(k, now, ph), msz(k), msc(k, boss), lv, bg, onExit()} */
  function start(c) {
    SHOW = []; ctx = c; done = false; busy = false; auto = false; order = null; oi = -1; cur = null; evSeen = 0; lastDraw = 0; sel = null; pend = null; phase = 'move';
    S = BattleEngine.session(c.P, c.M, c.D);
    units = S.U; M0 = c.M.map(function (m) { return { k: m.sprite, n: m.name, boss: m.boss } });
    /* 保護：身上有嘲諷或保護的單位，2 格內的同伴被「單體」攻擊時改由他承受（範圍、直線不算；多人時隨機；雙方都適用） */
    S.hooks.protector = function (t, a) {
      if (S.hooks.area || t.tx == null) return null;
      var L = living().filter(function (x) { return x !== t && x.side === t.side && !S.banished(x) && (S.has(x, 'taunt') || S.has(x, 'protect')) && udist(x, t) <= 2 });
      if (L.length) PROT++;
      return L.length ? L[Math.floor(Math.random() * L.length)] : null;
    };
    /* 反擊類反應技：攻擊者在自己的普攻射程內才發動 */
    S.hooks.counter = function (d, a) { return d.tx == null || a.tx == null || !!hitsAt(d, atkAct(d), pos(d), pos(a)) };
    S.P.forEach(function (u, i) { var s = PSPAWN[i] || [i, 9]; u.tx = s[0]; u.ty = s[1]; u.look = c.look(u.p || {}); u.ph = Math.random() * 2000 });
    var hasBoss = S.M.some(function (m) { return m.boss }), sl = hasBoss ? MSPAWN_BOSS : MSPAWN, j = 0, boss = S.M.filter(function (x) { return x.boss })[0];
    S.M.forEach(function (m) {
      if (m === boss) { m.tx = 4; m.ty = 1 } else { var s = sl[j++] || [j % N, 0]; m.tx = s[0]; m.ty = s[1] }
      m.ph = Math.random() * 900;
    });
    build(); floor(); if (c.tune) tunePanel(); placeUnits(); flushLog(); if (c.tune) zoo();
    loopOn = true; raf = requestAnimationFrame(anim);
    window.removeEventListener('resize', onResize); window.addEventListener('resize', onResize);
    begin();
  }

  root.Tactics = { start: start, _dbg: function () { return { prot: PROT, busy: busy, auto: auto, done: done, cur: cur && cur.name, phase: phase, sel: sel, oi: oi, round: S && S.rounds(), hint: $('thint') && $('thint').textContent } } };
})(this);

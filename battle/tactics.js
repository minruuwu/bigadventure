/* 戰棋模式（第 0 階段，規格見 docs/tactics.md）
   10×10 地圖、依速度輪流、先移動再出手、普通攻擊射程、怪物走近就打、勝負判定。
   數值與結算全部交給 BattleEngine.session（跟自動戰鬥同一份規則），這裡只管站位、移動、選目標。
   還沒做：技能與冷卻、範圍技、王 3×3、召喚、嘲諷／保護射程、小地圖與縮放、獎勵。
   由 battle/index.html 在網址帶 ?tactics=1 時呼叫 Tactics.start(ctx)。 */
(function (root) {
  'use strict';
  var N = 10;
  var STEP_MS = 90, THINK_MS = 320, AFTER_MS = 520;
  /* 普攻射程：劍、斧、錘、匕 1；槍 上下左右直線 1～2；弓 3；書、杖 4 */
  var WRANGE = { '劍': 1, '斧': 1, '錘': 1, '匕': 1, '槍': 2, '弓': 3, '書': 4, '杖': 4 };
  /* 法系怪普攻射程 4（docs/tactics.md：哥布林巫師、黑暗蛛后），其他怪 1。之後要加別的法系怪就加在這裡 */
  var MAGE_MON = { gobw: 1, queen: 1 };
  var PSPAWN = [[4, 8], [6, 8], [3, 9], [5, 9]];
  var MSPAWN = [[4, 1], [5, 1], [3, 1], [6, 1], [2, 1], [7, 1], [4, 0], [5, 0]];
  var MSPAWN_BOSS = [[6, 1], [2, 1], [6, 3], [2, 3], [7, 2], [1, 2], [8, 1], [0, 1]];

  var CSS = '' +
    '#tacv[hidden]{display:none}' +
    '.tq{display:flex;align-items:center;gap:6px;overflow-x:auto;padding:2px 2px 6px;scrollbar-width:none}.tq::-webkit-scrollbar{display:none}' +
    '.tq>span{flex:none;font-size:11px;color:var(--dim);font-weight:700;margin-right:2px}' +
    '.tqi{flex:none;width:34px;height:34px;position:relative;background:#1a120c;box-shadow:0 0 0 2px #3b2713;display:flex;align-items:center;justify-content:center;overflow:hidden}' +
    '.tqi.p{box-shadow:0 0 0 2px #3f6a2c}.tqi.m{box-shadow:0 0 0 2px #8a2a20}.tqi.now{box-shadow:0 0 0 3px #ffd76a}.tqi.done{opacity:.35}' +
    '.tqi canvas,.tqi img{width:32px;height:32px;image-rendering:pixelated;object-fit:contain}' +
    '.tb{position:relative;width:100%;aspect-ratio:1;background:#2a2119;box-shadow:0 0 0 2px var(--edge),inset 0 0 0 2px var(--hi);touch-action:manipulation;user-select:none;-webkit-user-select:none}' +
    '.tg{position:absolute;inset:2px;display:grid;grid-template-columns:repeat(10,1fr);grid-template-rows:repeat(10,1fr)}' +
    '.tc{position:relative;border:0;padding:0;margin:0;background:#3a2e22;box-shadow:inset 0 0 0 1px rgba(0,0,0,.35);cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '.tc.k{background:#342a1f}' +
    '.tc.mv{background:#2f5d9a}.tc.mv.k{background:#2b568f}' +
    '.tc.rg::after{content:"";position:absolute;inset:2px;box-shadow:inset 0 0 0 2px #d4553f;pointer-events:none}' +
    '.tc.tgt{background:#7a2a20}.tc.tgt::after{content:"";position:absolute;inset:1px;box-shadow:inset 0 0 0 3px #ff6a50;pointer-events:none}' +
    '.tc.cur::before{content:"";position:absolute;inset:0;box-shadow:inset 0 0 0 3px #ffd76a;pointer-events:none;z-index:1}' +
    '.tl{position:absolute;inset:2px;pointer-events:none}' +
    '.tu{position:absolute;width:10%;height:10%;transition:left .085s linear,top .085s linear,opacity .4s}' +
    '.tu canvas,.tu img{position:absolute;left:50%;bottom:8%;transform:translateX(-50%);image-rendering:pixelated}' +
    '.tu .hp{position:absolute;left:12%;right:12%;bottom:2%;height:4px;background:#1a0d08;box-shadow:0 0 0 1px #080503}.tu .hp i{display:block;height:100%;background:#5fd36a}.tu.m .hp i{background:#e0503a}' +
    '.tu.dead{opacity:0}' +
    '.tu.hit{animation:thit .25s}@keyframes thit{0%,100%{filter:none}40%{filter:brightness(2.2) saturate(0)}}' +
    '.tf{position:absolute;transform:translate(-50%,0);font-size:14px;font-weight:900;color:#fff;text-shadow:1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;pointer-events:none;white-space:nowrap;animation:tfl .9s ease-out forwards;z-index:5}' +
    '.tf.d{color:#ff8a70}.tf.h{color:#8ef09a}.tf.x{color:#c9d4e0;font-size:12px}' +
    '@keyframes tfl{0%{opacity:0;margin-top:4px}15%{opacity:1;margin-top:0}100%{opacity:0;margin-top:-22px}}' +
    '.tcard{display:grid;grid-template-columns:44px 1fr;gap:10px;align-items:center}' +
    '.tav{width:44px;height:44px;background:#1a120c;box-shadow:0 0 0 2px #6b4a2a;display:flex;align-items:center;justify-content:center;overflow:hidden}.tav canvas,.tav img{width:42px;height:42px;image-rendering:pixelated;object-fit:contain}' +
    '.tnm{font-weight:900;font-size:15px}.tnm small{font-weight:700;font-size:12px;color:var(--dim);margin-left:6px}' +
    '.thp{height:6px;background:#1a0d08;box-shadow:0 0 0 1px #080503;margin-top:4px}.thp i{display:block;height:100%;background:#5fd36a}.thp.m i{background:#e0503a}' +
    '.tbtn{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}' +
    '.tbtn button{font-weight:900;font-size:14px;border:0;background:var(--btn);padding:8px 4px;cursor:pointer;box-shadow:0 0 0 2px #1d1008;line-height:1.25}' +
    '.tbtn button small{display:block;font-size:11px;font-weight:700;color:#c9b48a}' +
    '.tbtn button.on{background:#c9893f;color:#1d1008}.tbtn button.on small{color:#4a2a12}' +
    '.tbtn button:disabled{opacity:.4;cursor:default}' +
    '.thint{font-size:12px;color:var(--gold);margin:0;min-height:1.5em;text-shadow:1px 1px 0 #000;font-weight:700}' +
    '.tres{position:absolute;inset:0;z-index:20;background:rgba(6,4,2,.66);display:flex;align-items:center;justify-content:center;padding:10px}' +
    '#tacv .log{height:150px}';

  var ctx, S, root$, board, layer, cells, units, order, oi, cur, busy, auto, done, evSeen, raf, lastDraw, loopOn;

  function $(id) { return document.getElementById(id) }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  function key(x, y) { return x + ',' + y }
  function dist(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) }
  function pos(u) { return [u.tx, u.ty] }
  function living() { return units.filter(function (u) { return !u.dead }) }
  function foesOf(u) { return living().filter(function (x) { return x.side !== u.side }) }
  function at(x, y) { var r = null; living().forEach(function (u) { if (u.tx === x && u.ty === y) r = u }); return r }

  /* ---------- 規則：移動力、射程、可走格 ---------- */
  function moveOf(u) { return Math.max(1, 4 + Math.floor((S.stat(u, 'speed') - 10) / 2)) }
  function rangeOf(u) { if (u.side === 'p') return WRANGE[u.weapon] || 1; return MAGE_MON[u.sprite] ? 4 : 1 }
  function isSpear(u) { return u.side === 'p' && u.weapon === '槍' }
  function rangeLabel(u) { return isSpear(u) ? '直線 1～2' : String(rangeOf(u)) }
  /* 從 from 格能不能普攻到 to 格 */
  function inRange(u, from, to) {
    var d = dist(from, to); if (d < 1) return false;
    if (isSpear(u)) return (from[0] === to[0] || from[1] === to[1]) && d <= 2;
    return d <= rangeOf(u);
  }
  /* 可移動的格子（含原地）：曼哈頓步數、可穿過友軍、不能穿過敵人、不能停在有人的格子。回傳 {key: {x,y,d,prev}} */
  function reach(u) {
    var mv = moveOf(u), out = {}, q = [[u.tx, u.ty, 0, null]], seen = {};
    seen[key(u.tx, u.ty)] = 1;
    while (q.length) {
      var c = q.shift(), o = at(c[0], c[1]);
      if (!o || o === u) out[key(c[0], c[1])] = { x: c[0], y: c[1], d: c[2], prev: c[3] };
      if (c[2] >= mv) continue;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (s) {
        var nx = c[0] + s[0], ny = c[1] + s[1], k = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen[k]) return;
        var b = at(nx, ny); if (b && b.side !== u.side) return;
        seen[k] = 1; q.push([nx, ny, c[2] + 1, key(c[0], c[1])]);
      });
    }
    return out;
  }
  /* 走到 R[k] 的路徑（不含起點） */
  function pathTo(R, k, u) {
    /* reach 只存了可停留的格子，穿過友軍的中間格要重算：用 BFS 再找一次完整路徑 */
    var tgt = R[k]; if (!tgt) return [];
    var prev = {}, q = [[u.tx, u.ty]], s0 = key(u.tx, u.ty); prev[s0] = null;
    while (q.length) {
      var c = q.shift(), ck = key(c[0], c[1]);
      if (ck === k) break;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (s) {
        var nx = c[0] + s[0], ny = c[1] + s[1], nk = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= N || ny >= N || nk in prev) return;
        var b = at(nx, ny); if (b && b.side !== u.side) return;
        prev[nk] = ck; q.push([nx, ny]);
      });
    }
    var path = [], p = k; while (p && p !== s0) { path.unshift(p.split(',').map(Number)); p = prev[p] }
    return path;
  }
  function targetsFrom(u, from) { return foesOf(u).filter(function (t) { return !S.banished(t) && inRange(u, from, pos(t)) }) }

  /* ---------- 畫面 ---------- */
  function build() {
    if (!$('tacstyle')) { var st = el('style'); st.id = 'tacstyle'; st.textContent = CSS; document.head.appendChild(st) }
    root$ = ctx.root; root$.innerHTML = '';
    var head = el('div', 'bhead', ctx.title + '・戰棋'); root$.appendChild(head);
    var q = el('div', 'tq'); q.id = 'tq'; root$.appendChild(q);
    board = el('div', 'tb'); var g = el('div', 'tg'); cells = [];
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var c = el('button', 'tc' + ((x + y) % 2 ? ' k' : '')); c.type = 'button'; c.dataset.x = x; c.dataset.y = y;
      c.setAttribute('aria-label', '第 ' + (y + 1) + ' 列第 ' + (x + 1) + ' 格'); g.appendChild(c); cells.push(c);
    }
    board.appendChild(g); layer = el('div', 'tl'); board.appendChild(layer); root$.appendChild(board);
    g.addEventListener('click', function (ev) { var c = ev.target.closest('.tc'); if (c) tap(+c.dataset.x, +c.dataset.y) });
    var pn = el('div', 'panel'); pn.style.marginTop = '12px';
    pn.innerHTML = '<div class="tcard"><div class="tav" id="tav"></div><div><div class="tnm" id="tnm"></div><div class="thp" id="thp"><i></i></div></div></div>' +
      '<div class="tbtn"><button type="button" id="tatk" class="on">普通攻擊<small id="tatkr"></small></button><button type="button" id="tundo">↶ 取消移動</button><button type="button" id="twait">待機</button>' +
      '<button type="button" id="tauto">自動<small>剩下交給 AI</small></button><button type="button" id="tquit">離開<small>不算結果</small></button></div>' +
      '<p class="thint" id="thint"></p>';
    root$.appendChild(pn);
    var lp = el('div', 'panel'); lp.style.marginTop = '12px'; lp.innerHTML = '<h2>戰報</h2><div class="log" id="tlog"></div>'; root$.appendChild(lp);
    $('tundo').onclick = undoMove; $('twait').onclick = doWait; $('tatk').onclick = function () { if (cur && cur.side === 'p' && !busy) paint() };
    $('tauto').onclick = function () { if (done) return; auto = true; $('tauto').disabled = true; if (cur && cur.side === 'p' && !busy) { var u = cur; aiTurn(u).then(function () { next() }) } };
    $('tquit').onclick = function () { stop(); ctx.onExit() };
  }
  function sprite(u) {
    if (u.side === 'p') { var c = document.createElement('canvas'); c.width = c.height = 48; return c }
    var im = new Image(); im.draggable = false; im.alt = ''; return im;
  }
  function placeUnits() {
    layer.innerHTML = '';
    units.forEach(function (u) {
      var d = el('div', 'tu ' + u.side); u.node = d; u.sp = sprite(u); d.appendChild(u.sp);
      var hb = el('div', 'hp'); hb.appendChild(el('i')); d.appendChild(hb); u.hpn = hb.firstChild;
      layer.appendChild(d); sizeSprite(u); setPos(u); setHp(u);
    });
  }
  function sizeSprite(u) {
    var cw = board.clientWidth / N;
    if (u.side === 'p') { var s = cw * 1.25; u.sp.style.width = u.sp.style.height = s + 'px'; return }
    var z = ctx.msz(u.sprite), m = Math.max(z[0], z[1]), s2 = cw * (u.boss ? 1.35 : 0.95) / m;
    u.sp.style.width = (z[0] * s2) + 'px'; u.sp.style.height = (z[1] * s2) + 'px';
  }
  function setPos(u) { u.node.style.left = (u.tx * 10) + '%'; u.node.style.top = (u.ty * 10) + '%'; u.node.style.zIndex = 10 + u.ty }
  function setHp(u) { u.hpn.style.width = Math.max(0, Math.min(100, u.hp / u.b.mhp * 100)) + '%'; u.node.classList.toggle('dead', !!u.dead) }
  function float(u, txt, cls) {
    var f = el('div', 'tf ' + cls, txt); f.style.left = (u.tx * 10 + 5) + '%'; f.style.top = (u.ty * 10 - 2) + '%';
    layer.appendChild(f); setTimeout(function () { f.remove() }, 950);
  }
  function anim(now) {
    if (!loopOn) return;
    if (!lastDraw || now - lastDraw >= 100) {
      lastDraw = now;
      units.forEach(function (u) {
        if (u.dead) return;
        if (u.side === 'p') Doll.draw(u.sp, u.look, now + u.ph);
        else { var s = ctx.msrc(u.sprite, now, u.ph); if (s && u.sp.getAttribute('src') !== s) u.sp.src = s }
      });
    }
    raf = requestAnimationFrame(anim);
  }
  function icon(u, size) {
    if (u.side === 'p') { var c = document.createElement('canvas'); c.width = c.height = 48; Doll.draw(c, u.look, 0); return c }
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
    var info = u.side === 'p' ? (u.weapon || '徒手') + '・移動 ' + moveOf(u) + ' 格・普攻射程 ' + rangeLabel(u) : '移動 ' + moveOf(u) + ' 格・普攻射程 ' + rangeLabel(u);
    $('tnm').innerHTML = esc(u.name) + '<small>' + esc(info) + '</small>';
    $('thp').className = 'thp' + (u.side === 'm' ? ' m' : ''); $('thp').firstChild.style.width = Math.max(0, u.hp / u.b.mhp * 100) + '%';
    $('tatkr').textContent = '射程 ' + rangeLabel(u);
  }
  function buttons() {
    var mine = cur && cur.side === 'p' && !auto && !done && !busy;
    $('tatk').disabled = !mine; $('twait').disabled = !mine; $('tundo').disabled = !(mine && cur.moved);
    $('tauto').disabled = auto || done;
  }
  function hint(t) { $('thint').textContent = t || '' }
  function flushLog() {
    var box = $('tlog'); if (!box) return;
    /* 引擎在行動開始時就先開好一行空白戰報、出手後才填字，所以最後一行還是空的就先停，等填完再印 */
    for (; evSeen < S.ev.length; evSeen++) { var e = S.ev[evSeen]; if (!e.txt) { if (evSeen === S.ev.length - 1) break; continue } box.appendChild(el('div', 'lg' + (e.kind === 'round' ? ' rd' : '') + (e.dead || e.pko ? ' ko' : ''), e.txt)) }
    box.scrollTop = box.scrollHeight;
  }
  /* 塗格子：沒移動過 → 藍色可移動 + 紅框普攻射程；可以打的敵人 → 紅底 */
  function paint() {
    cells.forEach(function (c) { c.className = 'tc' + ((+c.dataset.x + +c.dataset.y) % 2 ? ' k' : '') });
    if (!cur || done) return;
    cell(cur.tx, cur.ty).classList.add('cur');
    if (cur.side !== 'p' || auto || busy) return;
    if (!cur.moved) { cur.R = reach(cur); Object.keys(cur.R).forEach(function (k) { var r = cur.R[k]; if (r.d > 0) cell(r.x, r.y).classList.add('mv') }) }
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) if (inRange(cur, pos(cur), [x, y])) cell(x, y).classList.add('rg');
    targetsFrom(cur, pos(cur)).forEach(function (t) { cell(t.tx, t.ty).classList.add('tgt') });
    var n = targetsFrom(cur, pos(cur)).length;
    hint(cur.moved ? (n ? '點紅色的敵人攻擊，或按「待機」。' : '射程內沒有敵人：按「待機」或「取消移動」。') : '點藍色格子移動，或直接點紅色的敵人攻擊；出手後就不能再移動。');
    buttons();
  }
  function cell(x, y) { return cells[y * N + x] }

  /* ---------- 流程 ---------- */
  function snapHp() { var o = new Map(); units.forEach(function (u) { o.set(u, { hp: u.hp, dead: u.dead }) }); return o }
  function showDiff(before, target) {
    units.forEach(function (u) {
      var b = before.get(u); if (!b) { b = { hp: u.b.mhp, dead: false } }
      var d = Math.round(u.hp - b.hp);
      if (d < 0) { float(u, String(d), 'd'); u.node.classList.remove('hit'); void u.node.offsetWidth; u.node.classList.add('hit') }
      else if (d > 0) float(u, '+' + d, 'h');
      else if (u === target && !u.dead) float(u, '未命中', 'x');
      setHp(u);
    });
  }
  function lunge(u, t) {
    var dx = t.tx - u.tx, dy = t.ty - u.ty, L = Math.max(1, Math.abs(dx) + Math.abs(dy)), k = Math.min(0.35, 0.35 / L * 1.5);
    u.node.style.left = ((u.tx + dx * k) * 10) + '%'; u.node.style.top = ((u.ty + dy * k) * 10) + '%';
    return wait(110).then(function () { setPos(u); return wait(90) });
  }
  function walk(u, path) {
    var p = Promise.resolve();
    path.forEach(function (c) { p = p.then(function () { u.tx = c[0]; u.ty = c[1]; setPos(u); return wait(STEP_MS) }) });
    return p;
  }
  function attack(u, t) {
    var before = snapHp();
    return lunge(u, t).then(function () {
      S.finish(u, { sk: 'atk', tg: [t] });
      showDiff(before, t); flushLog(); renderCard(cur);
    });
  }
  function begin() {
    if (done) return;
    if (!S.alive(S.P) || !S.alive(S.M)) return end();
    if (!order || oi >= order.length - 1) { if (S.over()) return end(); order = S.round(); oi = -1; flushLog() }
    oi++;
    var u = order[oi];
    if (!u || u.dead) return next();
    if (!S.alive(S.P) || !S.alive(S.M)) return end();
    cur = u; u.moved = false; u.from = pos(u);
    renderQueue(); renderCard(u);
    var before = snapHp(), ok = S.start(u);
    showDiff(before, null); flushLog();
    if (!ok) { paint(); return wait(AFTER_MS).then(next) }
    if (u.side === 'p' && !auto) { busy = false; paint(); buttons(); return }
    busy = true; paint(); buttons();
    return wait(THINK_MS).then(function () { return aiTurn(u) }).then(next);
  }
  function next() { if (done) return; busy = false; paint(); if (!S.alive(S.P) || !S.alive(S.M)) return end(); setTimeout(begin, 60) }
  /* 第 0 階段 AI：打得到就打（挑生命比例最低的）；打不到就走到打得到的格子，再不行就往最近的敵人靠 */
  function aiTurn(u) {
    busy = true; buttons(); paint();
    var tg = targetsFrom(u, pos(u));
    if (tg.length) return attack(u, pickTarget(tg)).then(function () { return wait(AFTER_MS) });
    if (u.moved) { S.wait(u); flushLog(); return wait(AFTER_MS) }
    var R = reach(u), best = null, bs = null, fs = foesOf(u).filter(function (t) { return !S.banished(t) });
    if (!fs.length) { S.wait(u); flushLog(); return wait(AFTER_MS) }
    Object.keys(R).forEach(function (k) {
      var r = R[k], p = [r.x, r.y], can = fs.some(function (t) { return inRange(u, p, pos(t)) });
      var near = Math.min.apply(null, fs.map(function (t) { return dist(p, pos(t)) }));
      /* 分數：能打到最優先；其次離最近的敵人越近越好（遠程怪不會硬貼上去）；再其次少走一點 */
      var sc = (can ? 0 : 1000) + (can ? 0 : near * 10) + r.d;
      if (bs == null || sc < bs) { bs = sc; best = k }
    });
    var path = best ? pathTo(R, best, u) : [];
    return walk(u, path).then(function () {
      paint();
      var t2 = targetsFrom(u, pos(u));
      if (t2.length) return attack(u, pickTarget(t2));
      S.wait(u); flushLog();
    }).then(function () { return wait(AFTER_MS) });
  }
  function pickTarget(list) { return list.slice().sort(function (a, b) { return a.hp / a.b.mhp - b.hp / b.b.mhp })[0] }

  /* ---------- 玩家操作 ---------- */
  function tap(x, y) {
    var who = at(x, y);
    if (!cur || cur.side !== 'p' || auto || busy || done) { if (who) peek(who); return }
    if (who && who.side !== cur.side) {
      if (inRange(cur, pos(cur), [x, y]) && !S.banished(who)) { var u = cur; busy = true; buttons(); paint(); attack(u, who).then(function () { return wait(AFTER_MS) }).then(next); return }
      peek(who); return;
    }
    if (!cur.moved && cur.R) {
      var k = key(x, y), r = cur.R[k];
      if (r && r.d > 0) { var u2 = cur, path = pathTo(cur.R, k, cur); busy = true; buttons(); paint(); walk(u2, path).then(function () { u2.moved = true; busy = false; paint() }); return }
    }
    if (who) peek(who);
  }
  function peek(u) { hint(u.name + '　生命 ' + Math.max(0, Math.round(u.hp)) + '/' + u.b.mhp + '・移動 ' + moveOf(u) + '・普攻射程 ' + rangeLabel(u)) }
  function undoMove() { if (!cur || !cur.moved || busy) return; cur.tx = cur.from[0]; cur.ty = cur.from[1]; cur.moved = false; setPos(cur); paint() }
  function doWait() { if (!cur || cur.side !== 'p' || busy) return; busy = true; S.wait(cur); flushLog(); next() }

  function end() {
    if (done) return; done = true; busy = true; cur = null; paint(); buttons(); flushLog(); renderQueue();
    var r = S.res(), w = r === 'win';
    var o = el('div', 'tres'); o.innerHTML = '<div class="rbox"><div class="rt ' + (w ? 'win' : 'lose') + '">' + (w ? '勝利' : '失敗') + '</div><p>' +
      (w ? '打倒了所有敵人！' : r === 'draw' ? S.MAXR + ' 回合內沒分出勝負。' : '全隊倒下了。') + '<br><small>戰棋測試中，這場不會給獎勵</small></p>' +
      '<button type="button" class="go" id="tback">回地圖</button></div>';
    board.appendChild(o); $('tback').onclick = function () { stop(); ctx.onExit() };
  }
  function onResize() { if (loopOn) units.forEach(sizeSprite) }
  function stop() { loopOn = false; if (raf) cancelAnimationFrame(raf); raf = 0; done = true }

  /* ctx: {root, title, P: 玩家單位陣列, M: 怪物單位陣列, D, look(p), msrc(k, now, ph), msz(k), onExit()} */
  function start(c) {
    ctx = c; done = false; busy = false; auto = false; order = null; oi = -1; cur = null; evSeen = 0; lastDraw = 0;
    S = BattleEngine.session(c.P, c.M, c.D);
    units = S.U;
    S.P.forEach(function (u, i) { var s = PSPAWN[i] || [i, 9]; u.tx = s[0]; u.ty = s[1]; u.look = c.look(u.p || {}); u.ph = Math.random() * 2000 });
    var hasBoss = S.M.some(function (m) { return m.boss }), sl = hasBoss ? MSPAWN_BOSS : MSPAWN, j = 0;
    S.M.slice().sort(function (a, b) { return (b.boss ? 1 : 0) - (a.boss ? 1 : 0) }).forEach(function (m) {
      if (m.boss && hasBoss && m === S.M.filter(function (x) { return x.boss })[0]) { m.tx = 4; m.ty = 1 } else { var s = sl[j++] || [j % N, 0]; m.tx = s[0]; m.ty = s[1] }
      m.ph = Math.random() * 900;
    });
    build(); placeUnits(); flushLog();
    loopOn = true; raf = requestAnimationFrame(anim);
    window.removeEventListener('resize', onResize); window.addEventListener('resize', onResize);
    begin();
  }

  root.Tactics = { start: start, _rules: { reach: function (u) { return reach(u) }, inRange: inRange, moveOf: function (u) { return moveOf(u) } } };
})(this);

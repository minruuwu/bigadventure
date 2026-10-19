/* 正式戰鬥引擎：純計算，不碰畫面。
   BattleEngine.prepare(csv) 把各張表整理成查詢用的資料；
   BattleEngine.player(p, D, opt) / BattleEngine.monster(row, stage, D) 建立參戰單位；
   BattleEngine.run(players, monsters, D) 回傳 {ev, res, rounds}，ev 是逐行的戰報與動畫事件。
   規則依設計文件：狀態持續 = 持有者接下來 N 次行動；持續傷害／回復在每次行動開始時結算（昏睡中也算）；
   同來源重複施加刷新、不同來源各自獨立；控制對 Boss 機率減半；多段每下各自判定命中與暴擊；混合傷害只判定一次。 */
(function (root) {
  'use strict';
  var RND = Math.random;
  var ELS = ['fire', 'frost', 'lightning', 'wind', 'nature', 'light', 'dark'];
  var ELN = { fire: '火焰', frost: '冰霜', lightning: '雷電', wind: '疾風', nature: '自然', light: '光明', dark: '黑暗' };
  var CONTROL = { stun: 1, sleep: 1, confuse: 1, seal: 1, petrify: 1, charm: 1, banish: 1 };
  var NOBOSS = { charm: 1, banish: 1 };
  var PSLOT = [1, 30, 60, 90];
  var MAXR = 30;

  function num(x) { var v = parseFloat(String(x == null ? '' : x).replace('%', '')); return isNaN(v) ? 0 : v }
  function pn(x) { var s = String(x == null ? '' : x); return /%/.test(s) ? num(s) / 100 : num(s) }
  function rnd(a, b) { return a + Math.floor(RND() * (b - a + 1)) }
  function pickOne(a) { return a[Math.floor(RND() * a.length)] }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x }

  /* ---------- 資料整理 ---------- */
  function prepare(c) {
    var D = { SK: {}, EFF: {}, STS: {}, attr: {}, grow: {}, wpn: {}, pet: {}, mon: {}, stage: [] };
    (c.skill_info || []).forEach(function (r) {
      if (!r.skill_id) return;
      var parts = [];
      if (r.part1_dmg) parts.push({ d: r.part1_dmg, e: r.part1_element || '', r: num(r.part1_ratio) });
      if (r.part2_dmg) parts.push({ d: r.part2_dmg, e: r.part2_element || '', r: num(r.part2_ratio) });
      D.SK[r.skill_id] = { id: r.skill_id, n: r.skill_name, j: r.job, lv: parseInt(r.job_level, 10) || 0, kind: r.kind, t: r.target, p: r.pick, ty: r.type,
        cr: num(r.extra_crit_rate), cd: num(r.extra_crit_damage), parts: parts, vfx: r.vfx || '', hits: parseInt(r.hits, 10) || 1, sure: r.sure_hit === '1', ds: r.skill_desc || '' };
    });
    D.SK.atk = { id: 'atk', n: '普通攻擊', kind: 'combat', t: 'enemy_single', p: 'random', ty: 'damage', cr: 0, cd: 0, parts: [{ d: 'p', e: '', r: 1 }], vfx: '', hits: 1, atk: true };
    (c.skill_effect || []).forEach(function (r) { if (r.skill_id) (D.EFF[r.skill_id] = D.EFF[r.skill_id] || []).push(r) });
    var last = null;
    (c.status_info || []).forEach(function (r) {
      var n = r.status_name || last; if (!n) return; last = n;
      var s = D.STS[n] || (D.STS[n] = { n: n, pol: r.polarity || 'buff', rows: [], d: '' });
      if (r.polarity) s.pol = r.polarity; if (r.status_desc && !s.d) s.d = r.status_desc;
      if (r.effect) s.rows.push({ k: r.effect, v: num(r.value), base: r.base || '', el: r.element || '', dt: r.dmg_type || '' });
    });
    (c.job_attribute || []).forEach(function (r) { if (r.u_sn) D.attr[r.u_sn] = r });
    (c.job_level_up || []).forEach(function (r) { if (r.u_sn) D.grow[r.u_sn] = r });
    (c.weapon_info || []).forEach(function (r) { if (r.u_sn) D.wpn[r.u_sn] = r });
    (c.pet_info || []).forEach(function (r) { if (r.pet_id) D.pet[r.pet_id] = { stat: r.bonus_stat, per: pn(r.bonus_per_level) } });
    (c.monster_info || []).forEach(function (r) { if (r.monster_id) D.mon[r.monster_id] = r });
    (c.stage_info || []).forEach(function (r) { if (r.area_id) D.stage.push(r) });
    D.wbyname = {}; Object.keys(D.wpn).forEach(function (k) { D.wbyname[D.wpn[k].weapon_name] = k });
    return D;
  }
  function stageRow(D, area, l) { var x = null; D.stage.forEach(function (r) { if (r.area_id === area && (parseInt(r.stage, 10) || 0) === l) x = r }); return x }

  /* ---------- 建立玩家單位（算法跟角色頁、營地一致） ---------- */
  function jobSn(p) { return p.jobSn || ('job' + ('0' + ((p.job | 0) + 1)).slice(-2)) }
  function learned(p, sk) { var jl = p.jobLv || {}; return !!sk && (sk.id === 'atk' || (/^job\d+$/.test(sk.j || '') && (jl[sk.j] | 0) >= sk.lv)) }
  function player(p, D, opt) {
    opt = opt || {};
    var jl = p.jobLv || {}, lv = Math.max(1, p.lv | 0 || 1), sv = p.skills || {}, ws = D.wbyname[p.weapon] || '';
    var wd = (p.weapons && p.weapons[ws]) || {}, wlv = Math.max(1, wd.lv | 0 || 1), en = Array.isArray(wd.ench) ? wd.ench : [];
    var pts = [0, 1, 2].map(function (q) { return Array.isArray(wd.pts) ? Math.max(0, wd.pts[q] | 0) : 0 });
    function rOn(id) { return en.indexOf(id) >= 0 }
    var pas = (Array.isArray(sv.passive) ? sv.passive : []).filter(function (id, q) { var k = D.SK[id]; return k && lv >= PSLOT[q] && learned(p, k) });
    var self = {}, aura = [], special = [];
    pas.forEach(function (id) { (D.EFF[id] || []).forEach(function (e) {
      if (e.effect_kind !== 'passive' || !e.effect) return;
      if (e.condition && /^weapon/.test(e.condition) && e.condition !== ws) return;
      var v = num(e.value);
      if (e.trigger || ['revive_self', 'forge_bonus', 'exp_bonus', 'apply_status'].indexOf(e.effect) >= 0) { special.push({ id: id, k: e.effect, v: v, ch: num(e.trigger_chance) || 1, tr: e.trigger, st: e.status_name, turns: e.turns, cond: e.condition, el: e.element, dt: e.dmg_type }); return }
      self[e.effect] = (self[e.effect] || 0) + v;
      if (e.target === 'ally_all') aura.push({ id: id, k: e.effect, v: v });
      else if (['lifesteal', 'extra_dmg', 'heal_echo', 'auto_cleanse'].indexOf(e.effect) >= 0) special.push({ id: id, k: e.effect, v: v, el: e.element, dt: e.dmg_type });
    }) });
    function sp(k) { return self[k] || 0 }
    var T = {};
    ['str', 'int', 'agi', 'vit', 'luk'].forEach(function (k) {
      var j = 0; Object.keys(jl).forEach(function (s) { var l = jl[s] | 0, g = D.grow[s]; if (l > 0 && g) j += num(g['per_level_' + k]) * l });
      var bs = 10 + j + ((p.alloc || {})[k] | 0); T[k] = bs + (rOn('rune08') ? Math.round(bs * 0.1) : 0);
    });
    var at = D.attr[jobSn(p)] || {}, row = D.wpn[ws];
    function wsum(key) { var t = 0; if (!row) return 0; for (var q = 1; q <= 6; q++) { if (row['auto_stat_' + q] !== key) continue; var per = String(row['auto_per_level_' + q] || '').trim(), v = num(per) * wlv; t += /%/.test(per) ? v / 100 : v }
      for (var u = 1; u <= 3; u++) { if (row['temper_stat_' + u] !== key || !pts[u - 1]) continue; t += num(row['temper_per_point_' + u]) * pts[u - 1] / 100 } return t }
    function ps(stat) { var t = 0, pe = p.pets || {}; Object.keys(D.pet).forEach(function (id) { var pi = D.pet[id]; if (pi.stat !== stat) return; t += pi.per * clamp(((pe[id] || {}).lv) | 0, 0, 10) }); return t }
    var v = T.vit, s = T.str, i = T.int, a = T.agi, l = T.luk, apa = sp('atk_per_ally') * (opt.allies || 0);
    var P0 = Math.round((s + wsum('p_atk') + Math.round(v * sp('vit_to_p_atk'))) * (1 + pn(at.p_atk_bonus) + sp('p_atk_rate') + apa));
    var M0 = Math.round((i + wsum('m_atk') + Math.round(s * sp('str_to_m_atk'))) * (1 + pn(at.m_atk_bonus) + sp('m_atk_rate') + apa)), bP = 0, bM = 0;
    if (rOn('rune09')) { var hi = Math.max(P0, M0), lo = Math.min(P0, M0), ad = Math.max(0, Math.min(Math.round(hi * 0.5), hi - lo)); if (P0 > M0) bM = ad; else if (M0 > P0) bP = ad }
    var r5 = rOn('rune05') ? 0.2 : 0;
    var mhp = Math.round((v * 5 + 10 * (lv - 1) + Math.round(a * sp('agi_to_hp') * 5) + Math.round(i * sp('int_to_hp') * 5) + Math.round((P0 + bP) * sp('p_atk_to_hp'))) * (1 + pn(at.hp_bonus) + wsum('hp_rate') + sp('hp_rate')));
    var res = {}; ELS.forEach(function (e) { res[e] = pn(at[e + '_res_rate_bonus']) + sp(e + '_res_rate') });
    var u = {
      side: 'p', name: p.name || '冒險者', uid: p.uid, boss: false,
      b: { mhp: Math.max(1, mhp), patk: P0 + bP, matk: M0 + bM, pdmg: wsum('p_damage_rate') + sp('p_damage_rate'), mdmg: wsum('m_damage_rate') + sp('m_damage_rate'),
        eva: a / (a + 800) + pn(at.eva_rate_bonus) + wsum('eva_rate') + ps('eva_rate') + sp('eva_rate'),
        crit: a / (a + 500) + pn(at.crit_rate_bonus) + wsum('crit_rate') + r5 + sp('crit_rate'),
        cdmg: 0.5 + l * 0.01 + pn(at.crit_damage_rate_bonus) + wsum('crit_damage_rate') + (r5 ? 1 : 0) + sp('crit_damage_rate'),
        pred: pn(at.p_def_bonus) + wsum('p_reduce_rate') + ps('p_reduce_rate') + (rOn('rune06') ? 0.2 : 0) + sp('p_reduce_rate'),
        mred: pn(at.m_def_bonus) + wsum('m_reduce_rate') + ps('m_reduce_rate') + (rOn('rune07') ? 0.2 : 0) + sp('m_reduce_rate'),
        res: res, heal: sp('heal_rate'), speed: 10 + num(at.speed_bonus) + a / 20, hit: 0 },
      cycle: (Array.isArray(sv.combat) ? sv.combat : []).slice(0, 4).map(function (id) { return id && D.SK[id] && D.SK[id].kind === 'combat' && learned(p, D.SK[id]) ? id : 'atk' }),
      reaction: sv.reaction && D.SK[sv.reaction] && learned(p, D.SK[sv.reaction]) ? sv.reaction : '',
      aura: aura, special: special, runes: en.slice(), weapon: p.weapon || '', p: p,
      apa: sp('atk_per_ally'), apaN: opt.allies || 0, pB: s + wsum('p_atk') + Math.round(v * sp('vit_to_p_atk')), mB: i + wsum('m_atk') + Math.round(s * sp('str_to_m_atk')),
      learned: Object.keys(D.SK).map(function (id) { return D.SK[id] }).filter(function (k) { return k.kind === 'combat' && k.id !== 'atk' && k.j && k.j !== 'monster' && learned(p, k) })
    };
    while (u.cycle.length < 4) u.cycle.push('atk');
    if (rOn('rune24')) { u.b.pdmg += u.b.pred; u.b.mdmg += u.b.mred }
    return u;
  }

  /* ---------- 建立怪物單位 ---------- */
  function monster(r, stg, D) {
    var hg = num(r.hp_growth), ag = num(r.atk_growth), k = stg - 1, res = {};
    ELS.forEach(function (e) { res[e] = num(r[e + '_res_rate']) });
    var cyc = [r.skill_1, r.skill_2, r.skill_3, r.skill_4].map(function (x) { x = String(x || '').trim(); return x && (x === 'atk' || D.SK[x]) ? x : 'atk' });
    return { side: 'm', name: r.monster_name, mid: r.monster_id, sprite: r.sprite, boss: r.boss === '1',
      b: { mhp: Math.round(num(r.hp) * (1 + hg * k)), patk: Math.round(num(r.p_atk) * (1 + ag * k)), matk: Math.round(num(r.m_atk) * (1 + ag * k)), pdmg: 0, mdmg: 0,
        eva: num(r.eva_rate), crit: num(r.crit_rate), cdmg: num(r.crit_damage_rate) || 0.5, pred: num(r.p_reduce_rate), mred: num(r.m_reduce_rate), res: res, heal: 0, speed: num(r.speed) || 10, hit: 0 },
      cycle: cyc, reaction: (r.reaction && D.SK[String(r.reaction).trim()]) ? String(r.reaction).trim() : '', aura: [], special: [], runes: [] };
  }

  /* 一關要出哪些怪：一般關從怪物池隨機（min_count～max_count 隻，不看隊伍人數），Boss 關固定 */
  function stageMonsters(D, area, l, nParty) {
    var r = stageRow(D, area, l); if (!r) return [];
    var fixed = String(r.fixed_monsters || '').split(';').filter(Boolean), out = [];
    if (fixed.length) fixed.forEach(function (id) { if (D.mon[id]) out.push(monster(D.mon[id], l, D)) });
    else {
      var pool = String(r.monster_pool || '').split(';').filter(function (id) { return D.mon[id] }), mx = num(r.max_count) || 1, mn = Math.min(num(r.min_count) || 1, mx), n = rnd(mn, mx);
      for (var q = 0; q < n && pool.length; q++) out.push(monster(D.mon[pickOne(pool)], l, D));
    }
    var hs = 1 + num(r.party_hp_scale) * Math.max(0, nParty - 1); out.forEach(function (m) { m.b.mhp = Math.round(m.b.mhp * hs) }); /* 人多時怪物血量加成 */
    var cnt = {}, seen = {}; out.forEach(function (m) { cnt[m.name] = (cnt[m.name] || 0) + 1 });
    out.forEach(function (m) { if (cnt[m.name] > 1) { seen[m.name] = (seen[m.name] || 0) + 1; m.name += ' ' + 'ABCDE'[seen[m.name] - 1] } });
    out.sort(function (a, b) { return (a.boss ? 1 : 0) - (b.boss ? 1 : 0) });
    return out;
  }

  /* ---------- 戰鬥 ---------- */
  function run(P, M, D) {
    var U = P.concat(M), ev = [], rounds = 0, nowAct = null;
    P.forEach(function (u, i) { u.i = i }); M.forEach(function (u, i) { u.i = i });
    /* 獨狼：開戰時沒有隊友（一人上陣）→ 生命、物攻、魔攻 ×1.5；隊友中途陣亡不算 */
    var lone = P.length === 1 && !P[0].lone;
    if (lone) { var L0 = P[0]; L0.lone = true; L0.b.mhp = Math.round(L0.b.mhp * 1.5); L0.b.patk = Math.round(L0.b.patk * 1.5); L0.b.matk = Math.round(L0.b.matk * 1.5) }
    U.forEach(function (u) { u.hp = u.b.mhp; u.st = []; u.cy = 0; u.dead = false; u.used = {}; u.flags = {}; u.dragon = 0.5 });
    /* 靈氣：同一招只算一次，套到同陣營每個人（自己的已算在基礎值） */
    var auraSeen = {};
    P.forEach(function (src) { src.aura.forEach(function (a) { var key = a.id + '|' + a.k; if (auraSeen[key]) return; auraSeen[key] = src; }) });
    function auraVal(u, k) { if (u.side !== 'p') return 0; var t = 0; Object.keys(auraSeen).forEach(function (key) { var src = auraSeen[key]; if (src === u || src.dead) return; src.aura.forEach(function (a) { if (a.id + '|' + a.k === key && a.k === k) t += a.v }) }); return t }

    /* --- 屬性（基礎 + 狀態 + 靈氣） --- */
    function sv(u, k) { var t = 0; u.st.forEach(function (s) { if (s.paused) return; s.rows.forEach(function (r) { if (r.k === k) t += r.v }) }); return t }
    function has(u, k) { return u.st.some(function (s) { return !s.paused && s.rows.some(function (r) { return r.k === k }) }) }
    function stat(u, k) {
      var b = u.b;
      switch (k) {
        case 'patk': return (b.patk + apaAdj(u, 'pB')) * (1 + sv(u, 'p_atk_rate') + 0.5 * sv(u, 'str_rate') + (u.runes.indexOf('rune18') >= 0 ? u.dragon : 0));
        case 'matk': return (b.matk + apaAdj(u, 'mB')) * (1 + sv(u, 'm_atk_rate') + 0.5 * sv(u, 'int_rate') + (u.runes.indexOf('rune18') >= 0 ? u.dragon : 0));
        case 'pdmg': return b.pdmg + sv(u, 'p_damage_rate') + auraVal(u, 'p_damage_rate');
        case 'mdmg': return b.mdmg + sv(u, 'm_damage_rate') + auraVal(u, 'm_damage_rate');
        case 'pred': return b.pred + sv(u, 'p_reduce_rate') + auraVal(u, 'p_reduce_rate');
        case 'mred': return b.mred + sv(u, 'm_reduce_rate') + auraVal(u, 'm_reduce_rate');
        case 'eva': return b.eva + sv(u, 'eva_rate');
        case 'crit': return b.crit + sv(u, 'crit_rate') + auraVal(u, 'crit_rate');
        case 'cdmg': return b.cdmg + sv(u, 'crit_damage_rate');
        case 'speed': return b.speed + sv(u, 'speed');
        case 'hit': return sv(u, 'hit_rate');
      }
      return 0;
    }
    /* 觀眾熱情：開戰時已照隊友人數算進攻擊力；隊友倒下（或復活）時即時調整 */
    function apaAdj(u, k) { if (!u.apa) return 0; var n = Math.min(3, P.filter(function (x) { return x !== u && !x.dead }).length); return u[k] * u.apa * (n - u.apaN) }
    function resOf(u, el) { if (!el) return 0; var r = (u.b.res[el] || 0) + sv(u, el + '_res_rate') + auraVal(u, el + '_res_rate'); u.st.forEach(function (s) { if (s.randEl === el) r += s.randV }); return r }

    /* --- 戰報 --- */
    function line(o) { ev.push(o); return o }
    function hpSnap() { return { p: P.map(function (u) { return Math.max(0, Math.round(u.hp)) }), m: M.map(function (u) { return Math.max(0, Math.round(u.hp)) }) } }
    function addStat(e, u, kind, v, sk) { if (u.side !== 'p' || !v) return; (e.st = e.st || []).push([u.i, kind, Math.round(v), sk]) }

    /* --- 狀態 --- */
    function applyStatus(src, tgt, name, turns, chance, e, skName) {
      var def = D.STS[name]; if (!def || tgt.dead) return false;
      var ctl = def.rows.some(function (r) { return CONTROL[r.k] }), nob = def.rows.some(function (r) { return NOBOSS[r.k] });
      if (tgt.boss && nob) return false;
      var ch = chance == null || chance === '' ? 1 : num(chance); if (tgt.boss && ctl) ch /= 2;
      if (RND() >= ch) return false;
      var t = turns === 'attack' ? 'attack' : (parseInt(turns, 10) || 1);
      var old = null; tgt.st.forEach(function (s) { if (s.n === name && s.src === src) old = s });
      var rows = def.rows.map(function (r) {
        var o = { k: r.k, v: r.v, el: r.el, dt: r.dt };
        if (r.k === 'dot' || r.k === 'hot' || r.k === 'banish') o.amt = r.v * (r.base === 'p_atk' ? stat(src, 'patk') : stat(src, 'matk'));
        if (r.k === 'shield') o.amt = r.base === 'm_atk' ? r.v * stat(src, 'matk') : r.base === 'p_atk' ? r.v * stat(src, 'patk') : r.v;
        return o;
      });
      var s = { n: name, src: src, turns: t, rows: rows, pol: def.pol, fresh: tgt === nowAct };
      rows.forEach(function (r) { if (r.k === 'shield') s.shield = r.amt; if (r.k === 'rand_res_rate') { s.randEl = pickOne(ELS); s.randV = r.v } });
      if (old) { var i = tgt.st.indexOf(old); tgt.st[i] = s } else tgt.st.push(s);
      if (rows.some(function (r) { return r.k === 'banish' })) { s.banish = true; tgt.st.forEach(function (x) { if (x !== s) x.paused = true }) }
      if (e) { e._st = e._st || {}; (e._st[name] = e._st[name] || []).push(tgt.name) }
      return true;
    }
    function removeStatus(u, s) { var i = u.st.indexOf(s); if (i >= 0) u.st.splice(i, 1) }
    function debuffs(u) { return u.st.filter(function (s) { return s.pol === 'debuff' && !s.paused }) }
    function hasHot(u) { return u.st.some(function (s) { return s.rows.some(function (r) { return r.k === 'hot' }) }) }
    function banished(u) { return u.st.some(function (s) { return s.banish }) }
    function ctrl(u, k) { return u.st.some(function (s) { return !s.paused && s.rows.some(function (r) { return r.k === k }) }) }

    /* --- 陣營與選目標 --- */
    function foes(u) { var a = u.side === 'p' ? M : P; return a.filter(function (x) { return !x.dead }) }
    function friends(u) { var a = u.side === 'p' ? P : M; return a.filter(function (x) { return !x.dead }) }
    function targetable(list) { var ok = list.filter(function (x) { return !banished(x) }); return ok.length ? ok : list }
    function pickTargets(u, sk, charmed, confused) {
      var t = sk.t, F = charmed ? friends(u) : foes(u), A = charmed ? foes(u) : friends(u);
      if (charmed) F = F.filter(function (x) { return x !== u });
      var stn = ((D.EFF[sk.id] || []).filter(function (e) { return e.effect_kind === 'status' })[0] || {}).status_name;
      if (confused && t !== 'self') { var all = U.filter(function (x) { return !x.dead && x !== u }); if (!all.length) return []; return t === 'enemy_all' || t === 'ally_all' || t === 'ally_others' ? all : [pickOne(all)] }
      if (t === 'self') return [u];
      if (t === 'enemy_all') return targetable(F);
      if (t === 'ally_all') return A;
      if (t === 'ally_others') return A.filter(function (x) { return x !== u });
      if (t === 'ally_single') return A.length ? [choose(A, sk.p, stn)] : [];
      if (t === 'enemy_single') {
        var c = targetable(F); if (!c.length) return [];
        var tn = c.filter(function (x) { return has(x, 'taunt') }); if (tn.length && !charmed) c = tn;
        return [choose(c, sk.p, stn)];
      }
      return [];
    }
    function choose(list, pick, stn) {
      if (pick === 'lowest_hp') return list.reduce(function (b, x) { return x.hp / x.b.mhp < b.hp / b.b.mhp ? x : b }, list[0]);
      if (pick === 'prefer_without_status' && stn) { var w = list.filter(function (x) { return !x.st.some(function (s) { return s.n === stn }) }); if (w.length) return pickOne(w) }
      if (pick === 'prefer_with_debuff') { var d = list.filter(function (x) { return debuffs(x).length }); if (d.length) return pickOne(d) }
      return pickOne(list);
    }

    /* --- 傷害 --- */
    function dmgOnce(a, d, parts, sk, o) {
      /* o: {mult, extraCrit, sure, noReact} → {miss, crit, amt, blocked, absorbed, txt} */
      o = o || {};
      if (banished(d)) return { amt: 0, void: true };
      var isP = parts.some(function (x) { return x.d === 'p' }), isM = parts.some(function (x) { return x.d === 'm' });
      var r = { miss: false, crit: false, amt: 0 };
      if (!o.sure && !sk.sure) { var hc = 1 - stat(d, 'eva') + stat(a, 'hit') + sv(d, 'hit_taken_rate'); if (RND() >= clamp(hc, 0.05, 1)) { r.miss = true; return r } }
      /* 反應技（受擊前） */
      var re = o.noReact ? null : react(d, a, isP, isM, parts);
      if (re && re.block) { r.blocked = true; r.re = re; return r }
      var cr = stat(a, 'crit') + (sk.cr || 0) + (o.extraCrit || 0) + sv(d, 'crit_taken_rate');
      var sureCrit = o.sureCrit || has(a, 'sure_crit_next');
      r.crit = sureCrit || RND() < cr;
      var cm = r.crit ? 1 + stat(a, 'cdmg') + (sk.cd || 0) : 1, tot = 0, byEl = {};
      parts.forEach(function (x) {
        var atk = x.d === 'm' ? stat(a, 'matk') : stat(a, 'patk'), inc = x.d === 'm' ? stat(a, 'mdmg') : stat(a, 'pdmg'), red = x.d === 'm' ? stat(d, 'mred') : stat(d, 'pred');
        var v = atk * x.r * (1 + inc) * (1 - Math.min(red, 0.9)) * (1 - Math.min(resOf(d, x.e), 0.9)) * (1 + sv(d, 'dmg_taken_rate')) * cm * (o.mult || 1) * (0.95 + RND() * 0.1);
        if (re && re.reduce) v *= 1 - re.reduce;
        byEl[x.e] = (byEl[x.e] || 0) + v; tot += v;
      });
      if (re && re.absorb) { var ab = 0; re.absorb.forEach(function (el) { ab += byEl[el] || 0 }); if (ab > 0) { tot -= ab; r.absorbed = Math.round(ab); heal(d, d, ab, null, true) } }
      r.amt = Math.max(tot > 0 ? 1 : 0, Math.round(tot)); r.re = re;
      return r;
    }
    function hurt(d, amt, src, dot) {
      /* 扣血（先扣護盾）；回傳實際扣掉的生命與是否倒下 */
      var left = amt;
      d.st.forEach(function (s) { if (left > 0 && s.shield > 0) { var x = Math.min(s.shield, left); s.shield -= x; left -= x } });
      d.st = d.st.filter(function (s) { return !(s.rows.some(function (r) { return r.k === 'shield' }) && s.shield <= 0) });
      d.hp -= left;
      if (left > 0 && !dot) d.st = d.st.filter(function (s) { return !s.rows.some(function (r) { return r.k === 'sleep' }) });
      return left;
    }
    function heal(src, t, amt, e, raw) {
      if (t.dead || banished(t)) return 0;
      var v = raw ? amt : amt * (1 + sv(t, 'heal_taken_rate'));
      var real = Math.max(0, Math.min(Math.round(v), t.b.mhp - Math.round(t.hp)));
      t.hp += real; return real;
    }
    function checkDeath(u, e) {
      if (u.dead || u.hp > 0) return false;
      u.hp = 0;
      /* 先祖之鄉（必定、一次）→ 神恩（機率、一次） */
      if (u.runes.indexOf('rune17') >= 0 && !u.flags.r17) { u.flags.r17 = 1; revive(u, 0.5, '先祖之鄉', e); return false }
      var g = u.special.filter(function (x) { return x.k === 'revive_self' })[0];
      if (g && !u.flags.grace) { u.flags.grace = 1; if (RND() < g.ch) { revive(u, g.v, D.SK[g.id] ? D.SK[g.id].n : '神恩', e); return false } }
      u.dead = true; u.st = [];
      if (e) { if (u.side === 'm') (e.dead = e.dead || []).push(u.i); else (e.pko = e.pko || []).push(u.i) }
      return true;
    }
    function revive(u, f, why, e) { u.st = []; u.hp = Math.max(1, Math.round(u.b.mhp * f)); if (e) { e.txt += '；' + u.name + ' 因「' + why + '」復活（' + u.hp + ' 生命）'; (e.rev = e.rev || []).push([u.side, u.i]) } }

    /* --- 反應技 --- */
    function react(d, a, isP, isM, parts) {
      if (!d.reaction || d.dead || ctrl(d, 'stun') || ctrl(d, 'sleep') || ctrl(d, 'petrify')) return null;
      var rows = (D.EFF[d.reaction] || []).filter(function (e) { return e.effect_kind === 'reaction' });
      if (!rows.length) return null;
      var tr = rows[0].trigger, ok = tr === 'hit_any' || tr === 'damaged' || (tr === 'hit_p' && isP) || (tr === 'hit_m' && isM);
      if (!ok || RND() >= (num(rows[0].trigger_chance) || 0)) return null;
      var out = { name: D.SK[d.reaction].n, post: [] };
      rows.forEach(function (r) {
        var k = r.effect;
        if (k === 'block') out.block = true;
        else if (k === 'reduce') out.reduce = num(r.value);
        else if (k === 'absorb') { var els = String(r.condition || '').split(';').filter(Boolean); if (parts.some(function (x) { return els.indexOf(x.e) >= 0 })) out.absorb = els; else out.none = true }
        else if (k === 'apply_status' && r.target === 'self') applyStatus(d, d, r.status_name, r.turns, 1, null);
        else out.post.push(r);
      });
      if (out.none && !out.block && !out.reduce && !out.post.length) return null;
      return out;
    }
    function reactPost(d, a, re, e) {
      if (!re) return;
      e.txt += '（' + d.name + ' 發動「' + re.name + '」' + (re.block ? '擋下' : re.reduce ? '減傷' : re.absorb ? '吸收' : '') + '）';
      var ctr = re.post.filter(function (r) { return r.effect === 'counter' });
      if (ctr.length && !a.dead && !d.dead) {
        var parts = ctr.map(function (r) { return { d: r.dmg_type || 'p', e: r.element || '', r: num(r.value) } });
        var x = dmgOnce(d, a, parts, { cr: 0, cd: 0 }, { noReact: true });
        if (x.miss) e.txt += '，反擊被閃開';
        else if (x.amt) { var real = hurt(a, x.amt, d); e.txt += '，反擊 ' + a.name + (x.crit ? ' 暴擊！' : ' ') + real + ' 傷害'; addStat(e, d, 'dmg', real, re.name); addStat(e, a, 'taken', real, d.name + ' ' + re.name); checkDeath(a, e) }
      }
      re.post.forEach(function (r) {
        if (r.effect === 'heal' && !d.dead) { var h = num(r.value) * (r.base === 'p_atk' ? stat(d, 'patk') : stat(d, 'matk')), c = RND() < stat(d, 'crit'); h *= (1 + d.b.heal) * (c ? 1 + stat(d, 'cdmg') : 1); var got = heal(d, d, h); if (got) { e.txt += '，' + d.name + (c ? ' 暴擊！' : ' ') + '恢復 ' + got + ' 生命'; addStat(e, d, 'heal', got, re.name) } }
        if (r.effect === 'apply_status' && r.target === 'attacker' && !a.dead) applyStatus(d, a, r.status_name, r.turns, 1, e);
      });
    }

    /* --- 一次行動 --- */
    function act(u) {
      nowAct = u;
      var e = line({ side: u.side, a: u.i, txt: '' });
      /* 行動開始：聖潔驅散 → 放逐回歸 → 持續傷害／回復 */
      var ban = u.st.filter(function (s) { return s.banish })[0];
      if (ban) {
        if (ban.turns <= 0) {
          removeStatus(u, ban); u.st.forEach(function (s) { s.paused = false });
          var src = ban.src, r0 = ban.rows.filter(function (r) { return r.k === 'banish' })[0], c = RND() < stat(src, 'crit');
          var amt = Math.round(r0.amt * (1 + stat(src, 'mdmg')) * (1 - Math.min(stat(u, 'mred'), 0.9)) * (c ? 1 + stat(src, 'cdmg') : 1));
          var real = hurt(u, amt, src); e.txt = u.name + ' 從裂隙回來，' + (c ? '暴擊！' : '') + '受到 ' + real + ' 魔法傷害'; addStat(e, src, 'dmg', real, '秘法裂隙'); e.snap = 1;
          if (checkDeath(u, e)) { e.hp = hpSnap(); return }
          e.hp = hpSnap(); e = line({ side: u.side, a: u.i, txt: '' });
        } else { ban.turns--; e.txt = u.name + ' 被放逐在時空裂隙中'; e.idle = 1; e.hp = hpSnap(); return }
      }
      var tick = [];
      u.st.slice().forEach(function (s) {
        if (s.paused) return;
        s.rows.forEach(function (r) {
          if (r.k === 'dot' && r.amt) { var red = r.dt === 'm' ? stat(u, 'mred') : stat(u, 'pred'), v = Math.max(1, Math.round(r.amt * (1 - Math.min(red, 0.9)) * (1 - Math.min(resOf(u, r.el), 0.9)) * (1 + sv(u, 'dmg_taken_rate'))));
            var real = hurt(u, v, s.src, true); tick.push('「' + s.n + '」' + real + ' 傷害'); addStat(e, s.src, 'dmg', real, s.n); addStat(e, u, 'taken', real, s.n);
            if (s.rows.some(function (q) { return q.k === 'drain' }) && !s.src.dead) { var g = heal(s.src, s.src, real, null, true); if (g) addStat(e, s.src, 'heal', g, s.n) } }
          if (r.k === 'hot' && r.amt) { var h = heal(s.src, u, r.amt); if (h) { tick.push('「' + s.n + '」恢復 ' + h); addStat(e, s.src, 'heal', h, s.n) } }
        });
      });
      if (tick.length) { e.txt = u.name + ' ' + tick.join('、'); e.tick = 1; if (checkDeath(u, e)) { e.hp = hpSnap(); return } e.hp = hpSnap(); e = line({ side: u.side, a: u.i, txt: '' }) }
      /* 無法行動 */
      if (ctrl(u, 'stun') || ctrl(u, 'sleep') || ctrl(u, 'petrify')) { e.txt = u.name + ' 無法行動'; e.idle = 1; endAct(u, null); e.hp = hpSnap(); return }
      /* 選技能：封禁只能普攻；沒有可用目標就換下一招 */
      var charmed = ctrl(u, 'charm'), confused = ctrl(u, 'confuse'), sk = null, tg = [];
      for (var tries = 0; tries < 4; tries++) {
        var id = u.cycle[u.cy % u.cycle.length]; u.cy++;
        if (ctrl(u, 'seal')) id = 'atk';
        var k = D.SK[id] || D.SK.atk;
        var t0 = pickTargets(u, k, charmed, confused);
        if (k.t === 'ally_others' && !t0.length) continue;
        if (charmed && k.ty === 'damage' && !t0.length) { e.txt = u.name + ' 被魅惑，找不到可以攻擊的同伴'; e.idle = 1; endAct(u, null); e.hp = hpSnap(); return }
        if (t0.length) { sk = k; tg = t0; break }
      }
      if (!sk) { e.txt = u.name + ' 沒有可以行動的目標'; e.idle = 1; endAct(u, null); e.hp = hpSnap(); return }
      e.sk = sk.id; e.ty = sk.ty; e.txt = u.name + ' 使用「' + sk.n + '」';
      doSkill(u, sk, tg, e);
      flushSt(e);
      afterSkill(u, sk, tg, e, false);
      endAct(u, sk);
      if (!e.hp) e.hp = hpSnap();
    }
    /* 技能結算後才判定的符文：墓之土、啟示之書、鷹之勇氣、命運之輪（追加的那次不再觸發後兩者） */
    function trueAll(u, amt, e, why) { var t = 0; foes(u).forEach(function (q) { if (banished(q)) return; var d = hurt(q, amt, u); t += d; addStat(e, u, 'dmg', d, why); addStat(e, q, 'taken', d, u.name + ' ' + why); checkDeath(q, e) }); return t }
    function afterSkill(u, sk, tg, e, isExtra) {
      if (u.dead || !u.runes.length) return;
      var dealt = (e._dealt || 0) > 0;
      if (dealt && u.runes.indexOf('rune26') >= 0) { var loss = Math.max(1, Math.round(u.b.mhp * 0.05)); u.hp -= loss; e.txt += '；墓之土：失去 ' + loss + ' 生命，全體敵人受到 ' + loss * 2 + ' 真實傷害'; trueAll(u, loss * 2, e, '墓之土'); checkDeath(u, e) }
      if (!isExtra && dealt && u.runes.indexOf('rune21') >= 0 && sk.parts.some(function (x) { return x.d === 'm' })) {
        u.r21 = (u.r21 || 0) + 1;
        if (u.r21 >= 3) { u.r21 = 0; var wv = Math.round(stat(u, 'matk') * 2); e.txt += '；啟示之書：魔力幽界波對全體敵人造成 ' + wv + ' 真實傷害'; trueAll(u, wv, e, '啟示之書') }
      }
      e.hp = hpSnap();
      if (isExtra || u.dead || !foes(u).length) return;
      if (dealt && u.runes.indexOf('rune19') >= 0 && RND() < 0.3) {
        var t2 = tg.filter(function (x) { return !x.dead }); if (!t2.length) t2 = pickTargets(u, sk, false, false);
        if (t2.length) { var e2 = line({ side: u.side, a: u.i, sk: sk.id, ty: sk.ty, txt: u.name + ' 的「鷹之勇氣」再次使用「' + sk.n + '」' }); doSkill(u, sk, t2, e2); flushSt(e2); afterSkill(u, sk, t2, e2, true); e2.hp = hpSnap() }
      }
      if (sk.id !== 'atk' && u.runes.indexOf('rune20') >= 0 && u.learned && u.learned.length && RND() < 0.5 && !u.dead && foes(u).length) {
        var k3 = pickOne(u.learned), t3 = pickTargets(u, k3, false, false);
        var e3 = line({ side: u.side, a: u.i, sk: k3.id, ty: k3.ty, txt: u.name + ' 的「命運之輪」發動「' + k3.n + '」' });
        if (t3.length) { doSkill(u, k3, t3, e3); flushSt(e3); afterSkill(u, k3, t3, e3, true) } else { e3.txt += '，但沒有合法目標'; e3.idle = 1 }
        e3.hp = hpSnap();
      }
    }
    function autoClean(u) {
      if (!u.special.some(function (x) { return x.k === 'auto_cleanse' })) return false;
      var d = debuffs(u); if (d.length) { var s = pickOne(d); removeStatus(u, s); line({ side: u.side, a: u.i, txt: u.name + ' 的「聖潔」驅散了「' + s.n + '」', tick: 1, hp: hpSnap() }) }
      return true;
    }
    function flushSt(e) { if (!e._st) return; Object.keys(e._st).forEach(function (n) { var L = e._st[n]; e.txt += '，' + (L.length > 3 ? L.length + ' 人' : L.join('、')) + ((D.STS[n] || {}).pol === 'buff' ? ' 獲得「' : ' 陷入「') + n + '」' }); delete e._st }
    function endAct(u, sk) {
      u.st.forEach(function (s) {
        if (s.paused || s.banish) return;
        if (s.turns === 'attack') { if (sk && sk.ty === 'damage') s.turns = 0; return }
        if (s.fresh) { s.fresh = false; return }
        s.turns--;
      });
      if (sk && sk.ty === 'damage') u.st.forEach(function (s) { if (s.rows.some(function (r) { return r.k === 'sure_crit_next' })) s.turns = 0 });
      u.st = u.st.filter(function (s) { return s.banish || s.paused || s.turns === 'attack' || s.turns > 0 });
      nowAct = null;
    }
    function protectorFor(t, a) {
      if (t.side !== 'p') return null;
      var pr = P.filter(function (x) { return x !== t && !x.dead && x.st.some(function (s) { return !s.paused && s.rows.some(function (r) { return r.k === 'protect' }) }) });
      return pr.length ? pickOne(pr) : null;
    }

    function doSkill(u, sk, tg, e) {
      var effs = D.EFF[sk.id] || [], parts = [];
      var charmed = ctrl(u, 'charm');
      var bonus = {}; effs.forEach(function (r) { if (r.effect_kind === 'bonus') bonus[r.effect] = r });
      /* 代價（奉獻詩歌） */
      var sac = 0; effs.forEach(function (r) { if (r.effect_kind === 'cost' && r.effect === 'hp_cur') { sac = Math.floor(u.hp * num(r.value)); u.hp -= sac; e.txt += '，犧牲 ' + sac + ' 生命' } });
      if (sk.ty === 'damage') {
        var single = sk.t === 'enemy_single', H = sk.hits || 1, perT = {}, order = [], totalDmg = 0, anyCrit = false, hitList = [];
        var each = sk.p === 'random_each' && H > 1;
        for (var h = 0; h < H; h++) {
          var list = each ? (function () { var c = targetable(charmed ? friends(u).filter(function (x) { return x !== u }) : foes(u)); return c.length ? [pickOne(c)] : [] })() : tg.filter(function (x) { return !x.dead });
          if (!list.length) break;
          list.forEach(function (t0) {
            var t = t0, pr = single ? protectorFor(t0, u) : null; if (pr && u.side === 'm') t = pr;
            if (!perT[t.i + t.side]) { perT[t.i + t.side] = { t: t, hs: [] }; order.push(t) }
            hitList.push(t);
            var mult = 1, xc = 0, sc = false;
            if (bonus.dmg_per_debuff) mult += Math.min(debuffs(t).length * num(bonus.dmg_per_debuff.value), num(String(bonus.dmg_per_debuff.condition || '').replace('max', '')) || 9);
            if (bonus.dmg_if_low_hp && t.hp / t.b.mhp < (num(bonus.dmg_if_low_hp.condition) || 0.5)) mult += num(bonus.dmg_if_low_hp.value);
            if (bonus.crit_if_debuffed && debuffs(t).length) xc += num(bonus.crit_if_debuffed.value);
            if (bonus.sure_crit_low_hp && t.hp / t.b.mhp < (num(bonus.sure_crit_low_hp.value) || 0.3)) sc = true;
            var x = dmgOnce(u, t, sk.parts, sk, { mult: mult, extraCrit: xc, sureCrit: sc });
            var rec = perT[t.i + t.side];
            if (x.void) { rec.hs.push('無效'); return }
            if (x.miss) { rec.hs.push('閃開'); return }
            if (x.blocked) { rec.hs.push('擋下'); reactPost(t, u, x.re, e); return }
            rec.ok = true;
            var real = x.amt ? hurt(t, x.amt, u) : 0; totalDmg += real; if (x.crit) anyCrit = true;
            /* 武器淬毒：該次傷害的一定比例，額外的屬性傷害 */
            u.special.forEach(function (s) { if (s.k === 'extra_dmg' && real > 0 && !t.dead) { var ex = Math.round(real * s.v * (1 - Math.min(resOf(t, s.el), 0.9))); if (ex > 0) { real += hurt(t, ex, u); totalDmg += ex } } });
            /* 元素符文：額外 50% 屬性魔法傷害 */
            [['rune01', 'fire'], ['rune02', 'frost'], ['rune03', 'lightning'], ['rune04', 'wind']].forEach(function (q) { if (u.runes.indexOf(q[0]) >= 0 && real > 0) { var ex = Math.round(real * 0.5 * (1 - Math.min(resOf(t, q[1]), 0.9))); if (ex > 0) { real += hurt(t, ex, u); totalDmg += ex } } });
            if (u.runes.indexOf('rune12') >= 0 && debuffs(t).length && real > 0) { var cr = Math.round(real * 0.5); real += hurt(t, cr, u); totalDmg += cr }
            rec.hs.push((x.crit ? '暴擊 ' : '') + real + (x.absorbed ? '（吸收 ' + x.absorbed + '）' : ''));
            /* 水之幽暗：每次暴擊，對隨機一名敵人造成物攻、魔攻較高者 200% 的黑暗魔法傷害（不再暴擊、不連鎖） */
            if (x.crit && u.runes.indexOf('rune25') >= 0) { var fs = foes(u).filter(function (q) { return !banished(q) }); if (fs.length) { var wt = pickOne(fs), wa = Math.round(Math.max(stat(u, 'patk'), stat(u, 'matk')) * 2 * (1 + stat(u, 'mdmg')) * (1 - Math.min(stat(wt, 'mred'), 0.9)) * (1 - Math.min(resOf(wt, 'dark'), 0.9))); var wr = hurt(wt, Math.max(1, wa), u); totalDmg += wr; addStat(e, u, 'dmg', wr, '水之幽暗'); addStat(e, wt, 'taken', wr, u.name + ' 水之幽暗'); (e._x = e._x || []).push('水之幽暗 → ' + wt.name + ' ' + wr); checkDeath(wt, e) } }
            addStat(e, u, 'dmg', real, sk.n); addStat(e, t, 'taken', real, u.name + ' ' + sk.n);
            if (t.runes && t.runes.indexOf('rune11') >= 0 && real > 0 && !u.dead) { var th = hurt(u, Math.round(real * 0.5), t); addStat(e, t, 'dmg', th, '荊棘之皇冠'); checkDeath(u, e) }
            if (t.runes && t.runes.indexOf('rune23') >= 0 && real > 0 && !u.dead && RND() < 0.2) applyStatus(t, u, '石化', 5, 1, null);
            if (u.runes.indexOf('rune13') >= 0 && real > 0 && RND() < 0.3) { var dbs = Object.keys(D.STS).filter(function (n) { return D.STS[n].pol === 'debuff' && !D.STS[n].rows.some(function (r) { return r.k === 'banish' || r.k === 'charm' || r.k === 'petrify' }) }); applyStatus(u, t, pickOne(dbs), 3, 1, null) }
            /* 每一下附加的狀態 */
            effs.forEach(function (r) { if (r.effect_kind === 'status' && r.condition === 'per_hit' && !t.dead) applyStatus(u, t, r.status_name, r.turns, r.apply_chance, null) });
            reactPost(t, u, x.re, e);
            checkDeath(t, e);
          });
        }
        e.tg = order.filter(function (t) { return t.side === 'm' }).map(function (t) { return t.i });
        e.tgP = order.filter(function (t) { return t.side === 'p' }).map(function (t) { return t.i });
        e.hitsN = hitList.length; e.tgh = each ? hitList.filter(function (t) { return t.side === 'm' }).map(function (t) { return t.i }) : null;
        e._dealt = (e._dealt || 0) + totalDmg;
        e.txt += ' → ' + order.map(function (t) { var hs = perT[t.i + t.side].hs; return H > 1 ? t.name + ' 受到 ' + hs.join('、') + ' 傷害' : (hs[0] === '閃開' ? t.name + ' 閃開了' : hs[0] === '擋下' ? t.name + ' 擋下了' : hs[0] === '無效' ? t.name + ' 不受影響' : t.name + (/^暴擊/.test(hs[0]) ? ' 暴擊！受到 ' + hs[0].slice(3) : ' 受到 ' + hs[0]) + ' 傷害') }).join('，');
        if (e._x) { e.txt += '（' + e._x.join('，') + '）'; delete e._x }
        /* 吸血 */
        var ls = sv(u, 'lifesteal') + (u.runes.indexOf('rune10') >= 0 ? 0.25 : 0); u.special.forEach(function (s) { if (s.k === 'lifesteal') ls += s.v });
        if (ls > 0 && totalDmg > 0 && !u.dead) { var g = heal(u, u, totalDmg * ls, null, true); if (g) { e.txt += '，吸收 ' + g + ' 生命'; addStat(e, u, 'heal', g, '吸血') } }
        /* 熊之力量：濺射 */
        if (u.runes.indexOf('rune22') >= 0 && totalDmg > 0) foes(u).forEach(function (t) { var sp = hurt(t, Math.round(totalDmg * 0.3), u); addStat(e, u, 'dmg', sp, '熊之力量'); checkDeath(t, e) });
        /* 舞台魅力等「攻擊時」觸發 */
        u.special.forEach(function (s) { if (s.k === 'apply_status' && s.tr === 'attack' && order.length && RND() < s.ch) { var cand = order.filter(function (t) { return !t.dead && !(s.cond === 'not_boss' && t.boss) && t.side !== u.side }); if (cand.length) applyStatus(u, pickOne(cand), s.st, s.turns, 1, e) } });
        /* 一般狀態（每個目標擲一次） */
        effs.forEach(function (r) {
          if (r.effect_kind !== 'status' || r.condition === 'per_hit') return;
          if (r.target === 'self') applyStatus(u, u, r.status_name, r.turns, r.apply_chance, e);
          else order.forEach(function (t) { if (!t.dead && perT[t.i + t.side].ok && t.side !== u.side) applyStatus(u, t, r.status_name, r.turns, r.apply_chance, e) });
        });
      } else if (sk.ty === 'heal') {
        var amtList = [], tot = 0;
        tg.forEach(function (t) {
          var base = sk.parts[0] ? sk.parts[0].r : 0;
          if (base > 0) {
            var c = RND() < stat(u, 'crit'), v = stat(u, 'matk') * base * (1 + u.b.heal) * (c ? 1 + stat(u, 'cdmg') : 1);
            if (bonus.heal_if_hot && hasHot(t)) v *= 1 + num(bonus.heal_if_hot.value);
            var got = heal(u, t, v); tot += got; amtList.push(t.name + (got ? (c ? ' 暴擊！' : ' ') + '恢復 ' + got : ' 生命已滿')); addStat(e, u, 'heal', got, sk.n);
          }
        });
        if (amtList.length) e.txt += '，' + amtList.join('，');
        e.hl = tg.filter(function (t) { return t.side === 'p' }).map(function (t) { return t.i }); e.hlM = tg.filter(function (t) { return t.side === 'm' }).map(function (t) { return t.i });
        if (tot > 0) echo(u, tot, e);
        effs.forEach(function (r) {
          if (r.effect_kind === 'status') tg.forEach(function (t) { applyStatus(u, t, r.status_name, r.turns, r.apply_chance, e) });
          if (r.effect_kind === 'cleanse') tg.forEach(function (t) { var d = debuffs(t); d.forEach(function (s) { removeStatus(t, s) }); if (d.length) e.txt += '，清除 ' + t.name + ' 的 ' + d.map(function (s) { return '「' + s.n + '」' }).join('') });
        });
      } else {
        e.hl = tg.filter(function (t) { return t.side === 'p' }).map(function (t) { return t.i });
        effs.forEach(function (r) {
          if (r.effect_kind !== 'status') return;
          tg.forEach(function (t) { applyStatus(u, t, r.status_name, r.turns, r.apply_chance, e) });
        });
        if (sk.ty === 'debuff') { e.tg = tg.filter(function (t) { return t.side === 'm' }).map(function (t) { return t.i }); e.tgP = tg.filter(function (t) { return t.side === 'p' }).map(function (t) { return t.i }) }
        /* 太陽之照耀 */
        if (sk.ty === 'buff' && u.runes.indexOf('rune14') >= 0 && D.STS['輝煌']) applyStatus(u, u, '輝煌', 5, 1, null);
      }
      /* 額外治療列（生命脈衝、至高打擊、奉獻詩歌…） */
      effs.forEach(function (r) {
        if (r.effect_kind !== 'heal') return;
        var who = r.target === 'self' ? [u] : r.target === 'ally_all' ? friends(u) : r.target === 'ally_others' ? friends(u).filter(function (x) { return x !== u }) : r.target === 'ally_single' ? [choose(friends(u), r.condition || 'lowest_hp')] : [];
        var out = [], tot = 0;
        who.forEach(function (t) {
          if (!t) return;
          var v, c = false;
          if (r.base === 'sacrificed_hp') v = sac * num(r.value);
          else { c = RND() < stat(u, 'crit'); v = num(r.value) * (r.base === 'p_atk' ? stat(u, 'patk') : stat(u, 'matk')) * (1 + u.b.heal) * (c ? 1 + stat(u, 'cdmg') : 1) }
          var got = heal(u, t, v); tot += got; if (got) { out.push(t.name + (c ? ' 暴擊！' : ' ') + '恢復 ' + got); addStat(e, u, 'heal', got, sk.n) }
        });
        if (out.length) e.txt += '，' + out.join('，');
        if (tot > 0 && r.base !== 'sacrificed_hp') echo(u, tot, e);
        e.hl = (e.hl || []).concat(who.filter(function (t) { return t && t.side === 'p' }).map(function (t) { return t.i }));
      });
      /* 鹿之守護、月之淨化：主動治療時 */
    }
    function echo(u, tot, e) {
      u.special.forEach(function (s) { if (s.k === 'heal_echo') { var g = heal(u, u, tot * s.v, null, true); if (g) { e.txt += '，' + u.name + ' 同調恢復 ' + g; addStat(e, u, 'heal', g, '生命同調') } } });
      if (u.runes.indexOf('rune16') >= 0 && D.STS['生命守護']) { applyStatus(u, u, '生命守護', 3, 1, null); u.st.forEach(function (s) { if (s.n === '生命守護') s.shield = Math.min(tot * 0.5, u.b.mhp * 0.3) }) }
      if (u.runes.indexOf('rune15') >= 0) { var f = foes(u); if (f.length) { var t = pickOne(f), d = hurt(t, Math.round(tot * 0.5), u); e.txt += '，月之淨化對 ' + t.name + ' 造成 ' + d + ' 傷害'; addStat(e, u, 'dmg', d, '月之淨化'); checkDeath(t, e) } }
    }

    /* --- 主迴圈 --- */
    function alive(a) { return a.some(function (x) { return !x.dead }) }
    if (lone) line({ kind: 'note', idle: true, txt: P[0].name + ' 獨自上陣，進入「獨狼」狀態：生命、物理攻擊力、魔法攻擊力 ×1.5' });
    while (alive(P) && alive(M) && rounds < MAXR) {
      rounds++;
      line({ kind: 'round', txt: '— 第 ' + rounds + ' 回合 —' });
      if (rounds > 1) U.forEach(function (u) { if (u.runes.indexOf('rune18') >= 0) u.dragon = Math.max(0.2, u.dragon - 0.05) });
      var order = U.filter(function (u) { return !u.dead }).map(function (u) { return { u: u, s: stat(u, 'speed') + RND() * 3 } }).sort(function (a, b) { return b.s - a.s }).map(function (x) { return x.u });
      for (var q = 0; q < order.length; q++) {
        var u = order[q]; if (u.dead) continue;
        if (!alive(P) || !alive(M)) break;
        if (u.special.some(function (x) { return x.k === 'auto_cleanse' })) autoClean(u);
        act(u);
      }
    }
    var res = alive(M) ? 'lose' : 'win';
    return { ev: ev, res: res, rounds: rounds };
  }

  var API = { prepare: prepare, player: player, monster: monster, stageMonsters: stageMonsters, stageRow: stageRow, run: run, ELN: ELN };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.BattleEngine = API;
})(this);

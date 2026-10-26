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
  var NOBOSS = { charm: 1, swallow: 1 }; /* 放逐對王有效：機率照控制類減半，而且只放逐 1 回合（見 applyStatus） */
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
        cr: num(r.extra_crit_rate), cd: num(r.extra_crit_damage), parts: parts, vfx: r.vfx || '', hits: parseInt(r.hits, 10) || 1, sure: r.sure_hit === '1', ds: r.skill_desc || '', raw: r /* 原始欄位（戰棋讀 range / area / area_size / cost） */ };
    });
    D.SK.atk = { id: 'atk', n: '普通攻擊', kind: 'combat', t: 'enemy_single', p: 'random', ty: 'damage', cr: 0, cd: 0, parts: [{ d: 'p', e: '', r: 1 }], vfx: '', hits: 1, atk: true, sp: 0, cdN: 0 };
    /* SP 消耗：skill_info 的 sp 欄有填就用；空白 = 單體 1、群體（enemy_all／ally_all／ally_others）2。冷卻 = cost 欄（自己的行動次數） */
    Object.keys(D.SK).forEach(function (id) { var k = D.SK[id]; if (id === 'atk') return; var raw = k.raw || {}, v = String(raw.sp == null ? '' : raw.sp).trim();
      k.sp = v !== '' ? Math.max(0, parseInt(v, 10) || 0) : (/_all$/.test(k.t || '') || k.t === 'ally_others' ? 2 : 1); k.cdN = Math.max(0, parseInt(raw.cost, 10) || 0) });
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
    /* 符文數值：rune_info.csv 的 value_1～3（有 % 的換成小數，純數字照原樣，文字不算）；空的就用程式內的預設值 */
    D.RV = {}; (c.rune_info || []).forEach(function (r) { if (r.u_sn) D.RV[r.u_sn] = [r.value_1, r.value_2, r.value_3].map(function (x) { var t = String(x == null ? '' : x).trim(); return /^-?[\d.]+%?$/.test(t) ? pn(t) : null }) });
    return D;
  }
  function RV(D, id, k, dflt) { var a = D && D.RV && D.RV[id], v = a ? a[k] : null; return v == null || isNaN(v) ? dflt : v }
  function stageRow(D, area, l) { var x = null; D.stage.forEach(function (r) { if (r.area_id === area && (parseInt(r.stage, 10) || 0) === l) x = r }); return x }

  /* ---------- 建立玩家單位（算法跟角色頁、營地一致） ---------- */
  function jobSn(p) { return p.jobSn || ('job' + ('0' + ((p.job | 0) + 1)).slice(-2)) }
  function learned(p, sk) { var jl = p.jobLv || {}; return !!sk && (sk.id === 'atk' || (/^job\d+$/.test(sk.j || '') && (jl[sk.j] | 0) >= sk.lv)) }
  function setJobs(p) { var main = p.jobSn || ('job' + ('0' + ((p.job | 0) + 1)).slice(-2)), x = p.skills && p.skills.extra, ex = Array.isArray(x) ? x : (typeof x === 'string' && x ? [x] : []); return [main].concat(ex.slice(0, 2)) }
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
      var bs = 10 + j + ((p.alloc || {})[k] | 0); T[k] = bs + (rOn('rune08') ? Math.round(bs * RV(D, 'rune08', 0, 0.1)) : 0);
    });
    var at = D.attr[jobSn(p)] || {}, row = D.wpn[ws];
    function wsum(key) { var t = 0; if (!row) return 0; for (var q = 1; q <= 6; q++) { if (row['auto_stat_' + q] !== key) continue; var per = String(row['auto_per_level_' + q] || '').trim(), v = num(per) * wlv; t += /%/.test(per) ? v / 100 : v }
      for (var u = 1; u <= 3; u++) { if (row['temper_stat_' + u] !== key || !pts[u - 1]) continue; t += num(row['temper_per_point_' + u]) * pts[u - 1] / 100 } return t }
    function ps(stat) { var t = 0, pe = p.pets || {}; Object.keys(D.pet).forEach(function (id) { var pi = D.pet[id]; if (pi.stat !== stat) return; t += pi.per * clamp(((pe[id] || {}).lv) | 0, 0, 10) }); return t }
    var v = T.vit, s = T.str, i = T.int, a = T.agi, l = T.luk, apa = sp('atk_per_ally') * (opt.allies || 0);
    var P0 = Math.round((s + wsum('p_atk') + Math.round(v * sp('vit_to_p_atk'))) * (1 + pn(at.p_atk_bonus) + sp('p_atk_rate') + apa));
    var M0 = Math.round((i + wsum('m_atk') + Math.round(s * sp('str_to_m_atk'))) * (1 + pn(at.m_atk_bonus) + sp('m_atk_rate') + apa)), bP = 0, bM = 0;
    if (rOn('rune09')) { var hi = Math.max(P0, M0), lo = Math.min(P0, M0), ad = Math.max(0, Math.min(Math.round(hi * RV(D, 'rune09', 0, 0.5)), hi - lo)); if (P0 > M0) bM = ad; else if (M0 > P0) bP = ad }
    var r5 = rOn('rune05') ? RV(D, 'rune05', 0, 0.2) : 0, r5d = rOn('rune05') ? RV(D, 'rune05', 1, 1) : 0;
    var mhp = Math.round((v * 5 + 10 * (lv - 1) + Math.round(a * sp('agi_to_hp') * 5) + Math.round(i * sp('int_to_hp') * 5) + Math.round((P0 + bP) * sp('p_atk_to_hp'))) * (1 + pn(at.hp_bonus) + wsum('hp_rate') + sp('hp_rate')));
    var res = {}; ELS.forEach(function (e) { res[e] = pn(at[e + '_res_rate_bonus']) + sp(e + '_res_rate') });
    var u = {
      side: 'p', name: p.name || '冒險者', uid: p.uid, boss: false,
      b: { mhp: Math.max(1, mhp), patk: P0 + bP, matk: M0 + bM, pdmg: wsum('p_damage_rate') + sp('p_damage_rate'), mdmg: wsum('m_damage_rate') + sp('m_damage_rate'),
        eva: a / (a + 800) + pn(at.eva_rate_bonus) + wsum('eva_rate') + ps('eva_rate') + sp('eva_rate'),
        crit: a / (a + 500) + pn(at.crit_rate_bonus) + wsum('crit_rate') + r5 + sp('crit_rate'),
        cdmg: 0.5 + l * 0.01 + pn(at.crit_damage_rate_bonus) + wsum('crit_damage_rate') + r5d + sp('crit_damage_rate'),
        pred: pn(at.p_def_bonus) + wsum('p_reduce_rate') + ps('p_reduce_rate') + (rOn('rune06') ? RV(D, 'rune06', 0, 0.2) : 0) + sp('p_reduce_rate'),
        mred: pn(at.m_def_bonus) + wsum('m_reduce_rate') + ps('m_reduce_rate') + (rOn('rune07') ? RV(D, 'rune07', 0, 0.2) : 0) + sp('m_reduce_rate'),
        res: res, heal: sp('heal_rate'), speed: 10 + num(at.speed_bonus) + a / 20, hit: 0 },
      /* 4 格只認「現職＋額外技能組（最多兩組）」的技能，其他當普通攻擊 */
      cycle: (Array.isArray(sv.combat) ? sv.combat : []).slice(0, 4).map(function (id) { return id && D.SK[id] && D.SK[id].kind === 'combat' && learned(p, D.SK[id]) && setJobs(p).indexOf(D.SK[id].j) >= 0 ? id : 'atk' }),
      reaction: sv.reaction && D.SK[sv.reaction] && learned(p, D.SK[sv.reaction]) ? sv.reaction : '',
      aura: aura, special: special, runes: en.slice(), weapon: p.weapon || '', p: p,
      apa: sp('atk_per_ally'), apaN: opt.allies || 0, pB: s + wsum('p_atk') + Math.round(v * sp('vit_to_p_atk')), mB: i + wsum('m_atk') + Math.round(s * sp('str_to_m_atk')),
      learned: Object.keys(D.SK).map(function (id) { return D.SK[id] }).filter(function (k) { return k.kind === 'combat' && k.id !== 'atk' && k.j && k.j !== 'monster' && learned(p, k) })
    };
    while (u.cycle.length < 4) u.cycle.push('atk');
    /* 羊之新生：減傷 × v1 加成為增傷，轉換來的加成最多 v2 */
    if (rOn('rune24')) { var k24 = RV(D, 'rune24', 0, 1), c24 = RV(D, 'rune24', 1, 9); u.b.pdmg += Math.min(u.b.pred * k24, c24); u.b.mdmg += Math.min(u.b.mred * k24, c24) }
    return u;
  }

  /* ---------- 建立怪物單位 ---------- */
  /* 全域怪物強度倍率（管理後台 meta/difficulty）：D.mul = {hp, atk}，沒設定就是 1 */
  function MUL(D, k) { var v = D && D.mul ? Number(D.mul[k]) : 1; return v >= 0.5 && v <= 2 ? v : 1 }
  function monster(r, stg, D) {
    var hg = num(r.hp_growth), ag = num(r.atk_growth), k = stg - 1, res = {};
    ELS.forEach(function (e) { res[e] = num(r[e + '_res_rate']) }); res.none = num(r.none_res_rate);
    var cyc = [r.skill_1, r.skill_2, r.skill_3, r.skill_4].map(function (x) { x = String(x || '').trim(); return x && (x === 'atk' || D.SK[x]) ? x : 'atk' });
    return { side: 'm', name: r.monster_name, mid: r.monster_id, sprite: r.sprite, boss: r.boss === '1',
      b: { mhp: Math.round(num(r.hp) * (1 + hg * k) * MUL(D, 'hp')), patk: Math.round(num(r.p_atk) * (1 + ag * k) * MUL(D, 'atk')), matk: Math.round(num(r.m_atk) * (1 + ag * k) * MUL(D, 'atk')), pdmg: 0, mdmg: 0,
        eva: num(r.eva_rate), crit: num(r.crit_rate), cdmg: num(r.crit_damage_rate) || 0.5, pred: num(r.p_reduce_rate), mred: num(r.m_reduce_rate), res: res, heal: 0, speed: num(r.speed) || 10, hit: 0 },
      cycle: cyc, reaction: (r.reaction && D.SK[String(r.reaction).trim()]) ? String(r.reaction).trim() : '', aura: monAura(r, D), special: monPassive(r, D), runes: [] };
  }
  /* 怪物靈氣：passive 欄裡 target = ally_all 的被動（例如審判靈氣），活著時套用到全體怪物（含自己） */
  function monAura(r, D) {
    var out = [];
    String(r.passive || '').split(';').map(function (x) { return x.trim() }).filter(Boolean).forEach(function (id) {
      (D.EFF[id] || []).forEach(function (e) { if (e.effect_kind === 'passive' && e.target === 'ally_all' && e.effect) out.push({ id: id, k: e.effect, v: num(e.value) }) });
    });
    return out;
  }
  /* 怪物被動（monster_info 的 passive 欄，可用 ; 分隔多個）：吸血、追加傷害、攻擊附加狀態等，寫法跟玩家被動一樣 */
  function monPassive(r, D) {
    var out = [];
    String(r.passive || '').split(';').map(function (x) { return x.trim() }).filter(Boolean).forEach(function (id) {
      (D.EFF[id] || []).forEach(function (e) {
        if (e.effect_kind !== 'passive' || !e.effect) return;
        var v = num(e.value);
        if (e.trigger || e.effect === 'apply_status') out.push({ id: id, k: e.effect, v: v, ch: num(e.trigger_chance) || 1, tr: e.trigger, st: e.status_name, turns: e.turns, cond: e.condition, el: e.element, dt: e.dmg_type });
        else if (e.target === 'ally_all' && e.effect === 'lifesteal') return; /* 全隊吸血走靈氣（monAura），自己不重複算 */
        else if (['lifesteal', 'extra_dmg', 'auto_cleanse', 'regen'].indexOf(e.effect) >= 0) out.push({ id: id, k: e.effect, v: v, el: e.element, dt: e.dmg_type }); /* regen = 每次輪到牠行動時恢復最大生命 v */
      });
    });
    return out;
  }

  /* 一關要出哪些怪：一般關從怪物池隨機（min_count～max_count 隻，不看隊伍人數），Boss 關固定 */
  function stageMonsters(D, area, l, nParty) {
    var r = stageRow(D, area, l); if (!r) return [];
    /* 怪物成長看「總關數」：第 N 章第 l 關 = 第 (N−1)×20 + l 關（礦洞第 1 關 = 第 21 關）；獎勵、建議等級仍看 stage_info */
    var g = l + ((parseInt(String(area).replace(/\D/g, ''), 10) || 1) - 1) * 20;
    var fs = nParty <= 2 && r.fixed_small ? r.fixed_small : r.fixed_monsters; /* 王關：1～2 人時改用 fixed_small（小怪比較少） */
    var fixed = String(fs || '').split(';').filter(Boolean), out = [];
    if (fixed.length) fixed.forEach(function (id) { if (D.mon[id]) out.push(monster(D.mon[id], g, D)) });
    else {
      var pool = String(r.monster_pool || '').split(';').filter(function (id) { return D.mon[id] }), mx = num(r.max_count) || 1, mn = Math.min(num(r.min_count) || 1, mx), n = rnd(mn, mx);
      for (var q = 0; q < n && pool.length; q++) out.push(monster(D.mon[pickOne(pool)], g, D));
    }
    var hs = 1 + num(r.party_hp_scale) * Math.max(0, nParty - 1); out.forEach(function (m) { m.b.mhp = Math.round(m.b.mhp * hs); m.stg = g; m.hs = hs }); /* 人多時怪物血量加成 */
    var cnt = {}, seen = {}; out.forEach(function (m) { cnt[m.name] = (cnt[m.name] || 0) + 1 });
    out.forEach(function (m) { if (cnt[m.name] > 1) { seen[m.name] = (seen[m.name] || 0) + 1; m.name += ' ' + 'ABCDE'[seen[m.name] - 1] } });
    out.sort(function (a, b) { return (a.boss ? 1 : 0) - (b.boss ? 1 : 0) });
    return out;
  }

  /* ---------- 戰鬥 ----------
     session(P, M, D) 建立一場戰鬥但不跑：自動戰鬥（run）跟戰棋都用它，規則只有這一份。
     戰棋一個單位的回合 = begin(u)（持續傷害、控制判定）→ 移動 → finish(u, 技能, 目標) 或 wait(u)。 */
  function session(P, M, D, opt) {
    opt = opt || {};
    var SPM = !!opt.sp, SPMAX = 5; /* SP 制度（測試中）：我方每人各自 SP；怪物不受影響 */
    var U = P.concat(M), ev = [], rounds = 0, nowAct = null;
    /* 戰棋用的掛勾：counter(d, a) 回傳 false = 反擊打不到；pool = 多段隨機技能挑目標的範圍（陣列）；
       area = 這次是範圍／直線出手（不算單體，不觸發保護）；protector(t, a) = 回傳替 t 擋下單體攻擊的人（雙方都適用），沒有回傳 null */
    var hooks = {};
    P.forEach(function (u, i) { u.i = i }); M.forEach(function (u, i) { u.i = i });
    /* 獨狼：開戰時沒有隊友（一人上陣）→ 生命、物攻、魔攻 ×1.5；隊友中途陣亡不算 */
    if (SPM) P.forEach(function (u) { u.sp = 2; u.cd = {} });
    var lone = P.length === 1 && !P[0].lone;
    if (lone) { var L0 = P[0]; L0.lone = true; L0.b.mhp = Math.round(L0.b.mhp * 1.5); L0.b.patk = Math.round(L0.b.patk * 1.5); L0.b.matk = Math.round(L0.b.matk * 1.5) }
    U.forEach(function (u) { u.hp = u.b.mhp; u.st = []; u.cy = (u.side === 'm' && u.cycle && u.cycle.length) ? Math.floor(Math.random() * u.cycle.length) : 0; /* 怪物從技能循環的隨機一格開始放 */ u.dead = false; u.used = {}; u.flags = {}; u.dragon = RV(D, 'rune18', 0, 0.5) });
    /* 靈氣：同一招只算一次，套到同陣營每個人（自己的已算在基礎值） */
    var auraSeen = {};
    P.forEach(function (src) { src.aura.forEach(function (a) { var key = a.id + '|' + a.k; if (auraSeen[key]) return; auraSeen[key] = src; }) });
    var auraSeenM = {}; M.forEach(function (src) { (src.aura || []).forEach(function (a) { var key = a.id + '|' + a.k; if (!auraSeenM[key]) auraSeenM[key] = src }) });
    function auraVal(u, k) { if (u.side === 'm') { var tm = 0; Object.keys(auraSeenM).forEach(function (key) { var src = auraSeenM[key]; if (src.dead) return; src.aura.forEach(function (a) { if (a.id + '|' + a.k === key && a.k === k) tm += a.v }) }); return tm } if (u.side !== 'p') return 0; var t = 0; Object.keys(auraSeen).forEach(function (key) { var src = auraSeen[key]; if (src === u || src.dead) return; src.aura.forEach(function (a) { if (a.id + '|' + a.k === key && a.k === k) t += a.v }) }); return t }

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
    function resOf(u, el) { if (!el) return u.b.res.none || 0; /* 無屬性：只有怪物有隱藏的無屬性抗性（monster_info 的 none_res_rate），玩家為 0；真實傷害不經過這裡 */ var r = (u.b.res[el] || 0) + sv(u, el + '_res_rate') + auraVal(u, el + '_res_rate'); u.st.forEach(function (s) { if (s.randEl === el) r += s.randV }); return r }

    /* --- 戰報 --- */
    function line(o) { ev.push(o); return o }
    /* 血量快照，順便記每個人身上生效中的狀態名稱（sp／sm；元素詛咒記成「名稱|屬性」），畫面用來顯示狀態特效 */
    function stNames(u) { return u.dead ? [] : u.st.filter(function (s) { return !s.paused }).map(function (s) { return s.randEl ? s.n + '|' + s.randEl : s.n }) }
    function hpSnap() { return { p: P.map(function (u) { return Math.max(0, Math.round(u.hp)) }), m: M.map(function (u) { return Math.max(0, Math.round(u.hp)) }), sp: P.map(stNames), sm: M.map(stNames), pp: SPM ? P.map(function (u) { return u.sp | 0 }) : null } }
    function addStat(e, u, kind, v, sk) { if (u.side !== 'p' || !v) return; (e.st = e.st || []).push([u.i, kind, Math.round(v), sk]) }

    /* --- 狀態 --- */
    function applyStatus(src, tgt, name, turns, chance, e, skName) {
      var def = D.STS[name]; if (!def || tgt.dead) return false;
      /* 吞噬：只吞玩家；一隻怪肚子裡同時只能有一個人；已經在肚子裡的人什麼狀態都上不了 */
      var swl = def.rows.some(function (r) { return r.k === 'swallow' });
      if (swallowed(tgt)) return false;
      if (banished(tgt) && def.rows.some(function (r) { return r.k === 'banish' })) return false; /* 已經在裂隙裡：不能再放逐一次（避免重放刷新回合、一直關住） */
      if (swl && (tgt.side !== 'p' || P.some(function (x) { return !x.dead && x.st.some(function (q) { return q.swal && q.src === src }) }))) return false;
      var ctl = def.rows.some(function (r) { return CONTROL[r.k] }), nob = def.rows.some(function (r) { return NOBOSS[r.k] });
      if (tgt.boss && nob) return false;
      var ch = chance == null || chance === '' ? 1 : num(chance); if (tgt.boss && ctl) ch /= 2;
      if (RND() >= ch) return false;
      var t = turns === 'attack' ? 'attack' : (parseInt(turns, 10) || 1);
      if (tgt.boss && def.rows.some(function (r) { return r.k === 'banish' }) && t !== 'attack') t = Math.min(t, 1);
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
      if (swl) { s.swal = true; tgt.st.forEach(function (x) { if (x !== s) x.paused = true }); if (e) (e.swal = e.swal || []).push(tgt.i) }
      if (e) { e._st = e._st || {}; (e._st[name] = e._st[name] || []).push(tgt.name) }
      return true;
    }
    function removeStatus(u, s) { var i = u.st.indexOf(s); if (i >= 0) u.st.splice(i, 1) }
    function debuffs(u) { return u.st.filter(function (s) { return s.pol === 'debuff' && !s.paused }) }
    function hasHot(u) { return u.st.some(function (s) { return s.rows.some(function (r) { return r.k === 'hot' }) }) }
    function banished(u) { return u.st.some(function (s) { return s.banish || s.swal }) }
    function swallowed(u) { return u.st.some(function (s) { return s.swal }) }
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
        var v = atk * x.r * (1 + inc) * (1 - Math.min(red, 0.9)) * (1 - Math.min(resOf(d, x.e), 0.9)) * (1 + sv(d, 'dmg_taken_rate') + sv(d, x.d === 'm' ? 'm_dmg_taken_rate' : 'p_dmg_taken_rate')) * cm * (o.mult || 1) * (0.95 + RND() * 0.1);
        if (re && re.reduce) v *= 1 - re.reduce;
        byEl[x.e] = (byEl[x.e] || 0) + v; tot += v;
      });
      if (re && re.absorb) { var ab = 0; re.absorb.forEach(function (el) { ab += byEl[el] || 0 }); if (ab > 0) { tot -= ab; r.absorbed = Math.round(ab); heal(d, d, ab, null, true) } }
      r.amt = Math.max(tot > 0 ? 1 : 0, Math.round(tot)); r.re = re;
      return r;
    }
    function hurt(d, amt, src, dot) {
      /* 扣血（先扣護盾）；回傳實際扣掉的生命與是否倒下 */
      var left = amt; if (src && amt > 0 && src !== d) d._lh = src; /* 記下最後打到牠的人（擊殺 +1 SP） */
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
      if (swallowed(u)) { u.flags.r17 = 1; u.flags.grace = 1 } /* 在肚子裡被消化完：不能復活 */
      /* 變身（冥屍龍的亡骸化）：倒下時化為另一隻怪復活一次，生命全滿、狀態清空，召喚出來的同伴留著 */
      var tfx = u.side === 'm' && !u.flags.tf ? (u.special || []).filter(function (x) { return x.k === 'transform' && x.tr === 'death' && D.mon[x.cond] })[0] : null;
      if (tfx) {
        u.flags.tf = 1; var nu = monster(D.mon[tfx.cond], u.stg || 1, D), old = u.name;
        u.name = nu.name; u.mid = nu.mid; u.sprite = nu.sprite; u.b = nu.b; u.b.mhp = Math.round(u.b.mhp * (u.hs || 1)); u.hp = u.b.mhp; u.st = [];
        u.cycle = nu.cycle; u.cy = 0; u.reaction = nu.reaction; u.special = nu.special; u.aura = nu.aura;
        u.aura.forEach(function (a) { var key = a.id + '|' + a.k; if (!auraSeenM[key]) auraSeenM[key] = u });
        if (e) e.txt += '；' + old + ' 倒下了';
        var tr = line({ side: 'm', a: u.i, txt: old + ' 化為「' + u.name + '」復活了！', tf: [u.i, u.sprite, u.name] }); tr.hp = hpSnap();
        return false;
      }
      /* 先祖之鄉（必定、一次）→ 神恩（機率、一次） */
      if (u.runes.indexOf('rune17') >= 0 && !u.flags.r17) { u.flags.r17 = 1; revive(u, RV(D, 'rune17', 0, 0.5), '先祖之鄉', e); return false }
      var g = u.special.filter(function (x) { return x.k === 'revive_self' })[0];
      if (g && !u.flags.grace) { u.flags.grace = 1; if (RND() < g.ch) { revive(u, g.v, D.SK[g.id] ? D.SK[g.id].n : '神恩', e); return false } }
      u.dead = true; u.st = [];
      if (SPM && u.side === 'm' && u._lh && u._lh.side === 'p' && !u._lh.dead) { var k0 = u._lh.sp | 0; u._lh.sp = Math.min(SPMAX, k0 + 1); if (e) { (e.spk = e.spk || []).push(u._lh.i); (e._spk = e._spk || []).push(u._lh.name + ' 擊倒 ' + u.name + (u._lh.sp > k0 ? '，恢復 1 SP' : '（SP 已滿）')) } }
      /* 吞噬者倒下：肚子裡的人回來（血量維持、狀態恢復計時） */
      if (u.side === 'm') P.forEach(function (x) { var q = x.st.filter(function (s) { return s.swal && s.src === u })[0]; if (!q || x.dead) return; removeStatus(x, q); x.st.forEach(function (s) { s.paused = false }); if (e) { (e._rel = e._rel || []).push(x.name + ' 從 ' + u.name + ' 的肚子裡逃出來了'); (e.rel = e.rel || []).push(x.i) } });
      if (e) { if (u.side === 'm') (e.dead = e.dead || []).push(u.i); else (e.pko = e.pko || []).push(u.i) }
      return true;
    }
    /* 逃出肚子的文字等這一行的傷害寫完才接在後面 */
    function flushRel(e) { if (e && e._rel) { e.txt += '；' + e._rel.join('；'); delete e._rel } if (e && e._spk) { e.txt += '；' + e._spk.join('；'); delete e._spk } }
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
    /* 反應技：擋下／減傷／吸收在受擊當下就生效（影響那一下的傷害），
       但「發動」本身排進佇列，等敵人整招（含招式後的符文）結算完，才依速度順序一個一個演出、結算反擊／回血／上狀態 */
    function reactPost(d, a, re, e) { if (re) (e._rq = e._rq || []).push({ d: d, a: a, re: re }) }
    /* 符文佇列：攻擊方的符文在招式結束後一個一個獨立成行（rn = 符文編號，畫面用 rfx 決定特效） */
    function rq(e, rid, run) { (e._rn = e._rn || []).push({ rid: rid, run: run }) }
    function fxOn(r, fx, src, tgs) { r.rfx = fx; r.side = src.side; r.a = src.i; r.rtg = tgs.map(function (t) { return [t.side, t.i] }) }
    var RUNEN = { rune01: '火炬之光', rune02: '霜之停滯', rune03: '雷神之鎚', rune04: '風之氣息' };
    var RUNEST = { rune01: 'fire', rune02: '霜凝', rune03: '麻痺', rune04: '風化' }; /* 元素符文附加的狀態（fire = 依攻擊力高低選血沸或魂灼） */
    function flushRunes(e) {
      var q = e._rn || []; delete e._rn; if (!q.length) return;
      /* 元素符文：同一個符文的所有目標合成一行，排在最前面（緊接著主攻擊） */
      var els = {}, order = [];
      q.forEach(function (x) { if (!x.elx) return; if (!els[x.rid]) { els[x.rid] = []; order.push(x.rid) } els[x.rid].push(x) });
      order.forEach(function (rid) {
        var L = els[rid], u = L[0].u, out = [], tgs = []; if (u.dead) return;
        var r = line({ rn: rid, txt: '' });
        L.forEach(function (x) { if (x.t.dead || banished(x.t)) return; var d = hurt(x.t, x.amt, u); addStat(r, u, 'dmg', d, RUNEN[rid]); addStat(r, x.t, 'taken', d, u.name + ' ' + RUNEN[rid]); out.push(x.t.name + ' ' + d); if (tgs.indexOf(x.t) < 0) tgs.push(x.t); checkDeath(x.t, r) });
        if (!out.length) { ev.pop(); return }
        var dt = L[0].dt; r.txt = u.name + ' 的「' + RUNEN[rid] + '」：' + out.join('、') + ' ' + ELN[L[0].el] + (dt === 'p' ? '物理' : dt === 'm' ? '魔法' : '') + '傷害'; r.el = L[0].el; fxOn(r, 'el', u, tgs);
        /* 附加狀態：每個被追加傷害的目標各一次。火炬之光看物攻、魔攻較高者（血沸／魂灼）；雷神之鎚的麻痺對 Boss 無效 */
        var sn = RUNEST[rid] === 'fire' ? (stat(u, 'patk') >= stat(u, 'matk') ? '血沸' : '魂灼') : RUNEST[rid], tn = RV(D, rid, 1, rid === 'rune03' ? 1 : 3), ch = RV(D, rid, 2, rid === 'rune03' ? 0.15 : 1);
        if (sn && !u.dead) tgs.forEach(function (t) { if (t.dead || banished(t) || (rid === 'rune03' && t.boss)) return; applyStatus(u, t, sn, tn, ch, r) });
        flushSt(r); flushRel(r); r.hp = hpSnap();
      });
      q.forEach(function (x) { if (x.elx) return; var r = line({ rn: x.rid, txt: '' }); if (x.run(r) === false) { ev.splice(ev.indexOf(r), 1); return } flushSt(r); flushRel(r); r.hp = hpSnap() });
    }
    function flushReact(e) {
      var q = e._rq || [], th = e._th || [], items = [], tm = {}; delete e._rq; delete e._th;
      q.forEach(function (x) { items.push({ k: 'r', d: x.d, a: x.a, re: x.re }) });
      /* 荊棘之皇冠：同一個人被多段打到，合併成一次反彈 */
      th.forEach(function (x) { var key = x.d.side + x.d.i + '>' + x.a.side + x.a.i; if (!tm[key]) { tm[key] = { k: 't', d: x.d, a: x.a, amt: 0 }; items.push(tm[key]) } tm[key].amt += x.amt });
      if (!items.length) return;
      /* 速度高的先反應（同速維持觸發順序） */
      items = items.map(function (x, n) { return { x: x, n: n, s: stat(x.d, 'speed') } }).sort(function (p, q) { return q.s - p.s || p.n - q.n }).map(function (p) { return p.x });
      items.forEach(function (x) { if (x.k === 't') thornLine(x); else reactLine(x.d, x.a, x.re) });
    }
    function thornLine(x) {
      var d = x.d, a = x.a; if (a.dead || x.amt <= 0) return;
      var r = line({ side: d.side, a: d.i, rk: 'thorn', rn: 'rune11', rt: [a.side, a.i], txt: '' });
      var th = hurt(a, x.amt, d); r.txt = d.name + ' 的「荊棘之皇冠」反彈 ' + th + ' 真實傷害給 ' + a.name;
      addStat(r, d, 'dmg', th, '荊棘之皇冠'); addStat(r, a, 'taken', th, d.name + ' 荊棘之皇冠'); checkDeath(a, r); flushRel(r); r.hp = hpSnap();
    }
    function reactLine(d, a, re) {
      if (d.dead) return;
      var ctr = re.post.filter(function (r) { return r.effect === 'counter' }), canCtr = ctr.length && !a.dead && (!hooks.counter || hooks.counter(d, a));
      var sts = re.post.filter(function (r) { return r.effect === 'apply_status' && r.target === 'attacker' }), hl = re.post.filter(function (r) { return r.effect === 'heal' });
      var def = re.block || re.reduce || re.absorb;
      if (ctr.length && !canCtr && !def && !hl.length && !(sts.length && !a.dead)) return; /* 只剩打不到的反擊（攻擊者已倒下）：不演 */
      /* rk：counter = 攻擊動作打回去；debuff = 攻擊動作＋對方腳下向下的光圈；buff = 自己發光 */
      var r = line({ side: d.side, a: d.i, rk: canCtr ? 'counter' : (sts.length && !a.dead) ? 'debuff' : 'buff', rt: [a.side, a.i], rname: re.name,
        txt: d.name + ' 發動「' + re.name + '」' + (re.block ? '，擋下攻擊' : re.reduce ? '，減輕傷害' : re.absorb ? '，吸收屬性傷害' : '') });
      if (canCtr) {
        var parts = ctr.map(function (q) { return { d: q.dmg_type || 'p', e: q.element || '', r: num(q.value) } });
        var x = dmgOnce(d, a, parts, { cr: 0, cd: 0 }, { noReact: true });
        if (x.miss) { r.txt += '，反擊被閃開'; r.rmiss = 1 }
        else if (x.amt) { var real = hurt(a, x.amt, d); r.txt += '，反擊 ' + a.name + (x.crit ? ' 暴擊！' : ' ') + real + ' 傷害'; addStat(r, d, 'dmg', real, re.name); addStat(r, a, 'taken', real, d.name + ' ' + re.name); checkDeath(a, r) }
      }
      hl.forEach(function (q) { if (d.dead) return; var h = num(q.value) * (q.base === 'p_atk' ? stat(d, 'patk') : stat(d, 'matk')), c = RND() < stat(d, 'crit'); h *= (1 + d.b.heal) * (c ? 1 + stat(d, 'cdmg') : 1); var got = heal(d, d, h); if (got) { r.txt += '，' + d.name + (c ? ' 暴擊！' : ' ') + '恢復 ' + got + ' 生命'; addStat(r, d, 'heal', got, re.name) } });
      sts.forEach(function (q) { if (!a.dead && applyStatus(d, a, q.status_name, q.turns, 1, r)) r.dring = 1 });
      flushSt(r); flushRel(r); r.hp = hpSnap();
    }

    /* --- 一次行動 --- */
    function act(u) { if (begin(u)) finish(u) }
    /* 行動開始的結算；回傳 false = 這次不能行動（放逐中、被持續傷害打倒、昏迷／睡眠／石化），已經記完戰報 */
    function begin(u) {
      nowAct = u;
      var e = line({ side: u.side, a: u.i, txt: '' });
      /* 行動開始：聖潔驅散 → 放逐回歸 → 持續傷害／回復 */
      var sw = u.st.filter(function (s) { return s.swal })[0];
      if (sw) { e.txt = u.name + ' 在 ' + sw.src.name + ' 的肚子裡'; e.idle = 1; e.hp = hpSnap(); return false }
      var ban = u.st.filter(function (s) { return s.banish })[0];
      if (ban) {
        if (ban.turns <= 0) {
          removeStatus(u, ban); u.st.forEach(function (s) { s.paused = false });
          var src = ban.src, r0 = ban.rows.filter(function (r) { return r.k === 'banish' })[0], c = RND() < stat(src, 'crit');
          var amt = Math.round(r0.amt * (1 + stat(src, 'mdmg')) * (1 - Math.min(stat(u, 'mred'), 0.9)) * (c ? 1 + stat(src, 'cdmg') : 1));
          var real = hurt(u, amt, src); e.txt = u.name + ' 從裂隙回來，' + (c ? '暴擊！' : '') + '受到 ' + real + ' 魔法傷害'; addStat(e, src, 'dmg', real, '秘法裂隙'); e.snap = 1;
          if (checkDeath(u, e)) { flushRel(e); e.hp = hpSnap(); return false }
          e.hp = hpSnap(); e = line({ side: u.side, a: u.i, txt: '' });
        } else { ban.turns--; e.txt = u.name + ' 被放逐在時空裂隙中'; e.idle = 1; e.hp = hpSnap(); return false }
      }
      var tick = [];
      u.special.forEach(function (x) { if (x.k === 'regen') { var g = heal(u, u, u.b.mhp * x.v, null, true); if (g) tick.push('「' + (D.SK[x.id] ? D.SK[x.id].n : '再生') + '」恢復 ' + g) } });
      u.st.slice().forEach(function (s) {
        if (s.paused) return;
        s.rows.forEach(function (r) {
          if (r.k === 'dot' && r.amt) { var red = r.dt === 'm' ? stat(u, 'mred') : stat(u, 'pred'), v = Math.max(1, Math.round(r.amt * (1 - Math.min(red, 0.9)) * (1 - Math.min(resOf(u, r.el), 0.9)) * (1 + sv(u, 'dmg_taken_rate'))));
            var real = hurt(u, v, s.src, true); tick.push('「' + s.n + '」' + real + ' 傷害'); addStat(e, s.src, 'dmg', real, s.n); addStat(e, u, 'taken', real, s.n);
            if (s.rows.some(function (q) { return q.k === 'drain' }) && !s.src.dead) { var g = heal(s.src, s.src, real, null, true); if (g) { addStat(e, s.src, 'heal', g, s.n); (e.drain = e.drain || []).push([s.src.side, s.src.i]) } } }
          if (r.k === 'hot' && r.amt) { var h = heal(s.src, u, r.amt); if (h) { tick.push('「' + s.n + '」恢復 ' + h); addStat(e, s.src, 'heal', h, s.n) } }
        });
      });
      if (tick.length) { e.txt = u.name + ' ' + tick.join('、'); e.tick = 1; if (checkDeath(u, e)) { flushRel(e); e.hp = hpSnap(); return false } e.hp = hpSnap(); e = line({ side: u.side, a: u.i, txt: '' }) }
      /* 無法行動 */
      if (ctrl(u, 'stun') || ctrl(u, 'sleep') || ctrl(u, 'petrify')) { e.txt = u.name + ' 無法行動'; e.idle = 1; e.hp = hpSnap(); endAct(u, null); return false }
      u._e = e;
      return true;
    }
    /* 出手。forced = {sk: 技能 id, tg: [目標]} 時照指定的打（戰棋）；沒給就照技能循環自己選（自動戰鬥） */
    function finish(u, forced) {
      var e = u._e || line({ side: u.side, a: u.i, txt: '' }); delete u._e; nowAct = u;
      var charmed = ctrl(u, 'charm'), confused = ctrl(u, 'confuse'), sk = null, tg = [];
      if (forced) {
        sk = D.SK[ctrl(u, 'seal') ? 'atk' : forced.sk] || D.SK.atk;
        if (SPM && u.side === 'p' && sk.id !== 'atk' && !canUse(u, sk)) { sk = D.SK.atk; forced = { sk: 'atk', tg: pickTargets(u, sk, charmed, confused) } }
        tg = (forced.tg || []).filter(function (x) { return x && !x.dead });
        if (!tg.length && sk.t !== 'self') sk = null; else if (sk.t === 'self') tg = [u];
      }
      /* 選技能：封禁只能普攻；沒有可用目標就換下一招。
         SP 制度：輪到的招冷卻中 → 跳下一招；SP 不夠 → 這次普攻、這招保留到下次 */
      for (var tries = 0; !forced && tries < 4; tries++) {
        var id = u.cycle[u.cy % u.cycle.length];
        if (SPM && u.side === 'p' && id !== 'atk' && D.SK[id] && !ctrl(u, 'seal')) {
          if (cdOf(u, id) > 0) { u.cy++; continue }
          if ((u.sp | 0) < D.SK[id].sp) { id = 'atk' } else u.cy++;
        } else u.cy++;
        if (ctrl(u, 'seal')) id = 'atk';
        var k = D.SK[id] || D.SK.atk;
        var t0 = pickTargets(u, k, charmed, confused);
        if (k.t === 'ally_others' && !t0.length) continue;
        if (charmed && k.ty === 'damage' && !t0.length) { e.txt = u.name + ' 被魅惑，找不到可以攻擊的同伴'; e.idle = 1; e.hp = hpSnap(); endAct(u, null); return }
        if (t0.length) { sk = k; tg = t0; break }
      }
      if (!sk && SPM && u.side === 'p' && !forced) { var ta = pickTargets(u, D.SK.atk, charmed, confused); if (ta.length) { sk = D.SK.atk; tg = ta } } /* 四招都在冷卻：普攻 */
      if (!sk) { e.txt = u.name + ' 沒有可以行動的目標'; e.idle = 1; e.hp = hpSnap(); endAct(u, null); return }
      e.sk = sk.id; e.ty = sk.ty; e.txt = u.name + ' 使用「' + sk.n + '」';
      if (SPM && u.side === 'p' && sk.id !== 'atk') { u.sp = Math.max(0, (u.sp | 0) - sk.sp); if (sk.cdN > 0) u.cd[sk.id] = sk.cdN + 1; if (sk.sp) e.txt += '（' + sk.sp + ' SP）' }
      doSkill(u, sk, tg, e);
      flushSt(e);
      afterSkill(u, sk, tg, e, false);
      flushRel(e);
      if (!e.hp) e.hp = hpSnap();
      endAct(u, sk);
      fieldPulse(u);
    }
    /* 行動結束觸發的力場（雷暴龍的雷電力場）：機率對全體敵人造成「各自最大生命 × value」的屬性傷害，吃減傷與抗性；獨立一行，畫面用 rfx = zap 電一下 */
    function fieldPulse(u) {
      if (u.dead || !u.special) return;
      u.special.forEach(function (x) {
        if (x.k !== 'field_dmg' || x.tr !== 'act_end' || u.dead || RND() >= x.ch) return;
        var tgs = foes(u).filter(function (q) { return !banished(q) }); if (!tgs.length) return;
        var nm = D.SK[x.id] ? D.SK[x.id].n : '力場', r = line({ side: u.side, a: u.i, txt: '' }), out = [];
        tgs.forEach(function (q) { var red = x.dt === 'm' ? stat(q, 'mred') : stat(q, 'pred'), amt = Math.max(1, Math.round(q.b.mhp * x.v * (1 - Math.min(red, 0.9)) * (1 - Math.min(resOf(q, x.el), 0.9))));
          var d = hurt(q, amt, u); addStat(r, u, 'dmg', d, nm); addStat(r, q, 'taken', d, u.name + ' ' + nm); out.push(q.name + ' ' + d); checkDeath(q, r) });
        r.txt = u.name + ' 的「' + nm + '」：' + out.join('、') + ' ' + (ELN[x.el] || '') + '傷害'; fxOn(r, 'zap', u, tgs); flushRel(r); r.hp = hpSnap();
      });
    }
    /* 技能結算後才判定的符文：墓之土、啟示之書、鷹之勇氣、命運之輪（追加的那次不再觸發後兩者） */
    function trueAll(u, amt, e, why) { var t = 0; foes(u).forEach(function (q) { if (banished(q)) return; var d = hurt(q, amt, u); t += d; addStat(e, u, 'dmg', d, why); addStat(e, q, 'taken', d, u.name + ' ' + why); checkDeath(q, e) }); return t }
    function afterSkill(u, sk, tg, e, isExtra) {
      afterRunes(u, sk, tg, e, isExtra);
      /* 這一招（含招式後的符文）完全結束 → 先記下血量，再輪到被打的人依速度發動反應技 */
      if (!e.hp) e.hp = hpSnap();
      flushRunes(e);
      flushReact(e);
      if (!isExtra && !u.dead) afterExtra(u, sk, tg, e);
    }
    function afterRunes(u, sk, tg, e, isExtra) {
      if (u.dead || !u.runes.length) return;
      var dealt = (e._dealt || 0) > 0;
      if (dealt && u.runes.indexOf('rune26') >= 0) { var loss = Math.max(1, Math.round(u.b.mhp * RV(D, 'rune26', 0, 0.05))), lt = Math.round(loss * RV(D, 'rune26', 1, 2));
        rq(e, 'rune26', function (r) { if (u.dead) return false; var hitT = foes(u).filter(function (q) { return !banished(q) }); u.hp -= loss; r.txt = u.name + ' 的「墓之土」：失去 ' + loss + ' 生命，全體敵人受到 ' + lt + ' 真實傷害'; addStat(r, u, 'taken', loss, '墓之土'); trueAll(u, lt, r, '墓之土'); fxOn(r, 'grave', u, hitT); checkDeath(u, r) }) }
      if (!isExtra && dealt && u.runes.indexOf('rune21') >= 0 && sk.id !== 'atk' && sk.ty === 'damage') {
        u.r21 = (u.r21 || 0) + 1; var need = RV(D, 'rune21', 1, 3);
        /* 光球累積：tome = [陣營, 編號, 目前層數, 滿層數]；畫面照這個畫角色左上方的光球 */
        e.tome = [u.side, u.i, Math.min(u.r21, need), need];
        if (u.r21 >= need) { u.r21 = 0; var wv = Math.round(Math.max(stat(u, 'patk'), stat(u, 'matk')) * RV(D, 'rune21', 0, 2));
          rq(e, 'rune21', function (r) { if (u.dead) return false; var hitT = foes(u).filter(function (q) { return !banished(q) }); r.txt = u.name + ' 的「啟示之書」：魔力幽界波對全體敵人造成 ' + wv + ' 真實傷害'; trueAll(u, wv, r, '啟示之書'); fxOn(r, 'tome', u, hitT); r.tome = [u.side, u.i, 0, need] }) }
      }
      e.hp = hpSnap();
    }
    /* 鷹之勇氣、命運之輪：在反應技演完之後才追加 */
    function afterExtra(u, sk, tg, e) {
      if (u.dead || !u.runes.length || !foes(u).length) return;
      var dealt = (e._dealt || 0) > 0;
      if (dealt && u.runes.indexOf('rune19') >= 0 && RND() < RV(D, 'rune19', 0, 0.3)) {
        var t2 = tg.filter(function (x) { return !x.dead }); if (!t2.length) t2 = pickTargets(u, sk, false, false);
        if (t2.length) { var e2 = line({ side: u.side, a: u.i, sk: sk.id, ty: sk.ty, txt: u.name + ' 的「鷹之勇氣」再次使用「' + sk.n + '」' }); doSkill(u, sk, t2, e2); flushSt(e2); afterSkill(u, sk, t2, e2, true); flushRel(e2) }
      }
      if (sk.id !== 'atk' && u.runes.indexOf('rune20') >= 0 && u.learned && u.learned.length && RND() < RV(D, 'rune20', 0, 0.5) && !u.dead && foes(u).length) {
        var k3 = pickOne(u.learned), t3 = pickTargets(u, k3, false, false);
        var e3 = line({ side: u.side, a: u.i, sk: k3.id, ty: k3.ty, txt: u.name + ' 的「命運之輪」發動「' + k3.n + '」' });
        if (t3.length) { doSkill(u, k3, t3, e3); flushSt(e3); afterSkill(u, k3, t3, e3, true); flushRel(e3) } else { e3.txt += '，但沒有合法目標'; e3.idle = 1; e3.hp = hpSnap() }
      }
    }
    function autoClean(u) {
      if (!u.special.some(function (x) { return x.k === 'auto_cleanse' })) return false;
      var d = debuffs(u); if (d.length) { var s = pickOne(d); removeStatus(u, s); line({ side: u.side, a: u.i, txt: u.name + ' 的「聖潔」驅散了「' + s.n + '」', tick: 1, hp: hpSnap() }) }
      return true;
    }
    function flushSt(e) { if (!e._st) return; Object.keys(e._st).forEach(function (n) { var L = e._st[n]; e.txt += '，' + (L.length > 3 ? L.length + ' 人' : L.join('、')) + ((D.STS[n] || {}).pol === 'buff' ? ' 獲得「' : ' 陷入「') + n + '」' }); delete e._st }
    function cdOf(u, id) { return (u.cd && u.cd[id]) || 0 }
    function canUse(u, sk) { return sk && (sk.id === 'atk' || (cdOf(u, sk.id) <= 0 && (u.sp | 0) >= (sk.sp | 0))) }
    /* 手動選目標：單體技能可以點的對象（嘲諷中只能打嘲諷者）；群體回傳整組 */
    function cands(u, id) { var sk = D.SK[id] || D.SK.atk, t = sk.t;
      if (t === 'enemy_single') { var c = targetable(foes(u)), tn = c.filter(function (x) { return has(x, 'taunt') }); return tn.length ? tn : c }
      if (t === 'ally_single') return friends(u);
      return pickTargets(u, sk, false, false) }
    function endAct(u, sk) {
      if (SPM && u.cd) Object.keys(u.cd).forEach(function (k) { if (u.cd[k] > 0) u.cd[k]-- });
      u.st.forEach(function (s) {
        if (s.paused || s.banish || s.swal) return;
        if (s.turns === 'attack') { if (sk && sk.ty === 'damage') s.turns = 0; return }
        if (s.fresh) { s.fresh = false; return }
        s.turns--;
      });
      if (sk && sk.ty === 'damage') u.st.forEach(function (s) { if (s.rows.some(function (r) { return r.k === 'sure_crit_next' })) s.turns = 0 });
      u.st = u.st.filter(function (s) { return s.banish || s.swal || s.paused || s.turns === 'attack' || s.turns > 0 });
      nowAct = null;
      if (u.side === 'm' && !u.dead) digest(u);
    }
    /* 吞噬者每次行動結束：消化肚子裡的人（最大生命 × 被吞噬的 value，不吃減傷） */
    function digest(u) {
      P.forEach(function (x) {
        var q = x.st.filter(function (s) { return s.swal && s.src === u })[0]; if (!q || x.dead) return;
        var r0 = q.rows.filter(function (r) { return r.k === 'swallow' })[0], amt = Math.max(1, Math.round(x.b.mhp * (r0 ? r0.v : 0.05)));
        x.hp -= amt; var e = line({ side: x.side, a: x.i, txt: x.name + ' 被 ' + u.name + ' 消化了 ' + amt + ' 生命', tick: 1 }); addStat(e, x, 'taken', amt, u.name + ' 消化');
        if (checkDeath(x, e)) e.txt += '，被消化殆盡';
        e.hp = hpSnap();
      });
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
        var single = sk.t === 'enemy_single' && !hooks.area, H = sk.hits || 1, perT = {}, order = [], totalDmg = 0, anyCrit = false, hitList = [];
        var each = sk.p === 'random_each' && H > 1;
        for (var h = 0; h < H; h++) {
          var list = each ? (function () { var c = targetable(charmed ? friends(u).filter(function (x) { return x !== u }) : foes(u)); if (hooks.pool) { var pl = hooks.pool; c = c.filter(function (x) { return pl.indexOf(x) >= 0 }) } return c.length ? [pickOne(c)] : [] })() : tg.filter(function (x) { return !x.dead });
          if (!list.length) break;
          list.forEach(function (t0) {
            var t = t0, pr = single ? (hooks.protector ? hooks.protector(t0, u) : protectorFor(t0, u)) : null; if (pr && (hooks.protector || u.side === 'm')) t = pr;
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
            /* 元素符文：主傷害（減傷後實際傷害）的 30% 屬性傷害，類型跟著技能（物理／魔法／混合），再吃該元素抗性；
               數字現在就算好，等這一招結束後才獨立一行結算、演出，並附加該符文的狀態 */
            var elx = 0, dtp = (sk.parts.some(function (x) { return x.d === 'p' }) ? 'p' : '') + (sk.parts.some(function (x) { return x.d === 'm' }) ? 'm' : '');
            [['rune01', 'fire'], ['rune02', 'frost'], ['rune03', 'lightning'], ['rune04', 'wind']].forEach(function (q) { if (u.runes.indexOf(q[0]) >= 0 && real > 0) { var ex = Math.round(real * RV(D, q[0], 0, 0.3) * (1 - Math.min(resOf(t, q[1]), 0.9))); if (ex > 0) { elx += ex; totalDmg += ex; (e._rn = e._rn || []).push({ rid: q[0], elx: 1, el: q[1], dt: dtp, u: u, t: t, amt: ex }) } } });
            if (u.runes.indexOf('rune12') >= 0 && debuffs(t).length && real > 0) { var cr = Math.round((real + elx) * RV(D, 'rune12', 0, 0.5)); real += hurt(t, cr, u); totalDmg += cr }
            rec.hs.push((x.crit ? '暴擊 ' : '') + real + (x.absorbed ? '（吸收 ' + x.absorbed + '）' : ''));
            /* 水之幽暗：每次暴擊，對隨機一名敵人造成物攻、魔攻較高者 200% 的黑暗魔法傷害（不再暴擊、不連鎖） */
            if (x.crit && u.runes.indexOf('rune25') >= 0) { var fs = foes(u).filter(function (q) { return !banished(q) }); if (fs.length) { var wt = pickOne(fs), wa = Math.round(Math.max(stat(u, 'patk'), stat(u, 'matk')) * RV(D, 'rune25', 0, 2) * (1 + stat(u, 'mdmg')) * (1 - Math.min(stat(wt, 'mred'), 0.9)) * (1 - Math.min(resOf(wt, 'dark'), 0.9))); wa = Math.max(1, wa); totalDmg += wa;
              rq(e, 'rune25', function (r) { if (wt.dead || u.dead) return false; var wr = hurt(wt, wa, u); addStat(r, u, 'dmg', wr, '水之幽暗'); addStat(r, wt, 'taken', wr, u.name + ' 水之幽暗'); r.txt = u.name + ' 的「水之幽暗」：' + wt.name + ' 受到 ' + wr + ' 黑暗傷害'; fxOn(r, 'drown', u, [wt]); checkDeath(wt, r) }) } }
            addStat(e, u, 'dmg', real, sk.n); addStat(e, t, 'taken', real, u.name + ' ' + sk.n);
            /* 擴散（skill_effect 的 bonus / splash）：其他敵方各受到主目標「減傷前」傷害的 value 倍，再吃各自的減傷；
               跟著主目標的暴擊，主目標閃開就不擴散；擴散本身不能閃避、不觸發反應與符文 */
            if (bonus.splash && x.amt > 0) {
              var spP = sk.parts[0] && sk.parts[0].d === 'm', spBase = x.amt / Math.max(0.1, (1 - Math.min(stat(t, spP ? 'mred' : 'pred'), 0.9)) * (1 - Math.min(resOf(t, ''), 0.9)));
              foes(u).filter(function (q) { return q !== t && !q.dead && !banished(q) }).forEach(function (q) {
                var sa = Math.max(1, Math.round(spBase * num(bonus.splash.value) * (1 - Math.min(stat(q, spP ? 'mred' : 'pred'), 0.9)) * (1 - Math.min(resOf(q, ''), 0.9))));
                var sr = hurt(q, sa, u); totalDmg += sr; addStat(e, u, 'dmg', sr, sk.n + '（擴散）'); addStat(e, q, 'taken', sr, u.name + ' ' + sk.n + '（擴散）');
                (e._x = e._x || []).push('擴散 → ' + q.name + ' ' + sr); (e.spl = e.spl || []).push([q.side, q.i]); checkDeath(q, e);
              });
            }
            /* 荊棘之皇冠：排進反應佇列，敵人整招結束後才反彈（腳下荊棘光環） */
            if (t.runes && t.runes.indexOf('rune11') >= 0 && real > 0 && !u.dead) (e._th = e._th || []).push({ d: t, a: u, amt: Math.round(real * RV(D, 'rune11', 0, 0.5)) });
            /* 被打中時觸發的被動（輝煌龍的神恩寵兒：機率讓攻擊者陷入魅惑） */
            if (t.special && real > 0 && !u.dead && t.side !== u.side) t.special.forEach(function (sp) { if (sp.k === 'apply_status' && sp.tr === 'hit_taken' && !u.dead && RND() < sp.ch && applyStatus(t, u, sp.st, sp.turns, 1, null)) { (e._x = e._x || []).push(t.name + ' 的「' + (D.SK[sp.id] ? D.SK[sp.id].n : '被動') + '」讓 ' + u.name + ' 陷入「' + sp.st + '」'); (e.dringA = e.dringA || []).push([u.side, u.i]) } });
            if (t.runes && t.runes.indexOf('rune23') >= 0 && real > 0 && !u.dead && RND() < RV(D, 'rune23', 0, 0.2)) (function (t, u) { rq(e, 'rune23', function (r) { if (t.dead || u.dead || !applyStatus(t, u, '石化', RV(D, 'rune23', 1, 5), 1, null)) return false; r.txt = t.name + ' 的「石之正義」：' + u.name + ' 被石化 ' + RV(D, 'rune23', 1, 5) + ' 回合'; fxOn(r, 'stone', t, [u]) }) })(t, u);
            if (u.runes.indexOf('rune13') >= 0 && real > 0 && RND() < RV(D, 'rune13', 0, 0.3)) { var dbs = Object.keys(D.STS).filter(function (n) { return D.STS[n].pol === 'debuff' && !D.STS[n].rows.some(function (r) { return r.k === 'banish' || r.k === 'charm' || r.k === 'petrify' || r.k === 'swallow' }) }); var dn = pickOne(dbs); (function (t) { rq(e, 'rune13', function (r) { if (t.dead || !applyStatus(u, t, dn, RV(D, 'rune13', 1, 3), 1, null)) return false; r.txt = u.name + ' 的「夢靨之預兆」：' + t.name + ' 陷入「' + dn + '」' + RV(D, 'rune13', 1, 3) + ' 回合'; fxOn(r, 'nm', u, [t]) }) })(t) }
            /* 每一下附加的狀態 */
            effs.forEach(function (r) { if (r.effect_kind === 'status' && r.condition === 'per_hit' && !t.dead) applyStatus(u, t, r.status_name, r.turns, r.apply_chance, null) });
            /* 即死（死之敕命）：每次命中判定，對首領無效；倒下時照常可以被先祖之鄉、神恩救回 */
            if (!t.dead && t.hp > 0 && !t.boss && real > 0) effs.forEach(function (r) { if (r.effect_kind === 'instakill' && !t.dead && t.hp > 0 && RND() < (num(r.apply_chance) || 0)) { t.hp = 0; (e._x = e._x || []).push(t.name + ' 被「' + sk.n + '」即死') } });
            reactPost(t, u, x.re, e);
            checkDeath(t, e);
          });
        }
        e.tg = order.filter(function (t) { return t.side === 'm' }).map(function (t) { return t.i });
        e.tgP = order.filter(function (t) { return t.side === 'p' }).map(function (t) { return t.i });
        e.hitsN = hitList.length; e.tgh = each ? hitList.filter(function (t) { return t.side === 'm' }).map(function (t) { return t.i }) : null; e.tghP = each ? hitList.filter(function (t) { return t.side === 'p' }).map(function (t) { return t.i }) : null;
        e._dealt = (e._dealt || 0) + totalDmg;
        e.txt += ' → ' + order.map(function (t) { var hs = perT[t.i + t.side].hs; return H > 1 ? t.name + ' 受到 ' + hs.join('、') + ' 傷害' : (hs[0] === '閃開' ? t.name + ' 閃開了' : hs[0] === '擋下' ? t.name + ' 擋下了' : hs[0] === '無效' ? t.name + ' 不受影響' : t.name + (/^暴擊/.test(hs[0]) ? ' 暴擊！受到 ' + hs[0].slice(3) : ' 受到 ' + hs[0]) + ' 傷害') }).join('，');
        if (e._x) { e.txt += '（' + e._x.join('，') + '）'; delete e._x }
        /* 吸血 */
        var ls = sv(u, 'lifesteal') + auraVal(u, 'lifesteal') + (u.runes.indexOf('rune10') >= 0 ? RV(D, 'rune10', 0, 0.25) : 0); u.special.forEach(function (s) { if (s.k === 'lifesteal') ls += s.v });
        if (ls > 0 && totalDmg > 0 && !u.dead) { var g = heal(u, u, totalDmg * ls, null, true); if (g) { e.txt += '，吸收 ' + g + ' 生命'; addStat(e, u, 'heal', g, '吸血'); e.ls = 1 /* 畫面：血氣從被打的人流回攻擊者 */ } }
        /* 熊之力量：濺射 */
        if (u.runes.indexOf('rune22') >= 0 && totalDmg > 0) { var bAmt = Math.round(totalDmg * RV(D, 'rune22', 0, 0.3));
          rq(e, 'rune22', function (r) { var hitT = []; foes(u).forEach(function (t) { if (banished(t)) return; var sp = hurt(t, bAmt, u); addStat(r, u, 'dmg', sp, '熊之力量'); addStat(r, t, 'taken', sp, u.name + ' 熊之力量'); if (sp > 0) hitT.push(t); checkDeath(t, r) }); if (!hitT.length) return false; r.txt = u.name + ' 的「熊之力量」：' + hitT.length + ' 個敵人各受到 ' + bAmt + ' 真實傷害'; fxOn(r, 'bear', u, hitT) }) }
        /* 舞台魅力等「攻擊時」觸發 */
        u.special.forEach(function (s) { if (s.k === 'apply_status' && s.tr === 'attack' && order.length && RND() < s.ch) { var cand = order.filter(function (t) { return !t.dead && !(s.cond === 'not_boss' && t.boss) && t.side !== u.side }); if (cand.length) applyStatus(u, pickOne(cand), s.st, s.turns, 1, e) } });
        /* 一般狀態（每個目標擲一次） */
        effs.forEach(function (r) {
          if (r.effect_kind !== 'status' || r.condition === 'per_hit') return;
          if (r.target === 'self') applyStatus(u, u, r.status_name, r.turns, r.apply_chance, e);
          else if (r.target === 'ally_all') friends(u).forEach(function (f) { applyStatus(u, f, r.status_name, r.turns, r.apply_chance, e) }); /* 傷害技順便替自己全隊上增益（神聖輝煌） */
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
        if (sk.ty === 'buff' && u.runes.indexOf('rune14') >= 0 && D.STS['輝煌']) rq(e, 'rune14', function (r) { if (u.dead || !applyStatus(u, u, '輝煌', RV(D, 'rune14', 1, 5), 1, null)) return false; r.txt = u.name + ' 的「太陽之照耀」：獲得「輝煌」' + RV(D, 'rune14', 1, 5) + ' 回合（力量、智力 +30%）'; fxOn(r, 'sun', u, [u]) });
      }
      /* 召喚：effect = 怪物 id，value = 上限；condition 填 all_monsters 時上限算「全場活著的怪」，空白則只算同種怪（深林叫喚）；
         apply_chance = 成功機率（空白 = 必定）。未滿且成功就叫一隻出來，下一回合開始行動 */
      if (u.side === 'm') effs.forEach(function (r) {
        if (r.effect_kind !== 'summon' || !D.mon[r.effect]) return;
        var allM = String(r.condition || '').trim() === 'all_monsters';
        var aliveN = M.filter(function (m) { return !m.dead && (allM || m.mid === r.effect) }).length;
        if (aliveN >= (num(r.value) || 1)) { if (allM) e.txt += '，但場上已經滿了'; return }
        var ch = String(r.apply_chance || '').trim() === '' ? 1 : num(r.apply_chance);
        if (RND() >= ch) { e.txt += '，但沒有同伴回應'; return }
        var nu = monster(D.mon[r.effect], u.stg || 1, D); nu.b.mhp = Math.round(nu.b.mhp * (u.hs || 1)); nu.stg = u.stg; nu.hs = u.hs;
        var same = M.filter(function (m) { return m.mid === r.effect }).length; nu.name += ' ' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.min(25, same)];
        nu.i = M.length; nu.hp = nu.b.mhp; nu.st = []; nu.cy = Math.floor(RND() * nu.cycle.length); nu.dead = false; nu.used = {}; nu.flags = {}; nu.dragon = RV(D, 'rune18', 0, 0.5); nu.summoned = true;
        M.push(nu); U.push(nu); e.summon = (e.summon || []).concat(nu.i); e.txt += '，召喚了 ' + nu.name;
      });
      /* 額外治療列（生命脈衝、至高打擊、奉獻詩歌…）；target 填 target = 跟技能同一個目標（堅毅禱言、意志禱言） */
      effs.forEach(function (r) {
        if (r.effect_kind !== 'heal') return;
        var who = r.target === 'target' ? tg.filter(function (t) { return !t.dead && t.side === u.side }) : r.target === 'self' ? [u] : r.target === 'ally_all' ? friends(u) : r.target === 'ally_others' ? friends(u).filter(function (x) { return x !== u }) : r.target === 'ally_single' ? [choose(friends(u), r.condition || 'lowest_hp')] : [];
        var out = [], tot = 0;
        who.forEach(function (t) {
          if (!t) return;
          var v, c = false;
          if (r.base === 'sacrificed_hp') v = sac * num(r.value);
          else if (r.base === 'mhp') v = num(r.value) * t.b.mhp; /* 照目標最大生命的比例（褪皮），不擲暴擊 */
          else { c = RND() < stat(u, 'crit'); v = num(r.value) * (r.base === 'p_atk' ? stat(u, 'patk') : stat(u, 'matk')) * (1 + u.b.heal) * (c ? 1 + stat(u, 'cdmg') : 1) }
          var got = heal(u, t, v); tot += got; if (got) { out.push(t.name + (c ? ' 暴擊！' : ' ') + '恢復 ' + got); addStat(e, u, 'heal', got, sk.n) }
        });
        if (out.length) e.txt += '，' + out.join('，');
        if (tot > 0 && r.base !== 'sacrificed_hp') echo(u, tot, e);
        e.hl = (e.hl || []).concat(who.filter(function (t) { return t && t.side === 'p' && (e.hl || []).indexOf(t.i) < 0 }).map(function (t) { return t.i }));
      });
      /* 鹿之守護、月之淨化：主動治療時 */
    }
    function echo(u, tot, e) {
      u.special.forEach(function (s) { if (s.k === 'heal_echo') { var g = heal(u, u, tot * s.v, null, true); if (g) { e.txt += '，' + u.name + ' 同調恢復 ' + g; addStat(e, u, 'heal', g, '生命同調') } } });
      if (u.runes.indexOf('rune16') >= 0 && D.STS['生命守護']) { applyStatus(u, u, '生命守護', 3, 1, null); var shv = 0; u.st.forEach(function (s) { if (s.n === '生命守護') { s.shield = Math.min(tot * RV(D, 'rune16', 0, 0.5), u.b.mhp * RV(D, 'rune16', 1, 0.3)); shv = s.shield } }); if (shv > 0) e.txt += '，鹿之守護：' + u.name + ' 獲得 ' + Math.round(shv) + ' 護盾' }
      if (u.runes.indexOf('rune15') >= 0) { var f = foes(u).filter(function (q) { return !banished(q) }); if (f.length) { var t = pickOne(f), mAmt = Math.round(tot * RV(D, 'rune15', 0, 0.5));
        rq(e, 'rune15', function (r) { if (t.dead || u.dead) return false; var d = hurt(t, mAmt, u); r.txt = u.name + ' 的「月之淨化」：' + t.name + ' 受到 ' + d + ' 真實傷害'; addStat(r, u, 'dmg', d, '月之淨化'); addStat(r, t, 'taken', d, u.name + ' 月之淨化'); fxOn(r, 'moon', u, [t]); checkDeath(t, r) }) } }
    }

    /* --- 主迴圈 --- */
    function alive(a) { return a.some(function (x) { return !x.dead && !swallowed(x) }) } /* 被吞的人不算還能戰鬥 */
    if (lone) line({ kind: 'note', idle: true, txt: P[0].name + ' 獨自上陣，進入「獨狼」狀態：生命、物理攻擊力、魔法攻擊力 ×1.5' });
    /* 新的一回合：回傳這回合的行動順序（速度高先動，加一點隨機讓同速的隨機排） */
    function round() {
      rounds++;
      line({ kind: 'round', txt: '— 第 ' + rounds + ' 回合 —' });
      if (SPM && rounds > 1) P.forEach(function (u) { if (!u.dead) u.sp = Math.min(SPMAX, (u.sp | 0) + 1) });
      if (rounds > 1) U.forEach(function (u) { if (u.runes.indexOf('rune18') >= 0) u.dragon = Math.max(RV(D, 'rune18', 2, 0.2), u.dragon - RV(D, 'rune18', 1, 0.05)) });
      return U.filter(function (u) { return !u.dead }).map(function (u) { return { u: u, s: stat(u, 'speed') + RND() * 3 } }).sort(function (a, b) { return b.s - a.s }).map(function (x) { return x.u });
    }
    /* 輪到 u 時先做的事（聖潔驅散），再 begin */
    function start(u) { if (u.special.some(function (x) { return x.k === 'auto_cleanse' })) autoClean(u); return begin(u) }
    /* 戰棋的「待機」：有行動但不出手，狀態照常減一次 */
    /* 待機：有行動但不出手，狀態照常減一次；SP 制度下額外 +1 SP */
    function wait(u) { var e = u._e || line({ side: u.side, a: u.i, txt: '' }); delete u._e; nowAct = u; e.txt = u.name + ' 待機'; e.idle = 1;
      if (SPM && u.side === 'p') { var g0 = u.sp | 0; u.sp = Math.min(SPMAX, g0 + 1); e.txt += u.sp > g0 ? '，恢復 1 SP' : ''; e.wt = 1 }
      endAct(u, null); e.hp = hpSnap() }
    /* 戰鬥結束時還在肚子裡的人算陣亡 */
    function endSwallow() { P.forEach(function (x) { if (x.dead || !swallowed(x)) return; x.hp = 0; x.dead = true; x.st = []; line({ kind: 'note', idle: true, txt: x.name + ' 沒能從肚子裡出來……', pko: [x.i], hp: hpSnap() }) }) }
    function over() { return !alive(P) || !alive(M) || rounds >= MAXR }
    return { P: P, M: M, U: U, ev: ev, hooks: hooks, SPM: SPM, cands: cands, canUse: canUse, cdOf: cdOf, round: round, start: start, begin: begin, finish: finish, wait: wait, act: act, stat: stat, ctrl: ctrl, has: has, banished: banished, swallowed: swallowed, endSwallow: endSwallow, alive: alive, over: over,
      rounds: function () { return rounds }, res: function () { return alive(M) ? (alive(P) ? 'draw' : 'lose') : 'win' }, MAXR: MAXR };
  }
  /* 自動戰鬥：整場一次跑完 */
  function run(P, M, D, opt) {
    var S = session(P, M, D, opt);
    while (S.alive(P) && S.alive(M) && S.rounds() < MAXR) {
      var order = S.round();
      for (var q = 0; q < order.length; q++) {
        var u = order[q]; if (u.dead) continue;
        if (!S.alive(P) || !S.alive(M)) break;
        if (S.start(u)) S.finish(u);
      }
    }
    S.endSwallow();
    return { ev: S.ev, res: S.alive(M) ? 'lose' : 'win', rounds: S.rounds() };
  }

  var API = { prepare: prepare, player: player, monster: monster, stageMonsters: stageMonsters, stageRow: stageRow, run: run, session: session, ELN: ELN };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.BattleEngine = API;
})(this);

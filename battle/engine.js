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
  var ORB = { fire: '火精共鳴', frost: '冰精共鳴', lightning: '雷精共鳴', wind: '風精共鳴' }, EL4 = ['fire', 'frost', 'lightning', 'wind'], ELST = { fire: '燃燒', frost: '霜凍', lightning: '雷滯', wind: '風化' }; /* 魔導精靈使：四屬精靈共鳴光球、四屬隨機（rand4）、各屬性對應的附帶狀態 */
  var CCB = { stun: 1, sleep: 1, confuse: 1, charm: 1, petrify: 1, fear: 1 }; /* 無畏（cc_block）擋得住的控制：暈眩／麻痺／凍結、睡眠、混亂、魅惑、石化、恐懼；封禁、放逐、被吞噬不擋 */
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
      if (r.part3_dmg) parts.push({ d: r.part3_dmg, e: r.part3_element || '', r: num(r.part3_ratio) });
      if (r.part4_dmg) parts.push({ d: r.part4_dmg, e: r.part4_element || '', r: num(r.part4_ratio) }); /* 精靈真儀：四段 */
      D.SK[r.skill_id] = { id: r.skill_id, n: r.skill_name, j: r.job, lv: parseInt(r.job_level, 10) || 0, kind: r.kind, t: r.target, p: r.pick, ty: r.type,
        cr: num(r.extra_crit_rate), cd: num(r.extra_crit_damage), parts: parts, rand4: parts.some(function (x) { return x.e === 'rand4' }) /* 每一下隨機冰火雷風（混沌風暴） */, vfx: r.vfx || '', hits: parseInt(r.hits, 10) || 1, sure: r.sure_hit === '1', ds: r.skill_desc || '', raw: r /* 原始欄位（戰棋讀 range / area / area_size / cost） */ };
    });
    D.SK.atk = { id: 'atk', n: '普通攻擊', kind: 'combat', t: 'enemy_single', p: 'random', ty: 'damage', cr: 0, cd: 0, parts: [{ d: 'p', e: '', r: 1 }], vfx: '', hits: 1, atk: true, sp: 0, cdN: 0 };
    /* SP 消耗：skill_info 的 sp 欄有填就用；空白 = 單體 1、群體（enemy_all／ally_all／ally_others）2。冷卻 = cost 欄（自己的行動次數） */
    Object.keys(D.SK).forEach(function (id) { var k = D.SK[id]; if (id === 'atk') return; var raw = k.raw || {}, v = String(raw.sp == null ? '' : raw.sp).trim();
      k.sp = v !== '' ? Math.max(0, parseInt(v, 10) || 0) : (/_all$/.test(k.t || '') || k.t === 'ally_others' ? 2 : 1); k.cdN = Math.max(0, parseInt(raw.cost, 10) || 0); if (k.kind === 'ultimate') { k.sp = 0; k.cdN = 0 } /* 奧義：改用奧義值（集滿 100），不吃 SP、沒有冷卻 */ });
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
    /* 職業精通（job_mastery.csv）：職業 50 級後的永久天賦 */
    D.MST = {}; (c.job_mastery || []).forEach(function (r) { if (r.job_sn && r.kind) D.MST[r.job_sn] = r });
    D.wbyname = {}; Object.keys(D.wpn).forEach(function (k) { D.wbyname[D.wpn[k].weapon_name] = k });
    /* 符文數值：rune_info.csv 的 value_1～3（有 % 的換成小數，純數字照原樣，文字不算）；空的就用程式內的預設值 */
    /* 符文等級表 rune_level.csv：D.RVL[符文][等級] = [v1, v2, v3, v4]；有這張表時，符文要 Lv1 以上才生效（等級看玩家資料 rs 的碎片數） */
    D.RVL = null; if (c.rune_level && c.rune_level.length) { D.RVL = {}; c.rune_level.forEach(function (r) { if (!r.u_sn) return; var L = parseInt(r.level, 10) || 0; (D.RVL[r.u_sn] = D.RVL[r.u_sn] || {})[L] = [r.value_1, r.value_2, r.value_3, r.value_4].map(function (x) { var t = String(x == null ? '' : x).trim(); return /^-?[\d.]+%?$/.test(t) ? pn(t) : null }) }) }
    D.RV = {}; (c.rune_info || []).forEach(function (r) { if (r.u_sn) D.RV[r.u_sn] = [r.value_1, r.value_2, r.value_3].map(function (x) { var t = String(x == null ? '' : x).trim(); return /^-?[\d.]+%?$/.test(t) ? pn(t) : null }) });
    return D;
  }
  /* 符文數值：o = 持有者（單位，讀 o.rlv）、等級對照表（{符文: 等級}）或等級數字；有等級表就讀該等級，沒有就讀 rune_info 的 value 欄 */
  function RV(D, id, k, dflt, o) {
    var lv = typeof o === 'number' ? o : o && o.rlv ? o.rlv[id] : o && typeof o === 'object' ? o[id] : 0;
    if (D && D.RVL && lv) { var t = D.RVL[id] && D.RVL[id][lv], x = t ? t[k] : null; if (x != null && !isNaN(x)) return x; if (t) return dflt }
    var a = D && D.RV && D.RV[id], v = a ? a[k] : null; return v == null || isNaN(v) ? dflt : v }
  /* 碎片 → 等級：每級所需 1,2,3,5,8,12,18,25,35,50（累計 159 片 = Lv10） */
  var RNEED = [1, 2, 3, 5, 8, 12, 18, 25, 35, 50];
  function runeLv(n) { n = n | 0; var L = 0, c = 0; for (var i = 0; i < RNEED.length; i++) { c += RNEED[i]; if (n >= c) L = i + 1; else break } return L }
  function runeLevels(p) { var rs = (p && p.rs) || {}, o = {}; Object.keys(rs).forEach(function (k) { o[k] = runeLv(rs[k]) }); return o }
  function stageRow(D, area, l) { var x = null; D.stage.forEach(function (r) { if (r.area_id === area && (parseInt(r.stage, 10) || 0) === l) x = r }); return x }

  /* ---------- 建立玩家單位（算法跟角色頁、營地一致） ---------- */
  function jobSn(p) { return p.jobSn || ('job' + ('0' + ((p.job | 0) + 1)).slice(-2)) }
  function learned(p, sk) { if (p && p.npcLearn) return !!sk && (sk.id === 'atk' || (p.npcLearn[sk.id] != null && (p.lv | 0) >= p.npcLearn[sk.id])); /* NPC：依人物等級學會（npc_info 的 skills） */ var jl = p.jobLv || {}; return !!sk && (sk.id === 'atk' || (/^job\d+$/.test(sk.j || '') && (jl[sk.j] | 0) >= sk.lv)) }
  function setJobs(p) { var main = p.jobSn || ('job' + ('0' + ((p.job | 0) + 1)).slice(-2)), x = p.skills && p.skills.extra, ex = Array.isArray(x) ? x : (typeof x === 'string' && x ? [x] : []); return [main].concat(ex.slice(0, 2)) }
  /* ---------- 幻獸 ----------
     玩家資料 beasts[0]（艾德蒙的頁面做好之前，第一隻就是裝備中的）= {sp 蛋的種類, name, lv 等級, st 各項屬性格數, sk 裝備的兩招}。
     幼年體：Lv1 單體攻擊、Lv6 守護、Lv12 減益、Lv18 全體攻擊（技能編號 = beast_info 的 skill_1～4 → bst_元素_1～4）；
     屬性每項 15 格滿，數值 = 格數 / 15 × 上限；攻擊力只加在物攻、魔攻較高的那個；本屬性抗性只加幻獸自己那一系、其他屬性抗性加另外 6 系 */
  var BSTK = { fire: 'fire', ice: 'frost', bolt: 'lightning', wind: 'wind', leaf: 'nature', sun: 'light', moon: 'dark', frost: 'frost', lightning: 'lightning', nature: 'nature', light: 'light', dark: 'dark' };
  var BLEARN = [[1, 0], [6, 2], [12, 3], [18, 1]]; /* [等級, 技能順序 0～3] */
  var BCAP = { atk: 0.10, dmg: 0.15, crit: 0.10, red: 0.15, hp: 0.20, res: 0.30, eva: 0.08, cdmg: 1, ores: 0.10 }, BSTEP = 15, BCH = 0.25;
  /* 成熟體：b.ev = 'atk'|'def'|'sup'（進化時抽到的型），b.mo = 成熟體四招的學習順序；技能編號 0～3 = 幼年體、4～7 = 成熟體（4 + beast_info 的順序） */
  function beastOf(p) {
    var L = p && Array.isArray(p.beasts) ? p.beasts : [], b = p && p.beastOn === -1 ? null : L[p && p.beastOn | 0] || L[0];/* beastOn：照料幻獸裡選的同行幻獸（-1 = 卸下） */ if (!b || !BSTK[b.sp]) return null;
    var lv = clamp(b.lv | 0 || 1, 1, 20), ev = ['atk', 'def', 'sup'].indexOf(b.ev) >= 0 ? b.ev : '', base = BSTK[b.sp], got;
    if (ev) { var mo = Array.isArray(b.mo) && b.mo.length === 4 ? b.mo : [0, 1, 2, 3], n = 1 + (lv >= 6) + (lv >= 12) + (lv >= 18); got = [0, 1, 2, 3].concat(mo.slice(0, n).map(function (x) { return 4 + x })) }
    else got = BLEARN.filter(function (x) { return lv >= x[0] }).map(function (x) { return x[1] });
    var sk = (Array.isArray(b.sk) ? b.sk : []).filter(function (i, n, a) { return got.indexOf(i) >= 0 && a.indexOf(i) === n }).slice(0, 2); if (!sk.length) sk = got.slice(-2);
    return { k: ev ? base + '_' + ev : base, base: base, ev: ev, name: b.name || '幻獸', lv: lv, st: b.st || {}, sk: sk, learned: got, cap: ev ? BSTEP * 2 : BSTEP };
  }
  /* 第 i 招的技能 id 與畫面用的 [幻獸 key, 招式順序] */
  function bsid(b, i) { return i >= 4 ? 'bst_' + b.base + '_' + b.ev + '_' + (i - 3) : 'bst_' + (b.base || b.k) + '_' + (i + 1) }
  function bvis(b, i) { return i >= 4 ? [b.base + '_' + b.ev, i - 4] : [b.base || b.k, i] }
  function player(p, D, opt) {
    opt = opt || {};
    var jl = p.jobLv || {}, lv = Math.max(1, p.lv | 0 || 1), sv = p.skills || {}, ws = D.wbyname[p.weapon] || '';
    var wd = (p.weapons && p.weapons[ws]) || {}, wlv = Math.max(1, wd.lv | 0 || 1), rlv = runeLevels(p), en = (Array.isArray(wd.ench) ? wd.ench : []).filter(function (id) { return !D.RVL || (rlv[id] | 0) >= 1 }).slice(0, wlv >= 75 ? 3 : wlv >= 60 ? 2 : wlv >= 30 ? 1 : 0);
    var pts = [0, 1, 2].map(function (q) { return Array.isArray(wd.pts) ? Math.max(0, wd.pts[q] | 0) : 0 });
    function rOn(id) { return en.indexOf(id) >= 0 }
    var pas = (Array.isArray(sv.passive) ? sv.passive : []).filter(function (id, q) { var k = D.SK[id]; return k && lv >= PSLOT[q] && learned(p, k) });
    var self = Object.assign({}, p.npcFix || {}), aura = [], special = [], cpas = []; /* NPC 的固定減傷、抗性（npc_info 的 fixed_stats） */
    pas.forEach(function (id) { (D.EFF[id] || []).forEach(function (e) {
      if (e.effect_kind !== 'passive' || !e.effect) return;
      if (e.condition && /^weapon/.test(e.condition) && e.condition !== ws) return;
      var v = num(e.value);
      if (/^status:/.test(e.condition || '')) { cpas.push({ id: id, k: e.effect, v: v, sts: e.condition.slice(7).split('|').map(function (x) { return x.trim() }).filter(Boolean) }); return } /* 怒戰英豪：condition = status:怒意|戰意，身上有其中一個才算（同一招只算一次） */
      if (e.trigger || ['revive_self', 'forge_bonus', 'exp_bonus', 'apply_status', 'elem_orb', 'deep_freeze', 'sp_elem', 'crit_wind', 'prey_mark'].indexOf(e.effect) >= 0) { special.push({ id: id, k: e.effect, v: v, ch: num(e.trigger_chance) || 1, tr: e.trigger, st: e.status_name, turns: e.turns, cond: e.condition, el: e.element, dt: e.dmg_type, tg: e.target }); return }
      self[e.effect] = (self[e.effect] || 0) + v;
      if (e.target === 'ally_all') aura.push({ id: id, k: e.effect, v: v });
      else if (['lifesteal', 'extra_dmg', 'heal_echo', 'auto_cleanse'].indexOf(e.effect) >= 0) special.push({ id: id, k: e.effect, v: v, el: e.element, dt: e.dmg_type });
    }) });
    /* 職業精通：職業 50 級 → 天賦永久生效（數值型直接加進被動數值，其他的放在 mst 給戰鬥時觸發）；重置職業後職業等級歸零就自然消失 */
    var mst = {};
    Object.keys(D.MST || {}).forEach(function (js) {
      if ((jl[js] | 0) < 50) return; var r = D.MST[js];
      if (r.kind === 'stat') { [1, 2].forEach(function (q) { var k = r['stat_' + q]; if (k) self[k] = (self[k] || 0) + num(r['value_' + q]) }) }
      else mst[r.kind] = { v: num(r.value_1), v2: num(r.value_2), ch: String(r.chance || '').trim() === '' ? 1 : num(r.chance), st: r.status_name || '', turns: parseInt(r.turns, 10) || 1, n: r.talent_name || '' };
    });
    function sp(k) { return self[k] || 0 }
    var T = {};
    ['str', 'int', 'agi', 'vit', 'luk'].forEach(function (k) {
      var j = 0; Object.keys(jl).forEach(function (s) { var l = jl[s] | 0, g = D.grow[s]; if (l > 0 && g) j += num(g['per_level_' + k]) * l });
      var bs = 10 + j + ((p.alloc || {})[k] | 0); T[k] = bs + (rOn('rune08') ? Math.round(bs * RV(D, 'rune08', 0, 0.1, rlv)) : 0);
    });
    var at = D.attr[jobSn(p)] || {}, row = p.wrow || D.wpn[ws]; /* NPC 的武器數值另外寫在 npc_info */
    function wsum(key) { var t = 0; if (!row) return 0; for (var q = 1; q <= 6; q++) { if (row['auto_stat_' + q] !== key) continue; var per = String(row['auto_per_level_' + q] || '').trim(), v = num(per) * wlv; t += /%/.test(per) ? v / 100 : v }
      for (var u = 1; u <= 3; u++) { if (row['temper_stat_' + u] !== key || !pts[u - 1]) continue; t += num(row['temper_per_point_' + u]) * pts[u - 1] / 100 } return t }
    function ps(stat) { var t = 0, pe = p.pets || {}; Object.keys(D.pet).forEach(function (id) { var pi = D.pet[id]; if (pi.stat !== stat) return; t += pi.per * clamp(((pe[id] || {}).lv) | 0, 0, 10) }); return t }
    var v = T.vit, s = T.str, i = T.int, a = T.agi, l = T.luk, apa = sp('atk_per_ally') * (opt.allies || 0);
    var P0 = Math.round((s + wsum('p_atk') + Math.round(v * sp('vit_to_p_atk'))) * (1 + pn(at.p_atk_bonus) + sp('p_atk_rate') + apa));
    var M0 = Math.round((i + wsum('m_atk') + Math.round(s * sp('str_to_m_atk'))) * (1 + pn(at.m_atk_bonus) + sp('m_atk_rate') + apa)), bP = 0, bM = 0;
    if (rOn('rune09')) { var hi = Math.max(P0, M0), lo = Math.min(P0, M0), ad = Math.max(0, Math.min(Math.round(hi * RV(D, 'rune09', 0, 0.5, rlv)), hi - lo)); if (P0 > M0) bM = ad; else if (M0 > P0) bP = ad }
    var r5 = rOn('rune05') ? RV(D, 'rune05', 0, 0.2, rlv) : 0, r5d = rOn('rune05') ? RV(D, 'rune05', 1, 1, rlv) : 0;
    var mhp = Math.round((v * 5 + 10 * (lv - 1) + Math.round(a * sp('agi_to_hp') * 5) + Math.round(i * sp('int_to_hp') * 5) + Math.round((P0 + bP) * sp('p_atk_to_hp'))) * (1 + pn(at.hp_bonus) + wsum('hp_rate') + sp('hp_rate') + (rOn('rune06') ? RV(D, 'rune06', 1, 0, rlv) : 0) + (rOn('rune07') ? RV(D, 'rune07', 1, 0, rlv) : 0)));
    var res = {}; ELS.forEach(function (e) { res[e] = pn(at[e + '_res_rate_bonus']) + sp(e + '_res_rate') });
    var u = {
      side: 'p', name: p.name || '冒險者', uid: p.uid, boss: false,
      b: { mhp: Math.max(1, mhp), patk: P0 + bP, matk: M0 + bM, pdmg: wsum('p_damage_rate') + sp('p_damage_rate'), mdmg: wsum('m_damage_rate') + sp('m_damage_rate'),
        eva: a / (a + 800) + pn(at.eva_rate_bonus) + wsum('eva_rate') + ps('eva_rate') + sp('eva_rate'),
        crit: a / (a + 500) + pn(at.crit_rate_bonus) + wsum('crit_rate') + r5 + sp('crit_rate'),
        cdmg: 0.5 + l * 0.01 + pn(at.crit_damage_rate_bonus) + wsum('crit_damage_rate') + r5d + sp('crit_damage_rate'),
        pred: pn(at.p_def_bonus) + wsum('p_reduce_rate') + ps('p_reduce_rate') + (rOn('rune06') ? RV(D, 'rune06', 0, 0.2, rlv) : 0) + sp('p_reduce_rate'),
        mred: pn(at.m_def_bonus) + wsum('m_reduce_rate') + ps('m_reduce_rate') + (rOn('rune07') ? RV(D, 'rune07', 0, 0.2, rlv) : 0) + sp('m_reduce_rate'),
        res: res, heal: sp('heal_rate'), speed: 10 + num(at.speed_bonus) + a / 20, hit: 0 },
      /* 4 格只認「現職＋額外技能組（最多兩組）」的技能，其他當普通攻擊 */
      cycle: (Array.isArray(sv.combat) ? sv.combat : []).slice(0, 4).map(function (id) { return id && D.SK[id] && D.SK[id].kind === 'combat' && learned(p, D.SK[id]) && (p.npcLearn || setJobs(p).indexOf(D.SK[id].j) >= 0) ? id : 'atk' }),
      reaction: sv.reaction && D.SK[sv.reaction] && learned(p, D.SK[sv.reaction]) ? sv.reaction : '',
      aura: aura, special: special, cpas: cpas, mst: mst, runes: en.slice(), rlv: rlv, weapon: p.weapon || '', p: p,
      apa: sp('atk_per_ally'), apaN: opt.allies || 0, pB: s + wsum('p_atk') + Math.round(v * sp('vit_to_p_atk')), mB: i + wsum('m_atk') + Math.round(s * sp('str_to_m_atk')),
      ult: (Object.keys(D.SK).map(function (id) { return D.SK[id] }).filter(function (k) { return k.kind === 'ultimate' && learned(p, k) })[0] || {}).id || '', /* 奧義：學會就能用，不佔戰鬥格、不限目前職業（每人只會有一招） */
      learned: Object.keys(D.SK).map(function (id) { return D.SK[id] }).filter(function (k) { return k.kind === 'combat' && k.id !== 'atk' && k.j && k.j !== 'monster' && learned(p, k) })
    };
    while (u.cycle.length < 4) u.cycle.push('atk');
    /* 羊之新生：減傷 × v1 加成為增傷，轉換來的加成最多 v2 */
    /* 幻獸：屬性加成直接加進主人的基礎數值（NPC 沒有幻獸） */
    var bst = p.npcLearn ? null : beastOf(p);
    if (bst) { u.bst = bst; var bf = function (k) { return clamp(Number(bst.st[k]) || 0, 0, bst.cap || BSTEP) / BSTEP * BCAP[k] };/* 每格效果幼年、成熟都一樣，成熟體最多 30 格 */
      if (u.b.patk >= u.b.matk) u.b.patk = Math.round(u.b.patk * (1 + bf('atk'))); else u.b.matk = Math.round(u.b.matk * (1 + bf('atk')));
      u.b.pdmg += bf('dmg'); u.b.mdmg += bf('dmg'); u.b.crit += bf('crit'); u.b.pred += bf('red'); u.b.mred += bf('red'); u.b.mhp = Math.round(u.b.mhp * (1 + bf('hp'))); u.b.eva += bf('eva'); u.b.cdmg += bf('cdmg');
      ELS.forEach(function (e) { u.b.res[e] = (u.b.res[e] || 0) + (e === (bst.base || bst.k) ? bf('res') : bf('ores')) }) }
    if (rOn('rune24')) { var k24 = RV(D, 'rune24', 0, 1, rlv), c24 = RV(D, 'rune24', 1, 9, rlv); u.b.pdmg += Math.min(Math.min(u.b.pred, 0.8) * k24, c24); u.b.mdmg += Math.min(Math.min(u.b.mred, 0.8) * k24, c24) }
    return u;
  }

  /* ---------- 建立怪物單位 ---------- */
  /* 全域怪物強度倍率（管理後台 meta/difficulty）：D.mul = {hp, atk}，沒設定就是 1 */
  function MUL(D, k) { var v = D && D.mul ? Number(D.mul[k]) : 1; return v >= 0.5 && v <= 2 ? v : 1 }
  function monster(r, stg, D) {
    var hg = num(r.hp_growth), ag = num(r.atk_growth), k = stg - 1, res = {};
    ELS.forEach(function (e) { res[e] = num(r[e + '_res_rate']) }); res.none = num(r.none_res_rate);
    var cyc = [r.skill_1, r.skill_2, r.skill_3, r.skill_4].map(function (x) { x = String(x || '').trim(); return x === '-' ? '-' : x && (x === 'atk' || D.SK[x] || (x.indexOf('|') > 0 && x.split('|').every(function (y) { return D.SK[y.trim()] }))) ? x : 'atk' }).filter(function (x) { return x !== '-' }); /* 「-」＝這格不用（獅鷲只循環三招） */ if (!cyc.length) cyc = ['atk'];
    return { side: 'm', name: r.monster_name, mid: r.monster_id, sprite: r.sprite, boss: r.boss === '1',
      b: { mhp: Math.round(num(r.hp) * (1 + hg * k) * MUL(D, 'hp')), patk: Math.round(num(r.p_atk) * (1 + ag * k) * MUL(D, 'atk')), matk: Math.round(num(r.m_atk) * (1 + ag * k) * MUL(D, 'atk')), pdmg: 0, mdmg: 0,
        eva: num(r.eva_rate), crit: num(r.crit_rate), cdmg: num(r.crit_damage_rate) || 0.5, pred: num(r.p_reduce_rate), mred: num(r.m_reduce_rate), res: res, heal: 0, speed: num(r.speed) || 10, hit: 0 },
      cycle: cyc, reaction: (r.reaction && D.SK[String(r.reaction).trim()]) ? String(r.reaction).trim() : '', aura: monAura(r, D), special: monPassive(r, D), mst: monMst(r, D), runes: [], atkM: String(r.atk_dmg || '').trim().split(':')[0] === 'm' /* 普攻照魔攻算（沉淪魔巫師的魔法飛彈） */, atkE: String(r.atk_dmg || '').trim().split(':')[1] || '' /* m:fire = 普攻是火焰魔法（火焰元素） */ };
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
  /* 把怪物換成另一隻（不死、重生用）：數值、技能、圖都換，生命全滿、狀態清空 */
  function morphUnit(u, mid, D) {
    var nu = monster(D.mon[mid], u.stg || 1, D); u.name = nu.name; u.mid = nu.mid; u.sprite = nu.sprite; u.b = nu.b; u.b.mhp = Math.round(u.b.mhp * (u.hs || 1));
    if (u.as) { u.b.patk = Math.round(u.b.patk * u.as); u.b.matk = Math.round(u.b.matk * u.as) } u.hp = u.b.mhp; u.st = []; u.cycle = nu.cycle; u.cy = 0; u.reaction = nu.reaction; u.special = nu.special; u.aura = nu.aura;
  }
  /* 怪物用的職業精通效果（被動 effect = mastery_cleanse → 跟牧師精通「驅魔」一樣：每回合開始隨機解除一名同伴的一個負面狀態） */
  function monMst(r, D) {
    var o = null;
    String(r.passive || '').split(';').map(function (x) { return x.trim() }).filter(Boolean).forEach(function (id) {
      (D.EFF[id] || []).forEach(function (e) { if (e.effect_kind === 'passive' && e.effect === 'mastery_cleanse') { o = o || {}; o.cleanse = { n: (D.SK[id] || {}).n || '驅魔', v: 1 } } });
    });
    return o;
  }
  function monPassive(r, D) {
    var out = [];
    String(r.passive || '').split(';').map(function (x) { return x.trim() }).filter(Boolean).forEach(function (id) {
      (D.EFF[id] || []).forEach(function (e) {
        if (e.effect_kind !== 'passive' || !e.effect) return;
        var v = num(e.value);
        if (e.trigger || e.effect === 'apply_status') out.push({ id: id, k: e.effect, v: v, ch: num(e.trigger_chance) || 1, tr: e.trigger, st: e.status_name, turns: e.turns, cond: e.condition, el: e.element, dt: e.dmg_type });
        else if (e.target === 'ally_all' && e.effect === 'lifesteal') return; /* 全隊吸血走靈氣（monAura），自己不重複算 */
        else if (e.effect === 'hit_rate') out.push({ id: id, k: 'hit_rate', v: v });
        else if (e.effect === 'm_taken') out.push({ id: id, k: 'm_taken', v: v });
        else if (e.effect === 'swarm') out.push({ id: id, k: 'swarm', v: v });
        else if (e.effect === 'soul_feast') out.push({ id: id, k: e.effect, v: v, cond: e.condition }); /* 火焰獻祭：隊友倒下化成魂火，自己歸零時吞一顆復活 */
        else if (e.effect === 'acid_blood') out.push({ id: id, k: e.effect, v: v, el: e.element, dt: e.dmg_type, st: e.status_name, turns: e.turns }); /* 異形酸血：被打就對攻擊者濺酸血＋酸蝕 */
        else if (e.effect === 'burn_splash' || e.effect === 'death_boom') out.push({ id: id, k: e.effect, v: v, el: e.element, dt: e.dmg_type }); /* 焚身火焰：單體攻擊濺射其他敵人；烈焰殉爆：倒下時炸全體 */
        else if (e.effect === 'scorch') out.push({ id: id, k: 'scorch', v: v, st: e.status_name, cond: e.condition }); /* 焦土：輪到他行動時燒全體、疊火抗 −5% */ /* 惡魔巢群：隊友單體攻擊時跟著補一下普攻 ×v */ /* 龍鱗：最終受到的魔法傷害 ×(1+v) */ /* 命中率加成（弓術）：算命中時直接加上去 */
        else if (e.effect === 'fall_stack') out.push({ id: id, k: e.effect, v: v, ch: parseFloat(e.trigger_chance) || 0, cond: e.condition }); /* 墮天：每回合開始機率疊一層攻擊加成 */
        else if (['offering', 'enter_summon', 'curse_wave'].indexOf(e.effect) >= 0) out.push({ id: id, k: e.effect, v: v, st: e.status_name, turns: e.turns, cond: e.condition }); /* 教皇：不滅供奉、惡魔化召喚、褻瀆光環 */
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
    var U = P.concat(M), ev = [], rounds = 0, nowAct = null, curOrder = null; /* curOrder：這回合的行動順序（翠嵐順風把主人插回去再動一次） */
    /* 戰棋用的掛勾：counter(d, a) 回傳 false = 反擊打不到；pool = 多段隨機技能挑目標的範圍（陣列）；
       area = 這次是範圍／直線出手（不算單體，不觸發保護）；protector(t, a) = 回傳替 t 擋下單體攻擊的人（雙方都適用），沒有回傳 null */
    var hooks = {};
    P.forEach(function (u, i) { u.i = i }); M.forEach(function (u, i) { u.i = i });
    /* 獨狼：開戰時沒有隊友（一人上陣）→ 生命、物攻、魔攻 ×1.5；隊友中途陣亡不算
       雙人成行：開戰時剛好兩人 → 兩人的生命、物攻、魔攻都 ×1.5（冒險、秘境都適用） */
    if (SPM) P.forEach(function (u) { u.sp = Math.min(SPMAX, 2 + (u.mst && u.mst.sp_start ? u.mst.sp_start.v | 0 : 0)); u.cd = {} }); /* 賢者之石：開場 SP +1 */
    var lone = P.length === 1 && !P[0].lone;
    if (lone) { var L0 = P[0]; L0.lone = true; L0.b.mhp = Math.round(L0.b.mhp * 1.5); L0.b.patk = Math.round(L0.b.patk * 1.5); L0.b.matk = Math.round(L0.b.matk * 1.5) }
    var duo = P.length === 2 && !P[0].lone && !P[1].lone;
    if (duo) P.forEach(function (Q) { Q.lone = true; Q.b.mhp = Math.round(Q.b.mhp * 1.5); Q.b.patk = Math.round(Q.b.patk * 1.5); Q.b.matk = Math.round(Q.b.matk * 1.5) });
    P.forEach(function (u) { if (u.ult) u.ug = 0 }); /* 奧義值：開場 0、滿 100 */
    U.forEach(function (u) { u.hp = u.b.mhp; u.st = []; u.cy = (u.side === 'm' && u.cycle && u.cycle.length) ? Math.floor(Math.random() * u.cycle.length) : 0; /* 怪物從技能循環的隨機一格開始放 */ u.dead = false; u.used = {}; u.flags = {}; u.dragon = RV(D, 'rune18', 0, 0.5, u) });
    P.forEach(function (u) { if (u.special && u.special.some(function (x) { return x.k === 'deep_freeze' })) applyStatus(u, u, '深層凍結', 30, 1, null) }); /* 深層凍結：開戰就掛上（整場） */
    /* 靈氣：同一招只算一次，套到同陣營每個人（自己的已算在基礎值） */
    var auraSeen = {};
    P.forEach(function (src) { src.aura.forEach(function (a) { var key = a.id + '|' + a.k; if (auraSeen[key]) return; auraSeen[key] = src; }) });
    var auraSeenM = {}; M.forEach(function (src) { (src.aura || []).forEach(function (a) { var key = a.id + '|' + a.k; if (!auraSeenM[key]) auraSeenM[key] = src }) });
    function auraVal(u, k) { if (u.side === 'm') { var tm = 0; Object.keys(auraSeenM).forEach(function (key) { var src = auraSeenM[key]; if (src.dead) return; src.aura.forEach(function (a) { if (a.id + '|' + a.k === key && a.k === k) tm += a.v }) }); return tm } if (u.side !== 'p') return 0; var t = 0; Object.keys(auraSeen).forEach(function (key) { var src = auraSeen[key]; if (src === u || src.dead) return; src.aura.forEach(function (a) { if (a.id + '|' + a.k === key && a.k === k) t += a.v }) }); return t }

    /* --- 屬性（基礎 + 狀態 + 靈氣） --- */
    function sv(u, k) { var t = 0; u.st.forEach(function (s) { if (s.paused) return; s.rows.forEach(function (r) { if (r.k === k) t += r.v }) }); return t }
    function has(u, k) { return u.st.some(function (s) { return !s.paused && s.rows.some(function (r) { return r.k === k }) }) }
    /* 條件被動：身上有指定狀態之一時才加（同一招同一項只算一次） */
    function cpV(u, k) { if (!u.cpas || !u.cpas.length) return 0; var t = 0; u.cpas.forEach(function (c) { if (c.k === k && u.st.some(function (s) { return !s.paused && c.sts.indexOf(s.n) >= 0 })) t += c.v }); return t }
    function stat(u, k) {
      var b = u.b;
      switch (k) {
        case 'patk': return (b.patk + apaAdj(u, 'pB') + sv(u, 'atk_flat') /* 星夜掠奪：偷來的攻擊力 */) * (1 + sv(u, 'p_atk_rate') + 0.5 * sv(u, 'str_rate') + (u.hstk ? u.hstk * u.hstkV : 0) /* 苦修 */ + (u.fstk ? u.fstk * u.fstkV : 0) /* 墮天 */ + (u.runes.indexOf('rune18') >= 0 ? u.dragon : 0));
        case 'matk': return (b.matk + apaAdj(u, 'mB') + sv(u, 'atk_flat')) * (1 + sv(u, 'm_atk_rate') + 0.5 * sv(u, 'int_rate') + (u.fstk ? u.fstk * u.fstkV : 0) /* 墮天 */ + (u.runes.indexOf('rune18') >= 0 ? u.dragon : 0));
        case 'pdmg': return b.pdmg + sv(u, 'p_damage_rate') + auraVal(u, 'p_damage_rate');
        case 'mdmg': return b.mdmg + sv(u, 'm_damage_rate') + auraVal(u, 'm_damage_rate');
        case 'pred': if (sv(u, 'zero_red')) return 0; /* 汽化：減傷歸零 */ return b.pred + sv(u, 'p_reduce_rate') + auraVal(u, 'p_reduce_rate') - acidRed(u);
        case 'mred': if (sv(u, 'zero_red')) return 0; return b.mred + sv(u, 'm_reduce_rate') + auraVal(u, 'm_reduce_rate');
        case 'eva': return sv(u, 'no_eva') ? 0 : b.eva + sv(u, 'eva_rate'); /* 妖火：閃避率直接變 0 */
        case 'crit': return b.crit + sv(u, 'crit_rate') + auraVal(u, 'crit_rate') + cpV(u, 'crit_rate');
        case 'cdmg': return b.cdmg + sv(u, 'crit_damage_rate') + cpV(u, 'crit_damage_rate');
        case 'speed': return (b.speed + sv(u, 'speed')) * (1 + sv(u, 'speed_rate'));
        case 'hit': return sv(u, 'hit_rate') + (u.special ? u.special.reduce(function (t, p) { return p.k === 'hit_rate' && !p.tr ? t + p.v : t }, 0) : 0);
      }
      return 0;
    }
    /* 酸蝕：可疊層的狀態，每層物理減傷 −v（不管誰上的都疊在同一個狀態上，最多 ACIDMAX 層） */
    var ACIDMAX = 3;
    function acidRed(u) { var t = 0; u.st.forEach(function (s) { if (!s.paused && s.stk) s.rows.forEach(function (r) { if (r.k === 'acid') t += r.v * s.stk }) }); return t }
    /* 觀眾熱情：開戰時已照隊友人數算進攻擊力；隊友倒下（或復活）時即時調整 */
    function apaAdj(u, k) { if (!u.apa) return 0; var n = Math.min(3, P.filter(function (x) { return x !== u && !x.dead }).length); return u[k] * u.apa * (n - u.apaN) }
    function resOf(u, el) { if (!el) return u.b.res.none || 0; /* 無屬性：只有怪物有隱藏的無屬性抗性（monster_info 的 none_res_rate），玩家為 0；真實傷害不經過這裡 */ var r = (u.b.res[el] || 0) + sv(u, el + '_res_rate') + auraVal(u, el + '_res_rate'); u.st.forEach(function (s) { if (s.randEl === el) r += s.randV; if (el === 'fire') s.rows.forEach(function (q) { if (q.k === 'scorch') r -= q.v * (u.scorch || 1) }) /* 焦土：每層火抗 −v */ }); return r }

    /* --- 戰報 --- */
    function line(o) { ev.push(o); NC = null; return o }
    /* 跳字：每一行戰報帶 nums = [{s 陣營, i 編號, v 數值, k 種類, el 屬性, dt 物理/魔法, c 暴擊, w 弱點1/抗性-1, h 第幾下, ls 吸血}]
       k：d 傷害、t 真實傷害、h 恢復、shd 護盾吸收、miss 閃避、block 格擋、void 無效、sp SP 增減。NC = 目前這一下的屬性等資訊（每行開頭清空，沒設就算真實傷害） */
    var NC = null;
    function numAdd(u, v, k, o) { var e = ev[ev.length - 1]; if (!e || !u) return; var n = { s: u.side, i: u.i, v: Math.round(v || 0), k: k }; if (o) Object.keys(o).forEach(function (q) { if (o[q] != null && o[q] !== '' && o[q] !== false) n[q] = o[q] }); (e.nums = e.nums || []).push(n) }
    function numHit(d, amt, left) { var c = NC || {}, el = c.el || '', w = 0; if (el) { var r = resOf(d, el); w = r < 0 ? 1 : r >= 0.5 ? -1 : 0 }
      if (amt - left > 0) numAdd(d, amt - left, 'shd', { h: c.h });
      if (left > 0 || amt <= 0) numAdd(d, left, c.tr || !NC ? 't' : 'd', { el: el, dt: c.dt, c: c.c, w: w, h: c.h, bx: NC && !c.tr && banishedOnly(d) ? 1 : 0 }) }
    /* 血量快照，順便記每個人身上生效中的狀態名稱（sp／sm；元素詛咒記成「名稱|屬性」），畫面用來顯示狀態特效 */
    function stNames(u) { return u.dead ? [] : u.st.filter(function (s) { return !s.paused }).map(function (s) { return s.randEl ? s.n + '|' + s.randEl : s.n }) }
    function hpSnap() { P.forEach(mhpSync); return { pm: P.map(function (u) { return u.b.mhp }), ob: P.map(function (u) { var o = obsOf(u); return o ? o.obs : null }), p: P.map(function (u) { return Math.max(0, Math.round(u.hp)) }), m: M.map(function (u) { return Math.max(0, Math.round(u.hp)) }), mm: M.map(function (u) { return u.b.mhp }), sp: P.map(stNames), sm: M.map(stNames), pp: SPM ? P.map(function (u) { return u.sp | 0 }) : null, hbp: P.map(hbN), hbm: M.map(hbN), ug: P.map(function (u) { return u.ult ? u.ug | 0 : -1 }) } }
    function hbN(u) { return u.dead ? 0 : u.st.reduce(function (a, s) { return a + (!s.paused && s.hb > 0 ? s.hb : 0) }, 0) } /* 聖堂守勢剩幾面盾（畫面用） */
    function addStat(e, u, kind, v, sk) { if (u.side !== 'p' || !v) return; (e.st = e.st || []).push([u.i, kind, Math.round(v), sk]) }

    /* --- 狀態 --- */
    function applyStatus(src, tgt, name, turns, chance, e, skName, sure) {
      var def = D.STS[name]; if (!def || tgt.dead) return false;
      /* 吞噬：只吞玩家；一隻怪肚子裡同時只能有一個人；已經在肚子裡的人什麼狀態都上不了 */
      var swl = def.rows.some(function (r) { return r.k === 'swallow' });
      if (swallowed(tgt)) return false;
      if (s0bn(tgt, def)) return false; /* 放逐中上不了新狀態 */
      if (banished(tgt) && def.rows.some(function (r) { return r.k === 'banish' })) return false; /* 已經在裂隙裡：不能再放逐一次（避免重放刷新回合、一直關住） */
      if (swl && (tgt.side !== 'p' || P.some(function (x) { return !x.dead && x.st.some(function (q) { return q.swal && q.src === src }) }))) return false;
      var ctl = def.rows.some(function (r) { return CONTROL[r.k] }), nob = def.rows.some(function (r) { return NOBOSS[r.k] });
      if (tgt.boss && nob) return false;
      /* 秘術護罩（debuff_block）：持續期間擋下敵人施加的新負面狀態 */
      if (def.pol === 'debuff' && src && src.side !== tgt.side && tgt.st.some(function (x) { return !x.paused && x.rows.some(function (r) { return r.k === 'debuff_block' }) })) { if (e) e.txt += '，' + tgt.name + ' 的護罩抵擋了「' + name + '」'; return false }
      if (def.pol === 'debuff' && src && src.side !== tgt.side && def.rows.some(function (r) { return CCB[r.k] }) && tgt.st.some(function (x) { return !x.paused && x.rows.some(function (r) { return r.k === 'cc_block' }) })) { if (e) e.txt += '，' + tgt.name + ' 的「' + (tgt.st.filter(function (x) { return x.rows.some(function (r) { return r.k === 'cc_block' }) })[0] || {}).n + '」免疫了「' + name + '」'; return false } /* 無畏：免疫控制（整個狀態都擋，例如骨牢） */
      var ch = chance == null || chance === '' ? 1 : num(chance);
      if (src && src.mst && src.mst.debuff_chance && def.pol === 'debuff' && src.side !== tgt.side) ch = Math.min(1, ch + src.mst.debuff_chance.v); /* 咒術精通 */
      if (!sure) { if (tgt.boss && ctl) ch /= 2; if (RND() >= ch) return false } /* sure：深層凍結（必定凍結；護罩、免疫、黑曜七星照擋） */
      /* 黑曜七星：敵人施加的負面狀態消耗一顆星抵銷 */
      if (def.pol === 'debuff' && src && src.side !== tgt.side) { var ob9 = obsOf(tgt); if (ob9) { obsUse(tgt, ob9); if (e) e.txt += '，' + tgt.name + ' 的「' + ob9.n + '」抵銷了「' + name + '」'; return false } }
      var t = turns === 'attack' ? 'attack' : (parseInt(turns, 10) || 1);
      if (tgt.boss && def.rows.some(function (r) { return r.k === 'banish' }) && t !== 'attack') t = Math.min(t, 1);
      if (def.rows.some(function (r) { return r.k === 'acid' })) { var ac = tgt.st.filter(function (q) { return q.n === name })[0]; if (ac) { ac.stk = Math.min(ACIDMAX, (ac.stk || 1) + 1); if (typeof t === 'number') ac.turns = Math.max(ac.turns, t); if (e) { e._st = e._st || {}; (e._st[name + ' ' + ac.stk + ' 層'] = e._st[name + ' ' + ac.stk + ' 層'] || []).push(tgt.name) } return true } } /* 已經有酸蝕：疊一層、刷新回合 */
      var old = null; if (!def.rows.some(function (r) { return r.k === 'each' })) tgt.st.forEach(function (s) { if (s.n === name && s.src === src) old = s }); /* each：每層各自計時（風勢），每次都多一個 */
      var rows = def.rows.filter(function (r) { return !(r.base === 'not_boss' && tgt.boss) /* 縛風：王不吃命中下降 */ }).map(function (r) {
        var o = { k: r.k, v: r.v, el: r.el, dt: r.dt };
        if (r.k === 'dot' || r.k === 'hot' || r.k === 'banish') o.amt = r.base === 'mhp' ? r.v * tgt.b.mhp /* 幻獸木靈守護：照持有者最大生命 */ : r.v * (r.base === 'p_atk' ? stat(src, 'patk') : stat(src, 'matk'));
        if (r.k === 'shield') o.amt = r.base === 'hi_atk' ? r.v * Math.max(stat(src, 'patk'), stat(src, 'matk')) /* 幻獸：主人物攻、魔攻較高者 */ : r.base === 'm_atk' ? r.v * stat(src, 'matk') : r.base === 'p_atk' ? r.v * stat(src, 'patk') : r.base === 'mhp' ? r.v * tgt.b.mhp /* 振奮護盾：持有者最大生命 */ : r.v;
        return o;
      });
      var s = { n: name, src: src, turns: t, rows: rows, pol: def.pol, fresh: tgt === nowAct }; if (rows.some(function (r) { return r.k === 'acid' })) s.stk = 1;
      rows.forEach(function (r) { if (r.k === 'lamb') s.lamb = true; if (r.k === 'deathcurse') s.dcurse = true; if (r.k === 'airborne') { s.air = true; var dvL = targetable(tgt.side === 'p' ? M.filter(function (x) { return !x.dead }) : P.filter(function (x) { return !x.dead }), D.SK.atk); tgt.dive = { t: dvL.length ? pickOne(dvL) : null, sk: 'skill' + (r.v | 0) } } /* 高空（獅鷲鷹揚）：施放當下就選好俯衝目標 */ if (r.k === 'hit_block') s.hb = r.v | 0; /* 聖堂守勢：可擋幾次傷害 */ if (r.k === 'shield') s.shield = r.amt; if (r.k === 'rand_res_rate') { s.randEl = pickOne(ELS); s.randV = r.v } });
      if (old) { var i = tgt.st.indexOf(old); tgt.st[i] = s } else tgt.st.push(s);
      if (rows.some(function (r) { return r.k === 'obsidian' })) s.obs = 7; /* 黑曜七星：再次施放補滿七顆 */
      if (rows.some(function (r) { return r.k === 'mhp_rate' })) mhpSync(tgt);
      if (rows.some(function (r) { return r.k === 'banish' })) { s.banish = true; tgt.st.forEach(function (x) { if (x !== s) x.paused = true }) }
      if (swl) { s.swal = true; tgt.st.forEach(function (x) { if (x !== s) x.paused = true }); if (e) (e.swal = e.swal || []).push(tgt.i) }
      if (e) { e._st = e._st || {}; (e._st[name] = e._st[name] || []).push(tgt.name) }
      return true;
    }
    function removeStatus(u, s) { var i = u.st.indexOf(s); if (i >= 0) u.st.splice(i, 1); if (s.rows.some(function (r) { return r.k === 'mhp_rate' })) mhpSync(u) }
    /* 黑曜七星：還有星星的那個狀態；用掉一顆，用完就消失 */
    function obsOf(u) { return u.st.filter(function (s) { return !s.paused && s.obs > 0 })[0] || null }
    function obsUse(u, s) { s.obs--; if (s.obs <= 0) removeStatus(u, s) }
    /* 生命上限加成（日冕祝福）：照狀態增減最大生命，加的時候生命一起加，拿掉時生命不超過上限 */
    function mhpSync(u) {
      var r = u.dead ? 0 : sv(u, 'mhp_rate'); if (!r && !u._mhpA) return;
      if (u._mhp0 == null) u._mhp0 = u.b.mhp - (u._mhpA || 0);
      var want = Math.round(u._mhp0 * r), d = want - (u._mhpA || 0); if (!d) return;
      u.b.mhp += d; u._mhpA = want; if (d > 0 && !u.dead) u.hp += d; else u.hp = Math.min(u.hp, u.b.mhp);
      if (!want) delete u._mhp0;
    }
    function debuffs(u) { return u.st.filter(function (s) { return s.pol === 'debuff' && !s.paused }) }
    function hasHot(u) { return u.st.some(function (s) { return s.rows.some(function (r) { return r.k === 'hot' }) }) }
    function banished(u) { return u.st.some(function (s) { return s.banish || s.swal || s.air }) }
    function airborne(u) { return u.st.some(function (s) { return s.air && !s.paused }) } /* 高空：任何攻擊、技能都打不到 */
    function swallowed(u) { return u.st.some(function (s) { return s.swal }) }
    function ctrl(u, k) { return u.st.some(function (s) { return !s.paused && s.rows.some(function (r) { return r.k === k }) }) }

    /* --- 陣營與選目標 --- */
    function foes(u) { var a = u.side === 'p' ? M : P; return a.filter(function (x) { return !x.dead }) }
    function friends(u) { var a = u.side === 'p' ? P : M; return a.filter(function (x) { return !x.dead }) }
    /* 放逐（不含吞噬）：還是能被打，但只有魔法傷害有效、而且 ×2；純物理招式選目標時盡量避開 */
    function s0bn(t, def) { return banishedOnly(t) && !def.rows.some(function (r) { return r.k === 'banish' }) }
    function banishedOnly(u) { return u.st.some(function (s) { return s.banish }) }
    function hasMag(sk) { return !!(sk && sk.parts && sk.parts.some(function (x) { return x.d === 'm' })) }
    function targetable(list, sk) { list = list.filter(function (x) { return !airborne(x) }); var mg = hasMag(sk), ok = list.filter(function (x) { return !swallowed(x) && !(banishedOnly(x) && !mg) }); return ok.length ? ok : list.filter(function (x) { return !swallowed(x) }).length ? list.filter(function (x) { return !swallowed(x) }) : list }
    function pickTargets(u, sk, charmed, confused) {
      var t = sk.t, F = charmed ? friends(u) : foes(u), A = charmed ? foes(u) : friends(u);
      if (charmed) F = F.filter(function (x) { return x !== u });
      var stn = ((D.EFF[sk.id] || []).filter(function (e) { return e.effect_kind === 'status' })[0] || {}).status_name;
      if (confused && t !== 'self') { var all = U.filter(function (x) { return !x.dead && x !== u }); if (!all.length) return []; return t === 'enemy_all' || t === 'ally_all' || t === 'ally_others' ? all : [pickOne(all)] }
      if (t === 'self') return [u];
      if (t === 'enemy_all') return targetable(F, { parts: [{ d: 'm' }] }); /* 全體招式照樣打到放逐中的（物理部分會顯示無效） */
      if (t === 'ally_all') return A;
      if (t === 'ally_others') return A.filter(function (x) { return x !== u });
      if (t === 'ally_single') return A.length ? [choose(A, sk.p, stn)] : [];
      if (t === 'ally_dead') { var DD = (u.side === 'p' ? P : M).filter(function (x) { return x.dead && !x.summoned }); return DD.length ? [pickOne(DD)] : [] } /* 復生術：陣亡的隊友 */
      if (t === 'ally_other_single') { var A2 = A.filter(function (x) { return x !== u && !x.dead }); return A2.length ? [choose(A2, sk.p, stn)] : [] } /* 自己以外的一名同伴（牧羊權柄） */
      if (t === 'enemy_single') {
        var c = targetable(F, sk); if (!c.length) return [];
        var tn = c.filter(function (x) { return has(x, 'taunt') }); if (tn.length && !charmed) c = tn;
        return [choose(c, sk.p, stn)];
      }
      return [];
    }
    function choose(list, pick, stn) {
      if (pick === 'boss_high') { var bl = list.filter(function (x) { return x.boss }); return (bl.length ? bl : list).reduce(function (b, x) { return x.hp > b.hp ? x : b }) } /* 王獵閃光：優先打王，沒有王打血最多的 */
      if (pick === 'lowest_hp') return list.reduce(function (b, x) { return x.hp / x.b.mhp < b.hp / b.b.mhp ? x : b }, list[0]);
      if (pick === 'prefer_without_status' && stn) { var w = list.filter(function (x) { return !x.st.some(function (s) { return s.n === stn }) }); if (w.length) return pickOne(w) }
      if (pick === 'prefer_with_debuff') { var d = list.filter(function (x) { return debuffs(x).length }); if (d.length) return pickOne(d) }
      return pickOne(list);
    }

    /* --- 傷害 --- */
    function dmgOnce(a, d, parts, sk, o) {
      /* o: {mult, extraCrit, sure, noReact} → {miss, crit, amt, blocked, absorbed, txt} */
      o = o || {};
      if (swallowed(d)) return { amt: 0, void: true };
      if (banishedOnly(d)) { parts = parts.filter(function (x) { return x.d === 'm' }); if (!parts.length) return { amt: 0, void: true }; o = Object.assign({}, o, { mult: (o.mult || 1) * 2, noReact: true }) } /* 放逐中：物理無效、魔法 ×2、不會反應 */
      var isP = parts.some(function (x) { return x.d === 'p' }), isM = parts.some(function (x) { return x.d === 'm' });
      var r = { miss: false, crit: false, amt: 0 };
      if (!o.sure && !sk.sure) { var hc = 1 - stat(d, 'eva') + stat(a, 'hit') + sv(d, 'hit_taken_rate') + (a.boss && a.side === 'm' ? 0.2 : 0) /* 首領的命中 +20 個百分點（壓制高閃避） */ + (o.hitAdd || 0) /* 獵物標記 */; if (RND() >= clamp(hc, 0.05, 1)) { r.miss = true; return r } }
      /* 反應技（受擊前） */
      var re = o.noReact ? null : react(d, a, isP, isM, parts);
      if (re && re.block) { r.blocked = true; r.re = re; return r }
      var cr = stat(a, 'crit') + (sk.cr || 0) + (o.extraCrit || 0) + sv(d, 'crit_taken_rate');
      var sureCrit = o.sureCrit || has(a, 'sure_crit_next');
      r.crit = sureCrit || RND() < cr;
      var cm = r.crit ? 1 + stat(a, 'cdmg') + (sk.cd || 0) : 1, tot = 0, byEl = {};
      parts.forEach(function (x) {
        var atk = x.d === 'm' ? stat(a, 'matk') : stat(a, 'patk'), inc = x.d === 'm' ? stat(a, 'mdmg') : stat(a, 'pdmg'), red = x.d === 'm' ? stat(d, 'mred') : stat(d, 'pred');
        if (o.redPierce && red > 0) red = Math.max(0, red - o.redPierce); /* 無視減傷（爆炎轟 20%、裂空俯衝全部）：只扣掉正的減傷 */
        var rs0 = resOf(d, x.e); if (x.e === 'wind') rs0 = windIgn(a, d, rs0); if (o.resIgnore && rs0 > 0) rs0 = 0; /* 無視屬性抗性（爆炎轟）：正的抗性當作 0 */
        var v = atk * x.r * (1 + inc) * (1 + sv(a, 'next_dmg')) /* 晶角共鳴：下一次傷害 ×1.5 */ * (1 - Math.min(red, 0.9)) * (1 - Math.min(rs0 - (x.e ? (o.resPierce || 0) : 0), rs0 >= 1 ? 1 : 0.9)) /* 抗性 100%（褻瀆之光的暗）= 完全免疫 */ * (1 + sv(d, 'dmg_taken_rate') + sv(d, x.d === 'm' ? 'm_dmg_taken_rate' : 'p_dmg_taken_rate')) * cm * (o.mult || 1) * (x.d === 'm' && d.special ? d.special.reduce(function (t9, p9) { return p9.k === 'm_taken' ? t9 * (1 + p9.v) : t9 }, 1) : 1) /* 龍鱗 */ * (0.95 + RND() * 0.1) * (a._ebst && x.e && a._ebst[x.e] ? 1 + a._ebst[x.e] : 1) /* 精靈共鳴：該屬性 +40% */;
        if (re && re.reduce) v *= 1 - re.reduce;
        byEl[x.e] = (byEl[x.e] || 0) + v; tot += v;
      });
      if (re && re.absorb) { var ab = 0; re.absorb.forEach(function (el) { ab += byEl[el] || 0 }); if (ab > 0) { tot -= ab; r.absorbed = Math.round(ab); heal(d, d, ab, null, true) } }
      r.amt = Math.max(tot > 0 ? 1 : 0, Math.round(tot)); r.re = re;
      return r;
    }
    /* 風勢：每層無視風抗 v，只抵銷「原本的」風抗（最低到 0）；負面狀態的減抗（縛風）另外再扣 */
    function windIgn(a, d, rs) { var wi = sv(a, 'wind_ign'); if (!(wi > 0)) return rs; var neg = 0; d.st.forEach(function (s) { if (!s.paused && s.pol === 'debuff') s.rows.forEach(function (r) { if (r.k === 'wind_res_rate' && r.v < 0) neg += r.v }) }); var base = rs - neg; if (base > 0) base = Math.max(0, base - wi); return base + neg }
    function windN(u) { return u.st.filter(function (s) { return s.n === '風勢' && !s.paused }).length }
    /* 獵物標記：t 身上由 u 標記的（每個獵人各算各的），回傳增傷值 */
    function preyV(t, u) { var s = t.st.filter(function (q) { return !q.paused && q.src === u && q.rows.some(function (r) { return r.k === 'prey' }) })[0]; return s ? (s.rows.filter(function (r) { return r.k === 'prey' })[0].v || 0.15) : 0 }
    /* 奧義值 */
    function ugAdd(u, v) { if (!u || !u.ult || u.dead || !(v > 0)) return; u.ug = Math.min(100, (u.ug | 0) + v) }
    /* 逐風追獵者：一次出手結束後結算（整招打完才上標記；爆擊只疊一層風勢；追獵本能追加一箭） */
    function huntPost(u, hit, pre, crit, e) {
      if (u.side !== 'p' || !u.special || u.dead) return; var uq = function (L) { return L.filter(function (x, i) { return L.indexOf(x) === i }) }; hit = uq(hit);
      var ch = u.mst && u.mst.chase_arrow, c = uq(pre).filter(function (t) { return !t.dead && t.hp > 0 && hit.indexOf(t) >= 0 });
      if (ch && c.length && RND() < ch.ch) { var t = pickOne(c), pv = preyV(t, u), x = dmgOnce(u, t, [{ d: 'p', e: 'wind', r: ch.v || 0.5 }], { cr: 0, cd: 0 }, { noReact: true, mult: 1 + pv, hitAdd: pv ? 0.1 : 0 });
        (e.chase = e.chase || []).push([t.side, t.i]);
        if (x.miss) { numAdd(t, 0, 'miss', { h: 90 }); (e._x = e._x || []).push('「' + ch.n + '」追加的風箭被閃開') }
        else if (x.amt) { NC = { el: 'wind', dt: 'p', c: x.crit, h: 90 }; var rl = hurt(t, x.amt, u); if (x.crit) crit = true; (e._x = e._x || []).push('「' + ch.n + '」追加風箭 → ' + t.name + (x.crit ? ' 暴擊！' : ' ') + rl); addStat(e, u, 'dmg', rl, ch.n); addStat(e, t, 'taken', rl, u.name + ' ' + ch.n); checkDeath(t, e) } }
      if (u.special.some(function (s) { return s.k === 'prey_mark' })) hit.forEach(function (t) { if (!t.dead && t.hp > 0 && t.side !== u.side) applyStatus(u, t, '獵物標記', 2, 1, null) });
      if (crit && u.special.some(function (s) { return s.k === 'crit_wind' }) && applyStatus(u, u, '風勢', 4, 1, null)) { (e._x = e._x || []).push('「順風獵殺」風勢 ' + windN(u) + ' 層'); e.cwind = 1 }
    }
    /* 職業精通（冠軍勇士）：每次受到傷害（含自己消耗生命）有機率獲得狀態 */
    function onHurt(d) { mstHurt(d); dfzCheck(d) }
    /* 深層凍結：生命掉到 50% 以下（被打倒也算）→ 解除、全體敵人必定凍結 2 回合（王 1 回合） */
    function dfzCheck(d) { var s = d.st.filter(function (q) { return q.n === '深層凍結' && !q.paused })[0]; if (!s || d.hp >= d.b.mhp * 0.5) return; removeStatus(d, s); var he = ev[ev.length - 1], fz = [];
      foes(d).forEach(function (f) { if (f.dead || banished(f)) return; if (applyStatus(d, f, '凍結', f.boss ? 1 : 2, 1, null, null, true)) fz.push(f.name) });
      if (he) { (he._x = he._x || []).push(d.name + ' 的「深層凍結」爆發' + (fz.length ? '，' + fz.join('、') + ' 被凍結' : '')); (he.dfz = he.dfz || []).push([d.side, d.i]) } }
    function mstHurt(d) { var m = d.mst && d.mst.status_on_hurt; if (!m || !m.st || d.dead || d.hp <= 0 || RND() >= m.ch) return; if (applyStatus(d, d, m.st, m.turns, 1, null)) { var he = ev[ev.length - 1]; if (he) (he._x = he._x || []).push(d.name + ' 的「' + m.n + '」：獲得「' + m.st + '」') } }
    function hurt(d, amt, src, dot) {
      /* 扣血（先扣護盾）；回傳實際扣掉的生命與是否倒下 */
      /* 不滅供奉：自己以外還有同伴活著時，不受持續傷害、最少留 1 滴血 */
      var undy = d.special && d.special.some(function (x) { return x.k === 'offering' }) /* 不滅供奉（不要跟骨兵的 undying 搞混） */ && (d.side === 'm' ? M : P).some(function (x) { return x !== d && !x.dead });
      if (undy && dot) return 0;
      /* 牧羊權柄：被指定為羔羊的同伴替施放者扛一半傷害 */
      if (amt > 1 && !dot) { var lamb = (d.side === 'm' ? M : P).filter(function (x) { return x !== d && !x.dead && x.st.some(function (q) { return q.lamb && q.src === d }) })[0];
        if (lamb) { var half = Math.floor(amt / 2); amt -= half; var lt = hurt(lamb, half, src, true); var le = ev[ev.length - 1]; if (le) { (le.lamb = le.lamb || []).push([d.i, lamb.i]); if (lt) (le._x = le._x || []).push(lamb.name + ' 替 ' + d.name + ' 承受 ' + lt + ' 傷害') } if (lamb.hp <= 0 && !lamb.dead) checkDeath(lamb, le) } }
      if (undy && amt >= d.hp) { amt = Math.max(0, Math.ceil(d.hp) - 1); var ue = ev[ev.length - 1]; if (ue && !ue._undy) { ue._undy = 1; (ue._x = ue._x || []).push(d.name + ' 的「不滅供奉」護住了最後一口氣') } }
      if (NC && NC.el === 'fire' && amt > 0) { var ftk = 0; d.st.forEach(function (s9) { if (!s9.paused) s9.rows.forEach(function (r9) { if (r9.k === 'fire_taken') ftk = Math.max(ftk, r9.v) }) }); /* 被兩隻狗各毒一次也只算一次 */ if (ftk) amt = Math.round(amt * (1 + ftk)) } /* 硫磺毒：受到的火焰傷害 ×(1+v)（技能、持續傷害、焦土、殉爆……只要是火焰都算） */
      var left = amt; if (src && amt > 0 && src !== d) d._lh = src; /* 記下最後打到牠的人（擊殺 +1 SP） */
      var shg = 0; d.st.forEach(function (s) { if (left > 0 && s.shield > 0) { var x = Math.min(s.shield, left); s.shield -= x; left -= x; s.rows.forEach(function (r) { if (r.k === 'shield_heal') shg += x * (r.v || 0) }) } }); /* 血羽庇護：擋下的傷害一部分轉成回血 */
      d.st = d.st.filter(function (s) { return !(s.rows.some(function (r) { return r.k === 'shield' }) && s.shield <= 0 && !s.rows.some(function (r) { return r.k === 'debuff_block' })) }); /* 秘術護罩：盾破了也留著，繼續抵擋負面狀態到回合結束 */
      /* 幻獸：狐化身（致命傷害擋一次）、不屈聖護（生命最低剩 1） */
      if (left > 0 && left >= d.hp && d.hp > 0 && !d.dead) {
        var lb = d.st.filter(function (s) { return !s.paused && s.rows.some(function (r) { return r.k === 'lethal_block' }) })[0], le2 = ev[ev.length - 1];
        if (lb) { removeStatus(d, lb); if (le2) { (le2._x = le2._x || []).push('「' + lb.n + '」替 ' + d.name + ' 擋下了致命一擊'); (le2.lblk = le2.lblk || []).push([d.side, d.i]) } numAdd(d, 0, 'block', { h: NC && NC.h }); return 0 }
        if (has(d, 'min_hp1')) { left = Math.max(0, Math.ceil(d.hp) - 1); if (le2 && !le2._mh1) { le2._mh1 = 1; (le2._x = le2._x || []).push(d.name + ' 的「' + (d.st.filter(function (s) { return s.rows.some(function (r) { return r.k === 'min_hp1' }) })[0] || {}).n + '」撐住了最後一口氣') } }
      }
      d.hp -= left; numHit(d, amt, left);
      if (left > 0 && !dot && d.ult && src && src !== d && src.side !== d.side) { var pc = left / Math.max(1, d.b.mhp); ugAdd(d, pc >= 0.4 ? 30 : pc >= 0.25 ? 20 : pc >= 0.1 ? 10 : 5) } /* 奧義值：被敵人攻擊，照這一下扣的生命比例 */
      if (left > 0) onHurt(d);
      if (left > 0) {
        /* 妖槲寄生：身上有寄生的目標每次受傷，施放者（幻獸）的主人回復該傷害的一定比例 */
        d.st.forEach(function (s) { if (s.paused || !s.src) return; s.rows.forEach(function (r) { if (r.k !== 'leech') return; var o9 = s.src.owner || s.src; if (o9 && !o9.dead && o9 !== d) { var NC9 = NC; NC = { ls: 1 }; heal(o9, o9, left * r.v, null, true); NC = NC9 } }) });
        /* 冥府命泉：同伴失去生命時，失去量的一定比例補到持有者身上 */
        (d.side === 'p' ? P : M).forEach(function (x) { if (x === d || x.dead) return; var v9 = sv(x, 'share_pain'); if (v9 > 0) { var NC8 = NC; NC = null; heal(x, x, left * v9, null, true); NC = NC8 } });
      }
      if (shg > 0 && d.hp > 0) { var sg = heal(d, d, shg, null, true); var se = ev[ev.length - 1]; if (sg && se) { (se._x = se._x || []).push(d.name + ' 的「血羽庇護」轉化恢復 ' + sg); (se.bfh = se.bfh || []).push([d.side, d.i]) } }
      if (left > 0 && !dot) d.st = d.st.filter(function (s) { return !s.rows.some(function (r) { return r.k === 'sleep' }) });
      return left;
    }
    /* 算出來的治療數字（含目標的受治療加成、禁療，但不扣「已滿血」）：鹿之守護、月之淨化用這個，溢出也算 */
    function healCalc(t, amt) { if (t.dead || banished(t)) return 0; return Math.max(0, Math.round(amt * (1 + sv(t, 'heal_taken_rate')))) }
    function heal(src, t, amt, e, raw) {
      if (t.dead || banished(t)) return 0;
      var v = raw ? amt : amt * (1 + sv(t, 'heal_taken_rate'));
      var real = Math.max(0, Math.min(Math.round(v), t.b.mhp - Math.round(t.hp)));
      t.hp += real; if (real > 0) numAdd(t, real, 'h', { ls: NC && NC.ls, h: NC && NC.h }); if (real > 0 && src !== t && t.hp >= t.b.mhp * 0.8 && t.st.some(function (s) { return s.dcurse })) t.st = t.st.filter(function (s) { return !s.dcurse }); /* 死之詛咒：被別人補血、補到 80% 以上才解除（自己身上的回復被動不算） */ return real;
    }
    /* 技能使用條件（skill_effect 的 use_if）：hp_below = 生命比例低於 value 才能用、hp_above = 高於 value 才能用、not_full = 場上活著的怪少於 value 隻才能用（呼喚同伴滿了改普攻） */
    function useOk(u, id) { return (D.EFF[id] || []).every(function (r) { if (r.effect_kind !== 'use_if') return true; var v = num(r.value), h = u.hp / Math.max(1, u.b.mhp); return r.effect === 'has_other' ? friends(u).some(function (x) { return x !== u && !x.dead }) : r.effect === 'lacks_status' ? !u.st.some(function (q) { return q.n === r.status_name }) /* 身上已經有這個狀態就不放（自燃） */ : r.effect === 'hp_below' ? h < v : r.effect === 'hp_above' ? h > v : r.effect === 'not_full' ? M.filter(function (m) { return !m.dead }).length < (v || 5) : r.effect === 'ally_below' ? (u.side === 'm' ? M : P).some(function (m) { return !m.dead && m.hp / Math.max(1, m.b.mhp) < v }) /* 有同伴（含自己）生命低於 v 才放（天使史萊姆的群體治療） */ : true }) }
    function morph(u, mid) { morphUnit(u, mid, D); if (u.cycle && u.cycle.length) u.cy = Math.floor(RND() * u.cycle.length) /* 重生後從隨機一招開始 */ }
    /* 永冬誓言（被動 summon_hp）：生命第一次掉到 value 比例以下時，召喚 condition 那隻怪上場（每場一次） */
    /* 叫一隻怪上場（跟召喚者同樣的生命／攻擊倍率），回傳新的怪 */
    function spawnMon(u, mid) {
      var nu = monster(D.mon[mid], u.stg || 1, D); nu.b.mhp = Math.round(nu.b.mhp * (u.hs || 1)); nu.stg = u.stg; nu.hs = u.hs; if (u.as) { nu.b.patk = Math.round(nu.b.patk * u.as); nu.b.matk = Math.round(nu.b.matk * u.as); nu.as = u.as }
      var same = M.filter(function (m) { return m.mid === mid }).length; nu.name += ' ' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.min(25, same)];
      nu.i = M.length; nu.hp = nu.b.mhp; nu.st = []; nu.cy = Math.floor(RND() * nu.cycle.length); nu.dead = false; nu.used = {}; nu.flags = {}; nu.dragon = 0; nu.summoned = true; M.push(nu); U.push(nu);
      (nu.aura || []).forEach(function (a) { var key = a.id + '|' + a.k; if (!auraSeenM[key]) auraSeenM[key] = nu }); return nu;
    }
    function summonHp(u, e) {
      /* 殘存神性（被動 low_heal）：生命第一次掉到 condition 比例以下時，立刻恢復最大生命的 value（每場一次） */
      if (!u.dead && u.special && !u.flags.lowh) { var lh = u.special.filter(function (x) { return x.k === 'low_heal' })[0]; if (lh && u.hp / Math.max(1, u.b.mhp) < (num(lh.cond) || 0.3)) { u.flags.lowh = 1; var amt0 = Math.round(u.b.mhp * lh.v), got0 = Math.min(amt0, u.b.mhp - u.hp); u.hp += got0; var ll = line({ side: u.side, a: u.i, idle: 1, txt: u.name + ' 的「' + (D.SK[lh.id] ? D.SK[lh.id].n : '殘存神性') + '」發動，恢復 ' + got0 }); ll.hp = hpSnap(); ll.lowh = 1 } }
      if (u.side !== 'm' || u.flags.sumhp || !u.special) return; var sp = u.special.filter(function (x) { return x.k === 'summon_hp' && D.mon[x.cond] })[0]; if (!sp || u.hp / Math.max(1, u.b.mhp) >= sp.v) return;
      u.flags.sumhp = 1; var nu = monster(D.mon[sp.cond], u.stg || 1, D); nu.b.mhp = Math.round(nu.b.mhp * (u.hs || 1)); nu.stg = u.stg; nu.hs = u.hs; if (u.as) { nu.b.patk = Math.round(nu.b.patk * u.as); nu.b.matk = Math.round(nu.b.matk * u.as); nu.as = u.as }
      nu.i = M.length; nu.hp = nu.b.mhp; nu.st = []; nu.cy = Math.floor(RND() * nu.cycle.length); nu.dead = false; nu.used = {}; nu.flags = {}; nu.dragon = 0; nu.summoned = true; M.push(nu); U.push(nu);
      (nu.aura || []).forEach(function (a) { var key = a.id + '|' + a.k; if (!auraSeenM[key]) auraSeenM[key] = nu });
      var sl = line({ side: 'm', a: u.i, idle: 1, summon: [nu.i], sumFx: 'frostgate', txt: u.name + ' 的「' + (D.SK[sp.id] ? D.SK[sp.id].n : '召喚') + '」：' + nu.name + ' 降臨戰場！' }); sl.hp = hpSnap();
    }
    function checkDeath(u, e) {
      if (!u.dead && u.hp > 0) summonHp(u, e);
      if (u.dead || u.hp > 0) return false;
      u.hp = 0;
      if (swallowed(u)) { u.flags.r17 = 99; u.flags.grace = 1 } /* 在肚子裡被消化完：不能復活 */
      /* 不死（骨兵）：倒下就散成骨堆，無限次；骨堆倒數（死掉那回合不算）結束後滿血變回骨兵，見 round() */
      var und = u.side === 'm' ? (u.special || []).filter(function (x) { return x.k === 'undying' && D.mon[x.cond] })[0] : null;
      if (und) {
        if (e) (e.hz = e.hz || []).push(u.i); /* 打倒牠的那一招：血條先歸零 */ var back = u.mid, old0 = u.name; morph(u, und.cond); u.undead = { back: back, n: num(und.v) || 3, born: rounds };
        var tb = line({ side: 'm', a: u.i, txt: old0 + ' 散成一堆白骨……（' + u.undead.n + ' 回合後重生）', tf: [u.i, u.sprite, u.name, 'bone'], cd: [u.i, u.undead.n] }); tb.hp = hpSnap();
        return false;
      }
      /* 變身（冥屍龍的亡骸化）：倒下時化為另一隻怪復活一次，生命全滿、狀態清空，召喚出來的同伴留著 */
      var tfx = u.side === 'm' && !u.flags.tf ? (u.special || []).filter(function (x) { return x.k === 'transform' && x.tr === 'death' && D.mon[x.cond] })[0] : null;
      if (tfx) {
        if (e) (e.hz = e.hz || []).push(u.i); u.flags.tf = 1; var nu = monster(D.mon[tfx.cond], u.stg || 1, D), old = u.name;
        u.name = nu.name; u.mid = nu.mid; u.sprite = nu.sprite; u.b = nu.b; u.b.mhp = Math.round(u.b.mhp * (u.hs || 1)); if (u.as) { u.b.patk = Math.round(u.b.patk * u.as); u.b.matk = Math.round(u.b.matk * u.as) } /* as = 秘境攻擊倍率，變身後保留 */ u.hp = u.b.mhp; u.st = [];
        u.cycle = nu.cycle; u.cy = 0; u.reaction = nu.reaction; u.special = nu.special; u.aura = nu.aura;
        u.aura.forEach(function (a) { var key = a.id + '|' + a.k; if (!auraSeenM[key]) auraSeenM[key] = u });
        if (e) e.txt += '；' + old + ' 倒下了';
        var tr = tfx.el === 'demon' ? line({ side: 'm', a: u.i, txt: '格里高利現出了惡魔真身！「' + u.name + '」降臨', tf: [u.i, u.sprite, u.name, 'demon', u.aura.map(function (a) { return a.id }).filter(function (x, i, a) { return a.indexOf(x) === i })] }) : line({ side: 'm', a: u.i, txt: old + (tfx.el === 'blood' ? ' 化為「' + u.name + '」暴走了！' : ' 化為「' + u.name + '」復活了！'), tf: tfx.el === 'blood' ? [u.i, u.sprite, u.name, 'blood', u.aura.map(function (a) { return a.id }).filter(function (x, i, a) { return a.indexOf(x) === i })] : [u.i, u.sprite, u.name] } /* blood = 尤里烏斯：不消散，腳下血法陣一閃就變身 */); tr.hp = hpSnap();
        if (tfx.el === 'demon') { (u.special || []).forEach(function (x) { if (x.k !== 'enter_summon' || !D.mon[x.cond]) return; var ids = []; for (var q = 0; q < ((x.v | 0) || 2); q++) ids.push(spawnMon(u, x.cond).i); tr.summon = ids; tr.sumFx = 'demon'; tr.txt += '，惡魔法陣同時召喚了 ' + ids.map(function (i) { return M[i].name }).join('、') }); tr.hp = hpSnap() } /* 惡魔化：法陣裡一起叫出小兵 */
        return false;
      }
      /* 先祖之鄉（必定、一次）→ 神恩（機率、一次） */
      if (u.runes.indexOf('rune17') >= 0 && (u.flags.r17 | 0) < RV(D, 'rune17', 1, 1, u)) { u.flags.r17 = (u.flags.r17 | 0) + 1; /* 先祖之鄉：Lv10 每場可以復活 2 次 */ revive(u, RV(D, 'rune17', 0, 0.5, u), '先祖之鄉', e, 1); return false }
      var sf = u.side === 'm' ? (u.special || []).filter(function (x) { return x.k === 'soul_feast' })[0] : null;
      if (sf && (u.souls || []).length) { var sv0 = u.souls.shift(); u.hp = Math.max(1, Math.round(u.b.mhp * sf.v)); if (e) (e.hz = e.hz || []).push(u.i); /* 打倒他的那一招：血條先歸零 */ reQ.push([u, sv0, u.souls.length, u.hp]); return false } /* 火焰獻祭：吞一顆魂火復活，狀態保留 */
      var g = u.special.filter(function (x) { return x.k === 'revive_self' })[0];
      if (g && !u.flags.grace) { u.flags.grace = 1; if (RND() < g.ch) { revive(u, g.v, D.SK[g.id] ? D.SK[g.id].n : '神恩', e, 1); return false } }
      u.dead = true; u.st = [];
      if (u.side === 'm' && (u.special || []).some(function (x) { return x.k === 'death_boom' })) booms.push(u);
      if (u.side === 'm') { u.sun = null; M.forEach(function (o) { if (o !== u && !o.dead && (o.special || []).some(function (x) { return x.k === 'soul_feast' })) soulQ.push([o, u]) }) } /* 火焰獻祭：等這一招結算完才變成魂火 */ /* 烈焰殉爆：等這一招結算完再炸 */
      if (u.side === 'm' && u._lh && u._lh.side === 'p' && !u._lh.dead) ugAdd(u._lh, 20); /* 奧義值：擊倒 +20 */
      if (SPM && u.side === 'm' && u._lh && u._lh.side === 'p' && !u._lh.dead) { var k0 = u._lh.sp | 0; u._lh.sp = Math.min(SPMAX, k0 + 1); if (u._lh.sp > k0) numAdd(u._lh, 1, 'sp', { h: NC && NC.h }); if (u._lh.mst && u._lh.mst.sp_on_kill && RND() < u._lh.mst.sp_on_kill.ch) { var k1 = u._lh.sp | 0; u._lh.sp = Math.min(SPMAX, k1 + 1); if (u._lh.sp > k1) { numAdd(u._lh, 1, 'sp', { h: NC && NC.h }); var wk1 = u._lh.mst.sp_on_kill.n } } /* 意志迴流 */ if (e) { (e.spk = e.spk || []).push(u._lh.i); (e._spk = e._spk || []).push(u._lh.name + ' 擊倒 ' + u.name + (u._lh.sp > k0 ? '，恢復 1 SP' : '（SP 已滿）') + (wk1 ? '，「' + wk1 + '」再 +1 SP' : '')) } }
      /* 吞噬者倒下：肚子裡的人回來（血量維持、狀態恢復計時） */
      if (u.side === 'm') P.forEach(function (x) { var q = x.st.filter(function (s) { return s.swal && s.src === u })[0]; if (!q || x.dead) return; removeStatus(x, q); x.st.forEach(function (s) { s.paused = false }); if (e) { (e._rel = e._rel || []).push(x.name + ' 從 ' + u.name + ' 的肚子裡逃出來了'); (e.rel = e.rel || []).push(x.i) } });
      if (e) { if (u.side === 'm') (e.dead = e.dead || []).push(u.i); else (e.pko = e.pko || []).push(u.i) }
      return true;
    }
    /* 逃出肚子的文字等這一行的傷害寫完才接在後面 */
    function flushRel(e) { if (e && e._rel) { e.txt += '；' + e._rel.join('；'); delete e._rel } if (e && e._spk) { e.txt += '；' + e._spk.join('；'); delete e._spk } if (e && e._spm) { e.txt += '；' + e._spm.join('；'); delete e._spm } }
    function revive(u, f, why, e, pil) { u.st = []; u.hp = Math.max(1, Math.round(u.b.mhp * f)); if (e) { e.txt += '；' + u.name + ' 因「' + why + '」復活（' + u.hp + ' 生命）'; (e.rev = e.rev || []).push([u.side, u.i]); if (pil && u.side === 'p') (e.rvr = e.rvr || []).push(u.i) /* 先祖之鄉、神恩：畫面上金色光柱往上升 */ } }

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
    function isCtr(r) { return r.effect === 'counter' }
    /* 同一招技能，每個被打的人最多反擊一次（多段招式不會被反擊好幾次）；格擋、減傷等防禦效果照常每段判定 */
    function reactPost(d, a, re, e) {
      if (!re) return; e._rq = e._rq || [];
      if (re.post.some(isCtr) && e._rq.some(function (z) { return z.d === d && z.a === a && z.re.post.some(isCtr) })) {
        re = Object.assign({}, re, { post: re.post.filter(function (r) { return !isCtr(r) }) });
        if (!re.block && !re.reduce && !re.absorb && !re.post.length) return;
      }
      e._rq.push({ d: d, a: a, re: re });
    }
    /* 幻獸給主人的被擊效果（t = 被打的人、u = 攻擊者）：
       九幽龍鱗盾（反彈傷害的一定比例，整招結束後才反彈）、風壁庇護（幻獸反擊，一招只反擊一次）、靜電鍍膜（機率麻痺攻擊者，一招只判定一次） */
    function bstOnHurt(t, u, real, e) {
      if (u.owner) return; /* 幻獸本身不會被反彈、反擊 */
      t.st.forEach(function (s) { if (s.paused) return; s.rows.forEach(function (r) {
        if (r.k === 'reflect') { var ra = Math.round(real * r.v); if (ra > 0) (e._th = e._th || []).push({ d: t, a: u, amt: ra, nm: s.n }) }
        else if (r.k === 'beast_counter' && t.bst && u.side !== t.side) { e._bc = e._bc || []; if (!e._bc.some(function (z) { return z.d === t && z.a === u })) e._bc.push({ d: t, a: u, v: r.v, nm: s.n }) }
        else if (r.k === 'para_on_hurt') { e._pz = e._pz || []; if (e._pz.some(function (z) { return z[0] === t && z[1] === u })) return; e._pz.push([t, u]); if (!u.dead && applyStatus(t, u, '麻痺', 1, r.v, null)) (e._x = e._x || []).push(t.name + ' 的「' + s.n + '」讓 ' + u.name + ' 陷入「麻痺」') }
      }) });
    }
    /* 風壁庇護的反擊：幻獸衝出去打攻擊者（幻獸攻擊力 × v 的疾風傷害，必中、不觸發反應） */
    function bstCounter(x) {
      var d = x.d, a = x.a; if (d.dead || a.dead || banished(a) || !d.bst) return;
      var px = bproxy(d, false), hiM = stat(d, 'matk') > stat(d, 'patk'), parts = [{ d: hiM ? 'm' : 'p', e: 'wind', r: x.v }];
      var r = line({ side: 'p', a: d.i, bst: ['wind', 0], ty: 'damage', tg: a.side === 'm' ? [a.i] : [], tgP: a.side === 'p' ? [a.i] : [], txt: '' });
      var y = dmgOnce(px, a, parts, { cr: 0, cd: 0 }, { sure: true, noReact: true });
      if (y.void) { r.txt = d.bst.name + '（幻獸）的「' + x.nm + '」反擊 ' + a.name + '，但沒有效果'; r.hp = hpSnap(); return }
      NC = { el: 'wind', dt: parts[0].d, c: y.crit }; var real = y.amt ? hurt(a, y.amt, px) : 0;
      r.txt = d.bst.name + '（幻獸）的「' + x.nm + '」反擊 ' + a.name + (y.crit ? ' 暴擊！' : ' ') + real + ' 疾風傷害'; addStat(r, d, 'dmg', real, x.nm); checkDeath(a, r); flushRel(r); r.hp = hpSnap();
    }
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
        L.forEach(function (x) { if (x.t.dead || banished(x.t)) return; NC = { el: L[0].el, dt: x.dt || 'm' }; var d = hurt(x.t, x.amt, u); addStat(r, u, 'dmg', d, RUNEN[rid]); addStat(r, x.t, 'taken', d, u.name + ' ' + RUNEN[rid]); out.push(x.t.name + ' ' + d); if (tgs.indexOf(x.t) < 0) tgs.push(x.t); checkDeath(x.t, r) });
        if (!out.length) { ev.pop(); return }
        var dt = L[0].dt; r.txt = u.name + ' 的「' + RUNEN[rid] + '」：' + out.join('、') + ' ' + ELN[L[0].el] + (dt === 'p' ? '物理' : dt === 'm' ? '魔法' : '') + '傷害'; r.el = L[0].el; fxOn(r, 'el', u, tgs);
        /* 附加狀態：每個被追加傷害的目標各一次。火炬之光看物攻、魔攻較高者（血沸／魂灼）；雷神之鎚的麻痺對 Boss 無效 */
        var sn = RUNEST[rid] === 'fire' ? (stat(u, 'patk') >= stat(u, 'matk') ? '血沸' : '魂灼') : RUNEST[rid], tn = RV(D, rid, 1, rid === 'rune03' ? 1 : 3, u), ch = RV(D, rid, 2, rid === 'rune03' ? 0.15 : 1, u), chB = RV(D, rid, 3, 0.05, u);
        if (sn && !u.dead) tgs.forEach(function (t) { if (t.dead || banished(t)) return; applyStatus(u, t, sn, tn, rid === 'rune03' && t.boss ? chB * 2 : ch, r) /* 雷神之鎚：對首領用另一個機率（applyStatus 對首領控制會減半，所以先乘 2） */ });
        flushSt(r); flushRel(r); r.hp = hpSnap();
      });
      q.forEach(function (x) { if (x.elx) return; var r = line({ rn: x.rid, txt: '' }); if (x.run(r) === false) { ev.splice(ev.indexOf(r), 1); return } flushSt(r); flushRel(r); r.hp = hpSnap() });
    }
    function flushReact(e) {
      var q = e._rq || [], th = e._th || [], bc = e._bc || [], items = [], tm = {}; delete e._rq; delete e._th; delete e._bc; delete e._pz;
      q.forEach(function (x) { items.push({ k: 'r', d: x.d, a: x.a, re: x.re }) });
      bc.forEach(function (x) { items.push({ k: 'b', d: x.d, a: x.a, v: x.v, nm: x.nm }) });
      /* 荊棘之皇冠：同一個人被多段打到，合併成一次反彈 */
      th.forEach(function (x) { var key = x.d.side + x.d.i + '>' + x.a.side + x.a.i + (x.fr || '') + (x.nm || ''); if (!tm[key]) { tm[key] = { k: 't', d: x.d, a: x.a, amt: 0, fr: x.fr, nm: x.nm, fire: x.fire, el: x.el, st: x.st, turns: x.turns, acid: x.acid }; items.push(tm[key]) } tm[key].amt += x.amt });
      if (!items.length) return;
      /* 速度高的先反應（同速維持觸發順序） */
      items = items.map(function (x, n) { return { x: x, n: n, s: stat(x.d, 'speed') } }).sort(function (p, q) { return q.s - p.s || p.n - q.n }).map(function (p) { return p.x });
      items.forEach(function (x) { if (x.k === 't') thornLine(x); else if (x.k === 'b') bstCounter(x); else reactLine(x.d, x.a, x.re) });
    }
    function thornLine(x) {
      var d = x.d, a = x.a; if (a.dead || x.amt <= 0) return;
      var r = line({ side: d.side, a: d.i, rk: 'thorn', rn: x.fr || x.nm ? '' : 'rune11', frost: x.fr && !x.fire ? 1 : 0, fire: x.fire ? 1 : 0, acid: x.acid ? 1 : 0, rt: [a.side, a.i], txt: '' }); if (x.el) NC = { el: x.el, dt: 'p' };
      var th = hurt(a, x.amt, d), nm = x.fr || x.nm || '荊棘之皇冠'; r.txt = d.name + ' 的「' + nm + '」反彈 ' + th + (x.fire ? ' 火焰傷害給 ' : x.fr ? ' 冰霜傷害給 ' : x.el ? ' ' + (ELN[x.el] || '') + '傷害給 ' : ' 真實傷害給 ') + a.name; if (x.st && !a.dead) applyStatus(d, a, x.st, x.turns || 3, 1, r); flushSt(r);
      addStat(r, d, 'dmg', th, nm); addStat(r, a, 'taken', th, d.name + ' ' + nm); checkDeath(a, r); flushRel(r); r.hp = hpSnap();
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
        var rEl = pickOne(EL4), parts = ctr.map(function (q) { return { d: q.dmg_type || 'p', e: q.element === 'rand4' ? rEl : (q.element || ''), r: num(q.value) } }); if (ctr.some(function (q) { return q.element === 'rand4' })) r.rel = rEl; /* 元素反衝：隨機屬性 */
        var pvC = d.side === 'p' ? preyV(a, d) : 0, x = dmgOnce(d, a, parts, { cr: 0, cd: 0 }, { noReact: true, mult: 1 + pvC, hitAdd: pvC ? 0.1 : 0 });
        if (x.miss) { r.txt += '，反擊被閃開'; r.rmiss = 1; numAdd(a, 0, 'miss') }
        else if (x.amt) { var cp = parts.reduce(function (p1, p2) { return p2.r > p1.r ? p2 : p1 }, parts[0]); NC = { el: cp.e || '', dt: cp.d, c: x.crit }; var real = hurt(a, x.amt, d); r.txt += '，反擊 ' + a.name + (x.crit ? ' 暴擊！' : ' ') + real + ' 傷害'; addStat(r, d, 'dmg', real, re.name); addStat(r, a, 'taken', real, d.name + ' ' + re.name);
          ctr.forEach(function (q) { if (q.condition === 'el_status' && r.rel && !a.dead && a.hp > 0 && ELST[r.rel] && applyStatus(d, a, ELST[r.rel], parseInt(q.turns, 10) || 3, 1, r)) r.dring = 1 }); r._land = 1; checkDeath(a, r); huntPost(d, [a], pvC ? [a] : [], x.crit, r); if (r._x) { r.txt += '（' + r._x.join('，') + '）'; delete r._x } }
      }
      hl.forEach(function (q) { if (d.dead) return; var h = num(q.value) * (q.base === 'p_atk' ? stat(d, 'patk') : stat(d, 'matk')), c = RND() < stat(d, 'crit'); h *= (1 + d.b.heal) * (c ? 1 + stat(d, 'cdmg') : 1); var got = heal(d, d, h); if (got) { r.txt += '，' + d.name + (c ? ' 暴擊！' : ' ') + '恢復 ' + got + ' 生命'; addStat(r, d, 'heal', got, re.name) } });
      sts.forEach(function (q) { if (q.condition === 'on_hit' && !r._land) return; /* 風纏箭：反擊打中才附加 */ if (!a.dead && applyStatus(d, a, q.status_name, q.turns, 1, r)) r.dring = 1 }); delete r._land;
      flushSt(r); flushRel(r); r.hp = hpSnap();
    }

    /* --- 一次行動 --- */
    function act(u) { if (begin(u)) finish(u) }
    /* 行動開始的結算；回傳 false = 這次不能行動（放逐中、被持續傷害打倒、昏迷／睡眠／石化），已經記完戰報 */
    function begin(u) {
      flushBoom(); /* 保險：別的地方打倒、還沒炸的先炸 */
      nowAct = u;
      if (u._xtra) { /* 翠嵐順風：立刻再行動一次（持續傷害、回復、每回合觸發的效果都不再算一次） */
        var ex = line({ side: u.side, a: u.i, txt: '' });
        if (u.dead || banished(u) || ctrl(u, 'deathcurse') || ctrl(u, 'stun') || ctrl(u, 'sleep') || ctrl(u, 'petrify')) { ex.txt = u.name + ' 無法行動'; ex.idle = 1; ex.hp = hpSnap(); endAct(u, null); return false }
        u._e = ex; return true;
      }
      if (!u.dead && !u.undead && u.special && u.special.some(function (x) { return x.k === 'scorch' })) scorchTick(u);
      if (!u.dead && !u.undead) selfBurn(u);
      if (u.st.some(function (q) { return q.rows.some(function (r) { return r.k === 'until_act' }) })) u.st = u.st.filter(function (q) { return !q.rows.some(function (r) { return r.k === 'until_act' }) }); /* 星儀異象：到下次行動前為止 */
      if (!u.dead && !u.undead) beastPulse(u);
      if (u.dead) { flushBoom(); return false }
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
          NC = { el: '', dt: 'm', c: c }; var real = hurt(u, amt, src); e.txt = u.name + ' 從裂隙回來，' + (c ? '暴擊！' : '') + '受到 ' + real + ' 魔法傷害'; addStat(e, src, 'dmg', real, '秘法裂隙'); e.snap = 1;
          if (checkDeath(u, e) || u.undead) { flushRel(e); e.hp = hpSnap(); flushBoom(); return false }
          e.hp = hpSnap(); e = line({ side: u.side, a: u.i, txt: '' });
        } else { ban.turns--; e.txt = u.name + ' 被放逐在時空裂隙中'; e.idle = 1; e.hp = hpSnap(); return false }
      }
      var tick = [];
      /* 職業精通：每回合開始（自己行動開始時，被控制也照樣觸發）。回血、SP 只跳數字不寫戰報；驅魔、劍心有發動才寫 */
      var MS = u.mst || {};
      if (MS.regen_self) { var gS = heal(u, u, u.b.mhp * MS.regen_self.v, null, true); if (gS) numAdd(u, gS, 'h') }
      if (MS.heal_lowest) { var fl = friends(u).filter(function (q) { return !q.dead && !banished(q) && q.hp < q.b.mhp }); if (fl.length) { var lw = fl.reduce(function (a, b) { return b.hp / b.b.mhp < a.hp / a.b.mhp ? b : a }); var gL = heal(u, lw, lw.b.mhp * MS.heal_lowest.v, null, true); if (gL) { numAdd(lw, gL, 'h'); addStat(e, u, 'heal', gL, MS.heal_lowest.n) } } }
      if (MS.cleanse) { var fc = friends(u).filter(function (q) { return !q.dead && debuffs(q).some(function (s) { return !s.swal && !s.banish }) }); if (fc.length) { var ct = pickOne(fc), cs = pickOne(debuffs(ct).filter(function (s) { return !s.swal && !s.banish })); removeStatus(ct, cs); tick.push('「' + MS.cleanse.n + '」解除 ' + ct.name + ' 的「' + cs.n + '」') } }
      if (MS.sp_turn && SPM && rounds > 1 && RND() < MS.sp_turn.ch) { var s0 = u.sp | 0; u.sp = Math.min(SPMAX, s0 + 1); if (u.sp > s0) { numAdd(u, 1, 'sp'); tick.push('「' + MS.sp_turn.n + '」SP +1') } } /* 跟每回合自然回 SP 一樣，第 1 回合不觸發 */
      if (MS.orb_turn && RND() < MS.orb_turn.ch) { var miss = EL4.filter(function (el) { return !u.st.some(function (q) { return q.n === ORB[el] }) }); if (miss.length) { var oe = pickOne(miss); if (applyStatus(u, u, ORB[oe], MS.orb_turn.turns || 6, 1, null)) { tick.push('「' + MS.orb_turn.n + '」獲得「' + ORB[oe] + '」'); e.orbN = [ORB[oe]] } } } /* 精靈祝福：每回合機率獲得一顆還沒有的光球 */
      var spE = u.special && u.special.filter(function (x) { return x.k === 'sp_elem' })[0];
      if (spE && SPM) { var EDB = String(spE.cond || '').split('|').filter(Boolean), seen = {}; foes(u).forEach(function (f) { f.st.forEach(function (q) { if (!q.paused && EDB.indexOf(q.n) >= 0) seen[q.n] = 1 }) }); if (Object.keys(seen).length >= 2) { var s1 = u.sp | 0; u.sp = Math.min(SPMAX, s1 + (spE.v | 0 || 1)); if (u.sp > s1) { numAdd(u, u.sp - s1, 'sp'); tick.push('「' + (D.SK[spE.id] ? D.SK[spE.id].n : '元素汲取') + '」SP +' + (u.sp - s1)) } } } /* 元素汲取：敵方合計 2 種以上元素減益 */
      if (MS.buff_turn && MS.buff_turn.st && RND() < MS.buff_turn.ch) { if (applyStatus(u, u, MS.buff_turn.st, MS.buff_turn.turns, 1, null)) tick.push('「' + MS.buff_turn.n + '」獲得「' + MS.buff_turn.st + '」') }
      u.special.forEach(function (x) { if (x.k === 'regen') { var g = heal(u, u, u.b.mhp * x.v, null, true); if (g) tick.push('「' + (D.SK[x.id] ? D.SK[x.id].n : '再生') + '」恢復 ' + g) } });
      u.st.slice().forEach(function (s) {
        if (s.paused) return;
        s.rows.forEach(function (r) {
          if (r.k === 'dot' && r.amt) { var red = r.dt === 'm' ? stat(u, 'mred') : stat(u, 'pred'), v = Math.max(1, Math.round(r.amt * (1 - Math.min(red, 0.9)) * (1 - Math.min(resOf(u, r.el), 0.9)) * (1 + sv(u, 'dmg_taken_rate'))));
            NC = { el: r.el || '', dt: r.dt }; var real = hurt(u, v, s.src, true); tick.push('「' + s.n + '」' + real + ' 傷害'); addStat(e, s.src, 'dmg', real, s.n); addStat(e, u, 'taken', real, s.n);
            if (s.rows.some(function (q) { return q.k === 'drain' }) && !s.src.dead) { NC = { ls: 1 }; var g = heal(s.src, s.src, real, null, true); if (g) { addStat(e, s.src, 'heal', g, s.n); (e.drain = e.drain || []).push([s.src.side, s.src.i]) } } }
          if (r.k === 'deathcurse') { var dl = Math.max(1, Math.round(u.b.mhp * (r.v || 0.1))); NC = { el: '', dt: 'm' }; var rdl = hurt(u, dl, s.src, true); tick.push('「' + s.n + '」失去 ' + rdl + ' 生命'); addStat(e, s.src, 'dmg', rdl, s.n); addStat(e, u, 'taken', rdl, s.n) } /* 死之詛咒：每回合失去最大生命的 v */
          if (r.k === 'hot' && r.amt) { var h = heal(s.src, u, r.amt); if (h) { tick.push('「' + s.n + '」恢復 ' + h); addStat(e, s.src, 'heal', h, s.n) } }
        });
      });
      if (tick.length) { e.txt = u.name + ' ' + tick.join('、'); e.tick = 1; if (checkDeath(u, e) || u.undead) { flushRel(e); e.hp = hpSnap(); flushBoom(); return false }/* 持續傷害打倒骨兵 → 變成骨堆，這回合不再行動 */ e.hp = hpSnap(); e = line({ side: u.side, a: u.i, txt: '' }) }
      /* 高空（獅鷲鷹揚）：輪到自己時先從天上俯衝打施放時選好的目標（目標倒下就撲空），落地後這回合照常行動 */
      var air = u.st.filter(function (s) { return s.air })[0];
      if (air) {
        u.st = u.st.filter(function (s) { return s !== air }); var dv = u.dive || {}, dt0 = dv.t, dsk = D.SK[dv.sk]; delete u.dive;
        if (!dsk || !dt0 || dt0.dead || swallowed(dt0) || airborne(dt0)) { e.txt = u.name + ' 從高空俯衝而下，撲空了'; if (dsk) { e.sk = dsk.id; e.ty = 'damage' } e.dive = 1; e.hp = hpSnap() }
        else { e.sk = dsk.id; e.ty = dsk.ty; e.dive = 1; e.txt = u.name + ' 從高空「' + dsk.n + '」而下'; doSkill(u, dsk, [dt0], e); flushSt(e); afterSkill(u, dsk, [dt0], e, false); flushRel(e); if (!e.hp) e.hp = hpSnap(); if (u.dead || u.undead) return false }
        e = line({ side: u.side, a: u.i, txt: '' });
      }
      /* 無法行動 */
      if (ctrl(u, 'deathcurse')) { e.txt = u.name + ' 在死之詛咒中倒地不起'; e.idle = 1; e.hp = hpSnap(); endAct(u, null); return false } /* 死之詛咒：倒地閉眼，不能行動 */
      if (ctrl(u, 'stun') || ctrl(u, 'sleep') || ctrl(u, 'petrify')) { e.txt = u.name + ' 無法行動'; e.idle = 1; e.hp = hpSnap(); endAct(u, null); return false }
      /* 恐懼：每次輪到行動時有 value 機率（預設 50%）被嚇得不動 */
      var fr0 = 0; u.st.forEach(function (s) { if (!s.paused) s.rows.forEach(function (r) { if (r.k === 'fear') fr0 = Math.max(fr0, r.v || 0.5) }) });
      if (fr0 && RND() < fr0) { e.txt = u.name + ' 陷入恐懼，被嚇得無法行動'; e.idle = 1; e.hp = hpSnap(); endAct(u, null); return false }
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
        tg = (forced.tg || []).filter(function (x) { return x && !x.dead && !(x.side !== u.side && airborne(x)) });
        if (!tg.length && sk.t !== 'self') sk = null; else if (sk.t === 'self') tg = [u];
      }
      /* 選技能：封禁只能普攻；沒有可用目標就換下一招。
         SP 制度：輪到的招冷卻中 → 跳下一招；SP 不夠 → 這次普攻、這招保留到下次 */
      /* 奧義（自動）：輪到時 SP 夠、冷卻好了就優先放，不管技能循環排到哪 */
      if (!forced && u.side === 'p' && u.ult && !ctrl(u, 'seal') && D.SK[u.ult] && canUse(u, D.SK[u.ult]) && useOk(u, u.ult)) { var tU = pickTargets(u, D.SK[u.ult], charmed, confused); if (tU.length) { sk = D.SK[u.ult]; tg = tU } }
      for (var tries = 0; !forced && !sk && tries < 4; tries++) {
        var id = u.cycle[u.cy % u.cycle.length]; if (id.indexOf('|') > 0) id = pickOne(id.split('|')).trim(); /* 「a|b」= 這格隨機放其中一招（教皇的偽神救贖／輝光枷鎖） */
        if (SPM && u.side === 'p' && id !== 'atk' && D.SK[id] && !ctrl(u, 'seal')) {
          if (cdOf(u, id) > 0) { u.cy++; continue }
          if ((u.sp | 0) < D.SK[id].sp) { id = 'atk' } else u.cy++;
        } else u.cy++;
        if (ctrl(u, 'seal')) id = 'atk';
        if (id !== 'atk' && !useOk(u, id)) { var alt9 = (D.EFF[id] || []).filter(function (r) { return r.effect_kind === 'use_else' })[0]; id = alt9 && D.SK[alt9.effect] && useOk(u, alt9.effect) ? alt9.effect : 'atk' } /* use_else：條件不符時改放另一招（提豐：魔日映照 ↔ 超新星殉爆） */
        /* 使用條件不符（例如冥想石化：生命低於 30% 才放）→ 普攻 */
        var k = D.SK[id] || D.SK.atk;
        var t0 = pickTargets(u, k, charmed, confused);
        if (k.t === 'ally_others' && !t0.length) continue;
        if (charmed && k.ty === 'damage' && !t0.length) { e.txt = u.name + ' 被魅惑，找不到可以攻擊的同伴'; e.idle = 1; e.hp = hpSnap(); endAct(u, null); return }
        if (t0.length) { sk = k; tg = t0; break }
      }
      if (!sk && SPM && u.side === 'p' && !forced) { var ta = pickTargets(u, D.SK.atk, charmed, confused); if (ta.length) { sk = D.SK.atk; tg = ta } } /* 四招都在冷卻：普攻 */
      if (!sk) { e.txt = u.name + (foes(u).some(airborne) ? ' 的目標飛到高空，攻擊落空' : ' 沒有可以行動的目標'); e.idle = 1; e.hp = hpSnap(); endAct(u, null); return }
      e.sk = sk.id; e.ty = sk.ty; e.txt = u.name + ' 使用「' + sk.n + '」'; if (sk.kind === 'ultimate') { e.ult = 1; e.txt = u.name + ' 發動奧義「' + sk.n + '」'; u.ug = 0 } else if (u.side === 'p') ugAdd(u, 10) /* 奧義值：自己每次行動 +10 */
      if (SPM && u.side === 'p' && sk.id !== 'atk') { u.sp = Math.max(0, (u.sp | 0) - sk.sp); if (sk.cdN > 0) u.cd[sk.id] = sk.cdN + 1; if (sk.sp) e.txt += '（' + sk.sp + ' SP）';
        /* 職業精通：巧手回收（自己 SP +1）、餘韻（隨機一名同伴 SP +1），只算消耗 SP 的技能 */
        if (sk.sp && u.mst) {
          if (u.mst.sp_on_skill && RND() < u.mst.sp_on_skill.ch) { var q0 = u.sp | 0; u.sp = Math.min(SPMAX, q0 + 1); if (u.sp > q0) { numAdd(u, 1, 'sp'); e._spm = (e._spm || []).concat('「' + u.mst.sp_on_skill.n + '」' + u.name + ' SP +1') } }
          if (u.mst.sp_ally_on_skill && RND() < u.mst.sp_ally_on_skill.ch) { var oa = P.filter(function (q) { return q !== u && !q.dead && (q.sp | 0) < SPMAX }); if (oa.length) { var ob = pickOne(oa); ob.sp = (ob.sp | 0) + 1; numAdd(ob, 1, 'sp'); e._spm = (e._spm || []).concat('「' + u.mst.sp_ally_on_skill.n + '」' + ob.name + ' SP +1') } }
        } }
      doSkill(u, sk, tg, e);
      flushSt(e);
      afterSkill(u, sk, tg, e, false);
      flushRel(e);
      if (!e.hp) e.hp = hpSnap();
      /* 光速連攜（幻獸）：這次攻擊後再重複一次同樣的動作（不耗 SP） */
      if (sk.ty === 'damage' && !u.dead && foes(u).length) { var rpS = u.st.filter(function (q) { return !q.paused && q.rows.some(function (r) { return r.k === 'repeat_next' }) })[0];
        if (rpS) { removeStatus(u, rpS); var t2 = tg.filter(function (x) { return !x.dead && !(x.side !== u.side && airborne(x)) }); if (!t2.length) t2 = pickTargets(u, sk, false, false);
          if (t2.length) { var e2 = line({ side: u.side, a: u.i, sk: sk.id, ty: sk.ty, txt: u.name + ' 的「' + rpS.n + '」重複「' + sk.n + '」' }); doSkill(u, sk, t2, e2); flushSt(e2); afterSkill(u, sk, t2, e2, true); flushRel(e2); if (!e2.hp) e2.hp = hpSnap() } } }
      endAct(u, sk);
      fieldPulse(u);
      flushBoom();
      beastTurn(u);
      /* 翠嵐順風：這次行動結束後立刻再行動一次（插在行動順序裡自己的下一位） */
      if (u._again) { u._again = false; var j9 = curOrder ? curOrder.lastIndexOf(u) : -1; if (j9 >= 0 && !u.dead) { curOrder.splice(j9 + 1, 0, u); u._xtra = true } }
    }
    /* 幻獸：主人行動結束後 25% 機率，從裝備的兩招隨機放一招。
       幻獸沒有生命、不能被選為目標；打敵人的招用幻獸自己的數值（主人當下的物攻、魔攻較高者 × 50%，傷害類型跟著較高的那個），
       作用在主人身上的招（守護）用主人的數值。敵人的反擊、反彈不會打到幻獸；幻獸打倒敵人的擊殺 SP 算主人的 */
    function bproxy(u, full) {
      var key = full ? '_bpF' : '_bpD', x = u[key];
      if (!x) { x = u[key] = { side: 'p', i: u.i, name: u.bst.name, boss: false, st: [], runes: [], special: [], aura: [], mst: null, used: {}, flags: {}, dead: false, hp: 1, dragon: 0, owner: u };
        Object.defineProperty(x, 'sp', { get: function () { return u.sp }, set: function (v) { u.sp = v } }); Object.defineProperty(x, 'i', { get: function () { return u.i } }); Object.defineProperty(x, 'dead', { get: function () { return u.dead }, set: function () {} }) }
      var hi = Math.max(stat(u, 'patk'), stat(u, 'matk')) * (full ? 1 : 0.5);
      x.b = { mhp: u.b.mhp, patk: hi, matk: hi, pdmg: stat(u, 'pdmg'), mdmg: stat(u, 'mdmg'), eva: 0, crit: stat(u, 'crit'), cdmg: stat(u, 'cdmg'), pred: 0, mred: 0, res: {}, heal: u.b.heal || 0, speed: stat(u, 'speed'), hit: 0 };
      return x;
    }
    function beastTurn(u) {
      if (!u.bst || u.side !== 'p' || u.dead || u.undead || banished(u) || !foes(u).length || RND() >= (opt.beastCh != null ? opt.beastCh : BCH)) return;
      var b = u.bst, xtOk = function (i) { return !(u._xr === rounds && (D.EFF[bsid(b, i)] || []).some(function (r) { return r.effect_kind === 'extra_turn' })) } /* 這回合已經再行動過：不再放翠嵐順風 */, SKs = b.sk.filter(xtOk); if (!SKs.length) return;
      var L = SKs.filter(function (i) { var k0 = D.SK[bsid(b, i)]; return k0 && !(k0.t === 'self' && u.st.some(function (q) { return q.n === k0.n && !q.paused })) }) /* 守護還在身上就放另一招 */, idx = pickOne(L.length ? L : SKs), sk = D.SK[bsid(b, idx)]; if (!sk) return;
      var self = sk.t === 'self', px = bproxy(u, self), hiM = stat(u, 'matk') > stat(u, 'patk');
      if (sk.parts && sk.parts.length) { var k2 = {}; Object.keys(sk).forEach(function (q) { k2[q] = sk[q] }); k2.parts = sk.parts.map(function (q) { return { d: hiM ? 'm' : 'p', e: q.e, r: q.r } }); sk = k2 }
      px.hiM = hiM;
      var tg = self ? [u] : pickTargets(px, sk, false, false);
      if (!tg.length && sk.t === 'ally_dead') { /* 森靈輝光：沒有人陣亡時，改為生命比例最低的隊友回復 */
        var lw = friends(u).filter(function (q) { return !banished(q) }); if (!lw.length) return; lw = lw.reduce(function (a, q) { return q.hp / q.b.mhp < a.hp / a.b.mhp ? q : a });
        var eh = line({ side: 'p', a: u.i, bst: bvis(b, idx), ty: 'buff', txt: b.name + '（幻獸）使用「' + sk.n + '」' }); nowAct = null;
        var gh = heal(u, lw, lw.b.mhp * (num(sk.raw && sk.raw.part1_ratio) || 0.1), null, true); eh.txt += '，' + lw.name + (gh ? ' 恢復 ' + gh : ' 生命已滿'); addStat(eh, u, 'heal', gh, sk.n); eh.tg = []; eh.hl = [lw.i]; eh.hp = hpSnap(); return;
      }
      if (!tg.length) return;
      var e = line({ side: 'p', a: u.i, bst: bvis(b, idx), ty: sk.ty, txt: b.name + '（幻獸）使用「' + sk.n + '」' }); nowAct = null;
      doSkill(px, sk, tg, e); delete e._rq; delete e._th; delete e._rn; delete e._bc; delete e._pz; /* 反擊、反彈、符文都不算幻獸的 */
      if (self) { e.tg = []; e.hl = [u.i] }
      flushSt(e); flushRel(e); e.hp = hpSnap(); flushBoom();
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
    /* 烈焰殉爆：倒下的怪炸出一圈火焰，對敵方全體造成（自己的）魔攻 ×v 的屬性傷害；可以打倒人，我方全滅就算輸 */
    var booms = [], soulQ = [], reQ = []; /* reQ：提豐吞魂火重燃，招式結束後獨立兩行（先攫取魂火的特效，再回血） */
    function flushSoul() {
      while (reQ.length) { var rq = reQ.shift(), ru = rq[0]; if (ru.dead) continue;
        var r1 = line({ side: 'm', a: ru.i, idle: 1, soulR: [ru.i, rq[2]], soulEat: [[ru.i, rq[2]]], hit: 120, hz: [ru.i], txt: ru.name + ' 從灰燼中伸手攫取 ' + rq[1] + ' 的魂火……' }); r1.hp = hpSnap();
        var r2 = line({ side: 'm', a: ru.i, idle: 1, rev: [[ru.side, ru.i]], txt: ru.name + ' 從灰燼中重燃！恢復 ' + rq[3] + ' 生命（剩 ' + rq[2] + ' 顆魂火）' }); r2.hp = hpSnap() }
      while (soulQ.length) { var q = soulQ.shift(), o = q[0], v = q[1]; if (o.dead) continue; var sp = o.special.filter(function (x) { return x.k === 'soul_feast' })[0], mx = parseInt(sp.cond, 10) || 4; o.souls = o.souls || []; if (o.souls.length >= mx) continue; o.souls.push(v.name);
        var r = line({ side: 'm', a: o.i, idle: 1, soul: [o.i, v.i, o.souls.length], txt: o.name + ' 攫取了 ' + v.name + ' 的靈魂，魂火在他身旁燃起（' + o.souls.length + ' 顆）' }); r.hp = hpSnap() }
    }
    function flushBoom() {
      flushSoul();
      while (booms.length) { var u = booms.shift(), sp = u.special.filter(function (x) { return x.k === 'death_boom' })[0], nm = D.SK[sp.id] ? D.SK[sp.id].n : '烈焰殉爆', out = [], bM = (sp.dt || 'm') === 'm';
        var tgs = foes(u).filter(function (q) { return !q.dead && !banished(q) }); if (!tgs.length) continue;
        var r = line({ side: u.side, a: u.i, boom: 1, txt: '' });
        tgs.forEach(function (q) { var amt = Math.max(1, Math.round(stat(u, bM ? 'matk' : 'patk') * sp.v * (1 + stat(u, bM ? 'mdmg' : 'pdmg')) * (1 - Math.min(stat(q, bM ? 'mred' : 'pred'), 0.9)) * (1 - Math.min(resOf(q, sp.el || ''), 0.9))));
          NC = { el: sp.el || '', dt: bM ? 'm' : 'p' }; var d = hurt(q, amt, u); addStat(r, u, 'dmg', d, nm); addStat(r, q, 'taken', d, u.name + ' ' + nm); out.push(q.name + ' ' + d); checkDeath(q, r) });
        r.txt = u.name + ' 的「' + nm + '」炸開：' + out.join('、') + ' ' + (ELN[sp.el] || '') + '傷害'; flushRel(r); r.hp = hpSnap() }
    }
    function trueAll(u, amt, e, why) { var t = 0; foes(u).forEach(function (q) { if (banished(q)) return; var d = hurt(q, amt, u); t += d; addStat(e, u, 'dmg', d, why); addStat(e, q, 'taken', d, u.name + ' ' + why); checkDeath(q, e) }); return t }
    function afterSkill(u, sk, tg, e, isExtra) {
      afterRunes(u, sk, tg, e, isExtra);
      /* 這一招（含招式後的符文）完全結束 → 先記下血量，再輪到被打的人依速度發動反應技 */
      if (!e.hp) e.hp = hpSnap();
      flushRunes(e);
      flushReact(e);
      flushBoom();
      if (!isExtra) swarmFollow(u, sk, tg);
      if (!isExtra && !u.dead) afterExtra(u, sk, tg, e);
    }
    /* 焦土（炎魔）：輪到他行動時，腳下的大火燒過敵方全體（魔攻 ×v 的火焰魔法傷害），每人疊一層焦土（火抗 −5%，最多 cond 層，戰鬥中不會自然消失） */
    function scorchTick(u) {
      var sp = u.special.filter(function (x) { return x.k === 'scorch' })[0], mx = parseInt(sp.cond, 10) || 6, out = [];
      var e = line({ side: u.side, a: u.i, scorch: 1, txt: '' }), tg = foes(u).filter(function (t) { return !banished(t) });
      tg.forEach(function (t) {
        var amt = Math.max(1, Math.round(stat(u, 'matk') * sp.v * (1 - Math.min(stat(t, 'mred'), 0.9)) * (1 - Math.min(resOf(t, 'fire'), 0.9))));
        NC = { el: 'fire', dt: 'm' }; var d = hurt(t, amt, u); addStat(e, u, 'dmg', d, '焦土'); addStat(e, t, 'taken', d, u.name + ' 焦土'); out.push(t.name + ' ' + d);
        if (!t.dead) { var had = t.st.some(function (q) { return q.n === (sp.st || '焦土') }); t.scorch = had ? Math.min(mx, (t.scorch || 0) + 1) : 1; if (!had) applyStatus(u, t, sp.st || '焦土', 99, 1, e) }
        checkDeath(t, e);
      });
      var sn = tg.reduce(function (m, t) { return t.dead ? m : Math.max(m, t.scorch || 0) }, 0); e.txt = u.name + ' 腳下的「焦土」燒向全隊：' + (out.join('、') || '沒有目標') + (sn ? '（焦土 ' + sn + ' 層，火抗 −' + (sn * 5) + '%）' : ''); flushSt(e); e.hp = hpSnap();
    }
    /* 自燃（狀態 self_burn）：身上有這個狀態時，每次輪到自己行動，先燒敵方全體一次（自身魔攻 ×v 的火焰魔法傷害） */
    /* 電流環（幻獸）：主人身上帶電，每次輪到主人行動先向四周放電：敵方全體受到幻獸攻擊力 × v 的雷電傷害，各自擲機率麻痺 */
    function beastPulse(u) {
      if (!u.bst || u.side !== 'p') return;
      var ps = u.st.filter(function (s) { return !s.paused && s.rows.some(function (r) { return r.k === 'pulse' }) })[0]; if (!ps) return;
      var tg = foes(u).filter(function (t) { return !banished(t) }); if (!tg.length) return;
      var pv = 0, pp = 0; ps.rows.forEach(function (r) { if (r.k === 'pulse') pv = r.v; if (r.k === 'pulse_para') pp = r.v });
      var px = bproxy(u, false), hiM = stat(u, 'matk') > stat(u, 'patk'), parts = [{ d: hiM ? 'm' : 'p', e: 'lightning', r: pv }], r0 = line({ side: u.side, a: u.i, txt: '' }), out = [];
      tg.forEach(function (t) { var x = dmgOnce(px, t, parts, { cr: 0, cd: 0 }, { sure: true, noReact: true }); if (x.void) { out.push(t.name + ' 不受影響'); return }
        NC = { el: 'lightning', dt: parts[0].d, c: x.crit }; var d = x.amt ? hurt(t, x.amt, px) : 0; addStat(r0, u, 'dmg', d, ps.n); addStat(r0, t, 'taken', d, u.name + ' ' + ps.n); out.push(t.name + (x.crit ? ' 暴擊 ' : ' ') + d);
        if (!t.dead && pp) applyStatus(px, t, '麻痺', 1, pp, r0); checkDeath(t, r0) });
      r0.txt = u.name + ' 身上的「' + ps.n + '」放電：' + out.join('、') + ' 雷電傷害'; fxOn(r0, 'zap', u, tg); flushSt(r0); flushRel(r0); r0.hp = hpSnap(); flushBoom();
    }
    function selfBurn(u) {
      var sb = null; u.st.forEach(function (s) { if (!s.paused) s.rows.forEach(function (r) { if (r.k === 'self_burn') sb = { s: s, v: r.v } }) }); if (!sb) return;
      var tg = foes(u).filter(function (t) { return !banished(t) }); if (!tg.length) return; var e = line({ side: u.side, a: u.i, sburn: 1, txt: '' }), out = [];
      tg.forEach(function (t) { var amt = Math.max(1, Math.round(stat(u, 'matk') * sb.v * (1 + stat(u, 'mdmg')) * (1 - Math.min(stat(t, 'mred'), 0.9)) * (1 - Math.min(resOf(t, 'fire'), 0.9))));
        NC = { el: 'fire', dt: 'm' }; var d = hurt(t, amt, u); addStat(e, u, 'dmg', d, sb.s.n); addStat(e, t, 'taken', d, u.name + ' ' + sb.s.n); out.push(t.name + ' ' + d); checkDeath(t, e) });
      e.txt = u.name + ' 的「' + sb.s.n + '」燒向全隊：' + out.join('、') + ' 火焰傷害'; flushRel(e); e.hp = hpSnap();
    }
    /* 惡魔巢群（沉淪魔）：隊友用普攻或單體技能打人，每隻有這個被動的同伴都跟著對同一個目標補一下普攻 ×v；
       追擊不算攻擊：不觸發反擊、荊棘這類反應，也不會再帶出別人的追擊；被控制住或倒下就不跟 */
    function swarmFollow(u, sk, tg) {
      if (!sk || sk.ty !== 'damage' || sk.t !== 'enemy_single') return;
      var t = (tg || [])[0]; if (!t || t.dead || banished(t)) return;
      friends(u).forEach(function (a) {
        if (a === u || a.dead || a.undead || t.dead) return;
        var sp = (a.special || []).filter(function (x) { return x.k === 'swarm' })[0]; if (!sp) return;
        if (ctrl(a, 'stun') || ctrl(a, 'sleep') || ctrl(a, 'petrify') || ctrl(a, 'deathcurse')) return;
        var fk = {}; Object.keys(D.SK.atk).forEach(function (k) { fk[k] = D.SK.atk[k] }); fk.parts = [{ d: 'p', e: '', r: sp.v || 0.5 }];
        var e2 = line({ side: a.side, a: a.i, sk: 'atk', ty: 'damage', swarm: 1, txt: a.name + ' 的「' + (D.SK[sp.id] ? D.SK[sp.id].n : '惡魔巢群') + '」跟著撲向 ' + t.name });
        doSkill(a, fk, [t], e2); delete e2._rq; delete e2._th; delete e2._bc; delete e2._pz; flushSt(e2); flushRel(e2); e2.hp = hpSnap(); flushBoom();
      });
    }
    function afterRunes(u, sk, tg, e, isExtra) {
      if (u.dead || !u.runes.length) return;
      var dealt = (e._dealt || 0) > 0;
      if (dealt && u.runes.indexOf('rune26') >= 0) { var loss = Math.max(1, Math.round(u.b.mhp * RV(D, 'rune26', 0, 0.05, u))), lt = Math.round(loss * RV(D, 'rune26', 1, 2, u));
        rq(e, 'rune26', function (r) { if (u.dead) return false; var hitT = foes(u).filter(function (q) { return !banished(q) }); u.hp -= loss; numAdd(u, loss, 't'); r.txt = u.name + ' 的「墓之土」：失去 ' + loss + ' 生命，全體敵人受到 ' + lt + ' 真實傷害'; addStat(r, u, 'taken', loss, '墓之土'); trueAll(u, lt, r, '墓之土'); fxOn(r, 'grave', u, hitT); checkDeath(u, r) }) }
      if (!isExtra && dealt && u.runes.indexOf('rune21') >= 0 && sk.id !== 'atk' && sk.ty === 'damage') {
        u.r21 = (u.r21 || 0) + 1; var need = RV(D, 'rune21', 1, 3, u);
        /* 光球累積：tome = [陣營, 編號, 目前層數, 滿層數]；畫面照這個畫角色左上方的光球 */
        e.tome = [u.side, u.i, Math.min(u.r21, need), need];
        if (u.r21 >= need) { u.r21 = 0; var wv = Math.round(Math.max(stat(u, 'patk'), stat(u, 'matk')) * RV(D, 'rune21', 0, 2, u));
          rq(e, 'rune21', function (r) { if (u.dead) return false; var hitT = foes(u).filter(function (q) { return !banished(q) }); r.txt = u.name + ' 的「啟示之書」：魔力幽界波對全體敵人造成 ' + wv + ' 真實傷害'; trueAll(u, wv, r, '啟示之書'); fxOn(r, 'tome', u, hitT); r.tome = [u.side, u.i, 0, need] }) }
      }
      e.hp = hpSnap();
    }
    /* 鷹之勇氣、命運之輪：在反應技演完之後才追加 */
    function afterExtra(u, sk, tg, e) {
      if (u.dead || !u.runes.length || !foes(u).length) return;
      var dealt = (e._dealt || 0) > 0;
      if (dealt && u.runes.indexOf('rune19') >= 0 && RND() < RV(D, 'rune19', 0, 0.3, u)) {
        var t2 = tg.filter(function (x) { return !x.dead }); if (!t2.length) t2 = pickTargets(u, sk, false, false);
        if (t2.length) { var e2 = line({ side: u.side, a: u.i, sk: sk.id, ty: sk.ty, txt: u.name + ' 的「鷹之勇氣」再次使用「' + sk.n + '」' }); doSkill(u, sk, t2, e2); flushSt(e2); afterSkill(u, sk, t2, e2, true); flushRel(e2) }
      }
      if (sk.id !== 'atk' && u.runes.indexOf('rune20') >= 0 && u.learned && u.learned.length && RND() < RV(D, 'rune20', 0, 0.5, u) && !u.dead && foes(u).length) {
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
    function canUse(u, sk) { if (sk && sk.kind === 'ultimate') return (u.ug | 0) >= 100; return sk && (sk.id === 'atk' || (cdOf(u, sk.id) <= 0 && (u.sp | 0) >= (sk.sp | 0) && (sk.t !== 'ally_dead' || (u.side === 'p' ? P : M).some(function (x) { return x.dead && !x.summoned })))) }
    /* 手動選目標：單體技能可以點的對象（嘲諷中只能打嘲諷者）；群體回傳整組 */
    function cands(u, id) { var sk = D.SK[id] || D.SK.atk, t = sk.t;
      if (t === 'enemy_single') { var c = targetable(foes(u), sk), tn = c.filter(function (x) { return has(x, 'taunt') }); return tn.length ? tn : c }
      if (t === 'ally_single') return friends(u);
      if (t === 'ally_dead') return (u.side === 'p' ? P : M).filter(function (x) { return x.dead && !x.summoned });
      return pickTargets(u, sk, false, false) }
    function endAct(u, sk) {
      var X = u._xtra; u._xtra = false; /* 翠嵐順風的額外行動：冷卻、狀態回合都不扣 */
      if (SPM && u.cd && !X) Object.keys(u.cd).forEach(function (k) { if (u.cd[k] > 0) u.cd[k]-- });
      u.st.forEach(function (s) {
        if (s.paused || s.banish || s.swal) return;
        if (s.turns === 'attack') { if (sk && sk.ty === 'damage') s.turns = 0; return }
        if (X) return;
        if (s.fresh) { s.fresh = false; return }
        s.turns--;
      });
      if (sk && sk.ty === 'damage') u.st.forEach(function (s) { if (s.rows.some(function (r) { return r.k === 'sure_crit_next' })) s.turns = 0 });
      u.st = u.st.filter(function (s) { return s.banish || s.swal || s.paused || s.turns === 'attack' || s.turns > 0 }); mhpSync(u);
      nowAct = null;
      if (u.side === 'm' && !u.dead) digest(u);
    }
    /* 吞噬者每次行動結束：消化肚子裡的人（最大生命 × 被吞噬的 value，不吃減傷） */
    function digest(u) {
      P.forEach(function (x) {
        var q = x.st.filter(function (s) { return s.swal && s.src === u })[0]; if (!q || x.dead) return;
        var r0 = q.rows.filter(function (r) { return r.k === 'swallow' })[0], amt = Math.max(1, Math.round(x.b.mhp * (r0 ? r0.v : 0.05)));
        x.hp -= amt; var e = line({ side: x.side, a: x.i, txt: x.name + ' 被 ' + u.name + ' 消化了 ' + amt + ' 生命', tick: 1 }); numAdd(x, amt, 't'); addStat(e, x, 'taken', amt, u.name + ' 消化');
        if (checkDeath(x, e)) e.txt += '，被消化殆盡';
        e.hp = hpSnap();
      });
    }
    function protectorFor(t, a) {
      var TM = t.side === 'p' ? P : M; /* 雙方都適用（怪物的守護誓言也能替同伴擋） */
      var pr = TM.filter(function (x) { return x !== t && !x.dead && !x.undead && x.st.some(function (s) { return !s.paused && s.rows.some(function (r) { return r.k === 'protect' }) }) });
      return pr.length ? pickOne(pr) : null;
    }

    function doSkill(u, sk, tg, e) {
      if (sk.id === 'atk' && u.atkM) { var mk2 = {}; Object.keys(sk).forEach(function (k) { mk2[k] = sk[k] }); mk2.parts = sk.parts.map(function (q) { return { d: 'm', e: u.atkE || q.e, r: q.r } }); sk = mk2 }
      var effs = D.EFF[sk.id] || [], parts = [];
      var charmed = ctrl(u, 'charm');
      var bonus = {}; effs.forEach(function (r) { if (r.effect_kind === 'bonus') bonus[r.effect] = r });
      /* 代價（奉獻詩歌） */
      var sac = 0; effs.forEach(function (r) { if (r.effect_kind === 'cost' && r.effect === 'hp_cur') { sac = Math.max(0, Math.min(Math.floor(u.hp * num(r.value)), Math.ceil(u.hp) - 1)); u.hp -= sac; e.txt += '，犧牲 ' + sac + ' 生命'; if (sac > 0) onHurt(u) } /* 不會扣死；算受到傷害（觸發精通） */ });
      if (sk.ty === 'damage') {
        var single = sk.t === 'enemy_single' && !hooks.area, H = sk.hits || 1, perT = {}, order = [], totalDmg = 0, anyCrit = false, hitList = [];
        var each = sk.p === 'random_each' && H > 1;
        /* 這一招打倒過的目標（之後被先祖之鄉、神恩、骨堆、魂火救回來也一樣）：剩下的段數不再打他；
           單體技能就改打別的敵人，沒有別人就停 */
        var downed = [], rt = false, pool = function () { var c = targetable(charmed ? friends(u).filter(function (x) { return x !== u }) : foes(u), sk); if (hooks.pool) { var pl = hooks.pool; c = c.filter(function (x) { return pl.indexOf(x) >= 0 }) } return c.filter(function (x) { return downed.indexOf(x) < 0 }) }, down = function (t) { if (t.hp <= 0 && downed.indexOf(t) < 0) downed.push(t) };
        /* 先上的狀態（精靈真儀：先附加四屬詛咒再打） */
        effs.forEach(function (r) { if (r.effect_kind === 'status' && r.condition === 'before') tg.forEach(function (t) { if (!t.dead && t.side !== u.side) applyStatus(u, t, r.status_name, r.turns, r.apply_chance, e) }) });
        /* 精靈共鳴：施放前身上有的光球 → 這招該屬性 +40%；整招結束後，出現過的屬性：有光球就消耗，沒有就產生（要有元素共鳴被動） */
        var orbSk = u.side === 'p' && sk.id !== 'atk' && (sk.kind === 'combat' || sk.kind === 'ultimate'), elSeen = {};
        if (orbSk) { u._ebst = {}; EL4.forEach(function (el) { var os = u.st.filter(function (q) { return q.n === ORB[el] && !q.paused })[0]; if (os) u._ebst[el] = (os.rows.filter(function (q) { return q.k === 'elem_orb' })[0] || {}).v || 0.4 }) }
        var split = !!bonus.split_parts; if (split) H = sk.parts.length; /* 精靈真儀：每段各自一下（各自暴擊、各自跳數字） */
        e.hel = []; var preM = u.side === 'p' ? foes(u).filter(function (t) { return preyV(t, u) > 0 }) : [];
        for (var h = 0; h < H; h++) {
          if (h > 0 && (u.dead || u.undead)) break;
          var hP = split ? [sk.parts[h]] : sk.parts, hEl = '';
          if (sk.rand4) { hEl = pickOne(EL4); hP = sk.parts.map(function (q) { return { d: q.d, e: q.e === 'rand4' ? hEl : q.e, r: q.r } }) } else hEl = (hP.filter(function (q) { return EL4.indexOf(q.e) >= 0 })[0] || {}).e || '';
 /* 出手途中被反擊打倒（變成骨堆）就不再繼續打 */
          var list = each ? (function () { var c = pool(); return c.length ? [pickOne(c)] : [] })() : tg.filter(function (x) { return !x.dead && downed.indexOf(x) < 0 });
          if (!each && !list.length && downed.length && single) { var c2 = pool(); if (c2.length) { tg = [pickOne(c2)]; list = tg; rt = true } } /* 單體：原本的目標倒下了，剩下的段數打別人 */
          if (!list.length) break;
          e.hel.push(hEl); hP.forEach(function (q) { if (EL4.indexOf(q.e) >= 0) elSeen[q.e] = 1 }); /* 真的有打出去的段才算出現過（目標全倒就不算） */
          list.forEach(function (t0) {
            var t = t0, pr = single ? (hooks.protector ? hooks.protector(t0, u) : protectorFor(t0, u)) : null; if (pr) t = pr;
            if (!perT[t.i + t.side]) { perT[t.i + t.side] = { t: t, hs: [], nm: t.name }; order.push(t) }
            hitList.push(t);
            var mult = 1, xc = 0, sc = false;
            if (bonus.dmg_per_debuff) mult += Math.min(debuffs(t).length * num(bonus.dmg_per_debuff.value), num(String(bonus.dmg_per_debuff.condition || '').replace('max', '')) || 9);
            if (bonus.dmg_if_low_hp && t.hp / t.b.mhp < (num(bonus.dmg_if_low_hp.condition) || 0.5)) mult += num(bonus.dmg_if_low_hp.value);
            if (bonus.crit_if_debuffed && debuffs(t).length) xc += num(bonus.crit_if_debuffed.value);
            if (bonus.sure_crit_low_hp && t.hp / t.b.mhp < (num(bonus.sure_crit_low_hp.value) || 0.3)) sc = true;
            if (u.mst && u.mst.dmg_vs_debuffed && debuffs(t).length) mult += u.mst.dmg_vs_debuffed.v; /* 審判之眼 */
            var pvT = u.side === 'p' ? preyV(t, u) : 0; mult += pvT; /* 獵物標記 +15% */
            if (bonus.wind_stack_dmg) mult += Math.min(windN(u) * num(bonus.wind_stack_dmg.value), num(bonus.wind_stack_dmg.condition) || 9) / ((sk.parts[0] || {}).r || 1); /* 風靈驟雨：每層風勢倍率 +0.1 */
            if (u.mst && u.mst.dmg_vs_low && t.hp / t.b.mhp < (u.mst.dmg_vs_low.v2 || 0.4)) mult += u.mst.dmg_vs_low.v; /* 致命要害 */
            var x = dmgOnce(u, t, hP, sk, { mult: mult, extraCrit: xc, sureCrit: sc, resPierce: bonus.res_pierce ? num(bonus.res_pierce.value) : 0, redPierce: bonus.red_pierce ? num(bonus.red_pierce.value) : 0, resIgnore: !!bonus.res_ignore, hitAdd: pvT ? 0.1 : 0 }); /* res_pierce：計算時視為目標屬性抗性少 value（極光女神之寬恕） */
            var rec = perT[t.i + t.side];
            if (x.void) { rec.hs.push('無效'); numAdd(t, 0, 'void', { h: h }); return }
            if (x.miss) { rec.hs.push('閃開'); numAdd(t, 0, 'miss', { h: h }); return }
            if (x.blocked) { rec.hs.push('擋下'); numAdd(t, 0, 'block', { h: h }); reactPost(t, u, x.re, e); return }
            /* 聖堂守勢（hit_block）：每一段傷害碎一面盾、整下擋掉；盾碎完狀態就結束（持續傷害不走這裡，照扣） */
            var hbS = x.amt > 0 ? t.st.filter(function (q) { return !q.paused && q.hb > 0 })[0] : null;
            if (hbS) { hbS.hb--; rec.hs.push('擋下'); numAdd(t, 0, 'block', { h: h }); (e.hbk = e.hbk || []).push([t.side, t.i, h || 0]); if (hbS.hb <= 0) t.st = t.st.filter(function (q) { return q !== hbS }); return }
            rec.ok = true;
            /* 跳字：主屬性 = 倍率最高的那一段（混合傷害只跳一個總數） */
            var mp0 = hP.reduce(function (a, b) { return b.r > a.r ? b : a }, hP[0] || { d: 'p', e: '' });
            NC = { el: mp0.e || '', dt: mp0.d, c: x.crit, h: h };
            if (x.amt > 0 && t.side !== u.side) { var ob8 = obsOf(t); if (ob8) { var obv = (ob8.rows.filter(function (q) { return q.k === 'obsidian' })[0] || {}).v || 0.2; x.amt = Math.max(1, Math.round(x.amt * (1 - obv))); obsUse(t, ob8); (e._x = e._x || []).push(t.name + ' 的「' + ob8.n + '」減輕傷害（剩 ' + Math.max(0, ob8.obs) + ' 顆）') } } /* 黑曜七星：每受一次傷害消耗一顆，該次傷害 −20% */
            var real = x.amt ? hurt(t, x.amt, u) : 0; totalDmg += real; if (x.crit) anyCrit = true;
            if (real > 0 && !u.dead && t.side !== u.side) bstOnHurt(t, u, real, e);
            if (real > 0 && !t.dead) u.special.forEach(function (s) { if (s.k === 'apply_status' && s.tr === 'hit_dealt' && RND() < s.ch) applyStatus(u, t, s.st, s.turns, 1, e) }); /* 焰軀：每次打出傷害，對那個目標各自擲機率 */
            /* 武器淬毒：該次傷害的一定比例，額外的屬性傷害 */
            /* 職業精通：光明（追加主傷害一定比例的光明傷害）、獵人印記（機率讓目標識破） */
            if (u.mst && u.mst.light_add && real > 0 && !t.dead) { var lx = Math.round(real * u.mst.light_add.v * (1 - Math.min(resOf(t, 'light'), 0.9))); if (lx > 0) { NC = { el: 'light', dt: 'm', h: h }; var lr = hurt(t, lx, u); real += lr; totalDmg += lr } }
            if (u.mst && u.mst.mark_on_hit && u.mst.mark_on_hit.st && real > 0 && !t.dead && RND() < u.mst.mark_on_hit.ch) applyStatus(u, t, u.mst.mark_on_hit.st, u.mst.mark_on_hit.turns, 1, e);
            u.special.forEach(function (s) { if (s.k === 'extra_dmg' && real > 0 && !t.dead) { var ex = Math.round(real * s.v * (1 - Math.min(resOf(t, s.el), 0.9))); if (ex > 0) { NC = { el: s.el, dt: 'm', h: h }; real += hurt(t, ex, u); totalDmg += ex } } });
            /* 元素符文：主傷害（減傷後實際傷害）的 30% 屬性傷害，類型跟著技能（物理／魔法／混合），再吃該元素抗性；
               數字現在就算好，等這一招結束後才獨立一行結算、演出，並附加該符文的狀態 */
            var elx = 0, dtp = (sk.parts.some(function (x) { return x.d === 'p' }) ? 'p' : '') + (sk.parts.some(function (x) { return x.d === 'm' }) ? 'm' : '');
            [['rune01', 'fire'], ['rune02', 'frost'], ['rune03', 'lightning'], ['rune04', 'wind']].forEach(function (q) { if (u.runes.indexOf(q[0]) >= 0 && real > 0) { var ex = Math.round(real * RV(D, q[0], 0, 0.3, u) * (1 - Math.min(resOf(t, q[1]), 0.9))); if (ex > 0) { elx += ex; totalDmg += ex; (e._rn = e._rn || []).push({ rid: q[0], elx: 1, el: q[1], dt: dtp, u: u, t: t, amt: ex }) } } });
            if (u.runes.indexOf('rune12') >= 0 && debuffs(t).length && real > 0) { var cr = Math.round((real + elx) * RV(D, 'rune12', 0, 0.5, u)); NC = { tr: 1, h: h }; real += hurt(t, cr, u); totalDmg += cr }
            rec.hs.push((x.crit ? '暴擊 ' : '') + real + (x.absorbed ? '（吸收 ' + x.absorbed + '）' : ''));
            /* 水之幽暗：每次暴擊，對隨機一名敵人造成物攻、魔攻較高者 200% 的黑暗魔法傷害（不再暴擊、不連鎖） */
            if (x.crit && u.runes.indexOf('rune25') >= 0 && (e._w25 = e._w25 || []).indexOf(t) < 0) { e._w25.push(t); /* 同一招對同一個目標暴擊多次，水之幽暗只觸發一次 */ var fs = foes(u).filter(function (q) { return !banished(q) }); if (fs.length) { var wt = pickOne(fs), wa = Math.round(Math.max(stat(u, 'patk'), stat(u, 'matk')) * RV(D, 'rune25', 0, 2, u) * (1 + stat(u, 'mdmg')) * (1 - Math.min(stat(wt, 'mred'), 0.9)) * (1 - Math.min(resOf(wt, 'dark'), 0.9))); wa = Math.max(1, wa); totalDmg += wa;
              rq(e, 'rune25', function (r) { if (wt.dead || u.dead) return false; NC = { el: 'dark', dt: 'm' }; var wr = hurt(wt, wa, u); addStat(r, u, 'dmg', wr, '水之幽暗'); addStat(r, wt, 'taken', wr, u.name + ' 水之幽暗'); r.txt = u.name + ' 的「水之幽暗」：' + wt.name + ' 受到 ' + wr + ' 黑暗傷害'; fxOn(r, 'drown', u, [wt]); checkDeath(wt, r) }) } }
            addStat(e, u, 'dmg', real, sk.n); addStat(e, t, 'taken', real, u.name + ' ' + sk.n);
            /* 擴散（skill_effect 的 bonus / splash）：其他敵方各受到主目標「減傷前」傷害的 value 倍，再吃各自的減傷；
               跟著主目標的暴擊，主目標閃開就不擴散；擴散本身不能閃避、不觸發反應與符文 */
            if (bonus.splash && x.amt > 0) {
              var spP = sk.parts[0] && sk.parts[0].d === 'm', spBase = x.amt / Math.max(0.1, (1 - Math.min(stat(t, spP ? 'mred' : 'pred'), 0.9)) * (1 - Math.min(resOf(t, ''), 0.9)));
              foes(u).filter(function (q) { return q !== t && !q.dead && !banished(q) }).forEach(function (q) {
                var sa = Math.max(1, Math.round(spBase * num(bonus.splash.value) * (1 - Math.min(stat(q, spP ? 'mred' : 'pred'), 0.9)) * (1 - Math.min(resOf(q, ''), 0.9))));
                NC = { el: mp0.e || '', dt: mp0.d, c: x.crit, h: h, spl: 1 }; var sr = hurt(q, sa, u); totalDmg += sr; addStat(e, u, 'dmg', sr, sk.n + '（擴散）'); addStat(e, q, 'taken', sr, u.name + ' ' + sk.n + '（擴散）');
                (e._x = e._x || []).push('擴散 → ' + q.name + ' ' + sr); (e.spl = e.spl || []).push([q.side, q.i]); down(q); checkDeath(q, e);
              });
            }
            /* 焚身火焰（怪物被動 burn_splash）：單體攻擊每一下命中，其他敵人各受到「減傷前」傷害 ×v 的屬性傷害，再吃各自的減傷、抗性；濺射不能閃避、不觸發反應 */
            if (x.amt > 0 && sk.t === 'enemy_single' && u.special) u.special.forEach(function (bs) { if (bs.k !== 'burn_splash') return;
              var bM = (bs.dt || 'm') === 'm', bBase = x.amt / Math.max(0.1, (1 - Math.min(stat(t, hasMag(sk) ? 'mred' : 'pred'), 0.9)) * (1 - Math.min(resOf(t, mp0.e || ''), 0.9))), bnm = D.SK[bs.id] ? D.SK[bs.id].n : '焚身火焰';
              foes(u).filter(function (q) { return q !== t && !q.dead && !banished(q) }).forEach(function (q) {
                var ba = Math.max(1, Math.round(bBase * bs.v * (1 - Math.min(stat(q, bM ? 'mred' : 'pred'), 0.9)) * (1 - Math.min(resOf(q, bs.el || ''), 0.9))));
                NC = { el: bs.el || '', dt: bM ? 'm' : 'p', h: h, spl: 1 }; var br = hurt(q, ba, u); totalDmg += br; addStat(e, u, 'dmg', br, bnm); addStat(e, q, 'taken', br, u.name + ' ' + bnm);
                (e._x = e._x || []).push(bnm + ' → ' + q.name + ' ' + br); (e.bspl = e.bspl || []).push([q.side, q.i]); down(q); checkDeath(q, e) }) });
            /* 荊棘之皇冠：排進反應佇列，敵人整招結束後才反彈（腳下荊棘光環） */
            /* 霜甲：被打就用施加者的魔攻反擊冰霜魔法傷害（吃攻擊者的魔法減傷、冰霜抗性；施加者倒下就不反擊） */
            t.st.forEach(function (s) { if (s.paused || !s.src || s.src.dead || s.src.undead || !real || u.dead) return; s.rows.forEach(function (r) { if (r.k !== 'frost_thorn' && r.k !== 'fire_thorn') return; var fT = r.k === 'fire_thorn' /* 焰甲：照施放者物攻算、火焰物理 */, fa = Math.round(stat(s.src, fT ? 'patk' : 'matk') * r.v * (1 - Math.min(stat(u, fT ? 'pred' : 'mred'), 0.9)) * (1 - Math.min(resOf(u, fT ? 'fire' : 'frost'), 0.9))); if (fa > 0) (e._th = e._th || []).push({ d: t, a: u, amt: fa, fr: s.n, fire: fT }) }) });
            if (t.runes && t.runes.indexOf('rune11') >= 0 && real > 0 && !u.dead) (e._th = e._th || []).push({ d: t, a: u, amt: Math.round(real * RV(D, 'rune11', 0, 0.5, t)) });
            /* 震撼（怪物被動 thorns）：被物理攻擊打中時，以自己物攻 value 倍的真實傷害反彈；同一招只反彈一次（整招結束後才反彈） */
            if (t.special && real > 0 && !u.dead && t.side !== u.side && sk.parts.some(function (q) { return q.d === 'p' })) t.special.forEach(function (sp) { if (sp.k === 'thorns') { var tnm = D.SK[sp.id] ? D.SK[sp.id].n : '震撼'; e._th = e._th || []; if (!e._th.some(function (z) { return z.d === t && z.a === u && z.nm === tnm })) e._th.push({ d: t, a: u, amt: Math.round(stat(t, 'patk') * sp.v), nm: tnm }) } });
            /* 異形酸血：被任何攻擊打中（每一招只濺一次），對攻擊者濺出自身物攻 ×v 的屬性物理傷害，並疊一層酸蝕；整招結束後才結算 */
            if (t.special && real > 0 && !u.dead && t.side !== u.side) t.special.forEach(function (sp) { if (sp.k !== 'acid_blood') return; var anm = D.SK[sp.id] ? D.SK[sp.id].n : '異形酸血'; e._th = e._th || []; if (e._th.some(function (z) { return z.d === t && z.a === u && z.nm === anm })) return;
              var aM = sp.dt === 'm', aa = Math.max(1, Math.round(stat(t, aM ? 'matk' : 'patk') * sp.v * (1 - Math.min(stat(u, aM ? 'mred' : 'pred'), 0.9)) * (1 - Math.min(resOf(u, sp.el || ''), 0.9)))); e._th.push({ d: t, a: u, amt: aa, nm: anm, el: sp.el, st: sp.st, turns: sp.turns, acid: 1 }) });
            /* 被打中時觸發的被動（輝煌龍的神恩寵兒：機率讓攻擊者陷入魅惑） */
            if (t.special && real > 0 && !t.dead && t.side !== u.side) t.special.forEach(function (sp) { if (sp.k === 'hurt_stack' && sp.tr === 'hit_taken') { var mx0 = parseInt(sp.cond, 10) || 5; if ((t.hstk | 0) < mx0) { t.hstk = (t.hstk | 0) + 1; t.hstkV = sp.v; (e._x = e._x || []).push(t.name + ' 的「' + (D.SK[sp.id] ? D.SK[sp.id].n : '苦修') + '」' + t.hstk + ' 層') } } }); /* 苦修：每受一次傷害物攻 +v，最多 condition 層 */
            if (t.special && real > 0 && !u.dead && t.side !== u.side) t.special.forEach(function (sp) { if (sp.k === 'apply_status' && sp.tr === 'hit_taken' && sp.tg !== 'self' && !u.dead && (!sp.dt || (sp.dt === 'm') === hasMag(sk)) /* dmg_type = p：只有物理攻擊會觸發（腐化鐵甲） */ && RND() < sp.ch && applyStatus(t, u, sp.st, sp.turns, 1, null)) { (e._x = e._x || []).push(t.name + ' 的「' + (D.SK[sp.id] ? D.SK[sp.id].n : '被動') + '」讓 ' + u.name + ' 陷入「' + sp.st + '」'); (e.dringA = e.dringA || []).push([u.side, u.i]) } });
            if (t.special && real > 0 && !t.dead && t.side !== u.side) t.special.forEach(function (sp) { if (sp.k === 'apply_status' && sp.tr === 'hit_taken' && sp.tg === 'self' && RND() < sp.ch && applyStatus(t, t, sp.st, sp.turns, 1, null)) (e._x = e._x || []).push(t.name + ' 的「' + (D.SK[sp.id] ? D.SK[sp.id].n : '被動') + '」：獲得「' + sp.st + '」') }); /* 風靈榮甲：被打中時機率給自己上狀態 */
            if (t.runes && t.runes.indexOf('rune23') >= 0 && real > 0 && !u.dead && RND() < RV(D, 'rune23', 0, 0.2, t)) (function (t, u) { rq(e, 'rune23', function (r) { if (t.dead || u.dead || !applyStatus(t, u, '石化', RV(D, 'rune23', 1, 5, t), 1, null)) return false; r.txt = t.name + ' 的「石之正義」：' + u.name + ' 被石化 ' + RV(D, 'rune23', 1, 5, t) + ' 回合'; fxOn(r, 'stone', t, [u]) }) })(t, u);
            if (u.runes.indexOf('rune13') >= 0 && real > 0 && RND() < RV(D, 'rune13', 0, 0.3, u)) { var dbs = Object.keys(D.STS).filter(function (n) { return D.STS[n].pol === 'debuff' && !D.STS[n].rows.some(function (r) { return r.k === 'banish' || r.k === 'charm' || r.k === 'petrify' || r.k === 'swallow' }) }); var dn = pickOne(dbs); (function (t) { rq(e, 'rune13', function (r) { if (t.dead || !applyStatus(u, t, dn, RV(D, 'rune13', 1, 3, u), 1, null)) return false; r.txt = u.name + ' 的「夢靨之預兆」：' + t.name + ' 陷入「' + dn + '」' + RV(D, 'rune13', 1, 3, u) + ' 回合'; fxOn(r, 'nm', u, [t]) }) })(t) }
            /* 每一下附加的狀態 */
            /* 奪取 SP（屍爪）：命中後擲 apply_chance，成功就讓被打的我方角色少 value 點 SP（最低 0） */
            effs.forEach(function (r) { if (r.effect_kind !== 'sp_drain' || !SPM || t.side !== 'p' || t.dead || (t.sp | 0) <= 0) return; var ch = String(r.apply_chance || '').trim() === '' ? 1 : num(r.apply_chance); if (RND() >= ch) return;
              var lost = Math.min(t.sp | 0, Math.max(1, num(r.value) || 1)); t.sp = (t.sp | 0) - lost; numAdd(t, -lost, 'sp', { h: h }); (e.spd = e.spd || []).push(t.i); (e._spk = e._spk || []).push(t.name + ' 被奪走 ' + lost + ' SP') });
            effs.forEach(function (r) { if (r.effect_kind === 'status' && r.condition === 'per_hit' && !t.dead) applyStatus(u, t, r.status_name, r.turns, r.apply_chance, null) });
            effs.forEach(function (r) { if (r.effect_kind === 'status' && r.condition === 'per_hit_el' && !t.dead && real > 0 && ELST[hEl]) applyStatus(u, t, ELST[hEl], r.turns, r.apply_chance, e) }); /* 混沌風暴：每一下照這一下的屬性附加狀態 */
            /* 即死（死之敕命）：每次命中判定，對首領無效；倒下時照常可以被先祖之鄉、神恩救回 */
            if (!t.dead && t.hp > 0 && !t.boss && real > 0) effs.forEach(function (r) { if (r.effect_kind === 'instakill' && !t.dead && t.hp > 0 && RND() < (num(r.apply_chance) || 0)) { t.hp = 0; (e._x = e._x || []).push(t.name + ' 被「' + sk.n + '」即死') } });
            reactPost(t, u, x.re, e);
            down(t); checkDeath(t, e);
          });
        }
        if (orbSk) { var hadB = u._ebst; delete u._ebst; var useO = [], newO = [];
          Object.keys(elSeen).forEach(function (el) { if (hadB[el] != null) { var os = u.st.filter(function (q) { return q.n === ORB[el] })[0]; if (os) { removeStatus(u, os); useO.push(ORB[el]) } } else if (u.special.some(function (x) { return x.k === 'elem_orb' }) && !u.dead && applyStatus(u, u, ORB[el], 6, 1, null)) newO.push(ORB[el]) });
          if (useO.length) (e._x = e._x || []).push('消耗' + useO.map(function (n) { return '「' + n + '」' }).join('')); if (newO.length) (e._x = e._x || []).push('獲得' + newO.map(function (n) { return '「' + n + '」' }).join('')); e.orbU = useO; e.orbN = newO }
        huntPost(u, order.filter(function (t) { return perT[t.i + t.side].ok && t.side !== u.side }), preM, anyCrit, e);
        e.tg = order.filter(function (t) { return t.side === 'm' }).map(function (t) { return t.i });
        e.tgP = order.filter(function (t) { return t.side === 'p' }).map(function (t) { return t.i });
        e.hitsN = hitList.length; e.tgh = each || rt ? hitList.filter(function (t) { return t.side === 'm' }).map(function (t) { return t.i }) : null; e.tghP = each || rt ? hitList.filter(function (t) { return t.side === 'p' }).map(function (t) { return t.i }) : null;
        e._dealt = (e._dealt || 0) + totalDmg;
        e.txt += ' → ' + order.map(function (t) { var hs = perT[t.i + t.side].hs, tn = perT[t.i + t.side].nm || t.name; return H > 1 ? tn + ' 受到 ' + hs.join('、') + ' 傷害' : (hs[0] === '閃開' ? tn + ' 閃開了' : hs[0] === '擋下' ? tn + ' 擋下了' : hs[0] === '無效' ? tn + ' 不受影響' : tn + (/^暴擊/.test(hs[0]) ? ' 暴擊！受到 ' + hs[0].slice(3) : ' 受到 ' + hs[0]) + ' 傷害') }).join('，');
        if (e._x) { e.txt += '（' + e._x.join('，') + '）'; delete e._x }
        /* 吸血 */
        var ls = sv(u, 'lifesteal') + auraVal(u, 'lifesteal') + (u.runes.indexOf('rune10') >= 0 ? RV(D, 'rune10', 0, 0.25, u) : 0); u.special.forEach(function (s) { if (s.k === 'lifesteal') ls += s.v }); if (bonus.lifesteal) ls += num(bonus.lifesteal.value); /* 單一技能自帶吸血（噬咬） */
        if (ls > 0 && totalDmg > 0 && !u.dead) { NC = { ls: 1 }; var g = heal(u, u.owner || u, totalDmg * ls, null, true); if (g) { e.txt += '，吸收 ' + g + ' 生命'; addStat(e, u, 'heal', g, '吸血'); e.ls = 1 /* 畫面：血氣從被打的人流回攻擊者 */ } }
        /* 熊之力量：濺射 */
        if (u.runes.indexOf('rune22') >= 0 && totalDmg > 0) { var bAmt = Math.round(totalDmg * RV(D, 'rune22', 0, 0.3, u));
          rq(e, 'rune22', function (r) { var hitT = []; foes(u).forEach(function (t) { if (banished(t)) return; var sp = hurt(t, bAmt, u); addStat(r, u, 'dmg', sp, '熊之力量'); addStat(r, t, 'taken', sp, u.name + ' 熊之力量'); if (sp > 0) hitT.push(t); checkDeath(t, r) }); if (!hitT.length) return false; r.txt = u.name + ' 的「熊之力量」：' + hitT.length + ' 個敵人各受到 ' + bAmt + ' 真實傷害'; fxOn(r, 'bear', u, hitT) }) }
        /* 舞台魅力等「攻擊時」觸發 */
        u.special.forEach(function (s) { if (s.k === 'apply_status' && s.tr === 'attack' && order.length && RND() < s.ch) { var cand = order.filter(function (t) { return !t.dead && !(s.cond === 'not_boss' && t.boss) && t.side !== u.side }); if (cand.length) applyStatus(u, pickOne(cand), s.st, s.turns, 1, e) } });
        /* 一般狀態（每個目標擲一次） */
        effs.forEach(function (r) {
          if (r.effect_kind !== 'status' || r.condition === 'per_hit' || r.condition === 'per_hit_el' || r.condition === 'before') return;
          var sn = r.status_name; if (u.owner && /^phys:/.test(r.condition || '') && !u.hiM) sn = String(r.condition).slice(5); /* 幻獸：物攻較高時換成物理版的狀態（森羅角擊的猛毒） */
          if (r.target === 'self') { var su = u.owner || u; applyStatus(su, su, sn, r.turns, r.apply_chance, e) }/* 幻獸的招：加在主人身上 */
          else if (r.target === 'ally_all') friends(u).forEach(function (f) { applyStatus(u, f, sn, r.turns, r.apply_chance, e) }); /* 傷害技順便替自己全隊上增益（神聖輝煌） */
          else order.forEach(function (t) { if (!t.dead && perT[t.i + t.side].ok && t.side !== u.side && !(r.condition === 'not_boss' && t.boss)) applyStatus(u, t, sn, r.condition === 'boss_half' && t.boss ? Math.max(1, Math.floor((parseInt(r.turns, 10) || 1) / 2)) : r.turns, r.apply_chance, e) }); /* boss_half：對王回合減半（冰川尖刺） */
        });
        /* 霜刃術：攻擊時每個被打中的目標各擲一次凍結 */
        var fzv = sv(u, 'freeze_on_hit'); if (fzv > 0) order.forEach(function (t) { if (!t.dead && perT[t.i + t.side].ok && t.side !== u.side) applyStatus(u, t, '凍結', 1, fzv, e) });
        /* 驅散敵人的增益（翠光破邪全部、晨曦星雨 1 個） */
        effs.forEach(function (r) { if (r.effect_kind !== 'dispel') return; var dn = num(r.value) || 99;
          order.forEach(function (t) { if (t.dead || !perT[t.i + t.side].ok || t.side === u.side) return; var bf = t.st.filter(function (q) { return q.pol === 'buff' && !q.rows.some(function (r) { return r.k === 'no_dispel' }) && !q.paused && !q.banish && !q.swal && !q.air }).sort(function () { return RND() - 0.5 }).slice(0, dn);
            bf.forEach(function (q) { removeStatus(t, q) }); if (bf.length) (e._dsp = e._dsp || []).push('驅散 ' + t.name + ' 的' + bf.map(function (q) { return '「' + q.n + '」' }).join('')) }) });
        if (e._dsp) { e.txt += '，' + e._dsp.join('，'); delete e._dsp }
        /* 龍蛇亂舞：每咬中一個不同的敵人，主人 SP +1 */
        effs.forEach(function (r) { if (r.effect_kind !== 'sp_per_target' || !SPM) return; var o = u.owner || u; if (o.side !== 'p') return; var n1 = order.filter(function (t) { return t.side !== u.side && perT[t.i + t.side].ok }).length * (num(r.value) || 1), s1 = o.sp | 0; o.sp = Math.min(SPMAX, s1 + n1); if (o.sp > s1) { numAdd(o, o.sp - s1, 'sp'); e.txt += '，' + o.name + ' SP +' + (o.sp - s1) } });
        /* 星夜掠奪：偷走目標的攻擊力（目標較高的攻擊力 × value，最多主人較高攻擊力 × condition）加到主人身上 */
        effs.forEach(function (r) { if (r.effect_kind !== 'steal_atk') return; var o = u.owner || u, t = order.filter(function (q) { return !q.dead && q.side !== u.side && perT[q.i + q.side].ok })[0]; if (!t || o.dead) return;
          var ohi = Math.max(stat(o, 'patk'), stat(o, 'matk')) - sv(o, 'atk_flat'), amt = Math.round(Math.min(Math.max(stat(t, 'patk'), stat(t, 'matk')) * num(r.value), ohi * (num(r.condition) || 0.2))); if (amt <= 0) return;
          if (applyStatus(o, o, r.status_name, r.turns || 3, 1, e)) o.st.forEach(function (q) { if (q.n === r.status_name) q.rows.forEach(function (x) { if (x.k === 'atk_flat') x.v = amt }) }); e.txt += '，偷走 ' + amt + ' 攻擊力' });
      } else if (sk.ty === 'heal' && sk.t === 'ally_dead') {
        /* 復生術：復活一名陣亡隊友，恢復最大生命 × part1_ratio */
        tg.forEach(function (t) { if (!t.dead) return; t.dead = false; t.undead = null; revive(t, sk.parts[0] ? sk.parts[0].r : (num(sk.raw && sk.raw.part1_ratio) || 0.25) /* 幻獸森靈輝光只填比例沒填傷害類型 */, sk.n, null); e.txt += '，' + t.name + ' 復活了（' + t.hp + ' 生命）'; (e.rev = e.rev || []).push([t.side, t.i]) });
        e.hp = hpSnap();
      } else if (sk.ty === 'heal') {
        var amtList = [], tot = 0, cal = 0;
        tg.forEach(function (t) {
          var base = sk.parts[0] ? sk.parts[0].r : 0;
          if (base > 0) {
            var c = RND() < stat(u, 'crit'), v = stat(u, 'matk') * base * (1 + u.b.heal) * (c ? 1 + stat(u, 'cdmg') : 1);
            if (bonus.heal_if_hot && hasHot(t)) v *= 1 + num(bonus.heal_if_hot.value);
            cal += healCalc(t, v); var got = heal(u, t, v); tot += got; amtList.push(t.name + (got ? (c ? ' 暴擊！' : ' ') + '恢復 ' + got : ' 生命已滿')); addStat(e, u, 'heal', got, sk.n);
          }
        });
        if (amtList.length) e.txt += '，' + amtList.join('，');
        e.hl = tg.filter(function (t) { return t.side === 'p' }).map(function (t) { return t.i }); e.hlM = tg.filter(function (t) { return t.side === 'm' }).map(function (t) { return t.i });
        if (tot > 0 || cal > 0) echo(u, tot, e, cal);
        effs.forEach(function (r) {
          if (r.effect_kind === 'status') tg.forEach(function (t) { applyStatus(u, t, r.status_name, r.turns, r.apply_chance, e) });
          if (r.effect_kind === 'cleanse') tg.forEach(function (t) { var d = debuffs(t); d.forEach(function (s) { removeStatus(t, s) }); if (d.length) e.txt += '，清除 ' + t.name + ' 的 ' + d.map(function (s) { return '「' + s.n + '」' }).join('') });
        });
      } else {
        e.hl = tg.filter(function (t) { return t.side === 'p' }).map(function (t) { return t.i });
        effs.forEach(function (r) {
          /* 驅散（加狀態類技能也能帶，例：冰之守護）：value = 每人最多驅除幾個，空白 = 全部 */
          if (r.effect_kind === 'cleanse') { var cn = String(r.value).trim() === 'r1-2' ? 1 + Math.floor(RND() * 2) : num(r.value) || 99; tg.forEach(function (t) { var d = debuffs(t).filter(function (q) { return !q.swal && !q.banish }).sort(function () { return RND() - 0.5 }).slice(0, cn); /* 隨機挑要清的（慈樹春暉、星辰甘露） */ d.forEach(function (q) { removeStatus(t, q) }); if (d.length) e.txt += '，清除 ' + t.name + ' 的 ' + d.map(function (q) { return '「' + q.n + '」' }).join('') }); return }
          if (r.effect_kind !== 'status') return;
          var tgR = /^enemy/.test(r.target || '') && !/^enemy/.test(sk.t || '') ? foes(u).filter(function (x) { return !banished(x) }) : tg; /* 增益技順便對敵人上狀態（冠軍戰吼：恐懼） */
          tgR.forEach(function (t) { if (r.condition === 'not_boss' && t.boss) return; applyStatus(u, t, r.status_name, r.turns, r.apply_chance, e) });
        });
        if (sk.ty === 'debuff') { e.tg = tg.filter(function (t) { return t.side === 'm' }).map(function (t) { return t.i }); e.tgP = tg.filter(function (t) { return t.side === 'p' }).map(function (t) { return t.i }) }
      }
      /* 太陽之照耀：增益、治療技能施放後（治療技能走上面另一個分支，所以放在分支外面） */
      if ((sk.ty === 'buff' || sk.ty === 'heal') && u.runes.indexOf('rune14') >= 0 && D.STS['輝煌']) /* 太陽之照耀：施放增益或治療技能 */ rq(e, 'rune14', function (r) { if (u.dead || !applyStatus(u, u, '輝煌', RV(D, 'rune14', 1, 5, u), 1, null)) return false; var sv14 = RV(D, 'rune14', 0, 0.3, u); u.st.forEach(function (q) { if (q.n === '輝煌') q.rows.forEach(function (x) { if (x.k === 'str_rate' || x.k === 'int_rate') x.v = sv14 }) }); r.txt = u.name + ' 的「太陽之照耀」：獲得「輝煌」' + RV(D, 'rune14', 1, 5, u) + ' 回合（力量、智力 +' + Math.round(sv14 * 100) + '%）'; fxOn(r, 'sun', u, [u]) });
      /* 召喚：effect = 怪物 id，value = 上限；condition 填 all_monsters 時上限算「全場活著的怪」，空白則只算同種怪（深林叫喚）；
         apply_chance = 成功機率（空白 = 必定）。未滿且成功就叫一隻出來，下一回合開始行動 */
      /* 偽神救贖（redeem）：effect = 怪物 id、value = 場上上限、status_name = 給牠的祝福；沒滿就叫一隻並祝福，滿了改祝福生命最少的那隻並補 condition 比例的生命 */
      if (u.side === 'm') effs.forEach(function (r) {
        if (r.effect_kind !== 'redeem' || !D.mon[r.effect]) return; var al = M.filter(function (m) { return !m.dead && m.mid === r.effect });
        if (al.length < (num(r.value) || 4)) { var nu = spawnMon(u, r.effect); e.summon = (e.summon || []).concat(nu.i); e.redeem = [nu.i]; e.txt += '，召喚了 ' + nu.name; if (r.status_name && applyStatus(u, nu, r.status_name, r.turns || 3, 1, null)) e.txt += '，' + nu.name + ' 獲得「' + r.status_name + '」' }
        else { var lw = al.reduce(function (a, b) { return b.hp / b.b.mhp < a.hp / a.b.mhp ? b : a }); e.redeem = [lw.i]; if (r.status_name && applyStatus(u, lw, r.status_name, r.turns || 3, 1, null)) e.txt += '，' + lw.name + ' 獲得「' + r.status_name + '」'; var g = heal(u, lw, lw.b.mhp * (num(r.condition) || 0.2), null, true); if (g) e.txt += '，恢復 ' + g }
      });
      if (u.side === 'm') effs.forEach(function (r) { if (r.effect_kind !== 'sun') return; u.sun = { n: parseInt(r.turns, 10) || 3, v: num(r.value) || 0.3, nm: sk.n }; e.sunN = [u.i, u.sun.n]; e.txt += '，一顆魔日在敵陣上空燃起（' + u.sun.n + ' 回合）' }); /* 魔日映照：每回合開始燒敵方全體 */
      if (u.side === 'm') effs.forEach(function (r) {
        if (r.effect_kind !== 'summon') return; var smid = String(r.effect || '').indexOf(';') >= 0 ? pickOne(String(r.effect).split(';').map(function (x) { return x.trim() }).filter(function (x) { return D.mon[x] })) : r.effect; if (!smid || !D.mon[smid]) return; /* effect 可以填好幾隻（a;b;c）= 隨機叫其中一隻（諸神之暮） */
        var allM = String(r.condition || '').trim() === 'all_monsters';
        var aliveN = M.filter(function (m) { return !m.dead && (allM || m.mid === smid) }).length;
        if (aliveN >= (num(r.value) || 1)) { if (allM) e.txt += '，但場上已經滿了'; return }
        var ch = String(r.apply_chance || '').trim() === '' ? 1 : num(r.apply_chance);
        if (RND() >= ch) { e.txt += '，但沒有同伴回應'; return }
        var nu = monster(D.mon[smid], u.stg || 1, D); nu.b.mhp = Math.round(nu.b.mhp * (u.hs || 1)); nu.stg = u.stg; nu.hs = u.hs; if (u.as) { nu.b.patk = Math.round(nu.b.patk * u.as); nu.b.matk = Math.round(nu.b.matk * u.as); nu.as = u.as } /* 召喚物跟召喚者同樣的秘境倍率 */
        var same = M.filter(function (m) { return m.mid === smid }).length; nu.name += ' ' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.min(25, same)];
        nu.i = M.length; nu.hp = nu.b.mhp; nu.st = []; nu.cy = Math.floor(RND() * nu.cycle.length); nu.dead = false; nu.used = {}; nu.flags = {}; nu.dragon = 0; nu.summoned = true;
        M.push(nu); U.push(nu); e.summon = (e.summon || []).concat(nu.i); e.txt += '，召喚了 ' + nu.name;
      });
      /* 幻獸：主人 SP +n（value = 數字，或 r0-2 = 隨機 0～2）、主人技能冷卻歸零 */
      effs.forEach(function (r) { var o = u.owner || u;
        if (r.effect_kind === 'sp_gain' && SPM && o.side === 'p') { var n0 = String(r.value).trim() === 'r0-2' ? Math.floor(RND() * 3) : (num(r.value) | 0), s0 = o.sp | 0; o.sp = Math.min(SPMAX, s0 + n0); if (o.sp > s0) { numAdd(o, o.sp - s0, 'sp'); e.txt += '，' + o.name + ' SP +' + (o.sp - s0) } }
        if (r.effect_kind === 'cd_reset' && o.cd) { o.cd = {}; e.txt += '，' + o.name + ' 的技能冷卻歸零' }
        if (r.effect_kind === 'extra_turn' && o.side === 'p' && !o.dead) { if (o._xr !== rounds) { o._xr = rounds; o._again = true; e.txt += '，' + o.name + ' 立刻再行動一次' } else e.txt += '（這回合已經再行動過了）' } });
      NC = null; /* 額外治療列（生命脈衝、至高打擊、奉獻詩歌…）；target 填 target = 跟技能同一個目標（堅毅禱言、意志禱言） */
      effs.forEach(function (r) {
        if (r.effect_kind !== 'heal') return;
        var who = r.target === 'target' ? tg.filter(function (t) { return !t.dead && t.side === u.side }) : r.target === 'self' ? [u] : r.target === 'ally_all' ? friends(u) : r.target === 'ally_others' ? friends(u).filter(function (x) { return x !== u }) : r.target === 'ally_single' ? [choose(friends(u), r.condition || 'lowest_hp')] : [];
        var out = [], tot = 0, cal = 0;
        who.forEach(function (t) {
          if (!t) return;
          var v, c = false;
          if (r.base === 'sacrificed_hp') v = sac * num(r.value);
          else if (r.base === 'mhp') v = num(r.value) * t.b.mhp; /* 照目標最大生命的比例（褪皮），不擲暴擊 */
          else { c = RND() < stat(u, 'crit'); v = num(r.value) * (r.base === 'p_atk' ? stat(u, 'patk') : stat(u, 'matk')) * (1 + u.b.heal) * (c ? 1 + stat(u, 'cdmg') : 1) }
          cal += healCalc(t, v); var got = heal(u, t, v); tot += got; if (got) { out.push(t.name + (c ? ' 暴擊！' : ' ') + '恢復 ' + got); addStat(e, u, 'heal', got, sk.n) }
        });
        if (out.length) e.txt += '，' + out.join('，');
        if ((tot > 0 || cal > 0) && r.base !== 'sacrificed_hp') echo(u, tot, e, cal);
        e.hl = (e.hl || []).concat(who.filter(function (t) { return t && t.side === 'p' && (e.hl || []).indexOf(t.i) < 0 }).map(function (t) { return t.i }));
      });
      /* 鹿之守護、月之淨化：主動治療時 */
    }
    function echo(u, tot, e, cal) { if (cal == null) cal = tot; /* tot = 實際回復量（生命同調用），cal = 算出來的治療數字（鹿之守護、月之淨化用） */
      u.special.forEach(function (s) { if (s.k === 'heal_echo') { var g = heal(u, u, tot * s.v, null, true); if (g) { e.txt += '，' + u.name + ' 同調恢復 ' + g; addStat(e, u, 'heal', g, '生命同調') } } });
      if (u.runes.indexOf('rune16') >= 0 && D.STS['生命守護']) { applyStatus(u, u, '生命守護', 3, 1, null); var shv = 0; u.st.forEach(function (s) { if (s.n === '生命守護') { s.shield = Math.min(cal * RV(D, 'rune16', 0, 0.5, u), u.b.mhp * RV(D, 'rune16', 1, 0.3, u)); shv = s.shield } }); if (shv > 0) e.txt += '，鹿之守護：' + u.name + ' 獲得 ' + Math.round(shv) + ' 護盾' }
      if (u.runes.indexOf('rune15') >= 0) { var f = foes(u).filter(function (q) { return !banished(q) }); if (f.length) { var t = pickOne(f), mAmt = Math.round(cal * RV(D, 'rune15', 0, 0.5, u));
        rq(e, 'rune15', function (r) { if (t.dead || u.dead) return false; var d = hurt(t, mAmt, u); r.txt = u.name + ' 的「月之淨化」：' + t.name + ' 受到 ' + d + ' 真實傷害'; addStat(r, u, 'dmg', d, '月之淨化'); addStat(r, t, 'taken', d, u.name + ' 月之淨化'); fxOn(r, 'moon', u, [t]); checkDeath(t, r) }) } }
    }

    /* --- 主迴圈 --- */
    function alive(a) { return a.some(function (x) { return !x.dead && !swallowed(x) && !x.st.some(function (s) { return s.dcurse && !s.paused }) }) } /* 死之詛咒倒地的也不算還能戰鬥：全隊倒地＝全滅 */ /* 被吞的人不算還能戰鬥 */
    if (lone) line({ kind: 'note', idle: true, txt: P[0].name + ' 獨自上陣，進入「獨狼」狀態：生命、物理攻擊力、魔法攻擊力 ×1.5' });
    if (duo) line({ kind: 'note', idle: true, txt: P[0].name + ' 與 ' + P[1].name + ' 兩人同行，進入「雙人成行」狀態：兩人的生命、物理攻擊力、魔法攻擊力 ×1.5' });
    if (SPM) P.forEach(function (u) { if (u.mst && u.mst.sp_start) line({ kind: 'note', idle: true, txt: u.name + ' 的「' + u.mst.sp_start.n + '」：開場 SP +' + (u.mst.sp_start.v | 0) }) }); /* 職業精通加的 SP 都寫進戰報 */
    /* 新的一回合：回傳這回合的行動順序（速度高先動，加一點隨機讓同速的隨機排） */
    function round() {
      rounds++;
      flushBoom();
      var rl = line({ kind: 'round', txt: '— 第 ' + rounds + ' 回合 —' });
      if (SPM && rounds > 1) P.forEach(function (u) { if (!u.dead) u.sp = Math.min(SPMAX, (u.sp | 0) + 1) });
      if (SPM) rl.hp = hpSnap(); /* 回合開始回 SP 後馬上更新畫面上的 SP 點，免得跟實際可用的對不上 */
      /* 骨堆倒數：倒下的那回合不算，下一回合開始時還是滿的倒數，之後每回合開始減 1，到 0 滿血變回骨兵（3 = 整整當 3 回合骨堆） */
      M.forEach(function (u) { if (u.dead || !u.undead || u.undead.born >= rounds - 1) return; u.undead.n--;
        if (u.undead.n <= 0) { var o2 = u.name, bk = u.undead.back; delete u.undead; morph(u, bk); var rz = line({ side: 'm', a: u.i, txt: o2 + ' 重新組成了「' + u.name + '」！', tf: [u.i, u.sprite, u.name, 'rise'] }); rz.hp = hpSnap() }
        else { var cz = line({ side: 'm', a: u.i, idle: 1, txt: u.name + ' 的骨頭微微顫動……（倒數 ' + u.undead.n + '）', cd: [u.i, u.undead.n] }); cz.hp = hpSnap() } });
      /* 褻瀆之光（靈氣 regen_all）：每回合開始，持有者替全體同伴（含骨堆）恢復最大生命的一定比例 */
      M.forEach(function (src) { if (src.dead || src.undead) return; (src.aura || []).forEach(function (a) { if (a.k !== 'regen_all') return; var gl = [];
        M.forEach(function (q) { if (q.dead || q.hp >= q.b.mhp) return; var g = heal(src, q, q.b.mhp * a.v, null, true); if (g) gl.push(q.name + ' ' + g) });
        if (gl.length) { var hz = line({ side: 'm', a: src.i, idle: 1, txt: src.name + ' 的「' + (D.SK[a.id] ? D.SK[a.id].n : '靈氣') + '」：' + gl.join('、') + ' 恢復生命' }); hz.hp = hpSnap() } }) });
      /* 常駐狀態（被動 perm_status，例：冰霜元素的元素霜甲）：每回合開始，身上沒有就補上（第一回合等於開場就有） */
      M.forEach(function (u) { if (u.dead || u.undead) return; (u.special || []).forEach(function (sp) { if (sp.k !== 'perm_status' || !sp.st || u.st.some(function (s) { return s.n === sp.st })) return; applyStatus(u, u, sp.st, sp.turns || 99, 1, null) }) });
      /* 死靈威壓（被動 stun_all，trigger round_start）：每回合開始，每個敵人擲一次機率暈眩；上回合被這招暈過的人這回合不會再被暈 */
      M.forEach(function (src) { if (src.dead || src.undead) return; (src.special || []).forEach(function (sp) { if (sp.k !== 'stun_all') return; var hit = [];
        foes(src).forEach(function (q) { if (q.dead || banished(q) || q._dread === rounds - 1) return; if (RND() < sp.ch && applyStatus(src, q, sp.st || '暈眩', sp.turns || 1, 1, null)) { q._dread = rounds; hit.push(q) } });
        if (hit.length) { var dz = line({ side: 'm', a: src.i, idle: 1, dread: hit.filter(function (q) { return q.side === 'p' }).map(function (q) { return q.i }), dst: sp.st || '暈眩', txt: src.name + ' 的「' + (D.SK[sp.id] ? D.SK[sp.id].n : '威壓') + '」：' + hit.map(function (q) { return q.name }).join('、') + ' 陷入「' + (sp.st || '暈眩') + '」' }); dz.hp = hpSnap() } }) });
      /* 褻瀆光環（被動 curse_wave）：每回合開始一圈紅色氣浪掃過，每個敵人各有 v 機率中 condition 清單裡隨機一個負面狀態 */
      M.forEach(function (src) { if (src.dead || src.undead) return; (src.special || []).forEach(function (sp) { if (sp.k !== 'curse_wave') return; var L = String(sp.cond || '').split(';').map(function (x) { return x.trim() }).filter(function (x) { return D.STS[x] }), hit = [];
        foes(src).forEach(function (q) { if (q.dead || banished(q) || !L.length) return; if (RND() < sp.v) { var sn = pickOne(L); if (applyStatus(src, q, sn, sp.turns || 2, 1, null)) hit.push(q.name + ' 陷入「' + sn + '」') } });
        var wz = line({ side: 'm', a: src.i, idle: 1, cwave: 1, txt: src.name + ' 的「' + (D.SK[sp.id] ? D.SK[sp.id].n : '光環') + '」掃過全場' + (hit.length ? '：' + hit.join('、') : '') }); wz.hp = hpSnap() }) });
      /* 魔日映照：每回合開始，魔日燒敵方全體一次（施放者魔攻 ×v 的火焰魔法傷害），燒完回合數 −1 */
      M.forEach(function (src) { if (src.dead || !src.sun || src.sun.n <= 0) return; var tg = P.filter(function (q) { return !q.dead && !banished(q) }); if (!tg.length) return; var out = [], sr = line({ side: 'm', a: src.i, idle: 1, txt: '' });
        tg.forEach(function (q) { var amt = Math.max(1, Math.round(stat(src, 'matk') * src.sun.v * (1 + stat(src, 'mdmg')) * (1 - Math.min(stat(q, 'mred'), 0.9)) * (1 - Math.min(resOf(q, 'fire'), 0.9)))); NC = { el: 'fire', dt: 'm' }; var d = hurt(q, amt, src); addStat(sr, src, 'dmg', d, src.sun.nm); addStat(sr, q, 'taken', d, src.name + ' ' + src.sun.nm); out.push(q.name + ' ' + d); checkDeath(q, sr) });
        src.sun.n--; sr.sunB = [src.i, src.sun.n]; sr.txt = '魔日灼燒全隊：' + out.join('、') + ' 火焰傷害' + (src.sun.n > 0 ? '（還剩 ' + src.sun.n + ' 回合）' : '，魔日燃盡了'); flushRel(sr); sr.hp = hpSnap(); if (src.sun.n <= 0) src.sun = null });
      /* 墮天（被動 fall_stack）：每回合開始 ch 機率疊一層，物攻魔攻各 +v，最多 cond 層 */
      M.forEach(function (src) { if (src.dead || src.undead) return; (src.special || []).forEach(function (sp) { if (sp.k !== 'fall_stack') return; var mx = parseInt(sp.cond, 10) || 5; if ((src.fstk | 0) >= mx || RND() >= sp.ch) return; src.fstk = (src.fstk | 0) + 1; src.fstkV = sp.v;
        var fz = line({ side: 'm', a: src.i, idle: 1, fallen: 1, txt: src.name + ' 的「' + (D.SK[sp.id] ? D.SK[sp.id].n : '墮天') + '」加深了，傷害提升（' + src.fstk + ' 層）' }); fz.hp = hpSnap() }) });
      if (rounds > 1) U.forEach(function (u) { if (u.runes.indexOf('rune18') >= 0) u.dragon = Math.max(RV(D, 'rune18', 2, 0.2, u), u.dragon - RV(D, 'rune18', 1, 0.05, u)) });
      curOrder = U.filter(function (u) { return !u.dead && !u.undead }).map(function (u) { return { u: u, s: stat(u, 'speed') + RND() * 3 } })/* 骨堆不行動 */.sort(function (a, b) { return b.s - a.s }).map(function (x) { return x.u });
      P.forEach(function (u) { u._xtra = false; u._again = false });
      return curOrder;
    }
    /* 輪到 u 時先做的事（聖潔驅散），再 begin */
    function start(u) { if (u.undead) return false; /* 骨堆不行動 */ if (u.special.some(function (x) { return x.k === 'auto_cleanse' })) autoClean(u); return begin(u) }
    /* 戰棋的「待機」：有行動但不出手，狀態照常減一次 */
    /* 待機：有行動但不出手，狀態照常減一次；SP 制度下額外 +1 SP */
    function wait(u) { var e = u._e || line({ side: u.side, a: u.i, txt: '' }); delete u._e; nowAct = u; e.txt = u.name + ' 待機'; e.idle = 1;
      if (SPM && u.side === 'p') { var g0 = u.sp | 0; u.sp = Math.min(SPMAX, g0 + 1); e.txt += u.sp > g0 ? '，恢復 1 SP' : ''; e.wt = 1; if (u.sp > g0) numAdd(u, 1, 'sp') }
      endAct(u, null); e.hp = hpSnap() }
    /* 戰鬥結束時還在肚子裡的人算陣亡 */
    function endSwallow() { P.forEach(function (x) { if (x.dead || !swallowed(x)) return; x.hp = 0; x.dead = true; x.st = []; line({ kind: 'note', idle: true, txt: x.name + ' 沒能從肚子裡出來……', pko: [x.i], hp: hpSnap() }) }) }
    function over() { return !alive(P) || !alive(M) || rounds >= MAXR }
    return { P: P, M: M, U: U, ev: ev, hooks: hooks, SPM: SPM, cands: cands, canUse: canUse, cdOf: cdOf, round: round, start: start, begin: begin, finish: finish, wait: wait, act: act, stat: stat, ctrl: ctrl, has: has, banished: banished, swallowed: swallowed, endSwallow: endSwallow, alive: alive, over: over,
      rounds: function () { return rounds }, res: function () { flushBoom(); return !alive(P) ? 'lose' /* 同歸於盡算輸 */ : alive(M) ? 'draw' : 'win' }, MAXR: MAXR };
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
    var rs = S.res(); return { ev: S.ev, res: rs === 'win' ? 'win' : 'lose', rounds: S.rounds() };
  }

  var API = { beast: beastOf, prepare: prepare, player: player, monster: monster, stageMonsters: stageMonsters, stageRow: stageRow, run: run, session: session, ELN: ELN };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.BattleEngine = API;
})(this);

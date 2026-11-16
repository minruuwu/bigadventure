/* 幻獸資訊（角色頁、營地共用）：同行幻獸是哪一隻、給主人加多少屬性、裝備哪兩招。
   算法跟 battle/engine.js 的 beastOf / player 一致：每格效果 = 上限 ÷ 15（成熟體最多 30 格，每格效果不變）；
   攻擊力只加在物攻、魔攻較高的那個；本屬性抗性只加幻獸自己那一系、其他屬性抗性加另外 6 系。
   BeastInfo.load(base, v) 先讀 beast_info.csv（種族名稱、技能名稱）；沒讀到也能算加成，只是名字空白。 */
(function (g) {
  'use strict';
  var BSTK = { fire: 'fire', ice: 'frost', bolt: 'lightning', wind: 'wind', leaf: 'nature', sun: 'light', moon: 'dark' };
  var CAP = { atk: 0.10, dmg: 0.15, crit: 0.10, red: 0.15, hp: 0.20, res: 0.30, eva: 0.08, cdmg: 1, ores: 0.10 };
  var LBL = { atk: '攻擊力', dmg: '增傷', crit: '暴擊率', red: '減傷', hp: '生命力', res: '本屬性抗性', eva: '閃避率', cdmg: '暴擊傷害', ores: '其他屬性抗性' };
  var ORDER = ['atk', 'dmg', 'crit', 'red', 'hp', 'res', 'eva', 'cdmg', 'ores'];
  var BLEARN = [[1, 0], [6, 2], [12, 3], [18, 1]];
  /* 引擎的技能順序（單體、全體、守護、減益）對到 beast_info 的 skill_1～4（單體、守護、減益、全體） */
  var JCOL = [1, 4, 2, 3];
  var INFO = {};
  function parse(t) { t = t.replace(/^﻿/, ''); var rows = [], row = [], f = '', q = false;
    for (var i = 0; i < t.length; i++) { var c = t.charAt(i);
      if (q) { if (c === '"') { if (t.charAt(i + 1) === '"') { f += '"'; i++ } else q = false } else f += c }
      else if (c === '"') q = true; else if (c === ',') { row.push(f); f = '' } else if (c === '\n' || c === '\r') { if (c === '\r' && t.charAt(i + 1) === '\n') i++; row.push(f); rows.push(row); row = []; f = '' } else f += c }
    if (f || row.length) { row.push(f); rows.push(row) }
    var H = rows.shift() || []; return rows.filter(function (r) { return r.length > 1 }).map(function (r) { var o = {}; H.forEach(function (h, j) { o[h] = r[j] || '' }); return o }) }
  function load(base, v) { return fetch((base || '../assets/') + 'data/beast_info.csv?v=' + (v || 1) + '.' + Math.floor(Date.now() / 300000)).then(function (r) { return r.ok ? r.text() : '' }).then(function (t) { parse(t || '').forEach(function (r) { INFO[r.beast_id] = r }) }).catch(function () {}) }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)) }
  /* p = 玩家資料 → 同行中的幻獸（卸下或沒有就 null） */
  function of(p) {
    var L = p && Array.isArray(p.beasts) ? p.beasts : [], b = p && p.beastOn === -1 ? null : L[p && p.beastOn | 0] || L[0];
    if (!b || !BSTK[b.sp]) return null;
    var base = BSTK[b.sp], ev = ['atk', 'def', 'sup'].indexOf(b.ev) >= 0 ? b.ev : '', lv = clamp(b.lv | 0 || 1, 1, 20), k = ev ? base + '_' + ev : base, got;
    if (ev) { var mo = Array.isArray(b.mo) && b.mo.length === 4 ? b.mo : [0, 1, 2, 3], n = 1 + (lv >= 6) + (lv >= 12) + (lv >= 18); got = [0, 1, 2, 3].concat(mo.slice(0, n).map(function (x) { return 4 + x })) }
    else got = BLEARN.filter(function (x) { return lv >= x[0] }).map(function (x) { return x[1] });
    var sk = (Array.isArray(b.sk) ? b.sk : []).filter(function (i, j, a) { return got.indexOf(i) >= 0 && a.indexOf(i) === j }).slice(0, 2); if (!sk.length) sk = got.slice(-2);
    return { name: b.name || '幻獸', lv: lv, sp: b.sp, base: base, ev: ev, k: k, cap: ev ? 30 : 15, st: b.st || {}, sk: sk, species: (INFO[k] || {}).beast_name || '' };
  }
  /* 各項加成（小數；b = of() 的結果） */
  function bonus(b) { var o = {}; ORDER.forEach(function (k) { o[k] = b ? clamp(Number(b.st[k]) || 0, 0, b.cap) / 15 * CAP[k] : 0 }); o.el = b ? b.base : ''; return o }
  function skillName(b, i) { if (i >= 4) { var r = INFO[b.k] || {}; return r['skill_' + (i - 3)] || '' } var r0 = INFO[b.base] || {}; return r0['skill_' + JCOL[i]] || '' }
  function species(b) { return b ? (INFO[b.k] || {}).beast_name || b.species || '' : '' }
  function label(b) { return b ? '幻獸 ' + b.name + '（' + species(b) + ' Lv' + b.lv + '）' : '' }
  g.BeastInfo = { species: species, load: load, of: of, bonus: bonus, skillName: skillName, label: label, LBL: LBL, ORDER: ORDER };
})(window);

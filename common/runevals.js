/* 符文數值（角色頁、營地隊伍面板共用；戰鬥引擎 battle/engine.js 內有同一套）：
   rune_info.csv 的 value_1～3，有 % 的換成小數、純數字照原樣、文字不算。RuneVals.v(rows, 'rune05', 1, 1) → 第 2 個數值，沒有就用預設 */
(function (g) {
  'use strict';
  var cache = null, src = null;
  function pv(x) { var t = String(x == null ? '' : x).trim(); if (!/^-?[\d.]+%?$/.test(t)) return null; var n = parseFloat(t); return /%/.test(t) ? n / 100 : n }
  function map(rows) { if (rows === src && cache) return cache; src = rows; cache = {}; (rows || []).forEach(function (r) { if (r && r.u_sn) cache[r.u_sn] = [pv(r.value_1), pv(r.value_2), pv(r.value_3)] }); return cache }
  /* 符文等級（rune_level.csv）：setLevels(rows) 之後，v() 給了等級就讀那一級的數值 */
  var LVT = null, NEED = [1, 2, 3, 5, 8, 12, 18, 25, 35, 50];
  var LVR = null;
  function setLevels(rows) { LVT = {}; LVR = {}; (rows || []).forEach(function (r) { if (!r || !r.u_sn) return; var L = parseInt(r.level, 10) || 0; (LVT[r.u_sn] = LVT[r.u_sn] || {})[L] = [pv(r.value_1), pv(r.value_2), pv(r.value_3), pv(r.value_4)]; (LVR[r.u_sn] = LVR[r.u_sn] || {})[L] = [r.value_1, r.value_2, r.value_3, r.value_4].map(function (x) { return String(x == null ? '' : x).trim() }) }) }
  function raw(id, lv, k) { var t = LVR && LVR[id] && LVR[id][lv]; return t ? t[k] || '' : '' } /* 顯示用：表格上寫的原字（例如 30%） */
  function levelOf(n) { n = n | 0; var L = 0, c = 0; for (var i = 0; i < NEED.length; i++) { c += NEED[i]; if (n >= c) L = i + 1; else break } return L }
  function need(L) { var c = 0; for (var i = 0; i < Math.min(L, NEED.length); i++) c += NEED[i]; return c } /* 到 Lv L 累計要幾片 */
  function v(rows, id, k, dflt, lv) { if (LVT && lv) { var t = LVT[id] && LVT[id][lv]; if (t) { var y = t[k]; return y == null || isNaN(y) ? dflt : y } } var a = map(rows)[id], x = a ? a[k] : null; return x == null || isNaN(x) ? dflt : x }
  function hasLevels() { return !!LVT }
  function row(id, lv) { return LVT && LVT[id] ? LVT[id][lv] || null : null }
  /* 顯示用：0.2 → 20%、1 → 100% */
  function pc(x) { return Math.round(x * 1000) / 10 + '%' }
  g.RuneVals = { v: v, pv: pv, pc: pc, setLevels: setLevels, levelOf: levelOf, need: need, NEED: NEED, hasLevels: hasLevels, row: row, raw: raw };
})(this);

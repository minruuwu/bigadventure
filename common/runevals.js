/* 符文數值（角色頁、營地隊伍面板共用；戰鬥引擎 battle/engine.js 內有同一套）：
   rune_info.csv 的 value_1～3，有 % 的換成小數、純數字照原樣、文字不算。RuneVals.v(rows, 'rune05', 1, 1) → 第 2 個數值，沒有就用預設 */
(function (g) {
  'use strict';
  var cache = null, src = null;
  function pv(x) { var t = String(x == null ? '' : x).trim(); if (!/^-?[\d.]+%?$/.test(t)) return null; var n = parseFloat(t); return /%/.test(t) ? n / 100 : n }
  function map(rows) { if (rows === src && cache) return cache; src = rows; cache = {}; (rows || []).forEach(function (r) { if (r && r.u_sn) cache[r.u_sn] = [pv(r.value_1), pv(r.value_2), pv(r.value_3)] }); return cache }
  function v(rows, id, k, dflt) { var a = map(rows)[id], x = a ? a[k] : null; return x == null || isNaN(x) ? dflt : x }
  /* 顯示用：0.2 → 20%、1 → 100% */
  function pc(x) { return Math.round(x * 1000) / 10 + '%' }
  g.RuneVals = { v: v, pv: pv, pc: pc };
})(this);

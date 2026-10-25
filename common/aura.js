/* 靈氣特效（戰鬥、營地、角色頁共用）
   有裝備而且學會的靈氣被動，持有者腳下常駐一圈慢慢轉的光環＋往上飄的小光點；受加成的隊友（戰鬥）只有淡淡的光環。
   同時有好幾種靈氣：一次顯示一種，約 2.5 秒輪流換（淡入淡出）。
   Aura.ids(玩家資料) → 這個人身上的靈氣 id 清單（被動欄＋等級開格＋職業等級學會）
   Aura.ring(ctx, 腳底 x, 腳底 y, 像素倍率, 時間, ids, 淡=true/false)：腳下光環（先畫，在角色後面）
   Aura.motes(ctx, 腳底 x, 腳底 y, 像素倍率, 時間, ids)：往上飄的光點（後畫，在角色前面）
   座標都是美術像素；像素倍率 = 一個美術像素在畫布上幾個點（營地、角色頁 1，戰鬥是 U） */
(function (g) {
  'use strict';
  var DEF = {
    skill148: { n: '虔誠靈氣', j: 'job13', lv: 10, c: ['#f4f7ff', '#c9d4e6', '#8f9db6'], m: 'shield' },
    skill152: { n: '抵抗靈氣', j: 'job13', lv: 25, c: ['#ff7a3a', '#8ed4ff', '#ffe95a', '#7cf0c4', '#8ed65a', '#ffe9a0', '#a35af0'], m: 'rainbow' },
    skill175: { n: '引導靈光', j: 'job16', lv: 10, c: ['#e6d4ff', '#b48cff', '#7a4ae0'], m: 'rune' },
    skill193: { n: '狂熱靈氣', j: 'job18', lv: 10, c: ['#ffd06a', '#ff7a2a', '#d8341a'], m: 'ember' },
    skill197: { n: '審判靈氣', j: 'job18', lv: 25, c: ['#fff6c8', '#ffd23a', '#c99a1a'], m: 'star' }
  };
  var PSLOT = [1, 30, 60, 90];
  function ids(p) {
    if (!p) return [];
    var lv = Math.max(1, p.lv | 0 || 1), jl = p.jobLv || {}, pas = (p.skills && Array.isArray(p.skills.passive)) ? p.skills.passive : [], out = [];
    pas.forEach(function (id, q) { var d = DEF[id]; if (d && lv >= PSLOT[q] && (jl[d.j] | 0) >= d.lv && out.indexOf(id) < 0) out.push(id) });
    return out;
  }
  /* 現在輪到哪一種、透明度（切換時淡入淡出 0.3 秒） */
  function pick(list, t) {
    if (!list || !list.length) return null;
    var P = 2500, k = Math.floor(t / P) % list.length, u = t % P, a = list.length > 1 ? Math.min(1, u / 300, (P - u) / 300) : 1;
    return { d: DEF[list[k]], a: Math.max(0, a) };
  }
  function px(ctx, x, y, s, c, a) { if (a <= 0) return; ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = c; var z = Math.max(1, Math.round(s)); ctx.fillRect(Math.round(x * s), Math.round(y * s), z, z) }
  function pat(ctx, x, y, s, rows, c, a) { rows.forEach(function (r, j) { for (var i = 0; i < r.length; i++) if (r.charAt(i) === 'X') px(ctx, x + i, y + j, s, c, a) }) }
  var SHIELD = ['XXX', 'XXX', '.X.'], RUNE = ['.X.', 'X.X', '.X.'], STAR = ['.X.', 'XXX', '.X.'];
  /* 腳下光環：橢圓（寬 rx、高 ry），一圈淡色＋兩段亮的轉動弧；狂熱會一跳一跳 */
  function ring(ctx, x, y, s, t, list, faint) {
    var q = pick(list, t); if (!q) return; var d = q.d, A = q.a * (faint ? .45 : 1), rx = 10, ry = 3.2, N = 40;
    var beat = d.m === 'ember' ? 1 + .12 * Math.max(0, Math.sin(t / 140)) : 1;
    for (var i = 0; i < N; i++) {
      var an = i / N * Math.PI * 2, xx = x + Math.cos(an) * rx * beat, yy = y + Math.sin(an) * ry * beat;
      var spin = t / 900, h1 = Math.cos(an - spin), h2 = Math.cos(an - spin - Math.PI), hi = Math.max(0, h1, h2), hl = Math.pow(hi, 6);
      var col = d.m === 'rainbow' ? d.c[Math.floor((i / N * 7 + t / 600) % 7)] : (hl > .5 ? d.c[0] : d.c[1]);
      px(ctx, xx, yy, s, col, A * (.38 + .55 * hl));
    }
    if (!faint) { var g2 = .12 * A; for (var j = -rx + 2; j <= rx - 2; j++) { var w = Math.sqrt(1 - (j / rx) * (j / rx)) * ry; for (var k = -Math.floor(w) + 1; k < w; k++) px(ctx, x + j, y + k, s, d.c[d.m === 'rainbow' ? 5 : 1], g2) } }
    ctx.globalAlpha = 1;
  }
  /* 往上飄的光點：4 顆，從光環上升約 16 格、淡出 */
  function motes(ctx, x, y, s, t, list) {
    var q = pick(list, t); if (!q) return; var d = q.d, A = q.a;
    for (var i = 0; i < 4; i++) {
      var per = 1700 + i * 230, u = ((t + i * 520) % per) / per, cyc = Math.floor((t + i * 520) / per), ox = ((cyc * 7 + i * 5) % 15) - 7, mx = x + ox + Math.sin(u * 5 + i) * 1, my = y - 1 - u * 16, a = A * Math.sin(u * Math.PI) * .95;
      var c = d.m === 'rainbow' ? d.c[(cyc + i) % 7] : d.c[i % 2 ? 1 : 0];
      if (d.m === 'shield') { pat(ctx, mx - 1, my - 1, s, SHIELD, d.c[1], a); px(ctx, mx, my - 1, s, d.c[0], a) }
      else if (d.m === 'rune') { pat(ctx, mx - 1, my - 1, s, RUNE, c, a); px(ctx, mx, my, s, d.c[0], a * .6) }
      else if (d.m === 'star') { pat(ctx, mx - 1, my - 1, s, STAR, d.c[1], a); px(ctx, mx, my, s, '#ffffff', a) }
      else if (d.m === 'ember') { px(ctx, mx, my, s, u < .4 ? d.c[0] : d.c[1], a); if (Math.floor(t / 90 + i) % 3) px(ctx, mx, my + 1, s, d.c[2], a * .6) }
      else { px(ctx, mx, my, s, c, a); px(ctx, mx + 1, my, s, c, a * .6) }
    }
    ctx.globalAlpha = 1;
  }
  /* 現在這一刻的靈氣主色與透明度（角色頁做輪廓光暈用） */
  function color(list, t) { var q = pick(list, t); if (!q) return null; var d = q.d; return { c: d.m === 'rainbow' ? d.c[Math.floor(t / 400) % 7] : d.c[1], a: q.a } }
  g.Aura = { DEF: DEF, ids: ids, ring: ring, motes: motes, color: color };
})(this);

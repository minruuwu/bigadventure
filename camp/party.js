/* 營地：組隊（我的隊伍／選隊員／別人卡片的隊伍區）＋公頻聊天。
   由 camp/index.html 呼叫 Party.init(ctx)；資料層在 common/fb.js（partyAdd / partyRemove / partyLeave / chatListen / chatSend）。
   ?demo=1 時用記憶體裡的假資料，不碰 Firebase。 */
(function (g) {
  var C = null, API = null, STAT = null, MC = {}, openWin = null;
  var CHAT_GAP = 123 * 1000; /* 規則是 2 分鐘，多留 3 秒給網路與時鐘誤差 */
  var CSS = '\
.mk{position:absolute;left:3px;right:3px;bottom:3px;z-index:6;display:flex;gap:8px;line-height:1}\
.mk .mb{flex:1;position:relative;display:flex;align-items:center;justify-content:center;gap:8px;min-height:34px;font:inherit;font-weight:900;font-size:14px;color:#f0e2c4;background:rgba(61,35,13,.88);border:0;cursor:pointer;box-shadow:inset 0 0 0 2px #1d1008,inset 0 2px 0 2px #b9823f;text-shadow:1px 1px 0 #000}\
.mk .mb:active{filter:brightness(.9)}.mk .mb small{font-size:12px;opacity:.85;font-weight:400}.mk .mb.new small{opacity:1;font-weight:900;color:#1d1008;background:#ffd76a;padding:1px 5px;border-radius:8px}\
.ml .rw{display:flex;align-items:center;gap:8px}.ml .tx{flex:1;min-width:0;display:flex;flex-direction:column}.ml .tx small{font-size:11px;color:#5a3a1a}.mall{margin-top:6px;align-self:center}\
.pcard.pw{padding-top:8vh;padding-bottom:24px}.pcard.pw .box{max-width:340px;align-items:stretch}\
.pw .box>*{flex:none}.pw h2{margin:0;font-size:18px;text-align:center}.pw h3{margin:6px 0 2px;font-size:13px;font-weight:900;color:#5a3a1a}\
.rowp{width:100%;display:grid;grid-template-columns:repeat(6,1fr);gap:4px}\
.pt{position:relative;padding:0;border:0;font:inherit;background:#2b1d13;box-shadow:0 0 0 2px #3b2713;overflow:hidden;display:block;cursor:pointer;min-width:0}\
.pt canvas{width:100%;display:block;image-rendering:pixelated;background:none!important;box-shadow:none!important}\
.pt.me{box-shadow:0 0 0 2px #e0b84a}.pt.sel{box-shadow:0 0 0 3px #fff}\
.pt.em{background:rgba(70,40,15,.12);box-shadow:none;border:2px dashed rgba(70,40,15,.5);color:#6a4a2a;font-size:22px;font-weight:900;height:100%;min-height:52px;display:flex;align-items:center;justify-content:center}\
.pt i{position:absolute;left:0;right:0;bottom:0;font-style:normal;font-size:9px;line-height:1.3;text-align:center;color:#f0e2c4;background:rgba(0,0,0,.65);padding:1px 2px;box-sizing:border-box;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}\
.dtl{width:100%;box-sizing:border-box;margin-top:8px;padding:8px;background:rgba(70,40,15,.12);font-size:12px;color:#2e1d0e;line-height:1.5;text-align:left}\
.d1{display:flex;align-items:center;gap:6px;margin-bottom:4px;height:30px;box-sizing:border-box}.d1 .nn{font-size:15px;font-weight:900;max-width:150px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.d1 .lv{font-size:14px;font-weight:900}\
.d1 .tg{font-size:11px;color:#f0dfb8;background:#7a4f22;padding:1px 6px;box-shadow:0 0 0 2px #3d230d}.d1 .pbtn{margin-left:auto}\
.pw .pbtn,.pw .rw button,.cf button,.cin button{font:inherit;font-weight:900;font-size:12px;color:#f0e2c4;background:#7a4f22;border:0;padding:5px 10px;cursor:pointer;box-shadow:inset 0 0 0 2px #3d230d}\
.pw .pbtn:disabled,.cin button:disabled{opacity:.5}\
.tb2,.sg{display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;font-size:12px}.tb2{margin:4px 0 2px}\
.tb2 span,.sg span{display:flex;align-items:center;gap:4px;min-width:0}.tb2 em,.sg em{margin-left:auto;font-style:normal;font-weight:900;white-space:nowrap}\
.icf{width:32px;height:32px;flex:none;display:inline-block;background-size:32px 32px;image-rendering:pixelated}.icf img{width:32px;height:32px;display:block;image-rendering:pixelated}.sg{gap:2px 12px!important}.dtl img.si{width:16px;height:16px;image-rendering:pixelated;flex:none}.dtl img.ji,.rw img,.tp .m img,.chat img{image-rendering:pixelated}.dtl img.ji{width:20px;height:20px;flex:none}\
.tbs{display:flex;gap:4px;margin:8px 0 6px}.tbs b{padding:4px 12px;background:#4a2a12;color:#f0dfb8;font-size:12px;font-weight:900;box-shadow:0 0 0 2px #1d1008}\
.ptabs{display:flex;gap:4px;margin:8px 0 6px;flex-wrap:wrap}.ptabs[hidden],.pn[hidden]{display:none}.ptabs button{font:inherit;font-size:12px;font-weight:900;padding:4px 10px;border:0;cursor:pointer;color:#6a4a2a;background:rgba(70,40,15,.15);box-shadow:0 0 0 2px rgba(70,40,15,.45)}.ptabs button.on{background:#4a2a12;color:#f0dfb8;box-shadow:0 0 0 2px #1d1008}\
.pn{width:100%;text-align:left;font-size:12px;color:#2e1d0e}.sico{width:24px;height:24px;flex:none;display:inline-flex;align-items:center;justify-content:center}.sico img{width:24px;height:24px}.sico .icf.sw{width:24px;height:24px;background-size:24px 24px}.sico .icf.sw img{width:24px;height:24px}.sbl{width:22px;height:22px;box-sizing:border-box;background:#1d1008;border:2px solid #7a5a30;display:block}.ske{width:16px!important;height:16px!important;margin-left:4px;vertical-align:-3px;image-rendering:pixelated}\
.lst.cp .rw{padding:2px 6px}.lst{width:100%;display:flex;flex-direction:column;gap:5px;max-height:340px;overflow-y:auto}\
.rw{display:flex;align-items:center;gap:8px;padding:5px 6px;background:rgba(70,40,15,.12);font-size:13px;color:#2e1d0e;min-width:0}\
.rw img{width:24px;height:24px;flex:none}.rw .tx{min-width:0;flex:1}.rw .tx b{font-size:14px;display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.rw .tx small{font-size:11px;color:#6a4a2a}\
.rw .g{margin-left:auto;font-size:11px;color:#6a4a2a;text-align:right}.rw.off{opacity:.55}\
.pw .none,.tp .none{font-size:13px;color:#7a5a38;padding:2px 0}\
.cf{position:absolute;inset:0;z-index:5;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}\
.cf>div{background:#e3cfa0;box-shadow:inset 0 0 0 3px #3d230d;padding:16px;width:78%;text-align:center;color:#2e1d0e;font-size:14px;line-height:1.5}\
.cf button{font-size:14px;margin:10px 6px 0;padding:6px 16px}.cf button.n{background:#6b5a48}\
.chat{width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:4px;height:300px;overflow-y:auto;background:rgba(40,22,8,.88);padding:8px;font-size:13px;color:#f0e2c4}\
.chat div{display:flex;gap:6px;align-items:flex-start;line-height:1.35;word-break:break-all}.chat img{width:18px;height:18px;flex:none;margin-top:1px}.chat b{color:#e0b84a;flex:none}.chat .e{color:#a99774;justify-content:center}\
.cin{display:flex;gap:6px;margin-top:6px}.cin input{flex:1;min-width:0;font:inherit;font-size:14px;padding:6px;border:2px solid #3d230d;background:#f4e8c8;color:#2e1d0e;border-radius:0}.cin button{font-size:14px;padding:0 14px;white-space:nowrap}\
.cmsg{font-size:12px;min-height:1.3em;color:#7a2a1a;text-align:center}\
.tp{width:100%;margin-top:4px;padding-top:8px;border-top:2px dashed rgba(70,40,15,.45);display:flex;flex-direction:column;gap:4px}\
.tp[hidden]{display:none}.tp h3{margin:0;font-size:13px;font-weight:900;color:#3b2713}.tp .m{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:#2e1d0e}.tp .m img{width:22px;height:22px}';

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function pct(x) { return (x * 100).toFixed(1).replace(/\.0$/, '') + '%' }
  function pn(s) { return parseFloat(String(s || '').replace('%', '')) / 100 || 0 }
  function tms(v) { return v && v.toMillis ? v.toMillis() : (typeof v === 'number' ? v : 0) }
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); if (m < 10) return '線上'; if (m < 60) return m + ' 分鐘前'; var h = Math.round(m / 60); if (h < 48) return h + ' 小時前'; return Math.round(h / 24) + ' 天前' }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e }
  function jobSn(p) { return p.jobSn || ('job' + ('0' + ((p.job | 0) + 1)).slice(-2)) }
  function jobIdx(p) { var m = /(\d+)/.exec(jobSn(p)); return m ? +m[1] - 1 : (p.job | 0) }
  function jobName(p) { return (g.Doll.JOBN[jobIdx(p)]) || '冒險者' }
  function jobLv(p) { var m = p.jobLv || {}; return m[jobSn(p)] | 0 }
  function charLv(p) { return Math.max(1, p.lv | 0 || 1) }
  function jicon(p) { return C.base + 'icons/jobs/framed/' + jobSn(p) + '.png?v=' + C.v }
  function snIcon(sn) { return C.base + 'icons/jobs/framed/' + (sn || 'job01') + '.png?v=' + C.v }
  function wsn(p) { return C.wbyname[p.weapon] || '' }
  function wlv(p) { var s = wsn(p), w = p.weapons && p.weapons[s]; return Math.max(1, (w && w.lv) | 0 || 1) }
  function wicon(p) { var s = wsn(p); return s ? C.base + 'icons/weapons/' + s + '.png?v=2' : '' }
  var WR = ['#fff3b8', '#f0cd62', '#c9981f', '#8a5f10'], WF = null;
  function goldFrame() { if (WF) return WF; var c = document.createElement('canvas'); c.width = c.height = 16; var x = c.getContext('2d'); x.fillStyle = '#120a05'; x.fillRect(1, 1, 14, 14);
    for (var i = 0; i < 16; i++) for (var j = 0; j < 16; j++) { var m = Math.min(i, j, 15 - i, 15 - j); if (m > 1) continue; var f = (i + j) / 30, k = f < .27 ? 0 : f < .5 ? 1 : f < .73 ? 2 : 3, col = WR[k];
      if (m === 0 && (i === 0 || i === 15) && (j === 0 || j === 15)) continue;
      if (m === 1) { var n = parseInt(col.slice(1), 16); col = 'rgb(' + Math.round((n >> 16 & 255) * .8) + ',' + Math.round((n >> 8 & 255) * .8) + ',' + Math.round((n & 255) * .8) + ')' }
      x.fillStyle = col; x.fillRect(i, j, 1, 1) }
    return WF = c.toDataURL() }
  function me() { return C.me() }

  /* ---------- 戰鬥屬性（跟角色頁同一套算法，只是唯讀） ---------- */
  function statData() {
    if (STAT) return Promise.resolve(STAT);
    return Promise.all([C.getCSV('job_attribute.csv'), C.getCSV('job_level_up.csv'), C.getCSV('skill_info.csv').catch(function () { return [] }), C.getCSV('skill_effect.csv').catch(function () { return [] })]).then(function (R) {
      var A = {}, G = {}, K = {}; R[0].forEach(function (r) { if (r.u_sn) A[r.u_sn] = r }); R[1].forEach(function (r) { if (r.u_sn) G[r.u_sn] = r }); R[2].forEach(function (r) { if (r.skill_id) K[r.skill_id] = { id: r.skill_id, n: r.skill_name, j: r.job, lv: parseInt(r.job_level, 10) || 0, e: r.part1_element } });
      var E = {}; (R[3] || []).forEach(function (r) { if (r.effect_kind === 'passive' && r.effect && r.skill_id) (E[r.skill_id] = E[r.skill_id] || []).push({ k: r.effect, v: parseFloat(r.value) || 0, c: r.condition || '' }) });
      STAT = { attr: A, grow: G, sk: K, eff: E }; return STAT
    }).catch(function () { STAT = { attr: {}, grow: {}, sk: {}, eff: {} }; return STAT })
  }
  var RES = [['fire', '火炎'], ['frost', '冰霜'], ['lightning', '雷電'], ['wind', '疾風'], ['nature', '自然'], ['light', '光明'], ['dark', '黑暗']];
  var SKEL = { fire: '火焰', frost: '冰霜', lightning: '雷電', wind: '疾風', nature: '自然', light: '光明', dark: '黑暗' }, PSLOT = [1, 30, 60, 90];
  /* 已配置的被動技能加成（跟角色頁相同：有開放的格子、已學會、武器條件符合才算） */
  function skPas(p, key) {
    var D = STAT || {}, K = D.sk || {}, E = D.eff || {}, jl = p.jobLv || {}, lv = charLv(p), sv = p.skills || {}, pa = Array.isArray(sv.passive) ? sv.passive : [], ws = wsn(p), t = 0;
    for (var q = 0; q < 4; q++) { var id = pa[q], k = id && K[id]; if (!k || lv < PSLOT[q] || !/^job\d+$/.test(k.j || '') || (jl[k.j] | 0) < k.lv) continue; (E[id] || []).forEach(function (e) { if (e.k === key && (!e.c || e.c === ws)) t += e.v }) }
    return t
  }
  function combat(p, allies) {
    if (allies == null) allies = p._allies != null ? p._allies : Math.min(5, (p.party || []).length); var apa = skPas(p, 'atk_per_ally') * allies; /* 觀眾熱情：每位隊友 +x% 物攻、魔攻 */
    var D = STAT || { attr: {}, grow: {} }, sn = jobSn(p), K = ['str', 'int', 'agi', 'vit', 'luk'], T = {}, jl = p.jobLv || {}, al = p.alloc || {};
    var ws = wsn(p), lv = wlv(p), wd = (p.weapons && p.weapons[ws]) || {}, en = Array.isArray(wd.ench) ? wd.ench : [], pts = [0, 1, 2].map(function (q) { return Array.isArray(wd.pts) ? Math.max(0, wd.pts[q] | 0) : 0 });
    function rOn(id) { return en.indexOf(id) >= 0 }
    K.forEach(function (k) { var j = 0; Object.keys(jl).forEach(function (s) { var l = jl[s] | 0, g = D.grow[s]; if (l > 0 && g) j += (parseFloat(g['per_level_' + k]) || 0) * l }); var bs = 10 + j + (al[k] | 0); T[k] = bs + (rOn('rune08') ? Math.round(bs * 0.1) : 0) });
    var at = D.attr[sn] || {}, hpb = pn(at.hp_bonus), pb = pn(at.p_atk_bonus), mb = pn(at.m_atk_bonus), eb = pn(at.eva_rate_bonus), cb = pn(at.crit_rate_bonus), db = pn(at.crit_damage_rate_bonus), pd = pn(at.p_def_bonus), md = pn(at.m_def_bonus);
    var row = null; (C.rawWeapons() || []).forEach(function (r) { if (r.u_sn === ws) row = r });
    function wsum(key) { var t = 0; if (!row) return 0; for (var q = 1; q <= 6; q++) { if (row['auto_stat_' + q] !== key) continue; var per = String(row['auto_per_level_' + q] || '').trim(), v = (parseFloat(per) || 0) * lv; t += /%/.test(per) ? v / 100 : v }
      for (var u = 1; u <= 3; u++) { if (row['temper_stat_' + u] !== key || !pts[u - 1]) continue; t += (parseFloat(row['temper_per_point_' + u]) || 0) * pts[u - 1] / 100 } return t }
    function ps(stat) { var t = 0, pe = p.pets || {}; Object.keys(C.petinfo).forEach(function (id) { var pi = C.petinfo[id]; if (pi.stat !== stat) return; t += pi.per * Math.max(0, Math.min(10, ((pe[id] || {}).lv) | 0)) }); return t }
    var v = T.vit, s = T.str, i = T.int, a = T.agi, l = T.luk;
    var P0 = Math.round((s + wsum('p_atk') + Math.round(v * skPas(p, 'vit_to_p_atk'))) * (1 + pb + skPas(p, 'p_atk_rate') + apa)), M0 = Math.round((i + wsum('m_atk') + Math.round(s * skPas(p, 'str_to_m_atk'))) * (1 + mb + skPas(p, 'm_atk_rate') + apa)), balP = 0, balM = 0;
    if (rOn('rune09')) { var hi = Math.max(P0, M0), lo = Math.min(P0, M0), ad = Math.max(0, Math.min(Math.round(hi * 0.5), hi - lo)); if (P0 > M0) balM = ad; else if (M0 > P0) balP = ad }
    var r5 = rOn('rune05') ? 0.2 : 0;
    return [
      ['hp', '生命力', Math.round((v * 5 + 10 * Math.max(0, (p.lv | 0 || 1) - 1) + Math.round(a * skPas(p, 'agi_to_hp') * 5) + Math.round(i * skPas(p, 'int_to_hp') * 5) + Math.round((P0 + balP) * skPas(p, 'p_atk_to_hp'))) * (1 + hpb + wsum('hp_rate') + skPas(p, 'hp_rate')))],
      ['patk', '物理攻擊力', P0 + balP],
      ['matk', '魔法攻擊力', M0 + balM],
      ['pdmg', '物理傷害加成', pct(wsum('p_damage_rate') + skPas(p, 'p_damage_rate'))],
      ['mdmg', '魔法傷害加成', pct(wsum('m_damage_rate') + skPas(p, 'm_damage_rate'))],
      ['eva', '閃避率', pct(a / (a + 800) + eb + wsum('eva_rate') + ps('eva_rate') + skPas(p, 'eva_rate'))],
      ['crit', '暴擊率', pct(a / (a + 500) + cb + wsum('crit_rate') + r5 + skPas(p, 'crit_rate'))],
      ['critdmg', '暴擊傷害', pct(0.5 + l * 0.01 + db + wsum('crit_damage_rate') + (r5 ? 1 : 0) + skPas(p, 'crit_damage_rate'))],
      ['pdef', '物理減傷', pct(pd + wsum('p_reduce_rate') + ps('p_reduce_rate') + (rOn('rune06') ? 0.2 : 0) + skPas(p, 'p_reduce_rate'))],
      ['mdef', '魔法減傷', pct(md + wsum('m_reduce_rate') + ps('m_reduce_rate') + (rOn('rune07') ? 0.2 : 0) + skPas(p, 'm_reduce_rate'))]].concat(skPas(p, 'atk_per_ally') ? [['patk', '觀眾熱情', '隊友 ' + allies + ' 人 → 物攻魔攻 +' + pct(apa)]] : [])
  }
  function resists(p) { var at = (STAT && STAT.attr[jobSn(p)]) || {}; return RES.map(function (r) { return ['res_' + r[0], r[1], pct(Math.min(pn(at[r[0] + '_res_rate_bonus']) + skPas(p, r[0] + '_res_rate'), 0.75))] }) }
  function gridHtml(rows) { return '<div class="sg">' + rows.map(function (r) { return '<span><span class="icf" style="background-image:url(' + goldFrame() + ')"><img alt="" src="' + C.base + 'icons/stats/' + r[0] + '.png?v=5" onerror="this.style.visibility=\'hidden\'"></span>' + r[1] + '<em>' + r[2] + '</em></span>' }).join('') + '</div>' }
  function skIco(sk, p) { if (!sk) return '<span class="sbl"></span>'; if (sk === 'atk') { var w = wicon(p); return w ? '<span class="icf sw" style="background-image:url(' + goldFrame() + ')"><img alt="" src="' + w + '"></span>' : '<span class="sbl"></span>' } return '<img alt="" src="' + snIcon(sk.j) + '">' }
  function skillsHtml(p) {
    var K = (STAT && STAT.sk) || {}, jl = p.jobLv || {}, lv = charLv(p), sv = p.skills || {}, cb = Array.isArray(sv.combat) ? sv.combat : [], pa = Array.isArray(sv.passive) ? sv.passive : [];
    function ok(id) { var k = K[id]; return k && /^job\d+$/.test(k.j || '') && (jl[k.j] | 0) >= k.lv ? k : null }
    function line(tag, id, p) {
      var k = id === 'atk' ? 'atk' : ok(id), nm = k === 'atk' ? '普通攻擊' : k ? esc(k.n) : '（空）', el = k && k !== 'atk' && SKEL[k.e] ? '<img class="ske" alt="' + SKEL[k.e] + '" title="' + SKEL[k.e] + '" src="' + C.base + 'icons/stats/res_' + k.e + '.png?v=5">' : '';
      return '<div class="rw"><span class="sico">' + skIco(k, p) + '</span><span class="tx"><b>' + nm + el + '</b><small>' + tag + '</small></span></div>'
    }
    var h = '';
    for (var i = 0; i < 4; i++) { var c = cb[i] || 'atk'; h += line('戰鬥 ' + (i + 1), c === 'atk' ? 'atk' : c, p) }
    h += line('反應', sv.reaction || '', p);
    for (var q = 0; q < 4; q++) h += lv >= PSLOT[q] ? line('被動 ' + (q + 1), pa[q] || '', p) : '<div class="rw off"><span class="sico"><span class="sbl"></span></span><span class="tx"><b>（Lv' + PSLOT[q] + ' 解鎖）</b><small>被動 ' + (q + 1) + '</small></span></div>';
    return '<div class="lst cp" style="max-height:none">' + h + '</div>'
  }
  function jobsHtml(p) {
    var jl = p.jobLv || {}, ks = Object.keys(jl).filter(function (k) { return (jl[k] | 0) > 0 }).sort();
    if (!ks.length) return '<div class="none">還沒有職業等級</div>';
    return '<div class="lst" style="max-height:none">' + ks.map(function (k) { var m = /(\d+)/.exec(k), nm = (m && g.Doll.JOBN[+m[1] - 1]) || k; return '<div class="rw"><img alt="" src="' + snIcon(k) + '"><span class="tx"><b>' + esc(nm) + '</b></span><span class="g" style="font-size:13px;font-weight:900;color:#2e1d0e">Lv.' + (jl[k] | 0) + '</span></div>' }).join('') + '</div>'
  }
  var TABN = { say: '想說的話', stat: '屬性', skill: '技能', res: '抗性', job: '職業' };
  /* 分頁：bar 放按鈕，panel 放內容；onTab(name) 讓呼叫端決定其他區塊（例如想說的話）要不要顯示 */
  function mountTabs(bar, panel, p, names, onTab, alive) {
    var cur = names[0];
    function paint() {
      bar.innerHTML = names.map(function (n) { return '<button type="button" data-t="' + n + '"' + (n === cur ? ' class="on"' : '') + '>' + TABN[n] + '</button>' }).join('');
      if (onTab) onTab(cur);
      if (cur === 'say') { panel.innerHTML = ''; return }
      panel.innerHTML = '<div class="none">讀取中…</div>'; var mine = cur;
      statData().then(function () { if (cur !== mine || (alive && !alive())) return; panel.innerHTML = mine === 'stat' ? gridHtml(combat(p)) : mine === 'res' ? gridHtml(resists(p)) : mine === 'skill' ? skillsHtml(p) : jobsHtml(p) })
    }
    bar.onclick = function (e) { var b = e.target.closest && e.target.closest('button[data-t]'); if (!b || b.dataset.t === cur) return; cur = b.dataset.t; paint() };
    bar.hidden = false; panel.hidden = false; paint()
  }

  /* ---------- 信件：隊長打贏冒險時，我的分成累積在隊長那邊；每天早上 6 點（台灣時間）後可以領一次 ---------- */
  var SH = null, DAY = 86400000, SIX = 79200000; /* 台灣 06:00 = UTC 22:00 */
  function period(t) { return Math.floor((t - SIX) / DAY) }
  function canClaim(L) { var c = SH && SH.claims && SH.claims[L]; return !c || period(c) < period(Date.now()) }
  function nextSix() { var d = new Date((period(Date.now()) + 1) * DAY + SIX); return (d.getMonth() + 1) + '/' + d.getDate() + ' 06:00' }
  function ready() { return SH ? SH.list.filter(function (x) { return (x.exp || x.stones) && canClaim(x.uid) }) : [] }
  function mailBadge() { var b = document.getElementById('mkMail'); if (!b) return; var n = ready().length; b.querySelector('small').textContent = n ? n : ''; b.classList.toggle('new', n > 0) }
  function mailCount() { API.shares().then(function (r) { SH = r || { list: [], claims: {} }; mailBadge() }, function () { SH = { list: [], claims: {} }; mailBadge() }) }
  function openMail() {
    var win = overlay('pw'), box = win.box, busy = false;
    box.insertAdjacentHTML('beforeend', '<h2>信件</h2><p class="mnote" style="margin:0;font-size:12px;color:#5a3a1a;text-align:center">隊長帶你打贏冒險時，你的分成（經驗 10%、鍛造石 5%）會累積在隊長那邊，每天早上 6 點後可以領一次。</p><div class="lst ml"><div class="none">讀取中…</div></div><div class="cmsg"></div><button type="button" class="pbtn mall" hidden>全部領取</button>');
    var lst = box.querySelector('.ml'), msg = box.querySelector('.cmsg'), all = box.querySelector('.mall');
    function paint() {
      var L = (SH && SH.list) || [], R = ready(); all.hidden = R.length < 2;
      if (!L.length) { lst.innerHTML = '<div class="none">目前沒有隊長把你加進隊伍。</div>'; return }
      lst.innerHTML = L.map(function (x) { var has = x.exp || x.stones, ok = has && canClaim(x.uid);
        return '<div class="rw"><span class="tx"><b>' + esc(x.name || '隊長') + ' 那邊的分成</b><small>' + (has ? '經驗 ' + x.exp + '、鍛造石 ' + x.stones : '目前沒有累積') + (has && !ok ? '　（' + nextSix() + ' 後可領）' : '') + '</small></span>' + (ok ? '<button type="button" class="pbtn" data-id="' + esc(x.uid) + '">領取</button>' : '') + '</div>' }).join('')
    }
    function take(ids) {
      if (busy) return; busy = true; msg.textContent = ''; var got = { e: 0, s: 0 }, q = ids.slice();
      (function next() {
        var id = q.shift(), x = SH && SH.list.filter(function (y) { return y.uid === id })[0];
        if (!x) { busy = false; paint(); mailBadge(); if (got.e || got.s) C.toast('領到 經驗 ' + got.e + '、鍛造石 ' + got.s); return }
        API.claim(x.uid).then(function (g) { g = g || { exp: x.exp, stones: x.stones }; got.e += g.exp; got.s += g.stones; var m = me(); if (!C.demo) { m.exp = (m.exp | 0) + g.exp; m.stones = (m.stones | 0) + g.stones } x.exp = 0; x.stones = 0; SH.claims[x.uid] = Date.now(); next() },
          function (e) { busy = false; msg.textContent = '領取失敗' + (e && e.code === 'permission-denied' ? '（今天可能已經領過，或規則尚未更新）' : '，請再試一次'); API.shares().then(function (r) { SH = r; paint(); mailBadge() }) })
      })()
    }
    lst.addEventListener('click', function (e) { var b = e.target.closest('button[data-id]'); if (b) { b.disabled = true; take([b.dataset.id]) } });
    all.addEventListener('click', function () { take(ready().map(function (x) { return x.uid })) });
    API.shares().then(function (r) { SH = r || { list: [], claims: {} }; paint(); mailBadge() }, function (e) { lst.innerHTML = '<div class="none">信件讀取失敗' + (e && e.code === 'permission-denied' ? '（權限尚未開放）' : '') + '</div>' });
  }
  /* ---------- 資料（真的 Firebase 或 demo 假資料） ---------- */
  function realAPI() {
    function F(cb) { return new Promise(function (res, rej) { C.withFB(function (FB) { try { res(cb(FB)) } catch (e) { rej(e) } }) }).then(function (x) { return x }) }
    return {
      list: function () { return F(function (FB) { return FB.listPlayers(50) }) },
      get: function (uids) { return F(function (FB) { return FB.getPlayers(uids) }) },
      add: function (u) { return F(function (FB) { return FB.partyAdd(u) }) },
      remove: function (u) { return F(function (FB) { return FB.partyRemove(u) }) },
      leave: function (u) { return F(function (FB) { return FB.partyLeave(u) }) },
      listen: function (cb, er) { var off = null, dead = false; C.withFB(function (FB) { if (!dead) off = FB.chatListen(cb, er) }); return function () { dead = true; if (off) off() } },
      send: function (t, n, j) { return F(function (FB) { return FB.chatSend(t, n, j) }) },
      shares: function () { return F(function (FB) { return FB.shareList() }) },
      claim: function (L) { return F(function (FB) { return FB.shareClaim(L) }) }
    }
  }
  function demoAPI() {
    var msgs = [], subs = [], DL = C.demoList(), DMAIL = [{ uid: 'L1', name: (DL[1] || {}).name || '隊長', exp: 86, stones: 12 }, { uid: 'L2', name: (DL[2] || {}).name || '隊長', exp: 23, stones: 4 }], DCL = { L2: Date.now() };
    ['今天誰要打王？', '我先下班了～', '等等 20 分鐘後開', '欸 阿果升到 3 級了', '剛剛拿到兩顆餅乾'].forEach(function (t, i) { var q = DL[(i + 1) % DL.length]; msgs.push({ id: 'd' + i, uid: q.uid, name: q.name, jobSn: jobSn(q), text: t, at: Date.now() - 900000 + i * 60000 }) });
    function byUid(u) { return DL.filter(function (p) { return p.uid === u })[0] || null }
    return {
      list: function () { return Promise.resolve(DL.slice(1)) },
      get: function (uids) { return Promise.resolve(uids.map(byUid)) },
      add: function (u) { var m = me(); m.party = (m.party || []).concat(u); var o = byUid(u); if (o) o.leaders = (o.leaders || []).concat(m.uid); return Promise.resolve() },
      remove: function (u) { var m = me(); m.party = (m.party || []).filter(function (x) { return x !== u }); return Promise.resolve() },
      leave: function (u) { var m = me(); m.leaders = (m.leaders || []).filter(function (x) { return x !== u }); return Promise.resolve() },
      shares: function () { return Promise.resolve({ list: DMAIL.map(function (x) { return Object.assign({}, x) }), claims: DCL }) },
      claim: function (L) { var g = { exp: 0, stones: 0 }; DMAIL.forEach(function (x) { if (x.uid === L) { g = { exp: x.exp, stones: x.stones }; x.exp = 0; x.stones = 0 } }); DCL[L] = Date.now(); return Promise.resolve(g) },
      listen: function (cb) { subs.push(cb); setTimeout(function () { cb(msgs.slice().reverse()) }, 0); return function () { subs = subs.filter(function (x) { return x !== cb }) } },
      send: function (t, n, j) { msgs.push({ id: 'n' + msgs.length, uid: me().uid, name: n, jobSn: j, text: t, at: Date.now() }); msgs = msgs.slice(-30); subs.forEach(function (f) { f(msgs.slice().reverse()) }); return Promise.resolve() }
    }
  }
  function members(uids) { /* 先用營地裡已經讀到的人，沒有的才去讀 */
    var out = {}, need = [];
    uids.forEach(function (u) { var c = MC[u]; if (c && Date.now() - c.t < 60000) out[u] = c.p; else { var l = C.findLocal(u); if (l && l.name) { out[u] = l; MC[u] = { t: Date.now(), p: l } } else need.push(u) } });
    if (!need.length) return Promise.resolve(uids.map(function (u) { return out[u] || null }));
    return API.get(need).then(function (r) { need.forEach(function (u, i) { if (r[i]) { r[i].uid = u; MC[u] = { t: Date.now(), p: r[i] }; out[u] = r[i] } }); return uids.map(function (u) { return out[u] || null }) })
  }
  function bust(u) { delete MC[u] }

  /* ---------- 視窗 ---------- */
  function overlay(cls, noBgClose) {
    var o = el('div', 'pcard ' + (cls || ''), '<div class="bg"></div><div class="box"><button type="button" class="x" aria-label="關閉">✕</button></div>');
    var box = o.querySelector('.box'), api = { el: o, box: box, onClose: null, close: function () { if (o.parentNode) o.parentNode.removeChild(o); if (api.onClose) api.onClose() } };
    o.querySelector('.x').addEventListener('click', api.close); if (!noBgClose) o.querySelector('.bg').addEventListener('click', api.close);
    document.body.appendChild(o); return api
  }
  function confirmBox(win, msg, okLabel, fn) {
    var c = el('div', 'cf', '<div>' + esc(msg) + '<br><button type="button" class="n">取消</button><button type="button" class="ok">' + esc(okLabel) + '</button></div>');
    win.box.style.position = 'relative'; win.box.appendChild(c);
    c.querySelector('.n').addEventListener('click', function () { c.remove() });
    c.querySelector('.ok').addEventListener('click', function () { c.remove(); fn() })
  }
  function thumb(p) {
    var cv = document.createElement('canvas'); cv.width = 22; cv.height = 24;
    try { var HD = document.createElement('canvas'); HD.width = HD.height = 48; var lk = Object.assign({}, C.look(p), { weapon: null, shield: null, halo: [], breath: false }); g.Doll.draw(HD, lk, 1000); cv.getContext('2d').drawImage(HD, 12, 5, 22, 24, 0, 0, 22, 24) } catch (e) { }
    return cv
  }
  function syncBtn() { var b = document.getElementById('mkParty'); if (b) b.querySelector('small').textContent = (1 + ((me().party || []).length)) + ' / 6' }
  function errText(e, what) { var c = e && e.code; return c === 'permission-denied' ? what + '失敗（對方已被 5 人加入，或規則尚未開放）' : c === 'timeout' ? '連線逾時，請檢查網路後再試' : what + '失敗，請稍後再試' }

  /* ----- 我的隊伍 ----- */
  function openParty() {
    var win = overlay('pw'), box = win.box, sel = 0, mem = [], leaders = [], gone = false; win.onClose = function () { gone = true; openWin = null }; openWin = win;
    function load() {
      var m = me(), pu = (m.party || []).slice(0, 5), lu = (m.leaders || []).slice(0, 5);
      return Promise.all([members(pu), members(lu), statData()]).then(function (R) { if (gone) return; mem = R[0]; leaders = R[1]; render() })
    }
    function detail(p, isMe) {
      var d = el('div', 'dtl'), W = wicon(p), idx = isMe ? '' : '<button type="button" class="pbtn" data-a="rm">移出</button>';
      d.innerHTML = '<div class="d1"><span class="nn">' + esc(p.name) + '</span><span class="lv">Lv.' + charLv(p) + '</span>' + (isMe ? '<span class="tg">隊長</span>' : idx) + '</div>' +
        '<div class="tb2"><span><img class="ji" alt="" src="' + jicon(p) + '">' + esc(jobName(p)) + '<em>Lv.' + jobLv(p) + '</em></span>' +
        '<span>' + (W ? '<img class="si" alt="" src="' + W + '">' : '') + esc(p.weapon || '—') + '<em>Lv.' + wlv(p) + '</em></span></div>' +
        '<div class="ptabs"></div><div class="pn"></div>';
      p._allies = Math.min(5, (me().party || []).length); /* 在我的隊伍裡：隊友數 = 隊伍人數 − 1 */
      mountTabs(d.querySelector(".ptabs"), d.querySelector('.pn'), p, ['stat', 'skill', 'res', 'job']);
      var b = d.querySelector('[data-a=rm]'); if (b) b.addEventListener('click', function () {
        confirmBox(win, '要把 ' + p.name + ' 移出隊伍嗎？', '移出', function () {
          API.remove(p.uid).then(function () { var m = me(); m.party = (m.party || []).filter(function (x) { return x !== p.uid }); bust(p.uid); sel = 0; syncBtn(); load(); C.toast('已移出 ' + p.name) }, function (e) { C.toast(errText(e, '移出')) })
        })
      });
      return d
    }
    function render() {
      var m = me(), n = (m.party || []).length; box.innerHTML = '<button type="button" class="x" aria-label="關閉">✕</button><h2>我的隊伍　' + (1 + n) + ' / 6</h2>';
      box.querySelector('.x').addEventListener('click', win.close);
      var row = el('div', 'rowp'), ppl = [m].concat(mem.map(function (p, i) { return p || { uid: (m.party || [])[i], name: '（讀取失敗）' } }));
      for (var i = 0; i < 6; i++) {
        if (i < ppl.length) { (function (i) { var p = ppl[i], b = el('button', 'pt' + (i === 0 ? ' me' : '') + (i === sel ? ' sel' : '')); b.type = 'button'; b.appendChild(thumb(p)); b.appendChild(el('i', null, esc(p.name))); b.addEventListener('click', function () { sel = i; render() }); row.appendChild(b) })(i) }
        else { var e = el('button', 'pt em', '＋'); e.type = 'button'; e.setAttribute('aria-label', '加入隊員'); e.addEventListener('click', function () { openPicker(win, function () { load() }) }); row.appendChild(e) }
      }
      box.appendChild(row); if (sel >= ppl.length) sel = 0; box.appendChild(detail(ppl[sel], sel === 0));
      if (sel === 0) {
        box.appendChild(el('h3', null, '我被加入的隊伍'));
        var lst = el('div', 'lst'); var lu = (m.leaders || []);
        if (!lu.length) lst.appendChild(el('div', 'none', '目前沒有人把你放入隊伍'));
        leaders.forEach(function (p, i) {
          var q = p || { uid: lu[i], name: '（讀取失敗）', jobSn: 'job01' }, r = el('div', 'rw', '<img alt="" src="' + jicon(q) + '"><span class="tx"><b>' + esc(q.name) + '</b></span><span class="g">的隊伍</span><button type="button">退出</button>');
          r.querySelector('button').addEventListener('click', function () {
            confirmBox(win, '要從 ' + q.name + ' 的隊伍中退出嗎？', '退出', function () {
              API.leave(q.uid).then(function () { var mm = me(); mm.leaders = (mm.leaders || []).filter(function (x) { return x !== q.uid }); bust(q.uid); load(); C.toast('已退出 ' + q.name + ' 的隊伍') }, function (e) { C.toast(errText(e, '退出')) })
            })
          }); lst.appendChild(r)
        });
        box.appendChild(lst)
      }
    }
    box.insertAdjacentHTML('beforeend', '<div class="none" style="text-align:center">讀取中…</div>');
    load().catch(function () { if (!gone) { box.innerHTML = '<button type="button" class="x">✕</button><div class="none">讀取失敗，請稍後再試</div>'; box.querySelector('.x').addEventListener('click', win.close) } })
  }

  /* ----- 選隊員 ----- */
  function openPicker(parent, done) {
    var win = overlay('pw'), box = win.box, m = me(); box.insertAdjacentHTML('beforeend', '<h2>選擇隊員</h2><h3>依上線時間排列</h3><div class="lst"><div class="none">讀取中…</div></div>');
    API.list().then(function (all) {
      var lst = box.querySelector('.lst'); lst.innerHTML = '';
      all.filter(function (p) { return p.uid !== m.uid && !p.disabled }).forEach(function (p) {
        var inP = (m.party || []).indexOf(p.uid) >= 0, full = !inP && (p.leaders || []).length >= 5, why = inP ? '已在隊伍中' : full ? '已被 5 人加入' : '';
        var r = el('div', 'rw' + (why ? ' off' : ''), '<img alt="" src="' + jicon(p) + '"><span class="tx"><b>' + esc(p.name) + '</b><small>Lv.' + charLv(p) + '　' + esc(jobName(p)) + '・' + (p.lastSeen ? ago(tms(p.lastSeen)) : '—') + '</small></span>' + (why ? '<span class="g">' + why + '</span>' : '<button type="button">放入</button>'));
        var b = r.querySelector('button'); if (b) b.addEventListener('click', function () {
          if ((m.party || []).length >= 5) { C.toast('隊伍已滿'); return } b.disabled = true;
          API.add(p.uid).then(function () { m.party = (m.party || []).concat(p.uid); p.leaders = (p.leaders || []).concat(m.uid); bust(p.uid); syncBtn(); win.close(); C.toast('已把 ' + p.name + ' 放入隊伍'); done() }, function (e) { b.disabled = false; C.toast(errText(e, '放入')) })
        }); lst.appendChild(r)
      });
      if (!lst.children.length) lst.appendChild(el('div', 'none', '目前沒有其他玩家'))
    }, function () { box.querySelector('.lst').innerHTML = '<div class="none">讀取失敗，請稍後再試</div>' })
  }

  /* ----- 聊天 ----- */
  function openChat() {
    var win = overlay('pw'), box = win.box, m = me(), tick = null, off = null;
    box.insertAdjacentHTML('beforeend', '<h2>營地聊天</h2><div class="chat"><div class="e">讀取中…</div></div><div class="cin"><input maxlength="50" placeholder="最多 50 字"><button type="button">送出</button></div><div class="cmsg"></div><h3 style="text-align:center;margin:2px 0 0">只保留最近 30 則</h3>');
    var list = box.querySelector('.chat'), inp = box.querySelector('input'), btn = box.querySelector('.cin button'), msg = box.querySelector('.cmsg');
    function left() { var t = tms(m.chatAt); return t ? Math.max(0, Math.ceil((t + CHAT_GAP - Date.now()) / 1000)) : 0 }
    function paintBtn() { var s = left(); btn.disabled = s > 0; btn.textContent = s > 0 ? '還要 ' + s + ' 秒' : '送出' }
    tick = setInterval(paintBtn, 1000); paintBtn();
    off = API.listen(function (arr) {
      var atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 30; list.innerHTML = '';
      arr.slice().reverse().forEach(function (c) { list.appendChild(el('div', null, '<img alt="" src="' + snIcon(c.jobSn) + '"><span><b>' + esc(c.name) + '</b>　' + esc(c.text) + '</span>')) });
      if (!arr.length) list.appendChild(el('div', 'e', '還沒有人說話'));
      if (atBottom || true) list.scrollTop = list.scrollHeight
    }, function (e) { list.innerHTML = '<div class="e">聊天讀取失敗' + (e && e.code === 'permission-denied' ? '（權限尚未開放）' : '') + '</div>' });
    function send() {
      var t = inp.value.replace(/\s+/g, ' ').trim().slice(0, 50); if (!t || left() > 0) return; btn.disabled = true; msg.textContent = '';
      API.send(t, m.name, jobSn(m)).then(function () { m.chatAt = Date.now(); inp.value = ''; paintBtn() }, function (e) { msg.textContent = e && e.code === 'permission-denied' ? '送出失敗（發言間隔 2 分鐘，或權限尚未開放）' : e && e.code === 'timeout' ? '連線逾時，請再試一次' : '送出失敗，請稍後再試'; paintBtn() })
    }
    btn.addEventListener('click', send); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send() } });
    win.onClose = function () { clearInterval(tick); if (off) off() };
    g.addEventListener('pagehide', function () { if (off) off() })
  }

  /* ----- 別人卡片裡的「他的隊伍」 ----- */
  function fillTeam(box, p, alive) {
    box.hidden = false; var uids = (p.party || []).slice(0, 5);
    box.innerHTML = '<h3>' + (p.uid === me().uid ? '我的隊伍' : '他的隊伍') + '</h3>' + (uids.length ? '<div class="none">讀取中…</div>' : '<div class="none">尚無隊員</div>');
    if (!uids.length) return;
    members(uids).then(function (r) { if (!alive()) return; box.innerHTML = '<h3>' + (p.uid === me().uid ? '我的隊伍' : '他的隊伍') + '</h3>' + r.map(function (q) { return q ? '<div class="m"><img alt="" src="' + jicon(q) + '">' + esc(q.name) + '</div>' : '' }).join('') },
      function () { if (alive()) box.innerHTML = '<h3>他的隊伍</h3><div class="none">讀取失敗</div>' })
  }

  g.Party = {
    init: function (ctx) {
      C = ctx; API = ctx.demo ? demoAPI() : realAPI();
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      var host = document.getElementById('mkHost'); if (!host) return;
      host.addEventListener('click', function (e) { e.stopPropagation() }); host.innerHTML = '<div class="mk"><button type="button" class="mb" id="mkChat">聊天</button><button type="button" class="mb" id="mkParty">隊伍 <small></small></button><button type="button" class="mb" id="mkMail">信件 <small></small></button></div>';
      document.getElementById('mkChat').addEventListener('click', openChat); document.getElementById('mkParty').addEventListener('click', openParty); document.getElementById('mkMail').addEventListener('click', openMail); syncBtn(); mailCount()
    },
    fillTeam: fillTeam, mountTabs: mountTabs, jobName: jobName, jobLv: jobLv, charLv: charLv
  };
})(window);

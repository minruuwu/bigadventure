/* 技能說明文字產生器（技能書頁、戰棋共用）。
   SkillDesc.fromRow(skill_info 那一列) → 技能物件；SkillDesc.fromEff(該技能的 skill_effect 列) → {st, hl}；
   SkillDesc.text(技能物件, st, hl, 狀態說明查詢函式) → 「對敵方單體（隨機）造成 150% 物理傷害……」 */
(function (g) {
  'use strict';
  var SKT = { enemy_single: '敵方單體', enemy_all: '敵方全體', self: '自身', ally_single: '我方單體', ally_all: '我方全體', ally_others: '其他隊友全體' };
  var SKP = { random: '隨機', lowest_hp: '生命力最低', prefer_without_status: '優先沒有此狀態者', prefer_with_debuff: '優先有減益者', random_each: '每一下各自隨機' };
  var SKEL = { fire: '火焰', frost: '冰霜', lightning: '雷電', wind: '疾風', nature: '自然', light: '光明', dark: '黑暗' };
  var SKHT = { target: '目標', self: '自身', ally_all: '我方全體', ally_others: '其他隊友全體', ally_single: '我方單體' };
  var SKHB = { m_atk: '魔法攻擊力', p_atk: '物理攻擊力', sacrificed_hp: '犧牲生命' };
  function pc(x) { return Math.round(parseFloat(x) * 100) + '%' }
  function fromRow(r) {
    return { id: r.skill_id, n: r.skill_name, j: r.job, lv: parseInt(r.job_level, 10) || 0, k: r.kind, t: r.target, p: r.pick, ty: r.type, cr: r.extra_crit_rate, cd: r.extra_crit_damage,
      d: r.part1_dmg, e: r.part1_element, r: r.part1_ratio, d2: r.part2_dmg, e2: r.part2_element, r2: r.part2_ratio, h: parseInt(r.hits, 10) || 1, sh: r.sure_hit === '1', ds: r.skill_desc || '' };
  }
  /* 第一個狀態列當作「附加的狀態」；治療列（value 有數字）都接在說明後面 */
  function fromEff(rows) {
    var st = null, hl = [];
    (rows || []).forEach(function (r) {
      if (r.effect_kind === 'status' && r.status_name && !st) st = { n: r.status_name, turns: r.turns, ch: parseFloat(r.apply_chance) || 1, tg: r.target };
      if (r.effect_kind === 'heal' && parseFloat(r.value)) hl.push({ tg: r.target, v: parseFloat(r.value), b: r.base || 'm_atk', c: r.condition || '' });
    });
    return { st: st, hl: hl };
  }
  function healTxt(hl) {
    return (hl || []).map(function (h) { var who = h.tg === 'ally_single' ? '我方單體（' + (SKP[h.c || 'lowest_hp'] || '生命力最低') + '）' : (SKHT[h.tg] || ''); return '恢復' + who + ' ' + pc(h.v) + ' ' + (SKHB[h.b] || '魔法攻擊力') + '的生命' }).join('，');
  }
  /* stDesc(狀態名) → 狀態說明（沒有就用技能自己的說明） */
  function text(sk, st, hl, stDesc) {
    if (sk.id === 'atk') return '對敵方單體造成 100% 物理傷害。';
    if (sk.k !== 'combat') return sk.ds;
    /* 單體技能的目標可以自己點，不寫「隨機／生命力最低」；只有每一下各自挑目標的多段技保留說明 */
    var a = (SKT[sk.t] || '') + (sk.p === 'random_each' ? '（' + SKP[sk.p] + '）' : ''), o = '', r = parseFloat(sk.r) || 0;
    if (sk.ty === 'damage') { o = '對' + a + '造成 ' + pc(r) + ' ' + (SKEL[sk.e] || '') + (sk.d === 'm' ? '魔法' : '物理') + '傷害' + (sk.h > 1 ? ' × ' + sk.h + ' 次' : ''); if (parseFloat(sk.r2)) o += ' + ' + pc(sk.r2) + ' ' + (SKEL[sk.e2] || '') + (sk.d2 === 'm' ? '魔法' : '物理') + '傷害' }
    else if (sk.ty === 'heal' && r > 0) o = '恢復' + a + '魔法攻擊力 ' + pc(r) + ' 的生命'; else o = '對' + a + '施放';
    if (sk.sh) o += '，必定命中'; if (parseFloat(sk.cr)) o += '，暴擊率 +' + pc(sk.cr); if (parseFloat(sk.cd)) o += '，暴擊傷害 +' + pc(sk.cd);
    if (st) { var sd = (stDesc && stDesc(st.n)) || sk.ds; o += '；' + (sk.ty === 'damage' && st.tg === 'self' ? '自身' : '') + (st.ch < 1 ? Math.round(st.ch * 100) + '% 機率' : '') + '附加「' + st.n + '」' + (st.turns === 'attack' ? '，持續到下次攻擊' : st.turns ? st.turns + ' 回合' : '') + (sd ? '：' + sd : '') }
    else if (sk.ds) o += '；' + sk.ds;
    var hx = healTxt(hl); if (hx && !(sk.ds && !st && /恢復/.test(sk.ds))) o += '；' + hx;
    return o + '。';
  }
  g.SkillDesc = { fromRow: fromRow, fromEff: fromEff, text: text, healTxt: healTxt, pc: pc, SKT: SKT, SKP: SKP, SKEL: SKEL };
})(this);

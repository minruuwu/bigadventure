/* 音效：用 Web Audio 即時合成（不用音效檔，不影響載入）。復古遊戲風格。
   - 開關、音量跟音樂分開：存在這台瀏覽器（localStorage：sfx.on、sfx.vol），預設關閉
   - Sfx.play(name, {force})：播一個音效；force = 不管開關都播（特效測試頁試聽用）
   - Sfx.LIST：[名稱, 中文] 清單
   - 同一瞬間（80 毫秒內）只播最重要的一個：暴擊 > 元素 > 其他 */
(function (g) {
  'use strict';
  var AC = null, master = null, NB = null, last = { t: 0, pr: -1 };
  var LIST = [['slash', '斬擊'], ['stab', '刺擊'], ['blunt', '打擊'], ['shoot', '射擊'], ['magic', '無屬性魔法'],
    ['fire', '火焰'], ['frost', '冰霜'], ['lightning', '雷電'], ['wind', '疾風'], ['nature', '自然'], ['light', '光明'], ['dark', '黑暗'],
    ['crit', '暴擊'], ['miss', '閃開'], ['block', '擋下'], ['buff', '正面'], ['debuff', '負面'], ['heal', '恢復'], ['death', '倒下'], ['revive', '復活']];
  /* 各音效的音量校正（讓聽起來差不多大聲；暴擊、倒下稍大） */
  var GAIN = { slash: 2.8, stab: 1.8, blunt: 0.7, shoot: 1.6, magic: 1.8, fire: 1.6, wind: 6, nature: 1, light: 1, dark: 0.7, crit: 1, miss: 6, block: 1.1, buff: 2.2, debuff: 1.4, heal: 1.2, death: 0.9, revive: 0.8, frost: 1, lightning: 1 };
  function run(name, t) { var m = master, o = AC.createGain(); o.gain.value = GAIN[name] || 1; o.connect(m); master = o; try { S[name](t) } finally { master = m } }
  var PRI = { crit: 3, fire: 2, frost: 2, lightning: 2, wind: 2, nature: 2, light: 2, dark: 2, death: 2, revive: 2 };
  function ls(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v } catch (e) { return d } }
  function isOn() { return ls('sfx.on', '0') === '1' }
  function vol() { var v = parseFloat(ls('sfx.vol', '0.6')); return isNaN(v) ? 0.6 : Math.max(0, Math.min(1, v)) }
  function ctx() {
    if (!AC) { var C = g.AudioContext || g.webkitAudioContext; if (!C) return null; AC = new C(); master = AC.createGain(); master.connect(AC.destination);
      NB = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); var d = NB.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1 }
    if (AC.state === 'suspended') AC.resume(); return AC }
  /* 一個音：波形、起訖頻率（指數滑音）、開始時間、長度、音量、起音 */
  function tone(type, f0, f1, t, dur, v, att, out) {
    var o = AC.createOscillator(), gn = AC.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    att = att || 0.005; gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(v, t + att); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(out || master); o.start(t); o.stop(t + dur + 0.05); return o }
  /* 雜訊：濾波器種類、濾波頻率起訖 */
  function noise(t, dur, v, ft, f0, f1, q, att, out) {
    var s = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain(); s.buffer = NB; s.loop = true;
    f.type = ft || 'bandpass'; f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q || 1;
    att = att || 0.004; gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(v, t + att); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(gn); gn.connect(out || master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05) }
  function bell(f, t, dur, v) { tone('sine', f, f, t, dur, v, 0.004); tone('sine', f * 2.01, f * 2.01, t, dur * 0.5, v * 0.3, 0.004) }
  var N = { /* 音名 → 頻率 */ C5: 523.3, D5: 587.3, E5: 659.3, G5: 784, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568, A6: 1760, C7: 2093 };
  var S = {
    slash: function (t) { noise(t, 0.16, 0.5, 'bandpass', 4200, 700, 1.2, 0.003); tone('triangle', 1400, 500, t, 0.07, 0.12) },
    stab: function (t) { noise(t, 0.05, 0.45, 'highpass', 2500, 2500, 0.7, 0.002); tone('triangle', 1100, 260, t + 0.01, 0.09, 0.3); noise(t + 0.06, 0.05, 0.25, 'lowpass', 900, 300, 0.7) },
    blunt: function (t) { tone('sine', 190, 45, t, 0.18, 0.8, 0.003); noise(t, 0.1, 0.45, 'lowpass', 900, 200, 0.8, 0.002); tone('square', 120, 70, t, 0.06, 0.08) },
    shoot: function (t) { tone('triangle', 520, 230, t, 0.12, 0.3, 0.002); noise(t + 0.02, 0.09, 0.3, 'bandpass', 3000, 1200, 2); noise(t + 0.16, 0.06, 0.4, 'lowpass', 1200, 300, 0.8, 0.002); tone('sine', 160, 70, t + 0.16, 0.08, 0.35) },
    magic: function (t) { [N.C6, N.E6, N.G6, N.C7].forEach(function (f, i) { tone('square', f, f, t + i * 0.035, 0.12, 0.07) }); noise(t, 0.3, 0.12, 'highpass', 6000, 9000, 0.7, 0.02); tone('sine', 300, 900, t, 0.2, 0.15) },
    fire: function (t) { noise(t, 0.42, 0.55, 'bandpass', 350, 1400, 0.9, 0.03); noise(t + 0.05, 0.3, 0.3, 'lowpass', 600, 200, 0.7); for (var i = 0; i < 7; i++) noise(t + 0.05 + Math.random() * 0.3, 0.02, 0.35, 'highpass', 3000, 3000, 1, 0.001); tone('sawtooth', 90, 60, t, 0.35, 0.12, 0.03) },
    frost: function (t) { [2093, 2637, 3136, 3951].forEach(function (f, i) { bell(f, t + i * 0.04, 0.35, 0.1) }); noise(t, 0.16, 0.35, 'highpass', 5000, 3000, 1, 0.002); noise(t + 0.12, 0.2, 0.2, 'highpass', 7000, 7000, 0.7, 0.002) },
    lightning: function (t) { var o = tone('sawtooth', 1600, 70, t, 0.28, 0.25, 0.002), m = AC.createOscillator(), mg = AC.createGain(); m.frequency.value = 55; mg.gain.value = 600; m.connect(mg); mg.connect(o.frequency); m.start(t); m.stop(t + 0.3);
      noise(t, 0.08, 0.6, 'highpass', 1500, 1500, 0.7, 0.001); noise(t + 0.06, 0.25, 0.3, 'bandpass', 2500, 400, 0.8) },
    wind: function (t) { noise(t, 0.5, 0.5, 'bandpass', 300, 2200, 4, 0.12); noise(t + 0.15, 0.35, 0.25, 'bandpass', 1800, 500, 5, 0.05) },
    nature: function (t) { var o = tone('triangle', 196, 160, t, 0.4, 0.3, 0.02), l = AC.createOscillator(), lg = AC.createGain(); l.frequency.value = 12; lg.gain.value = 18; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.45);
      for (var i = 0; i < 5; i++) { var f = 320 + Math.random() * 380; tone('sine', f, f * 1.6, t + 0.05 + i * 0.06, 0.06, 0.15) } noise(t, 0.25, 0.15, 'lowpass', 700, 300, 0.7, 0.02) },
    light: function (t) { [N.A5, N.E6, N.A6].forEach(function (f, i) { bell(f, t + i * 0.05, 0.9, 0.13) }); noise(t, 0.5, 0.08, 'highpass', 8000, 10000, 0.7, 0.05) },
    dark: function (t) { var f = AC.createBiquadFilter(), gn = AC.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(900, t + 0.3); gn.gain.value = 1; f.connect(gn); gn.connect(master);
      tone('sawtooth', 110, 55, t, 0.45, 0.35, 0.25, f); tone('sawtooth', 116, 58, t, 0.45, 0.25, 0.25, f); tone('sine', 55, 40, t + 0.2, 0.35, 0.4, 0.05); noise(t, 0.4, 0.2, 'lowpass', 300, 120, 0.7, 0.25) },
    crit: function (t) { S.blunt(t); noise(t, 0.2, 0.6, 'bandpass', 5000, 900, 1, 0.002); tone('square', 1800, 2400, t + 0.02, 0.12, 0.12); tone('square', 2400, 2400, t + 0.09, 0.15, 0.08) },
    miss: function (t) { noise(t, 0.22, 0.3, 'bandpass', 900, 3200, 3, 0.06) },
    block: function (t) { [1480, 2210, 3170].forEach(function (f) { tone('square', f, f * 0.98, t, 0.22, 0.07, 0.001) }); noise(t, 0.06, 0.4, 'highpass', 3000, 3000, 0.7, 0.001); tone('sine', 140, 90, t, 0.1, 0.4) },
    buff: function (t) { [N.C5, N.E5, N.G5, N.C6].forEach(function (f, i) { tone('square', f, f, t + i * 0.06, 0.14, 0.09) }); noise(t + 0.18, 0.3, 0.08, 'highpass', 7000, 9000, 0.7, 0.03) },
    debuff: function (t) { [659, 587, 523, 415].forEach(function (f, i) { tone('triangle', f, f * 0.97, t + i * 0.07, 0.16, 0.2) }); var o = tone('sawtooth', 130, 90, t, 0.4, 0.1, 0.05) },
    heal: function (t) { bell(N.E6, t, 0.5, 0.15); bell(N.A6, t + 0.1, 0.6, 0.15); for (var i = 0; i < 4; i++) { var f = 2500 + Math.random() * 1500; tone('sine', f, f, t + 0.15 + i * 0.06, 0.12, 0.04) } },
    death: function (t) { tone('square', 420, 55, t, 0.5, 0.15, 0.005); tone('triangle', 300, 40, t, 0.55, 0.2); noise(t + 0.45, 0.15, 0.4, 'lowpass', 500, 150, 0.7, 0.003); tone('sine', 90, 40, t + 0.45, 0.2, 0.4) },
    revive: function (t) { tone('sine', 260, 1300, t, 0.5, 0.2, 0.05); [N.C6, N.E6, N.G6].forEach(function (f, i) { bell(f, t + 0.35 + i * 0.03, 0.9, 0.12) }); noise(t + 0.3, 0.6, 0.08, 'highpass', 6000, 9000, 0.7, 0.1) }
  };
  /* 有音效檔的就播檔案（assets/sfx/<名稱>.mp3，先解碼好才播得即時）；沒有的才用合成的 */
  var BASE = '../assets/', FILES = { slash: 1, stab: 1, shoot: 1, blunt: 1, magic: 1 }, BUF = {}, LOADING = {};
  function loadFile(n) { if (BUF[n] || LOADING[n] || !AC) return LOADING[n]; LOADING[n] = fetch(BASE + 'sfx/' + n + '.mp3?v=1').then(function (r) { return r.arrayBuffer() }).then(function (b) { return new Promise(function (res, rej) { AC.decodeAudioData(b, res, rej) }) }).then(function (buf) { BUF[n] = buf; return buf }).catch(function () { LOADING[n] = null }); return LOADING[n] }
  function playBuf(n, t) { var s = AC.createBufferSource(), gn = AC.createGain(); s.buffer = BUF[n]; gn.gain.value = 1; s.connect(gn); gn.connect(master); s.start(t) }
  function preload() { if (!ctx()) return; Object.keys(FILES).forEach(loadFile) }
  function play(name, o) {
    o = o || {}; if ((!S[name] && !FILES[name]) || (!o.force && !isOn())) return; var c = ctx(); if (!c) return;
    var now = c.currentTime, pr = PRI[name] || 1;
    if (!o.force && now - last.t < 0.08 && pr <= last.pr) return; /* 同一瞬間只留最重要的一個 */
    last = { t: now, pr: pr }; master.gain.value = vol();
    if (FILES[name]) { master.gain.value = vol(); if (BUF[name]) playBuf(name, now + 0.005); else { var p = loadFile(name); if (p) p.then(function () { if (BUF[name]) playBuf(name, AC.currentTime + 0.005) }) } return }
    try { run(name, now + 0.01) } catch (e) {}
  }
  /* 離線算出一個音效的聲音（測試、匯出用）：回傳 Promise<AudioBuffer> */
  function render(name, sec) {
    var C = g.OfflineAudioContext || g.webkitOfflineAudioContext, oc = new C(1, Math.round(44100 * (sec || 1.2)), 44100), sv = [AC, master, NB];
    AC = oc; master = oc.createGain(); master.gain.value = 0.8; master.connect(oc.destination);
    NB = oc.createBuffer(1, 44100, 44100); var d = NB.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    try { run(name, 0.01) } finally { AC = sv[0]; master = sv[1]; NB = sv[2] }
    return oc.startRendering() }
  g.Sfx = { init: function (b) { if (b) BASE = b }, preload: preload, FILES: FILES, render: render, play: play, LIST: LIST, isOn: isOn, vol: vol, set: function (on, v) { try { if (on != null) localStorage.setItem('sfx.on', on ? '1' : '0'); if (v != null) localStorage.setItem('sfx.vol', String(v)) } catch (e) {} } };
})(window);

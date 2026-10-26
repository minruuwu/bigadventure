// Firebase: Google sign-in + one character per account (players/{uid}, names/{nameKey}).
// Loaded as <script type="module">; exposes window.FB and fires a 'fb-ready' event.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp, collection, query, orderBy, limit, getDocs, writeBatch, arrayUnion, arrayRemove, onSnapshot, increment, where, deleteField, documentId } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyDOaardrrtoqBHH7-KOc-OPu9cY2yuHS_E',
  authDomain: 'bigadventure-8033f.firebaseapp.com',
  projectId: 'bigadventure-8033f',
  storageBucket: 'bigadventure-8033f.firebasestorage.app',
  messagingSenderId: '732488307020',
  appId: '1:732488307020:web:412ea31fc4ecb9f6473fe9'
});
const auth = getAuth(app);
const db = getFirestore(app);

let firstUser;
const tmo = (pr, ms = 10000) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms))]);
const ready = new Promise(res => { const off = onAuthStateChanged(auth, u => { firstUser = u; off(); res(u); }); });

// ---- speed-ups: local copy of my player doc (page switches show instantly, then re-check in the background), timeouts ----
const ME_KEY = 'bigadv:me', ME_TTL = 5 * 60 * 1000, LIST_KEY = 'bigadv:list', LIST_TTL = 45 * 1000;
const ser = o => { if (o && typeof o === 'object') { if (typeof o.toMillis === 'function') return o.toMillis(); if (o._methodName) return Date.now(); if (Array.isArray(o)) return o.map(ser); const r = {}; for (const k in o) r[k] = ser(o[k]); return r; } return o; };
const meGet = () => { try { const c = JSON.parse(localStorage.getItem(ME_KEY) || 'null'); return c && c.uid && c.player ? c : null; } catch (e) { return null; } };
const meSet = (uid, player) => { try { localStorage.setItem(ME_KEY, JSON.stringify({ uid, t: Date.now(), player: ser(player) })); } catch (e) {} };
const meClear = () => { try { localStorage.removeItem(ME_KEY); sessionStorage.removeItem(LIST_KEY); } catch (e) {} };
/* 寫入成功後同步本機快取；欄位名稱有點（例如 'jobLv.job07'）時要寫進巢狀的地方，不然快取裡的職業等級會是舊的 */
const mePatch = fields => { const c = meGet(); if (!c) return; try { const f = ser(fields); Object.keys(f).forEach(k => { const ps = k.split('.'); let o = c.player; for (let i = 0; i < ps.length - 1; i++) { if (!o[ps[i]] || typeof o[ps[i]] !== 'object') o[ps[i]] = {}; o = o[ps[i]]; } o[ps[ps.length - 1]] = f[k]; }); c.t = Date.now(); localStorage.setItem(ME_KEY, JSON.stringify(c)); } catch (e) {} };
const withTimeout = (pr, ms) => new Promise((res, rej) => { const t = setTimeout(() => { const e = new Error('timeout'); e.code = 'timeout'; rej(e); }, ms); pr.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
const say = t => { const e = document.getElementById('loading'); if (e) e.textContent = t; };

const nameKeyOf = n => String(n || '').trim().toLowerCase();

const FB = {
  ready,                                   // Promise<user|null> (first auth state)
  user: () => auth.currentUser,
  inApp: () => /Line\/|FBAN|FBAV|Instagram|MicroMessenger|; wv\)/i.test(navigator.userAgent),
  async signIn() { meClear(); const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return (await signInWithPopup(auth, p)).user; },
  signOut: () => { meClear(); return signOut(auth); },
  async getPlayer(uid) { const s = await getDoc(doc(db, 'players', uid)); return s.exists() ? s.data() : null; },
  nameKeyOf,
  validName(n) { n = String(n || '').trim(); if (!n) return '請先寫下名字。'; if (Array.from(n).length > 10) return '名字最多 10 個字。'; if (/[\/]/.test(n) || n === '.' || n === '..') return '名字不能包含「/」。'; return ''; },
  async nameTaken(n) { const s = await getDoc(doc(db, 'names', nameKeyOf(n))); return s.exists(); },
  // {active, max, full}; missing setup docs count as full so nobody slips past the cap
  async capacity() {
    const [s, c] = await Promise.all([getDoc(doc(db, 'meta', 'stats')), getDoc(doc(db, 'meta', 'config'))]);
    const active = s.exists() ? (s.data().active | 0) : 0, max = c.exists() ? (c.data().maxPlayers | 0) : 0;
    return { active, max, full: !s.exists() || !c.exists() || active >= max };
  },
  async createPlayer(data) {
    const u = auth.currentUser; if (!u) throw new Error('not-signed-in');
    const name = String(data.name).trim(), key = nameKeyOf(name);
    const statsRef = doc(db, 'meta', 'stats'), cfgRef = doc(db, 'meta', 'config');
    await runTransaction(db, async tx => {
      const s = await tx.get(statsRef), c = await tx.get(cfgRef), n = await tx.get(doc(db, 'names', key));
      if (!s.exists() || !c.exists()) { const e = new Error('setup-missing'); e.code = 'setup-missing'; throw e; }
      const active = s.data().active | 0;
      if (active >= (c.data().maxPlayers | 0)) { const e = new Error('full'); e.code = 'full'; throw e; }
      if (n.exists()) { const e = new Error('name-taken'); e.code = 'name-taken'; throw e; }
      tx.set(doc(db, 'players', u.uid), Object.assign({}, data, { name, nameKey: key, createdAt: serverTimestamp(), lastSeen: serverTimestamp() }));
      tx.set(doc(db, 'names', key), { uid: u.uid });
      tx.update(statsRef, { active: active + 1 });
    });
  },
  // Saves fields on the signed-in player's own document (appearance, weapon, job, point allocation ...).
  // 營地「想說的話」(最多 50 字);時間用伺服器時間
  async saySet(text) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); const t = String(text).slice(0, 50); await updateDoc(doc(db, 'players', u.uid), { say: t, sayAt: serverTimestamp() }); mePatch({ say: t, sayAt: Date.now() }); },
  // 餵寵物：好感等級 +1、餅乾減少（cookies 與 pets.<id>.lv 一起寫入；規則檢查等級只能 +1、餅乾只能減少）
  async feedPet(id, lv, cookiesLeft) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); await tmo(updateDoc(doc(db, 'players', u.uid), { cookies: cookiesLeft, ['pets.' + id + '.lv']: lv })); const c = meGet(); const pets = Object.assign({}, (c && c.player.pets) || {}); pets[id] = Object.assign({}, pets[id], { lv }); mePatch({ cookies: cookiesLeft, pets }); },
  // 帳棚：寵物「邀請進帳棚」開關（只改 pets.<id>.tent）
  async setPetTent(id, on) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); await tmo(updateDoc(doc(db, 'players', u.uid), { ['pets.' + id + '.tent']: !!on })); const c = meGet(); const pets = Object.assign({}, (c && c.player.pets) || {}); pets[id] = Object.assign({}, pets[id], { tent: !!on }); mePatch({ pets }); },
  // 營地跑馬燈公告：meta/notice = {text, on}；只有管理者能寫
  async noticeGet() { await ready; const s = await withTimeout(getDoc(doc(db, 'meta', 'notice')), 8000); return s.exists() ? s.data() : null; },
  async noticeSet(text, on) { await ready; if (!auth.currentUser) throw new Error('not-signed-in'); await tmo(setDoc(doc(db, 'meta', 'notice'), { text: String(text || '').slice(0, 200), on: !!on })); },
  // 怪物強度倍率：meta/difficulty = {hp, atk}（0.5～2，預設 1）；所有人可讀、只有管理者能寫
  async difficultyGet() { await ready; const s = await withTimeout(getDoc(doc(db, 'meta', 'difficulty')), 6000); const d = s.exists() ? s.data() : {}; const f = v => { v = Number(v); return v >= 0.5 && v <= 2 ? v : 1; }; return { hp: f(d.hp), atk: f(d.atk) }; },
  async difficultySet(hp, atk) { await ready; if (!auth.currentUser) throw new Error('not-signed-in'); await tmo(setDoc(doc(db, 'meta', 'difficulty'), { hp: Number(hp), atk: Number(atk) })); },
  // 鍛造存檔被擋時的檢查：用 REST 讀原始型別，找出哪個欄位不合規則（小數型別的鍛造石或武器等級可以自動修正）
  async forgeCheck() { await ready; const u = auth.currentUser; if (!u) return { why: ['沒有登入'] }; const why = [], fix = { stones: null, lv: {} };
    const tk = await u.getIdToken(); const rr = await withTimeout(fetch('https://firestore.googleapis.com/v1/projects/bigadventure-8033f/databases/(default)/documents/players/' + u.uid, { headers: { Authorization: 'Bearer ' + tk } }), 8000); const j = await rr.json(), F = j.fields || {};
    const ty = v => v ? Object.keys(v)[0] : '無', nv = v => v ? Number(v.integerValue != null ? v.integerValue : v.doubleValue) : 0;
    if (F.stones && !('integerValue' in F.stones)) { why.push('鍛造石存成了' + ty(F.stones)); fix.stones = Math.max(0, Math.floor(nv(F.stones))); }
    const W = (F.weapons && F.weapons.mapValue && F.weapons.mapValue.fields) || {}, OK = ['weapon01','weapon02','weapon03','weapon04','weapon05','weapon06','weapon07','weapon08'];
    Object.keys(W).forEach(k => { if (OK.indexOf(k) < 0) { why.push('武器清單有不認得的項目 ' + k); return; } const w = (W[k].mapValue && W[k].mapValue.fields) || {};
      if (w.lv && !('integerValue' in w.lv)) { why.push(k + ' 等級存成了' + ty(w.lv)); fix.lv[k] = Math.min(100, Math.max(1, Math.floor(nv(w.lv)))); }
      const lv = nv(w.lv) || 1, pts = w.pts && w.pts.arrayValue ? (w.pts.arrayValue.values || []) : null;
      if (pts) { if (pts.length !== 3 || pts.some(x => !('integerValue' in x))) why.push(k + ' 淬火點數格式不對'); else if (pts.reduce((a, x) => a + Number(x.integerValue), 0) * 5 > lv) why.push(k + ' 淬火點數超過上限'); }
      const en = w.ench && w.ench.arrayValue ? (w.ench.arrayValue.values || []) : []; if (en.length > (lv >= 90 ? 3 : lv >= 60 ? 2 : lv >= 30 ? 1 : 0)) why.push(k + ' 符文數量超過上限'); });
    return { why, fix, fixable: fix.stones != null || Object.keys(fix.lv).length > 0, types: 'stones=' + ty(F.stones) }; },
  // 鍛造存檔：鍛造石（只能減少）與各武器等級（只能增加）、淬火點數、附魔同一次寫入；lvs = {武器u_sn: {lv,pts,ench}}
  async myFresh() { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); const p = await withTimeout(FB.getPlayer(u.uid), 12000); if (p) meSet(u.uid, p); return p ? ser(p) : null; },
  // 營地跑馬燈公告：meta/notice = {text, on}；只有管理者能寫
  async noticeGet() { await ready; const s = await withTimeout(getDoc(doc(db, 'meta', 'notice')), 8000); return s.exists() ? s.data() : null; },
  async noticeSet(text, on) { await ready; if (!auth.currentUser) throw new Error('not-signed-in'); await tmo(setDoc(doc(db, 'meta', 'notice'), { text: String(text || '').slice(0, 200), on: !!on })); },
  // 怪物強度倍率：meta/difficulty = {hp, atk}（0.5～2，預設 1）；所有人可讀、只有管理者能寫
  async difficultyGet() { await ready; const s = await withTimeout(getDoc(doc(db, 'meta', 'difficulty')), 6000); const d = s.exists() ? s.data() : {}; const f = v => { v = Number(v); return v >= 0.5 && v <= 2 ? v : 1; }; return { hp: f(d.hp), atk: f(d.atk) }; },
  async difficultySet(hp, atk) { await ready; if (!auth.currentUser) throw new Error('not-signed-in'); await tmo(setDoc(doc(db, 'meta', 'difficulty'), { hp: Number(hp), atk: Number(atk) })); },
  // 獎勵等級遞減：meta/reward = {step, cut, floor}（戰力每超過建議等級 step 級，經驗與鍛造石少 cut，最低保留 floor）；所有人可讀、只有管理者能寫
  async rewardGet() { await ready; const s = await withTimeout(getDoc(doc(db, 'meta', 'reward')), 6000); const d = s.exists() ? s.data() : {}; const st = parseInt(d.step, 10), c = Number(d.cut), f = Number(d.floor);
    return { step: st >= 1 && st <= 50 ? st : 3, cut: c >= 0 && c <= 1 ? c : 0.1, floor: f >= 0 && f <= 1 ? f : 0.1 }; },
  async rewardSet(step, cut, floor) { await ready; if (!auth.currentUser) throw new Error('not-signed-in'); await tmo(setDoc(doc(db, 'meta', 'reward'), { step: parseInt(step, 10), cut: Number(cut), floor: Number(floor) })); },
  // 鍛造存檔被擋時的檢查：用 REST 讀原始型別，找出哪個欄位不合規則（小數型別的鍛造石或武器等級可以自動修正）
  async forgeCheck() { await ready; const u = auth.currentUser; if (!u) return { why: ['沒有登入'] }; const why = [], fix = { stones: null, lv: {} };
    const tk = await u.getIdToken(); const rr = await withTimeout(fetch('https://firestore.googleapis.com/v1/projects/bigadventure-8033f/databases/(default)/documents/players/' + u.uid, { headers: { Authorization: 'Bearer ' + tk } }), 8000); const j = await rr.json(), F = j.fields || {};
    const ty = v => v ? Object.keys(v)[0] : '無', nv = v => v ? Number(v.integerValue != null ? v.integerValue : v.doubleValue) : 0;
    if (F.stones && !('integerValue' in F.stones)) { why.push('鍛造石存成了' + ty(F.stones)); fix.stones = Math.max(0, Math.floor(nv(F.stones))); }
    const W = (F.weapons && F.weapons.mapValue && F.weapons.mapValue.fields) || {}, OK = ['weapon01','weapon02','weapon03','weapon04','weapon05','weapon06','weapon07','weapon08'];
    Object.keys(W).forEach(k => { if (OK.indexOf(k) < 0) { why.push('武器清單有不認得的項目 ' + k); return; } const w = (W[k].mapValue && W[k].mapValue.fields) || {};
      if (w.lv && !('integerValue' in w.lv)) { why.push(k + ' 等級存成了' + ty(w.lv)); fix.lv[k] = Math.min(100, Math.max(1, Math.floor(nv(w.lv)))); }
      const lv = nv(w.lv) || 1, pts = w.pts && w.pts.arrayValue ? (w.pts.arrayValue.values || []) : null;
      if (pts) { if (pts.length !== 3 || pts.some(x => !('integerValue' in x))) why.push(k + ' 淬火點數格式不對'); else if (pts.reduce((a, x) => a + Number(x.integerValue), 0) * 5 > lv) why.push(k + ' 淬火點數超過上限'); }
      const en = w.ench && w.ench.arrayValue ? (w.ench.arrayValue.values || []) : []; if (en.length > (lv >= 90 ? 3 : lv >= 60 ? 2 : lv >= 30 ? 1 : 0)) why.push(k + ' 符文數量超過上限'); });
    return { why, fix, fixable: fix.stones != null || Object.keys(fix.lv).length > 0, types: 'stones=' + ty(F.stones) }; },
  // 鍛造存檔：鍛造石用「減少花掉的量」寫入（不寫絕對值），手機上的舊快取不會蓋掉伺服器上的數字
  async saveForge(spent, lvs, fix) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); const f = {}; if (fix && fix.stones != null) f.stones = Math.max(0, fix.stones - spent); else if (spent > 0) f.stones = increment(-spent); if (fix && fix.lv) Object.keys(fix.lv).forEach(k => { if (!lvs[k]) f['weapons.' + k + '.lv'] = fix.lv[k]; }); Object.keys(lvs).forEach(k => { const v = lvs[k]; f['weapons.' + k + '.lv'] = v.lv; f['weapons.' + k + '.pts'] = v.pts; f['weapons.' + k + '.ench'] = v.ench; }); await tmo(updateDoc(doc(db, 'players', u.uid), f)); const c = meGet(); const weapons = Object.assign({}, (c && c.player.weapons) || {}); Object.keys(lvs).forEach(k => { weapons[k] = Object.assign({}, weapons[k], lvs[k]); }); mePatch({ stones: Math.max(0, ((c && c.player.stones) | 0) - spent), weapons }); },
  // 符文碎片兌換：x 的碎片 −10、id 的碎片 +1（increment，不怕快取舊）
  async runeConvert(x, id) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in');
    /* 先讀最新的碎片數，寫入換算後的數字（不用 increment，理由同秘境） */
    const s0 = await withTimeout(getDoc(doc(db, 'players', u.uid)), 10000); const d = s0.exists() ? s0.data() : {}, rs0 = d.rs || {};
    if ((rs0[x] | 0) < 10) throw Object.assign(new Error('碎片不足'), { code: 'not-enough' });
    await tmo(updateDoc(doc(db, 'players', u.uid), { ['rs.' + x]: (rs0[x] | 0) - 10, ['rs.' + id]: (rs0[id] | 0) + 1, rsFrom: x, rsTo: id }));
    const rs = Object.assign({}, rs0); rs[x] = (rs[x] | 0) - 10; rs[id] = (rs[id] | 0) + 1; mePatch({ rs }); },
  // 符文改版遷移：所有武器的附魔清空，標記 runeV = 2（只做一次）
  async runeMigrate(ks) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); const f = { runeV: 2 }; (ks || []).forEach(k => { f['weapons.' + k + '.ench'] = []; }); await tmo(updateDoc(doc(db, 'players', u.uid), f)); const c = meGet(), weapons = Object.assign({}, (c && c.player.weapons) || {}); (ks || []).forEach(k => { weapons[k] = Object.assign({}, weapons[k], { ench: [] }); }); mePatch({ runeV: 2, weapons }); },
  // 秘境勝利：碎片用 increment 加上去、這間的最高等級往前、今天的次數（日期換了就從 1 算），同一次寫入；第一次打秘境也順便做符文遷移
  async riftWin(r) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in');
    /* 存檔前先讀一次自己的最新資料：今日次數、這間房的進度、是否已轉新版都以資料庫為準（避免畫面上的資料過期，例如管理後台剛改過） */
    let d = {}; try { const s0 = await withTimeout(getDoc(doc(db, 'players', u.uid)), 10000); d = s0.exists() ? s0.data() : {}; } catch (e) { d = null; }
    if (d) { r = Object.assign({}, r); const used = d.riftDay === r.day ? (d.riftN | 0) : 0; r.n = used + 1; const ob = ((d.rift || {})[r.room]) | 0; r.best = r.lv && r.lv > ob ? r.lv : 0; r.migrate = (d.runeV | 0) >= 2 ? null : Object.keys(d.weapons || {}); }
    const f = { riftAt: serverTimestamp(), riftDay: r.day, riftN: r.n, riftRm: r.room, riftDbg: deleteField() };
    /* 碎片寫入「加完之後的數字」而不是 increment：規則對巢狀欄位的 increment 做加減比對會失敗（秘境除錯查出來的） */
    Object.keys(r.shards || {}).forEach(k => { f['rs.' + k] = d ? (((d.rs || {})[k]) | 0) + r.shards[k] : increment(r.shards[k]); }); if (r.best) f['rift.' + r.room] = r.best;
    if (r.migrate) { f.runeV = 2; (r.migrate || []).forEach(k => { f['weapons.' + k + '.ench'] = []; }); }
    try { await tmo(updateDoc(doc(db, 'players', u.uid), f)); } catch (e) {
      /* 【暫時除錯】管理者帳號被擋時，從少到多試著跳過第 1～8 組規則檢查重試，第一個成功的組合就是擋住的那幾組 */
      let ok = 0; const codes = []; if (e && e.code === 'permission-denied' && String(u.email || '').toLowerCase() === 'minruu0215@gmail.com') { const sets = []; for (let a = 1; a <= 5; a++) sets.push([a]); for (let a = 1; a <= 5; a++) for (let b = a + 1; b <= 5; b++) sets.push([a, b]); sets.push([1, 2, 3, 4, 5]); for (const l of sets) { if (ok) break; try { await tmo(updateDoc(doc(db, 'players', u.uid), Object.assign({}, f, { riftDbg: l, riftAt: serverTimestamp() }))); ok = l.join('、'); } catch (e3) { codes.push(l.join('') + ':' + (e3 && e3.code)); } } }
      if (!ok) { try { e.why = await this.riftWhy(r, d || {}); } catch (e2) { e.why = ['檢查失敗']; } if (e && e.code === 'permission-denied' && String(u.email || '').toLowerCase() === 'minruu0215@gmail.com') e.why.push('除錯：跳過任何一組都過不了（欄位白名單或除錯規則還沒發布）'); throw e; }
      let ty = ''; try { const tk = await u.getIdToken(); const rr = await withTimeout(fetch('https://firestore.googleapis.com/v1/projects/bigadventure-8033f/databases/(default)/documents/players/' + u.uid, { headers: { Authorization: 'Bearer ' + tk } }), 8000); const j = await rr.json(), F = j.fields || {}, rsF = F.rs && F.rs.mapValue && F.rs.mapValue.fields || {};
        ty = '；房間 ' + r.room + '；存檔前：日=' + (d && d.riftDay) + ' 次=' + (d && d.riftN) + ' 隔=' + (d && d.riftAt && d.riftAt.toMillis ? Math.round((Date.now() - d.riftAt.toMillis()) / 1000) + '秒' : '無') + ' 進度=' + (d && d.rift ? JSON.stringify(d.rift) : '無') + ' 碎片=' + (d && d.rs ? JSON.stringify(d.rs) : '無') + '；寫入：日=' + r.day + ' 次=' + r.n + ' 進度=' + r.best + ' 碎片+' + JSON.stringify(r.shards) + '；失敗碼：' + (codes.filter(c => !/permission-denied/.test(c)).join(' ') || '全是 permission-denied') + '；存檔後碎片 ' + Object.keys(rsF).sort().map(k => k.replace('rune', '') + '=' + Object.keys(rsF[k])[0].replace('Value', '') + ':' + Object.values(rsF[k])[0]).join(' '); } catch (e4) { }
      r = Object.assign({}, r, { dbg: ok + ty }); }
    const c = meGet(), pl = (c && c.player) || {}, rs = Object.assign({}, (d && d.rs) || pl.rs || {}), rift = Object.assign({}, (d && d.rift) || pl.rift || {});
    Object.keys(r.shards || {}).forEach(k => { rs[k] = (rs[k] | 0) + r.shards[k]; }); if (r.best) rift[r.room] = r.best; const p2 = { rs, rift, riftDay: r.day, riftN: r.n }; if (r.migrate) p2.runeV = 2; mePatch(p2); return r; },
  /* 秘境存檔被擋時，照資料庫規則逐項檢查，找出是哪一條不符合 */
  async riftWhy(r, d) { const why = [], RK = [], WK = []; for (let i = 1; i <= 26; i++) RK.push('rune' + String(i).padStart(2, '0')); for (let i = 1; i <= 8; i++) WK.push('weapon0' + i);
    const at = d.riftAt && d.riftAt.toMillis ? d.riftAt.toMillis() : 0; if (at && Date.now() - at < 10000) why.push('距離上一場秘境存檔不到 10 秒');
    if (r.n > 10) why.push('今天已經打滿 10 次（資料庫 riftN=' + (d.riftN | 0) + '）');
    const bad = Object.keys(d.rs || {}).filter(k => RK.indexOf(k) < 0); if (bad.length) why.push('碎片裡有不認得的欄位：' + bad.join('、'));
    const tot = Object.keys(r.shards || {}).reduce((a, k) => a + r.shards[k], 0); if (tot < 2 || tot > 5) why.push('這場碎片共 ' + tot + ' 片（規則要 2～5）');
    if (r.pool && Object.keys(r.shards || {}).some(k => r.pool.indexOf(k) < 0)) why.push('掉落的碎片不在這間房的符文池');
    const rb = Object.keys(d.rift || {}).filter(k => !/^r[1-7]$/.test(k)); if (rb.length) why.push('秘境進度有不認得的房間：' + rb.join('、'));
    const ob = ((d.rift || {})[r.room]) | 0; if (r.best && (r.best % 10 || r.best > 200 || r.best > ob + 10)) why.push('進度 Lv' + r.best + ' 跳太多（資料庫是 Lv' + ob + '）');
    if (r.migrate) { const wb = Object.keys(d.weapons || {}).filter(k => WK.indexOf(k) < 0); if (wb.length) why.push('武器裡有不認得的欄位：' + wb.join('、')); }
    try { const tk = await auth.currentUser.getIdToken(); const rr = await withTimeout(fetch('https://firestore.googleapis.com/v1/projects/bigadventure-8033f/databases/(default)/documents/players/' + auth.currentUser.uid, { headers: { Authorization: 'Bearer ' + tk } }), 8000); const j = await rr.json(), F = j.fields || {};
      const rsF = F.rs && F.rs.mapValue && F.rs.mapValue.fields || {}; Object.keys(rsF).forEach(k => { if (!('integerValue' in rsF[k])) why.push(k + ' 碎片存成了小數或其他型別'); });
      const rfF = F.rift && F.rift.mapValue && F.rift.mapValue.fields || {}; Object.keys(rfF).forEach(k => { if (!('integerValue' in rfF[k])) why.push('秘境進度 ' + k + ' 不是整數'); });
      if (F.riftN && !('integerValue' in F.riftN)) why.push('riftN 不是整數'); } catch (e) { }
    if (!why.length) why.push('資料檢查都正常（規則還在除錯中）');
    why.push('存檔前：日=' + d.riftDay + ' 次=' + d.riftN + ' 隔=' + (at ? Math.round((Date.now() - at) / 1000) + '秒' : '無') + ' 版=' + (d.runeV | 0) + ' 武器=' + Object.keys(d.weapons || {}).join('/') + ' 進度=' + JSON.stringify(d.rift || {}) + ' 碎片=' + JSON.stringify(d.rs || {}) + '；寫入：房=' + r.room + ' 日=' + r.day + ' 次=' + r.n + ' 進度=' + r.best + ' 遷移=' + (r.migrate ? r.migrate.join('/') : '否') + ' 碎片+' + JSON.stringify(r.shards || {}));
    return why; },
  // 冒險勝利：自己的經驗、鍛造石（、寵物餅乾）用 increment 加上去，關卡進度往前；隊友的分成累積在自己（隊長）資料的 owe.<隊友uid> 裡，同一次寫入
  // 存檔前讀一次自己的最新資料：用最新的隊伍名單過濾隊友分成、檢查跟上一場的間隔；失敗時附上判斷到的原因（e.why）
  async advCheck(r) { await ready; const u = auth.currentUser; if (!u) return {}; const s = await withTimeout(getDoc(doc(db, 'players', u.uid)), 10000); const d = s.exists() ? s.data() : {};
    const at = d.advAt && d.advAt.toMillis ? d.advAt.toMillis() : 0, party = d.party || [], why = [];
    if (at && Date.now() - at < 20000) why.push('距離上一場存檔不到 20 秒');
    if ((r.share || []).some(m => party.indexOf(m.to) < 0)) why.push('隊伍名單已變動');
    const cur = ((d.adv || {})[r.area]) | 0; if (r.clear && r.clear > cur + 1) why.push('關卡進度跳太多（資料庫是第 ' + cur + ' 關）');
    ['exp', 'stones', 'cookies'].forEach(k => { if (d[k] != null && !Number.isInteger(d[k])) why.push(k + ' 不是整數（' + d[k] + '）'); });
    /* 用 REST 讀原始型別（SDK 分不出整數和小數）：規則要求 exp、stones、adv 是整數型別 */
    try { const tk = await u.getIdToken(); const rr = await withTimeout(fetch('https://firestore.googleapis.com/v1/projects/bigadventure-8033f/databases/(default)/documents/players/' + u.uid, { headers: { Authorization: 'Bearer ' + tk } }), 8000); const j = await rr.json(), F = j.fields || {};
      const ty = v => v ? Object.keys(v)[0] : '無'; const types = ['exp', 'stones', 'cookies', 'advAt', 'party', 'owe'].map(k => k + '=' + ty(F[k])); const ad = F.adv && F.adv.mapValue && F.adv.mapValue.fields || {}; types.push('adv.area01=' + ty(ad.area01));
      ['exp', 'stones', 'cookies'].forEach(k => { if (F[k] && !('integerValue' in F[k])) why.push(k + ' 存成了' + ty(F[k]) + '（規則要整數）'); }); if (ad.area01 && !('integerValue' in ad.area01)) why.push('adv.area01 存成了' + ty(ad.area01));
      why.types = types.join(' '); } catch (e) { why.types = 'REST 讀取失敗 ' + (e && e.message); }
    return { party, at, why, types: why.types, cur, adv: d.adv || {} }; }, /* cur = 資料庫裡這一章目前的進度（換手機打過時會比這台新） */
  async advWin(r) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); const f = { exp: increment(r.exp), stones: increment(r.stones), advAt: serverTimestamp() };
    if (r.cookie) f.cookies = increment(1); if (r.clear) f['adv.' + r.area] = r.clear;
    (r.share || []).forEach(m => { f['owe.' + m.to + '.exp'] = increment(m.exp); f['owe.' + m.to + '.stones'] = increment(m.stones); });
    await tmo(updateDoc(doc(db, 'players', u.uid), f)); const c = meGet(), pl = (c && c.player) || {}, adv = Object.assign({}, pl.adv || {}); if (r.clear) adv[r.area] = r.clear;
    mePatch({ exp: (pl.exp | 0) + r.exp, stones: (pl.stones | 0) + r.stones, cookies: (pl.cookies | 0) + (r.cookie ? 1 : 0), adv }); },
  // 隊友分成：讀把我加進隊伍的隊長們，看各自累積了多少（owe.<我的uid>）
  // 加速：隊長名單先用本機快取（不用先等伺服器讀自己的資料）；自己的最新資料與所有隊長的資料「同時」讀，
  //       隊長用一個查詢一次讀完（documentId in [...]，一次最多 30 位），不再一人一個請求
  async shareList() { await ready; const u = auth.currentUser; if (!u) return { list: [], claims: {} };
    const c0 = meGet(), cached = c0 && c0.uid === u.uid ? c0.player : null;
    const fresh = withTimeout(FB.getPlayer(u.uid), 10000).catch(() => withTimeout(FB.getPlayer(u.uid), 12000)).catch(() => null);
    const leadersOf = me => { const cur = ((me && me.leaders) || []).slice(0, 5), past = ((me && me.pastLeaders) || []); return { cur, past, ls: cur.concat(past.filter(l => cur.indexOf(l) < 0).slice(-10)) }; };
    const readMany = async ids => { const out = []; for (let i = 0; i < ids.length; i += 30) { const part = ids.slice(i, i + 30), q = query(collection(db, 'players'), where(documentId(), 'in', part));
        const snap = await withTimeout(getDocs(q), 10000).catch(() => withTimeout(getDocs(q), 12000)); snap.forEach(d => out.push(Object.assign({ uid: d.id }, ser(d.data())))); } return out; };
    let me = cached; if (!me) { me = await fresh; if (!me) { const e = new Error('timeout'); e.code = 'timeout'; throw e; } }
    let L = leadersOf(me);
    const [docs0, me2] = await Promise.all([L.ls.length ? readMany(L.ls) : Promise.resolve([]), fresh]);
    let docs = docs0;
    if (me2) { me = me2; meSet(u.uid, me2); const L2 = leadersOf(me2), extra = L2.ls.filter(l => L.ls.indexOf(l) < 0); L = L2; if (extra.length) docs = docs.concat(await readMany(extra).catch(() => [])); }
    /* 現在的隊長補記到 pastLeaders（被移出後還能領以前累積的分成）；最多保留最近 20 位；背景寫入，不卡讀信 */
    const miss = L.cur.filter(l => L.past.indexOf(l) < 0); if (miss.length && me2) { const np = L.past.concat(miss).slice(-20); updateDoc(doc(db, 'players', u.uid), { pastLeaders: np }).catch(() => {}); }
    docs = docs.filter(d => L.ls.indexOf(d.uid) >= 0);
    return { list: docs.map(d => { const o = (d.owe || {})[u.uid] || {}; return { uid: d.uid, name: d.name, exp: o.exp | 0, stones: o.stones | 0, past: L.cur.indexOf(d.uid) < 0 }; }).filter(x => !x.past || x.exp || x.stones), claims: ser((me && me.claims) || {}) }; },
  // 領取某位隊長那邊的分成：自己加經驗、鍛造石並記下領取時間；隊長那邊的 owe.<我> 刪掉（同一批寫入，規則核對金額與每天早上 6 點的領取週期）
  async shareClaim(L) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); const lr = doc(db, 'players', L), mr = doc(db, 'players', u.uid);
    const got = await tmo(runTransaction(db, async tx => { const ls = await tx.get(lr); const o = ((ls.exists() && ls.data().owe) || {})[u.uid] || {}; const e = o.exp | 0, st = o.stones | 0;
      tx.update(mr, { exp: increment(e), stones: increment(st), ['claims.' + L]: serverTimestamp(), claimFrom: L }); tx.update(lr, { ['owe.' + u.uid]: deleteField() }); return { exp: e, stones: st }; }));
    const c = meGet(), pl = (c && c.player) || {}, claims = Object.assign({}, pl.claims || {}); claims[L] = Date.now(); mePatch({ exp: (pl.exp | 0) + got.exp, stones: (pl.stones | 0) + got.stones, claims }); return got; },
  // 管理後台（admin/ 頁面用；寫入是否允許由 Firestore 規則依管理者 email 決定）
  async adminList(n) { await ready; const s = await withTimeout(getDocs(query(collection(db, 'players'), orderBy('lastSeen', 'desc'), limit(n || 200))), 15000); return s.docs.map(d => Object.assign({ uid: d.id }, ser(d.data()))); },
  // 管理後台：所有人的組隊分紅（owe）歸零；回傳清掉幾位。需要 Firestore 規則的管理者欄位清單包含 'owe'
  async adminClearOwe() { await ready; if (!auth.currentUser) throw new Error('not-signed-in');
    const s = await withTimeout(getDocs(collection(db, 'players')), 20000), hit = s.docs.filter(d => { const o = d.data().owe; return o && typeof o === 'object' && Object.keys(o).length; });
    for (let i = 0; i < hit.length; i += 400) { const b = writeBatch(db); hit.slice(i, i + 400).forEach(d => b.update(d.ref, { owe: deleteField() })); await withTimeout(b.commit(), 20000); }
    return hit.length; },
  async adminUpdate(uid, fields) { await ready; if (!auth.currentUser) throw new Error('not-signed-in'); await updateDoc(doc(db, 'players', uid), fields); },
  // ---- 組隊：leader doc `party`(最多 3 個隊員 uid，全隊 4 人)、member doc `leaders`(把我放進隊伍的隊長 uid，最多 5 個)，兩邊用 batch 一起寫 ----
  async getPlayers(uids) { await ready; return Promise.all((uids || []).map(u => withTimeout(getDoc(doc(db, 'players', u)), 10000).then(s => s.exists() ? Object.assign({ uid: u }, ser(s.data())) : null).catch(() => null))); },
  async partyAdd(uid) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); const b = writeBatch(db); b.update(doc(db, 'players', u.uid), { party: arrayUnion(uid) }); b.update(doc(db, 'players', uid), { leaders: arrayUnion(u.uid), pastLeaders: arrayUnion(u.uid) }); await tmo(b.commit()); const c = meGet(); mePatch({ party: ((c && c.player.party) || []).filter(x => x !== uid).concat(uid) }); },
  async partyRemove(uid) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); const b = writeBatch(db); b.update(doc(db, 'players', u.uid), { party: arrayRemove(uid) }); b.update(doc(db, 'players', uid), { leaders: arrayRemove(u.uid) }); await tmo(b.commit()); const c = meGet(); mePatch({ party: ((c && c.player.party) || []).filter(x => x !== uid) }); },
  async partyLeave(leaderUid) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); const b = writeBatch(db); b.update(doc(db, 'players', u.uid), { leaders: arrayRemove(leaderUid) }); b.update(doc(db, 'players', leaderUid), { party: arrayRemove(u.uid) }); await tmo(b.commit()); const c = meGet(); mePatch({ leaders: ((c && c.player.leaders) || []).filter(x => x !== leaderUid) }); },
  // ---- 營地聊天：chat/s00..s29 輪流覆蓋(只留 30 則)，chat/meta.n 是已發言總數；聊天視窗開著才監聽 ----
  chatListen(cb, onErr) { return onSnapshot(query(collection(db, 'chat'), orderBy('at', 'desc'), limit(30)), s => cb(s.docs.map(d => { const v = d.data(); return { id: d.id, uid: v.uid, name: v.name, jobSn: v.jobSn, text: v.text, at: v.at && v.at.toMillis ? v.at.toMillis() : Date.now() }; })), e => onErr && onErr(e)); },
  async chatSend(text, name, jobSn) {
    await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in');
    const t = String(text).replace(/\s+/g, ' ').trim().slice(0, 50); if (!t) return;
    const metaRef = doc(db, 'chat', 'meta'), pRef = doc(db, 'players', u.uid);
    await tmo(runTransaction(db, async tx => {
      const m = await tx.get(metaRef), n = m.exists() ? (m.data().n | 0) : 0, id = 's' + String(n % 30).padStart(2, '0');
      tx.set(doc(db, 'chat', id), { uid: u.uid, name, jobSn: jobSn || '', text: t, at: serverTimestamp() });
      tx.set(metaRef, { n: n + 1 });
      tx.update(pRef, { chatAt: serverTimestamp() });
    }));
    mePatch({ chatAt: Date.now() });
  },
  async updatePlayer(fields) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); await tmo(updateDoc(doc(db, 'players', u.uid), fields)); mePatch(fields); },
  // Rename: names must stay unique; at most 3 renames; the old name is released after success.
  async renamePlayer(newName) {
    await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in');
    const name = String(newName).trim(), key = nameKeyOf(name), pRef = doc(db, 'players', u.uid);
    await runTransaction(db, async tx => {
      const p = await tx.get(pRef); if (!p.exists()) throw new Error('no-player');
      const d = p.data(), used = d.renames | 0;
      if (used >= 3) { const e = new Error('no-renames'); e.code = 'no-renames'; throw e; }
      const oldKey = d.nameKey || nameKeyOf(d.name);
      if (key !== oldKey) {
        const n = await tx.get(doc(db, 'names', key));
        if (n.exists()) { const e = new Error('name-taken'); e.code = 'name-taken'; throw e; }
        tx.set(doc(db, 'names', key), { uid: u.uid });
        tx.delete(doc(db, 'names', oldKey));
      }
      tx.update(pRef, { name, nameKey: key, renames: used + 1 });
    });
    mePatch({ name, nameKey: key, renames: (meGet() && meGet().player.renames | 0) + 1 });
  },
  // Marks the signed-in player as recently online (players/{uid}.lastSeen).
  async touch() { await ready; const u = auth.currentUser; if (!u) return; try { await updateDoc(doc(db, 'players', u.uid), { lastSeen: serverTimestamp() }); } catch (e) { console.warn('touch failed', e.code || e); } },
  // Most recently online players: [{uid, ...data, lastSeen: millis}]
  async listPlayers(n) {
    const key = LIST_KEY + ':' + (n || 30);
    try { const c = JSON.parse(sessionStorage.getItem(key) || 'null'); if (c && Date.now() - c.t < LIST_TTL) return c.list; } catch (e) {}
    const s = await withTimeout(getDocs(query(collection(db, 'players'), orderBy('lastSeen', 'desc'), limit(n || 30))), 12000);
    const list = s.docs.map(d => { const v = ser(d.data()); return Object.assign({ uid: d.id }, v, { lastSeen: v.lastSeen || 0 }); });
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), list })); } catch (e) {}
    return list;
  },

  // For game pages: resolves {user, player} or sends the visitor to login / registration.
  async requirePlayer(root) {
    const beat = () => { FB.touch(); if (!FB._beat) FB._beat = setInterval(() => { if (document.visibilityState === 'visible') FB.touch(); }, 5 * 60 * 1000); };
    const cached = meGet();
    if (cached && Date.now() - cached.t < ME_TTL) {
      // show the saved copy right away; check the account and refresh it in the background
      (async () => {
        try {
          const u = await withTimeout(ready, 20000);
          if (!u) { meClear(); location.replace(root); return; }
          if (u.uid !== cached.uid) { meClear(); location.reload(); return; }
          const p = await withTimeout(FB.getPlayer(u.uid), 20000);
          if (!p) { meClear(); location.replace(root + 'create/'); return; }
          if (p.disabled) { meClear(); location.replace(root); return; }
          meSet(u.uid, p); beat();
          if (JSON.stringify(ser(p)) !== JSON.stringify(cached.player)) window.dispatchEvent(new CustomEvent('fb-player-updated', { detail: ser(p) }));
        } catch (e) { console.warn('background check failed', e.code || e); }
      })();
      return { user: { uid: cached.uid }, player: cached.player, cached: true };
    }
    let lastErr;
    for (let i = 0; i < 2; i++) {
      try {
        const u = await withTimeout(ready, 10000);
        if (!u) { meClear(); location.replace(root); return new Promise(() => {}); }
        const p = await withTimeout(FB.getPlayer(u.uid), 10000);
        if (!p) { meClear(); location.replace(root + 'create/'); return new Promise(() => {}); }
        if (p.disabled) { meClear(); location.replace(root); return new Promise(() => {}); }
        meSet(u.uid, p); beat();
        return { user: u, player: p };
      } catch (e) { lastErr = e; if (i === 0) say('連線不穩，正在重試…'); }
    }
    const el = document.getElementById('loading');
    say('連線逾時，點一下重新載入'); if (el) { el.style.cursor = 'pointer'; el.addEventListener('click', () => location.reload()); }
    throw new Error('連線逾時，點一下重新載入（' + ((lastErr && (lastErr.code || lastErr.message)) || '') + '）');
  }
};
window.FB = FB;
window.dispatchEvent(new Event('fb-ready'));

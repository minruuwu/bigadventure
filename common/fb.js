// Firebase: Google sign-in + one character per account (players/{uid}, names/{nameKey}).
// Loaded as <script type="module">; exposes window.FB and fires a 'fb-ready' event.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp, collection, query, orderBy, limit, getDocs, writeBatch, arrayUnion, arrayRemove, onSnapshot, increment, where, deleteField } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
    return { party, at, why, types: why.types }; },
  async advWin(r) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); const f = { exp: increment(r.exp), stones: increment(r.stones), advAt: serverTimestamp() };
    if (r.cookie) f.cookies = increment(1); if (r.clear) f['adv.' + r.area] = r.clear;
    (r.share || []).forEach(m => { f['owe.' + m.to + '.exp'] = increment(m.exp); f['owe.' + m.to + '.stones'] = increment(m.stones); });
    await tmo(updateDoc(doc(db, 'players', u.uid), f)); const c = meGet(), pl = (c && c.player) || {}, adv = Object.assign({}, pl.adv || {}); if (r.clear) adv[r.area] = r.clear;
    mePatch({ exp: (pl.exp | 0) + r.exp, stones: (pl.stones | 0) + r.stones, cookies: (pl.cookies | 0) + (r.cookie ? 1 : 0), adv }); },
  // 隊友分成：讀把我加進隊伍的隊長們，看各自累積了多少（owe.<我的uid>）
  async shareList() { await ready; const u = auth.currentUser; if (!u) return { list: [], claims: {} };
    /* 讀自己的資料：連線慢時重試一次，還是不行就用本機快取（隊長名單、領取紀錄不常變） */
    let me = null; try { me = await withTimeout(FB.getPlayer(u.uid), 8000); } catch (e) { try { me = await withTimeout(FB.getPlayer(u.uid), 12000); } catch (e2) { const c = meGet(); if (c && c.uid === u.uid) me = c.player; else throw e2; } }
    const cur = ((me && me.leaders) || []).slice(0, 5), past = ((me && me.pastLeaders) || []);
    /* 現在的隊長補記到 pastLeaders（被移出後還能領以前累積的分成）；最多保留最近 20 位 */
    const miss = cur.filter(l => past.indexOf(l) < 0); if (miss.length) { const np = past.concat(miss).slice(-20); updateDoc(doc(db, 'players', u.uid), { pastLeaders: np }).catch(() => {}); } /* 背景寫入，不卡讀信 */
    const old = past.filter(l => cur.indexOf(l) < 0).slice(-10), ls = cur.concat(old);
    const one = l => withTimeout(getDoc(doc(db, 'players', l)), 10000).catch(() => withTimeout(getDoc(doc(db, 'players', l)), 12000));
    const docs = await Promise.all(ls.map(l => one(l).then(s => s.exists() ? Object.assign({ uid: l }, ser(s.data())) : null).catch(() => null)));
    return { list: docs.filter(Boolean).map(d => { const o = (d.owe || {})[u.uid] || {}; return { uid: d.uid, name: d.name, exp: o.exp | 0, stones: o.stones | 0, past: cur.indexOf(d.uid) < 0 }; }).filter(x => !x.past || x.exp || x.stones), claims: ser((me && me.claims) || {}) }; },
  // 領取某位隊長那邊的分成：自己加經驗、鍛造石並記下領取時間；隊長那邊的 owe.<我> 刪掉（同一批寫入，規則核對金額與每天早上 6 點的領取週期）
  async shareClaim(L) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); const lr = doc(db, 'players', L), mr = doc(db, 'players', u.uid);
    const got = await tmo(runTransaction(db, async tx => { const ls = await tx.get(lr); const o = ((ls.exists() && ls.data().owe) || {})[u.uid] || {}; const e = o.exp | 0, st = o.stones | 0;
      tx.update(mr, { exp: increment(e), stones: increment(st), ['claims.' + L]: serverTimestamp(), claimFrom: L }); tx.update(lr, { ['owe.' + u.uid]: deleteField() }); return { exp: e, stones: st }; }));
    const c = meGet(), pl = (c && c.player) || {}, claims = Object.assign({}, pl.claims || {}); claims[L] = Date.now(); mePatch({ exp: (pl.exp | 0) + got.exp, stones: (pl.stones | 0) + got.stones, claims }); return got; },
  // 管理後台（admin/ 頁面用；寫入是否允許由 Firestore 規則依管理者 email 決定）
  async adminList(n) { await ready; const s = await withTimeout(getDocs(query(collection(db, 'players'), orderBy('lastSeen', 'desc'), limit(n || 200))), 15000); return s.docs.map(d => Object.assign({ uid: d.id }, ser(d.data()))); },
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

// Firebase: Google sign-in + one character per account (players/{uid}, names/{nameKey}).
// Loaded as <script type="module">; exposes window.FB and fires a 'fb-ready' event.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, updateDoc, runTransaction, serverTimestamp, collection, query, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
const ready = new Promise(res => { const off = onAuthStateChanged(auth, u => { firstUser = u; off(); res(u); }); });

// ---- speed-ups: local copy of my player doc (page switches show instantly, then re-check in the background), timeouts ----
const ME_KEY = 'bigadv:me', ME_TTL = 5 * 60 * 1000, LIST_KEY = 'bigadv:list', LIST_TTL = 45 * 1000;
const ser = o => { if (o && typeof o === 'object') { if (typeof o.toMillis === 'function') return o.toMillis(); if (o._methodName) return Date.now(); if (Array.isArray(o)) return o.map(ser); const r = {}; for (const k in o) r[k] = ser(o[k]); return r; } return o; };
const meGet = () => { try { const c = JSON.parse(localStorage.getItem(ME_KEY) || 'null'); return c && c.uid && c.player ? c : null; } catch (e) { return null; } };
const meSet = (uid, player) => { try { localStorage.setItem(ME_KEY, JSON.stringify({ uid, t: Date.now(), player: ser(player) })); } catch (e) {} };
const meClear = () => { try { localStorage.removeItem(ME_KEY); sessionStorage.removeItem(LIST_KEY); } catch (e) {} };
const mePatch = fields => { const c = meGet(); if (!c) return; try { Object.assign(c.player, ser(fields)); c.t = Date.now(); localStorage.setItem(ME_KEY, JSON.stringify(c)); } catch (e) {} };
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
  async updatePlayer(fields) { await ready; const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); await updateDoc(doc(db, 'players', u.uid), fields); mePatch(fields); },
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

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

const nameKeyOf = n => String(n || '').trim().toLowerCase();

const FB = {
  ready,                                   // Promise<user|null> (first auth state)
  user: () => auth.currentUser,
  inApp: () => /Line\/|FBAN|FBAV|Instagram|MicroMessenger|; wv\)/i.test(navigator.userAgent),
  async signIn() { const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return (await signInWithPopup(auth, p)).user; },
  signOut: () => signOut(auth),
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
  async updatePlayer(fields) { const u = auth.currentUser; if (!u) throw new Error('not-signed-in'); await updateDoc(doc(db, 'players', u.uid), fields); },
  // Rename: names must stay unique; at most 3 renames; the old name is released after success.
  async renamePlayer(newName) {
    const u = auth.currentUser; if (!u) throw new Error('not-signed-in');
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
  },
  // Marks the signed-in player as recently online (players/{uid}.lastSeen).
  async touch() { const u = auth.currentUser; if (!u) return; try { await updateDoc(doc(db, 'players', u.uid), { lastSeen: serverTimestamp() }); } catch (e) { console.warn('touch failed', e.code || e); } },
  // Most recently online players: [{uid, ...data, lastSeen: millis}]
  async listPlayers(n) {
    const s = await getDocs(query(collection(db, 'players'), orderBy('lastSeen', 'desc'), limit(n || 30)));
    return s.docs.map(d => { const v = d.data(); return Object.assign({ uid: d.id }, v, { lastSeen: v.lastSeen && v.lastSeen.toMillis ? v.lastSeen.toMillis() : 0 }); });
  },
  // For game pages: resolves {user, player} or sends the visitor to login / registration.
  async requirePlayer(root) {
    const u = await ready;
    if (!u) { location.replace(root); return new Promise(() => {}); }
    const p = await FB.getPlayer(u.uid);
    if (!p) { location.replace(root + 'create/'); return new Promise(() => {}); }
    if (p.disabled) { location.replace(root); return new Promise(() => {}); }
    FB.touch();
    if (!FB._beat) FB._beat = setInterval(() => { if (document.visibilityState === 'visible') FB.touch(); }, 5 * 60 * 1000);
    return { user: u, player: p };
  }
};
window.FB = FB;
window.dispatchEvent(new Event('fb-ready'));

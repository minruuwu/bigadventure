// Firebase: Google sign-in + one character per account (players/{uid}, names/{nameKey}).
// Loaded as <script type="module">; exposes window.FB and fires a 'fb-ready' event.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
  async createPlayer(data) {
    const u = auth.currentUser; if (!u) throw new Error('not-signed-in');
    const name = String(data.name).trim(), key = nameKeyOf(name);
    const b = writeBatch(db);
    b.set(doc(db, 'players', u.uid), Object.assign({}, data, { name, nameKey: key, createdAt: serverTimestamp() }));
    b.set(doc(db, 'names', key), { uid: u.uid });
    await b.commit();
  },
  // For game pages: resolves {user, player} or sends the visitor to login / registration.
  async requirePlayer(root) {
    const u = await ready;
    if (!u) { location.replace(root); return new Promise(() => {}); }
    const p = await FB.getPlayer(u.uid);
    if (!p) { location.replace(root + 'create/'); return new Promise(() => {}); }
    return { user: u, player: p };
  }
};
window.FB = FB;
window.dispatchEvent(new Event('fb-ready'));

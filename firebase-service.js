import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

const config = window.JOOD_FIREBASE?.firebaseConfig;
let api = null;

try {
  if (config?.projectId) {
    const app = initializeApp(config);
    const auth = getAuth(app);
    const db = getFirestore(app);
    let authResolved = false;
    let lastUser = auth.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email } : null;
    let readyResolver = null;
    const readyPromise = new Promise((resolve) => { readyResolver = resolve; });

    onAuthStateChanged(auth, (user) => {
      lastUser = user ? { uid: user.uid, email: user.email || '' } : null;
      if (!authResolved) {
        authResolved = true;
        readyResolver?.(lastUser);
      }
      window.dispatchEvent(new CustomEvent('jood-auth-changed', { detail: lastUser }));
    });

    api = {
      async waitForReady() {
        if (authResolved) return lastUser;
        return readyPromise;
      },
      getCurrentUser() {
        return lastUser;
      },
      isAuthenticated() {
        return !!auth.currentUser;
      },
      async signIn(email, password) {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        lastUser = { uid: cred.user.uid, email: cred.user.email || email };
        return lastUser;
      },
      async signOut() {
        if (auth.currentUser) await firebaseSignOut(auth);
      },
      async loadAppData() {
        const snap = await getDoc(doc(db, 'erp', 'appdata'));
        return snap.exists() ? snap.data()?.payload || null : null;
      },
      async saveAppData(data) {
        if (!auth.currentUser) throw new Error('AUTH_REQUIRED');
        await setDoc(doc(db, 'erp', 'appdata'), {
          payload: JSON.parse(JSON.stringify(data)),
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid || null,
          updatedEmail: auth.currentUser?.email || null
        }, { merge: true });
        return true;
      }
    };
  }
} catch (error) {
  console.error('Firebase init error', error);
}

window.JOOD_REMOTE = api;

// Firebase bootstrap. Imported lazily (await import('./firebase')) so solo play never loads it.
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

// TODO(A, H8): paste the firebaseConfig object from the Firebase console (Project settings → Your apps → Web).
// These web keys are not secrets; security comes from database.rules.json.
const firebaseConfig = {
  apiKey: 'PASTE_ME',
  authDomain: 'delta-v-tycoon.firebaseapp.com',
  databaseURL: 'https://delta-v-tycoon-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'delta-v-tycoon',
  storageBucket: 'delta-v-tycoon.appspot.com',
  messagingSenderId: 'PASTE_ME',
  appId: 'PASTE_ME',
};

export const firebaseConfigured = !Object.values(firebaseConfig).includes('PASTE_ME');
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

export async function ensureSignedIn(): Promise<string> {
  if (!firebaseConfigured) throw new Error('NETWORK');
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

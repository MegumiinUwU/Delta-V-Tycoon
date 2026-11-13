// Firebase bootstrap. Imported lazily (await import('./firebase')) so solo play never loads it.
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

import { firebaseConfig, firebaseConfigured } from './firebaseConfig';

export { firebaseConfigured };
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

export async function ensureSignedIn(): Promise<string> {
  if (!firebaseConfigured) throw new Error('NETWORK');
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

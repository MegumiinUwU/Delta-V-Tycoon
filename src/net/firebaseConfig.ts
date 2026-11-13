// Firebase web config. Kept apart from the SDK so the UI can check it without loading Firebase (solo stays offline).
// TODO(A): paste the firebaseConfig object from the Firebase console (Project settings → Your apps → Web).
// These web keys are not secrets; security comes from database.rules.json.
export const firebaseConfig = {
  apiKey: 'PASTE_ME',
  authDomain: 'delta-v-tycoon.firebaseapp.com',
  databaseURL: 'https://delta-v-tycoon-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'delta-v-tycoon',
  storageBucket: 'delta-v-tycoon.appspot.com',
  messagingSenderId: 'PASTE_ME',
  appId: 'PASTE_ME',
};

/** False while any field is still a placeholder: online rooms cannot work yet. */
export const firebaseConfigured = !Object.values(firebaseConfig).includes('PASTE_ME');

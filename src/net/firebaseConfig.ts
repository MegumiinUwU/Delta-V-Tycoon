// Firebase web config. Kept apart from the SDK so the UI can check it without loading Firebase (solo stays offline).
// From the Firebase console (Project settings → Your apps → Web). Analytics is not used, so measurementId is left out.
// These web keys are not secrets; security comes from database.rules.json.
export const firebaseConfig = {
  apiKey: 'AIzaSyDMxfj_wEsWL26K_vTneLu2EED93iCoVPY',
  authDomain: 'delta-v-tycoon.firebaseapp.com',
  databaseURL: 'https://delta-v-tycoon-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'delta-v-tycoon',
  storageBucket: 'delta-v-tycoon.firebasestorage.app',
  messagingSenderId: '42004185325',
  appId: '1:42004185325:web:c5e705235f54955f510ce4',
};

/** False while any field is still a placeholder: online rooms cannot work yet. */
export const firebaseConfigured = !Object.values(firebaseConfig).includes('PASTE_ME');

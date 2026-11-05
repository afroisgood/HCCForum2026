// 打包來源：node_modules/firebase → assets/vendor/firebase.js
// 重新產生：npx esbuild tools/firebase-entry.js --bundle --format=esm --minify --outfile=assets/vendor/firebase.js
export { initializeApp } from 'firebase/app';
export {
  getFirestore, connectFirestoreEmulator, doc, collection, query, orderBy,
  getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, runTransaction, serverTimestamp,
} from 'firebase/firestore';
export {
  getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'firebase/auth';

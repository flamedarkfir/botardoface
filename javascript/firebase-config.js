import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app-check.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signOut, onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider, GoogleAuthProvider, GithubAuthProvider } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import { getDatabase, ref, set, get, update, remove, push, onValue, off, onDisconnect, query as rtdbQuery, orderByChild, startAt, endAt } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-ai.js";

const firebaseConfig = {
  apiKey: "AIzaSyC7bKU9RGR3_zAn4LIWO1uGkUxaREOvsXg",
  authDomain: "faceid-50a95.firebaseapp.com",
  databaseURL: "https://faceid-50a95-default-rtdb.firebaseio.com",
  projectId: "faceid-50a95",
  storageBucket: "faceid-50a95.firebasestorage.app",
  messagingSenderId: "395523619661",
  appId: "1:395523619661:web:cd8591d6bf338eebf49504",
  measurementId: "G-4J21X45PHD"
};

if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

const app = initializeApp(firebaseConfig);

const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider("6LdH2pktAAAAAB08e_SG4reLg5WeEut9HRC7iUQo"),
  isTokenAutoRefreshEnabled: true
});

const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const ai = getAI(app, { backend: new GoogleAIBackend() });

const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

export {
  app,
  appCheck,
  auth,
  db,
  rtdb,
  ai,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  googleProvider,
  githubProvider,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  ref,
  set,
  get,
  update,
  remove,
  push,
  onValue,
  off,
  onDisconnect,
  rtdbQuery,
  orderByChild,
  startAt,
  endAt,
  getGenerativeModel
};
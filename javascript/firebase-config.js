import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider, GithubAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC7bKU9RGR3_zAn4LIWO1uGkUxaREOvsXg",
  authDomain: "faceid-50a95.firebaseapp.com",
  projectId: "faceid-50a95",
  storageBucket: "faceid-50a95.firebasestorage.app",
  messagingSenderId: "395523619661",
  appId: "1:395523619661:web:cd8591d6bf338eebf49504",
  measurementId: "G-4J21X45PHD"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

export {
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  googleProvider,
  githubProvider,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs
};
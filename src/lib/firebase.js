// lib/firebase.js
import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore ,doc, setDoc, addDoc,getDoc,writeBatch, collection, orderBy,onSnapshot, updateDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDrc70mfENCh6gCd5uJmeVbWJ98lcD6mQY",
  authDomain: "test-b4364.firebaseapp.com",
  databaseURL: "https://test-b4364-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "test-b4364",
  storageBucket: "test-b4364.appspot.com",
  messagingSenderId: "260245361856",
  appId: "1:260245361856:web:99808b241e1a7c1e25c925",
  measurementId: "G-TT348Z0BVP"
};


// Initialisation de Firebase
const app = initializeApp(firebaseConfig);

// Services Firebase
const auth = getAuth(app); // Authentification Firebase
const db = getFirestore(app); // Firestore pour la base de données
const storage = getStorage(app); // Firebase Storage pour le stockage d'images

export { auth, db, storage, onAuthStateChanged, writeBatch,doc,getAuth,orderBy,setDoc, getDoc, collection, addDoc,onSnapshot, updateDoc, deleteDoc, query, where, getDocs };


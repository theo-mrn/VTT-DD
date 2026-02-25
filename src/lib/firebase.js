// lib/firebase.js
import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth, onAuthStateChanged, signOut, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, setDoc, addDoc, getDoc, writeBatch, collection, orderBy, onSnapshot, updateDoc, deleteDoc, query, where, getDocs, serverTimestamp, limit, limitToLast } from 'firebase/firestore';
import { getDatabase, ref as dbRef, set, onValue, update } from 'firebase/database';
import { getAnalytics, setAnalyticsCollectionEnabled } from 'firebase/analytics';

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
const storage = getStorage(app); // Firebase Storage pour le stockage de fichiers
const realtimeDb = getDatabase(app); // Realtime Database pour la synchronisation temps réel

// Analytics — initialisé uniquement côté client
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Export services and methods for use in other parts of the application
export { auth, db, storage, realtimeDb, analytics, setAnalyticsCollectionEnabled, onAuthStateChanged, writeBatch, doc, getAuth, signOut, orderBy, setDoc, getDoc, collection, addDoc, onSnapshot, updateDoc, deleteDoc, query, where, getDocs, ref, uploadBytes, getDownloadURL, dbRef, set, onValue, update, serverTimestamp, limit, limitToLast, GoogleAuthProvider };

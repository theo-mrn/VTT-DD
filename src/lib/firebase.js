// lib/firebase.js
import { initializeApp, getApps } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth, onAuthStateChanged, signOut, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore, doc, setDoc, addDoc, getDoc, writeBatch, collection, orderBy, onSnapshot, updateDoc, deleteDoc, query, where, getDocs, serverTimestamp, limit, limitToLast, Timestamp } from 'firebase/firestore';
import { getDatabase, ref as dbRef, set, onValue, update, get as rtdbGet, push as rtdbPush, remove as rtdbRemove } from 'firebase/database';
import { getAnalytics, setAnalyticsCollectionEnabled } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialisation de Firebase (évite la double initialisation en hot reload)
const appExists = getApps().length > 0;
const app = appExists ? getApps()[0] : initializeApp(firebaseConfig);

// Services Firebase
const auth = getAuth(app);
const db = appExists
  ? getFirestore(app)
  : initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
const storage = getStorage(app);
const realtimeDb = getDatabase(app);

// Analytics — initialisé uniquement côté client
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export { auth, db, storage, realtimeDb, analytics, setAnalyticsCollectionEnabled, onAuthStateChanged, writeBatch, doc, getAuth, signOut, orderBy, setDoc, getDoc, collection, addDoc, onSnapshot, updateDoc, deleteDoc, query, where, getDocs, ref, uploadBytes, getDownloadURL, dbRef, set, onValue, update, rtdbGet, rtdbPush, rtdbRemove, serverTimestamp, limit, limitToLast, GoogleAuthProvider, Timestamp };

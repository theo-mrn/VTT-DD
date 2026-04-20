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

const isDiscordEnv = typeof window !== 'undefined' && (new URLSearchParams(window.location.search).has('frame_id') || window.location.hostname.endsWith('.discordsays.com'));

// Dans Discord, patcher les URLs AVANT d'initialiser Firebase
if (isDiscordEnv) {
  try {
    const { DiscordSDK } = require('@discord/embedded-app-sdk');
    const sdk = new DiscordSDK("1495752182837018764");
    if (sdk.patchUrlMappings) {
      sdk.patchUrlMappings([
        { prefix: '/firebase-api', target: 'https://firebase.googleapis.com' },
        { prefix: '/firebase-install', target: 'https://firebaseinstallations.googleapis.com' },
        { prefix: '/firebase-storage', target: 'https://firebasestorage.googleapis.com' },
        { prefix: '/firebase-db', target: 'https://firestore.googleapis.com' },
        { prefix: '/identitytoolkit', target: 'https://identitytoolkit.googleapis.com' },
        { prefix: '/assets-yner', target: 'https://assets.yner.fr' },
      ]);
    }
  } catch (e) {
    // pas dans Discord, ignorer
  }
}

// Initialisation de Firebase (évite la double initialisation en hot reload)
const appExists = getApps().length > 0;
const app = appExists ? getApps()[0] : initializeApp(firebaseConfig);

// Services Firebase
const auth = getAuth(app);
const db = appExists
  ? getFirestore(app)
  : isDiscordEnv
    ? initializeFirestore(app, {})
    : initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      });
const storage = getStorage(app);
const realtimeDb = getDatabase(app);

// Analytics — désactivé dans Discord Activity (CSP bloque googleapis)
const analytics = typeof window !== 'undefined' && !isDiscordEnv ? getAnalytics(app) : null;

export { auth, db, storage, realtimeDb, analytics, setAnalyticsCollectionEnabled, onAuthStateChanged, writeBatch, doc, getAuth, signOut, orderBy, setDoc, getDoc, collection, addDoc, onSnapshot, updateDoc, deleteDoc, query, where, getDocs, ref, uploadBytes, getDownloadURL, dbRef, set, onValue, update, rtdbGet, rtdbPush, rtdbRemove, serverTimestamp, limit, limitToLast, GoogleAuthProvider, Timestamp };

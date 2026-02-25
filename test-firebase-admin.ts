import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// if you have a service account file
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
     const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
     if (!getApps().length) {
       initializeApp({
         credential: cert(serviceAccount)
       });
     }
     const db = getFirestore();
     console.log('Admin SDK initialized via env var');
  } catch(e) { console.error('Error parsing service account', e); }
} else {
  console.log('No FIREBASE_SERVICE_ACCOUNT_KEY in env');
}

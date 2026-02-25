import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  const db = getFirestore();
  // We can just dump the first premium user or a specific user
  db.collection("users").where("premium", "==", true).limit(1).get().then(snap => {
    snap.forEach(doc => {
        console.log("User:", doc.id);
        console.log("Data:", doc.data());
    });
  });
}

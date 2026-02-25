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
  db.collection("users").where("premium", "==", true).limit(10).get().then(snap => {
    snap.forEach(doc => {
        const data = doc.data();
        if (data.cancelAtPeriodEnd && !data.premiumEndDate) {
            console.log("Fixing user", doc.id);
            // set an end date so it has *something*
            doc.ref.update({
              premiumEndDate: Math.floor(Date.now() / 1000) + (10 * 24 * 60 * 60)
            })
        }
    });
  });
}

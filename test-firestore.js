import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const envData = fs.readFileSync('.env.local', 'utf8');
  // manual inject from env
  const lines = envData.split('\n');
  const env = {};
  lines.forEach(l => {
    const parts = l.split('=');
    if (parts.length > 1) {
      env[parts[0]] = parts[1].trim();
    }
  });
  
  const app2 = initializeApp({
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  }, "test2");
  const db2 = getFirestore(app2);

  const roomsSnap = await getDocs(collection(db2, "rooms"));
  for (const doc of roomsSnap.docs) {
    const chatSnap = await getDocs(collection(db2, `rooms/${doc.id}/chat`));
    console.log(`Room ${doc.id} chat messages:`);
    chatSnap.docs.slice(0, 2).forEach(c => {
      console.log(c.id, c.data());
    });
    
    const rollsSnap = await getDocs(collection(db2, `rolls/${doc.id}/rolls`));
    console.log(`Room ${doc.id} rolls:`);
    rollsSnap.docs.slice(0, 2).forEach(r => {
      console.log(r.id, r.data());
    });
  }
  process.exit(0);
}
run();

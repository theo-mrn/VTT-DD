const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  projectId: "vtt-dd", // Replace with actual project ID if different
});
const db = getFirestore();

async function check() {
  const shared = await db.collectionGroup('notes').get();
  console.log("Shared notes query returned:", shared.docs.length, "docs");
  if(shared.docs.length > 0) {
      console.log("Sample shared note data:", shared.docs[0].data());
  }
}
check();

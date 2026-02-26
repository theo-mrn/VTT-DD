const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ projectId: "vtt-dd" });
const db = getFirestore();

async function check() {
  // Let's find any room
  const rooms = await db.collection('rooms').limit(1).get();
  if (rooms.empty) { console.log('No rooms'); return; }
  const roomId = rooms.docs[0].id;
  console.log('Room:', roomId);
  
  const shared = await db.collection('SharedNotes').doc(roomId).collection('notes').get();
  console.log("Shared notes:", shared.size);
  shared.forEach(d => console.log(d.id, d.data().title, d.data().image ? "has image" : "no image"));

  // Check any user's private notes
  const notesRef = await db.collection('Notes').doc(roomId).listCollections();
  console.log("Users with private notes:", notesRef.length);
  if (notesRef.length > 0) {
      const privateNotes = await notesRef[0].get();
      console.log(`Private notes for ${notesRef[0].id}:`, privateNotes.size);
      privateNotes.forEach(d => console.log(d.id, d.data().title, d.data().image ? "has image" : "no image"));
  }
}
check();

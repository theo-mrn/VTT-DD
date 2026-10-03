import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const uid = req.cookies.get("discord_uid")?.value;
  const channelId = req.nextUrl.searchParams.get("channel_id");

  if (!uid) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  let discordRoom = null;
  if (channelId) {
    const snapshot = await adminDb.collection("Salle").where("discordChannelId", "==", channelId).limit(1).get();
    if (!snapshot.empty) {
      const d = snapshot.docs[0];
      discordRoom = { id: d.id, ...d.data() };
    }
  }

  const roomsSnap = await adminDb.collection(`users/${uid}/rooms`).get();
  const rooms = [];
  for (const r of roomsSnap.docs) {
    const roomDoc = await adminDb.doc(`Salle/${r.id}`).get();
    if (roomDoc.exists) rooms.push({ id: roomDoc.id, ...roomDoc.data() });
  }

  return NextResponse.json({ discordRoom, rooms });
}

export async function POST(req: NextRequest) {
  const uid = req.cookies.get("discord_uid")?.value;
  if (!uid) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { roomId, linkChannelId } = await req.json();

  const roomDoc = await adminDb.doc(`Salle/${roomId}`).get();
  if (!roomDoc.exists) return NextResponse.json({ error: "Salle introuvable" }, { status: 404 });

  if (linkChannelId) {
    const data = roomDoc.data();
    if (data?.creatorId !== uid) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    await adminDb.doc(`Salle/${roomId}`).update({ discordChannelId: linkChannelId });
    return NextResponse.json({ success: true });
  }

  await adminDb.doc(`users/${uid}/rooms/${roomId}`).set({ id: roomId });
  await adminDb.doc(`users/${uid}`).set({ room_id: roomId }, { merge: true });

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const uid = req.cookies.get("discord_uid")?.value;
  if (!uid) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { title, maxPlayers, channelId } = await req.json();

  let code = "";
  let exists = true;
  while (exists) {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    const snap = await adminDb.doc(`Salle/${code}`).get();
    exists = snap.exists;
  }

  await adminDb.doc(`Salle/${code}`).set({
    title,
    description: "",
    maxPlayers,
    isPublic: false,
    allowCharacterCreation: true,
    creatorId: uid,
    imageUrl: "",
    discordChannelId: channelId ?? null,
  });

  await adminDb.doc(`users/${uid}/rooms/${code}`).set({ id: code });
  await adminDb.doc(`users/${uid}`).set({ room_id: code }, { merge: true });

  return NextResponse.json({ success: true, code });
}

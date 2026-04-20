import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const uid = req.cookies.get("discord_uid")?.value;
  if (!uid) return NextResponse.json({ user: null });

  const userDoc = await adminDb.doc(`users/${uid}`).get();
  if (!userDoc.exists) return NextResponse.json({ user: null });

  const data = userDoc.data()!;
  return NextResponse.json({
    user: {
      uid,
      roomId: data.room_id || null,
      perso: data.perso || null,
    },
  });
}

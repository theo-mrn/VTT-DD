import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const { access_token } = await req.json();

  // Récupère l'identité Discord
  const discordRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!discordRes.ok) {
    return NextResponse.json({ error: "Invalid Discord token" }, { status: 401 });
  }

  const discordUser = await discordRes.json();
  const uid = `discord_${discordUser.id}`;
  const avatarUrl = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  // Crée ou met à jour le user Firebase
  try {
    await adminAuth.getUser(uid);
  } catch {
    await adminAuth.createUser({ uid, displayName: discordUser.username });
  }

  // Sauvegarde les infos dans Firestore
  await adminDb.doc(`users/${uid}`).set({
    name: discordUser.global_name || discordUser.username,
    pp: avatarUrl,
    discordId: discordUser.id,
    provider: "discord",
  }, { merge: true });

  const response = NextResponse.json({
    uid,
    user: { name: discordUser.global_name || discordUser.username, avatar: avatarUrl },
  });

  response.cookies.set("discord_uid", uid, {
    httpOnly: true,
    secure: true,
    maxAge: 60 * 60 * 24 * 5,
    path: "/",
    sameSite: "none",
  });

  return response;
}

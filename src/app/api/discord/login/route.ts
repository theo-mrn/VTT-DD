import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  try {
    // Vérifie les credentials via Firebase Admin REST API
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: "Email ou mot de passe incorrect" }, { status: 401 });
    }

    const { adminAuth } = await import('@/lib/firebase-admin');
    const customToken = await adminAuth.createCustomToken(data.localId);
    const response = NextResponse.json({ uid: data.localId, customToken });
    response.cookies.set("discord_uid", data.localId, {
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24 * 5,
      path: "/",
      sameSite: "none",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

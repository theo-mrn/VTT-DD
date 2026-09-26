import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const room = searchParams.get('room');
  const identity = searchParams.get('identity');
  const isMJ = searchParams.get('isMJ') === 'true';

  if (!room || !identity) {
    return NextResponse.json({ error: 'room and identity are required' }, { status: 400 });
  }

  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity }
  );

  at.addGrant({
    roomJoin: true,
    room,
    canPublish: isMJ,
    canSubscribe: true,
    canPublishData: true,
    hidden: false,
  });

  return NextResponse.json({ token: await at.toJwt() });
}

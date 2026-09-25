import { NextResponse } from 'next/server';

export async function GET() {
  const appName = process.env.METERED_APP_NAME;
  const apiKey = process.env.METERED_API_KEY;

  if (!appName || !apiKey) {
    return NextResponse.json({ error: 'Metered credentials not configured' }, { status: 500 });
  }

  const res = await fetch(
    `https://${appName}/api/v1/turn/credentials?apiKey=${apiKey}`,
    { cache: 'no-store' }
  );

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch TURN credentials' }, { status: 502 });
  }

  const iceServers = await res.json();
  return NextResponse.json({ iceServers });
}

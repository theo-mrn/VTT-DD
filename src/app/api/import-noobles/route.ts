import { NextRequest, NextResponse } from 'next/server';
import { parseNoobliesHtml } from '@/utils/noobliesParse';
import { convertNoobliesSheet } from '@/utils/noobliesConvert';

// Lit le filesystem (public/tabs) → runtime Node obligatoire.
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let url: string | undefined;
  try {
    const body = await request.json();
    url = body?.url;
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide.' }, { status: 400 });
  }

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: "Paramètre 'url' manquant." }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: 'URL invalide.' }, { status: 400 });
  }
  if (!parsed.hostname.endsWith('nooblieeschroniques.fr')) {
    return NextResponse.json(
      { error: 'Seules les URLs nooblieeschroniques.fr sont autorisées.' },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Échec du chargement de la fiche : ${res.status} ${res.statusText}` },
        { status: 502 },
      );
    }
    const html = await res.text();
    const sheet = parseNoobliesHtml(html);
    const exportData = await convertNoobliesSheet(sheet);
    return NextResponse.json({ exportData });
  } catch (error) {
    console.error('Import Noobliés error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne.' },
      { status: 500 },
    );
  }
}

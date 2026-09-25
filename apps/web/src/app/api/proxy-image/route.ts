import { NextRequest, NextResponse } from 'next/server';
import { fetchAllowedRemote, parseAllowedRemoteUrl } from '@/lib/remote-url';

// Appelé par une balise <img> (cropImageHelper.js), qui ne peut pas envoyer
// d'en-tête Authorization : la protection repose sur la liste blanche d'hôtes.
export async function GET(request: NextRequest) {
    const url = parseAllowedRemoteUrl(request.nextUrl.searchParams.get('url'));

    if (!url) {
        return new NextResponse('URL manquante ou hôte non autorisé', { status: 400 });
    }

    try {
        const response = await fetchAllowedRemote(url);
        if (!response.ok) {
            return new NextResponse('Image introuvable', { status: 502 });
        }

        // Uniquement des images : un autre type (HTML…) servi depuis notre origine
        // serait exploitable en XSS.
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.startsWith('image/')) {
            return new NextResponse('Le contenu distant n\'est pas une image', { status: 415 });
        }

        const blob = await response.blob();

        return new NextResponse(blob, {
            headers: {
                'Content-Type': contentType,
                'X-Content-Type-Options': 'nosniff',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        console.error('Erreur du proxy d\'images', error);
        return new NextResponse('Erreur interne', { status: 500 });
    }
}

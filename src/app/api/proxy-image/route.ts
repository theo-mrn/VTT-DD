import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');
    const quality = parseInt(request.nextUrl.searchParams.get('quality') || '75', 10);

    if (!url) {
        return new NextResponse('Missing URL parameter', { status: 400 });
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            return new NextResponse(`Failed to fetch image: ${response.statusText}`, { status: response.status });
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Optimize image using sharp
        const optimizedBuffer = await sharp(buffer)
            .resize(800, 800, { // Resize to reasonable size for cards
                fit: 'inside',
                withoutEnlargement: true,
            })
            .webp({ quality }) // Convert to WebP with specified quality
            .toBuffer();

        return new NextResponse(new Uint8Array(optimizedBuffer), {
            headers: {
                'Content-Type': 'image/webp',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        console.error('Proxy Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

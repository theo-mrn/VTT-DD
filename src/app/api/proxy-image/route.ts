import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');

    if (!url) {
        return new NextResponse('Missing URL parameter', { status: 400 });
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            return new NextResponse(`Failed to fetch image: ${response.statusText}`, { status: response.status });
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const blob = await response.blob();

        return new NextResponse(blob, {
            headers: {
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*', // Allow all for this proxy
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (error) {
        console.error('Proxy Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

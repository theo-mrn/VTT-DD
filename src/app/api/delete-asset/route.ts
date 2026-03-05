import { NextResponse } from 'next/server';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Initialize R2 client
const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { url } = body;

        if (!url) {
            return NextResponse.json(
                { error: 'No URL provided' },
                { status: 400 }
            );
        }

        // Only allow deleting files from assets.yner.fr
        if (!url.startsWith('https://assets.yner.fr/')) {
            return NextResponse.json(
                { error: 'Invalid URL. Only assets.yner.fr URLs can be deleted.' },
                { status: 400 }
            );
        }

        // Extract the key from the URL (everything after the domain)
        const key = url.replace('https://assets.yner.fr/', '');

        await r2Client.send(new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
        }));

        return NextResponse.json({ success: true, key });
    } catch (error) {
        console.error('Error deleting asset from R2:', error);
        return NextResponse.json(
            { error: 'Failed to delete asset', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

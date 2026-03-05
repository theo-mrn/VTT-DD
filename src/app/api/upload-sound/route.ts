import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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

// Audio content type mapping
const AUDIO_CONTENT_TYPES: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.webm': 'audio/webm',
};

/**
 * POST /api/upload-sound
 * Upload an audio file to Cloudflare R2 and return the public URL.
 *
 * Request body (FormData):
 *   - file: File  — The audio file to upload
 *   - roomId: string — The room ID, used to namespace the file in R2
 *
 * Response:
 *   - url: string — R2 public URL
 */
export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const roomId = formData.get('roomId') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (!roomId) {
            return NextResponse.json({ error: 'Missing roomId' }, { status: 400 });
        }

        // Validate that it's an audio file
        const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
        const contentType = AUDIO_CONTENT_TYPES[ext];

        if (!contentType) {
            return NextResponse.json(
                { error: `Unsupported audio format: ${ext}` },
                { status: 400 }
            );
        }

        // Build a unique R2 key to avoid collisions
        const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `sounds/${roomId}/${Date.now()}_${safeFileName}`;

        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to R2
        await r2Client.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        }));

        // Generate public URL
        const publicUrl = process.env.R2_PUBLIC_URL
            ? `${process.env.R2_PUBLIC_URL}/${key}`
            : `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${key}`;

        return NextResponse.json({ url: publicUrl });
    } catch (error) {
        console.error('[upload-sound] Error uploading audio to R2:', error);
        return NextResponse.json(
            {
                error: 'Failed to upload audio',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

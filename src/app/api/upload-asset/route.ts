import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { db, collection, addDoc, serverTimestamp } from '@/lib/firebase';

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

// Content type mapping
const CONTENT_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.json': 'application/json',
};

/**
 * POST /api/upload-asset
 * Upload a new asset (background, token, item, etc.) to Cloudflare R2
 * 
 * Request body (FormData):
 *   - file: File - The file to upload
 *   - category: string - Category path (e.g., "Map/Camps", "Token", "items/arbre")
 *   - type: 'image' | 'video' | 'json' - Asset type
 * 
 * Response:
 *   - url: string - R2 public URL
 *   - id: string - Firestore document ID
 */
export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const category = formData.get('category') as string;
        const type = formData.get('type') as string;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        if (!category || !type) {
            return NextResponse.json(
                { error: 'Missing category or type' },
                { status: 400 }
            );
        }

        // Validate type
        if (!['image', 'video', 'json'].includes(type)) {
            return NextResponse.json(
                { error: 'Invalid type. Must be image, video, or json' },
                { status: 400 }
            );
        }

        // Generate R2 key (path)
        const key = `${category}/${file.name}`;

        // Get content type
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

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

        // Store metadata in Firestore
        const assetDoc = await addDoc(collection(db, 'assets-mapping'), {
            name: file.name,
            path: publicUrl,
            localPath: `/${key}`,
            category,
            type,
            size: file.size,
            uploadedAt: serverTimestamp(),
        });

        return NextResponse.json({
            url: publicUrl,
            id: assetDoc.id,
            key,
        });
    } catch (error) {
        console.error('Error uploading asset:', error);
        return NextResponse.json(
            { error: 'Failed to upload asset', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

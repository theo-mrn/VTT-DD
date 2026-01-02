import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { db, collection, addDoc, serverTimestamp } from '@/lib/firebase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/upload-asset
 * Upload a new asset (background, token, item, etc.) to Vercel Blob
 * 
 * Request body (FormData):
 *   - file: File - The file to upload
 *   - category: string - Category path (e.g., "Map/Camps", "Token", "items/arbre")
 *   - type: 'image' | 'video' | 'json' - Asset type
 * 
 * Response:
 *   - url: string - Vercel Blob URL
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

        // Upload to Vercel Blob
        const pathname = `/${category}/${file.name}`;
        const blob = await put(pathname, file, {
            access: 'public',
            addRandomSuffix: false, // Keep original filename
        });

        // Store metadata in Firestore
        const assetDoc = await addDoc(collection(db, 'assets-mapping'), {
            name: file.name,
            path: blob.url,
            localPath: pathname,
            category,
            type,
            size: file.size,
            uploadedAt: serverTimestamp(),
        });

        return NextResponse.json({
            url: blob.url,
            id: assetDoc.id,
            pathname,
        });
    } catch (error) {
        console.error('Error uploading asset:', error);
        return NextResponse.json(
            { error: 'Failed to upload asset', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

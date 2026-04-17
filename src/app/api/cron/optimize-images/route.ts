import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // max sur Vercel Hobby

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const QUALITY = 80;
const MAX_WIDTH = 2048;
const SKIP_BELOW_KB = 100;
const BATCH_SIZE = 3; // images traitées en parallèle (évite le throttling R2)

const r2 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
});

async function listAllKeys(limit?: number): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
        const res = await r2.send(new ListObjectsV2Command({
            Bucket: process.env.R2_BUCKET_NAME,
            ContinuationToken: continuationToken,
        }));

        for (const obj of res.Contents ?? []) {
            if (!obj.Key) continue;
            const ext = obj.Key.match(/\.(\w+)$/)?.[0]?.toLowerCase() ?? '';
            if (IMAGE_EXTS.has(ext)) keys.push(obj.Key);
            if (limit && keys.length >= limit) return keys;
        }

        continuationToken = res.NextContinuationToken;
    } while (continuationToken);

    return keys;
}

async function optimizeKey(key: string): Promise<{ saved: number; skipped: boolean }> {
    // Vérifie si l'image a déjà été optimisée (metadata x-optimized présent)
    const head = await r2.send(new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
    }));
    if (head.Metadata?.['x-optimized'] === 'true') return { saved: 0, skipped: true };

    const getRes = await r2.send(new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
    }));

    const chunks: Buffer[] = [];
    for await (const chunk of getRes.Body as AsyncIterable<Buffer>) chunks.push(chunk);
    const original = Buffer.concat(chunks);

    if (original.length < SKIP_BELOW_KB * 1024) return { saved: 0, skipped: true };

    let pipeline = sharp(original);
    const meta = await pipeline.metadata();
    if ((meta.width ?? 0) > MAX_WIDTH) {
        pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    }
    const optimized = await pipeline.webp({ quality: QUALITY }).toBuffer();

    const saved = original.length - optimized.length;
    if (saved <= 0) return { saved: 0, skipped: true }; // déjà optimisé

    // Garde la même clé pour ne pas casser asset-mappings.json
    // Le content-type WebP suffit pour que le navigateur affiche correctement l'image
    await r2.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: optimized,
        ContentType: 'image/webp',
        Metadata: { 'x-optimized': 'true' },
    }));

    return { saved, skipped: false };
}

export async function GET(request: Request) {
    // Vérifie le secret Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startTime = Date.now();
    let optimized = 0;
    let skipped = 0;
    let totalSavedBytes = 0;
    const errors: string[] = [];

    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    try {
        const keys = await listAllKeys(limit);

        // Traitement par batch pour rester dans le timeout Vercel
        for (let i = 0; i < keys.length; i += BATCH_SIZE) {
            // Stop si on approche du timeout (280s)
            if (Date.now() - startTime > 55_000) break;

            const batch = keys.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (key) => {
                try {
                    const result = await optimizeKey(key);
                    if (result.skipped) {
                        skipped++;
                    } else {
                        optimized++;
                        totalSavedBytes += result.saved;
                    }
                } catch (err) {
                    errors.push(`${key}: ${err instanceof Error ? err.message : 'unknown'}`);
                }
            }));
        }
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }

    return NextResponse.json({
        optimized,
        skipped,
        savedMB: (totalSavedBytes / 1024 / 1024).toFixed(2),
        durationMs: Date.now() - startTime,
        errors: errors.slice(0, 20),
    });
}

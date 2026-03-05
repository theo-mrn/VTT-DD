#!/usr/bin/env node

/**
 * Script d'upload des sons locaux vers Cloudflare R2
 *
 * Upload tous les fichiers audio depuis:
 *   - public/Audio/   → R2: Audio/
 *   - public/Musics/  → R2: Musics/
 *
 * Usage:
 *   npx tsx scripts/upload-sounds-to-r2.ts [--dry-run]
 *
 * Variables d'environnement requises (dans .env.local):
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME, R2_PUBLIC_URL
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readdirSync, statSync, readFileSync } from 'fs';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

// ── R2 Client ───────────────────────────────────────────────────────────────
const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
});

// ── Content types ────────────────────────────────────────────────────────────
const AUDIO_CONTENT_TYPES: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.webm': 'audio/webm',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function getAllAudioFiles(dir: string): string[] {
    const files: string[] = [];
    try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...getAllAudioFiles(fullPath));
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                if (AUDIO_CONTENT_TYPES[ext]) {
                    files.push(fullPath);
                }
            }
        }
    } catch {
        // Directory doesn't exist, skip
    }
    return files;
}

async function fileExistsOnR2(key: string): Promise<boolean> {
    try {
        await r2Client.send(new HeadObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
        }));
        return true;
    } catch {
        return false;
    }
}

async function uploadFileToR2(localPath: string, r2Key: string, contentType: string): Promise<string> {
    const buffer = readFileSync(localPath);
    await r2Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: r2Key,
        Body: buffer,
        ContentType: contentType,
    }));

    const publicUrl = process.env.R2_PUBLIC_URL
        ? `${process.env.R2_PUBLIC_URL}/${r2Key}`
        : `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${r2Key}`;

    return publicUrl;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🎵 Upload des sons locaux vers Cloudflare R2');
    console.log('============================================\n');

    if (isDryRun) console.log('⚠️  MODE DRY RUN — aucun upload ne sera effectué\n');

    // Check env vars
    if (!isDryRun) {
        const required = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'];
        const missing = required.filter(k => !process.env[k]);
        if (missing.length > 0) {
            console.error('❌ Variables d\'environnement manquantes :');
            missing.forEach(k => console.error(`  - ${k}`));
            process.exit(1);
        }
    }

    const publicDir = path.join(process.cwd(), 'public');

    // Source folders: [local folder, R2 prefix]
    const sourceDirs: [string, string][] = [
        [path.join(publicDir, 'Audio'), 'Audio'],
        [path.join(publicDir, 'Musics'), 'Musics'],
    ];

    // Collect all files
    const allFiles: { localPath: string; r2Key: string; contentType: string }[] = [];

    for (const [dir, r2Prefix] of sourceDirs) {
        const files = getAllAudioFiles(dir);
        for (const localPath of files) {
            const relativePath = path.relative(dir, localPath);
            const r2Key = `${r2Prefix}/${relativePath.replace(/\\/g, '/')}`;
            const ext = path.extname(localPath).toLowerCase();
            allFiles.push({ localPath, r2Key, contentType: AUDIO_CONTENT_TYPES[ext] });
        }
    }

    console.log(`📦 ${allFiles.length} fichier(s) audio trouvé(s)\n`);

    if (isDryRun) {
        allFiles.forEach(f => console.log(`  • ${f.r2Key}`));
        console.log('\n✅ Dry run terminé !');
        return;
    }

    let uploaded = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < allFiles.length; i++) {
        const { localPath, r2Key, contentType } = allFiles[i];
        const progress = `[${i + 1}/${allFiles.length}]`;
        const fileName = path.basename(localPath);

        process.stdout.write(`${progress} ${fileName}... `);

        try {
            const exists = await fileExistsOnR2(r2Key);
            if (exists) {
                console.log('⏭️  (déjà sur R2)');
                skipped++;
                continue;
            }

            const publicUrl = await uploadFileToR2(localPath, r2Key, contentType);
            console.log(`✅  → ${publicUrl}`);
            uploaded++;
        } catch (err: any) {
            console.log(`❌ ${err.message}`);
            errors++;
        }
    }

    console.log(`\n📊 Résumé :`);
    console.log(`  ✅ Uploadés  : ${uploaded}`);
    console.log(`  ⏭️  Ignorés   : ${skipped}`);
    console.log(`  ❌ Erreurs   : ${errors}`);
    console.log('\n🎉 Terminé !');
}

main().catch(err => {
    console.error('💥 Erreur fatale :', err);
    process.exit(1);
});

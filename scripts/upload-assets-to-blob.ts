#!/usr/bin/env node

/**
 * Migration script: Upload existing assets from /public to Vercel Blob
 * 
 * Usage:
 *   npx tsx scripts/upload-assets-to-blob.ts [--dry-run] [--limit=N]
 * 
 * Environment variables required:
 *   BLOB_READ_WRITE_TOKEN - Your Vercel Blob read/write token
 */

import { put, list } from '@vercel/blob';
import { readdir, stat } from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, writeBatch, doc } from 'firebase/firestore';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

// Firebase configuration - using the existing project config
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDrc70mfENCh6gCd5uJmeVbWJ98lcD6mQY",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "test-b4364.firebaseapp.com",
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://test-b4364-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "test-b4364",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "test-b4364.appspot.com",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "260245361856",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:260245361856:web:99808b241e1a7c1e25c925",
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-TT348Z0BVP"
};

// Initialize Firebase (only if not dry run)
let db: any;
if (!isDryRun) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
}

interface AssetFile {
    name: string;
    localPath: string;
    relativePath: string;
    category: string;
    type: 'image' | 'video' | 'json';
    size: number;
}

const ASSET_DIRECTORIES = [
    'Map',
    'Cartes',
    'Photos',
    'Token',
    'items',
    'tabs',
];

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const VIDEO_EXTENSIONS = ['.webm', '.mp4'];
const JSON_EXTENSIONS = ['.json'];

async function scanDirectory(dirPath: string, category: string): Promise<AssetFile[]> {
    const assets: AssetFile[] = [];

    try {
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                // Recursively scan subdirectories
                const subAssets = await scanDirectory(fullPath, `${category}/${entry.name}`);
                assets.push(...subAssets);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                const fileStat = await stat(fullPath);

                let type: 'image' | 'video' | 'json' | null = null;
                if (IMAGE_EXTENSIONS.includes(ext)) {
                    type = 'image';
                } else if (VIDEO_EXTENSIONS.includes(ext)) {
                    type = 'video';
                } else if (JSON_EXTENSIONS.includes(ext)) {
                    type = 'json';
                }

                if (type) {
                    const publicDir = path.join(process.cwd(), 'public');
                    const relativePath = fullPath.replace(publicDir, '');

                    assets.push({
                        name: entry.name,
                        localPath: fullPath,
                        relativePath,
                        category,
                        type,
                        size: fileStat.size,
                    });
                }
            }
        }
    } catch (error) {
        console.error(`Error scanning directory ${dirPath}:`, error);
    }

    return assets;
}

async function uploadAsset(asset: AssetFile): Promise<string> {
    try {
        // Read file as buffer
        const fileBuffer = readFileSync(asset.localPath);
        const file = new Blob([fileBuffer]);

        // Upload to Vercel Blob with the relative path as pathname
        // This preserves the directory structure
        const blob = await put(asset.relativePath, file, {
            access: 'public',
            addRandomSuffix: false, // Keep original filenames
        });

        return blob.url;
    } catch (error) {
        console.error(`Error uploading ${asset.relativePath}:`, error);
        throw error;
    }
}

async function saveToFirestore(assets: Array<AssetFile & { blobUrl: string }>) {
    const batch = writeBatch(db);
    const assetsCollection = collection(db, 'assets-mapping');

    // Split into batches of 500 (Firestore limit)
    const batchSize = 500;
    for (let i = 0; i < assets.length; i += batchSize) {
        const batchAssets = assets.slice(i, i + batchSize);

        for (const asset of batchAssets) {
            const docRef = doc(assetsCollection);
            batch.set(docRef, {
                name: asset.name,
                path: asset.blobUrl,
                localPath: asset.relativePath,
                category: asset.category,
                type: asset.type,
                size: asset.size,
                uploadedAt: new Date(),
            });
        }

        await batch.commit();
        console.log(`Saved batch ${i / batchSize + 1} to Firestore`);
    }
}

async function main() {
    console.log('🚀 Vercel Blob Migration Script');
    console.log('================================\n');

    if (isDryRun) {
        console.log('⚠️  DRY RUN MODE - No uploads will be performed\n');
    }

    if (limit) {
        console.log(`📊 Limiting to ${limit} files\n`);
    }

    // Check for Vercel Blob token
    if (!isDryRun && !process.env.BLOB_READ_WRITE_TOKEN) {
        console.error('❌ Error: BLOB_READ_WRITE_TOKEN environment variable is not set');
        console.error('Please set it in your .env.local file or environment');
        process.exit(1);
    }

    // Step 1: Scan all asset directories
    console.log('📁 Scanning asset directories...\n');
    const publicDir = path.join(process.cwd(), 'public');
    let allAssets: AssetFile[] = [];

    for (const dir of ASSET_DIRECTORIES) {
        const dirPath = path.join(publicDir, dir);
        try {
            await stat(dirPath);
            console.log(`  → Scanning ${dir}/...`);
            const assets = await scanDirectory(dirPath, dir);
            allAssets.push(...assets);
            console.log(`    Found ${assets.length} files`);
        } catch (error) {
            console.log(`    ⚠️  Directory ${dir}/ not found, skipping`);
        }
    }

    console.log(`\n✅ Total files found: ${allAssets.length}`);

    // Calculate total size
    const totalSize = allAssets.reduce((sum, asset) => sum + asset.size, 0);
    const totalSizeGB = (totalSize / (1024 ** 3)).toFixed(2);
    console.log(`📦 Total size: ${totalSizeGB} GB\n`);

    // Apply limit if specified
    if (limit && allAssets.length > limit) {
        console.log(`⚠️  Limiting to first ${limit} files\n`);
        allAssets = allAssets.slice(0, limit);
    }

    if (isDryRun) {
        console.log('\n📋 Sample files that would be uploaded:');
        allAssets.slice(0, 10).forEach(asset => {
            console.log(`  • ${asset.relativePath} (${(asset.size / 1024 / 1024).toFixed(2)} MB)`);
        });
        console.log('\n✅ Dry run complete!');
        return;
    }

    // Step 2: Upload to Vercel Blob
    console.log('☁️  Uploading to Vercel Blob...\n');
    const uploadedAssets: Array<AssetFile & { blobUrl: string }> = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < allAssets.length; i++) {
        const asset = allAssets[i];
        const progress = `[${i + 1}/${allAssets.length}]`;

        try {
            process.stdout.write(`${progress} Uploading ${asset.relativePath}... `);
            const blobUrl = await uploadAsset(asset);
            uploadedAssets.push({ ...asset, blobUrl });
            successCount++;
            console.log('✅');
        } catch (error) {
            errorCount++;
            console.log('❌');
        }
    }

    console.log(`\n📊 Upload Summary:`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);

    // Step 3: Save mapping to Firestore
    if (uploadedAssets.length > 0) {
        console.log('\n💾 Saving asset mapping to Firestore...');
        await saveToFirestore(uploadedAssets);
        console.log('✅ Mapping saved successfully!');
    }

    console.log('\n🎉 Migration complete!');
}

// Run the script
main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});

#!/usr/bin/env node

/**
 * Script pour uploader les objets de public/objets2 vers Cloudflare R2
 * 
 * Usage:
 *   npx tsx scripts/upload-objets2-to-r2.ts [--dry-run]
 * 
 * Environment variables required:
 *   R2_ACCESS_KEY_ID - Your R2 access key ID
 *   R2_SECRET_ACCESS_KEY - Your R2 secret access key
 *   R2_ENDPOINT - Your R2 endpoint URL
 *   R2_BUCKET_NAME - Your R2 bucket name
 *   R2_PUBLIC_URL - Your R2 public URL (optional, for generating public URLs)
 */

// Load environment variables from .env.local
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readdir, stat } from 'fs/promises';
import { readFileSync, writeFileSync } from 'fs';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

// Initialize R2 client
const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
});

interface AssetFile {
    name: string;
    localPath: string;
    relativePath: string;
    category: string;
    type: 'image' | 'video' | 'json';
    size: number;
}

interface AssetMapping {
    name: string;
    path: string;
    localPath: string;
    category: string;
    type: string;
    size: number;
    uploadedAt: string;
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// Content type mapping
const CONTENT_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
};

async function scanDirectory(dirPath: string, baseFolder: string = '', parentCategory: string = ''): Promise<AssetFile[]> {
    const assets: AssetFile[] = [];

    try {
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                // Recursively scan subdirectories
                // Use subdirectory name as category
                const subAssets = await scanDirectory(fullPath, baseFolder, entry.name);
                assets.push(...subAssets);
            } else if (entry.isFile() && !entry.name.startsWith('.')) {
                const ext = path.extname(entry.name).toLowerCase();
                const fileStat = await stat(fullPath);

                let type: 'image' | 'video' | 'json' | null = null;
                if (IMAGE_EXTENSIONS.includes(ext)) {
                    type = 'image';
                }

                if (type) {
                    // Use parent directory name as category (e.g., "camps", "farm", "fourniture", etc.)
                    const category = parentCategory || 'misc';

                    // Create path like: objets/camps/banniere-1a.png
                    const relativePath = `objets/${category}/${entry.name}`;

                    assets.push({
                        name: entry.name,
                        localPath: fullPath,
                        relativePath,
                        category: `objets/${category}`,
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

async function checkExists(key: string): Promise<boolean> {
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

async function uploadAsset(asset: AssetFile): Promise<string | null> {
    try {
        // Check if already uploaded
        const exists = await checkExists(asset.relativePath);
        if (exists) {
            return 'SKIPPED';
        }

        // Read file as buffer
        const fileBuffer = readFileSync(asset.localPath);
        const ext = path.extname(asset.name).toLowerCase();
        const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

        // Upload to R2
        await r2Client.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: asset.relativePath,
            Body: fileBuffer,
            ContentType: contentType,
        }));

        // Generate public URL
        const publicUrl = process.env.R2_PUBLIC_URL
            ? `${process.env.R2_PUBLIC_URL}/${asset.relativePath}`
            : `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${asset.relativePath}`;

        return publicUrl;
    } catch (error: any) {
        console.error(`Error uploading ${asset.relativePath}:`, error.message);
        throw error;
    }
}

async function main() {
    console.log('📦 Upload des Objets (objet2) vers Cloudflare R2');
    console.log('=================================================\n');

    if (isDryRun) {
        console.log('⚠️  DRY RUN MODE - No uploads will be performed\n');
    }

    // Check for required environment variables
    if (!isDryRun) {
        const required = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET_NAME'];
        const missing = required.filter(key => !process.env[key]);

        if (missing.length > 0) {
            console.error('❌ Error: Missing required environment variables:');
            missing.forEach(key => console.error(`  - ${key}`));
            console.error('\nPlease set them in your .env.local file');
            console.error('See scripts/R2_SETUP.md for instructions');
            process.exit(1);
        }
    }

    // Step 1: Scan objet2 directory and its subdirectories
    console.log('📁 Scanning objet2 directory...\n');
    const objet2Dir = path.join(process.cwd(), 'public', 'objet2');

    let allAssets: AssetFile[] = [];
    try {
        await stat(objet2Dir);
        console.log(`  → Scanning objet2/ and subdirectories...`);
        allAssets = await scanDirectory(objet2Dir);
        console.log(`    Found ${allAssets.length} files`);
    } catch (error) {
        console.error(`    ❌ Directory objet2/ not found!`);
        process.exit(1);
    }

    console.log(`\n✅ Total files found: ${allAssets.length}`);

    // Show category breakdown
    const categoryCount: Record<string, number> = {};
    allAssets.forEach(asset => {
        const cat = asset.category.split('/')[1];
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });
    console.log('\n📊 Category breakdown:');
    Object.entries(categoryCount).sort().forEach(([cat, count]) => {
        console.log(`  • ${cat}: ${count} items`);
    });

    // Calculate total size
    const totalSize = allAssets.reduce((sum, asset) => sum + asset.size, 0);
    const totalSizeMB = (totalSize / (1024 ** 2)).toFixed(2);
    console.log(`\n📦 Total size: ${totalSizeMB} MB\n`);

    if (isDryRun) {
        console.log('\n📋 Files that would be uploaded:');
        allAssets.forEach(asset => {
            console.log(`  • ${asset.relativePath} (${(asset.size / 1024).toFixed(2)} KB)`);
        });
        console.log('\n✅ Dry run complete!');
        return;
    }

    // Step 2: Upload to R2  
    console.log('☁️  Uploading to Cloudflare R2...\n');
    const assetMappings: AssetMapping[] = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < allAssets.length; i++) {
        const asset = allAssets[i];
        const progress = `[${i + 1}/${allAssets.length}]`;

        try {
            process.stdout.write(`${progress} Uploading ${asset.relativePath}... `);
            const publicUrl = await uploadAsset(asset);

            if (publicUrl === 'SKIPPED') {
                // File already exists - generate URL anyway
                const url = process.env.R2_PUBLIC_URL
                    ? `${process.env.R2_PUBLIC_URL}/${asset.relativePath}`
                    : `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${asset.relativePath}`;

                assetMappings.push({
                    name: asset.name,
                    path: url,
                    localPath: `/${asset.relativePath}`,
                    category: asset.category,
                    type: asset.type,
                    size: asset.size,
                    uploadedAt: new Date().toISOString(),
                });
                skippedCount++;
                console.log('⏭️  (already exists)');
            } else if (publicUrl) {
                assetMappings.push({
                    name: asset.name,
                    path: publicUrl,
                    localPath: `/${asset.relativePath}`,
                    category: asset.category,
                    type: asset.type,
                    size: asset.size,
                    uploadedAt: new Date().toISOString(),
                });
                successCount++;
                console.log('✅');
            }
        } catch (error) {
            errorCount++;
            console.log('❌');
        }
    }

    console.log(`\n📊 Upload Summary:`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ⏭️  Skipped: ${skippedCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);

    // Step 3: Merge with existing mappings and save
    if (assetMappings.length > 0 || skippedCount > 0) {
        const outputPath = path.join(process.cwd(), 'public', 'asset-mappings.json');

        // Load existing mappings
        let existingMappings: AssetMapping[] = [];
        try {
            const existingContent = readFileSync(outputPath, 'utf-8');
            existingMappings = JSON.parse(existingContent);
            console.log(`\n📂 Found ${existingMappings.length} existing mappings`);
        } catch {
            console.log(`\n📂 No existing mappings found, creating new file`);
        }

        // Merge: remove duplicates by localPath, keep newest
        const allMappings = [...existingMappings];
        for (const newMapping of assetMappings) {
            const existingIndex = allMappings.findIndex(m => m.localPath === newMapping.localPath);
            if (existingIndex >= 0) {
                allMappings[existingIndex] = newMapping; // Update
            } else {
                allMappings.push(newMapping); // Add
            }
        }

        console.log(`\n💾 Saving ${allMappings.length} total asset mappings to ${outputPath}...`);
        writeFileSync(outputPath, JSON.stringify(allMappings, null, 2), 'utf-8');
        console.log('✅ Mapping saved successfully!');
        console.log(`   New uploads: ${successCount}`);
        console.log(`   Total in file: ${allMappings.length}`);
    }

    console.log('\n🎉 Objets2 upload complete!');
    console.log('\n💡 Next step: Run `npx tsx scripts/generate-suggested-objects.ts` to update suggested-objects.ts');
}

// Run the script
main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});

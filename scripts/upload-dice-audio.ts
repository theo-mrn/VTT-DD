#!/usr/bin/env node

/**
 * Script to upload dice.mp3 to R2 and update asset mappings
 */

import dotenv from 'dotenv';
import path from 'path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, writeFileSync } from 'fs';
import { stat } from 'fs/promises';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Initialize R2 client
const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
});

interface AssetMapping {
    name: string;
    path: string;
    localPath: string;
    category: string;
    type: string;
    size: number;
    uploadedAt: string;
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

async function uploadFile(fileName: string, relativePath: string, contentType: string) {
    const fullPath = path.join(process.cwd(), 'public', fileName);

    try {
        const stats = await stat(fullPath);
        const exists = await checkExists(relativePath);

        if (exists) {
            console.log(`Skipping upload: ${relativePath} already exists on R2`);
        } else {
            console.log(`Uploading ${fileName} to R2...`);
            const fileBuffer = readFileSync(fullPath);

            await r2Client.send(new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: relativePath,
                Body: fileBuffer,
                ContentType: contentType,
            }));
            console.log(`Uploaded ${fileName} successfully.`);
        }

        // Generate Public URL
        const publicUrl = process.env.R2_PUBLIC_URL
            ? `${process.env.R2_PUBLIC_URL}/${relativePath}`
            : `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${relativePath}`;

        return {
            name: fileName,
            path: publicUrl,
            localPath: `/${fileName}`,
            category: 'Audio',
            type: 'audio',
            size: stats.size,
            uploadedAt: new Date().toISOString(),
        } as AssetMapping;

    } catch (error) {
        console.error(`Error processing ${fileName}:`, error);
        return null;
    }
}

async function main() {
    console.log('🎲 Uploading Dice Audio...');

    const mapping = await uploadFile('dice.mp3', 'dice.mp3', 'audio/mpeg');

    if (mapping) {
        // Update asset-mappings.json
        const mappingPath = path.join(process.cwd(), 'public', 'asset-mappings.json');

        let existingMappings: AssetMapping[] = [];
        try {
            existingMappings = JSON.parse(readFileSync(mappingPath, 'utf-8'));
        } catch (e) {
            console.log('No existing mappings found or error reading file.');
        }

        // Remove existing entry for dice.mp3 if any
        existingMappings = existingMappings.filter(m => m.localPath !== '/dice.mp3');

        // Add new mapping
        existingMappings.push(mapping);

        writeFileSync(mappingPath, JSON.stringify(existingMappings, null, 2));
        console.log('✅ Updated public/asset-mappings.json');
        console.log(`URL: ${mapping.path}`);
    }
}

main().catch(console.error);

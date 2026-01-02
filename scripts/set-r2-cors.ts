
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';

const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
});

async function main() {
    console.log('🔧 Configuring CORS for Cloudflare R2...');

    const corsParams = {
        Bucket: process.env.R2_BUCKET_NAME,
        CORSConfiguration: {
            CORSRules: [
                {
                    AllowedHeaders: ['*'],
                    AllowedMethods: ['GET', 'HEAD'],
                    AllowedOrigins: ['*'], // Allow all origins (localhost, vercel, etc.)
                    ExposeHeaders: ['Content-Length', 'ETag'],
                    MaxAgeSeconds: 3000,
                },
            ],
        },
    };

    try {
        await r2Client.send(new PutBucketCorsCommand(corsParams));
        console.log('✅ CORS configuration updated successfully!');
        console.log('   Allowed Origins: *');
        console.log('   Allowed Methods: GET, HEAD');
        console.log('\n⚠️  It may take a few seconds/minutes to propagate.');
    } catch (error) {
        console.error('❌ Error updating CORS:', error);
    }
}

main();

# Cloudflare R2 Setup Guide

## Why Cloudflare R2?

- **10 GB free storage** (vs Vercel Blob's 1 GB on Hobby plan)
- **Free egress** (no bandwidth costs)
- **S3-compatible API** (easy to use with AWS SDK)
- Your project needs ~5.7 GB, so R2 is perfect

## Step 1: Create Cloudflare Account & R2 Bucket

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Sign up or log in
3. Navigate to **R2** in the sidebar
4. Click **Create bucket**
   - Bucket name: `vtt-dd-assets` (or your choice)
   - Location: Choose closest to your users
5. Click **Create bucket**

## Step 2: Get R2 Access Credentials

1. In R2 dashboard, go to **Manage R2 API Tokens**
2. Click **Create API Token**
3. Configure:
   - **Token name**: `vtt-dd-upload`
   - **Permissions**: 
     - ✅ Admin Read & Write
   - **Bucket**: Select your bucket or "All buckets"
4. Click **Create API Token**
5. **IMPORTANT**: Copy these values (shown only once):
   - Access Key ID
   - Secret Access Key
   - R2 Endpoint (e.g., `https://xxxxx.r2.cloudflarestorage.com`)

## Step 3: Configure Environment Variables

Add to your `.env.local` file:

```bash
# Cloudflare R2 Configuration
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_ENDPOINT=https://xxxxx.r2.cloudflarestorage.com
R2_BUCKET_NAME=vtt-dd-assets
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev  # See step 4
```

## Step 4: Enable Public Access (Optional but Recommended)

For public assets that don't need authentication:

1. Go to your bucket settings
2. Enable **Public access**
3. Click **Allow Public Access**
4. Copy the **Public Bucket URL** (looks like `https://pub-xxxxx.r2.dev`)
5. Add this as `R2_PUBLIC_URL` in your `.env.local`

**OR** use a custom domain:
1. Go to bucket settings → **Custom Domains**
2. Add your domain (e.g., `assets.yourdomain.com`)
3. Follow DNS configuration instructions
4. Use your custom domain as `R2_PUBLIC_URL`

## Step 5: Test Configuration

Run the migration script in dry-run mode:

```bash
npx tsx scripts/upload-assets-to-r2.ts --dry-run
```

Should show your assets without errors.

## Step 6: Run Migration

```bash
# Test with a few files first
npx tsx scripts/upload-assets-to-r2.ts --limit=10

# If successful, run full migration
npx tsx scripts/upload-assets-to-r2.ts
```

## Pricing (as of 2024)

**Free tier:**
- 10 GB storage per month
- 10 million Class A operations (uploads)
- 10 million Class B operations (downloads)
- **Free egress** (no bandwidth charges)

**Paid tier** (if you exceed free tier):
- $0.015 per GB/month storage
- Very cheap compared to other providers

For your 5.7 GB project, you'll stay in the free tier! 🎉

## Troubleshooting

**"Access Denied" errors:**
- Verify your API token has Read & Write permissions
- Check bucket name matches exactly
- Ensure endpoint URL is correct

**"Bucket not found":**
- Double-check `R2_BUCKET_NAME` in `.env.local`
- Verify bucket exists in Cloudflare dashboard

**Slow uploads:**
- R2 has global edge network, should be fast
- Check your internet connection
- Consider using `--limit` for smaller batches

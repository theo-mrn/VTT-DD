# Vercel Blob Migration - Environment Setup

Add the following environment variable to your `.env.local` file:

```bash
# Vercel Blob Configuration
# Get your token from: https://vercel.com/dashboard/stores
# Navigate to: Vercel Dashboard > Storage > Blob Store > Settings > Access Tokens
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token_here
```

## How to get your Vercel Blob token:

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to your project
3. Go to **Storage** tab
4. Create a new Blob Store (if you haven't already)
5. Go to **Settings** > **Access Tokens**
6. Create a new token with read/write permissions
7. Copy the token and add it to your `.env.local` file

## For Development:

The token should be added to `.env.local` (which is gitignored).

## For Production (Vercel Deployment):

Add the `BLOB_READ_WRITE_TOKEN` environment variable in:
- Vercel Dashboard > Your Project > Settings > Environment Variables

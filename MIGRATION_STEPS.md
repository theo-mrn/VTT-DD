# Vercel Blob Migration - Next Steps

## ✅ Completed

- Installed `@vercel/blob` package
- Created migration script (`scripts/upload-assets-to-blob.ts`)
- Created API routes:
  - `/api/upload-asset` - Upload new assets to Vercel Blob
  - `/api/maps` - Fetch map backgrounds from Firestore
  - `/api/assets` - Generic asset retrieval
- Updated Firebase configuration in migration script

## 🚀 Next Steps to Complete Migration

### 1. Set up Vercel Blob Token

Create a `.env.local` file in the project root with:

```bash
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token_here
```

**How to get the token:**
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to your project
3. Go to **Storage** tab > Create a Blob Store (if needed)
4. Go to **Settings** > **Access Tokens**
5. Create a new read/write token
6. Copy and add to `.env.local`

### 2. Test the Migration Script (Dry Run)

```bash
# Install tsx to run TypeScript directly
npm install -D tsx

# Test with dry run (no uploads, just scanning)
npx tsx scripts/upload-assets-to-blob.ts --dry-run

# Test with a small subset (e.g., first 10 files)
npx tsx scripts/upload-assets-to-blob.ts --limit=10
```

### 3. Run the Full Migration

⚠️ **Important**: This will upload ~5.7 GB to Vercel Blob. Make sure you have:
- Sufficient Vercel Blob storage quota
- Stable internet connection
- Time to complete (may take several hours)

```bash
# Run the full migration
npx tsx scripts/upload-assets-to-blob.ts
```

The script will:
- Scan all asset directories
- Upload each file to Vercel Blob
- Store the mapping in Firestore (`assets-mapping` collection)
- Show progress and summary

### 4. Verify the Migration

After migration completes:

```bash
# Start dev server
npm run dev

# Test the BackgroundSelector
# Navigate to a room and open the background selector
# Verify that:
# - Categories load correctly
# - Thumbnail images display (from Blob URLs)
# - Clicking a background loads it properly
```

### 5. Update .gitignore and Clean Git LFS

Once verified working:

```bash
# Add asset directories to .gitignore
echo "/public/Map/" >> .gitignore
echo "/public/Cartes/" >> .gitignore
echo "/public/Photos/" >> .gitignore
echo "/public/Token/" >> .gitignore
echo "/public/items/" >> .gitignore
echo "/public/tabs/" >> .gitignore

# Remove Git LFS tracking
git rm .gitattributes
git lfs uninstall

# Optionally, delete local asset directories (keep a backup!)
# rm -rf public/Map public/Cartes public/Photos public/Token public/items public/tabs
```

### 6. Deploy to Vercel

```bash
# Add BLOB_READ_WRITE_TOKEN to Vercel environment variables
# Dashboard > Project > Settings > Environment Variables

# Commit and push changes
git add .
git commit -m "Migrate to Vercel Blob for asset storage"
git push

# Vercel will auto-deploy
```

## 📝 Additional Features to Implement

These components still need updating to use Vercel Blob:

- **Photos** (`src/components/(infos)/images.tsx`) - Uses `/Photos/` paths
- **Items/Tokens** (`src/lib/suggested-objects.ts`) - Hardcoded `/items/` paths
- **JSON Data** (`src/components/(infos)/*`) - Uses `/tabs/` paths

Consider creating a helper function or React hook to fetch asset URLs from the API.

## 🆘 Troubleshooting

**If migration script fails:**
- Check `BLOB_READ_WRITE_TOKEN` is set correctly
- Verify Firebase credentials are correct
- Check internet connection
- Review error messages for specific file issues

**If assets don't load after migration:**
- Verify Firestore has data in `assets-mapping` collection
- Check browser console for API errors
- Verify Blob URLs are publicly accessible
- Check that API routes are deployed correctly

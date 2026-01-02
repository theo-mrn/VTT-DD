import { NextResponse } from 'next/server';
import { db, collection, getDocs, query, where } from '@/lib/firebase';

export const dynamic = 'force-dynamic';

interface AssetFile {
    name: string;
    path: string;
    category: string;
    type: 'image' | 'video' | 'json';
}

/**
 * GET /api/assets?category=Photos
 * GET /api/assets?category=Token
 * GET /api/assets?category=items
 * 
 * Fetch assets by category from Vercel Blob via Firestore
 * 
 * Query parameters:
 *   - category: string (optional) - Filter by category prefix (e.g., "Photos", "Token", "items")
 *   - type: string (optional) - Filter by type ("image" | "video" | "json")
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const categoryFilter = searchParams.get('category');
        const typeFilter = searchParams.get('type');

        // Query Firestore for assets
        const assetsCollection = collection(db, 'assets-mapping');
        const snapshot = await getDocs(assetsCollection);

        let assets: AssetFile[] = [];

        snapshot.forEach((doc) => {
            const data = doc.data();

            // Apply filters
            let include = true;

            if (categoryFilter && !data.category?.startsWith(categoryFilter)) {
                include = false;
            }

            if (typeFilter && data.type !== typeFilter) {
                include = false;
            }

            if (include) {
                assets.push({
                    name: data.name,
                    path: data.path, // Vercel Blob URL
                    category: data.category,
                    type: data.type,
                });
            }
        });

        // Group by category
        const grouped = assets.reduce((acc, asset) => {
            if (!acc[asset.category]) {
                acc[asset.category] = [];
            }
            acc[asset.category].push(asset);
            return acc;
        }, {} as Record<string, AssetFile[]>);

        return NextResponse.json({
            assets,
            grouped,
            total: assets.length
        });
    } catch (error) {
        console.error('Error fetching assets:', error);
        return NextResponse.json(
            { error: 'Failed to fetch assets', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

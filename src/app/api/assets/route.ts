import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

interface AssetFile {
    name: string;
    path: string;
    category: string;
    type: 'image' | 'video' | 'json';
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

/**
 * GET /api/assets?category=Photos
 * GET /api/assets?category=Token
 * GET /api/assets?category=items
 * 
 * Fetch assets by category from R2 via local JSON mapping
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

        // Read the asset mappings JSON file
        const jsonPath = path.join(process.cwd(), 'public', 'asset-mappings.json');
        let mappings: AssetMapping[];

        try {
            const jsonContent = readFileSync(jsonPath, 'utf-8');
            mappings = JSON.parse(jsonContent);
        } catch (error) {
            console.error('Error reading asset-mappings.json:', error);
            return NextResponse.json(
                { error: 'Asset mappings not found. Please run the R2 migration script first.' },
                { status: 404 }
            );
        }

        // Filter assets based on query parameters
        let assets: AssetFile[] = mappings.map(m => ({
            name: m.name,
            path: m.path, // R2 public URL
            category: m.category,
            type: m.type as 'image' | 'video' | 'json',
        }));

        // Apply category filter
        if (categoryFilter) {
            assets = assets.filter(a => a.category?.startsWith(categoryFilter));
        }

        // Apply type filter
        if (typeFilter) {
            assets = assets.filter(a => a.type === typeFilter);
        }

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

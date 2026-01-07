import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

interface EffectMapping {
    name: string;
    path: string;
    localPath: string;
    category: string;
    type: string;
}

/**
 * GET /api/effects?category=Cone
 * GET /api/effects?category=Fireballs
 * 
 * Fetch visual effects from R2 via local JSON mapping
 * 
 * Query parameters:
 *   - category: string (optional) - Filter by category ("Cone" or "Fireballs")
 *   - type: string (optional) - Filter by file type ("video" or "image")
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const categoryFilter = searchParams.get('category');
        const typeFilter = searchParams.get('type');

        // Read the asset mappings JSON file
        const jsonPath = path.join(process.cwd(), 'public', 'asset-mappings.json');
        let mappings: EffectMapping[];

        try {
            const jsonContent = readFileSync(jsonPath, 'utf-8');
            const allMappings = JSON.parse(jsonContent);

            // Filter only Effect category
            mappings = allMappings.filter((m: any) => m.category?.startsWith('Effect'));
        } catch (error) {
            console.error('Error reading asset-mappings.json:', error);
            return NextResponse.json(
                { error: 'Asset mappings not found. Please upload effects to R2 first.' },
                { status: 404 }
            );
        }

        // Apply category filter (Cone or Fireballs)
        if (categoryFilter) {
            mappings = mappings.filter(m => m.category?.includes(categoryFilter));
        }

        // Apply type filter
        if (typeFilter) {
            mappings = mappings.filter(m => m.type === typeFilter);
        }

        // Group by subcategory (Cone, Fireballs)
        const grouped = mappings.reduce((acc, effect) => {
            // Extract subcategory (e.g., "Effect/Cone" -> "Cone")
            const subcategory = effect.category.split('/')[1] || 'Other';
            if (!acc[subcategory]) {
                acc[subcategory] = [];
            }
            acc[subcategory].push(effect);
            return acc;
        }, {} as Record<string, EffectMapping[]>);

        return NextResponse.json({
            effects: mappings,
            grouped,
            total: mappings.length
        });
    } catch (error) {
        console.error('Error fetching effects:', error);
        return NextResponse.json(
            { error: 'Failed to fetch effects', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

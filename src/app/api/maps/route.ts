import { NextResponse } from 'next/server';
import { db, collection, getDocs, query, where } from '@/lib/firebase';

export const dynamic = 'force-dynamic';

interface MapFile {
    name: string;
    path: string;
    category: string;
    type: 'image' | 'video';
}

/**
 * GET /api/maps
 * Fetch all map backgrounds from Vercel Blob via Firestore
 * 
 * This route queries the 'assets-mapping' collection in Firestore
 * to get all assets with categories starting with 'Map' or 'Cartes'
 */
export async function GET() {
    try {
        // Query Firestore for all Map and Cartes assets
        const assetsCollection = collection(db, 'assets-mapping');

        // Get all documents (we'll filter manually since Firestore doesn't support OR on startsWith)
        const snapshot = await getDocs(assetsCollection);

        const allMaps: MapFile[] = [];

        snapshot.forEach((doc) => {
            const data = doc.data();
            const category = data.category as string;

            // Filter for Map and Cartes categories
            if (category?.startsWith('Map') || category?.startsWith('Cartes')) {
                allMaps.push({
                    name: data.name,
                    path: data.path, // This is now the Vercel Blob URL
                    category: data.category,
                    type: data.type,
                });
            }
        });

        // Group by category for easier navigation
        const grouped = allMaps.reduce((acc, map) => {
            if (!acc[map.category]) {
                acc[map.category] = [];
            }
            acc[map.category].push(map);
            return acc;
        }, {} as Record<string, MapFile[]>);

        return NextResponse.json({
            maps: allMaps,
            grouped,
            total: allMaps.length
        });
    } catch (error) {
        console.error('Error fetching maps:', error);
        return NextResponse.json(
            { error: 'Failed to fetch maps', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

import { NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

interface MapFile {
    name: string;
    path: string;
    category: string;
    type: 'image' | 'video';
}

async function scanDirectory(dirPath: string, category: string): Promise<MapFile[]> {
    const maps: MapFile[] = [];

    try {
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                // Recursively scan subdirectories
                const subMaps = await scanDirectory(fullPath, `${category}/${entry.name}`);
                maps.push(...subMaps);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();

                // Check if it's an image or video
                if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
                    maps.push({
                        name: entry.name,
                        path: fullPath.replace(path.join(process.cwd(), 'public'), ''),
                        category,
                        type: 'image'
                    });
                } else if (['.webm', '.mp4'].includes(ext)) {
                    maps.push({
                        name: entry.name,
                        path: fullPath.replace(path.join(process.cwd(), 'public'), ''),
                        category,
                        type: 'video'
                    });
                }
            }
        }
    } catch (error) {
        console.error(`Error scanning directory ${dirPath}:`, error);
    }

    return maps;
}

export async function GET() {
    try {
        const publicDir = path.join(process.cwd(), 'public');
        const cartesDir = path.join(publicDir, 'Cartes');
        const mapDir = path.join(publicDir, 'Map');

        const [cartesMaps, mapMaps] = await Promise.all([
            scanDirectory(cartesDir, 'Cartes'),
            scanDirectory(mapDir, 'Map')
        ]);

        const allMaps = [...cartesMaps, ...mapMaps];

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
            { error: 'Failed to fetch maps' },
            { status: 500 }
        );
    }
}

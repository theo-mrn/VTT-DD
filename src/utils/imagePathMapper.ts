/**
 * Maps local image paths to R2 CDN URLs using the asset-mappings.json
 * This is needed because race and profile images reference local paths like "/images/races/Elfe.webp"
 * but the actual images are stored in R2 cloud storage.
 */

interface AssetMapping {
    name: string;
    path: string;  // R2 public URL
    localPath: string;
    category: string;
    type: string;
}

// Cache for asset mappings to avoid multiple fetches
let assetMappingsCache: AssetMapping[] | null = null;

/**
 * Loads the asset mappings from the JSON file
 */
async function loadAssetMappings(): Promise<AssetMapping[]> {
    if (assetMappingsCache) {
        return assetMappingsCache;
    }

    try {
        const response = await fetch('/asset-mappings.json');
        if (!response.ok) {
            console.error('Failed to load asset mappings');
            return [];
        }
        assetMappingsCache = await response.json();
        return assetMappingsCache || [];
    } catch (error) {
        console.error('Error loading asset mappings:', error);
        return [];
    }
}

/**
 * Maps a local image path to its R2 CDN URL
 * @param localPath - The local path like "/images/races/Elfe.webp"
 * @returns The R2 URL or the original path if no mapping is found
 */
export async function mapImagePath(localPath: string): Promise<string> {
    // If it's already an external URL (http/https), return as-is
    if (localPath.startsWith('http://') || localPath.startsWith('https://')) {
        return localPath;
    }

    // Load asset mappings
    const mappings = await loadAssetMappings();

    // Find the matching asset by localPath
    const asset = mappings.find(m => m.localPath === localPath);

    if (asset) {
        return asset.path;  // Return the R2 URL
    }

    // If no mapping found, return the original path
    // This allows fallback to local images if they exist
    console.warn(`No R2 mapping found for: ${localPath}`);
    return localPath;
}

/**
 * Maps multiple image paths in parallel
 */
export async function mapImagePaths(localPaths: string[]): Promise<string[]> {
    return Promise.all(localPaths.map(path => mapImagePath(path)));
}

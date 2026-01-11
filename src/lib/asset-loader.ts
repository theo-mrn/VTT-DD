/**
 * Utility to get asset URLs from R2 or fallback to local paths
 */

import assetMappings from '@/../public/asset-mappings.json';

interface AssetMapping {
    name: string;
    path: string;
    localPath: string;
    category: string;
    type: string;
    size: number;
    uploadedAt: string;
}

const mappings = assetMappings as AssetMapping[];

// Create a map for faster lookups
const assetMap = new Map<string, string>();
mappings.forEach(mapping => {
    assetMap.set(mapping.localPath, mapping.path);
});

/**
 * Get the URL for an asset, preferring R2 if available, otherwise using local path
 * @param localPath - The local path (e.g., "/textures/marble_diffuse.png")
 * @returns The R2 URL or local path
 */
export function getAssetUrl(localPath: string): string {
    // Normalize the path to ensure it starts with /
    const normalizedPath = localPath.startsWith('/') ? localPath : `/${localPath}`;

    // Check if we have an R2 URL for this asset
    const r2Url = assetMap.get(normalizedPath);

    if (r2Url) {
        return r2Url;
    }

    // Fallback to local path
    return normalizedPath;
}

/**
 * Get multiple asset URLs at once
 * @param localPaths - Array of local paths
 * @returns Array of R2 URLs or local paths
 */
export function getAssetUrls(localPaths: string[]): string[] {
    return localPaths.map(getAssetUrl);
}

/**
 * Check if an asset is available on R2
 * @param localPath - The local path to check
 * @returns true if the asset is on R2, false otherwise
 */
export function isAssetOnR2(localPath: string): boolean {
    const normalizedPath = localPath.startsWith('/') ? localPath : `/${localPath}`;
    return assetMap.has(normalizedPath);
}

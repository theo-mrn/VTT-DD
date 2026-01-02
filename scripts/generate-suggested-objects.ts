#!/usr/bin/env node

/**
 * Generate suggested-objects.ts from R2 asset mappings
 * This script reads asset-mappings.json and generates the suggested objects list
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

interface AssetMapping {
    name: string;
    path: string;
    localPath: string;
    category: string;
    type: string;
}

// Read asset mappings
const jsonPath = path.join(process.cwd(), 'public', 'asset-mappings.json');
const mappings: AssetMapping[] = JSON.parse(readFileSync(jsonPath, 'utf-8'));

// Filter for items category
const itemAssets = mappings.filter(m => m.category.startsWith('items/'));

// Group by subcategory
const grouped: Record<string, AssetMapping[]> = {};
itemAssets.forEach(asset => {
    const parts = asset.category.split('/');
    const subcategory = parts[1] || 'other';
    if (!grouped[subcategory]) {
        grouped[subcategory] = [];
    }
    grouped[subcategory].push(asset);
});

// Generate TypeScript code
let tsCode = `export type SuggestedItem = {
  name: string
  path: string
  category: string
}

// Auto-generated from R2 asset mappings
// DO NOT EDIT MANUALLY - Run: npx tsx scripts/generate-suggested-objects.ts
export const SUGGESTED_OBJECTS: SuggestedItem[] = [
`;

// Sort categories alphabetically
const sortedCategories = Object.keys(grouped).sort();

sortedCategories.forEach((category, catIndex) => {
    const assets = grouped[category].sort((a, b) => a.name.localeCompare(b.name));

    if (catIndex > 0) tsCode += '\n';
    tsCode += `  // ${category.charAt(0).toUpperCase() + category.slice(1)}\n`;

    assets.forEach((asset, index) => {
        const isLast = index === assets.length - 1 && catIndex === sortedCategories.length - 1;
        tsCode += `  { name: '${asset.name.replace(/\.[^.]+$/, '')}', path: '${asset.path}', category: '${category}' }${isLast ? '' : ','}\n`;
    });
});

tsCode += `]

export const ITEM_CATEGORIES = [
  { id: 'all', label: 'Tout' },
`;

sortedCategories.forEach((category, index) => {
    const isLast = index === sortedCategories.length - 1;
    const label = category.charAt(0).toUpperCase() + category.slice(1);
    tsCode += `  { id: '${category}', label: '${label}' }${isLast ? '' : ','}\n`;
});

tsCode += `]
`;

// Write to file
const outputPath = path.join(process.cwd(), 'src', 'lib', 'suggested-objects.ts');
writeFileSync(outputPath, tsCode, 'utf-8');

console.log('✅ Generated suggested-objects.ts with R2 URLs');
console.log(`📊 Total items: ${itemAssets.length}`);
console.log(`📁 Categories: ${sortedCategories.join(', ')}`);

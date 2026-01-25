const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

// Read asset mappings
const jsonPath = path.join(process.cwd(), 'public', 'asset-mappings.json');
const mappings = JSON.parse(readFileSync(jsonPath, 'utf-8'));

// Category normalization mappings
const CATEGORY_MAPPINGS = {
    // Conteneurs
    'bag': 'conteneurs',
    'barrel': 'conteneurs',
    'chest': 'conteneurs',
    'containers': 'conteneurs',

    // Nature & Éléments
    'fire': 'nature',
    'feu': 'nature',
    'water': 'nature',
    'arbre': 'nature',

    // Mobilier & Déco
    'furniture': 'mobilier',
    'fourniture': 'mobilier',
    'decorations': 'mobilier',

    // Architecture
    'ladder': 'architecture',
    'stairs': 'architecture',

    // Items
    'book': 'livres',
    'gem': 'trésors',
    'keys': 'trésors',
    'potions': 'potions',

    // Équipement
    'vehicles': 'véhicules',
    'equipment': 'équipement',
    'arme': 'armes',
    'armure': 'armures',

    // Ambiance / Thèmes
    'camps': 'campement',
    'travel': 'campement',
    'dark': 'macabre',
    'misc': 'divers',

    // Existing cohesive categories (capitalize/keep)
    'farm': 'ferme',
    'marché': 'marché'
};

// Filter for items and objets categories
const itemAssets = mappings.filter(m => m.category.startsWith('items/') || m.category.startsWith('objets/'));

// Group by subcategory
const grouped = {};
itemAssets.forEach(asset => {
    const parts = asset.category.split('/');
    const subcategory = parts[1] || 'other';

    // Normalize category
    let finalCategory = CATEGORY_MAPPINGS[subcategory.toLowerCase()] || subcategory;
    // Capitalize first letter if not already mapped (fallback)
    if (!CATEGORY_MAPPINGS[subcategory.toLowerCase()]) {
        finalCategory = finalCategory.charAt(0).toUpperCase() + finalCategory.slice(1);
    }

    if (!grouped[finalCategory]) {
        grouped[finalCategory] = [];
    }
    grouped[finalCategory].push(asset);
});

// Generate TypeScript code
let tsCode = `export type SuggestedItem = {
  name: string
  path: string
  category: string
}

// Auto-generated from R2 asset mappings
// DO NOT EDIT MANUALLY - Run: node scripts/generate-suggested-objects.js
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

#!/usr/bin/env node

/**
 * Script pour renommer les fichiers de public/objet2 en français
 * 
 * Usage:
 *   npx tsx scripts/rename-objet2.ts [--dry-run]
 */

import { readdir, rename, stat } from 'fs/promises';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

interface RenameMapping {
    oldPath: string;
    newPath: string;
    oldName: string;
    newName: string;
}

// Règles de traduction des patterns communs
const TRANSLATION_RULES: Array<{ pattern: RegExp; replacer: (match: string, ...groups: string[]) => string }> = [
    // Camps / Militaire
    { pattern: /^Banner (\d+)([ab]?)\.png$/i, replacer: (_, num, variant) => `banniere-${num}${variant}.png` },
    { pattern: /^Bomb (\d+)\.png$/i, replacer: (_, num) => `bombe-${num}.png` },
    { pattern: /^Cage (\d+)\.png$/i, replacer: (_, num) => `cage-${num}.png` },
    { pattern: /^Ladder (\d+)\.png$/i, replacer: (_, num) => `echelle-${num}.png` },
    { pattern: /^Sack Barricade[_ ](\d+)\.png$/i, replacer: (_, num) => `barricade-sacs-${num}.png` },
    { pattern: /^Sack Barricade[_ ]seamless\.png$/i, replacer: () => 'barricade-sacs-seamless.png' },
    { pattern: /^Sack Barricade[_ ]seamless[_ ](cap|start)\.png$/i, replacer: (_, type) => `barricade-sacs-seamless-${type}.png` },
    { pattern: /^Spiked Barricade[_ ](\d+)\.png$/i, replacer: (_, num) => `barricade-pieux-${num}.png` },
    { pattern: /^Spiked Barricade[_ ]seamless\.png$/i, replacer: () => 'barricade-pieux-seamless.png' },
    { pattern: /^Spiked Barricade[_ ]seamless[_ ](cap|start)\.png$/i, replacer: (_, type) => `barricade-pieux-seamless-${type}.png` },
    {
        pattern: /^Siege Weapon - (.+)\.png$/i, replacer: (_, weapon) => {
            const weaponMap: Record<string, string> = {
                'Ballista': 'baliste',
                'Battering Ram': 'belier',
                'Cannon': 'canon',
                'Mangonel': 'mangonneau',
                'Rocketeer': 'roquette',
                'Sling': 'fronde',
                'Trebuchet': 'trebuchet',
                'War Wagon': 'chariot-guerre',
            };
            const parts = weapon.split(' ');
            const num = parts[parts.length - 1];
            const baseName = parts.slice(0, -1).join(' ');
            const translated = weaponMap[baseName] || weaponMap[weapon] || weapon.toLowerCase().replace(/ /g, '-');
            return /^\d+$/.test(num) ? `arme-siege-${translated}-${num}.png` : `arme-siege-${weapon.toLowerCase().replace(/ /g, '-')}.png`;
        }
    },
    { pattern: /^Staked Head (\d+)\.png$/i, replacer: (_, num) => `tete-empalee-${num}.png` },
    { pattern: /^Standing[_ ](.+)\.png$/i, replacer: (_, item) => `debout-${item.toLowerCase().replace(/ /g, '-')}.png` },
    { pattern: /^Tent[_ ]rugged (\d+)([ab]?)\.png$/i, replacer: (_, num, variant) => `tente-robuste-${num}${variant}.png` },
    { pattern: /^Training Target (\d+)\.png$/i, replacer: (_, num) => `cible-entrainement-${num}.png` },
    { pattern: /^Weapon Rack[_ ](empty|filled) (\d+)\.png$/i, replacer: (_, type, num) => `support-armes-${type === 'empty' ? 'vide' : 'plein'}-${num}.png` },
    { pattern: /^Wooden Gatehouse (\d+)\.png$/i, replacer: (_, num) => `porte-bois-${num}.png` },
    { pattern: /^Wooden Wall Piece[_ ]destroyed\.png$/i, replacer: () => 'mur-bois-detruit.png' },

    // Farm / Ferme
    { pattern: /^Basin (\d+)\.png$/i, replacer: (_, num) => `bassin-${num}.png` },
    { pattern: /^Cat\.png$/i, replacer: () => 'chat.png' },
    { pattern: /^Chicken\.png$/i, replacer: () => 'poulet.png' },
    {
        pattern: /^Crop[_ ](.+) ([ABC])\.png$/i, replacer: (_, crop, variant) => {
            const cropMap: Record<string, string> = {
                'Beans': 'haricots',
                'Berries': 'baies',
                'Peas': 'pois',
                'Wheat': 'ble',
            };
            return `culture-${cropMap[crop] || crop.toLowerCase()}-${variant.toLowerCase()}.png`;
        }
    },
    { pattern: /^Farm Tool (\d+)\.png$/i, replacer: (_, num) => `outil-ferme-${num}.png` },
    { pattern: /^Fence (\d+)\.png$/i, replacer: (_, num) => `cloture-${num}.png` },
    { pattern: /^Fence Part (\d+)\.png$/i, replacer: (_, num) => `cloture-partie-${num}.png` },
    { pattern: /^Fence[_ ]corner\.png$/i, replacer: () => 'cloture-coin.png' },
    { pattern: /^Fieldstone Wall (\d+)\.png$/i, replacer: (_, num) => `mur-pierre-${num}.png` },
    { pattern: /^Fieldstone[_ ](T|X|corner)\.png$/i, replacer: (_, type) => `mur-pierre-${type.toLowerCase()}.png` },
    { pattern: /^Gate (Open|Closed)\.png$/i, replacer: (_, state) => `porte-${state === 'Open' ? 'ouverte' : 'fermee'}.png` },
    { pattern: /^Horse (\d+)([ab]?)\.png$/i, replacer: (_, num, variant) => `cheval-${num}${variant}.png` },
    { pattern: /^Horseshoe\.png$/i, replacer: () => 'fer-cheval.png' },
    {
        pattern: /^Livestock[_ ](.+) ([ABC])\.png$/i, replacer: (_, animal, variant) => {
            const animalMap: Record<string, string> = {
                'Cow': 'vache',
                'Goat': 'chevre',
                'Pig': 'cochon',
                'Sheep': 'mouton',
            };
            return `betail-${animalMap[animal] || animal.toLowerCase()}-${variant.toLowerCase()}.png`;
        }
    },
    { pattern: /^Logs (\d+)\.png$/i, replacer: (_, num) => `rondins-${num}.png` },
    { pattern: /^Plot (\d+)\.png$/i, replacer: (_, num) => `parcelle-${num}.png` },
    { pattern: /^Plot[_ ]filled (\d+)\.png$/i, replacer: (_, num) => `parcelle-cultivee-${num}.png` },
    { pattern: /^Plow (\d+)\.png$/i, replacer: (_, num) => `charrue-${num}.png` },
    { pattern: /^Sack (\d+)\.png$/i, replacer: (_, num) => `sac-${num}.png` },
    { pattern: /^Scarecrow (\d+)\.png$/i, replacer: (_, num) => `epouvantail-${num}.png` },
    { pattern: /^Straw Pile\.png$/i, replacer: () => 'tas-paille.png' },
    { pattern: /^Tall Grass (\d+)\.png$/i, replacer: (_, num) => `herbe-haute-${num}.png` },
    { pattern: /^Tree Stump (\d+)\.png$/i, replacer: (_, num) => `souche-arbre-${num}.png` },
    { pattern: /^Wagon (\d+)\.png$/i, replacer: (_, num) => `chariot-${num}.png` },
    { pattern: /^Wagon Wheel (\d+)\.png$/i, replacer: (_, num) => `roue-chariot-${num}.png` },
    { pattern: /^Well (\d+)\.png$/i, replacer: (_, num) => `puits-${num}.png` },
    { pattern: /^Yoke\.png$/i, replacer: () => 'joug.png' },

    // Fourniture / Mobilier
    { pattern: /^Animal Pelt (\d+)([ab]?)\.png$/i, replacer: (_, num, variant) => `peau-animal-${num}${variant}.png` },
    { pattern: /^Armchair (\d+)([ab]?)\.png$/i, replacer: (_, num, variant) => `fauteuil-${num}${variant}.png` },
    { pattern: /^Bar (\d+)\.png$/i, replacer: (_, num) => `bar-${num}.png` },
    { pattern: /^Barrel (\d+)\.png$/i, replacer: (_, num) => `tonneau-${num}.png` },
    { pattern: /^Barrel Cask\.png$/i, replacer: () => 'tonneau-fut.png' },
    {
        pattern: /^Barrel[_ ](empty|full|side)\.png$/i, replacer: (_, type) => {
            const typeMap: Record<string, string> = { 'empty': 'vide', 'full': 'plein', 'side': 'cote' };
            return `tonneau-${typeMap[type]}.png`;
        }
    },
    { pattern: /^Basket (\d+)\.png$/i, replacer: (_, num) => `panier-${num}.png` },
    { pattern: /^Bathtub\.png$/i, replacer: () => 'baignoire.png' },
    { pattern: /^Bed (\d+)([abc]?)\.png$/i, replacer: (_, num, variant) => `lit-${num}${variant}.png` },
    { pattern: /^Bench (\d+)\.png$/i, replacer: (_, num) => `banc-${num}.png` },
    { pattern: /^Booth (\d+)([ab]?)\.png$/i, replacer: (_, num, variant) => `box-${num}${variant}.png` },
    { pattern: /^Bucket\.png$/i, replacer: () => 'seau.png' },
    { pattern: /^Cabinet (\d+)?\.png$/i, replacer: (_, num) => num ? `armoire-${num}.png` : 'armoire.png' },
    { pattern: /^Candelabra (\d+)(?: \(lit\))?\.png$/i, replacer: (_, num, lit) => lit ? `candelabre-${num}-allume.png` : `candelabre-${num}.png` },
    { pattern: /^Candle (\d+)(?: \(lit\))?\.png$/i, replacer: (_, num, lit) => lit ? `bougie-${num}-allumee.png` : `bougie-${num}.png` },
    { pattern: /^Carpet (\d+)([ab]?)\.png$/i, replacer: (_, num, variant) => `tapis-${num}${variant}.png` },
    { pattern: /^Cauldron (\d+)([abc]?)\.png$/i, replacer: (_, num, variant) => `chaudron-${num}${variant}.png` },
    { pattern: /^Cellar Door\.png$/i, replacer: () => 'porte-cave.png' },
    { pattern: /^Chair (\d+)(?: \(D\))?([ab]?)\.png$/i, replacer: (_, num, d, variant) => d ? `chaise-${num}-cassee${variant}.png` : `chaise-${num}${variant}.png` },
    { pattern: /^Chest (\d+)([ab]?)\.png$/i, replacer: (_, num, variant) => `coffre-${num}${variant}.png` },
    { pattern: /^Church Pew\.png$/i, replacer: () => 'banc-eglise.png' },
    { pattern: /^Couch (\d+)([ab]?)\.png$/i, replacer: (_, num, variant) => `canape-${num}${variant}.png` },
    { pattern: /^Crate (\d+)\.png$/i, replacer: (_, num) => `caisse-${num}.png` },
    { pattern: /^Crib\.png$/i, replacer: () => 'berceau.png' },
    { pattern: /^Cupboard (\d+)(?: \(D\))?\.png$/i, replacer: (_, num, d) => d ? `placard-${num}-detruit.png` : `placard-${num}.png` },
    { pattern: /^Curtain (\d+)\.png$/i, replacer: (_, num) => `rideau-${num}.png` },
    { pattern: /^Cutlery (\d+)\.png$/i, replacer: (_, num) => `couverts-${num}.png` },
    { pattern: /^Door (\d+)\.png$/i, replacer: (_, num) => `porte-${num}.png` },
    { pattern: /^Drink Cart\.png$/i, replacer: () => 'chariot-boissons.png' },
    { pattern: /^Furnished Table (\d+)\.png$/i, replacer: (_, num) => `table-garnie-${num}.png` },
    { pattern: /^Gong\.png$/i, replacer: () => 'gong.png' },
    { pattern: /^Hand Bellow\.png$/i, replacer: () => 'soufflet-main.png' },
    { pattern: /^Hearth(?: \(lit\))?\.png$/i, replacer: (_, lit) => lit ? 'foyer-allume.png' : 'foyer.png' },
    { pattern: /^Kindling\.png$/i, replacer: () => 'petit-bois.png' },
    { pattern: /^Kitchen Knife\.png$/i, replacer: () => 'couteau-cuisine.png' },
    { pattern: /^Lantern (\d+)?\.png$/i, replacer: (_, num) => num ? `lanterne-${num}.png` : 'lanterne.png' },
    { pattern: /^Lounge Table (\d+)(?: \(D\))?\.png$/i, replacer: (_, num, d) => d ? `table-basse-${num}-detruite.png` : `table-basse-${num}.png` },
    { pattern: /^Mirror ([ab])\.png$/i, replacer: (_, variant) => `miroir-${variant}.png` },
    { pattern: /^Piano( Bench)?\.png$/i, replacer: (_, bench) => bench ? 'banc-piano.png' : 'piano.png' },
    { pattern: /^Pillow (\d+)([abc])\.png$/i, replacer: (_, num, variant) => `oreiller-${num}${variant}.png` },
    { pattern: /^Pitcher\.png$/i, replacer: () => 'pichet.png' },
    { pattern: /^Plant (\d+)\.png$/i, replacer: (_, num) => `plante-${num}.png` },
    { pattern: /^Pot (\d+)\.png$/i, replacer: (_, num) => `pot-${num}.png` },
    { pattern: /^Scale - (.+)\.png$/i, replacer: (_, type) => `balance-${type.toLowerCase()}.png` },
    { pattern: /^Scroll\.png$/i, replacer: () => 'parchemin.png' },
    {
        pattern: /^Shelf (\d+)(\([AB]\))?(?: \(D\))?\.png$/i, replacer: (_, num, variant, d) => {
            const v = variant ? `-${variant.replace(/[()]/g, '').toLowerCase()}` : '';
            const destroyed = d ? '-detruit' : '';
            return `etagere-${num}${v}${destroyed}.png`;
        }
    },
    { pattern: /^Side Table (\d+)(?: \(D\))?\.png$/i, replacer: (_, num, d) => d ? `table-appoint-${num}-detruite.png` : `table-appoint-${num}.png` },
    { pattern: /^Spoon (\d+)\.png$/i, replacer: (_, num) => `cuillere-${num}.png` },
    { pattern: /^Staircase (\d+)\.png$/i, replacer: (_, num) => `escalier-${num}.png` },
    { pattern: /^Stool (\d+)(?: \(D\))?\.png$/i, replacer: (_, num, d) => d ? `tabouret-${num}-detruit.png` : `tabouret-${num}.png` },
    { pattern: /^Stove\.png$/i, replacer: () => 'poele.png' },
    { pattern: /^Swinging Door\.png$/i, replacer: () => 'porte-battante.png' },
    { pattern: /^Table (\d+)(?: \(D\))?\.png$/i, replacer: (_, num, d) => d ? `table-${num}-detruite.png` : `table-${num}.png` },
    { pattern: /^Trophy (\d+)\.png$/i, replacer: (_, num) => `trophee-${num}.png` },
    { pattern: /^Wall Hook (\d+)\.png$/i, replacer: (_, num) => `crochet-mural-${num}.png` },
    { pattern: /^Well\.png$/i, replacer: () => 'puits.png' },
    { pattern: /^Wood Pile\.png$/i, replacer: () => 'tas-bois.png' },
    { pattern: /^Wooden Seat (\d+)(?: \(D\))?\.png$/i, replacer: (_, num, d) => d ? `siege-bois-${num}-detruit.png` : `siege-bois-${num}.png` },

    // Marché
    {
        pattern: /^Food[_ ](.+)\.png$/i, replacer: (_, food) => {
            const foodMap: Record<string, string> = {
                'potatoes': 'pommes-terre',
                'apples': 'pommes',
                'lettuce': 'laitue',
                'cabbage': 'chou',
                'fish': 'poisson',
            };
            const parts = food.split(' ');
            const num = parts[parts.length - 1];
            const baseName = parts.slice(0, -1).join(' ').toLowerCase();
            const translated = foodMap[baseName] || foodMap[food.toLowerCase()] || food.toLowerCase().replace(/ /g, '-');
            return /^\d+$/.test(num) ? `nourriture-${translated}-${num}.png` : `nourriture-${translated}.png`;
        }
    },
    { pattern: /^Wagon (\d+)(?: \(filled\))?\.png$/i, replacer: (_, num, filled) => filled ? `chariot-${num}-rempli.png` : `chariot-${num}.png` },
    { pattern: /^Stall[_ ]food (\d+)\.png$/i, replacer: (_, num) => `etalage-nourriture-${num}.png` },
    { pattern: /^Stall (\d+)\.png$/i, replacer: (_, num) => `etalage-${num}.png` },
    { pattern: /^Jewelery (\d+)\.png$/i, replacer: (_, num) => `bijouterie-${num}.png` },
    { pattern: /^Equipment (\d+)\.png$/i, replacer: (_, num) => `equipement-${num}.png` },
    { pattern: /^Tent (\d+)\.png$/i, replacer: (_, num) => `tente-${num}.png` },
    { pattern: /^Pottery (\d+)\.png$/i, replacer: (_, num) => `poterie-${num}.png` },
    { pattern: /^Fabric (\d+)\.png$/i, replacer: (_, num) => `tissu-${num}.png` },
];

function translateFileName(fileName: string): string {
    for (const rule of TRANSLATION_RULES) {
        if (rule.pattern.test(fileName)) {
            return fileName.replace(rule.pattern, rule.replacer);
        }
    }

    // Si aucune règle ne correspond, normaliser le nom
    return fileName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[_()]/g, '-')
        .replace(/-+/g, '-');
}

async function scanAndRename(dirPath: string): Promise<RenameMapping[]> {
    const mappings: RenameMapping[] = [];

    try {
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                // Recursively scan subdirectories
                const subMappings = await scanAndRename(fullPath);
                mappings.push(...subMappings);
            } else if (entry.isFile() && !entry.name.startsWith('.')) {
                const ext = path.extname(entry.name).toLowerCase();
                if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
                    const newName = translateFileName(entry.name);

                    if (newName !== entry.name) {
                        const newPath = path.join(path.dirname(fullPath), newName);
                        mappings.push({
                            oldPath: fullPath,
                            newPath,
                            oldName: entry.name,
                            newName,
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error(`Error scanning directory ${dirPath}:`, error);
    }

    return mappings;
}

async function main() {
    console.log('🏷️  Renommage des Objets en Français');
    console.log('====================================\n');

    if (isDryRun) {
        console.log('⚠️  DRY RUN MODE - No files will be renamed\n');
    }

    const objet2Dir = path.join(process.cwd(), 'public', 'objet2');

    try {
        await stat(objet2Dir);
    } catch (error) {
        console.error(`❌ Directory ${objet2Dir} not found!`);
        process.exit(1);
    }

    // Step 1: Scan and build rename mappings
    console.log('📁 Scanning files...\n');
    const mappings = await scanAndRename(objet2Dir);

    console.log(`\n✅ Found ${mappings.length} files to rename\n`);

    // Show category breakdown
    const categoryCount: Record<string, number> = {};
    mappings.forEach(mapping => {
        const relPath = path.relative(objet2Dir, mapping.oldPath);
        const category = relPath.split(path.sep)[0];
        categoryCount[category] = (categoryCount[category] || 0) + 1;
    });

    console.log('📊 Category breakdown:');
    Object.entries(categoryCount).sort().forEach(([cat, count]) => {
        console.log(`  • ${cat}: ${count} files`);
    });

    if (isDryRun || mappings.length === 0) {
        console.log('\n📋 Sample renamings:');
        mappings.slice(0, 20).forEach(mapping => {
            console.log(`  ${mapping.oldName} → ${mapping.newName}`);
        });

        if (mappings.length > 20) {
            console.log(`  ... and ${mappings.length - 20} more`);
        }

        console.log('\n✅ Dry run complete!');
        return;
    }

    // Step 2: Rename files
    console.log('\n📝 Renaming files...\n');
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < mappings.length; i++) {
        const mapping = mappings[i];
        const progress = `[${i + 1}/${mappings.length}]`;

        try {
            process.stdout.write(`${progress} ${mapping.oldName} → ${mapping.newName}... `);
            await rename(mapping.oldPath, mapping.newPath);
            successCount++;
            console.log('✅');
        } catch (error: any) {
            errorCount++;
            console.log(`❌ ${error.message}`);
        }
    }

    console.log(`\n📊 Rename Summary:`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Errors: ${errorCount}`);

    console.log('\n🎉 Renaming complete!');
}

// Run the script
main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});

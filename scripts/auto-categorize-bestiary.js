const fs = require('fs');
const path = require('path');

// Chemin vers le fichier bestiary
const bestiaryPath = path.join(__dirname, '..', 'public', 'tabs', 'bestiairy.json');

// Fonction pour déterminer la catégorie en fonction du contexte
function determineCategory(creature) {
    const nom = creature.Nom?.toLowerCase() || '';
    const type = creature.Type?.toLowerCase() || '';
    const description = creature.description?.toLowerCase() || '';

    // Dragons
    if (type.includes('dragon') || nom.includes('dragon')) {
        return 'dragon';
    }

    // Élémentaires
    if (type.includes('élémentaire') || type.includes('elemental') || nom.includes('élémentaire') || nom.includes('elemental')) {
        return 'elemental';
    }

    // Mort-vivants
    if (type.includes('undead') || type.includes('mort-vivant') ||
        nom.includes('zombie') || nom.includes('squelette') || nom.includes('spectre') ||
        nom.includes('vampire') || nom.includes('liche') || nom.includes('momie') ||
        nom.includes('ghost') || nom.includes('wraith') || nom.includes('wight')) {
        return 'undead';
    }

    // Démons
    if (type.includes('demon') || type.includes('démon') || type.includes('fiend') ||
        nom.includes('demon') || nom.includes('démon') || nom.includes('balor') ||
        nom.includes('marilith') || nom.includes('glabrezu') || nom.includes('vrock')) {
        return 'demon';
    }

    // Diables
    if (type.includes('devil') || type.includes('diable') ||
        nom.includes('devil') || nom.includes('diable') || nom.includes('pit fiend') ||
        nom.includes('erinyes') || nom.includes('barbed devil')) {
        return 'devil';
    }

    // Géants
    if (type.includes('giant') || type.includes('géant') ||
        nom.includes('giant') || nom.includes('géant') || nom.includes('ogre') || nom.includes('troll')) {
        return 'giant';
    }

    // Aberrations
    if (type.includes('aberration') ||
        nom.includes('aboleth') || nom.includes('beholder') || nom.includes('mind flayer') ||
        nom.includes('illithid') || nom.includes('otyugh')) {
        return 'aberration';
    }

    // Bêtes
    if (type.includes('beast') || type.includes('bête') ||
        nom.includes('loup') || nom.includes('ours') || nom.includes('aigle') ||
        nom.includes('wolf') || nom.includes('bear') || nom.includes('eagle')) {
        return 'beast';
    }

    // Humanoïdes
    if (type.includes('humanoid') || type.includes('humanoïde') || type.includes('humain')) {
        // Sous-catégories pour humanoïdes
        if (nom.includes('gobelin') || nom.includes('goblin') || nom.includes('hobgoblin') || nom.includes('bugbear')) {
            return 'goblinoid';
        }
        if (nom.includes('orc') || nom.includes('half-orc')) {
            return 'orc';
        }
        if (nom.includes('elf') || nom.includes('elfe') || nom.includes('drow')) {
            return 'elf';
        }
        if (nom.includes('dwarf') || nom.includes('nain')) {
            return 'dwarf';
        }
        if (nom.includes('gnome')) {
            return 'gnome';
        }
        if (nom.includes('halfling') || nom.includes('halfelin')) {
            return 'halfling';
        }
        return 'humanoid';
    }

    // Construits
    if (type.includes('construct') || type.includes('construit') ||
        nom.includes('golem') || nom.includes('animated')) {
        return 'construct';
    }

    // Fées
    if (type.includes('fey') || type.includes('fée') ||
        nom.includes('pixie') || nom.includes('sprite') || nom.includes('dryad') ||
        nom.includes('satyr')) {
        return 'fey';
    }

    // Plantes
    if (type.includes('plant') || type.includes('plante') ||
        nom.includes('treant') || nom.includes('shambling mound')) {
        return 'plant';
    }

    // Vases
    if (type.includes('ooze') || type.includes('vase') ||
        nom.includes('gelatinous cube') || nom.includes('black pudding')) {
        return 'ooze';
    }

    // Monstruosités
    if (type.includes('monstrosity') || type.includes('monstruosité') ||
        nom.includes('chimera') || nom.includes('manticore') || nom.includes('hydra') ||
        nom.includes('basilisk') || nom.includes('gorgon')) {
        return 'monstrosity';
    }

    // Célestes
    if (type.includes('celestial') || type.includes('céleste') ||
        nom.includes('angel') || nom.includes('ange') || nom.includes('deva') ||
        nom.includes('planetar') || nom.includes('solar')) {
        return 'celestial';
    }

    // Par défaut, utiliser "creature" ou conserver la catégorie existante
    return creature.Category || 'creature';
}

// Fonction principale
async function categorizeBestiary() {
    try {
        console.log('📖 Lecture du fichier bestiary...');
        const data = fs.readFileSync(bestiaryPath, 'utf8');
        const bestiary = JSON.parse(data);

        let updated = 0;
        let unchanged = 0;
        const entries = Object.keys(bestiary);

        console.log(`\n🔍 Traitement de ${entries.length} créatures...\n`);

        entries.forEach((key, index) => {
            const creature = bestiary[key];
            const oldCategory = creature.Category;
            const newCategory = determineCategory(creature);

            if (oldCategory !== newCategory) {
                creature.Category = newCategory;
                updated++;
                console.log(`[${index + 1}/${entries.length}] ✏️  ${creature.Nom}: "${oldCategory || 'N/A'}" → "${newCategory}"`);
            } else {
                unchanged++;
                console.log(`[${index + 1}/${entries.length}] ✓  ${creature.Nom}: "${newCategory}" (inchangé)`);
            }
        });

        console.log('\n💾 Sauvegarde du fichier bestiary...');
        fs.writeFileSync(bestiaryPath, JSON.stringify(bestiary, null, 4), 'utf8');

        console.log('\n✅ Traitement terminé !');
        console.log(`   - ${updated} créatures mises à jour`);
        console.log(`   - ${unchanged} créatures inchangées`);
        console.log(`   - Total: ${entries.length} créatures\n`);

    } catch (error) {
        console.error('❌ Erreur:', error.message);
        process.exit(1);
    }
}

// Exécution du script
categorizeBestiary();

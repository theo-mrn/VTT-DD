const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate';
const INPUT_FILE = path.join(__dirname, 'bestiairy.json');
const OUTPUT_FILE = path.join(__dirname, 'bestiairy_fr.json');
const SOURCE_LANG = 'EN';
const TARGET_LANG = 'FR';
const BATCH_SIZE = 50; // Nombre de textes à traduire par requête
const DELAY_MS = 1000; // Délai entre les requêtes pour éviter le rate limiting

/**
 * Traduit un tableau de textes en utilisant l'API DeepL
 */
async function translateTexts(texts) {
    if (!DEEPL_API_KEY) {
        throw new Error('DEEPL_API_KEY n\'est pas définie dans les variables d\'environnement');
    }

    if (texts.length === 0) {
        return [];
    }

    try {
        // Construire les paramètres
        const params = new URLSearchParams();
        texts.forEach(text => {
            params.append('text', text);
        });
        params.append('source_lang', SOURCE_LANG);
        params.append('target_lang', TARGET_LANG);

        const response = await fetch(DEEPL_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erreur DeepL API (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        return data.translations.map(t => t.text);
    } catch (error) {
        console.error('Erreur lors de la traduction:', error);
        throw error;
    }
}

/**
 * Extrait tous les textes à traduire du bestiairy
 */
function extractTextsToTranslate(bestiairy) {
    const texts = [];
    const mapping = [];

    for (const [creatureKey, creature] of Object.entries(bestiairy)) {
        // Nom de la créature
        if (creature.Nom) {
            texts.push(creature.Nom);
            mapping.push({ creatureKey, type: 'name' });
        }

        // Actions de la créature
        if (creature.Actions && Array.isArray(creature.Actions)) {
            creature.Actions.forEach((action, actionIndex) => {
                // Nom de l'action
                if (action.Nom) {
                    texts.push(action.Nom);
                    mapping.push({ creatureKey, type: 'actionName', actionIndex });
                }

                // Description de l'action
                if (action.Description) {
                    texts.push(action.Description);
                    mapping.push({ creatureKey, type: 'actionDescription', actionIndex });
                }
            });
        }
    }

    return { texts, mapping };
}

/**
 * Applique les traductions au bestiairy
 */
function applyTranslations(bestiairy, translations, mapping) {
    const translatedBestiairy = JSON.parse(JSON.stringify(bestiairy)); // Deep copy

    translations.forEach((translation, index) => {
        const map = mapping[index];
        const creature = translatedBestiairy[map.creatureKey];

        if (!creature) return;

        switch (map.type) {
            case 'name':
                creature.Nom = translation;
                break;
            case 'actionName':
                if (creature.Actions && creature.Actions[map.actionIndex]) {
                    creature.Actions[map.actionIndex].Nom = translation;
                }
                break;
            case 'actionDescription':
                if (creature.Actions && creature.Actions[map.actionIndex]) {
                    creature.Actions[map.actionIndex].Description = translation;
                }
                break;
        }
    });

    return translatedBestiairy;
}

/**
 * Traduit le bestiairy par lots
 */
async function translateBestiairy() {
    console.log('🔄 Chargement du fichier bestiairy.json...');

    // Charger le fichier
    const bestiairyData = fs.readFileSync(INPUT_FILE, 'utf8');
    const bestiairy = JSON.parse(bestiairyData);

    console.log(`✅ Fichier chargé: ${Object.keys(bestiairy).length} créatures trouvées`);

    // Extraire tous les textes à traduire
    console.log('🔍 Extraction des textes à traduire...');
    const { texts, mapping } = extractTextsToTranslate(bestiairy);
    console.log(`📝 ${texts.length} textes à traduire`);

    // Traduire par lots
    const translations = [];
    const totalBatches = Math.ceil(texts.length / BATCH_SIZE);

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

        console.log(`🌐 Traduction du lot ${batchNumber}/${totalBatches} (${batch.length} textes)...`);

        try {
            const batchTranslations = await translateTexts(batch);
            translations.push(...batchTranslations);

            console.log(`✅ Lot ${batchNumber}/${totalBatches} traduit`);

            // Délai entre les requêtes
            if (i + BATCH_SIZE < texts.length) {
                console.log(`⏳ Attente de ${DELAY_MS}ms avant le prochain lot...`);
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }
        } catch (error) {
            console.error(`❌ Erreur lors de la traduction du lot ${batchNumber}:`, error);
            throw error;
        }
    }

    // Appliquer les traductions
    console.log('🔄 Application des traductions...');
    const translatedBestiairy = applyTranslations(bestiairy, translations, mapping);

    // Sauvegarder le fichier traduit
    console.log(`💾 Sauvegarde dans ${OUTPUT_FILE}...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(translatedBestiairy, null, 4), 'utf8');

    console.log('✅ Traduction terminée avec succès!');
    console.log(`📄 Fichier de sortie: ${OUTPUT_FILE}`);

    // Statistiques
    const stats = {
        totalCreatures: Object.keys(bestiairy).length,
        totalTexts: texts.length,
        totalActions: mapping.filter(m => m.type === 'actionName').length,
    };

    console.log('\n📊 Statistiques:');
    console.log(`   - Créatures traduites: ${stats.totalCreatures}`);
    console.log(`   - Total de textes traduits: ${stats.totalTexts}`);
    console.log(`   - Actions traduites: ${stats.totalActions}`);
}

// Exécution
if (require.main === module) {
    translateBestiairy()
        .then(() => {
            console.log('\n🎉 Script terminé!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Erreur fatale:', error);
            process.exit(1);
        });
}

module.exports = { translateBestiairy, translateTexts };

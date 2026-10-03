const fs = require('fs');

// L'URL de base de l'API
const BASE_URL = 'https://www.dnd5eapi.co';

// Les catégories que nous voulons récupérer
// "rule-sections" contient les textes explicatifs (combat, mouvement, etc.)
const CATEGORIES = [
    'conditions',       // Aveuglé, Charmé, etc.
    'ability-scores',   // Force, Dex, etc.
    'skills',           // Athlétisme, Discrétion...
    'damage-types',     // Feu, Contondant...
    'rule-sections'     // Les vrais textes de règles (Attaquer, Se cacher...)
];

async function fetchCategory(category) {
    console.log(`⏳ Récupération de la liste : ${category}...`);
    
    // 1. On récupère la liste des éléments de la catégorie
    const response = await fetch(`${BASE_URL}/api/${category}`);
    const data = await response.json();
    
    // 2. On parcourt chaque élément pour aller chercher ses détails (description)
    // On utilise Promise.all pour faire les requêtes en parallèle (plus rapide)
    const detailPromises = data.results.map(async (item) => {
        // item.url ressemble à "/api/conditions/blinded"
        const itemResponse = await fetch(`${BASE_URL}${item.url}`);
        const itemData = await itemResponse.json();
        
        // On nettoie un peu pour ne garder que l'essentiel
        return {
            id: itemData.index,
            name: itemData.name,
            desc: itemData.desc, // C'est ici que se trouve le texte à traduire
            // On garde le reste au cas où (sous-catégories, etc.)
            full_data: itemData 
        };
    });

    const results = await Promise.all(detailPromises);
    console.log(`✅ ${category} : ${results.length} éléments récupérés.`);
    return results;
}

async function main() {
    console.log("🚀 Démarrage du téléchargement des règles D&D 5e...");
    
    const finalData = {};

    try {
        // On boucle sur toutes nos catégories
        for (const cat of CATEGORIES) {
            finalData[cat] = await fetchCategory(cat);
        }

        // 3. On sauvegarde le tout dans un fichier JSON
        const fileName = 'dnd_rules_en.json';
        fs.writeFileSync(fileName, JSON.stringify(finalData, null, 2));
        
        console.log("------------------------------------------------");
        console.log(`🎉 Terminé ! Les données sont dans le fichier "${fileName}"`);
        console.log("   Vous pouvez maintenant utiliser ce fichier pour la traduction.");

    } catch (error) {
        console.error("❌ Une erreur est survenue :", error);
    }
}

main();
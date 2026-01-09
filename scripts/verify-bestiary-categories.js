const fs = require('fs');
const path = require('path');

// Chemin vers le fichier bestiary
const bestiaryPath = path.join(__dirname, '..', 'public', 'tabs', 'bestiairy.json');

// Fonction de vérification
function verifyBestiaryCategories() {
    try {
        console.log('📖 Lecture du fichier bestiary...\n');
        const data = fs.readFileSync(bestiaryPath, 'utf8');
        const bestiary = JSON.parse(data);

        const entries = Object.keys(bestiary);
        const issues = [];
        const categoryCounts = {};

        console.log(`🔍 Vérification de ${entries.length} créatures...\n`);

        entries.forEach((key, index) => {
            const creature = bestiary[key];

            // Vérifier si la catégorie existe
            if (!creature.Category) {
                issues.push({
                    key,
                    nom: creature.Nom || 'N/A',
                    problem: 'Pas de Category définie'
                });
            } else if (creature.Category.trim() === '') {
                issues.push({
                    key,
                    nom: creature.Nom || 'N/A',
                    problem: 'Category vide'
                });
            } else {
                // Compter les catégories
                const category = creature.Category;
                categoryCounts[category] = (categoryCounts[category] || 0) + 1;
            }
        });

        // Afficher les résultats
        console.log('📊 RÉSULTATS DE LA VÉRIFICATION\n');
        console.log('═'.repeat(60));

        if (issues.length === 0) {
            console.log('\n✅ Toutes les créatures ont une catégorie définie !\n');
        } else {
            console.log(`\n❌ ${issues.length} créature(s) sans catégorie valide :\n`);
            issues.forEach((issue, i) => {
                console.log(`  ${i + 1}. [${issue.key}] ${issue.nom}`);
                console.log(`     Problème: ${issue.problem}\n`);
            });
        }

        // Afficher la distribution des catégories
        console.log('═'.repeat(60));
        console.log('\n📈 DISTRIBUTION DES CATÉGORIES\n');

        const sortedCategories = Object.entries(categoryCounts)
            .sort((a, b) => b[1] - a[1]);

        sortedCategories.forEach(([category, count]) => {
            const percentage = ((count / entries.length) * 100).toFixed(1);
            const bar = '█'.repeat(Math.ceil(count / 5));
            console.log(`  ${category.padEnd(15)} : ${count.toString().padStart(3)} (${percentage}%) ${bar}`);
        });

        console.log('\n' + '═'.repeat(60));
        console.log(`\n📝 RÉSUMÉ`);
        console.log(`   Total de créatures : ${entries.length}`);
        console.log(`   Créatures valides  : ${entries.length - issues.length}`);
        console.log(`   Créatures invalides: ${issues.length}`);
        console.log(`   Catégories uniques : ${Object.keys(categoryCounts).length}\n`);

        // Retourner le code de sortie approprié
        if (issues.length > 0) {
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Erreur:', error.message);
        process.exit(1);
    }
}

// Exécution du script
verifyBestiaryCategories();

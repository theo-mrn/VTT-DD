#!/usr/bin/env node

/**
 * Script de migration : Télécharger les images du bestiaire depuis l'API D&D 5e et les uploader sur Cloudflare R2
 * 
 * Ce script :
 * 1. Charge bestiairy.json
 * 2. Pour chaque créature avec une URL d'image de dnd5eapi.co :
 *    - Télécharge l'image
 *    - L'upload sur R2 dans le dossier `bestaire/`
 *    - Met à jour l'URL dans le JSON pour pointer vers R2
 * 3. Sauvegarde le nouveau JSON
 * 
 * Usage:
 *   npx tsx scripts/upload-bestiary-images-to-r2.ts [--dry-run] [--limit=N]
 * 
 * Variables d'environnement requises:
 *   R2_ACCESS_KEY_ID - Votre clé d'accès R2
 *   R2_SECRET_ACCESS_KEY - Votre clé secrète R2
 *   R2_ENDPOINT - URL de votre endpoint R2
 *   R2_BUCKET_NAME - Nom de votre bucket R2
 *   R2_PUBLIC_URL - URL publique de votre bucket R2
 */

// Charger les variables d'environnement depuis .env.local
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, writeFileSync } from 'fs';
import fetch from 'node-fetch';

// Parser les arguments de ligne de commande
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

// Initialiser le client R2
const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
});

interface BestiaryCreature {
    Nom: string;
    Type: string;
    description: string;
    image: string;
    niveau: number;
    Challenge: string;
    PV: number;
    PV_Max: number;
    Defense: number;
    Contact: number;
    Distance: number;
    Magie: number;
    INIT: number;
    FOR: number;
    DEX: number;
    CON: number;
    INT: number;
    SAG: number;
    CHA: number;
    Actions: Array<{
        Nom: string;
        Description: string;
        Toucher: number;
    }>;
}

interface BestiaryData {
    [key: string]: BestiaryCreature;
}

interface MigrationResult {
    creatureId: string;
    creatureName: string;
    oldUrl: string;
    newUrl: string;
    status: 'uploaded' | 'skipped' | 'error';
    error?: string;
}

async function downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

async function checkExists(key: string): Promise<boolean> {
    try {
        await r2Client.send(new HeadObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: key,
        }));
        return true;
    } catch {
        return false;
    }
}

async function uploadToR2(imageBuffer: Buffer, key: string, contentType: string): Promise<string> {
    await r2Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: imageBuffer,
        ContentType: contentType,
    }));

    // Générer l'URL publique
    const publicUrl = process.env.R2_PUBLIC_URL
        ? `${process.env.R2_PUBLIC_URL}/${key}`
        : `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${key}`;

    return publicUrl;
}

function getImageExtension(url: string): string {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return ext || '.png'; // Default to .png if no extension
}

function getContentType(extension: string): string {
    const contentTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
    };
    return contentTypes[extension] || 'image/png';
}

async function migrateCreatureImage(
    creatureId: string,
    creature: BestiaryCreature
): Promise<MigrationResult> {
    const result: MigrationResult = {
        creatureId,
        creatureName: creature.Nom,
        oldUrl: creature.image,
        newUrl: creature.image,
        status: 'error',
    };

    try {
        // Vérifier si l'image provient de l'API D&D 5e
        if (!creature.image.includes('dnd5eapi.co')) {
            result.status = 'skipped';
            result.error = 'Not a dnd5eapi.co URL';
            return result;
        }

        // Déterminer le nom du fichier et l'extension
        const extension = getImageExtension(creature.image);
        const filename = `${creatureId}${extension}`;
        const r2Key = `bestaire/${filename}`;

        // Vérifier si l'image existe déjà sur R2
        const exists = await checkExists(r2Key);
        if (exists) {
            // Générer l'URL même si déjà uploadé
            const publicUrl = process.env.R2_PUBLIC_URL
                ? `${process.env.R2_PUBLIC_URL}/${r2Key}`
                : `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${r2Key}`;

            result.newUrl = publicUrl;
            result.status = 'skipped';
            result.error = 'Already exists on R2';
            return result;
        }

        // Télécharger l'image depuis l'API
        const imageBuffer = await downloadImage(creature.image);

        // Uploader sur R2
        const contentType = getContentType(extension);
        const publicUrl = await uploadToR2(imageBuffer, r2Key, contentType);

        result.newUrl = publicUrl;
        result.status = 'uploaded';
        return result;
    } catch (error: any) {
        result.status = 'error';
        result.error = error.message;
        return result;
    }
}

async function main() {
    console.log('🐉 Script de migration du bestiaire vers Cloudflare R2');
    console.log('=====================================================\n');

    if (isDryRun) {
        console.log('⚠️  MODE DRY RUN - Aucun upload ne sera effectué\n');
    }

    if (limit) {
        console.log(`📊 Limite : ${limit} créatures\n`);
    }

    // Vérifier les variables d'environnement requises
    if (!isDryRun) {
        const required = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'];
        const missing = required.filter(key => !process.env[key]);

        if (missing.length > 0) {
            console.error('❌ Erreur : Variables d\'environnement manquantes :');
            missing.forEach(key => console.error(`  - ${key}`));
            console.error('\nVeuillez les définir dans votre fichier .env.local');
            process.exit(1);
        }
    }

    // Charger le fichier bestiairy.json
    const bestiaryPath = path.join(process.cwd(), 'public', 'tabs', 'bestiairy.json');
    console.log(`📖 Chargement du bestiaire depuis ${bestiaryPath}...\n`);

    let bestiaryData: BestiaryData;
    try {
        const bestiaryContent = readFileSync(bestiaryPath, 'utf-8');
        bestiaryData = JSON.parse(bestiaryContent);
    } catch (error: any) {
        console.error('❌ Erreur lors du chargement du bestiaire :', error.message);
        process.exit(1);
    }

    // Filtrer les créatures avec des images de dnd5eapi.co
    const allCreatures = Object.entries(bestiaryData);
    const creaturesWithApiImages = allCreatures.filter(([_, creature]) =>
        creature.image && creature.image.includes('dnd5eapi.co')
    );

    console.log(`📊 Total de créatures : ${allCreatures.length}`);
    console.log(`🔗 Créatures avec images dnd5eapi.co : ${creaturesWithApiImages.length}\n`);

    // Appliquer la limite si spécifiée
    let creaturesToMigrate = creaturesWithApiImages;
    if (limit && creaturesWithApiImages.length > limit) {
        console.log(`⚠️  Limitation aux ${limit} premières créatures\n`);
        creaturesToMigrate = creaturesWithApiImages.slice(0, limit);
    }

    if (isDryRun) {
        console.log('\n📋 Exemple de créatures qui seraient migrées :');
        creaturesToMigrate.slice(0, 10).forEach(([id, creature]) => {
            console.log(`  • ${creature.Nom} (${id})`);
            console.log(`    Depuis : ${creature.image}`);
            console.log(`    Vers   : bestaire/${id}${getImageExtension(creature.image)}\n`);
        });
        console.log('✅ Dry run terminé !');
        return;
    }

    // Migrer les images
    console.log('☁️  Migration des images vers Cloudflare R2...\n');
    const results: MigrationResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < creaturesToMigrate.length; i++) {
        const [creatureId, creature] = creaturesToMigrate[i];
        const progress = `[${i + 1}/${creaturesToMigrate.length}]`;

        process.stdout.write(`${progress} Migration de ${creature.Nom}... `);

        const result = await migrateCreatureImage(creatureId, creature);
        results.push(result);

        if (result.status === 'uploaded') {
            successCount++;
            console.log('✅');
        } else if (result.status === 'skipped') {
            skippedCount++;
            console.log(`⏭️  (${result.error})`);
        } else {
            errorCount++;
            console.log(`❌ (${result.error})`);
        }

        // Petite pause pour éviter de surcharger l'API
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`\n📊 Résumé de la migration :`);
    console.log(`  ✅ Succès : ${successCount}`);
    console.log(`  ⏭️  Ignorées : ${skippedCount}`);
    console.log(`  ❌ Erreurs : ${errorCount}`);

    // Mettre à jour le fichier bestiairy.json
    if (successCount > 0 || skippedCount > 0) {
        console.log('\n📝 Mise à jour du fichier bestiairy.json...');

        const updatedBestiary = { ...bestiaryData };
        for (const result of results) {
            if (result.status === 'uploaded' || result.status === 'skipped') {
                updatedBestiary[result.creatureId].image = result.newUrl;
            }
        }

        // Sauvegarder le fichier mis à jour
        writeFileSync(bestiaryPath, JSON.stringify(updatedBestiary, null, 4), 'utf-8');
        console.log('✅ Fichier bestiairy.json mis à jour avec succès !');

        // Sauvegarder un rapport de migration
        const reportPath = path.join(process.cwd(), 'public', 'tabs', 'bestiary-migration-report.json');
        writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf-8');
        console.log(`📄 Rapport de migration sauvegardé dans ${reportPath}`);
    }

    console.log('\n🎉 Migration terminée !');
}

// Exécuter le script
main().catch(error => {
    console.error('💥 Erreur fatale :', error);
    process.exit(1);
});

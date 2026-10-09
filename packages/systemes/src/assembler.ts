/**
 * Build : assemble chaque système, le valide entièrement et écrit
 * `dist/<id>.json`. Le build échoue à la moindre erreur de règle.
 * Bestiaires dans un sous-dossier (`dist/systemes/bestiaires/<id>.json`) : les services
 * qui listent `dist/systemes/*.json` n'y voient que des systèmes. Polices déclarées par la
 * présentation copiées dans `dist/systemes/polices/<id>/` (build en échec si l'une manque).
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { charger, checkBestiary, verifierPresentation } from '@vtt/rules';
import { dossierDe, idsSystemes, lireBestiaire, lirePresentation, lireSysteme } from './sources.js';

const sortie = new URL('../dist/systemes/', import.meta.url).pathname;
const sortieBestiaires = `${sortie}bestiaires/`;
mkdirSync(sortieBestiaires, { recursive: true });

let echec = false;
for (const id of idsSystemes()) {
  const brut = lireSysteme(id);
  const r = charger(brut);
  if (!r.ok) {
    echec = true;
    console.error(`✗ ${id} : ${r.erreurs.length} erreur(s)`);
    for (const e of r.erreurs) {
      console.error(
        `  ${e.chemin} : ${e.message}${e.position !== undefined ? ` (position ${e.position})` : ''}`,
      );
    }
    continue;
  }
  writeFileSync(`${sortie}${id}.json`, JSON.stringify(brut));
  const s = r.systeme;
  console.log(
    `✓ ${id} ${s.source.version} : ${s.entrees.size} entrées, ${s.formules.size} formules`,
  );

  const bestiaire = lireBestiaire(id);
  if (bestiaire !== undefined) {
    const b = checkBestiary(bestiaire, s);
    if (!b.ok) {
      echec = true;
      console.error(`✗ ${id} : bestiaire, ${b.erreurs.length} erreur(s)`);
      for (const e of b.erreurs) console.error(`  ${e.chemin} : ${e.message}`);
    } else {
      writeFileSync(`${sortieBestiaires}${id}.json`, JSON.stringify(b.bestiary));
      console.log(`✓ ${id} : bestiaire, ${b.bestiary.creatures.length} créatures`);
    }
  }

  const presentation = lirePresentation(id);
  if (presentation === undefined) continue;
  const p = verifierPresentation(presentation, s);
  if (!p.ok) {
    echec = true;
    console.error(`✗ ${id} : présentation, ${p.erreurs.length} erreur(s)`);
    for (const e of p.erreurs) console.error(`  ${e.chemin} : ${e.message}`);
    continue;
  }
  // Polices apportées par le système : `systemes/<id>/polices/` → `dist/systemes/polices/<id>/`
  const fichiers = p.presentation.theme?.polices.fichiers ?? [];
  // Polices du système, ou de celui dont il hérite
  const sources = fichiers.map((f) => ({ f, dossier: dossierDe(id, `polices/${f.fichier}`) }));
  const manquants = sources.filter((x) => x.dossier === undefined).map((x) => x.f);
  if (manquants.length) {
    echec = true;
    for (const f of manquants)
      console.error(`✗ ${id} : police introuvable, polices/${f.fichier} (${f.famille})`);
    continue;
  }
  if (fichiers.length) {
    mkdirSync(`${sortie}polices/${id}/`, { recursive: true });
    for (const { f, dossier } of sources)
      copyFileSync(`${dossier}/polices/${f.fichier}`, `${sortie}polices/${id}/${f.fichier}`);
  }
  writeFileSync(`${sortie}${id}.presentation.json`, JSON.stringify(p.presentation));
  console.log(`✓ ${id} : présentation${fichiers.length ? `, ${fichiers.length} police(s)` : ''}`);
}
if (echec) process.exit(1);

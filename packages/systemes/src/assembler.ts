/**
 * Build : assemble chaque système, le valide entièrement et écrit
 * `dist/<id>.json`. Le build échoue à la moindre erreur de règle.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { charger, verifierPresentation } from '@vtt/rules';
import { idsSystemes, lirePresentation, lireSysteme } from './sources.js';

const sortie = new URL('../dist/systemes/', import.meta.url).pathname;
mkdirSync(sortie, { recursive: true });

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

  const presentation = lirePresentation(id);
  if (presentation === undefined) continue;
  const p = verifierPresentation(presentation, s);
  if (!p.ok) {
    echec = true;
    console.error(`✗ ${id} : présentation, ${p.erreurs.length} erreur(s)`);
    for (const e of p.erreurs) console.error(`  ${e.chemin} : ${e.message}`);
    continue;
  }
  writeFileSync(`${sortie}${id}.presentation.json`, JSON.stringify(p.presentation));
  console.log(`✓ ${id} : présentation`);
}
if (echec) process.exit(1);

/**
 * Copie les systèmes de référence validés par @vtt/systemes dans public/systemes,
 * avec un index léger (nom, description, étapes de création) : le front liste
 * les systèmes sans télécharger leurs catalogues. Le service campaign servira
 * plus tard les mêmes documents (et ceux créés par les MJ).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = join(dirname(fileURLToPath(import.meta.resolve('@vtt/systemes'))), 'systemes');
const cible = fileURLToPath(new URL('../public/systemes/', import.meta.url));
mkdirSync(cible, { recursive: true });

/** Couverture et couleur d'accent déclarées par la présentation du système. */
function apparence(id) {
  const fichier = join(source, `${id}.presentation.json`);
  if (!existsSync(fichier)) return { couverture: null, accent: null };
  const theme = JSON.parse(readFileSync(fichier, 'utf8')).theme ?? {};
  return {
    couverture: theme.fond?.type === 'image' ? theme.fond.source : null,
    accent: theme.couleurs?.accent ?? null,
  };
}

const index = [];
for (const fichier of readdirSync(source)
  .filter((f) => f.endsWith('.json'))
  .sort()) {
  copyFileSync(join(source, fichier), join(cible, fichier));
  if (fichier.endsWith('.presentation.json')) continue;
  const s = JSON.parse(readFileSync(join(source, fichier), 'utf8'));
  const parSorte = {};
  for (const e of s.catalogue ?? []) parSorte[e.sorte] = (parSorte[e.sorte] ?? 0) + 1;
  index.push({
    id: s.id,
    nom: s.nom,
    version: s.version,
    description: s.description ?? '',
    entrees: (s.catalogue ?? []).length,
    sortes: (s.sortes ?? [])
      .filter((o) => parSorte[o.id])
      .map((o) => ({ id: o.id, nom: o.nomPluriel ?? o.nom, nombre: parSorte[o.id] })),
    creation: (s.creation ?? []).map((c) => ({
      entite: c.entite,
      etapes: c.etapes.map((e) => e.nom),
    })),
    desSymboles: Boolean(s.des),
    ...apparence(s.id),
  });
}
writeFileSync(join(cible, 'index.json'), JSON.stringify(index));
console.log(`✓ ${index.length} système(s) copiés dans public/systemes`);

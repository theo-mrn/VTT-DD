// ─────────────────────────────────────────────────────────────────────────────
// Rétrocompatibilité avec les références legacy aux fichiers de voies : les personnages existants
// stockent un NOM DE FICHIER dans leurs champs VoieN (ex 'Barbare1.json', 'prestige_barde2.json',
// 'Ame-forgee.json'). Ce module convertit ces noms vers l'id du doc PathDoc seedé — aucun personnage
// n'est migré, anciens et nouveaux champs passent par le même résolveur.
// ─────────────────────────────────────────────────────────────────────────────

/** 'Barbare1.json' → 'barbare1', 'Ame-forgee.json' → 'ame-forgee', 'prestige_barde2.json' →
 *  'prestige_barde2', 'Précepteur.json' → 'precepteur'. Le seed (scripts/seed-game-content.mjs)
 *  utilise EXACTEMENT la même normalisation pour générer les ids — les deux doivent rester alignés. */
export function resolvePathDocId(legacyFileOrId: string): string {
  return legacyFileOrId
    .trim() // AVANT de retirer l'extension : ' Barbare1.json ' doit matcher /\.json$/
    .replace(/\.json$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (diacritiques combinants)
    .toLowerCase();
}

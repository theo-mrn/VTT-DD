import { redirect } from 'next/navigation';

/** Anciens onglets de la table, devenus des panneaux ouverts par-dessus la carte. */
const PANNEAUX = new Set(['fiche', 'des', 'notes', 'joueurs', 'historique', 'mj']);

/**
 * Anciennes adresses par onglet (`table/des`, `table/joueurs/<id>`, `table/notes?note=…`) :
 * redirigées vers la table, panneau ouvert (`?panneau=des`), pour ne casser aucun lien.
 */
export default async function RedirectionAncienOnglet({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; legacyPath: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, legacyPath }, recherche] = await Promise.all([params, searchParams]);
  const [onglet, personnage] = legacyPath;
  const query = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(recherche))
    for (const v of Array.isArray(valeur) ? valeur : valeur ? [valeur] : []) query.append(cle, v);
  if (onglet && PANNEAUX.has(onglet)) {
    query.set('panneau', onglet);
    if (onglet === 'joueurs' && personnage) query.set('personnage', personnage);
  }
  const suite = query.toString();
  redirect(`/campagnes/${encodeURIComponent(id)}/table${suite ? `?${suite}` : ''}`);
}

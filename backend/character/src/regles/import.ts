/**
 * Personnage importé d'une fiche (docs/import-fiche.md § 5) : état construit à partir de ce que
 * le joueur a vérifié, création terminée. Les valeurs de la fiche sont reprises telles quelles ;
 * ce qui sort des règles de création n'empêche rien et devient un écart, montré au MJ. Aucune
 * règle de jeu ici : tout vient du système (attributs saisissables, achats de rangs, étapes).
 */
import { SheetSource } from '@vtt/contracts';
import {
  calculer,
  deduireBases,
  Entree,
  erreursEntreesLibres,
  etapesCreation,
  examinerAchat,
  MAX_ENTREES_LIBRES,
  nouvellePossession,
  nouvelExemplaire,
  systemePour,
  type EtatEntite,
  type SystemeCharge,
} from '@vtt/rules';
import { z } from 'zod';
import { etatInitial, refus, Valeurs } from './operations.js';

const Id = z.string().min(1).max(200);

export const DemandeImport = z.object({
  systemeId: Id,
  type: Id,
  nom: z.string().trim().min(1, 'Nom requis').max(100, '100 caractères au plus'),
  details: z
    .object({
      concept: z.string().trim().max(160).optional(),
      appearance: z.string().trim().max(2000).optional(),
      backstory: z.string().trim().max(8000).optional(),
    })
    .optional(),
  /** Attributs saisissables (base, ressource, texte, choix, booléen). */
  valeurs: Valeurs.default({}),
  possessions: z
    .array(
      z.object({
        entree: Id,
        rang: z.number().int().min(0).max(100).optional(),
        quantite: z.number().int().positive().max(1_000_000).optional(),
        champs: z
          .record(Id, z.union([z.number().finite(), z.string().max(10_000), z.boolean()]))
          .optional(),
      }),
    )
    .max(500)
    .default([]),
  /** Entrées libres (voies absentes du catalogue, docs/entrees-libres.md). */
  entrees: z.array(Entree).max(MAX_ENTREES_LIBRES).default([]),
  /** Valeurs calculées lues sur la fiche (PV max, Défense…), comparées au calcul : écarts. */
  lues: z.record(z.string().min(1).max(100), z.number().finite()).default({}),
  source: SheetSource,
});
export type DemandeImport = z.output<typeof DemandeImport>;

/** Import d'un personnage : quand, d'où, et ses écarts aux règles (montrés au MJ). */
export interface SheetImportInfo {
  at: string;
  source: SheetSource;
  ecarts: string[];
}

const nombre = (v: unknown) => (typeof v === 'number' ? v : Number(v));

/**
 * État du personnage importé, création terminée, et ses écarts aux règles. Refus (422) pour
 * ce qui ne se calcule pas : attribut ou entrée inconnus, valeur calculée saisie, entrée libre
 * invalide.
 */
export function etatImporte(
  systeme: SystemeCharge,
  d: DemandeImport,
): { etat: EtatEntite; ecarts: string[] } {
  let etat: EtatEntite = { ...etatInitial(systeme, d.type), entrees: d.entrees, creation: false };
  const libres = erreursEntreesLibres(systeme, etat);
  if (libres.length)
    throw refus(
      `Entrée libre invalide : ${libres.map((e) => `${e.chemin} : ${e.message}`).join(' ; ')}`,
      'entree_libre_invalide',
    );
  const vu = systemePour(systeme, etat);
  const entite = vu.entites.get(d.type)!;
  const ecarts: string[] = [];

  // Valeurs saisissables d'abord : elles fixent les soldes (niveau → points)
  const valeurs: EtatEntite['valeurs'] = {};
  for (const [cle, v] of Object.entries(d.valeurs)) {
    const a = entite.attributs.get(cle);
    if (!a) throw refus(`Attribut inconnu : ${cle}`);
    if (a.nature === 'derivee') throw refus(`${a.nom} est calculé, il ne se saisit pas`);
    valeurs[cle] = v;
  }
  etat = { ...etat, valeurs };

  // Possessions sans rangs, puis rangs rejoués par les achats du système
  const possessions = [...etat.possessions];
  const rangs: { entree: string; rang: number }[] = [];
  for (const p of d.possessions) {
    const entree = vu.entrees.get(p.entree);
    const sorte = entree && vu.sortes.get(entree.sorte);
    if (!entree || !sorte) throw refus(`Entrée inconnue du système : ${p.entree}`);
    if (sorte.rangs && (p.rang ?? 0) > 0) {
      rangs.push({ entree: p.entree, rang: p.rang! });
      continue;
    }
    const deja = possessions.some((x) => x.entree === p.entree);
    if (deja && !sorte.exemplaires) continue;
    possessions.push(
      nouvellePossession(p.entree, sorte.rangs ? 0 : (p.rang ?? 0), {
        ...(deja ? { exemplaire: nouvelExemplaire(possessions, p.entree) } : {}),
        ...(p.quantite !== undefined && sorte.quantites ? { quantite: p.quantite } : {}),
        ...(p.champs ? { champs: p.champs } : {}),
      }),
    );
  }
  etat = { ...etat, possessions };

  for (const { entree, rang } of rangs) {
    const achats = [...vu.achats.values()].filter(
      (a) => a.obtient.type === 'rang' && a.obtient.sorte === vu.entrees.get(entree)!.sorte,
    );
    etat = { ...etat, possessions: [...etat.possessions, nouvellePossession(entree, 0)] };
    for (let r = 1; r <= rang; r++) {
      const fiche = calculer(vu, etat);
      const essais = achats.map((a) => ({ a, ex: examinerAchat(fiche, a.id, entree) }));
      const bon = essais.find((x) => x.ex.ok && x.ex.objet.possible);
      if (bon?.ex.ok) {
        etat = {
          ...etat,
          journal: [
            ...etat.journal,
            {
              achat: bon.a.id,
              objet: entree,
              cout: bon.ex.objet.cout,
              monnaie: bon.ex.objet.monnaie,
              creation: false,
            },
          ],
        };
      } else {
        const raison = essais
          .map((x) =>
            x.ex.ok ? x.ex.objet.blocages.map((b) => b.message).join(', ') : x.ex.erreur,
          )
          .filter(Boolean)
          .join(' ; ');
        ecarts.push(
          `${vu.entrees.get(entree)!.nom}, rang ${r} : ${raison || 'aucun achat ne le donne'}`,
        );
      }
      etat = {
        ...etat,
        possessions: etat.possessions.map((p) =>
          p.entree === entree && p.exemplaire === undefined ? { ...p, rang: r } : p,
        ),
      };
    }
  }

  // Bases que la fiche ne donne pas, retrouvées par ses valeurs calculées (PV max → dé de vie)
  etat = deduireBases(vu, etat, d.lues, new Set(Object.keys(d.valeurs)));

  // Règles de création : chaque étape invalide dit pourquoi
  for (const s of etapesCreation(vu, { ...etat, creation: true }))
    if (s.statut === 'invalide') ecarts.push(`${s.etape.nom} : ${s.raisons.join(', ')}`);

  // Valeurs calculées lues sur la fiche, comparées au calcul
  const fiche = calculer(vu, etat);
  for (const [cle, lu] of Object.entries(d.lues)) {
    const a = entite.attributs.get(cle);
    if (!a || !fiche.attributActif(cle)) continue;
    const calcule = nombre(fiche.valeur(cle));
    if (calcule !== lu) ecarts.push(`${a.nom} : ${lu} sur la fiche, ${calcule} calculé`);
  }
  return { etat, ecarts };
}

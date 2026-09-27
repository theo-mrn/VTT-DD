/**
 * Présentation d'un système : tout ce que le front affiche et qui n'est pas
 * une règle (skins et couleurs des dés, icônes des symboles, thème, dispositions
 * de fiche, images). Document séparé des règles, validé contre le système
 * chargé par `verifierPresentation()` : aucune clé de jeu n'est codée dans le
 * front, il lit tout ici.
 */
import { z } from 'zod';
import type { SystemeCharge } from '../chargement/index.js';
import { Cle, Id } from './systeme.js';

const Couleur = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'Couleur hexadécimale attendue (#rrggbb)');
const Libelle = z.string().min(1).max(200);
const Url = z.string().min(1).max(2000);

/** Apparence d'une sorte de dé à symboles (ou d'un dé numérique `d20`…). */
export const ApparenceDe = z.object({
  /** Skin 3D (identifiant du catalogue de skins du front). */
  skin: z.string().optional(),
  couleur: Couleur,
  /** Forme physique du dé lancé en 3D. */
  forme: z.enum(['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']),
  court: z.string().max(20).optional(),
  /** Nom d'origine (VO), affiché en complément. */
  original: z.string().max(60).optional(),
});

/** Icône et couleur d'un symbole ou d'un résultat de jet. */
export const ApparenceSymbole = z.object({
  /** Nom d'icône (jeu d'icônes du front, ex. lucide) ou glyphe. */
  icone: z.string().min(1).max(60),
  couleur: Couleur,
  court: z.string().max(20).optional(),
});

const CiblesAttributs = { groupe: Id.optional(), attributs: z.array(Cle).optional() };

/** Bloc de la fiche. Le front sait afficher chaque type sans connaître le jeu. */
export const Widget = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('attributs'),
    titre: Libelle,
    ...CiblesAttributs,
    colonnes: z.number().int().min(1).max(6).optional(),
  }),
  /**
   * Ressources : `jauge` (défaut) une jauge par ressource ; `valeur` la valeur en chiffres
   * (« PV / PV max » pour une ressource), et les autres attributs (Défense) en valeur simple.
   */
  z.object({
    type: z.literal('ressources'),
    titre: Libelle,
    attributs: z.array(Cle).min(1),
    affichage: z.enum(['jauge', 'valeur']).optional(),
  }),
  /** Entrées possédées d'une sorte (compétences, talents, équipement…), avec achat si un achat les vise. */
  z.object({
    type: z.literal('possessions'),
    titre: Libelle,
    sorte: Cle,
    groupeChamp: Cle.optional(),
  }),
  z.object({ type: z.literal('arbres'), titre: Libelle }),
  z.object({ type: z.literal('monnaies'), titre: Libelle }),
  /** Résumé : entrées uniques (espèce, carrière) et attributs texte. */
  z.object({
    type: z.literal('details'),
    titre: Libelle,
    sortes: z.array(Cle).default([]),
    attributs: z.array(Cle).default([]),
  }),
  z.object({ type: z.literal('actions'), titre: Libelle, actions: z.array(Id).optional() }),
  z.object({ type: z.literal('texte'), titre: Libelle, attribut: Cle }),
  /**
   * Bonus actifs de toute provenance (bonus libres, effets propres aux
   * exemplaires) : liste, activation, ajout d'un bonus libre ciblant un
   * attribut, une entrée à rangs ou les jets qui impliquent une entrée ou un attribut.
   */
  z.object({ type: z.literal('bonus'), titre: Libelle }),
  /**
   * Inventaire : possessions de une ou plusieurs sortes (objets, armes, armures…), avec
   * quantités, exemplaires, état équipé ou actif, bonus des effets. Les catégories sont
   * les sortes elles-mêmes, ou les valeurs d'un champ (`groupeChamp`). Plusieurs champs
   * possibles quand les sortes n'ont pas le même (`[attaque, categorie]`) : pour chaque
   * objet, le premier que déclare sa sorte ; une sorte qui n'en a aucun regroupe ses
   * objets sous son nom.
   */
  z.object({
    type: z.literal('inventaire'),
    titre: Libelle,
    sortes: z.array(Cle).min(1),
    groupeChamp: z.union([Cle, z.array(Cle).min(1)]).optional(),
  }),
  /**
   * Compétences en cartes : entrées d'une sorte (capacités, talents, compétences) en grille,
   * actives mises en avant, bonus en étiquettes, recherche, filtres par la valeur d'un champ
   * de la sorte (`filtreChamp`), détail et activation.
   */
  z.object({
    type: z.literal('competences'),
    titre: Libelle,
    sorte: Cle,
    filtreChamp: Cle.optional(),
  }),
]);
export type Widget = z.output<typeof Widget>;

/** Champs de regroupement d'un widget inventaire, dans l'ordre de préférence. */
export function champsGroupe(w: Extract<Widget, { type: 'inventaire' }>): string[] {
  return w.groupeChamp === undefined
    ? []
    : typeof w.groupeChamp === 'string'
      ? [w.groupeChamp]
      : w.groupeChamp;
}

export const Presentation = z.object({
  format: z.literal(1),
  systeme: Id,
  theme: z
    .object({
      /** Variables de couleur du thème (`fond`, `carte`, `bordure`, `accent`…). */
      couleurs: z.record(z.string(), Couleur).default({}),
      polices: z
        .object({
          corps: z.string().optional(),
          titres: z.string().optional(),
          decorative: z.string().optional(),
        })
        .default({}),
      fond: z
        .discriminatedUnion('type', [
          z.object({ type: z.literal('image'), source: Url }),
          z.object({
            type: z.literal('modele3d'),
            source: Url,
            echelle: z.number().positive().default(1),
            rotation: z.number().default(0),
          }),
        ])
        .optional(),
    })
    .optional(),
  des: z
    .object({
      sortes: z.record(z.string(), ApparenceDe).default({}),
      /** Glyphes d'aperçu de pool : dé de base et dé amélioré. */
      glyphes: z.object({ base: z.string().max(4), ameliore: z.string().max(4) }).optional(),
    })
    .optional(),
  /** Libellé et icône des marques posées par les règles (`carriere` → « Carrière »). */
  marques: z
    .record(
      z.string(),
      z.object({ nom: Libelle, icone: z.string().max(60).optional(), couleur: Couleur.optional() }),
    )
    .default({}),
  /** Par clé de symbole ou de résultat (`succes`, `succesNets`, `triomphes`…). */
  symboles: z.record(z.string(), ApparenceSymbole).default({}),
  /** Sens d'affichage des ressources : `descendant` = pleine au départ (PV), `montant` = se remplit (Blessures). */
  ressources: z
    .record(
      z.string(),
      z.object({ sens: z.enum(['descendant', 'montant']), couleur: Couleur.optional() }),
    )
    .default({}),
  fiches: z.record(z.string(), z.object({ widgets: z.array(Widget).min(1) })).default({}),
  arbres: z
    .object({
      colonne: z.number().positive(),
      ligne: z.number().positive(),
      noeud: z.object({ largeur: z.number().positive(), hauteur: z.number().positive() }),
    })
    .optional(),
  /** Images par identifiant d'entrée ou de type d'entité. */
  images: z.record(z.string(), Url).default({}),
  /** Bibliothèques de contenus suggérés (objets de carte, sons). */
  bibliotheques: z
    .object({ objets: z.string().optional(), sons: z.string().optional() })
    .default({}),
});
export type Presentation = z.output<typeof Presentation>;

export interface ErreurPresentation {
  chemin: string;
  message: string;
}

/** Vérifie la forme puis chaque référence au système (dés, symboles, attributs, sortes, entrées). */
export function verifierPresentation(
  saisie: unknown,
  systeme: SystemeCharge,
): { ok: true; presentation: Presentation } | { ok: false; erreurs: ErreurPresentation[] } {
  const forme = Presentation.safeParse(saisie);
  if (!forme.success) {
    return {
      ok: false,
      erreurs: forme.error.issues.map((i) => ({
        chemin: i.path.map(String).join('/'),
        message: i.message,
      })),
    };
  }
  const p = forme.data;
  const erreurs: ErreurPresentation[] = [];
  const erreur = (chemin: string, message: string) => erreurs.push({ chemin, message });
  const s = systeme.source;

  if (p.systeme !== s.id) erreur('systeme', `Présentation de ${p.systeme}, système ${s.id}`);

  const sortesDes = new Set(s.des?.sortes.map((d) => d.id) ?? []);
  for (const id of Object.keys(p.des?.sortes ?? {})) {
    if (!sortesDes.has(id) && !/^d\d+$/.test(id)) erreur(`des/sortes/${id}`, `Dé inconnu : ${id}`);
  }
  const symboles = new Set([
    ...(s.des?.symboles.map((x) => x.id) ?? []),
    ...(s.des?.resultats.map((x) => x.cle) ?? []),
  ]);
  for (const id of Object.keys(p.symboles))
    if (!symboles.has(id)) erreur(`symboles/${id}`, `Symbole ou résultat inconnu : ${id}`);

  const attributDe = (entite: string, cle: string) =>
    systeme.entites.get(entite)?.attributs.get(cle);
  for (const m of Object.keys(p.marques)) {
    if (!systeme.marques.has(m))
      erreur(`marques/${m}`, `Marque jamais posée par les règles : ${m}`);
  }
  for (const cle of Object.keys(p.ressources)) {
    const ok = [...systeme.entites.keys()].some((e) => attributDe(e, cle)?.nature === 'ressource');
    if (!ok) erreur(`ressources/${cle}`, `Ressource inconnue : ${cle}`);
  }

  for (const [entite, fiche] of Object.entries(p.fiches)) {
    if (!systeme.entites.has(entite)) {
      erreur(`fiches/${entite}`, `Type d’entité inconnu : ${entite}`);
      continue;
    }
    fiche.widgets.forEach((w, i) => {
      for (const m of erreursWidget(systeme, entite, w)) erreur(`fiches/${entite}/${i}`, m);
    });
  }

  for (const id of Object.keys(p.images)) {
    if (!systeme.entrees.has(id) && !systeme.entites.has(id))
      erreur(`images/${id}`, `Entrée ou type d’entité inconnu : ${id}`);
  }

  return erreurs.length ? { ok: false, erreurs } : { ok: true, presentation: p };
}

/**
 * Références d'un bloc de fiche vérifiées contre le système : attributs, groupes, sortes,
 * champs et actions. Sert au build (présentation) et au front, pour écarter un bloc
 * enregistré que le système ne sait plus afficher (attribut retiré…).
 */
export function erreursWidget(systeme: SystemeCharge, entite: string, w: Widget): string[] {
  const e = systeme.entites.get(entite);
  if (!e) return [`Type d’entité inconnu : ${entite}`];
  const erreurs: string[] = [];
  const attrs = 'attributs' in w ? (w.attributs ?? []) : 'attribut' in w ? [w.attribut] : [];
  for (const a of attrs)
    if (!e.attributs.has(a)) erreurs.push(`Attribut inconnu de ${entite} : ${a}`);
  if ('groupe' in w && w.groupe && !e.type.groupes.some((g) => g.id === w.groupe))
    erreurs.push(`Groupe inconnu : ${w.groupe}`);
  if (w.type === 'attributs' && !w.groupe && !w.attributs?.length)
    erreurs.push('Préciser le groupe ou les attributs');
  if (w.type === 'ressources') {
    for (const a of w.attributs) {
      const nature = e.attributs.get(a)?.nature;
      if (!nature) continue;
      // En jauge, des ressources seulement ; en valeur, tout attribut sauf un texte
      if ((w.affichage ?? 'jauge') === 'jauge' && nature !== 'ressource')
        erreurs.push(`${a} n’est pas une ressource (affichage « valeur » pour une valeur simple)`);
      else if (nature === 'texte') erreurs.push(`${a} est un texte : bloc « texte » attendu`);
    }
  }
  const sortes =
    w.type === 'possessions' || w.type === 'competences'
      ? [w.sorte]
      : w.type === 'details' || w.type === 'inventaire'
        ? w.sortes
        : [];
  for (const so of sortes) {
    const sorte = systeme.sortes.get(so);
    if (!sorte) erreurs.push(`Sorte inconnue : ${so}`);
    else if (!sorte.pour.includes(entite)) erreurs.push(`${so} n’est pas possédable par ${entite}`);
  }
  const champDe = (sorte: string, champ: string) =>
    systeme.sortes.get(sorte)?.champs.some((c) => c.id === champ) === true;
  if (w.type === 'possessions' && w.groupeChamp && !champDe(w.sorte, w.groupeChamp))
    erreurs.push(`Champ inconnu sur ${w.sorte} : ${w.groupeChamp}`);
  if (w.type === 'inventaire')
    for (const c of champsGroupe(w))
      if (!w.sortes.some((so) => champDe(so, c)))
        erreurs.push(`Champ inconnu des sortes ${w.sortes.join(', ')} : ${c}`);
  if (w.type === 'competences' && w.filtreChamp && !champDe(w.sorte, w.filtreChamp))
    erreurs.push(`Champ inconnu sur ${w.sorte} : ${w.filtreChamp}`);
  if (w.type === 'actions')
    for (const a of w.actions ?? [])
      if (!systeme.actions.has(a)) erreurs.push(`Action inconnue : ${a}`);
  return erreurs;
}

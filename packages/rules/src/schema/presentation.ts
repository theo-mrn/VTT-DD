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

/** Groupe d'attributs du lanceur de dés, dans l'ordre d'affichage. */
export const GroupeJets = z.object({
  titre: Libelle,
  /** Type d'entité concerné ; absent : tous ceux qui ont ces attributs. */
  entite: Id.optional(),
  attributs: z.array(Cle).min(1),
});
export type GroupeJets = z.output<typeof GroupeJets>;

const CiblesAttributs = { groupe: Id.optional(), attributs: z.array(Cle).optional() };

/** Bloc de la fiche. Le front sait afficher chaque type sans connaître le jeu. */
/**
 * Commun à tous les blocs : titre, et règle optionnelle dont le bloc dépend (absent de la
 * fiche quand la campagne l'éteint).
 */
const WidgetCommun = { titre: Libelle, option: Cle.optional() };

export const Widget = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('attributs'),
    ...WidgetCommun,
    ...CiblesAttributs,
    /**
     * Colonnes au plus quand la disposition est automatique (préférence) : le bloc s'adapte
     * à sa largeur, et le joueur peut fixer les siennes en personnalisant sa fiche.
     */
    colonnes: z.number().int().min(1).max(6).optional(),
  }),
  /**
   * Ressources : `jauge` (défaut) une jauge par ressource ; `valeur` la valeur en chiffres
   * (« PV / PV max » pour une ressource), et les autres attributs (Défense) en valeur simple.
   */
  z.object({
    type: z.literal('ressources'),
    ...WidgetCommun,
    attributs: z.array(Cle).min(1),
    affichage: z.enum(['jauge', 'valeur']).optional(),
  }),
  /** Entrées possédées d'une sorte (compétences, talents, équipement…), avec achat si un achat les vise. */
  z.object({
    type: z.literal('possessions'),
    ...WidgetCommun,
    sorte: Cle,
    groupeChamp: Cle.optional(),
  }),
  z.object({ type: z.literal('monnaies'), ...WidgetCommun }),
  /** Résumé : entrées uniques (espèce, carrière) et attributs texte. */
  z.object({
    type: z.literal('details'),
    ...WidgetCommun,
    sortes: z.array(Cle).default([]),
    attributs: z.array(Cle).default([]),
  }),
  z.object({ type: z.literal('actions'), ...WidgetCommun, actions: z.array(Id).optional() }),
  z.object({ type: z.literal('texte'), ...WidgetCommun, attribut: Cle }),
  /**
   * Bonus actifs de toute provenance (bonus libres, effets propres aux
   * exemplaires) : liste, activation, ajout d'un bonus libre ciblant un
   * attribut, une entrée à rangs ou les jets qui impliquent une entrée ou un attribut.
   */
  z.object({ type: z.literal('bonus'), ...WidgetCommun }),
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
    ...WidgetCommun,
    sortes: z.array(Cle).min(1),
    groupeChamp: z.union([Cle, z.array(Cle).min(1)]).optional(),
  }),
  /**
   * Compétences : un seul bloc pour toute la progression du personnage, en plusieurs vues.
   * - `progression` : voies (sortes à rangs qui accordent d'autres entrées rang par rang) en
   *   tableau, ou arbres en grille (`arbres` du système), selon la forme des données ;
   * - `capacites` : entrées acquises des `sortes` (activation, recherche, filtres par la
   *   valeur de `filtreChamp`, ou par sorte) ;
   * - `rangs` : sortes dont les rangs s'achètent directement (catalogue complet, achat).
   * `sortes` absent : celles que la progression accorde ou dont les rangs s'achètent.
   * `vue` : vue ouverte par défaut. Remplace les anciens blocs `arbres` et `competences` à
   * une `sorte` (le front convertit les mises en page enregistrées).
   */
  z.object({
    type: z.literal('competences'),
    ...WidgetCommun,
    sortes: z.array(Cle).min(1).optional(),
    filtreChamp: Cle.optional(),
    vue: z.enum(['progression', 'capacites', 'rangs']).optional(),
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

/** Sortes déclarées par un bloc Compétences ; vide : déduites par le front. */
export function sortesCompetences(w: Extract<Widget, { type: 'competences' }>): string[] {
  return [...new Set(w.sortes ?? [])];
}

/**
 * Icônes génériques des objets de l'inventaire : le front les dessine, le système choisit
 * lesquelles pour ses sortes et ses catégories (`iconesObjets`).
 */
export const IconeObjet = z.enum([
  'epee',
  'hache',
  'marteau',
  'cible',
  'bombe',
  'bouclier',
  'vetement',
  'fiole',
  'pilule',
  'seringue',
  'pieces',
  'gemme',
  'couronne',
  'sac',
  'paquet',
  'livre',
  'parchemin',
  'carte',
  'boussole',
  'nourriture',
  'boisson',
  'outil',
  'cle',
  'flamme',
  'baguette',
  'electronique',
  'plume',
  'os',
  'objet',
  'coeur',
]);
export type IconeObjet = z.output<typeof IconeObjet>;

/**
 * Icône des objets d'une sorte, ou de ceux dont un champ vaut `valeur` (catégorie
 * « potions », attaque « Distance », arme de mêlée). La première règle qui convient
 * l'emporte : les plus précises d'abord.
 */
export const RegleIconeObjet = z
  .object({
    sorte: Cle.optional(),
    champ: Cle.optional(),
    valeur: z.union([z.string(), z.number(), z.boolean()]).optional(),
    icone: IconeObjet,
  })
  .refine((r) => r.sorte !== undefined || r.champ !== undefined, 'Préciser la sorte ou le champ')
  .refine(
    (r) => (r.champ === undefined) === (r.valeur === undefined),
    'Champ et valeur vont ensemble',
  );
export type RegleIconeObjet = z.output<typeof RegleIconeObjet>;

/**
 * Icônes génériques des états (badges sur les tokens, fiche du participant) : le front les
 * dessine, le système choisit lesquelles pour ses états (`combat.etats.icones`).
 */
export const IconeEtat = z.enum([
  'etat',
  'aveugle',
  'assourdi',
  'charme',
  'peur',
  'paralyse',
  'etourdi',
  'inconscient',
  'poison',
  'saignement',
  'affaibli',
  'desoriente',
  'a-terre',
  'entrave',
  'danse',
  'protection',
  'couvert',
  'blessure',
  'feu',
  'froid',
  'rage',
  'invisible',
  'benediction',
  'malediction',
  'alerte',
]);
export type IconeEtat = z.output<typeof IconeEtat>;

/**
 * Combat (docs/combat.md § 12) : groupes d'actions du menu d'attaque (actions à cible, dans
 * l'ordre ; les autres suivent sous « Autres ») et états du catalogue proposés sur la fiche du
 * participant, avec leurs icônes.
 */
export const PresentationCombat = z.object({
  groupes: z.array(z.object({ titre: Libelle, actions: z.array(Id).min(1) })).default([]),
  etats: z
    .object({
      /** Sortes du catalogue qui sont des états (données avec une durée). */
      sortes: z.array(Cle).min(1),
      /** Icône de chaque état, par identifiant d'entrée ; absente : l'icône générique `etat`. */
      icones: z.record(z.string(), IconeEtat).default({}),
    })
    .optional(),
});
export type PresentationCombat = z.output<typeof PresentationCombat>;

/**
 * Ressources consultables (panneau « Ressources » de la table, page Ressources) : chaque
 * onglet n'existe que si le système le déclare ici. Voir docs/ressources.md.
 */

/** Section de l'onglet Capacités : les entrées d'une sorte, filtrées par étiquette. */
export const SectionCapacites = z.object({
  titre: Libelle,
  sorte: Cle,
  etiquette: Id.optional(),
  /**
   * Regroupement : par la valeur d'un champ de la sorte (carrière d'origine), ou par
   * l'étiquette de l'entrée autre que `etiquette` (voie de prestige « voleur »).
   */
  groupePar: z.union([z.literal('etiquette'), z.object({ champ: Cle })]).optional(),
});
export type SectionCapacites = z.output<typeof SectionCapacites>;

/** Sorte proposée au marché : colonnes de la table et champ de catégorie (filtre). */
export const SorteMarche = z.object({
  sorte: Cle,
  colonnes: z.array(Cle).default([]),
  groupeChamp: Cle.optional(),
});
export type SorteMarche = z.output<typeof SorteMarche>;

/** Groupe de statistiques d'une créature du bestiaire ou d'un modèle de PNJ. */
export const GroupeStatistiques = z.object({ titre: Libelle, attributs: z.array(Cle).min(1) });
export type GroupeStatistiques = z.output<typeof GroupeStatistiques>;

/** Collection d'images : dossiers de la bibliothèque d'actifs (`Map`, `Photos`…). */
export const CollectionImages = z.object({
  titre: Libelle,
  dossiers: z.array(z.string().min(1).max(200)).min(1),
});
export type CollectionImages = z.output<typeof CollectionImages>;

export const References = z.object({
  capacites: z
    .object({ titre: Libelle.optional(), sections: z.array(SectionCapacites).min(1) })
    .optional(),
  marche: z
    .object({
      titre: Libelle.optional(),
      /** Champ du prix, sur tout ou partie des sortes ; son nom donne l'unité. */
      prix: Cle.optional(),
      sortes: z.array(SorteMarche).min(1),
      /** Textes du système affichés sous le catalogue (tarifs des services…). */
      textes: z.array(Id).default([]),
    })
    .optional(),
  bestiaire: z
    .object({
      titre: Libelle.optional(),
      /** Par type d'entité ; sans déclaration, les blocs d'attributs de sa fiche. */
      statistiques: z.record(z.string(), z.array(GroupeStatistiques)).default({}),
    })
    .optional(),
  images: z
    .object({ titre: Libelle.optional(), collections: z.array(CollectionImages).min(1) })
    .optional(),
  /**
   * Bibliothèque d'objets à poser sur la carte (docs/carte.md § 10, Objets) : des catégories,
   * chacune faite de dossiers de la bibliothèque d'actifs (`objets/fourniture`, `items/chest`…).
   */
  objets: z
    .object({ titre: Libelle.optional(), categories: z.array(CollectionImages).min(1) })
    .optional(),
});
export type References = z.output<typeof References>;

/** Un fichier de police apporté par le système (`polices/<fichier>` à côté de ses règles). */
export const FichierPolice = z.object({
  /** Nom de famille CSS (« Orbitron »), repris par `corps`, `titres` ou `decorative`. */
  famille: z.string().min(1).max(100),
  /** Nom du fichier dans le dossier `polices/` du système. */
  fichier: z
    .string()
    .regex(/^[\w.-]+\.(woff2|woff|ttf|otf)$/i, 'Fichier .woff2, .woff, .ttf ou .otf'),
  /** Graisse CSS (`400`, `400 900` pour une police variable). */
  graisse: z.string().max(20).optional(),
  style: z.enum(['normal', 'italic']).optional(),
});
export type FichierPolice = z.output<typeof FichierPolice>;

export const Presentation = z.object({
  format: z.literal(1),
  systeme: Id,
  theme: z
    .object({
      /** Variables de couleur du thème (`fond`, `carte`, `bordure`, `accent`…). */
      couleurs: z.record(z.string(), Couleur).default({}),
      /**
       * Typographie du système : familles du texte courant, des titres et décorative, et les
       * fichiers de polices qu'il apporte (dossier `polices/` du système, chargés à la table
       * et proposés pour les textes de la carte).
       */
      polices: z
        .object({
          corps: z.string().optional(),
          titres: z.string().optional(),
          decorative: z.string().optional(),
          fichiers: z.array(FichierPolice).default([]),
        })
        .default({ fichiers: [] }),
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
      /**
       * Ordre et regroupement des attributs proposés dans le lanceur de dés (ceux qui
       * déclarent `jet`). Un groupe sans `entite` vaut pour tous les types d'entité. Un
       * attribut jetable absent de ces groupes est ajouté ensuite, groupé par son `groupe`.
       * Sans déclaration : ordre du système, groupé par `groupe`.
       */
      jets: z.array(GroupeJets).optional(),
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
  /** Apparence d'un attribut dans les tuiles de la fiche : icône (cœur des PV…) et couleur. */
  attributs: z
    .record(z.string(), z.object({ icone: IconeObjet.optional(), couleur: Couleur.optional() }))
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
  /** Icônes des objets de l'inventaire, par sorte ou par valeur d'un champ. */
  iconesObjets: z.array(RegleIconeObjet).default([]),
  /** Bibliothèques de contenus suggérés (objets de carte, sons). */
  bibliotheques: z
    .object({ objets: z.string().optional(), sons: z.string().optional() })
    .default({}),
  /** Ressources consultables : capacités, marché, bestiaire, images (docs/ressources.md). */
  references: References.default({}),
  /** Menu d'attaque et états du combat. */
  combat: PresentationCombat.optional(),
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
  for (const cle of Object.keys(p.attributs)) {
    const ok = [...systeme.entites.keys()].some((e) => attributDe(e, cle));
    if (!ok) erreur(`attributs/${cle}`, `Attribut inconnu : ${cle}`);
  }

  const placesJets = new Set<string>();
  p.des?.jets?.forEach((g, i) => {
    for (const m of erreursGroupeJets(systeme, g)) erreur(`des/jets/${i}`, m);
    for (const cle of new Set(g.attributs)) {
      const place = `${g.entite ?? '*'}/${cle}`;
      if (placesJets.has(place)) erreur(`des/jets/${i}`, `${cle} est déjà dans un autre groupe`);
      placesJets.add(place);
    }
  });

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

  p.iconesObjets.forEach((r, i) => {
    for (const m of erreursRegleIcone(systeme, r)) erreur(`iconesObjets/${i}`, m);
  });

  for (const e of erreursReferences(systeme, p.references)) erreur(e.chemin, e.message);
  if (p.combat) for (const e of erreursCombat(systeme, p.combat)) erreur(e.chemin, e.message);

  return erreurs.length ? { ok: false, erreurs } : { ok: true, presentation: p };
}

/**
 * Combat vérifié contre le système : actions connues, à cible, une seule fois dans les
 * groupes ; sortes d'états connues ; icônes d'entrées de ces sortes.
 */
export function erreursCombat(systeme: SystemeCharge, c: PresentationCombat): ErreurPresentation[] {
  const erreurs: ErreurPresentation[] = [];
  const erreur = (chemin: string, message: string) =>
    erreurs.push({ chemin: `combat/${chemin}`, message });
  const vues = new Set<string>();
  c.groupes.forEach((g, i) => {
    for (const id of g.actions) {
      const a = systeme.actions.get(id);
      if (!a) erreur(`groupes/${i}`, `Action inconnue : ${id}`);
      else if (!a.cible)
        erreur(`groupes/${i}`, `${id} n’a pas de cible : pas dans le menu d’attaque`);
      if (vues.has(id)) erreur(`groupes/${i}`, `${id} est déjà dans un autre groupe`);
      vues.add(id);
    }
  });
  if (c.etats) {
    for (const so of c.etats.sortes)
      if (!systeme.sortes.has(so)) erreur('etats/sortes', `Sorte inconnue : ${so}`);
    for (const id of Object.keys(c.etats.icones)) {
      const e = systeme.entrees.get(id);
      if (!e) erreur('etats/icones', `Entrée inconnue : ${id}`);
      else if (!c.etats.sortes.includes(e.sorte))
        erreur('etats/icones', `${id} n’est pas un état (sorte ${e.sorte})`);
    }
  }
  return erreurs;
}

/** Règle d'icône vérifiée : sorte connue, champ déclaré par la sorte (ou une sorte), valeur possible. */
export function erreursRegleIcone(systeme: SystemeCharge, r: RegleIconeObjet): string[] {
  const erreurs: string[] = [];
  if (r.sorte !== undefined && !systeme.sortes.has(r.sorte))
    erreurs.push(`Sorte inconnue : ${r.sorte}`);
  if (r.champ === undefined) return erreurs;
  const sortes =
    r.sorte !== undefined ? [systeme.sortes.get(r.sorte)] : [...systeme.sortes.values()];
  const champs = sortes.flatMap((so) => so?.champs.filter((c) => c.id === r.champ) ?? []);
  if (!champs.length) return [...erreurs, `Champ inconnu : ${r.champ}`];
  const possible = champs.some((c) => {
    switch (c.type) {
      case 'choix':
        return c.options.some((o) => o.valeur === r.valeur);
      case 'booleen':
        return typeof r.valeur === 'boolean';
      case 'nombre':
        return typeof r.valeur === 'number';
      case 'attribut':
        return systeme.entites.get(c.entite)?.attributs.has(String(r.valeur)) === true;
      case 'entree':
        return systeme.entrees.get(String(r.valeur))?.sorte === c.sorte;
      case 'texte':
        return typeof r.valeur === 'string';
      default:
        return false;
    }
  });
  if (!possible) erreurs.push(`Valeur impossible pour ${r.champ} : ${String(r.valeur)}`);
  return erreurs;
}

/**
 * Groupe du lanceur de dés : chaque attribut existe et déclare `jet`, dans le type d'entité
 * du groupe, ou dans au moins un type s'il n'en précise pas ; pas de doublon.
 */
export function erreursGroupeJets(systeme: SystemeCharge, g: GroupeJets): string[] {
  const erreurs: string[] = [];
  if (g.entite !== undefined && !systeme.entites.has(g.entite))
    return [`Type d’entité inconnu : ${g.entite}`];
  const entites = g.entite !== undefined ? [g.entite] : [...systeme.entites.keys()];
  const vus = new Set<string>();
  for (const cle of g.attributs) {
    if (vus.has(cle)) erreurs.push(`Attribut en double : ${cle}`);
    vus.add(cle);
    const trouves = entites
      .map((e) => systeme.entites.get(e)?.attributs.get(cle))
      .filter((a) => a !== undefined);
    if (!trouves.length) erreurs.push(`Attribut inconnu : ${cle}`);
    else if (!trouves.some((a) => 'jet' in a && a.jet))
      erreurs.push(`${cle} ne déclare pas \`jet\` : il ne sert pas aux jets`);
  }
  return erreurs;
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
  if (w.option !== undefined && !systeme.options.has(w.option))
    erreurs.push(`Option inconnue : ${w.option}`);
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
    w.type === 'possessions'
      ? [w.sorte]
      : w.type === 'competences'
        ? sortesCompetences(w)
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
  if (w.type === 'competences' && w.filtreChamp) {
    const liste = sortesCompetences(w);
    if (liste.length && !liste.some((so) => champDe(so, w.filtreChamp!)))
      erreurs.push(`Champ inconnu des sortes ${liste.join(', ')} : ${w.filtreChamp}`);
  }
  if (w.type === 'actions')
    for (const a of w.actions ?? [])
      if (!systeme.actions.has(a)) erreurs.push(`Action inconnue : ${a}`);
  return erreurs;
}

/** Références des ressources vérifiées contre le système : sortes, champs, textes, attributs. */
export function erreursReferences(systeme: SystemeCharge, r: References): ErreurPresentation[] {
  const erreurs: ErreurPresentation[] = [];
  const erreur = (chemin: string, message: string) =>
    erreurs.push({ chemin: `references/${chemin}`, message });
  const champDe = (sorte: string, champ: string) =>
    systeme.sortes.get(sorte)?.champs.find((c) => c.id === champ);

  r.capacites?.sections.forEach((s, i) => {
    const chemin = `capacites/sections/${i}`;
    if (!systeme.sortes.has(s.sorte)) return erreur(chemin, `Sorte inconnue : ${s.sorte}`);
    const entrees = [...systeme.entrees.values()].filter((e) => e.sorte === s.sorte);
    if (s.etiquette !== undefined && !entrees.some((e) => e.etiquettes.includes(s.etiquette!)))
      erreur(chemin, `Aucune entrée ${s.sorte} n’a l’étiquette ${s.etiquette}`);
    if (typeof s.groupePar === 'object' && !champDe(s.sorte, s.groupePar.champ))
      erreur(chemin, `Champ inconnu sur ${s.sorte} : ${s.groupePar.champ}`);
  });

  if (r.marche) {
    const m = r.marche;
    m.sortes.forEach((x, i) => {
      const chemin = `marche/sortes/${i}`;
      if (!systeme.sortes.has(x.sorte)) return erreur(chemin, `Sorte inconnue : ${x.sorte}`);
      for (const c of [...x.colonnes, ...(x.groupeChamp ? [x.groupeChamp] : [])])
        if (!champDe(x.sorte, c)) erreur(chemin, `Champ inconnu sur ${x.sorte} : ${c}`);
    });
    if (m.prix !== undefined && !m.sortes.some((x) => champDe(x.sorte, m.prix!)))
      erreur('marche/prix', `Aucune sorte du marché n’a le champ ${m.prix}`);
    const textes = new Set(systeme.source.textes.map((t) => t.id));
    for (const t of m.textes) if (!textes.has(t)) erreur('marche/textes', `Texte inconnu : ${t}`);
  }

  for (const [entite, groupes] of Object.entries(r.bestiaire?.statistiques ?? {})) {
    const e = systeme.entites.get(entite);
    if (!e) {
      erreur(`bestiaire/statistiques/${entite}`, `Type d’entité inconnu : ${entite}`);
      continue;
    }
    groupes.forEach((g, i) => {
      for (const a of g.attributs)
        if (!e.attributs.has(a))
          erreur(`bestiaire/statistiques/${entite}/${i}`, `Attribut inconnu de ${entite} : ${a}`);
    });
  }
  return erreurs;
}

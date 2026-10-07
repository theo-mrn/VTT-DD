/**
 * Attaques du combat (docs/combat.md § 5, § 6, § 11.2) : routes internes appelées par campaign,
 * qui orchestre (droits, tours, rapports) ; character résout avec @vtt/rules.
 *
 *   POST /internal/actions/prepare   règles vérifiées, instantané des fiches (opaque, gardé par
 *        campaign), réactions proposées aux cibles ; sans réaction attendue, la première étape
 *        de dés (ou la résolution, pour une action sans dé)
 *   POST /internal/actions/resolve   résolution sur l'instantané, étape par étape : les faces
 *        déjà connues sont rejouées, celles de l'étape soumise ajoutées (lues sur les dés 3D, ou
 *        tirées ici), puis l'étape suivante, ou les résultats (complet pour le MJ, vue de
 *        l'attaquant) et les coûts de l'attaquant une fois
 *
 * Étapes (docs/combat.md § 6) : une phase de l'action qui demande des dés est une étape que
 * l'attaquant déclenche (le d20, puis les dégâts des seules cibles touchées, puis la table).
 * Character ne garde rien : campaign lui rend l'instantané et les faces à chaque appel, le
 * moteur est déterministe (mêmes faces, même résultat). `serverFallback` : tout le reste est
 * tiré ici, jusqu'aux résultats.
 *
 * Résoudre n'est pas appliquer : rien n'est écrit ici (voir ./modifications.ts). Le jet part à
 * l'historique des dés, une fois l'attaque résolue, réduit à la vue de l'attaquant (jamais le
 * déroulé complet, qui nomme les défenses de la cible).
 */
import {
  AttackCombatContext,
  AttackModification,
  AttackRollMode,
  AttackTargetResult,
  AttackTargetView,
  AttackVisibility as AttackVisibilitySchema,
  DieSource,
  RollAdjustments,
  RollDiceMode,
  RollStep,
  ROLL_STEP_DICE_MAX,
  type AttackVisibility,
  type CombatRulesParticipant,
  type RollPhase,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import {
  aleatoirePlanifie,
  executerMulticible,
  modeDeJet,
  premierePhase,
  type DeRequis,
  type PhaseDes,
  type ContexteCombatSaisi,
  type ContexteCombattantSaisi,
  parametresReaction,
  vueActeur,
  type Action,
  type Ajustements,
  type Fiche,
  type Generateur,
  type ResultatAction,
  type SystemeCharge,
} from '@vtt/rules';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, ServiceApp } from '../../deps.js';
import { jetDeVue, jetPourDes } from '../../des/dice.js';
import { refus, verifierEtat } from '../../regles/operations.js';
import { resultatCible, versModification, vueCible } from '../../regles/combat.js';
import { lire, systemeDe } from '../personnages/depot.js';

const Id = z.uuid('Identifiant invalide').transform((s) => s.toLowerCase());
const Valeur = z.union([z.number().finite(), z.string().max(10_000), z.boolean()]);
const Parametres = z.record(z.string().min(1).max(100), Valeur);
const uniques = (ids: readonly string[]) => new Set(ids).size === ids.length;

/** Jet transmis à l'historique des dés (service dice) : campagne, auteur, visibilité. */
const HistoriqueDes = z.object({
  campaignId: Id,
  authorId: Id,
  visibility: z.enum(['public', 'private', 'gm']),
});

const CorpsPreparer = z.object({
  actorId: Id,
  action: z.string().trim().min(1).max(200),
  params: Parametres.optional(),
  targetIds: z.array(Id).min(1).max(50).refine(uniques, 'Cible en double'),
  rollMode: AttackRollMode.optional(),
  adjustments: RollAdjustments.optional(),
  dice: RollDiceMode.optional(),
  userId: Id,
  campaignId: Id,
  diceHistory: HistoriqueDes.optional(),
  /** Contexte du combat (`@combat.*`) figé par campaign, sans l'attaque en cours. */
  combat: AttackCombatContext.optional(),
});

/** Face connue d'un dé de l'attaque, et sa source. */
const Face = z.object({
  id: z.string().min(1).max(100),
  value: z.number().int().min(1).max(1000),
  source: DieSource.optional(),
});
type Face = z.infer<typeof Face>;

const CorpsResoudre = z.object({
  snapshot: z.unknown(),
  params: Parametres.optional(),
  rollMode: AttackRollMode,
  adjustments: RollAdjustments.optional(),
  dice: RollDiceMode.optional(),
  reactions: z
    .array(
      z.object({ characterId: Id, params: Parametres.optional(), skipped: z.boolean().optional() }),
    )
    .max(50)
    .optional(),
  /** Faces des étapes passées (gardées par campaign), rejouées dans l'ordre des identifiants. */
  faces: z.array(Face).max(2000).optional(),
  /** Étape soumise : ses dés absents de `results` sont tirés ici (source `server`). */
  step: RollStep.optional(),
  /** Faces lues sur les dés 3D pour cette étape (source `physical`). */
  results: z
    .array(z.object({ id: z.string().min(1).max(100), value: z.number().int().min(1).max(1000) }))
    .max(ROLL_STEP_DICE_MAX)
    .optional(),
  /**
   * Paramètres choisis avec l'étape soumise (`step.params` : l'arme, une fois une cible
   * touchée), ajoutés à ceux de la déclaration ; tous ceux que l'étape demande, et seulement eux.
   */
  stepParams: Parametres.optional(),
  /**
   * Tout le reste est tiré ici : la réponse porte les résultats, ou l'étape qui ne demande que
   * des paramètres (l'arme, choisie après le jet).
   */
  serverFallback: z.boolean().optional(),
  forcer: z
    .array(
      z.object({
        characterId: Id,
        success: z.boolean().optional(),
        critical: z.boolean().optional(),
      }),
    )
    .max(50)
    .optional(),
  diceHistory: HistoriqueDes.optional(),
});

/**
 * Résultat d'une cible. `awaiting_dice` : des dés lui restent à lancer ; `result` et `view`
 * portent alors ce qui est déjà exact (le jet et son issue, sans les dégâts), ou null avant
 * le jet.
 */
const ResolutionCible = z.object({
  characterId: z.string(),
  status: z.enum(['resolved', 'failed', 'awaiting_dice']),
  error: z.string().nullable(),
  result: AttackTargetResult.nullable(),
  view: AttackTargetView.nullable(),
});
const Resolution = z.object({
  targets: z.array(ResolutionCible),
  actor: z.object({ modifications: z.array(AttackModification) }),
});
type Resolution = z.infer<typeof Resolution>;

// ─── Instantané des fiches ─────────────────────────────────────────────────────

/** Fiche figée à la déclaration : l'état, et les règles optionnelles de sa campagne. */
const FicheFigee = z.object({
  id: z.string(),
  nom: z.string(),
  avatarUrl: z.string().nullable(),
  etat: z.unknown(),
  options: z.record(z.string(), z.boolean()),
});
type FicheFigee = z.infer<typeof FicheFigee>;

/**
 * Instantané opaque pour campaign (colonne réservée au serveur) : la résolution ne bouge pas
 * pendant qu'on lance les dés. Les cibles refusées à la préparation y restent, avec leur refus.
 */
const Instantane = z.object({
  v: z.literal(1),
  systemId: z.string(),
  action: z.string(),
  campaignId: z.string(),
  userId: z.string(),
  actor: FicheFigee,
  targets: z.array(FicheFigee).max(50),
  refused: z.array(z.object({ id: z.string(), error: z.string() })).max(50),
  /** Ordre des cibles de la déclaration. */
  order: z.array(z.string()).min(1).max(50),
  /** Contexte du combat reçu à la préparation (absent : hors combat, ou avant ce champ). */
  combat: AttackCombatContext.optional(),
});
type Instantane = z.infer<typeof Instantane>;

/** Participant du contrat → moteur (`@combat.acteur.*`, `@combat.cible.*`). */
const combattant = (p: CombatRulesParticipant | undefined): ContexteCombattantSaisi | undefined =>
  p && {
    attaques: p.attacksMade,
    attaquesRound: p.attacksMadeRound,
    vise: p.targeted,
    viseRound: p.targetedRound,
    aAgi: p.hasActed,
    surpris: p.surprised,
  };

/** Contexte du combat (moteur) pour une cible ; hors combat : absent. */
function contexteCombat(c: Instantane['combat'], cibleId: string): ContexteCombatSaisi | undefined {
  if (!c) return undefined;
  const acteur = combattant(c.actor);
  const cible = combattant(c.targets.find((t) => t.characterId.toLowerCase() === cibleId));
  return { round: c.round, ...(acteur ? { acteur } : {}), ...(cible ? { cible } : {}) };
}

const MODE_JET = { per_target: 'par-cible', shared: 'commun' } as const;
const MODE_ROLL = { 'par-cible': 'per_target', commun: 'shared' } as const;

const ajustements = (a: z.output<typeof RollAdjustments> | undefined): Ajustements | undefined =>
  a
    ? {
        ...(a.dice ? { des: a.dice.map((d) => ({ de: d.die, nombre: d.count })) } : {}),
        ...(a.bonus !== undefined ? { bonus: a.bonus } : {}),
      }
    : undefined;

/** Générateur de la préparation : les refus des règles viennent avant tout dé. */
const SANS_DES: Generateur = { entier: () => 1 };

const messages = (e: { parametre?: string; message: string }[]) =>
  [...new Set(e.map((x) => (x.parametre ? `${x.parametre} : ${x.message}` : x.message)))].join(
    ' ; ',
  );

interface Fiches {
  systeme: SystemeCharge;
  acteur: Fiche;
  cibles: { id: string; fiche: Fiche }[];
}

/** Fiches recalculées depuis l'instantané, chacune avec les règles de sa campagne. */
function fichesDe(deps: Pick<Deps, 'catalogue'>, inst: Instantane): Fiches {
  const calcul = (f: FicheFigee) =>
    verifierEtat(systemeDe(deps.catalogue, { systemId: inst.systemId }, f.options), f.etat);
  const systeme = systemeDe(deps.catalogue, { systemId: inst.systemId }, inst.actor.options);
  return {
    systeme,
    acteur: calcul(inst.actor).fiche,
    cibles: inst.targets.map((t) => ({ id: t.id, fiche: calcul(t).fiche })),
  };
}

// ─── Résolution ────────────────────────────────────────────────────────────────

interface Resolue {
  /** Étape de dés à lancer ensuite ; null : l'attaque est résolue. */
  step: RollStep | null;
  resolution: Resolution;
  /** Faces connues après cet appel (passées, soumises, tirées), à garder par campaign. */
  faces: Face[];
  /** Résultats du moteur par cible résolue, pour l'historique des dés (attaque résolue). */
  resultats: { id: string; resultat: ResultatAction }[];
}

/** Valeur d'un paramètre d'action reçu de campaign. */
type ValeurParametre = string | number | boolean;

/** Dés de l'appel : faces connues, étape soumise et ses faces lues, repli du serveur. */
interface DesAppel {
  faces?: Face[];
  step?: RollStep;
  stepParams?: Record<string, ValeurParametre>;
  results?: { id: string; value: number }[];
  serverFallback?: boolean;
}

const PHASE_ROLL: Record<Exclude<PhaseDes, 'fin'>, RollPhase> = {
  jet: 'roll',
  apres: 'after',
  tables: 'table',
};

const invalidFace = (detail: string) => HttpError.badRequest(detail, 'invalid_physical_result');

/**
 * Libellé d'une étape, tiré des données : l'action pour le jet, les valeurs montrées à
 * l'attaquant pour la phase d'après (« Dégâts »), les tables de l'action pour les tirages.
 */
function libelleEtape(systeme: SystemeCharge, actionId: string, phase: PhaseDes): string | null {
  const action = systeme.actions.get(actionId);
  if (!action) return null;
  if (phase === 'jet') return action.nom;
  if (phase === 'apres')
    return action.apres.find((v) => v.visibilite === 'acteur' && v.nom)?.nom ?? null;
  const tables = [
    ...new Set(action.tables.map((t) => systeme.tables.get(t.table)?.nom ?? t.table)),
  ];
  return tables.length ? tables.join(', ') : null;
}

/** Paramètres de l'étape (l'arme) : exactement ceux qu'elle demande, jamais ceux du jet. */
function parametresEtape(
  params: Record<string, ValeurParametre> | undefined,
  des: DesAppel,
): Record<string, ValeurParametre> | undefined {
  if (!des.stepParams) return params;
  const attendus = des.step?.params ?? [];
  const recus = Object.keys(des.stepParams);
  if (recus.some((k) => !attendus.includes(k)) || attendus.some((k) => !recus.includes(k)))
    throw HttpError.badRequest(
      `Paramètres attendus pour cette étape : ${attendus.join(', ') || 'aucun'}`,
      'invalid_step_params',
    );
  return { ...params, ...des.stepParams };
}

/** Faces connues, puis celles de l'étape soumise : lues sur les dés 3D, sinon tirées ici. */
function facesConnues(des: DesAppel, aleatoire: Generateur): Map<string, Face> {
  const faces = new Map<string, Face>();
  for (const f of des.faces ?? []) faces.set(f.id, f);
  if (!des.step) return faces;
  const lues = new Map((des.results ?? []).map((r) => [r.id, r.value]));
  const connus = new Map(des.step.dice.map((d) => [d.id, d]));
  for (const [id, value] of lues) {
    const d = connus.get(id);
    if (!d) throw invalidFace(`Dé inconnu de l’étape : ${id}`);
    if (value > d.faces) throw invalidFace(`Face ${value} hors de 1..${d.faces} (dé ${id})`);
  }
  for (const d of des.step.dice) {
    const lue = lues.get(d.id);
    faces.set(
      d.id,
      lue !== undefined
        ? { id: d.id, value: lue, source: 'physical' }
        : {
            id: d.id,
            value: aleatoire.entier(d.faces, d.die ? { de: d.die } : undefined),
            source: 'server',
          },
    );
  }
  return faces;
}

type Execution = Extract<ReturnType<typeof executerMulticible>, { ok: true }>;

/** Des paramètres à choisir (l'arme, une cible touchée) passent avant les dés qu'ils impliquent. */
function etapeSuivante(
  systeme: SystemeCharge,
  actionId: string,
  r: Execution,
  connues: number,
): RollStep | null {
  if (r.parametres.length) return etapeParametres(systeme, actionId, r.parametres, connues);
  if (r.requis.length) return etape(systeme, actionId, r.requis, connues);
  return null;
}

function resoudre(
  deps: Pick<Deps, 'catalogue' | 'aleatoire'>,
  inst: Instantane,
  o: {
    params?: Record<string, ValeurParametre>;
    rollMode: AttackRollMode;
    adjustments?: z.output<typeof RollAdjustments>;
    reactions?: z.output<typeof CorpsResoudre>['reactions'];
    forcer?: z.output<typeof CorpsResoudre>['forcer'];
  },
  des: DesAppel = {},
): Resolue {
  const { systeme, acteur, cibles } = fichesDe(deps, inst);
  const params = parametresEtape(o.params, des);
  const reaction = new Map(
    (o.reactions ?? []).map((r) => [r.characterId, r.skipped ? {} : (r.params ?? {})]),
  );
  const forcer = new Map((o.forcer ?? []).map((f) => [f.characterId, f]));
  const aj = ajustements(o.adjustments);
  const aleatoire = deps.aleatoire();

  const faces = facesConnues(des, aleatoire);

  const plan = aleatoirePlanifie({
    faces: Object.fromEntries([...faces].map(([id, f]) => [id, f.value])),
    commun: o.rollMode === 'shared',
    ...(des.serverFallback ? { repli: aleatoire } : {}),
  });
  const executer = () =>
    executerMulticible(systeme, {
      action: inst.action,
      acteur,
      cibles: cibles.map((c) => {
        const f = forcer.get(c.id);
        const combat = contexteCombat(inst.combat, c.id);
        return {
          id: c.id,
          fiche: c.fiche,
          ...(combat ? { combat } : {}),
          ...(reaction.has(c.id) ? { reaction: reaction.get(c.id)! } : {}),
          ...(f && (f.success !== undefined || f.critical !== undefined)
            ? {
                forcer: {
                  ...(f.success !== undefined ? { reussi: f.success } : {}),
                  ...(f.critical !== undefined ? { critique: f.critical } : {}),
                },
              }
            : {}),
        };
      }),
      ...(params ? { parametres: params } : {}),
      jet: MODE_JET[o.rollMode],
      ...(aj ? { ajustements: aj } : {}),
      aleatoire: plan,
    });
  let r: ReturnType<typeof executerMulticible>;
  try {
    r = executer();
  } catch (e) {
    // Une face connue qui ne tient pas sur le dé que le moteur lance (données incohérentes)
    if (e instanceof Error && /hors de 1\.\./.test(e.message)) throw invalidFace(e.message);
    throw e;
  }
  if (!r.ok) throw refus(messages(r.erreurs), 'action_refusee');
  for (const [id, value] of Object.entries(plan.tires))
    faces.set(id, { id, value, source: 'server' });

  const step = etapeSuivante(systeme, inst.action, r, faces.size);
  const { targets, resultats } = resultatsParCible(systeme, inst, r);
  return {
    step,
    resolution: {
      targets,
      actor: { modifications: r.acteur.map((m) => versModification(m, inst.actor.id)) },
    },
    faces: [...faces.values()],
    resultats: step ? [] : resultats,
  };
}

/** Résultat de chaque cible, dans l'ordre de l'attaque, et ceux du moteur pour l'historique. */
function resultatsParCible(
  systeme: SystemeCharge,
  inst: Instantane,
  r: Execution,
): { targets: Resolution['targets']; resultats: Resolue['resultats'] } {
  const parCible = new Map(r.cibles.map((c) => [c.id, c]));
  const enAttente = new Map(r.enAttente.map((c) => [c.id, c]));
  const refusees = new Map(inst.refused.map((x) => [x.id, x.error]));
  const resultats: Resolue['resultats'] = [];
  const targets = inst.order.map((id): Resolution['targets'][number] => {
    const attente = enAttente.get(id);
    if (attente)
      return {
        characterId: id,
        status: 'awaiting_dice',
        error: null,
        result: attente.partiel ? resultatCible(systeme, attente.partiel, inst.actor.id) : null,
        view: attente.partiel ? vueCible(systeme, attente.partiel) : null,
      };
    const c = parCible.get(id);
    if (!c?.ok)
      return {
        characterId: id,
        status: 'failed',
        error: c && !c.ok ? messages(c.erreurs) : (refusees.get(id) ?? 'Cible refusée'),
        result: null,
        view: null,
      };
    resultats.push({ id, resultat: c.resultat });
    return {
      characterId: id,
      status: 'resolved',
      error: null,
      result: resultatCible(systeme, c.resultat, inst.actor.id),
      view: vueCible(systeme, c.resultat),
    };
  });
  return { targets, resultats };
}

/**
 * Étape de dés : les dés que le moteur demande, pour toutes les cibles ensemble. Son
 * identifiant suit le nombre de faces déjà connues (il croît à chaque étape) : une étape
 * rejouée garde le sien, une étape passée ne revient jamais.
 */
function etape(
  systeme: SystemeCharge,
  actionId: string,
  requis: DeRequis[],
  connues: number,
): RollStep {
  const phase = premierePhase(requis.map((d) => d.phase)) ?? 'jet';
  const rollPhase = PHASE_ROLL[phase === 'fin' ? 'tables' : phase];
  const label = libelleEtape(systeme, actionId, phase);
  return {
    id: `${rollPhase}-${connues}`,
    phase: rollPhase,
    ...(label ? { label } : {}),
    dice: requis.slice(0, ROLL_STEP_DICE_MAX).map((d) => ({
      id: d.id,
      targetId: d.cible ?? null,
      faces: d.faces,
      ...(d.de ? { die: d.de } : {}),
    })),
  };
}

/**
 * Étape qui ne demande que des paramètres (`etape: apres` : l'arme, une fois une cible touchée) ;
 * les dés qu'ils impliquent viennent à l'étape suivante. Identifiant distinct de l'étape de dés
 * qui la suit (même nombre de faces connues).
 */
function etapeParametres(
  systeme: SystemeCharge,
  actionId: string,
  params: string[],
  connues: number,
): RollStep {
  const label = libelleEtape(systeme, actionId, 'apres');
  return {
    id: `after-params-${connues}`,
    phase: 'after',
    ...(label ? { label } : {}),
    dice: [],
    params,
  };
}

/**
 * Jet de l'attaque dans l'historique des dés, réduit à la vue de l'attaquant : un par cible
 * (jet par cible), un seul pour un jet commun (les dés sont les mêmes ; la réussite n'est
 * donnée que si elle est la même pour toutes).
 */
function transmettre(
  deps: Pick<Deps, 'catalogue' | 'des'>,
  inst: Instantane,
  resolue: Resolue,
  rollMode: AttackRollMode,
  historique: { campaignId: string; authorId: string; visibility: AttackVisibility },
  correlationId: string | undefined,
) {
  if (!resolue.resultats.length) return;
  const systeme = systemeDe(deps.catalogue, { systemId: inst.systemId }, inst.actor.options);
  const acteur = { id: inst.actor.id, nom: inst.actor.nom, avatarUrl: inst.actor.avatarUrl };
  const vues = resolue.resultats.map((r) => vueActeur(systeme, r.resultat));
  const contexte = {
    authorId: historique.authorId,
    campaignId: historique.campaignId,
    visibility: historique.visibility,
  };
  if (rollMode === 'shared') {
    const memes = vues.every((v) => v.reussi === vues[0]!.reussi);
    void deps.des.transmettre(
      jetPourDes(systeme, acteur, vues[0]!, { ...contexte, ...(memes ? {} : { success: null }) }),
      correlationId,
    );
    return;
  }
  for (const v of vues)
    void deps.des.transmettre(jetPourDes(systeme, acteur, v, contexte), correlationId);
}

// ─── Routes ────────────────────────────────────────────────────────────────────

/** Personnage actif, ou 404 `character_not_found` (rien n'est préparé). */
async function lireOu404(deps: Pick<Deps, 'db'>, id: string) {
  try {
    return await lire(deps.db, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404)
      throw new HttpError(
        404,
        'Ressource introuvable',
        'character_not_found',
        `Personnage introuvable : ${id}`,
      );
    throw e;
  }
}

/** Action à préparer : connue du système, avec cible, dans sa limite de cibles. */
function actionPreparee(systeme: SystemeCharge, b: z.output<typeof CorpsPreparer>): Action {
  const action = systeme.actions.get(b.action);
  if (!action) throw refus(`Action inconnue : ${b.action}`, 'action_refusee');
  if (!action.cible) throw refus(`${action.nom} ne prend pas de cible`, 'action_refusee');
  const max = action.multicible?.max;
  if (max !== undefined && b.targetIds.length > max)
    throw refus(`${action.nom} : ${max} cible(s) au plus`, 'action_refusee');
  return action;
}

export function registerActionRoutes(
  app: ServiceApp,
  deps: Deps,
  guard: {
    preValidation: (req: FastifyRequest) => Promise<void>;
    config: FastifyContextConfig;
  },
) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const correlation = (req: FastifyRequest) => req.ctx.correlationId;

  r.post(
    '/internal/actions/prepare',
    {
      ...guard,
      bodyLimit: 1024 * 1024,
      schema: {
        hide: true,
        body: CorpsPreparer,
        response: {
          200: z.object({
            snapshot: Instantane,
            action: z.object({ id: z.string(), name: z.string() }),
            rollMode: AttackRollMode,
            dice: RollDiceMode,
            targets: z.array(
              z.object({
                characterId: z.string(),
                error: z.string().nullable(),
                reactionParams: z.array(z.string()),
              }),
            ),
            step: RollStep.nullable(),
            resolution: Resolution.nullable(),
          }),
        },
      },
    },
    async (req) => {
      const b = req.body;
      const ids = [b.actorId, ...b.targetIds.filter((id) => id !== b.actorId)];
      const lignes = await Promise.all(ids.map((id) => lireOu404(deps, id)));
      const reglages = await Promise.all(ids.map((id) => deps.droits.options(id)));
      const parId = new Map(lignes.map((l, i) => [l.id, { ligne: l, options: reglages[i]! }]));
      const { ligne: acteur, options: optionsActeur } = parId.get(b.actorId)!;

      const systeme = systemeDe(deps.catalogue, acteur, optionsActeur);
      const action = actionPreparee(systeme, b);
      const rollMode = b.rollMode ?? MODE_ROLL[modeDeJet(action)];

      const figer = (id: string): FicheFigee => {
        const { ligne, options } = parId.get(id)!;
        return {
          id,
          nom: ligne.nom,
          avatarUrl: ligne.avatarUrl,
          etat: ligne.etat,
          options,
        };
      };
      const refused: Instantane['refused'] = [];
      const memeSysteme = b.targetIds.filter((id) => {
        if (parId.get(id)!.ligne.systemId === acteur.systemId) return true;
        refused.push({ id, error: 'La cible appartient à un autre système de jeu' });
        return false;
      });

      // Refus des règles, cible par cible, avant tout dé (réactions à leur valeur par défaut)
      let inst: Instantane = {
        v: 1,
        systemId: acteur.systemId,
        action: action.id,
        campaignId: b.campaignId,
        userId: b.userId,
        actor: figer(b.actorId),
        targets: memeSysteme.map(figer),
        refused,
        order: b.targetIds,
        ...(b.combat ? { combat: b.combat } : {}),
      };
      const fiches = fichesDe(deps, inst);
      const essai = executerMulticible(systeme, {
        action: action.id,
        acteur: fiches.acteur,
        // Les vérifications peuvent lire le combat (« au premier tour seulement »)
        cibles: fiches.cibles.map((c) => {
          const combat = contexteCombat(inst.combat, c.id);
          return combat ? { ...c, combat } : c;
        }),
        ...(b.params ? { parametres: b.params } : {}),
        jet: 'par-cible',
        aleatoire: SANS_DES,
      });
      if (!essai.ok) throw refus(messages(essai.erreurs), 'action_refusee');
      const refusees = essai.cibles.filter((c) => !c.ok);
      for (const c of refusees) if (!c.ok) refused.push({ id: c.id, error: messages(c.erreurs) });
      if (refused.length === b.targetIds.length)
        throw refus([...new Set(refused.map((x) => x.error))].join(' ; '), 'action_refusee');
      inst = { ...inst, targets: inst.targets.filter((t) => !refused.some((x) => x.id === t.id)) };

      const erreurDe = new Map(refused.map((x) => [x.id, x.error]));
      const ficheDe = new Map(fiches.cibles.map((c) => [c.id, c.fiche]));
      const targets = b.targetIds.map((id) => {
        const fiche = ficheDe.get(id);
        const error = erreurDe.get(id) ?? null;
        return {
          characterId: id,
          error,
          reactionParams: fiche && !error ? parametresReaction(systeme, action.id, fiche) : [],
        };
      });

      // Aucune réaction attendue : la première étape de dés (le jet), ou la résolution
      // d'une action qui ne lance aucun dé. Avec des réactions, le plan attend leurs réponses
      // (l'Esquive change la réserve).
      let step: RollStep | null = null;
      let resolution: Resolution | null = null;
      if (targets.every((t) => !t.reactionParams.length)) {
        const resolue = resoudre(deps, inst, {
          params: b.params,
          rollMode,
          adjustments: b.adjustments,
        });
        step = resolue.step;
        if (!step) {
          resolution = resolue.resolution;
          if (b.diceHistory)
            transmettre(deps, inst, resolue, rollMode, b.diceHistory, correlation(req));
        }
      }

      return {
        snapshot: inst,
        action: { id: action.id, name: action.nom },
        rollMode,
        // Les faces viennent des dés 3D ou du serveur, étape par étape (docs/combat.md § 6)
        dice: b.dice ?? ('server' as const),
        targets,
        step,
        resolution,
      };
    },
  );

  r.post(
    '/internal/actions/rolls',
    {
      ...guard,
      bodyLimit: 2 * 1024 * 1024,
      schema: {
        hide: true,
        body: z.object({
          campaignId: Id,
          authorId: Id,
          characterId: Id,
          visibility: AttackVisibilitySchema,
          action: z.string().trim().min(1).max(200),
          rollMode: AttackRollMode,
          /** Vues de l'attaquant, une par cible résolue (jamais le rapport complet). */
          views: z.array(AttackTargetView).min(1).max(50),
        }),
        response: { 202: z.object({ forwarded: z.number().int() }) },
      },
    },
    async (req, reply) => {
      const b = req.body;
      const ligne = await lireOu404(deps, b.characterId);
      const systeme = systemeDe(deps.catalogue, ligne, await deps.droits.options(ligne.id));
      const acteur = { id: ligne.id, nom: ligne.nom, avatarUrl: ligne.avatarUrl };
      const contexte = {
        authorId: b.authorId,
        campaignId: b.campaignId,
        visibility: b.visibility,
      };
      // Jet commun : les dés sont les mêmes, un seul jet ; sinon un par cible
      const vues = b.rollMode === 'shared' ? b.views.slice(0, 1) : b.views;
      const memes = b.views.every((v) => v.outcome.success === b.views[0]!.outcome.success);
      for (const v of vues)
        void deps.des.transmettre(
          jetDeVue(systeme, acteur, b.action, v, {
            ...contexte,
            ...(b.rollMode === 'shared' && !memes ? { success: null } : {}),
          }),
          correlation(req),
        );
      reply.code(202);
      return { forwarded: vues.length };
    },
  );

  r.post(
    '/internal/actions/resolve',
    {
      ...guard,
      bodyLimit: 8 * 1024 * 1024,
      schema: {
        hide: true,
        body: CorpsResoudre,
        response: {
          200: z.object({
            step: RollStep.nullable(),
            resolution: Resolution,
            faces: z.array(Face),
          }),
        },
      },
    },
    async (req) => {
      const b = req.body;
      const lu = Instantane.safeParse(b.snapshot);
      if (!lu.success) throw HttpError.badRequest('Instantané illisible', 'invalid_snapshot');
      const inst = lu.data;
      const resolue = resoudre(deps, inst, b, b);
      // Le jet part à l'historique une fois l'attaque résolue, jamais étape par étape
      if (b.diceHistory && !resolue.step)
        transmettre(deps, inst, resolue, b.rollMode, b.diceHistory, correlation(req));
      return { step: resolue.step, resolution: resolue.resolution, faces: resolue.faces };
    },
  );
}

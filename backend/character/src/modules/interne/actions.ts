/**
 * Attaques du combat (docs/combat.md § 5, § 6, § 11.2) : routes internes appelées par campaign,
 * qui orchestre (droits, tours, rapports) ; character résout avec @vtt/rules.
 *
 *   POST /internal/actions/prepare   règles vérifiées, instantané des fiches (opaque, gardé par
 *        campaign), réactions proposées aux cibles, résolution immédiate (dés serveur, aucune
 *        réaction attendue)
 *   POST /internal/actions/resolve   résolution sur l'instantané : un résultat complet (MJ) et
 *        la vue de l'attaquant par cible, les coûts de l'attaquant une fois
 *
 * Résoudre n'est pas appliquer : rien n'est écrit ici (voir ./modifications.ts). Le jet part à
 * l'historique des dés réduit à la vue de l'attaquant (jamais le déroulé complet, qui nomme les
 * défenses de la cible). Étape B : le serveur tire tous les dés (`aleatoireCrypto`) ; les dés
 * physiques (`faces`, `step`) viendront avec l'étape C.
 */
import {
  AttackModification,
  AttackRollMode,
  AttackTargetResult,
  AttackTargetView,
  RollAdjustments,
  RollDiceMode,
  RollStep,
  type AttackVisibility,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import {
  executerMulticible,
  modeDeJet,
  parametresReaction,
  vueActeur,
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
import { jetPourDes } from '../../des/dice.js';
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
});

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
  stepId: z.string().max(100).optional(),
  faces: z
    .array(z.object({ id: z.string().min(1).max(100), value: z.number().int().min(1).max(1000) }))
    .max(400)
    .optional(),
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

const ResolutionCible = z.object({
  characterId: z.string(),
  status: z.enum(['resolved', 'failed']),
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
});
type Instantane = z.infer<typeof Instantane>;

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
  resolution: Resolution;
  /** Résultats du moteur par cible résolue, pour l'historique des dés. */
  resultats: { id: string; resultat: ResultatAction }[];
}

function resoudre(
  deps: Pick<Deps, 'catalogue' | 'aleatoire'>,
  inst: Instantane,
  o: {
    params?: Record<string, string | number | boolean> | undefined;
    rollMode: AttackRollMode;
    adjustments?: z.output<typeof RollAdjustments> | undefined;
    reactions?: z.output<typeof CorpsResoudre>['reactions'];
    forcer?: z.output<typeof CorpsResoudre>['forcer'];
  },
): Resolue {
  const { systeme, acteur, cibles } = fichesDe(deps, inst);
  const reaction = new Map(
    (o.reactions ?? []).map((r) => [r.characterId, r.skipped ? {} : (r.params ?? {})]),
  );
  const forcer = new Map((o.forcer ?? []).map((f) => [f.characterId, f]));
  const aj = ajustements(o.adjustments);
  const r = executerMulticible(systeme, {
    action: inst.action,
    acteur,
    cibles: cibles.map((c) => {
      const f = forcer.get(c.id);
      return {
        id: c.id,
        fiche: c.fiche,
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
    ...(o.params ? { parametres: o.params } : {}),
    jet: MODE_JET[o.rollMode],
    ...(aj ? { ajustements: aj } : {}),
    aleatoire: deps.aleatoire(),
  });
  if (!r.ok) throw refus(messages(r.erreurs), 'action_refusee');

  const parCible = new Map(r.cibles.map((c) => [c.id, c]));
  const refusees = new Map(inst.refused.map((x) => [x.id, x.error]));
  const resultats: Resolue['resultats'] = [];
  const targets = inst.order.map((id): Resolution['targets'][number] => {
    const c = parCible.get(id);
    if (!c || !c.ok)
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
      result: resultatCible(systeme, c.resultat),
      view: vueCible(systeme, c.resultat),
    };
  });
  return {
    resolution: { targets, actor: { modifications: r.acteur.map(versModification) } },
    resultats,
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
      const action = systeme.actions.get(b.action);
      if (!action) throw refus(`Action inconnue : ${b.action}`, 'action_refusee');
      if (!action.cible) throw refus(`${action.nom} ne prend pas de cible`, 'action_refusee');
      const max = action.multicible?.max;
      if (max !== undefined && b.targetIds.length > max)
        throw refus(`${action.nom} : ${max} cible(s) au plus`, 'action_refusee');
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
      };
      const fiches = fichesDe(deps, inst);
      const essai = executerMulticible(systeme, {
        action: action.id,
        acteur: fiches.acteur,
        cibles: fiches.cibles,
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

      // Aucune réaction attendue : les dés du serveur résolvent tout de suite
      let resolution: Resolution | null = null;
      if (targets.every((t) => !t.reactionParams.length)) {
        const resolue = resoudre(deps, inst, {
          params: b.params,
          rollMode,
          adjustments: b.adjustments,
        });
        resolution = resolue.resolution;
        if (b.diceHistory)
          transmettre(deps, inst, resolue, rollMode, b.diceHistory, correlation(req));
      }

      return {
        snapshot: inst,
        action: { id: action.id, name: action.nom },
        rollMode,
        // Étape B : le serveur tire tous les dés (docs/combat.md § 6.6)
        dice: 'server' as const,
        targets,
        step: null,
        resolution,
      };
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
        response: { 200: z.object({ step: RollStep.nullable(), resolution: Resolution }) },
      },
    },
    async (req) => {
      const b = req.body;
      const lu = Instantane.safeParse(b.snapshot);
      if (!lu.success) throw HttpError.badRequest('Instantané illisible', 'invalid_snapshot');
      const inst = lu.data;
      const resolue = resoudre(deps, inst, b);
      if (b.diceHistory)
        transmettre(deps, inst, resolue, b.rollMode, b.diceHistory, correlation(req));
      return { step: null, resolution: resolue.resolution };
    },
  );
}

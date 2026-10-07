/**
 * Faux service character pour les tests : vrai serveur HTTP local qui répond
 * aux routes internes utilisées par campaign (le vrai client HTTP de campaign
 * est donc exercé), avec des personnages et des clés d'initiative imposés.
 * Les réponses suivent le contrat de character (docs/combat.md § 11.2).
 *
 * Attaques : un moteur minimal et déterministe (`actions`) : un d20 par cible (`per_target`)
 * ou un seul pour toutes (`shared`), pris dans `rolls` puis 10 ; touché si le jet + `bonus`
 * atteint `valeurs.Defense` de la cible (10 par défaut) ; dégâts `degats` (5), moins la
 * réaction `esquive` ; coût `cout` en `Stress` pour l'attaquant ; un 20 tire la table
 * `critiques`. Une action à étapes (`steps`) suit le protocole des dés (docs/combat.md § 6) :
 * le d20 de chaque cible, puis un d6 de dégâts par cible touchée, puis le rapport ;
 * `serverFallback` tire tout d'un coup. Applications et décomptes gardent leur diff :
 * annulables, idempotents.
 */
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeCharacter {
  ownerId: string;
  name?: string;
  systemId: string;
  /** Clés d'initiative renvoyées (ou calculées depuis les paramètres reçus). */
  sortKeys?: number[] | ((params: Record<string, unknown>) => number[]);
  /** Refus des règles (422) à l'initiative, avec ce message. */
  rejection?: string;
  /**
   * États temporaires par entrée : rounds restants (fin de round), ou minuterie au tour d'un
   * personnage (docs/combat.md § 18).
   */
  durations?: Record<string, number | FakeTimer>;
  /** Création en cours (fiche pas encore terminée). */
  inCreation?: boolean;
  type?: string;
  /** Joueur ou PNJ ; absent : ancienne version de character, sans ce champ. */
  kind?: 'pc' | 'npc';
  avatarUrl?: string | null;
  /** Résumé des listes renvoyé par character. */
  summary?: { tagline: string; highlights: { label: string; value: string }[] };
  /** Instance de PNJ : campagne de création et modèle copié. */
  campaignId?: string;
  templateId?: string | null;
  /** Supprimé (introuvable ensuite). */
  deleted?: boolean;
  /** Valeurs de la fiche (attributs), modifiées par les applications. */
  values?: Record<string, number>;
  /** Entrées possédées (états, blessures) données par les applications. */
  entries?: string[];
  /** Hors de combat après une application (formule `horsCombat`). */
  defeatedWhen?: (values: Record<string, number>) => boolean;
}

/** Durée au tour d'un personnage : `anchor` absent, le porteur ; `waiting` : attente d'une fin. */
export interface FakeTimer {
  n: number;
  moment: 'round_end' | 'turn_start' | 'turn_end';
  anchor?: string;
  waiting?: boolean;
}

type DurationEvent =
  | { kind: 'turn_start' | 'turn_end'; characterId: string }
  | { kind: 'round_end'; round: number }
  | { kind: 'combat_end' };

/**
 * Même règle que le moteur (`avancerMinuterie`) : décompte au moment voulu, attente d'une fin
 * de tour levée par le premier événement du tour de l'ancre, ancre absente → fin de round.
 */
function advance(
  value: number | FakeTimer,
  events: DurationEvent[],
  bearer: string,
  participants: Set<string>,
): number | FakeTimer | null {
  const t: FakeTimer = typeof value === 'number' ? { n: value, moment: 'round_end' } : { ...value };
  const anchor = t.anchor ?? bearer;
  const moment = t.moment !== 'round_end' && !participants.has(anchor) ? 'round_end' : t.moment;
  for (const e of events) {
    if (e.kind === 'combat_end') return null;
    if (moment === 'round_end') {
      if (e.kind === 'round_end') t.n--;
    } else if (e.kind !== 'round_end' && e.characterId === anchor) {
      if (moment === 'turn_start' && e.kind === 'turn_start') t.n--;
      else if (moment === 'turn_end' && e.kind === 'turn_start') t.waiting = false;
      else if (moment === 'turn_end' && e.kind === 'turn_end') {
        if (t.waiting) t.waiting = false;
        else t.n--;
      }
    }
    if (t.n <= 0) return null;
  }
  return typeof value === 'number' ? t.n : t;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Action à cible du faux moteur. */
export interface FakeAction {
  name: string;
  /** Refus des règles pour l'attaquant (422 `action_refusee`). */
  refuse?: string;
  /** Refus propre à une cible (sa résolution échoue, les autres continuent). */
  refuseTarget?: (targetId: string) => string | null;
  /** Paramètres `par: cible` proposés à une cible. */
  reactionParams?: (targetId: string) => string[];
  /** `multicible.jet` de l'action. */
  rollMode?: 'per_target' | 'shared';
  /** Étapes de dés : le jet, puis les dégâts des cibles touchées (docs/combat.md § 6). */
  steps?: boolean;
}

interface FakeStep {
  id: string;
  phase: 'roll' | 'after' | 'table';
  label?: string;
  dice: { id: string; targetId: string | null; faces: number }[];
}

interface FakeFace {
  id: string;
  value: number;
  source?: string;
}

interface Change {
  path: string;
  before?: unknown;
  after?: unknown;
}

interface StoredApplication {
  response: Record<string, unknown>;
  diffs: Map<string, Change[]>;
  reverted: Set<string>;
}

export interface Call {
  method: string;
  path: string;
  secret: string | undefined;
  body: Record<string, unknown>;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/** Réglages des routes des PNJ et du butin (pannes simulées). */
export interface FakeCharacterBehaviour {
  /** Réponse d'erreur de POST /internal/npcs (status, code). */
  failNpcs?: { status: number; code: string };
  /** Réponse d'erreur de POST /internal/characters/:id/possessions/receive. */
  failReceive?: { status: number; code: string };
  /** Identifiants imposés aux instances créées (un personnage existant est gardé tel quel). */
  npcIds?: string[];
  /** Panne (503) de ces routes internes, par chemin exact. */
  down?: Set<string>;
}

const valuePath = (key: string) => `etat.valeurs.${key}`;
const entryPath = (key: string) => `etat.possessions[${key}]`;
const durationPath = (key: string) => `etat.durees.${key}`;

export async function fakeCharacter(secret: string) {
  const characters = new Map<string, FakeCharacter>();
  const calls: Call[] = [];
  const behaviour: FakeCharacterBehaviour = {};
  /** Objets reçus par personnage (butin). */
  const loot = new Map<string, Record<string, unknown>[]>();
  /** Actions à cible du faux moteur, par identifiant. */
  const actions = new Map<string, FakeAction>([['attaque', { name: 'Attaque' }]]);
  /** Faces des d20 tirés par le faux moteur, dans l'ordre (10 une fois épuisées). */
  const rolls: number[] = [];
  /** Applications et décomptes (`tickId`) enregistrés, par identifiant. */
  const applications = new Map<string, StoredApplication>();
  /** Décomptes déjà faits (ou annulés avant d'arriver) : `tickId` → réponse d'origine. */
  const ticks = new Map<string, Record<string, unknown>>();

  const sheet = (id: string) => {
    const c = characters.get(id);
    return c && !c.deleted ? c : undefined;
  };
  const d20 = () => rolls.shift() ?? 10;

  /** Résolution du faux moteur, à partir de l'instantané des fiches. */
  function resolveAttack(body: Record<string, unknown>) {
    const snap = body.snapshot as {
      actorId: string;
      action: string;
      params: Record<string, unknown>;
      targets: { id: string; values: Record<string, number>; error: string | null }[];
    };
    const reactions = (body.reactions ?? []) as {
      characterId: string;
      params?: Record<string, unknown>;
      skipped?: boolean;
    }[];
    const shared = body.rollMode === 'shared';
    const common = shared ? d20() : 0;
    const bonus = Number(snap.params.bonus ?? 0);
    const damage = Number(snap.params.degats ?? 5);
    const targets = snap.targets.map((t) => {
      if (t.error)
        return { characterId: t.id, status: 'failed', error: t.error, result: null, view: null };
      const die = shared ? common : d20();
      const total = die + bonus;
      const defense = t.values.Defense ?? 10;
      const success = total >= defense;
      const reaction = reactions.find((r) => r.characterId === t.id);
      const dodge = reaction && !reaction.skipped ? Number(reaction.params?.esquive ?? 0) : 0;
      const dealt = success ? Math.max(0, damage - dodge) : 0;
      const outcome = { success, critical: die === 20, fumble: die === 1 };
      const roll = {
        kind: 'numeric',
        formula: `1d20 + ${bonus}`,
        dice: [
          { faces: 20, values: [{ value: die, kept: true, exploded: false, source: 'server' }] },
        ],
        value: total,
        bonuses: [],
        total,
        natural: die,
      };
      const tables =
        success && die === 20
          ? [
              {
                table: 'critiques',
                modifier: 0,
                value: 42,
                dice: [],
                line: { min: 1, max: 100, name: 'Jambe cassée', entry: 'jambe-cassee' },
                outOfRange: false,
              },
            ]
          : [];
      return {
        characterId: t.id,
        status: 'resolved',
        error: null,
        result: {
          outcome,
          roll,
          variables: { defenseCible: defense, degats: dealt, esquive: dodge },
          modifications: success
            ? [
                {
                  kind: 'attribute',
                  entity: 'target',
                  attribute: 'PV',
                  operation: 'subtract',
                  value: dealt,
                  raw: damage,
                  resistances: [],
                },
              ]
            : [],
          tables,
          explanations: [`Jet : ${total}`, `Défense de la cible : ${defense}`],
          errors: [],
        },
        view: {
          outcome,
          roll,
          values: success ? [{ key: 'degats', name: 'Dégâts', value: damage }] : [],
          explanations: [`Jet : ${total}`],
        },
      };
    });
    const cost = Number(snap.params.cout ?? 0);
    return {
      targets,
      actor: {
        modifications: cost
          ? [
              {
                kind: 'attribute',
                entity: 'actor',
                attribute: 'Stress',
                operation: 'add',
                value: cost,
              },
            ]
          : [],
      },
    };
  }

  /** Première étape : le d20 de chaque cible acceptée (un seul en jet commun). */
  function rollStep(
    snap: { targets: { id: string; error: string | null }[] },
    rollMode: unknown,
  ): FakeStep {
    const ok = snap.targets.filter((t) => !t.error);
    return {
      id: 'roll-0',
      phase: 'roll',
      label: 'Attaque',
      dice:
        rollMode === 'shared'
          ? [{ id: 'jet:d20:0', targetId: null, faces: 20 }]
          : ok.map((t, i) => ({ id: `${i}:jet:d20:0`, targetId: t.id, faces: 20 })),
    };
  }

  /**
   * Résolution étape par étape : sans étape, la première (après les réactions) ; le jet donne
   * l'issue et l'étape des dégâts des cibles touchées ; les dégâts donnent le rapport. Les d20
   * sont rejoués depuis les faces reçues (le vrai moteur est déterministe).
   */
  function byStep(body: Record<string, unknown>) {
    const snap = body.snapshot as { targets: { id: string; error: string | null }[] };
    const step = body.step as FakeStep | undefined;
    const known = (body.faces ?? []) as FakeFace[];
    if (!step) {
      const plan = rollStep(snap, body.rollMode);
      return {
        step: plan,
        resolution: {
          targets: snap.targets.map((t) =>
            t.error
              ? { characterId: t.id, status: 'failed', error: t.error, result: null, view: null }
              : {
                  characterId: t.id,
                  status: 'awaiting_dice',
                  error: null,
                  result: null,
                  view: null,
                },
          ),
          actor: { modifications: [] },
        },
        faces: known,
      };
    }
    const results = new Map(
      ((body.results ?? []) as { id: string; value: number }[]).map((r) => [r.id, r.value]),
    );
    const drawn: FakeFace[] = step.dice.map((d) => {
      const read = results.get(d.id);
      return read !== undefined
        ? { id: d.id, value: read, source: 'physical' }
        : { id: d.id, value: d.faces === 20 ? d20() : 3, source: 'server' };
    });
    const faces = [...known, ...drawn];
    rolls.unshift(...faces.filter((f) => f.id.includes('jet:d20')).map((f) => f.value));
    const full = resolveAttack(body);
    if (step.phase !== 'roll') return { step: null, resolution: full, faces };
    const hit = full.targets.filter((t) => t.status === 'resolved' && t.result!.outcome.success);
    if (!hit.length) return { step: null, resolution: full, faces };
    const hitIds = new Set(hit.map((t) => t.characterId));
    return {
      step: {
        id: `after-${faces.length}`,
        phase: 'after',
        label: 'Dégâts',
        dice: hit.map((t, i) => ({ id: `${i}:apres:d6:0`, targetId: t.characterId, faces: 6 })),
      },
      resolution: {
        targets: full.targets.map((t) =>
          hitIds.has(t.characterId)
            ? {
                ...t,
                status: 'awaiting_dice',
                result: { ...t.result!, modifications: [] },
                view: { ...t.view!, values: [] },
              }
            : t,
        ),
        actor: { modifications: [] },
      },
      faces,
    };
  }

  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const path = new URL(req.url ?? '/', 'http://fake').pathname;
    const received = req.headers['x-internal-secret'];
    calls.push({
      method: req.method ?? '',
      path,
      secret: typeof received === 'string' ? received : undefined,
      body,
    });
    const reply = (status: number, json: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    };
    if (received !== secret) return reply(401, { title: 'Authentification requise' });
    if (behaviour.down?.has(path)) return reply(503, { title: 'Indisponible' });

    // ─── Attaques (docs/combat.md § 11.2) ───
    // Jet d'une attaque calculée par le navigateur : relayé à dice (ici, seulement noté)
    if (req.method === 'POST' && path === '/internal/actions/rolls') {
      const views = (body.views as unknown[] | undefined) ?? [];
      return reply(202, { forwarded: body.rollMode === 'shared' ? 1 : views.length });
    }
    if (req.method === 'POST' && path === '/internal/actions/prepare') {
      const action = actions.get(body.action as string);
      const actor = sheet(body.actorId as string);
      if (!action || !actor)
        return reply(404, { title: 'Introuvable', code: 'character_not_found', detail: 'absent' });
      if (action.refuse)
        return reply(422, { title: 'Refusé', code: 'action_refusee', detail: action.refuse });
      const targetIds = body.targetIds as string[];
      const missing = targetIds.find((id) => !sheet(id));
      if (missing)
        return reply(404, { title: 'Introuvable', code: 'character_not_found', detail: missing });
      const targets = targetIds.map((id) => ({
        characterId: id,
        error: action.refuseTarget?.(id) ?? null,
        reactionParams: action.reactionParams?.(id) ?? [],
      }));
      if (targets.every((t) => t.error))
        return reply(422, {
          title: 'Refusé',
          code: 'action_refusee',
          detail: targets.map((t) => t.error).join(' ; '),
        });
      const rollMode = (body.rollMode as string) ?? action.rollMode ?? 'per_target';
      const snapshot = {
        actorId: body.actorId,
        action: body.action,
        params: body.params ?? {},
        targets: targetIds.map((id, i) => ({
          id,
          values: { ...(sheet(id)!.values ?? {}) },
          error: targets[i]!.error,
        })),
      };
      const waiting = targets.some((t) => !t.error && t.reactionParams.length);
      const planned = action.steps && !waiting;
      return reply(200, {
        snapshot,
        action: { id: body.action, name: action.name },
        rollMode,
        dice: 'server',
        targets,
        step: planned ? rollStep(snapshot, rollMode) : null,
        resolution: waiting || planned ? null : resolveAttack({ ...body, snapshot, rollMode }),
      });
    }
    if (req.method === 'POST' && path === '/internal/actions/resolve') {
      const snap = body.snapshot as { action: string };
      if (actions.get(snap.action)?.steps && !body.serverFallback) return reply(200, byStep(body));
      return reply(200, { step: null, resolution: resolveAttack(body) });
    }
    if (req.method === 'POST' && path === '/internal/modifications/apply') {
      const list = body.applications as {
        applicationId: string;
        items: {
          characterId: string;
          modifications: Record<string, unknown>[];
          tables?: { table: string; entry: string | null }[];
        }[];
      }[];
      // Tout ou rien : on vérifie tout avant d'écrire
      for (const app of list) {
        if (applications.has(app.applicationId)) continue;
        for (const item of app.items) {
          const c = sheet(item.characterId);
          if (!c)
            return reply(404, {
              title: 'Introuvable',
              code: 'character_not_found',
              detail: item.characterId,
            });
          for (const m of item.modifications)
            if (m.kind === 'attribute' && !((m.attribute as string) in (c.values ?? {})))
              return reply(422, {
                title: 'Refusé',
                code: 'modification_invalide',
                detail: `Attribut inconnu : ${m.attribute as string}`,
                errors: [{ characterId: item.characterId, message: 'attribut inconnu' }],
              });
        }
      }
      const out = list.map((app) => {
        const stored = applications.get(app.applicationId);
        if (stored) return { ...stored.response, replayed: true };
        const diffs = new Map<string, Change[]>();
        for (const item of app.items) {
          const c = sheet(item.characterId)!;
          c.values ??= {};
          c.entries ??= [];
          const changes = diffs.get(item.characterId) ?? [];
          for (const m of item.modifications) {
            if (m.kind === 'attribute') {
              const key = m.attribute as string;
              const before = c.values[key]!;
              const v = Number(m.value);
              let after = before - v;
              if (m.operation === 'set') after = v;
              else if (m.operation === 'add') after = before + v;
              c.values[key] = after;
              changes.push({ path: valuePath(key), before, after });
            } else if (m.operation === 'give') {
              c.entries.push(m.entry as string);
              changes.push({ path: entryPath(m.entry as string), after: true });
            }
          }
          for (const t of item.tables ?? [])
            if (t.entry) {
              c.entries.push(t.entry);
              changes.push({ path: entryPath(t.entry), after: true });
            }
          diffs.set(item.characterId, changes);
        }
        const response = {
          applicationId: app.applicationId,
          items: [...diffs].map(([characterId, changes]) => {
            const c = sheet(characterId)!;
            return {
              characterId,
              version: 2,
              changes,
              defeated: c.defeatedWhen?.(c.values ?? {}) ?? false,
            };
          }),
        };
        applications.set(app.applicationId, { response, diffs, reverted: new Set() });
        return { ...response, replayed: false };
      });
      return reply(200, { applications: out });
    }
    // Décompte des durées d'un passage de tour, par lot (docs/combat.md § 18.4)
    if (req.method === 'POST' && path === '/internal/durations/tick') {
      const tickId = body.tickId as string;
      const done = ticks.get(tickId);
      if (done) return reply(200, { ...done, replayed: true });
      const participants = new Set(body.characterIds as string[]);
      const events = body.events as DurationEvent[];
      const stored: StoredApplication = {
        response: {},
        diffs: new Map<string, Change[]>(),
        reverted: new Set<string>(),
      };
      const items: Record<string, unknown>[] = [];
      for (const id of participants) {
        const c = sheet(id);
        if (!c?.durations) continue;
        const expired: { key: string; name: string }[] = [];
        const changes: Change[] = [];
        for (const [entry, value] of Object.entries(c.durations)) {
          const after = advance(value, events, id, participants);
          if (after !== null && same(after, value)) continue;
          if (after === null) {
            delete c.durations[entry];
            expired.push({ key: entry, name: entry });
            changes.push({ path: durationPath(entry), before: value });
          } else {
            c.durations[entry] = after;
            changes.push({ path: durationPath(entry), before: value, after });
          }
        }
        if (!changes.length) continue;
        stored.diffs.set(id, changes);
        items.push({ characterId: id, version: 2, expired });
      }
      const response = { tickId, replayed: false, items };
      ticks.set(tickId, response);
      applications.set(tickId, stored);
      return reply(200, response);
    }
    if (req.method === 'POST' && path === '/internal/modifications/revert') {
      const stored = applications.get(body.applicationId as string);
      if (!stored && body.cancelIfMissing === true) {
        // Pierre tombale : le décompte arrivé ensuite ne fera rien
        ticks.set(body.applicationId as string, {
          tickId: body.applicationId,
          replayed: false,
          items: [],
        });
        return reply(200, { applicationId: body.applicationId, items: [] });
      }
      if (!stored)
        return reply(404, {
          title: 'Introuvable',
          code: 'application_not_found',
          detail: 'absente',
        });
      const wanted = (body.characterIds as string[] | undefined) ?? [...stored.diffs.keys()];
      const current = (id: string, path: string) => {
        const c = sheet(id);
        if (!c) return undefined;
        if (path.startsWith('etat.valeurs.')) return c.values?.[path.slice(13)];
        if (path.startsWith('etat.durees.')) return c.durations?.[path.slice(12)];
        return c.entries?.includes(path.slice(17, -1)) ? true : undefined;
      };
      const conflicts = wanted.flatMap((id) => {
        if (stored.reverted.has(id)) return [];
        const paths = (stored.diffs.get(id) ?? [])
          .filter((ch) => !same(current(id, ch.path), ch.after))
          .map((ch) => ch.path);
        return paths.length ? [{ characterId: id, paths }] : [];
      });
      if (conflicts.length && !body.force)
        return reply(409, {
          title: 'Conflit',
          code: 'revert_conflict',
          detail: 'La fiche a changé',
          conflicts,
        });
      const items = wanted.map((id) => {
        const c = sheet(id);
        if (!c) return { characterId: id, status: 'missing', version: null, changes: [] };
        if (stored.reverted.has(id))
          return { characterId: id, status: 'already_reverted', version: 3, changes: [] };
        const changes = (stored.diffs.get(id) ?? []).map((ch) => {
          if (ch.path.startsWith('etat.valeurs.'))
            c.values![ch.path.slice(13)] = ch.before as number;
          else if (ch.path.startsWith('etat.durees.')) {
            c.durations ??= {};
            c.durations[ch.path.slice(12)] = ch.before as number | FakeTimer;
          } else c.entries = (c.entries ?? []).filter((e) => e !== ch.path.slice(17, -1));
          return { path: ch.path, before: ch.after, after: ch.before };
        });
        stored.reverted.add(id);
        return { characterId: id, status: 'reverted', version: 3, changes, defeated: false };
      });
      return reply(200, { applicationId: body.applicationId, items });
    }

    // Instances de PNJ : de vrais personnages du faux service, numérotés comme character
    if (req.method === 'POST' && path === '/internal/npcs') {
      if (behaviour.failNpcs)
        return reply(behaviour.failNpcs.status, {
          title: 'Refusé',
          code: behaviour.failNpcs.code,
          detail: 'Refus simulé',
        });
      const source = body.source as Record<string, Record<string, string>>;
      const copied = source.characterId
        ? characters.get(source.characterId as unknown as string)
        : undefined;
      const name = source.quick?.name ?? copied?.name?.replace(/ \d+$/, '') ?? 'PNJ';
      const taken = [...characters.values()].filter(
        (c) => c.campaignId === body.campaignId && c.name?.startsWith(name),
      ).length;
      const items = Array.from({ length: body.count as number }, (_, i) => {
        const id = behaviour.npcIds?.[i] ?? crypto.randomUUID();
        const k = taken + i + 1;
        const c: FakeCharacter = {
          ownerId: body.ownerId as string,
          name: k === 1 ? name : `${name} ${k}`,
          systemId: body.systemId as string,
          kind: 'npc',
          campaignId: body.campaignId as string,
          templateId: (source.templateId as unknown as string) ?? copied?.templateId ?? null,
        };
        if (!characters.has(id)) characters.set(id, c);
        return {
          id,
          nom: c.name,
          avatarUrl: null,
          tokenUrl: source.quick?.imageUrl ?? null,
          templateId: c.templateId ?? null,
        };
      });
      return reply(201, { items });
    }
    if (req.method === 'POST' && path === '/internal/npcs/delete') {
      const deleted = (body.ids as string[]).filter((id) => {
        const c = characters.get(id);
        if (!c || c.kind !== 'npc' || c.deleted) return false;
        c.deleted = true;
        return true;
      });
      return reply(200, { deleted });
    }

    if (req.method === 'POST' && path === '/internal/npcs/restore') {
      const restored = (body.ids as string[]).filter((id) => {
        const c = characters.get(id);
        if (!c || c.kind !== 'npc' || !c.deleted) return false;
        c.deleted = false;
        return true;
      });
      return reply(200, { restored });
    }

    const m = /^\/internal\/characters\/([^/]+)(\/.*)?$/.exec(path);
    const c = m ? characters.get(m[1]!) : undefined;
    if (!m || !c || c.deleted)
      return reply(404, { title: 'Ressource introuvable', code: 'not_found' });
    const id = m[1]!;
    const rest = m[2] ?? '';

    if (req.method === 'GET' && rest === '') {
      return reply(200, {
        id,
        ownerId: c.ownerId,
        nom: c.name ?? 'Héros',
        avatarUrl: c.avatarUrl ?? null,
        systeme: { id: c.systemId, version: '1.0.0' },
        type: c.type ?? 'personnage',
        ...(c.kind ? { kind: c.kind } : {}),
        creation: c.inCreation ?? false,
        ...(c.summary ? { summary: c.summary } : {}),
      });
    }
    if (req.method === 'POST' && rest.startsWith('/actions/')) {
      if (c.rejection)
        return reply(422, { title: 'Refusé', code: 'action_refusee', detail: c.rejection });
      const params = (body.parametres ?? {}) as Record<string, unknown>;
      const cles = typeof c.sortKeys === 'function' ? c.sortKeys(params) : (c.sortKeys ?? [0]);
      return reply(200, { resultat: { action: rest.slice(9), parametres: params }, cles });
    }
    if (req.method === 'POST' && rest === '/possessions/receive') {
      if (behaviour.failReceive)
        return reply(behaviour.failReceive.status, {
          title: 'Refusé',
          code: behaviour.failReceive.code,
          detail: 'Refus simulé',
        });
      const item = body.item as Record<string, unknown>;
      loot.set(id, [...(loot.get(id) ?? []), { ...item, playerId: body.playerId }]);
      return reply(200, { version: 2, entree: (item.ref as string) ?? 'objet-libre' });
    }
    return reply(404, { title: 'Route introuvable' });
  });

  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    characters,
    calls,
    behaviour,
    loot,
    actions,
    rolls,
    applications,
    /** Ajoute un personnage et renvoie son identifiant. */
    add(c: FakeCharacter): string {
      const id = crypto.randomUUID();
      characters.set(id, c);
      return id;
    },
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}

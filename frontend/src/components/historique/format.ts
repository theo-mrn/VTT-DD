/**
 * Mise en forme des événements du journal (service history) pour la
 * chronique de la table, reprise de l'ancien panneau Historique : chaque
 * événement devient une ligne de l'ancien Historique (`GameEvent` :
 * catégorie, message avec des `**noms**` en pastille, personnage).
 *
 * - `legacy.<type>` (ancien Historique importé) : rendu exactement comme avant,
 *   à partir du payload d'origine (`message`, `character`, `details`).
 * - Événements du bus : rangés dans la catégorie de l'ancienne app la plus
 *   proche, avec les mêmes tournures quand elle en avait une (« a **perdu** 7
 *   PV », « a succombé à ses blessures ! », « a reçu **1x [Corde]** »…).
 *
 * Aucune clé de jeu n'est écrite en dur : libellés, nature des attributs
 * (ressource, saisie MJ, visibilité) et noms des entrées viennent du système
 * de la campagne. Sans système chargé, les clés brutes sont affichées.
 */
import type { Attribut, SystemeCharge } from '@vtt/rules';
import type { HistoryEvent, LegacyPayload } from '@/lib/history';
import { translate } from '@/i18n/runtime';

// ─── Modèle d'affichage (celui de l'ancien Historique) ──────────────────────

export type EventType =
  | 'creation'
  | 'combat'
  | 'mort'
  | 'niveau'
  | 'stats'
  | 'inventaire'
  | 'competence'
  | 'note'
  | 'deplacement'
  | 'info';

const EVENT_TYPES: ReadonlySet<string> = new Set<EventType>([
  'creation',
  'combat',
  'mort',
  'niveau',
  'stats',
  'inventaire',
  'competence',
  'note',
  'deplacement',
  'info',
]);

export interface GameEvent {
  id: string;
  /** Rang dans la campagne (history), pour la pagination. */
  seq: number | null;
  /** Type de l'événement du bus (`character.updated`, `legacy.combat`…). */
  source: string;
  type: EventType;
  message: string;
  timestamp: Date;
  characterId?: string;
  characterName?: string;
  characterAvatar?: string;
  /** Type de l'ancienne app (`joueurs`, `allié`, `pnj`), lu par le résumé. */
  characterType?: string;
  details?: Record<string, unknown>;
  /** Montré dans la vue « Par personnage » seulement (doublon d'une autre ligne du Journal). */
  hiddenFromTimeline?: boolean;
}

export type Side = 'players' | 'enemies' | 'allies';

export interface CharacterLabel {
  name: string;
  avatarUrl: string | null;
  side: Side | null;
  /** Type d'entité du système (`personnage`, `pnj`…). */
  type: string | null;
}

export interface UserLabel {
  name: string | null;
  avatarUrl: string | null;
}

/** Ce qu'il faut pour nommer les choses ; les clés des tables sont en minuscules. */
export interface FormatContext {
  characters: ReadonlyMap<string, CharacterLabel>;
  users: ReadonlyMap<string, UserLabel>;
  maps: ReadonlyMap<string, string>;
  system: SystemeCharge | null;
  /** Le lecteur est MJ : il voit aussi les attributs réservés au MJ. */
  viewerIsGm: boolean;
}

// ─── Petits outils ───────────────────────────────────────────────────────────

type Payload = Record<string, unknown>;

const obj = (v: unknown): Payload | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Payload) : null;
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bold = (s: string | number) => `**${String(s).replaceAll('**', '')}**`;
const lower = (id: string | null | undefined) => (id ? id.toLowerCase() : '');

/** Champ d'une opération : à plat dans le payload (character) ou sous `details`. */
function detail(p: Payload, key: string): unknown {
  const d = obj(p.details);
  return d && key in d ? d[key] : p[key];
}

/** Type de l'ancienne app déduit du camp (lu par le résumé : PJ, allié, PNJ). */
export function legacyCharacterType(side: Side | null | undefined): string | undefined {
  // Codes de l'ancienne app (données), jamais affichés
  if (side === 'players') return 'joueurs'; // i18n-ignore
  if (side === 'allies') return 'allié'; // i18n-ignore
  if (side === 'enemies') return 'pnj'; // i18n-ignore
  return undefined;
}

function characterOf(ctx: FormatContext, id: string | null | undefined) {
  return id ? ctx.characters.get(lower(id)) : undefined;
}

function characterName(
  ctx: FormatContext,
  id: string | null | undefined,
  fallback?: string | null,
) {
  return characterOf(ctx, id)?.name ?? fallback ?? translate('history.lines.character');
}

function userName(ctx: FormatContext, id: string | null | undefined) {
  return (id && ctx.users.get(lower(id))?.name) || translate('history.lines.aPlayer');
}

/** Champs « personnage » d'une ligne : nom, avatar et type, lus dans le contexte. */
function characterFields(
  ctx: FormatContext,
  id: string | null | undefined,
  fallbackName?: string | null,
) {
  if (!id) return fallbackName ? { characterName: fallbackName } : {};
  const c = characterOf(ctx, id);
  return {
    characterId: id,
    characterName: c?.name ?? fallbackName ?? undefined,
    characterAvatar: c?.avatarUrl ?? undefined,
    characterType: legacyCharacterType(c?.side),
  };
}

// ─── Système de jeu ──────────────────────────────────────────────────────────

/** Attribut d'une clé : dans le type d'entité du personnage, sinon dans le premier qui la déclare. */
function attributeOf(
  ctx: FormatContext,
  entityType: string | null | undefined,
  key: string,
): { attr: Attribut; primaryVital: boolean } | null {
  const system = ctx.system;
  if (!system) return null;
  const own = entityType ? system.entites.get(entityType) : undefined;
  const candidates = own ? [own] : [...system.entites.values()];
  for (const entity of candidates) {
    const list = entity.type.attributs;
    const attr = list.find((a) => a.cle === key);
    if (!attr) continue;
    // Jauge principale : la première ressource déclarée (comme la première stat vitale à borne)
    const primary = list.find((a) => a.nature === 'ressource');
    return { attr, primaryVital: primary?.cle === key };
  }
  return null;
}

const attributeLabel = (attr: Attribut | undefined, key: string) =>
  attr?.abrege || attr?.nom || key;

function entryName(ctx: FormatContext, entree: string | null | undefined): string {
  if (!entree) return translate('history.lines.object');
  return ctx.system?.entrees.get(entree)?.nom ?? entree;
}

/** Objet d'un achat : attribut, entrée ou `arbre/noeud`. */
function purchaseName(ctx: FormatContext, entityType: string | null, objet: string): string {
  const system = ctx.system;
  if (!system) return objet;
  const slash = objet.indexOf('/');
  if (slash > 0) {
    const tree = system.arbres.get(objet.slice(0, slash));
    const node = tree?.noeuds.find((n) => n.id === objet.slice(slash + 1));
    if (node) return entryName(ctx, node.entree);
  }
  if (system.entrees.has(objet)) return entryName(ctx, objet);
  const a = attributeOf(ctx, entityType, objet);
  return a ? attributeLabel(a.attr, objet) : objet;
}

// ─── Diff avant/après (`changes`) ────────────────────────────────────────────

interface Change {
  path: string;
  before?: unknown;
  after?: unknown;
}

function readChanges(p: Payload): Change[] | null {
  if (!Array.isArray(p.changes)) return null;
  return p.changes.filter((c): c is Change => !!obj(c) && typeof (c as Payload).path === 'string');
}

/** Segment entre crochets : identité brute ou chaîne JSON (`["PV max"]`, `["12"]`). */
function unquote(raw: string): string {
  if (!raw.startsWith('"')) return raw;
  try {
    return String(JSON.parse(raw));
  } catch {
    return raw.slice(1, -1);
  }
}

const VALUE_PATH = /^etat\.valeurs(?:\.([^.[\]]+)|\[((?:"(?:[^"\\]|\\.)*")|[^\]]+)\])$/;
const POSSESSION_PATH = /^etat\.possessions\[((?:"(?:[^"\\]|\\.)*")|[^\]]+)\](?:\.(\w+))?$/;
const BONUS_PATH = /^etat\.bonus\[((?:"(?:[^"\\]|\\.)*")|[^\]]+)\]/;

function valueKey(path: string): string | null {
  const m = VALUE_PATH.exec(path);
  if (!m) return null;
  return m[1] ?? unquote(m[2]!);
}

/** Nom d'un bonus libre retiré, lu dans la valeur « avant » du diff. */
function bonusName(changes: Change[] | null, id: string): string | null {
  for (const c of changes ?? []) {
    const m = BONUS_PATH.exec(c.path);
    if (m && unquote(m[1]!) === id) return str(obj(c.before)?.nom) ?? null;
  }
  return null;
}

// ─── Valeurs d'un personnage ─────────────────────────────────────────────────

interface Line {
  type: EventType;
  text: string;
}

/** Importance d'une catégorie quand un événement en réunit plusieurs. */
const WEIGHT: Record<EventType, number> = {
  mort: 9,
  combat: 8,
  niveau: 7,
  inventaire: 6,
  competence: 5,
  deplacement: 4,
  creation: 3,
  stats: 2,
  note: 1,
  info: 0,
};

function combine(lines: Line[]): Line | null {
  if (!lines.length) return null;
  // Une mort résume tout le reste
  const death = lines.find((l) => l.type === 'mort');
  if (death) return death;
  const type = lines.reduce((t, l) => (WEIGHT[l.type] > WEIGHT[t] ? l.type : t), lines[0]!.type);
  return { type, text: lines.map((l) => l.text).join(' ') };
}

function show(v: unknown): string {
  if (typeof v === 'boolean') return translate(v ? 'history.lines.yes' : 'history.lines.no');
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v as string | number | bigint);
}

/** Signe d'une modification d'attribut (sinon « = » : valeur fixée). */
const SIGNES: Record<string, string> = { subtract: '−', add: '+' };

/** « 3 rounds », « 1 round ». */
const rounds = (n: number) => translate('history.lines.rounds', { count: n });

/** Ressource qui change : chiffres pour les PJ, mort quand la jauge principale tombe à 0. */
function resourceLine(
  who: string,
  character: CharacterLabel | undefined,
  found: { attr: Extract<Attribut, { nature: 'ressource' }>; primaryVital: boolean },
  label: string,
  b: number | null,
  a: number | null,
  hasBefore: boolean,
): Line | null {
  if (a === null) return null;
  if (!hasBefore || b === null)
    return {
      type: 'combat',
      text: translate('history.lines.resourceSet', { who, label, value: bold(a) }),
    };
  const diff = a - b;
  if (!diff) return null;
  const recoversToMax = found.attr.recuperation === 'max';
  if (found.primaryVital && recoversToMax && a <= 0 && b > 0)
    return { type: 'mort', text: translate('history.lines.succumbed', { who }) };
  const harmful = recoversToMax ? diff < 0 : diff > 0;
  if (character?.side !== 'players')
    return {
      type: 'combat',
      text: translate(harmful ? 'history.lines.attacked' : 'history.lines.healed', { who }),
    };
  const verbs = recoversToMax
    ? { pire: translate('history.lines.lost'), mieux: translate('history.lines.recovered') }
    : { pire: translate('history.lines.suffered'), mieux: translate('history.lines.healedOf') };
  const verb = harmful ? verbs.pire : verbs.mieux;
  return {
    type: 'combat',
    text: translate('history.lines.resourceChange', {
      who,
      verb: bold(verb),
      amount: String(Math.abs(diff)),
      label,
    }),
  };
}

/** Nombre qui passe d'une valeur à une autre ; une hausse saisie par le MJ est une progression. */
function numberLine(
  who: string,
  attr: Attribut | undefined,
  label: string,
  b: number,
  a: number,
): Line | null {
  if (a === b) return null;
  const progression = attr?.nature === 'base' && attr.saisie === 'mj' && a > b;
  return {
    type: progression ? 'niveau' : 'stats',
    text: translate(progression ? 'history.lines.numberProgress' : 'history.lines.numberChange', {
      who,
      label,
      before: String(b),
      after: bold(a),
    }),
  };
}

/**
 * Une valeur qui change. Ressource (PV, Stress…) : tournures de l'ancienne
 * app, chiffres pour les PJ seulement (« a été attaqué » pour les autres),
 * mort quand la jauge principale tombe à 0. Autres attributs : ancienne et
 * nouvelle valeur ; attributs réservés au MJ cachés aux joueurs.
 */
function valueLine(
  ctx: FormatContext,
  who: string,
  character: CharacterLabel | undefined,
  key: string,
  before: unknown,
  after: unknown,
  hasBefore: boolean,
): Line | null {
  const found = attributeOf(ctx, character?.type, key);
  const attr = found?.attr;
  if (attr?.visibilite === 'mj' && !ctx.viewerIsGm) return null;
  const label = attributeLabel(attr, key);
  const b = num(before);
  const a = num(after);

  if (attr?.nature === 'ressource') {
    const resource = { attr, primaryVital: found?.primaryVital === true };
    return resourceLine(who, character, resource, label, b, a, hasBefore);
  }
  if (a !== null && b !== null && hasBefore) return numberLine(who, attr, label, b, a);
  if (hasBefore && show(before) === show(after)) return null;
  return {
    type: 'stats',
    text: translate('history.lines.valueBecomes', { who, label, value: bold(show(after)) }),
  };
}

/** Changements de valeurs : le diff (`changes`), sinon les valeurs envoyées (`valeurs`). */
function valueLines(
  ctx: FormatContext,
  who: string,
  character: CharacterLabel | undefined,
  p: Payload,
  changes: Change[] | null,
): Line[] {
  const lines: (Line | null)[] = [];
  if (changes) {
    for (const c of changes) {
      const key = valueKey(c.path);
      if (key !== null)
        lines.push(valueLine(ctx, who, character, key, c.before, c.after, 'before' in c));
    }
  } else {
    const valeurs = obj(detail(p, 'valeurs'));
    for (const [key, v] of Object.entries(valeurs ?? {}))
      lines.push(valueLine(ctx, who, character, key, undefined, v, false));
  }
  return lines.filter((l): l is Line => l !== null);
}

/** Entrée donnée (avec sa durée) ou retirée, d'après `etat.possessions[entree#exemplaire]`. */
function entryChangeLine(ctx: FormatContext, who: string, c: Change, raw: string): Line | null {
  const name = bold(entryName(ctx, unquote(raw).split('#')[0]));
  if (!('before' in c) || c.before == null) {
    const duration = num(obj(c.after)?.duree);
    return {
      type: 'combat',
      text:
        duration !== null
          ? translate('history.lines.isFor', { who, name, rounds: rounds(duration) })
          : translate('history.lines.receives', { who, name }),
    };
  }
  if (!('after' in c) || c.after == null)
    return { type: 'combat', text: translate('history.lines.noLonger', { who, name }) };
  return null;
}

/** État libre donné ou retiré, d'après `etat.bonus[id]`. */
function bonusChangeLine(who: string, c: Change): Line | null {
  const before = obj(c.before);
  const after = obj(c.after);
  if (after && !before)
    return {
      type: 'combat',
      text: translate('history.lines.is', {
        who,
        name: bold(str(after.nom) ?? translate('history.lines.aState')),
      }),
    };
  if (before && !after)
    return {
      type: 'combat',
      text: translate('history.lines.noLonger', {
        who,
        name: bold(str(before.nom) ?? translate('history.lines.aState')),
      }),
    };
  return null;
}

/**
 * États et entrées donnés ou retirés d'un coup (application du combat, annulation) : lus dans
 * le diff, chemin `etat.possessions[entree#exemplaire]` et `etat.bonus[id]` (état libre).
 */
function possessionLines(ctx: FormatContext, who: string, changes: Change[] | null): Line[] {
  const lines: (Line | null)[] = [];
  for (const c of changes ?? []) {
    const m = POSSESSION_PATH.exec(c.path);
    if (m && m[2] === undefined) lines.push(entryChangeLine(ctx, who, c, m[1]!));
    else if (BONUS_PATH.test(c.path) && c.path.endsWith(']')) lines.push(bonusChangeLine(who, c));
  }
  return lines.filter((l): l is Line => l !== null);
}

// ─── Formateurs par type ─────────────────────────────────────────────────────

type Formatted = Omit<GameEvent, 'id' | 'seq' | 'source' | 'timestamp'>;
type Formatter = (e: HistoryEvent, ctx: FormatContext) => Formatted | null;

/** Ce que lisent les tournures d'une modification de personnage. */
interface UpdateScope {
  p: Payload;
  ctx: FormatContext;
  op: string;
  who: string;
  character: CharacterLabel | undefined;
  changes: Change[] | null;
  line: (type: EventType, message: string) => Formatted;
}

type UpdateFormatter = (s: UpdateScope) => Formatted | null;

/** Lignes réunies (valeurs et états), en une seule. */
function combinedLine(s: UpdateScope, lines: Line[]): Formatted | null {
  const c = combine(lines);
  return c && s.line(c.type, c.text);
}

/** Valeurs et états touchés d'un coup (application, annulation du combat). */
const appliedLines = (s: UpdateScope): Line[] => [
  ...valueLines(s.ctx, s.who, s.character, s.p, s.changes),
  ...possessionLines(s.ctx, s.who, s.changes),
];

/** Changement de nom (l'avatar seul ne se dit pas). */
function profileUpdated({ p, changes, line }: UpdateScope): Formatted | null {
  const nameChange = changes?.find((c) => c.path === 'nom');
  const newName = str(nameChange?.after) ?? str(detail(p, 'nom'));
  if (!newName) return null; // avatar seul
  const oldName = str(nameChange?.before);
  return line(
    'info',
    oldName
      ? translate('history.lines.renamed', { before: bold(oldName), after: bold(newName) })
      : translate('history.lines.nameChanged', { name: bold(newName) }),
  );
}

/** Champ de possession changé (quantité, équipement), sinon null. */
function possessionFieldLine(
  { who, line }: UpdateScope,
  c: Change,
  field: string | undefined,
  item: string,
): Formatted | null {
  if (field === 'quantite') {
    const diff = (num(c.after) ?? 1) - (num(c.before) ?? 1);
    if (diff)
      return line(
        'inventaire',
        translate('history.lines.quantityChange', {
          who,
          verb: bold(translate(diff > 0 ? 'history.lines.received' : 'history.lines.lost')),
          amount: String(Math.abs(diff)),
          item,
        }),
      );
  }
  if (field === 'actif' && typeof c.after === 'boolean')
    return line(
      'inventaire',
      translate(c.after ? 'history.lines.equipped' : 'history.lines.stowed', { who, item }),
    );
  return null;
}

/** Possession reçue, modifiée, équipée ou rangée. */
function possessionUpdated(s: UpdateScope): Formatted | null {
  const { p, ctx, who, line } = s;
  const possession = obj(detail(p, 'possession'));
  const entree = str(possession?.entree);
  const item = bold(`[${entryName(ctx, entree)}]`);
  // Possession à durée : état temporaire (Aveuglé, Étourdi…), comme les conditions du combat
  if (num(possession?.duree) !== null)
    return line(
      'combat',
      translate('history.lines.is', { who, name: bold(entryName(ctx, entree)) }),
    );
  if (detail(p, 'cree') === true) {
    const qty = num(possession?.quantite) ?? 1;
    return line(
      'inventaire',
      translate('history.lines.receivedInInventory', {
        who,
        item: bold(`${qty}x [${entryName(ctx, entree)}]`),
      }),
    );
  }
  for (const c of s.changes ?? []) {
    const m = POSSESSION_PATH.exec(c.path);
    const changed = m && possessionFieldLine(s, c, m[2], item);
    if (changed) return changed;
  }
  return line('inventaire', translate('history.lines.modified', { who, item }));
}

/** Achat ou remboursement hors création. */
function purchaseUpdated({ p, ctx, op, who, character, line }: UpdateScope): Formatted | null {
  const ligne = obj(detail(p, 'ligne'));
  // Achats de la création : l'événement « a terminé sa création » les résume
  if (!ligne || ligne.creation === true) return null;
  const name = bold(purchaseName(ctx, character?.type ?? null, str(ligne.objet) ?? '?'));
  return op === 'achat'
    ? line('competence', translate('history.lines.acquired', { who, name }))
    : line('competence', translate('history.lines.renounced', { who, name }));
}

/** Effets coupés ou réactivés un à un (bloc Bonus) ; une demande sans effet ne se dit pas. */
function effectUpdated({ p, ctx, who, line }: UpdateScope): Formatted | null {
  if (detail(p, 'change') === false) return null;
  const sources = detail(p, 'sources');
  const noms = (Array.isArray(sources) ? sources : [])
    .filter((x): x is string => typeof x === 'string')
    .map((x) => `[${entryName(ctx, x.split('#')[0])}]`);
  const de = noms.length ? translate('history.lines.of', { name: bold(noms.join(', ')) }) : '';
  return line(
    'stats',
    translate(detail(p, 'actif') === true ? 'history.lines.bonusOn' : 'history.lines.bonusOff', {
      who,
      of: de,
    }),
  );
}

/** États arrivés au bout de leur durée. */
function durationsCounted({ p, ctx, who, changes, line }: UpdateScope): Formatted | null {
  const retirees = detail(p, 'retirees');
  const names = (Array.isArray(retirees) ? retirees : [])
    .filter((r): r is string => typeof r === 'string')
    .map((r) =>
      r.startsWith('bonus:')
        ? (bonusName(changes, r.slice(6)) ?? translate('history.lines.aBonus'))
        : entryName(ctx, r.split('#')[0]),
    );
  if (!names.length) return null;
  return line(
    'combat',
    translate('history.lines.noLonger', { who, name: names.map(bold).join(', ') }),
  );
}

/** Annulation : d'une application (MJ), ou des durées d'un round (« Précédent », `tick:…`). */
function combatReverted(s: UpdateScope): Formatted | null {
  const c = combine(appliedLines(s));
  if (!c) return null;
  const round = str(detail(s.p, 'applicationId'))?.startsWith('tick:') === true;
  const forced = detail(s.p, 'forced') === true;
  const annulation = translate(forced ? 'history.lines.gmRevertForced' : 'history.lines.gmRevert');
  return s.line(
    'combat',
    translate('history.lines.pair', {
      name: round ? translate('history.lines.previousTurn') : annulation,
      value: c.text,
    }),
  );
}

/** Tournure de chaque opération sur la fiche. */
const UPDATE_FORMATTERS: Record<string, UpdateFormatter> = {
  profil: profileUpdated,
  'creation.terminer': ({ who, line }) =>
    line('creation', translate('history.lines.creationDone', { who })),
  possession: possessionUpdated,
  'possession.retrait': ({ p, ctx, who, line }) =>
    line(
      'inventaire',
      translate('history.lines.discarded', {
        who,
        item: bold(`[${entryName(ctx, str(detail(p, 'entree')))}]`),
      }),
    ),
  achat: purchaseUpdated,
  remboursement: purchaseUpdated,
  bonus: ({ p, who, line }) => {
    const nom = str(obj(detail(p, 'bonus'))?.nom);
    return line(
      'stats',
      translate('history.lines.benefits', {
        who,
        name: bold(nom ?? translate('history.lines.aBonus')),
      }),
    );
  },
  'bonus.retrait': ({ p, who, changes, line }) => {
    const nom = bonusName(changes, str(detail(p, 'bonusId')) ?? '');
    return line(
      'stats',
      translate('history.lines.loses', {
        who,
        name: bold(nom ?? translate('history.lines.aBonus')),
      }),
    );
  },
  effet: effectUpdated,
  'durees.decompte': durationsCounted,
  // Décision du MJ appliquée par le combat (docs/combat.md § 7.2) : valeurs et états touchés
  'combat.application': (s) => combinedLine(s, appliedLines(s)),
  'combat.annulation': combatReverted,
  repos: (s) => {
    const rest = combine([
      { type: 'stats', text: translate('history.lines.rested', { who: s.who }) },
      ...valueLines(s.ctx, s.who, s.character, s.p, s.changes),
    ]);
    return rest && s.line('stats', rest.text);
  },
};

function characterUpdated(e: HistoryEvent, ctx: FormatContext): Formatted | null {
  const p = e.payload;
  const id = e.aggregate.id;
  const op = str(p.operation) ?? '';
  const base = characterFields(ctx, id);
  const s: UpdateScope = {
    p,
    ctx,
    op,
    who: bold(characterName(ctx, id)),
    character: characterOf(ctx, id),
    changes: readChanges(p),
    line: (type, message) => ({ ...base, type, message }),
  };
  if (Object.hasOwn(UPDATE_FORMATTERS, op)) return UPDATE_FORMATTERS[op]!(s);
  // Étapes de création, import : l'événement de fin de création les résume
  if (op.startsWith('creation.') || op === 'ajouter') return null;
  return combinedLine(s, valueLines(ctx, s.who, s.character, p, s.changes));
}

// ─── Attaques (docs/combat.md § 7.7, § 10) ───────────────────────────────────

/** Issue d'une cible, en mots de l'ancienne page d'attaque. */
function outcomeWord(o: unknown): string | null {
  const outcome = obj(o);
  if (!outcome || typeof outcome.success !== 'boolean') return null;
  if (outcome.success)
    return translate(outcome.critical === true ? 'history.lines.critical' : 'history.lines.hit');
  return translate(outcome.fumble === true ? 'history.lines.fumble' : 'history.lines.miss');
}

/** Total d'un jet numérique, ou résultats nets d'un pool (noms du système). */
function rollText(ctx: FormatContext, r: unknown): string | null {
  const roll = obj(r);
  if (!roll) return null;
  if (roll.kind === 'numeric') return num(roll.total) !== null ? String(roll.total) : null;
  const results = obj(roll.results);
  if (!results) return null;
  const declared = ctx.system?.source.des?.resultats ?? [];
  const parts = declared
    .filter((d) => d.visible !== false && (num(results[d.cle]) ?? 0) > 0)
    .map((d) => `${results[d.cle]} ${d.nom.toLowerCase()}`);
  if (!declared.length)
    for (const [k, v] of Object.entries(results)) if ((num(v) ?? 0) > 0) parts.push(`${v} ${k}`);
  return parts.length ? parts.join(', ') : translate('history.lines.noNetSymbol');
}

function damageTypeName(ctx: FormatContext, id: string | null): string | null {
  if (!id) return null;
  return ctx.system?.source.typesDegats.find((t) => t.id === id)?.nom ?? id;
}

/** Une modification lisible : « −7 PV (feu) », « +3 Stress », « Brûlé (2 rounds) ». */
function modificationText(
  ctx: FormatContext,
  entityType: string | null,
  m: unknown,
): string | null {
  const mod = obj(m);
  if (!mod) return null;
  if (mod.kind === 'entry') {
    const name = entryName(ctx, str(mod.entry));
    if (mod.operation === 'remove') return translate('history.lines.without', { name });
    const duration = num(mod.duration);
    return duration ? `${name} (${rounds(duration)})` : name;
  }
  const key = str(mod.attribute);
  const value = num(mod.value);
  if (!key || value === null) return null;
  const attr = attributeOf(ctx, entityType, key)?.attr;
  if (attr?.visibilite === 'mj' && !ctx.viewerIsGm) return null;
  const sign = SIGNES[str(mod.operation) ?? ''] ?? '= ';
  const type = damageTypeName(ctx, str(mod.damageType));
  return `${sign}${value} ${attributeLabel(attr, key)}${type ? ` (${type})` : ''}`;
}

function modificationsText(
  ctx: FormatContext,
  entityType: string | null,
  mods: unknown,
): string | null {
  const parts = (Array.isArray(mods) ? mods : [])
    .map((m) => modificationText(ctx, entityType, m))
    .filter((t): t is string => !!t);
  return parts.length ? parts.join(', ') : null;
}

const listOf = (v: unknown): Payload[] =>
  (Array.isArray(v) ? v : []).map(obj).filter((x): x is Payload => !!x);

/** Attaquant nommé par la charge ; null : caché au lecteur (« Un adversaire »). */
function attackerName(ctx: FormatContext, id: string | null) {
  return id ? bold(characterName(ctx, id)) : translate('history.lines.anOpponent');
}

/** « de **Orc** », ou rien quand l'attaquant n'est pas connu. */
const ofAttacker = (ctx: FormatContext, id: string | null) =>
  id ? translate('history.lines.of', { name: bold(characterName(ctx, id)) }) : '';

/**
 * Événements réservés au MJ (rapport complet, décision, annulation, hors de combat) : le
 * serveur ne les donne qu'au MJ ; un lecteur qui n'est pas MJ ne les met jamais en mots.
 */
const gmOnly =
  (f: Formatter): Formatter =>
  (e, ctx) =>
    ctx.viewerIsGm ? f(e, ctx) : null;

const COMBAT_FORMATTERS: Record<string, Formatter> = {
  // Qui attaque qui, et l'issue (attaques publiques) ; un attaquant caché n'est pas nommé
  'combat.attack_announced': (e, ctx) => {
    const p = e.payload;
    const attackerId = str(p.attackerId);
    const action = str(obj(p.action)?.name) ?? translate('history.lines.anAttack');
    const targets = listOf(p.targets).map((t) => {
      const outcome = outcomeWord(t.outcome);
      const name = bold(characterName(ctx, str(t.characterId)));
      return outcome ? translate('history.lines.pair', { name, value: bold(outcome) }) : name;
    });
    const attacker = attackerName(ctx, attackerId);
    return {
      ...characterFields(ctx, attackerId),
      type: 'combat',
      message: targets.length
        ? translate('history.lines.usesAgainst', {
            attacker,
            action: bold(action),
            targets: targets.join(' ; '),
          })
        : translate('history.lines.uses', { attacker, action: bold(action) }),
    };
  },

  // Décision du MJ racontée à la table : montants du camp des joueurs seulement (serveur)
  'combat.attack_concluded': (e, ctx) => {
    const p = e.payload;
    const attackerId = str(p.attackerId);
    const parts = listOf(p.targets).flatMap((t) => {
      const id = str(t.characterId);
      const who = bold(characterName(ctx, id));
      if (t.decision === 'skipped') return [translate('history.lines.noEffect', { who })];
      if (t.decision !== 'applied') return [];
      const character = characterOf(ctx, id);
      const amounts = listOf(t.amounts)
        .map((a) => {
          const key = str(a.attribute);
          const value = num(a.value);
          if (!key || value === null) return null;
          const attr = attributeOf(ctx, character?.type, key)?.attr;
          if (attr?.visibilite === 'mj' && !ctx.viewerIsGm) return null;
          const type = damageTypeName(ctx, str(a.damageType));
          return `${value} ${attributeLabel(attr, key)}${type ? ` (${type})` : ''}`;
        })
        .filter((x): x is string => !!x);
      return [amounts.length ? `${who} (${amounts.join(', ')})` : who];
    });
    if (!parts.length) return null;
    return {
      ...characterFields(ctx, attackerId),
      type: 'combat',
      message: translate('history.lines.attackApplied', {
        of: attackerId ? ofAttacker(ctx, attackerId) : translate('history.lines.ofOpponent'),
        parts: parts.join(' ; '),
      }),
    };
  },

  // Rapport complet (MJ) : dés, issue, valeurs proposées par cible
  'combat.attack_resolved': gmOnly((e, ctx) => {
    const attack = obj(e.payload.attack);
    if (!attack) return null;
    const attackerId = str(attack.attackerId);
    const action = str(obj(attack.action)?.name) ?? translate('history.lines.anAttack');
    const parts = listOf(attack.targets).map((t) => {
      const id = str(t.characterId);
      const who = bold(characterName(ctx, id));
      const error = str(t.error);
      if (t.status === 'failed')
        return error
          ? translate('history.lines.refusedWith', { who, error })
          : translate('history.lines.refused', { who });
      const result = obj(t.result);
      const outcome = outcomeWord(result?.outcome);
      const roll = rollText(ctx, result?.roll);
      const mods = modificationsText(
        ctx,
        characterOf(ctx, id)?.type ?? null,
        result?.modifications,
      );
      return translate('history.lines.pair', {
        name: who,
        value: [
          outcome ? bold(outcome) : null,
          roll ? translate('history.lines.rollOf', { roll }) : null,
          mods,
        ]
          .filter(Boolean)
          .join(', '),
      });
    });
    const attacker = attackerName(ctx, attackerId);
    return {
      ...characterFields(ctx, attackerId),
      type: 'combat',
      message: parts.length
        ? translate('history.lines.usesDetail', {
            attacker,
            action: bold(action),
            parts: parts.join(' ; '),
          })
        : translate('history.lines.uses', { attacker, action: bold(action) }),
    };
  }),

  'combat.attack_decided': gmOnly((e, ctx) => {
    const p = e.payload;
    const attackerId = e.actor.characterId;
    const targets = listOf(p.targets);
    const applied = targets.filter((t) => t.decision === 'applied');
    const parts = targets.map((t) => {
      const target = str(t.characterId);
      const app = obj(t.applied);
      const redirected = str(app?.redirectedTo);
      const touched = redirected ?? target;
      const who = bold(characterName(ctx, touched));
      if (t.decision === 'skipped') return translate('history.lines.notApplied', { who });
      if (t.decision !== 'applied') return translate('history.lines.pending', { who });
      const mods = modificationsText(
        ctx,
        characterOf(ctx, touched)?.type ?? null,
        app?.modifications,
      );
      const tables = listOf(app?.tables)
        .map((x) => str(x.entry))
        .filter((x): x is string => !!x)
        .map((x) => entryName(ctx, x));
      const detailText = [mods, ...tables].filter(Boolean).join(', ');
      const name = `${who}${redirected ? translate('history.lines.reassigned') : ''}`;
      return detailText ? translate('history.lines.pair', { name, value: detailText }) : name;
    });
    const note = str(p.note);
    const decision = translate(
      applied.length ? 'history.lines.gmApplies' : 'history.lines.gmDismisses',
      {
        of: ofAttacker(ctx, attackerId),
        parts: parts.length
          ? translate('history.lines.colonList', { list: parts.join(' ; ') })
          : '',
      },
    );
    return {
      ...characterFields(ctx, attackerId),
      type: 'combat',
      message: `${decision}${note ? translate('history.lines.quote', { note }) : ''}`,
    };
  }),

  'combat.attack_reverted': gmOnly((e, ctx) => {
    const p = e.payload;
    const names = (Array.isArray(p.targetIds) ? p.targetIds : [])
      .filter((id): id is string => typeof id === 'string')
      .map((id) => bold(characterName(ctx, id)));
    const attackerId = e.actor.characterId;
    return {
      ...characterFields(ctx, attackerId),
      type: 'combat',
      message: translate(
        p.forced === true ? 'history.lines.revertedForced' : 'history.lines.reverted',
        {
          of: ofAttacker(ctx, attackerId),
          on: names.length ? translate('history.lines.on', { name: names.join(', ') }) : '',
          costs: p.actor === true ? translate('history.lines.costsRefunded') : '',
        },
      ),
    };
  }),

  'combat.participant_defeated': gmOnly((e, ctx) => {
    const id = str(e.payload.characterId);
    return {
      ...characterFields(ctx, id),
      type: 'mort',
      message: translate('history.lines.defeated', { name: bold(characterName(ctx, id)) }),
    };
  }),
};

/** Combattants ajoutés en cours de combat. */
function participantsAdded(p: Payload, ctx: FormatContext): Formatted | null {
  // `added` ne part qu'aux MJ : un joueur ne sait pas qui a rejoint (PNJ caché)
  const added = (Array.isArray(p.added) ? p.added : []).filter(
    (id): id is string => typeof id === 'string',
  );
  if (!added.length) return null;
  return {
    type: 'combat',
    message: translate('history.lines.joinCombat', {
      count: added.length,
      names: added.map((id) => bold(characterName(ctx, id))).join(', '),
    }),
  };
}

/** Ordre d'initiative tiré. */
function initiativeRolled(p: Payload, ctx: FormatContext): Formatted {
  const order = (Array.isArray(p.order) ? p.order : [])
    .map((o) => str(obj(o)?.characterId))
    .filter((id): id is string => !!id)
    .map((id) => bold(characterName(ctx, id)));
  return {
    type: 'combat',
    message: order.length
      ? translate('history.lines.initiative', { order: order.join(', ') })
      : translate('history.lines.initiativeRolled'),
  };
}

const FORMATTERS: Record<string, Formatter> = {
  'character.updated': characterUpdated,

  'character.created': (e, ctx) => ({
    ...characterFields(ctx, e.aggregate.id, str(e.payload.nom)),
    type: 'creation',
    message: translate('history.lines.created', {
      name: bold(characterName(ctx, e.aggregate.id, str(e.payload.nom))),
    }),
  }),

  'character.deleted': (e, ctx) => ({
    ...characterFields(ctx, e.aggregate.id),
    type: 'info',
    message: translate('history.lines.disappeared', {
      name: bold(characterName(ctx, e.aggregate.id)),
    }),
  }),

  'character.action_resolved': (e, ctx) => {
    const p = e.payload;
    const actorId = e.aggregate.id;
    const action = str(p.action) ?? translate('history.lines.action');
    const actionName = ctx.system?.actions.get(action)?.nom ?? action;
    const targetId = str(p.cibleId);
    const onOther = !!targetId && lower(targetId) !== lower(actorId);
    const reussi = obj(p.resultat)?.reussi;
    const issue = translate(reussi ? 'history.lines.success' : 'history.lines.failure');
    const outcome =
      typeof reussi === 'boolean'
        ? translate('history.lines.colonList', { list: bold(issue) })
        : '';
    return {
      ...characterFields(ctx, actorId),
      type: onOther ? 'combat' : 'competence',
      message: translate('history.lines.actionUsed', {
        actor: bold(characterName(ctx, actorId)),
        action: bold(actionName),
        on: onOther
          ? translate('history.lines.on', { name: bold(characterName(ctx, targetId)) })
          : '',
        outcome,
      }),
    };
  },

  'dice.rolled': (e, ctx) => {
    const p = e.payload;
    const characterId = e.characterId ?? str(p.characterId);
    const author =
      str(p.userName) ?? characterName(ctx, characterId, userName(ctx, e.actor.userId));
    const label = str(p.label);
    const notation = str(p.notation);
    const total = num(p.total);
    const symbols = str(p.symbolResult);
    const outcome = obj(p.outcome);
    let result: string | null = null;
    if (symbols) result = bold(symbols);
    else if (total !== null) result = bold(total);
    let critical = '';
    if (outcome?.critical === true)
      critical = ` ${bold(translate('history.lines.criticalSuccess'))}`;
    else if (outcome?.fumble === true)
      critical = ` ${bold(translate('history.lines.criticalFailure'))}`;
    const formule = notation ? ` (${notation})` : '';
    const quoi = label
      ? `${bold(label)}${formule}`
      : (notation ?? translate('history.lines.theDice'));
    const rolled = { author: bold(author), what: quoi };
    return {
      ...characterFields(ctx, characterId, author),
      type: 'competence',
      message: `${
        result
          ? translate('history.lines.rollsResult', { ...rolled, result })
          : translate('history.lines.rolls', rolled)
      }${critical}`,
      // Jet d'une action : la ligne de l'action le résume dans le Journal
      hiddenFromTimeline: str(p.source) === 'action',
    };
  },

  'combat.started': (e) => {
    const count = Array.isArray(e.payload.participants) ? e.payload.participants.length : 0;
    return {
      type: 'combat',
      message: count
        ? translate('history.lines.combatStartsCount', { count: bold(count) })
        : translate('history.lines.combatStarts'),
    };
  },

  'combat.turn_changed': (e, ctx) => {
    const p = e.payload;
    if (p.reason === 'previous')
      return {
        type: 'combat',
        message:
          num(p.round) !== null
            ? translate('history.lines.previousRound', { round: bold(num(p.round)!) })
            : translate('history.lines.previousTurnDot'),
      };
    if (p.reason === 'turn_set') {
      const actor = str(p.currentActorId);
      return {
        ...characterFields(ctx, actor),
        type: 'combat',
        message: actor
          ? translate('history.lines.gmGivesTurn', { name: bold(characterName(ctx, actor)) })
          : translate('history.lines.gmPasses'),
      };
    }
    if (p.reason === 'participants_added') return participantsAdded(p, ctx);
    if (p.reason === 'initiative') return initiativeRolled(p, ctx);
    if (p.reason === 'new_round' && num(p.round) !== null)
      return {
        type: 'combat',
        message: translate('history.lines.roundStart', { round: bold(num(p.round)!) }),
      };
    // Tour suivant, participants retirés : trop fréquents pour le Journal
    return null;
  },

  'combat.ended': (e) => {
    const round = num(e.payload.round);
    return {
      type: 'combat',
      message:
        round && round > 1
          ? translate('history.lines.combatEndAfter', { round: bold(round) })
          : translate('history.lines.combatEnd'),
    };
  },

  ...COMBAT_FORMATTERS,

  'campaign.member_joined': (e, ctx) => {
    const id = str(e.payload.userId) ?? e.actor.userId;
    const name = userName(ctx, id);
    return {
      characterName: name,
      characterAvatar: (id && ctx.users.get(lower(id))?.avatarUrl) || undefined,
      type: 'info',
      message: translate('history.lines.memberJoined', { name: bold(name) }),
    };
  },

  'campaign.member_left': (e, ctx) => {
    const p = e.payload;
    const id = str(p.userId) ?? e.actor.userId;
    const name = userName(ctx, id);
    let how: 'memberLeft' | 'memberBanned' | 'memberKicked' = 'memberLeft';
    if (p.banned === true) how = 'memberBanned';
    else if (p.kicked === true) how = 'memberKicked';
    return {
      characterName: name,
      characterAvatar: (id && ctx.users.get(lower(id))?.avatarUrl) || undefined,
      type: 'info',
      message: translate(`history.lines.${how}`, { name: bold(name) }),
    };
  },

  'campaign.character_added': (e, ctx) => {
    const id = str(e.payload.characterId);
    const name = characterName(ctx, id, str(e.payload.name));
    return {
      ...characterFields(ctx, id, name),
      type: 'creation',
      message: translate('history.lines.appeared', { name: bold(name) }),
    };
  },

  'campaign.character_removed': (e, ctx) => {
    const id = str(e.payload.characterId);
    return {
      ...characterFields(ctx, id),
      type: 'info',
      message: translate('history.lines.disappeared', { name: bold(characterName(ctx, id)) }),
    };
  },

  'campaign.character_played': (e, ctx) => {
    const id = str(e.payload.characterId);
    const player = bold(userName(ctx, str(e.payload.userId) ?? e.actor.userId));
    return {
      ...characterFields(ctx, id),
      type: 'info',
      message: id
        ? translate('history.lines.plays', { player, name: bold(characterName(ctx, id)) })
        : translate('history.lines.playsNone', { player }),
    };
  },

  'token.created': (e, ctx) => {
    const id = str(e.payload.characterId);
    if (!id) return null;
    return {
      ...characterFields(ctx, id),
      type: 'creation',
      message: translate('history.lines.appeared', { name: bold(characterName(ctx, id)) }),
    };
  },

  'token.deleted': (e, ctx) => {
    const id = str(e.payload.characterId);
    if (!id) return null;
    return {
      ...characterFields(ctx, id),
      type: 'info',
      message: translate('history.lines.disappeared', { name: bold(characterName(ctx, id)) }),
    };
  },

  'map_settings.updated': (e, ctx) => {
    const p = e.payload;
    const mapId = str(p.partyMapId);
    // Voyage du groupe : seul `partyMapId` change (les autres réglages ne se racontent pas)
    const keys = Object.keys(p).filter((k) => k !== 'version');
    if (!mapId || keys.length !== 1) return null;
    const name = ctx.maps.get(lower(mapId));
    return {
      type: 'deplacement',
      message: name
        ? translate('history.lines.partyGoes', { name: bold(name) })
        : translate('history.lines.partyMoves'),
    };
  },
};

/** Ligne de l'ancien Historique, telle qu'elle était enregistrée. */
function legacyEvent(e: HistoryEvent, ctx: FormatContext): Formatted {
  const p = e.payload as LegacyPayload;
  const kind = e.type.slice('legacy.'.length);
  const details = obj(p.details) ?? undefined;
  const character = obj(p.character);
  const id = e.characterId ?? undefined;
  return {
    type: (EVENT_TYPES.has(kind) ? kind : 'info') as EventType,
    message: str(p.message) ?? '',
    characterId: id,
    characterName: str(character?.name) ?? undefined,
    // Avatar retiré à l’import (base64) : celui de la fiche, s’il est connu
    characterAvatar: str(character?.avatar) ?? characterOf(ctx, id)?.avatarUrl ?? undefined,
    characterType: str(character?.type) ?? undefined,
    details,
    hiddenFromTimeline: details?.hiddenFromTimeline === true,
  };
}

/** Ligne du panneau pour un événement ; null s'il ne se raconte pas (non affiché). */
export function formatHistoryEvent(e: HistoryEvent, ctx: FormatContext): GameEvent | null {
  let formatted: Formatted | null;
  try {
    const f = e.type.startsWith('legacy.') ? legacyEvent : FORMATTERS[e.type];
    formatted = f ? f(e, ctx) : null;
  } catch {
    // Payload inattendu : la ligne est ignorée plutôt que de casser tout le panneau
    formatted = null;
  }
  if (!formatted) return null;
  return {
    ...formatted,
    id: e.id,
    seq: e.seq,
    source: e.type,
    timestamp: new Date(e.occurredAt),
  };
}

/**
 * `combat.turn_changed` arrive en double quand le combat a un participant caché : la charge
 * complète aux MJ (`gm_only`), puis la même version expurgée pour toute la table (`public`).
 * Le MJ garde la complète : la publique de même version est retirée de sa chronique (un joueur
 * ne reçoit jamais la première, rien ne change pour lui).
 */
export function withoutRedactedTwins(events: readonly HistoryEvent[]): HistoryEvent[] {
  const turnKey = (e: HistoryEvent) => `${e.aggregate.id}:${String(e.payload.version)}`;
  const full = new Set(
    events
      .filter((e) => e.type === 'combat.turn_changed' && e.visibility === 'gm_only')
      .map(turnKey),
  );
  if (!full.size) return [...events];
  return events.filter(
    (e) => !(e.type === 'combat.turn_changed' && e.visibility === 'public' && full.has(turnKey(e))),
  );
}

/**
 * Noms connus par les événements eux-mêmes (personnage engagé puis retiré,
 * ancien Historique, auteur d'un jet) : repli quand la campagne ne les liste plus.
 */
export function namesFromEvents(events: readonly HistoryEvent[]): Map<string, string> {
  const names = new Map<string, string>();
  const put = (id: unknown, name: unknown) => {
    const i = str(id);
    const n = str(name);
    if (i && n && !names.has(lower(i))) names.set(lower(i), n);
  };
  for (const e of events) {
    const p = e.payload;
    if (e.type === 'campaign.character_added') put(p.characterId, p.name);
    else if (e.type === 'character.created') put(e.aggregate.id, p.nom);
    else if (e.type.startsWith('legacy.')) put(e.characterId, obj(p.character)?.name);
    else if (e.type === 'dice.rolled') put(e.characterId, p.userName);
  }
  return names;
}

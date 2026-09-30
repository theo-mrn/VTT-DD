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
const bold = (s: string | number) => `**${String(s).replace(/\*\*/g, '')}**`;
const lower = (id: string | null | undefined) => (id ? id.toLowerCase() : '');

/** Champ d'une opération : à plat dans le payload (character) ou sous `details`. */
function detail(p: Payload, key: string): unknown {
  const d = obj(p.details);
  return d && key in d ? d[key] : p[key];
}

/** Type de l'ancienne app déduit du camp (lu par le résumé : PJ, allié, PNJ). */
export function legacyCharacterType(side: Side | null | undefined): string | undefined {
  if (side === 'players') return 'joueurs';
  if (side === 'allies') return 'allié';
  if (side === 'enemies') return 'pnj';
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
  return characterOf(ctx, id)?.name ?? fallback ?? 'Personnage';
}

function userName(ctx: FormatContext, id: string | null | undefined) {
  return (id && ctx.users.get(lower(id))?.name) || 'Un joueur';
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
  if (!entree) return 'objet';
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

const show = (v: unknown) =>
  typeof v === 'boolean' ? (v ? 'oui' : 'non') : v === null || v === undefined ? '—' : String(v);

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
    if (a === null) return null;
    if (!hasBefore || b === null)
      return { type: 'combat', text: `${who} : ${label} à ${bold(a)}.` };
    const diff = a - b;
    if (!diff) return null;
    const recoversToMax = attr.recuperation === 'max';
    if (found?.primaryVital && recoversToMax && a <= 0 && b > 0)
      return { type: 'mort', text: `${who} a succombé à ses blessures !` };
    const harmful = recoversToMax ? diff < 0 : diff > 0;
    if (character?.side !== 'players')
      return { type: 'combat', text: `${who} a été ${harmful ? 'attaqué' : 'soigné'}.` };
    const verb = recoversToMax ? (harmful ? 'perdu' : 'récupéré') : harmful ? 'subi' : 'guéri de';
    return { type: 'combat', text: `${who} a ${bold(verb)} ${Math.abs(diff)} ${label}.` };
  }

  if (a !== null && b !== null && hasBefore) {
    if (a === b) return null;
    const progression = attr?.nature === 'base' && attr.saisie === 'mj' && a > b;
    return {
      type: progression ? 'niveau' : 'stats',
      text: `${who} : ${label} passe de ${b} à ${bold(a)}${progression ? ' !' : '.'}`,
    };
  }
  if (hasBefore && show(before) === show(after)) return null;
  return { type: 'stats', text: `${who} : ${label} devient ${bold(show(after))}.` };
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

/**
 * États et entrées donnés ou retirés d'un coup (application du combat, annulation) : lus dans
 * le diff, chemin `etat.possessions[entree#exemplaire]` et `etat.bonus[id]` (état libre).
 */
function possessionLines(ctx: FormatContext, who: string, changes: Change[] | null): Line[] {
  const lines: Line[] = [];
  for (const c of changes ?? []) {
    const m = POSSESSION_PATH.exec(c.path);
    if (m && m[2] === undefined) {
      const name = bold(entryName(ctx, unquote(m[1]!).split('#')[0]));
      if (!('before' in c) || c.before == null) {
        const duration = num(obj(c.after)?.duree);
        lines.push({
          type: 'combat',
          text:
            duration !== null
              ? `${who} est ${name} (${duration} round${duration > 1 ? 's' : ''}).`
              : `${who} reçoit ${name}.`,
        });
      } else if (!('after' in c) || c.after == null)
        lines.push({ type: 'combat', text: `${who} n'est plus ${name}.` });
      continue;
    }
    const b = BONUS_PATH.exec(c.path);
    if (b && c.path.endsWith(']')) {
      const before = obj(c.before);
      const after = obj(c.after);
      if (after && !before)
        lines.push({ type: 'combat', text: `${who} est ${bold(str(after.nom) ?? 'un état')}.` });
      else if (before && !after)
        lines.push({
          type: 'combat',
          text: `${who} n'est plus ${bold(str(before.nom) ?? 'un état')}.`,
        });
    }
  }
  return lines;
}

// ─── Formateurs par type ─────────────────────────────────────────────────────

type Formatted = Omit<GameEvent, 'id' | 'seq' | 'source' | 'timestamp'>;
type Formatter = (e: HistoryEvent, ctx: FormatContext) => Formatted | null;

function characterUpdated(e: HistoryEvent, ctx: FormatContext): Formatted | null {
  const p = e.payload;
  const id = e.aggregate.id;
  const character = characterOf(ctx, id);
  const who = bold(characterName(ctx, id));
  const op = str(p.operation) ?? '';
  const changes = readChanges(p);
  const entityType = character?.type ?? null;
  const base = characterFields(ctx, id);
  const line = (type: EventType, message: string): Formatted => ({ ...base, type, message });

  switch (op) {
    case 'profil': {
      const nameChange = changes?.find((c) => c.path === 'nom');
      const newName = str(nameChange?.after) ?? str(detail(p, 'nom'));
      if (!newName) return null; // avatar seul
      const oldName = str(nameChange?.before);
      return line(
        'info',
        oldName
          ? `${bold(oldName)} s'appelle désormais ${bold(newName)}.`
          : `${bold(newName)} change de nom.`,
      );
    }
    case 'creation.terminer':
      return line('creation', `${who} a terminé sa création.`);
    case 'possession': {
      const possession = obj(detail(p, 'possession'));
      const entree = str(possession?.entree);
      const item = bold(`[${entryName(ctx, entree)}]`);
      // Possession à durée : état temporaire (Aveuglé, Étourdi…), comme les conditions du combat
      if (num(possession?.duree) !== null)
        return line('combat', `${who} est ${bold(entryName(ctx, entree))}.`);
      if (detail(p, 'cree') === true) {
        const qty = num(possession?.quantite) ?? 1;
        return line(
          'inventaire',
          `${who} a reçu ${bold(`${qty}x [${entryName(ctx, entree)}]`)} dans son inventaire.`,
        );
      }
      for (const c of changes ?? []) {
        const m = POSSESSION_PATH.exec(c.path);
        if (!m) continue;
        if (m[2] === 'quantite') {
          const diff = (num(c.after) ?? 1) - (num(c.before) ?? 1);
          if (diff)
            return line(
              'inventaire',
              `${who} a ${bold(diff > 0 ? 'reçu' : 'perdu')} ${Math.abs(diff)}x ${item}.`,
            );
        }
        if (m[2] === 'actif' && typeof c.after === 'boolean')
          return line('inventaire', `${who} a ${c.after ? 'équipé' : 'rangé'} ${item}.`);
      }
      return line('inventaire', `${who} a modifié ${item}.`);
    }
    case 'possession.retrait':
      return line(
        'inventaire',
        `${who} a jeté/perdu ${bold(`[${entryName(ctx, str(detail(p, 'entree')))}]`)}.`,
      );
    case 'achat':
    case 'remboursement': {
      const ligne = obj(detail(p, 'ligne'));
      // Achats de la création : l'événement « a terminé sa création » les résume
      if (!ligne || ligne.creation === true) return null;
      const name = bold(purchaseName(ctx, entityType, str(ligne.objet) ?? '?'));
      return op === 'achat'
        ? line('competence', `${who} a acquis ${name}.`)
        : line('competence', `${who} a renoncé à ${name}.`);
    }
    case 'bonus': {
      const nom = str(obj(detail(p, 'bonus'))?.nom);
      return line('stats', `${who} bénéficie de ${bold(nom ?? 'un bonus')}.`);
    }
    case 'bonus.retrait': {
      const nom = bonusName(changes, str(detail(p, 'bonusId')) ?? '');
      return line('stats', `${who} perd ${bold(nom ?? 'un bonus')}.`);
    }
    case 'effet': {
      // Effets coupés ou réactivés un à un (bloc Bonus) ; une demande sans effet ne se dit pas
      if (detail(p, 'change') === false) return null;
      const sources = detail(p, 'sources');
      const noms = (Array.isArray(sources) ? sources : [])
        .filter((x): x is string => typeof x === 'string')
        .map((x) => `[${entryName(ctx, x.split('#')[0])}]`);
      const de = noms.length ? ` de ${bold(noms.join(', '))}` : '';
      return line(
        'stats',
        `${who} a ${detail(p, 'actif') === true ? 'réactivé' : 'désactivé'} des bonus${de}.`,
      );
    }
    case 'durees.decompte': {
      const retirees = detail(p, 'retirees');
      const names = (Array.isArray(retirees) ? retirees : [])
        .filter((r): r is string => typeof r === 'string')
        .map((r) =>
          r.startsWith('bonus:')
            ? (bonusName(changes, r.slice(6)) ?? 'un bonus')
            : entryName(ctx, r.split('#')[0]),
        );
      if (!names.length) return null;
      return line('combat', `${who} n'est plus ${names.map(bold).join(', ')}.`);
    }
    // Décision du MJ appliquée par le combat (docs/combat.md § 7.2) : valeurs et états touchés
    case 'combat.application': {
      const c = combine([
        ...valueLines(ctx, who, character, p, changes),
        ...possessionLines(ctx, who, changes),
      ]);
      return c && line(c.type, c.text);
    }
    // Annulation : d'une application (MJ), ou des durées d'un round (« Précédent », `tick:…`)
    case 'combat.annulation': {
      const c = combine([
        ...valueLines(ctx, who, character, p, changes),
        ...possessionLines(ctx, who, changes),
      ]);
      if (!c) return null;
      const round = str(detail(p, 'applicationId'))?.startsWith('tick:') === true;
      const forced = detail(p, 'forced') === true;
      return line(
        'combat',
        `${round ? 'Retour au tour précédent' : `Annulation du MJ${forced ? ' (forcée)' : ''}`} : ${c.text}`,
      );
    }
    case 'repos': {
      const rest = combine([
        { type: 'stats', text: `${who} a pris du repos.` },
        ...valueLines(ctx, who, character, p, changes),
      ]);
      return rest && line('stats', rest.text);
    }
    default: {
      // Étapes de création, import : l'événement de fin de création les résume
      if (op.startsWith('creation.') || op === 'ajouter') return null;
      const c = combine(valueLines(ctx, who, character, p, changes));
      return c && line(c.type, c.text);
    }
  }
}

// ─── Attaques (docs/combat.md § 7.7, § 10) ───────────────────────────────────

/** Issue d'une cible, en mots de l'ancienne page d'attaque. */
function outcomeWord(o: unknown): string | null {
  const outcome = obj(o);
  if (!outcome || typeof outcome.success !== 'boolean') return null;
  if (outcome.success) return outcome.critical === true ? 'critique' : 'touché';
  return outcome.fumble === true ? 'échec critique' : 'raté';
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
  return parts.length ? parts.join(', ') : 'aucun symbole net';
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
    if (mod.operation === 'remove') return `sans ${name}`;
    const duration = num(mod.duration);
    return duration ? `${name} (${duration} round${duration > 1 ? 's' : ''})` : name;
  }
  const key = str(mod.attribute);
  const value = num(mod.value);
  if (!key || value === null) return null;
  const attr = attributeOf(ctx, entityType, key)?.attr;
  if (attr?.visibilite === 'mj' && !ctx.viewerIsGm) return null;
  const sign = mod.operation === 'subtract' ? '−' : mod.operation === 'add' ? '+' : '= ';
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
  return id ? bold(characterName(ctx, id)) : 'Un adversaire';
}

/** « de **Orc** », ou rien quand l'attaquant n'est pas connu. */
const ofAttacker = (ctx: FormatContext, id: string | null) =>
  id ? ` de ${bold(characterName(ctx, id))}` : '';

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
    const action = str(obj(p.action)?.name) ?? 'une attaque';
    const targets = listOf(p.targets).map((t) => {
      const outcome = outcomeWord(t.outcome);
      return `${bold(characterName(ctx, str(t.characterId)))}${outcome ? ` : ${bold(outcome)}` : ''}`;
    });
    return {
      ...characterFields(ctx, attackerId),
      type: 'combat',
      message: `${attackerName(ctx, attackerId)} utilise ${bold(action)}${
        targets.length ? ` contre ${targets.join(' ; ')}` : ''
      }.`,
    };
  },

  // Décision du MJ racontée à la table : montants du camp des joueurs seulement (serveur)
  'combat.attack_concluded': (e, ctx) => {
    const p = e.payload;
    const attackerId = str(p.attackerId);
    const parts = listOf(p.targets).flatMap((t) => {
      const id = str(t.characterId);
      const who = bold(characterName(ctx, id));
      if (t.decision === 'skipped') return [`${who} : sans effet`];
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
      message: `Attaque${attackerId ? ofAttacker(ctx, attackerId) : ' d’un adversaire'} appliquée : ${parts.join(' ; ')}.`,
    };
  },

  // Rapport complet (MJ) : dés, issue, valeurs proposées par cible
  'combat.attack_resolved': gmOnly((e, ctx) => {
    const attack = obj(e.payload.attack);
    if (!attack) return null;
    const attackerId = str(attack.attackerId);
    const action = str(obj(attack.action)?.name) ?? 'une attaque';
    const parts = listOf(attack.targets).map((t) => {
      const id = str(t.characterId);
      const who = bold(characterName(ctx, id));
      const error = str(t.error);
      if (t.status === 'failed') return `${who} : refusé${error ? ` (${error})` : ''}`;
      const result = obj(t.result);
      const outcome = outcomeWord(result?.outcome);
      const roll = rollText(ctx, result?.roll);
      const mods = modificationsText(
        ctx,
        characterOf(ctx, id)?.type ?? null,
        result?.modifications,
      );
      return `${who} : ${[outcome ? bold(outcome) : null, roll ? `jet ${roll}` : null, mods]
        .filter(Boolean)
        .join(', ')}`;
    });
    return {
      ...characterFields(ctx, attackerId),
      type: 'combat',
      message: `${attackerName(ctx, attackerId)} utilise ${bold(action)}${
        parts.length ? ` : ${parts.join(' ; ')}` : ''
      }.`,
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
      if (t.decision === 'skipped') return `${who} : non appliqué`;
      if (t.decision !== 'applied') return `${who} : en attente`;
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
      return `${who}${redirected ? ' (réattribué)' : ''}${detailText ? ` : ${detailText}` : ''}`;
    });
    const note = str(p.note);
    return {
      ...characterFields(ctx, attackerId),
      type: 'combat',
      message: `Le MJ ${applied.length ? 'applique' : 'écarte'} l’attaque${ofAttacker(
        ctx,
        attackerId,
      )}${parts.length ? ` : ${parts.join(' ; ')}` : ''}.${note ? ` « ${note} »` : ''}`,
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
      message: `Application annulée${p.forced === true ? ' (forcée)' : ''} : attaque${ofAttacker(
        ctx,
        attackerId,
      )}${names.length ? ` sur ${names.join(', ')}` : ''}${p.actor === true ? ', coûts de l’attaquant rendus' : ''}.`,
    };
  }),

  'combat.participant_defeated': gmOnly((e, ctx) => {
    const id = str(e.payload.characterId);
    return {
      ...characterFields(ctx, id),
      type: 'mort',
      message: `${bold(characterName(ctx, id))} est hors de combat !`,
    };
  }),
};

const FORMATTERS: Record<string, Formatter> = {
  'character.updated': characterUpdated,

  'character.created': (e, ctx) => ({
    ...characterFields(ctx, e.aggregate.id, str(e.payload.nom)),
    type: 'creation',
    message: `Création de ${bold(characterName(ctx, e.aggregate.id, str(e.payload.nom)))}.`,
  }),

  'character.deleted': (e, ctx) => ({
    ...characterFields(ctx, e.aggregate.id),
    type: 'info',
    message: `Disparition de : ${bold(characterName(ctx, e.aggregate.id))}.`,
  }),

  'character.action_resolved': (e, ctx) => {
    const p = e.payload;
    const actorId = e.aggregate.id;
    const action = str(p.action) ?? 'action';
    const actionName = ctx.system?.actions.get(action)?.nom ?? action;
    const targetId = str(p.cibleId);
    const onOther = !!targetId && lower(targetId) !== lower(actorId);
    const reussi = obj(p.resultat)?.reussi;
    const outcome = typeof reussi === 'boolean' ? ` : ${bold(reussi ? 'réussite' : 'échec')}` : '';
    return {
      ...characterFields(ctx, actorId),
      type: onOther ? 'combat' : 'competence',
      message: `${bold(characterName(ctx, actorId))} utilise ${bold(actionName)}${
        onOther ? ` sur ${bold(characterName(ctx, targetId))}` : ''
      }${outcome}.`,
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
    const result = symbols ? bold(symbols) : total !== null ? bold(total) : null;
    const critical =
      outcome?.critical === true
        ? ` ${bold('Réussite critique !')}`
        : outcome?.fumble === true
          ? ` ${bold('Échec critique !')}`
          : '';
    return {
      ...characterFields(ctx, characterId, author),
      type: 'competence',
      message: `${bold(author)} lance ${
        label ? `${bold(label)}${notation ? ` (${notation})` : ''}` : (notation ?? 'les dés')
      }${result ? ` : ${result}` : ''}.${critical}`,
      // Jet d'une action : la ligne de l'action le résume dans le Journal
      hiddenFromTimeline: str(p.source) === 'action',
    };
  },

  'combat.started': (e) => {
    const count = Array.isArray(e.payload.participants) ? e.payload.participants.length : 0;
    return {
      type: 'combat',
      message: count ? `Le combat commence (${bold(count)} combattants) !` : 'Le combat commence !',
    };
  },

  'combat.turn_changed': (e, ctx) => {
    const p = e.payload;
    if (p.reason === 'previous')
      return {
        type: 'combat',
        message:
          num(p.round) !== null
            ? `Retour au tour précédent (round ${bold(num(p.round)!)}).`
            : 'Retour au tour précédent.',
      };
    if (p.reason === 'turn_set') {
      const actor = str(p.currentActorId);
      return {
        ...characterFields(ctx, actor),
        type: 'combat',
        message: actor
          ? `Le MJ donne la main à ${bold(characterName(ctx, actor))}.`
          : 'Le MJ passe la main.',
      };
    }
    if (p.reason === 'participants_added') {
      // `added` ne part qu'aux MJ : un joueur ne sait pas qui a rejoint (PNJ caché)
      const added = (Array.isArray(p.added) ? p.added : []).filter(
        (id): id is string => typeof id === 'string',
      );
      if (!added.length) return null;
      return {
        type: 'combat',
        message: `${added.map((id) => bold(characterName(ctx, id))).join(', ')} ${
          added.length > 1 ? 'rejoignent' : 'rejoint'
        } le combat.`,
      };
    }
    if (p.reason === 'initiative') {
      const order = (Array.isArray(p.order) ? p.order : [])
        .map((o) => str(obj(o)?.characterId))
        .filter((id): id is string => !!id)
        .map((id) => bold(characterName(ctx, id)));
      return {
        type: 'combat',
        message: order.length ? `Initiative : ${order.join(', ')}.` : 'Initiative lancée.',
      };
    }
    if (p.reason === 'new_round' && num(p.round) !== null)
      return { type: 'combat', message: `Début du round ${bold(num(p.round)!)}.` };
    // Tour suivant, participants retirés : trop fréquents pour le Journal
    return null;
  },

  'combat.ended': (e) => {
    const round = num(e.payload.round);
    return {
      type: 'combat',
      message: round && round > 1 ? `Fin du combat après ${bold(round)} rounds.` : 'Fin du combat.',
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
      message: `${bold(name)} a rejoint la campagne.`,
    };
  },

  'campaign.member_left': (e, ctx) => {
    const p = e.payload;
    const id = str(p.userId) ?? e.actor.userId;
    const name = userName(ctx, id);
    const how =
      p.banned === true
        ? 'a été banni de la campagne'
        : p.kicked === true
          ? 'a été exclu de la campagne'
          : 'a quitté la campagne';
    return {
      characterName: name,
      characterAvatar: (id && ctx.users.get(lower(id))?.avatarUrl) || undefined,
      type: 'info',
      message: `${bold(name)} ${how}.`,
    };
  },

  'campaign.character_added': (e, ctx) => {
    const id = str(e.payload.characterId);
    const name = characterName(ctx, id, str(e.payload.name));
    return {
      ...characterFields(ctx, id, name),
      type: 'creation',
      message: `Apparition de : ${bold(name)}.`,
    };
  },

  'campaign.character_removed': (e, ctx) => {
    const id = str(e.payload.characterId);
    return {
      ...characterFields(ctx, id),
      type: 'info',
      message: `Disparition de : ${bold(characterName(ctx, id))}.`,
    };
  },

  'campaign.character_played': (e, ctx) => {
    const id = str(e.payload.characterId);
    const player = bold(userName(ctx, str(e.payload.userId) ?? e.actor.userId));
    return {
      ...characterFields(ctx, id),
      type: 'info',
      message: id
        ? `${player} incarne ${bold(characterName(ctx, id))}.`
        : `${player} n'incarne plus de personnage.`,
    };
  },

  'token.created': (e, ctx) => {
    const id = str(e.payload.characterId);
    if (!id) return null;
    return {
      ...characterFields(ctx, id),
      type: 'creation',
      message: `Apparition de : ${bold(characterName(ctx, id))}.`,
    };
  },

  'token.deleted': (e, ctx) => {
    const id = str(e.payload.characterId);
    if (!id) return null;
    return {
      ...characterFields(ctx, id),
      type: 'info',
      message: `Disparition de : ${bold(characterName(ctx, id))}.`,
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
      message: name ? `Le groupe se rend à ${bold(name)}.` : 'Le groupe change de lieu.',
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
    // Avatar retiré à l'import (base64) : celui de la fiche, s'il est connu
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

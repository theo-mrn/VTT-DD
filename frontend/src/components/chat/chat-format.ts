/**
 * Mise en forme de la discussion, sans React : texte enrichi (mentions `@Nom`, liens),
 * fil groupé par jour et par auteur, libellés des destinataires, saisie des mentions.
 */
import type { ChatMessage, ChatRecipients } from '@/lib/campaign-chat';
import { compareCodeUnits } from '@vtt/contracts';

// ─── Personnes ───────────────────────────────────────────────────────────────

/** Membre de la table tel que la discussion le montre. */
export interface ChatPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: 'gm' | 'player' | 'spectator';
  /** Personnage incarné, pour situer qui parle. */
  characterName: string | null;
}

/** Minuscules sans accents : « Élodie » se trouve en tapant « elo ». */
export const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr');

// ─── Texte enrichi ───────────────────────────────────────────────────────────

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; userId: string }
  | { kind: 'link'; text: string; href: string };

const LINK = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}]/giu;
const WORD = /[\p{L}\p{N}_]/u;

/** Découpe les liens `http(s)://` d'un texte. */
function splitLinks(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    out.push({ kind: 'link', text: m[0], href: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/**
 * Texte d'un message en segments : mentions `@Nom` d'un membre (nom exact, sans casse ni
 * accents, le plus long d'abord : « @Anne Marie » avant « @Anne »), liens, texte.
 */
export function parseBody(body: string, people: readonly ChatPerson[]): Segment[] {
  const names = people
    .filter((p) => p.name.trim())
    .map((p) => ({ id: p.id, key: normalize(p.name) }))
    .sort((a, b) => b.key.length - a.key.length);
  const flat = normalize(body);
  // La normalisation garde la longueur des lettres courantes ; sinon, pas de mention
  const aligned = flat.length === body.length;
  const out: Segment[] = [];
  let text = '';
  let i = 0;
  while (i < body.length) {
    const before = i === 0 ? '' : body[i - 1]!;
    if (aligned && body[i] === '@' && !WORD.test(before)) {
      const found = names.find(
        (n) => flat.startsWith(n.key, i + 1) && !WORD.test(body[i + 1 + n.key.length] ?? ' '),
      );
      if (found) {
        if (text) out.push(...splitLinks(text));
        text = '';
        out.push({
          kind: 'mention',
          text: body.slice(i, i + 1 + found.key.length),
          userId: found.id,
        });
        i += 1 + found.key.length;
        continue;
      }
    }
    text += body[i];
    i += 1;
  }
  if (text) out.push(...splitLinks(text));
  return out;
}

export const mentions = (segments: readonly Segment[], userId: string) =>
  segments.some((s) => s.kind === 'mention' && s.userId === userId);

/**
 * Mention en cours de frappe juste avant le curseur (`@` en début de mot, sans espace
 * depuis) : sa position et ce qui est déjà tapé.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(?:^|[^\p{L}\p{N}_])@([^\s@]{0,32})$/u.exec(before);
  if (!m) return null;
  return { start: caret - m[1]!.length - 1, query: m[1]! };
}

/** Membres proposés pour une mention : le début du nom d'abord, puis n'importe quel mot. */
export function mentionCandidates(
  people: readonly ChatPerson[],
  query: string,
  exclude: string,
): ChatPerson[] {
  const q = normalize(query);
  const scored = people
    .filter((p) => p.id !== exclude && p.name.trim())
    .map((p) => {
      const name = normalize(p.name);
      const rank = name.startsWith(q) ? 0 : name.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : -1;
      return { p, rank };
    })
    .filter((x) => x.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.p.name.localeCompare(b.p.name, 'fr'));
  return scored.slice(0, 6).map((x) => x.p);
}

// ─── Destinataires ───────────────────────────────────────────────────────────

function listeFr(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} et ${items.at(-1)}`;
}

/** « Chuchoté à vous et Bob », « Chuchoté au MJ »… du point de vue de `me`. */
export function audienceLabel(
  recipients: ChatRecipients,
  me: string,
  nameOf: (id: string, fallback: string | null) => string,
): string {
  const names = recipients.users.map((u) => (u.id === me ? 'vous' : nameOf(u.id, u.name)));
  // « vous » en tête
  names.sort((a, b) => (a === 'vous' ? -1 : b === 'vous' ? 1 : 0));
  if (recipients.gm) names.push('MJ');
  if (names.length === 1 && names[0] === 'MJ') return 'Chuchoté au MJ';
  const texte = listeFr(names.map((n) => (n === 'MJ' ? 'le MJ' : n)));
  return `Chuchoté à ${texte}`;
}

/** Clé d'auditoire : deux messages ne se groupent que s'ils ont les mêmes destinataires. */
export const audienceKey = (r: ChatRecipients | null) =>
  r
    ? `w:${r.gm ? 'gm' : ''}:${r.users
        .map((u) => u.id)
        .sort(compareCodeUnits)
        .join(',')}`
    : 'all';

// ─── Dates ───────────────────────────────────────────────────────────────────

const HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const JOUR = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const JOUR_ANNEE = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const COMPLET = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' });

export const formatTime = (d: Date) => HEURE.format(d);
export const formatFull = (d: Date) => COMPLET.format(d);

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function dayLabel(d: Date, now = new Date()): string {
  const hier = new Date(now);
  hier.setDate(hier.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return 'Aujourd’hui';
  if (dayKey(d) === dayKey(hier)) return 'Hier';
  const texte = (d.getFullYear() === now.getFullYear() ? JOUR : JOUR_ANNEE).format(d);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

// ─── Fil ─────────────────────────────────────────────────────────────────────

/** Écart au-delà duquel deux messages d'un même auteur ne se groupent plus. */
const GROUP_GAP_MS = 5 * 60_000;

/** Message du fil : envoyé, ou en attente côté client (envoi en cours ou échoué). */
export interface ThreadMessage {
  /** Id du serveur, ou id local pour un envoi en attente. */
  key: string;
  message: ChatMessage;
  pending?: { status: 'sending' | 'waiting' | 'failed'; error: string | null };
}

export type ThreadItem =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'unread'; key: string }
  | { kind: 'message'; key: string; item: ThreadMessage; first: boolean };

/**
 * Fil affiché : séparateurs de jour, repère « Nouveaux messages » avant `unreadFrom`, et
 * messages groupés (même auteur, mêmes destinataires, même jour, moins de 5 minutes d'écart).
 */
export function buildThread(
  messages: readonly ThreadMessage[],
  unreadFrom: string | null,
  now = new Date(),
): ThreadItem[] {
  const out: ThreadItem[] = [];
  let prev: ThreadMessage | null = null;
  let prevDay = '';
  for (const t of messages) {
    const at = new Date(t.message.createdAt);
    const day = dayKey(at);
    let first = true;
    if (day !== prevDay) {
      out.push({ kind: 'day', key: `day-${day}`, label: dayLabel(at, now) });
      prevDay = day;
    } else if (
      prev &&
      prev.message.author.id === t.message.author.id &&
      audienceKey(prev.message.recipients) === audienceKey(t.message.recipients) &&
      at.getTime() - new Date(prev.message.createdAt).getTime() < GROUP_GAP_MS
    ) {
      first = false;
    }
    if (unreadFrom && t.key === unreadFrom) {
      out.push({ kind: 'unread', key: 'unread' });
      first = true;
    }
    out.push({ kind: 'message', key: t.key, item: t, first });
    prev = t;
  }
  return out;
}

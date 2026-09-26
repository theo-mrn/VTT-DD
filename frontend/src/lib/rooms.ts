/**
 * Salles de jeu (service campaign), selon le contrat de docs/api-campaign.md :
 * salles et membres, parité avec l'ancienne app (code, image, joueurs max,
 * publique, création de personnages), bannis, sessions, discussion et
 * personnages engagés dans la salle.
 */
import { api, ApiError } from './api';
import { checkImage } from './profile';

export type RoomRole = 'mj' | 'joueur' | 'spectateur';
export type Camp = 'joueurs' | 'adversaires' | 'allies';

export interface RoomOwner {
  id: string;
  nom: string | null;
  avatarUrl: string | null;
}

/** Champs communs aux listes (mes salles, campagnes publiques). */
export interface RoomSummary {
  id: string;
  nom: string;
  description?: string;
  /** Mon rôle ; null dans les campagnes publiques dont je ne suis pas membre. */
  role?: RoomRole | null;
  systeme: { id: string; version: string };
  /** Nombre de membres, MJ compris. */
  membres?: number;
  /** Places occupées : membres qui ne sont pas MJ (spectateurs compris). */
  joueurs?: number;
  code?: string;
  imageUrl?: string | null;
  maxJoueurs?: number;
  publique?: boolean;
  creationPersonnages?: boolean;
  proprietaire?: RoomOwner;
  proprietaireId?: string;
  /** Campagne publique pleine. */
  complete?: boolean;
  updatedAt?: string;
}

export interface RoomMember {
  userId: string;
  nom: string | null;
  avatarUrl: string | null;
  role: RoomRole;
}

/** GET /v1/rooms/:id : la liste des membres remplace leur nombre. */
export interface RoomDetail extends Omit<RoomSummary, 'membres'> {
  description: string;
  role: RoomRole;
  proprietaireId: string;
  membres: RoomMember[];
  personnages: {
    characterId: string;
    ownerId: string;
    camp: Camp;
    ajoutePar?: string;
    incarnePar?: string | null;
  }[];
  /** Personnage que j'incarne dans cette salle. */
  personnageIncarne?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** GET /v1/rooms/:id/personnages */
export interface RoomCharacter {
  characterId: string;
  /** Vide si le service character est injoignable ou si le personnage n'existe plus. */
  nom: string;
  avatarUrl: string | null;
  type: string;
  camp: Camp;
  proprietaireId: string;
  incarnePar: string | null;
  creation: boolean;
}

export interface RoomSession {
  id: string;
  date: string;
  titre?: string | null;
}

export interface RoomMessage {
  id: string;
  auteur: { id: string; nom: string | null; avatarUrl: string | null };
  texte: string;
  createdAt: string;
}

export interface BannedUser {
  userId: string;
  nom: string | null;
  avatarUrl: string | null;
}

export interface Invitation {
  code: string;
  url: string;
  expireLe: string | null;
}

export interface RoomCreation {
  nom: string;
  systemeId: string;
  description?: string;
  maxJoueurs?: number;
  publique?: boolean;
  creationPersonnages?: boolean;
}

export type RoomUpdate = Partial<
  Pick<RoomCreation, 'nom' | 'description' | 'maxJoueurs' | 'publique' | 'creationPersonnages'>
> & { imageUrl?: string | null };

const room = (id: string, suffix = '') => `/v1/rooms/${encodeURIComponent(id)}${suffix}`;

/** Une liste paginée peut arriver nue ou dans une enveloppe : on en tire les éléments. */
function items<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === 'object') {
    for (const k of ['items', 'salles', 'resultats', 'data'])
      if (Array.isArray((r as Record<string, unknown>)[k]))
        return (r as Record<string, T[]>)[k] as T[];
  }
  return [];
}

// ─── Salles ──────────────────────────────────────────────────────────────────

export function listRooms(role?: 'mj' | 'joueur') {
  return api<RoomSummary[]>(`/v1/rooms${role ? `?role=${role}` : ''}`);
}

export interface PublicRoomsPage {
  salles: RoomSummary[];
  page: number;
  parPage: number;
  total: number;
}

/** Campagnes publiques, 20 par page, les plus récemment modifiées d'abord. */
export async function listPublicRooms(search = '', page = 1): Promise<PublicRoomsPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (search.trim()) params.set('search', search.trim());
  const r = await api<unknown>(`/v1/rooms/publiques?${params}`);
  const salles = items<RoomSummary>(r);
  const meta = (Array.isArray(r) ? {} : (r ?? {})) as Partial<PublicRoomsPage>;
  return {
    salles,
    page: meta.page ?? page,
    parPage: meta.parPage ?? salles.length,
    total: meta.total ?? salles.length,
  };
}

export function getRoom(id: string) {
  return api<RoomDetail>(room(id));
}

export function createRoom(body: RoomCreation) {
  return api<RoomDetail>('/v1/rooms', { method: 'POST', body: JSON.stringify(body) });
}

export function updateRoom(id: string, body: RoomUpdate) {
  return api<RoomDetail>(room(id), { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteRoom(id: string) {
  return api<void>(room(id), { method: 'DELETE' });
}

/** Rejoint une salle par son code ou un code d'invitation. */
export function joinRoom(code: string) {
  return api<RoomSummary>('/v1/rooms/rejoindre', {
    method: 'POST',
    body: JSON.stringify({ code: code.trim() }),
  });
}

/** Message de refus lisible, comme dans l'ancienne app. */
export function joinErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.problem.code) {
      case 'banni':
        return 'Vous avez été banni de cette salle.';
      case 'salle_complete':
        return 'Désolé, cette salle a atteint sa limite de joueurs.';
      case 'salle_introuvable':
        return 'Aucune salle trouvée avec ce code';
      case 'invitation_expiree':
        return 'Cette invitation a expiré.';
      case 'invitation_epuisee':
        return 'Cette invitation a déjà servi le nombre de fois prévu.';
    }
    if (err.status === 404) return 'Aucune salle trouvée avec ce code';
    return err.message || 'Erreur lors de la connexion à la salle';
  }
  return 'Erreur lors de la connexion à la salle';
}

export function createInvitation(id: string) {
  return api<Invitation>(room(id, '/invitations'), { method: 'POST', body: '{}' });
}

/** Envoie l'image de la salle : URL présignée, dépôt direct, puis enregistrement. */
export async function uploadRoomImage(id: string, file: File) {
  const invalid = checkImage(file);
  if (invalid) throw new ApiError({ status: 422, title: invalid });
  const { uploadUrl, publicUrl } = await api<{ uploadUrl: string; publicUrl: string }>(
    room(id, '/image'),
    { method: 'POST', body: JSON.stringify({ contentType: file.type, size: file.size }) },
  );
  let upload: Response;
  try {
    upload = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    });
  } catch {
    throw new ApiError({ status: 0, title: "L'envoi de l'image vers le stockage a échoué." });
  }
  if (!upload.ok)
    throw new ApiError({
      status: upload.status,
      title: `Le stockage a refusé l'image (${upload.status}).`,
    });
  return updateRoom(id, { imageUrl: publicUrl });
}

// ─── Membres et bannis ───────────────────────────────────────────────────────

/** Exclut un membre (MJ), le bannit avec `ban`, ou quitte la salle (soi-même). */
export function removeMember(id: string, userId: string, ban = false) {
  return api<void>(room(id, `/membres/${encodeURIComponent(userId)}${ban ? '?bannir=true' : ''}`), {
    method: 'DELETE',
  });
}

export async function listBanned(id: string) {
  const r = items<BannedUser & { id?: string }>(await api<unknown>(room(id, '/bannis')));
  return r.map((b) => ({ ...b, userId: b.userId ?? b.id ?? '' }));
}

export function unban(id: string, userId: string) {
  return api<void>(room(id, `/bannis/${encodeURIComponent(userId)}`), { method: 'DELETE' });
}

// ─── Sessions et discussion ──────────────────────────────────────────────────

export async function listSessions(id: string) {
  return items<RoomSession>(await api<unknown>(room(id, '/sessions')));
}

export function addSession(id: string, date: Date, title?: string) {
  return api<RoomSession>(room(id, '/sessions'), {
    method: 'POST',
    body: JSON.stringify({ date: date.toISOString(), ...(title ? { titre: title } : {}) }),
  });
}

export function deleteSession(id: string, sessionId: string) {
  return api<void>(room(id, `/sessions/${encodeURIComponent(sessionId)}`), { method: 'DELETE' });
}

export async function listMessages(id: string, limit = 50) {
  const list = items<RoomMessage>(await api<unknown>(room(id, `/messages?limite=${limit}`)));
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function sendMessage(id: string, text: string) {
  return api<RoomMessage>(room(id, '/messages'), {
    method: 'POST',
    body: JSON.stringify({ texte: text }),
  });
}

export function deleteMessage(id: string, messageId: string) {
  return api<void>(room(id, `/messages/${encodeURIComponent(messageId)}`), { method: 'DELETE' });
}

// ─── Personnages de la salle ─────────────────────────────────────────────────

type RawRoomCharacter = Omit<RoomCharacter, 'nom' | 'type'> & {
  nom: string | null;
  type: string | null;
};

/** `nom` et `type` valent null quand character ne répond pas : on garde des chaînes. */
const roomCharacters = (r: unknown): RoomCharacter[] =>
  items<RawRoomCharacter>(r).map((c) => ({
    ...c,
    nom: c.nom ?? 'Personnage indisponible',
    type: c.type ?? '',
  }));

export async function listRoomCharacters(id: string) {
  return roomCharacters(await api<unknown>(room(id, '/personnages')));
}

export function engageCharacter(id: string, characterId: string, camp?: Camp) {
  return api<unknown>(room(id, '/personnages'), {
    method: 'POST',
    body: JSON.stringify({ characterId, ...(camp ? { camp } : {}) }),
  });
}

export function removeRoomCharacter(id: string, characterId: string) {
  return api<void>(room(id, `/personnages/${encodeURIComponent(characterId)}`), {
    method: 'DELETE',
  });
}

/**
 * Incarne un personnage engagé (null : aucun, le MJ mène la partie) ;
 * renvoie les personnages engagés à jour.
 */
export async function playCharacter(id: string, characterId: string | null) {
  return roomCharacters(
    await api<unknown>(room(id, '/moi/personnage'), {
      method: 'PUT',
      body: JSON.stringify({ characterId }),
    }),
  );
}

/** Nombre de joueurs d'une salle (MJ non compris), selon les champs fournis. */
export function playerCount(r: RoomSummary): number {
  if (typeof r.joueurs === 'number') return r.joueurs;
  if (typeof r.membres === 'number') return Math.max(0, r.membres - 1);
  return 0;
}

/** Vrai si l'utilisateur a créé la salle. */
export function ownsRoom(r: RoomSummary, userId: string): boolean {
  const owner = r.proprietaire?.id ?? r.proprietaireId;
  return owner ? owner.toLowerCase() === userId.toLowerCase() : r.role === 'mj';
}

/**
 * Où mène la fin de la création : la table de la salle d'où elle a été
 * ouverte (`?room=`), sinon la fiche.
 */
export function afterCreationPath(characterId: string, roomId: string | null): string {
  return roomId
    ? `/campaigns/${encodeURIComponent(roomId)}/play`
    : `/characters/${encodeURIComponent(characterId)}`;
}

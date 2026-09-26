/**
 * Campagnes (service campaign), selon le contrat de docs/api-campaign.md :
 * campagnes et membres, parité avec l'ancienne app (code, image, joueurs max,
 * publique, création de personnages), bannis, sessions, discussion et
 * personnages engagés dans la campagne.
 */
import { api, ApiError } from './api';
import { checkImage } from './profile';

export type CampaignRole = 'gm' | 'player' | 'spectator';
export type Side = 'players' | 'enemies' | 'allies';

export interface UserRef {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

/** Champs communs aux listes (mes campagnes, campagnes publiques) et au détail. */
export interface CampaignFields {
  id: string;
  name: string;
  description: string;
  system: { id: string; version: string };
  code: string;
  imageUrl: string | null;
  isPublic: boolean;
  characterCreation: boolean;
  /** Joueurs : membres qui ne sont pas MJ (spectateurs compris). */
  playerCount: number;
  owner: UserRef;
  updatedAt: string;
}

/** Campagne d'une liste ; `role` vaut null dans les campagnes publiques dont je ne suis pas membre. */
export interface CampaignSummary extends CampaignFields {
  role: CampaignRole | null;
  /** Nombre de membres, MJ compris. */
  memberCount: number;
}

export interface CampaignMember {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  role: CampaignRole;
}

/** GET /v1/campaigns/:id : les membres et les personnages engagés en détail. */
export interface CampaignDetail extends CampaignFields {
  ownerId: string;
  /** Mon rôle. */
  role: CampaignRole;
  /** Personnage que j'incarne dans cette campagne. */
  playedCharacterId: string | null;
  members: CampaignMember[];
  characters: {
    characterId: string;
    ownerId: string;
    side: Side;
    addedBy: string;
    playedBy: string | null;
  }[];
  version: number;
  createdAt: string;
}

/** GET /v1/campaigns/:id/characters */
export interface CampaignCharacter {
  characterId: string;
  /** Remplacé par un libellé si le service character est injoignable ou si le personnage n'existe plus. */
  name: string;
  avatarUrl: string | null;
  type: string;
  side: Side;
  ownerId: string;
  playedBy: string | null;
  inCreation: boolean;
}

export interface CampaignSession {
  id: string;
  date: string;
  title: string | null;
}

export interface CampaignMessage {
  id: string;
  author: UserRef;
  body: string;
  createdAt: string;
}

export interface BannedUser {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  bannedBy: string;
  bannedAt: string;
}

export interface Invitation {
  code: string;
  url: string;
  expiresAt: string;
  maxUses: number;
}

export interface CampaignCreation {
  name: string;
  systemId: string;
  description?: string;
  isPublic?: boolean;
  characterCreation?: boolean;
}

export type CampaignUpdate = Partial<
  Pick<CampaignCreation, 'name' | 'description' | 'isPublic' | 'characterCreation'>
> & { imageUrl?: string | null };

const campaignPath = (id: string, suffix = '') =>
  `/v1/campaigns/${encodeURIComponent(id)}${suffix}`;

// ─── Campagnes ───────────────────────────────────────────────────────────────

export function listCampaigns(role?: CampaignRole) {
  return api<CampaignSummary[]>(`/v1/campaigns${role ? `?role=${role}` : ''}`);
}

export interface PublicCampaignsPage {
  campaigns: CampaignSummary[];
  page: number;
  perPage: number;
  total: number;
}

/** Campagnes publiques, 20 par page, les plus récemment modifiées d'abord. */
export function listPublicCampaigns(search = '', page = 1): Promise<PublicCampaignsPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (search.trim()) params.set('search', search.trim());
  return api<PublicCampaignsPage>(`/v1/campaigns/public?${params}`);
}

export function getCampaign(id: string) {
  return api<CampaignDetail>(campaignPath(id));
}

export function createCampaign(body: CampaignCreation) {
  return api<CampaignDetail>('/v1/campaigns', { method: 'POST', body: JSON.stringify(body) });
}

export function updateCampaign(id: string, body: CampaignUpdate) {
  return api<CampaignDetail>(campaignPath(id), { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteCampaign(id: string) {
  return api<void>(campaignPath(id), { method: 'DELETE' });
}

/** Rejoint une campagne par son code ou un code d'invitation. */
export function joinCampaign(code: string) {
  return api<CampaignDetail>('/v1/campaigns/join', {
    method: 'POST',
    body: JSON.stringify({ code: code.trim() }),
  });
}

/** Message de refus lisible, comme dans l'ancienne app. */
export function joinErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.problem.code) {
      case 'banned':
        return 'Vous avez été banni de cette campagne.';
      case 'campaign_not_found':
        return 'Aucune campagne trouvée avec ce code';
      case 'invitation_expired':
        return 'Cette invitation a expiré.';
      case 'invitation_exhausted':
        return 'Cette invitation a déjà servi le nombre de fois prévu.';
    }
    if (err.status === 404) return 'Aucune campagne trouvée avec ce code';
    return err.message || 'Erreur lors de la connexion à la campagne';
  }
  return 'Erreur lors de la connexion à la campagne';
}

export function createInvitation(id: string) {
  return api<Invitation>(campaignPath(id, '/invitations'), { method: 'POST', body: '{}' });
}

/** Envoie l'image de la campagne : URL présignée, dépôt direct, puis enregistrement. */
export async function uploadCampaignImage(id: string, file: File) {
  const invalid = checkImage(file);
  if (invalid) throw new ApiError({ status: 422, title: invalid });
  const { uploadUrl, publicUrl } = await api<{ uploadUrl: string; publicUrl: string }>(
    campaignPath(id, '/image'),
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
  return updateCampaign(id, { imageUrl: publicUrl });
}

// ─── Membres et bannis ───────────────────────────────────────────────────────

/** Exclut un membre (MJ), le bannit avec `ban`, ou quitte la campagne (soi-même). */
export function removeMember(id: string, userId: string, ban = false) {
  return api<void>(
    campaignPath(id, `/members/${encodeURIComponent(userId)}${ban ? '?ban=true' : ''}`),
    { method: 'DELETE' },
  );
}

export function listBans(id: string) {
  return api<BannedUser[]>(campaignPath(id, '/bans'));
}

export function unban(id: string, userId: string) {
  return api<void>(campaignPath(id, `/bans/${encodeURIComponent(userId)}`), { method: 'DELETE' });
}

// ─── Sessions et discussion ──────────────────────────────────────────────────

export function listSessions(id: string) {
  return api<CampaignSession[]>(campaignPath(id, '/sessions'));
}

export function addSession(id: string, date: Date, title?: string) {
  return api<CampaignSession>(campaignPath(id, '/sessions'), {
    method: 'POST',
    body: JSON.stringify({ date: date.toISOString(), ...(title ? { title } : {}) }),
  });
}

export function deleteSession(id: string, sessionId: string) {
  return api<void>(campaignPath(id, `/sessions/${encodeURIComponent(sessionId)}`), {
    method: 'DELETE',
  });
}

/** Derniers messages, du plus ancien au plus récent. */
export function listMessages(id: string, limit = 50) {
  return api<CampaignMessage[]>(campaignPath(id, `/messages?limit=${limit}`));
}

export function sendMessage(id: string, body: string) {
  return api<CampaignMessage>(campaignPath(id, '/messages'), {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export function deleteMessage(id: string, messageId: string) {
  return api<void>(campaignPath(id, `/messages/${encodeURIComponent(messageId)}`), {
    method: 'DELETE',
  });
}

// ─── Personnages de la campagne ──────────────────────────────────────────────

type RawCampaignCharacter = Omit<CampaignCharacter, 'name' | 'type'> & {
  name: string | null;
  type: string | null;
};

/** `name` et `type` valent null quand character ne répond pas : on garde des chaînes. */
const campaignCharacters = (list: RawCampaignCharacter[]): CampaignCharacter[] =>
  list.map((c) => ({
    ...c,
    name: c.name ?? 'Personnage indisponible',
    type: c.type ?? '',
  }));

export async function listCampaignCharacters(id: string) {
  return campaignCharacters(await api<RawCampaignCharacter[]>(campaignPath(id, '/characters')));
}

export function engageCharacter(id: string, characterId: string, side?: Side) {
  return api<CampaignDetail>(campaignPath(id, '/characters'), {
    method: 'POST',
    body: JSON.stringify({ characterId, ...(side ? { side } : {}) }),
  });
}

export function removeCampaignCharacter(id: string, characterId: string) {
  return api<void>(campaignPath(id, `/characters/${encodeURIComponent(characterId)}`), {
    method: 'DELETE',
  });
}

/**
 * Incarne un personnage engagé (null : aucun, le MJ mène la partie) ;
 * renvoie les personnages engagés à jour.
 */
export async function playCharacter(id: string, characterId: string | null) {
  return campaignCharacters(
    await api<RawCampaignCharacter[]>(campaignPath(id, '/me/character'), {
      method: 'PUT',
      body: JSON.stringify({ characterId }),
    }),
  );
}

/** Vrai si l'utilisateur a créé la campagne. */
export function ownsCampaign(c: Pick<CampaignFields, 'owner'>, userId: string): boolean {
  return c.owner.id.toLowerCase() === userId.toLowerCase();
}

/**
 * Où mène la fin de la création : la table de la campagne d'où elle a été
 * ouverte (`?campaign=`), sinon la fiche.
 */
export function afterCreationPath(characterId: string, campaignId: string | null): string {
  return campaignId
    ? `/campaigns/${encodeURIComponent(campaignId)}/play`
    : `/characters/${encodeURIComponent(characterId)}`;
}

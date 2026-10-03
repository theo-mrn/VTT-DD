/**
 * Regroupement des exports Firestore par campagne : pour chaque `Salle/{code}`,
 * réunit ses membres, ses personnages, ses sessions et sa discussion.
 *
 * Membres d'une campagne, vus à plusieurs endroits (l'ancienne app n'avait
 * pas de liste de membres) :
 *   - le créateur (`Salle/{code}.creatorId`) ;
 *   - `users/{uid}/rooms/{code}` : campagnes rejointes ou créées ;
 *   - `salles/{code}/Noms/{uid}` : qui a choisi un personnage ou le rôle de MJ ;
 *   - `users/{uid}.room_id` : campagne ouverte en dernier.
 * Les documents de membres dont la campagne n'existe plus sont écartés
 * (codes orphelins, comptés dans le résultat).
 */
import type {
  FirestoreDoc,
  LegacyCampaign,
  LegacyCharacter,
  LegacyMessage,
  LegacyName,
  LegacySession,
  LegacyUser,
} from './legacy.js';
import { toText } from './legacy.js';
import { compareCodeUnits } from '@vtt/contracts';

export interface CampaignExports {
  /** `Salle` exporté récursivement : campagnes, sessions et discussion. */
  campaigns: readonly FirestoreDoc[];
  /** `salles` exporté récursivement : `salles/{code}/Noms/{uid}`. */
  names: readonly FirestoreDoc[];
  /** `users` exporté récursivement : `room_id`, `persoId` et `users/{uid}/rooms`. */
  users: readonly FirestoreDoc[];
  /** `cartes` : seuls les personnages `cartes/{code}/characters/{id}` servent. */
  maps: readonly FirestoreDoc[];
  /** `gameSystems` : nom des systèmes de jeu. */
  systems: readonly FirestoreDoc[];
}

export type MemberSource = 'creator' | 'rooms' | 'names' | 'room_id';

export interface LegacyMember {
  uid: string;
  /** Où l'adhésion a été vue. */
  sources: MemberSource[];
  /** `salles/{code}/Noms/{uid}.nom` (à défaut `users/{uid}.perso`) : « MJ » ou `Nomperso`. */
  name?: string;
  /** `users/{uid}.persoId`, seulement si `users/{uid}.room_id` est cette campagne. */
  persoId?: string;
}

export interface CampaignToImport {
  /** Id du document `Salle` : le code de la campagne. */
  code: string;
  /** Identifiant stable pour `legacy_ids` : chemin du document. */
  legacyId: string;
  doc: FirestoreDoc<LegacyCampaign>;
  /** Système de la campagne, pour `detectSystem`. */
  system: { gameSystemId?: string; systemName?: string };
  /** Créateur d'abord, puis dans l'ordre des exports. */
  members: LegacyMember[];
  /** `cartes/{code}/characters/{id}`. */
  characters: FirestoreDoc<LegacyCharacter>[];
  sessions: FirestoreDoc<LegacySession>[];
  messages: FirestoreDoc<LegacyMessage>[];
}

export interface Grouping {
  campaigns: CampaignToImport[];
  /** Codes cités par des membres ou des personnages sans document `Salle` (supprimés). */
  orphans: string[];
}

const segments = (path: string) => path.split('/');

export function groupCampaigns(e: CampaignExports): Grouping {
  const systems = new Map<string, Record<string, unknown>>();
  for (const d of e.systems) if (segments(d.path).length === 2) systems.set(d.id, d.data ?? {});

  const campaigns = new Map<string, CampaignToImport>();
  const subDocs: FirestoreDoc[] = [];
  for (const d of e.campaigns) {
    const s = segments(d.path);
    if (s[0] !== 'Salle') continue;
    if (s.length !== 2) {
      subDocs.push(d);
      continue;
    }
    const data = (d.data ?? {}) as LegacyCampaign;
    const gameSystemId = toText(data.gameSystemId);
    const systemName = gameSystemId ? toText(systems.get(gameSystemId)?.name) : undefined;
    campaigns.set(d.id, {
      code: d.id,
      legacyId: d.path,
      doc: d as FirestoreDoc<LegacyCampaign>,
      system: {
        ...(gameSystemId ? { gameSystemId } : {}),
        ...(systemName ? { systemName } : {}),
      },
      members: [],
      characters: [],
      sessions: [],
      messages: [],
    });
  }

  const orphans = new Set<string>();
  const campaignOf = (code: string | undefined) => {
    if (!code) return undefined;
    const campaign = campaigns.get(code);
    if (!campaign) orphans.add(code);
    return campaign;
  };

  // Sessions et discussion : Salle/{code}/sessions/{id}, Salle/{code}/chat/{id}
  for (const d of subDocs) {
    const s = segments(d.path);
    if (s.length !== 4) continue;
    const campaign = campaigns.get(s[1]!);
    if (!campaign) continue;
    if (s[2] === 'sessions') campaign.sessions.push(d as FirestoreDoc<LegacySession>);
    else if (s[2] === 'chat') campaign.messages.push(d as FirestoreDoc<LegacyMessage>);
  }

  const member = (campaign: CampaignToImport, uid: string, source: MemberSource): LegacyMember => {
    let m = campaign.members.find((x) => x.uid === uid);
    if (!m) {
      m = { uid, sources: [] };
      campaign.members.push(m);
    }
    if (!m.sources.includes(source)) m.sources.push(source);
    return m;
  };

  // Le créateur d'abord
  for (const campaign of campaigns.values()) {
    const creator = toText(campaign.doc.data?.creatorId);
    if (creator) member(campaign, creator, 'creator');
  }

  // users/{uid}/rooms/{code}, puis users/{uid}.room_id et persoId
  for (const d of e.users) {
    const s = segments(d.path);
    if (s.length === 4 && s[2] === 'rooms') {
      const campaign = campaignOf(s[3]);
      if (campaign) member(campaign, s[1]!, 'rooms');
    }
  }
  const active = new Map<string, LegacyUser>(); // uid → document, si room_id connu
  for (const d of e.users) {
    if (segments(d.path).length !== 2) continue;
    const u = (d.data ?? {}) as LegacyUser;
    const campaign = campaignOf(toText(u.room_id));
    if (!campaign) continue;
    const m = member(campaign, d.id, 'room_id');
    const persoId = toText(u.persoId);
    if (persoId) m.persoId = persoId;
    active.set(d.id, u);
  }

  // salles/{code}/Noms/{uid}
  for (const d of e.names) {
    const s = segments(d.path);
    if (s.length !== 4 || s[0] !== 'salles' || s[2] !== 'Noms') continue;
    const campaign = campaignOf(s[1]);
    if (!campaign) continue;
    const m = member(campaign, s[3]!, 'names');
    const name = toText((d.data as LegacyName | undefined)?.nom);
    if (name) m.name = name;
  }
  // À défaut de Noms, users/{uid}.perso de la campagne active dit la même chose
  for (const campaign of campaigns.values()) {
    for (const m of campaign.members) {
      if (m.name) continue;
      const u = active.get(m.uid);
      const perso = u && toText(u.room_id) === campaign.code ? toText(u.perso) : undefined;
      if (perso) m.name = perso;
    }
  }

  // Personnages : cartes/{code}/characters/{id}
  for (const d of e.maps) {
    const s = segments(d.path);
    if (s.length !== 4 || s[0] !== 'cartes' || s[2] !== 'characters') continue;
    const campaign = campaignOf(s[1]);
    if (campaign) campaign.characters.push(d as FirestoreDoc<LegacyCharacter>);
  }

  return { campaigns: [...campaigns.values()], orphans: [...orphans].sort(compareCodeUnits) };
}

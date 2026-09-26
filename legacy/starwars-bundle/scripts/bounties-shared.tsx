// Socle commun du Tableau des Primes — liste PARTAGÉE de la salle (api.sharedState), remplie par le
// MJ directement DEPUIS le terminal (terminal.tsx, mini-formulaire inline "prime add"/"prime edit")
// et lue en temps réel par les joueurs (recherche "search"/"list prime"). Même modèle que le Scanner
// de fréquences (scanner-shared.tsx) : un seul canal JSON, le MJ est la seule écriture.
const BOUNTIES_KEY = 'bounties';

export interface Bounty {
  id: string;
  target: string;       // nom de la cible (ou de l'organisation, pour un contrat non nominatif)
  reward: string;        // texte libre : "15 000 crédits", "matériel + crédits"...
  image?: string;        // URL (upload réel vers R2 via /api/upload-asset, cf terminal.tsx)
  description: string;   // détails narratifs (dernière position connue, dangerosité...)
}

const parseBounty = (raw: unknown): Bounty | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.target !== 'string') return null;
  return {
    id: r.id,
    target: r.target,
    reward: typeof r.reward === 'string' ? r.reward : '',
    image: typeof r.image === 'string' && r.image.trim() !== '' ? r.image : undefined,
    description: typeof r.description === 'string' ? r.description : '',
  };
};

export const parseBounties = (v: unknown): Bounty[] => {
  if (typeof v !== 'string' || !v) return [];
  try {
    const raw = JSON.parse(v);
    if (!Array.isArray(raw)) return [];
    return raw.map(parseBounty).filter((b): b is Bounty => b !== null);
  } catch {
    return [];
  }
};

export const subscribeBounties = (api: any, cb: (list: Bounty[]) => void): (() => void) =>
  api.sharedState.subscribe(BOUNTIES_KEY, (v: unknown) => cb(parseBounties(v)));

export const writeBounties = (api: any, list: Bounty[]): Promise<void> =>
  api.sharedState.set(BOUNTIES_KEY, JSON.stringify(list));

export const makeBountyId = (): string =>
  `bounty-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

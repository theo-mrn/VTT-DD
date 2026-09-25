// Socle commun du broadcast terminal — un message PARTAGÉ de la salle (api.sharedState), envoyé par
// n'importe qui (joueur ou MJ) via "broadcast <message>" dans terminal.tsx, reçu par tous comme un
// simple toast local (api.showToast n'est PAS partagé — chaque client doit écouter ce canal et
// déclencher son propre toast à réception). Même modèle JSON qu'un canal que scanner-shared.tsx.
const BROADCAST_KEY = 'broadcast';

export interface BroadcastMessage {
  authorName: string;
  text: string;
  timestamp: number;
}

const parseBroadcast = (v: unknown): BroadcastMessage | null => {
  if (typeof v !== 'string' || !v) return null;
  try {
    const raw = JSON.parse(v) as Record<string, unknown>;
    if (typeof raw.text !== 'string' || typeof raw.timestamp !== 'number') return null;
    return {
      authorName: typeof raw.authorName === 'string' ? raw.authorName : 'Inconnu',
      text: raw.text,
      timestamp: raw.timestamp,
    };
  } catch {
    return null;
  }
};

/** cb reçoit CHAQUE nouveau message (pas les anciens) : le premier appel après montage (état déjà
 *  présent dans sharedState) est ignoré côté appelant via lastSeenRef — voir usage dans
 *  terminal.tsx. On ne filtre pas ici : sharedState.subscribe appelle toujours cb immédiatement avec
 *  la valeur courante, filtrer serait dupliquer cette logique pour chaque abonné. */
export const subscribeBroadcast = (api: any, cb: (msg: BroadcastMessage) => void): (() => void) =>
  api.sharedState.subscribe(BROADCAST_KEY, (v: unknown) => {
    const msg = parseBroadcast(v);
    if (msg) cb(msg);
  });

export const sendBroadcast = (api: any, authorName: string, text: string): Promise<void> =>
  api.sharedState.set(BROADCAST_KEY, JSON.stringify({ authorName, text, timestamp: Date.now() } as BroadcastMessage));

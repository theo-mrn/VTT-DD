/**
 * Jet de l'historique sous la forme qu'affichaient le panneau et les
 * statistiques de l'ancienne app (document Firestore `rolls/{salle}/rolls`).
 * Le service des dés renvoie déjà ces champs (`userName`, `output`,
 * `symbolResult`…) ; s'y ajoutent le masquage des jets cachés, l'étiquette,
 * les critiques et la réussite d'une action.
 */
import type { Roll } from '@/lib/dice';

export interface HistoryRoll {
  id: string;
  isPrivate: boolean;
  isBlind?: boolean;
  diceCount: number;
  diceFaces: number;
  modifier: number;
  results: number[];
  total: number;
  userAvatar?: string;
  userName: string;
  type?: string;
  timestamp: number;
  notation?: string;
  output?: string;
  persoId?: string;
  uid?: string;
  symbolResult?: string;
  // Ajouts du service des dés
  label?: string;
  /** Résultat masqué pour l'appelant (jet caché vu par son auteur). */
  masked?: boolean;
  critical?: boolean;
  fumble?: boolean;
  success?: boolean | null;
  source: Roll['source'];
  /** Dés à symboles tirés, pour relancer le même pool (`N<dé>`). */
  pool?: { de: string; nombre: number }[];
}

export function toHistoryRoll(roll: Roll, avatars?: Record<string, string | null>): HistoryRoll {
  const avatar = roll.userAvatar ?? (roll.persoId ? avatars?.[roll.persoId] : null) ?? undefined;
  const pool = new Map<string, number>();
  for (const d of roll.symbols?.dice ?? []) pool.set(d.die, (pool.get(d.die) ?? 0) + 1);
  const notation = roll.notation ?? roll.label ?? '';

  return {
    id: roll.id,
    isPrivate: roll.isPrivate,
    isBlind: roll.isBlind,
    diceCount: roll.diceCount,
    diceFaces: roll.diceFaces,
    modifier: roll.modifier,
    results: roll.results,
    total: roll.total ?? 0,
    ...(avatar ? { userAvatar: avatar } : {}),
    userName: roll.userName,
    type: roll.type,
    timestamp: roll.timestamp || Date.parse(roll.createdAt) || 0,
    ...(notation ? { notation } : {}),
    ...(roll.output ? { output: roll.output } : {}),
    ...(roll.persoId ? { persoId: roll.persoId } : {}),
    ...(roll.uid ? { uid: roll.uid } : {}),
    ...(roll.symbolResult ? { symbolResult: roll.symbolResult } : {}),
    ...(roll.label ? { label: roll.label } : {}),
    masked: roll.hidden,
    ...(roll.outcome?.critical ? { critical: true } : {}),
    ...(roll.outcome?.fumble ? { fumble: true } : {}),
    success: roll.outcome?.success ?? null,
    source: roll.source,
    ...(pool.size ? { pool: [...pool].map(([de, nombre]) => ({ de, nombre })) } : {}),
  };
}

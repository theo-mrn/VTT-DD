/**
 * Visée en direct (docs/combat.md § 10.2, `combat.aim`) : pendant que l'attaquant choisit ses
 * cibles, l'attaquant (`a`) et les cibles (`t`) partent aux MJ (`gmOnly`) à chaque
 * changement, puis `end` à la déclaration ou à l'abandon. Relayé, jamais stocké.
 *
 * - `AimSender` : n'envoie que ce qui change, et `end` une seule fois après un envoi.
 * - `AimBoard` : ce que le MJ reçoit, par émetteur ; une visée muette depuis `AIM_TTL_MS`
 *   s'efface (onglet fermé sans `end`).
 */
import {
  ATTACK_TARGETS_MAX,
  COMBAT_AIM_KIND,
  CombatAimMessage,
  type CombatAimMessage as AimMessage,
} from '@vtt/contracts';

export { COMBAT_AIM_KIND };

/** Une visée sans nouvelles depuis ce délai disparaît. */
export const AIM_TTL_MS = 30_000;

/** Visée à émettre pour ce brouillon (null : rien à montrer). */
export function aimMessage(
  attackerId: string | null,
  targetIds: readonly string[],
): AimMessage | null {
  if (!attackerId) return null;
  return { a: attackerId, t: [...new Set(targetIds)].slice(0, ATTACK_TARGETS_MAX) };
}

const sameAim = (x: AimMessage | null, y: AimMessage | null) =>
  x === y ||
  (!!x && !!y && x.a === y.a && x.t.length === y.t.length && x.t.every((id, i) => id === y.t[i]));

/** Émission de la visée : un message par changement, `end` à la fin. */
export class AimSender {
  private last: AimMessage | null = null;

  constructor(private readonly send: (message: AimMessage) => void) {}

  /** Nouvelle visée (null : plus de visée, `end` si quelque chose a été envoyé). */
  update(next: AimMessage | null) {
    if (!next) return this.end();
    if (sameAim(this.last, next)) return;
    this.last = next;
    this.send(next);
  }

  /** Fin de la visée (déclaration, abandon, fermeture). */
  end() {
    if (!this.last) return;
    const { a, t } = this.last;
    this.last = null;
    this.send({ a, t, end: true });
  }
}

export interface LiveAim {
  /** Utilisateur qui vise. */
  from: string;
  attackerId: string;
  targetIds: readonly string[];
  at: number;
}

/** Visées reçues (MJ), par émetteur. */
export class AimBoard {
  private readonly byUser = new Map<string, LiveAim>();

  /** Reçoit un message ; renvoie vrai si les visées ont changé. Un message invalide est ignoré. */
  receive(from: string, data: unknown, now: number): boolean {
    const parsed = CombatAimMessage.safeParse(data);
    if (!parsed.success) return false;
    const m = parsed.data;
    if (m.end) return this.byUser.delete(from);
    const prev = this.byUser.get(from);
    this.byUser.set(from, { from, attackerId: m.a, targetIds: m.t, at: now });
    return !prev || !sameAim({ a: prev.attackerId, t: [...prev.targetIds] }, m);
  }

  /** Retire les visées muettes ; renvoie vrai s'il en a retiré. */
  expire(now: number): boolean {
    let changed = false;
    for (const [user, aim] of this.byUser)
      if (now - aim.at > AIM_TTL_MS) {
        this.byUser.delete(user);
        changed = true;
      }
    return changed;
  }

  list(): LiveAim[] {
    return [...this.byUser.values()];
  }

  get size() {
    return this.byUser.size;
  }
}

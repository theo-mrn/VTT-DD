/**
 * Effets d'un paiement dans les autres services, par leurs routes internes
 * (en-tête x-internal-secret) : ce que l'ancien webhook Stripe écrivait
 * directement dans users/{uid}.
 *
 *   dice      PUT /internal/users/:userId/inventory/:skinId   skin acheté
 *             PUT /internal/users/:userId/all-skins            premium (tous les skins)
 *   identity  PUT /internal/users/:userId/premium              badge et bordures du profil
 *
 * Toutes ces routes sont idempotentes : un effet peut être rejoué sans risque.
 * Un échec lève EffectFailed ; le webhook répond alors 500 et Stripe relivre
 * l'événement plus tard (jusqu'à 3 jours), qui refait les effets.
 */

export interface Effects {
  grantSkin(userId: string, skinId: string): Promise<void>;
  setAllSkins(userId: string, allSkins: boolean): Promise<void>;
  setPremium(userId: string, premium: boolean): Promise<void>;
}

export class EffectFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EffectFailed';
  }
}

const TIMEOUT_MS = 5_000;

export function httpEffects(o: {
  diceUrl?: string;
  identityUrl?: string;
  secret?: string;
  fetch?: typeof globalThis.fetch;
}): Effects {
  const doFetch = o.fetch ?? globalThis.fetch;

  async function put(
    service: 'dice' | 'identity',
    base: string | undefined,
    path: string,
    body: unknown,
    /** Erreur sans suite (compte supprimé : rien à mettre à jour), selon le code du problème. */
    ignoredCode?: string,
  ) {
    if (!base || !o.secret)
      throw new EffectFailed(`${service} non configuré (URL ou INTERNAL_API_SECRET absent)`);
    let res: Response;
    try {
      res = await doFetch(new URL(path, base), {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-internal-secret': o.secret },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new EffectFailed(`${service} injoignable : ${(e as Error).message}`);
    }
    if (res.ok) return;
    if (ignoredCode) {
      const problem = (await res.json().catch(() => ({}))) as { code?: unknown };
      if (problem.code === ignoredCode) return;
    }
    throw new EffectFailed(`${service} a répondu ${res.status}`);
  }

  const user = (id: string) => `/internal/users/${encodeURIComponent(id)}`;

  return {
    grantSkin: (userId, skinId) =>
      put('dice', o.diceUrl, `${user(userId)}/inventory/${encodeURIComponent(skinId)}`, {
        source: 'purchase',
      }),
    setAllSkins: (userId, allSkins) =>
      put('dice', o.diceUrl, `${user(userId)}/all-skins`, { allSkins }),
    // Compte supprimé depuis le paiement : plus de profil à mettre à jour
    setPremium: (userId, premium) =>
      put('identity', o.identityUrl, `${user(userId)}/premium`, { premium }, 'user_not_found'),
  };
}

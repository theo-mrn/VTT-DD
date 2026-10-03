/**
 * Seau à jetons par connexion : `rate` messages par seconde en régime
 * continu, `burst` d'un coup au plus. En mémoire : chaque connexion vit sur
 * un seul réplica.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly rate: number,
    private readonly burst: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = burst;
    this.last = now();
  }

  /** Consomme un jeton ; false si le débit est dépassé. */
  take(): boolean {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.rate);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

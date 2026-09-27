/**
 * Client Socket.IO minimal pour les tests, sur le WebSocket natif de Node
 * (socket.io-client n'est pas une dépendance du service) : protocole
 * Engine.IO 4 / Socket.IO 5, espace de noms par défaut, texte seulement.
 *
 *   0{…}  ouverture Engine.IO      2 / 3  ping / pong
 *   40{…} connexion (auth)         44{…}  refus (connect_error)
 *   42[…] événement                42<id>[…] / 43<id>[…] demande / accusé
 *   41    déconnexion par le serveur
 */
export interface Received {
  event: string;
  args: unknown[];
}

export class TestSocket {
  readonly received: Received[] = [];
  private readonly acks = new Map<number, (args: unknown[]) => void>();
  private readonly waiters = new Set<() => void>();
  private nextId = 0;
  /** Motif de fin : `io server disconnect`, `transport close`. */
  closeReason: string | null = null;

  private constructor(private readonly ws: WebSocket) {}

  /** Ouvre la connexion ; rejette avec le message de refus du serveur (`unauthorized`). */
  static connect(
    baseUrl: string,
    auth: Record<string, unknown> = {},
    path = '/v1/realtime/socket.io',
  ): Promise<TestSocket> {
    const url = `${baseUrl.replace(/^http/, 'ws')}${path}/?EIO=4&transport=websocket`;
    const ws = new WebSocket(url);
    const socket = new TestSocket(ws);
    return new Promise((resolve, reject) => {
      let connected = false;
      ws.addEventListener('message', (m) => {
        const data = String(m.data);
        if (data.startsWith('0')) {
          ws.send(`40${JSON.stringify(auth)}`);
          return;
        }
        if (data === '2') return ws.send('3');
        if (data.startsWith('40')) {
          connected = true;
          return resolve(socket);
        }
        if (data.startsWith('44')) {
          const err = JSON.parse(data.slice(2)) as { message: string };
          ws.close();
          return reject(new Error(err.message));
        }
        socket.onPacket(data);
      });
      ws.addEventListener('close', () => {
        socket.closeReason ??= 'transport close';
        socket.notify();
        if (!connected) reject(new Error('connexion fermée'));
      });
      ws.addEventListener('error', () => {
        if (!connected) reject(new Error('connexion impossible'));
      });
    });
  }

  private onPacket(data: string) {
    if (data === '41') {
      this.closeReason = 'io server disconnect';
      this.notify();
      return;
    }
    const m = /^4([23])(\d*)(.*)$/s.exec(data);
    if (!m) return;
    const [, type, id, json] = m;
    const args = JSON.parse(json!) as unknown[];
    if (type === '3') {
      this.acks.get(Number(id))?.(args);
      this.acks.delete(Number(id));
      return;
    }
    const [event, ...rest] = args as [string, ...unknown[]];
    this.received.push({ event, args: rest });
    this.notify();
  }

  private notify() {
    for (const w of [...this.waiters]) w();
  }

  get open() {
    return this.ws.readyState === WebSocket.OPEN && this.closeReason === null;
  }

  emit(event: string, ...args: unknown[]) {
    this.ws.send(`42${JSON.stringify([event, ...args])}`);
  }

  /** Émet avec accusé de réception ; résout avec le premier argument de l'accusé. */
  request<T = Record<string, unknown>>(
    event: string,
    payload: unknown,
    timeoutMs = 5000,
  ): Promise<T> {
    const id = this.nextId++;
    this.ws.send(`42${id}${JSON.stringify([event, payload])}`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`pas d'accusé pour ${event}`)), timeoutMs);
      this.acks.set(id, (args) => {
        clearTimeout(timer);
        resolve(args[0] as T);
      });
    });
  }

  /** Messages reçus pour un événement donné (premier argument). */
  all<T = Record<string, unknown>>(event: string): T[] {
    return this.received.filter((r) => r.event === event).map((r) => r.args[0] as T);
  }

  /** Attend un message qui satisfait `match` (déjà reçu ou à venir). */
  waitFor<T = Record<string, unknown>>(
    event: string,
    match: (payload: T) => boolean = () => true,
    timeoutMs = 3000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const check = () => {
        // Recherche par index : un événement sans argument vaut undefined
        const list = this.all<T>(event);
        const index = list.findIndex(match);
        if (index >= 0) {
          this.waiters.delete(check);
          clearTimeout(timer);
          resolve(list[index]!);
          return true;
        }
        return false;
      };
      const timer = setTimeout(() => {
        this.waiters.delete(check);
        reject(new Error(`« ${event} » attendu, non reçu`));
      }, timeoutMs);
      if (!check()) this.waiters.add(check);
    });
  }

  /** Attend la fin de la connexion. */
  waitClosed(timeoutMs = 3000): Promise<string> {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.closeReason === null) return false;
        this.waiters.delete(check);
        clearTimeout(timer);
        resolve(this.closeReason);
        return true;
      };
      const timer = setTimeout(() => {
        this.waiters.delete(check);
        reject(new Error('connexion toujours ouverte'));
      }, timeoutMs);
      if (!check()) this.waiters.add(check);
    });
  }

  close() {
    this.ws.close();
  }
}

/** Laisse passer les messages en vol (aucun message attendu). */
export const settle = (ms = 150) => new Promise((ok) => setTimeout(ok, ms));

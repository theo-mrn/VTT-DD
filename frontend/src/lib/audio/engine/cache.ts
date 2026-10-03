/**
 * Cache LRU des `AudioBuffer` décodés (effets courts), borné par la taille
 * estimée du PCM (64 Mo) : un effet relancé part sans délai de chargement.
 */
export const CACHE_BYTES = 64 * 1024 * 1024;

/** Téléchargement d'un son (CORS, sans cookies). */
async function telecharger(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`son indisponible (${res.status})`);
  return res.arrayBuffer();
}

export class BufferCache {
  private readonly entries = new Map<string, { buffer: AudioBuffer; bytes: number }>();
  private readonly pending = new Map<string, Promise<AudioBuffer>>();
  private bytes = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly load: (url: string) => Promise<ArrayBuffer> = telecharger,
    readonly maxBytes = CACHE_BYTES,
  ) {}

  get size() {
    return this.bytes;
  }

  has(url: string) {
    return this.entries.has(url);
  }

  /** Buffer décodé (chargé une seule fois, même en appels simultanés). */
  get(url: string): Promise<AudioBuffer> {
    const hit = this.entries.get(url);
    if (hit) {
      // Plus récemment utilisé : en fin de Map
      this.entries.delete(url);
      this.entries.set(url, hit);
      return Promise.resolve(hit.buffer);
    }
    let p = this.pending.get(url);
    if (!p) {
      p = this.load(url)
        .then((data) => this.ctx.decodeAudioData(data))
        .then((buffer) => {
          this.put(url, buffer);
          return buffer;
        })
        .finally(() => this.pending.delete(url));
      this.pending.set(url, p);
    }
    return p;
  }

  private put(url: string, buffer: AudioBuffer) {
    const bytes = buffer.length * buffer.numberOfChannels * 4;
    this.entries.set(url, { buffer, bytes });
    this.bytes += bytes;
    for (const [key, e] of this.entries) {
      if (this.bytes <= this.maxBytes || key === url) break;
      this.entries.delete(key);
      this.bytes -= e.bytes;
    }
  }
}

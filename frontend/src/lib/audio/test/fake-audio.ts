/** Faux Web Audio pour les tests du moteur : graphe observable, horloge pilotée. */
export class FakeParam {
  value: number;
  events: string[] = [];
  constructor(v = 1) {
    this.value = v;
  }
  cancelScheduledValues() {
    this.events.push('cancel');
    return this;
  }
  setValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number) {
    this.value = v;
    return this;
  }
}

export class FakeNode {
  outputs = new Set<FakeNode>();
  constructor(readonly kind: string) {}
  connect(n: FakeNode) {
    this.outputs.add(n);
    return n;
  }
  disconnect() {
    this.outputs.clear();
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam(1);
  constructor() {
    super('gain');
  }
}

export class FakeElement {
  src = '';
  currentTime = 0;
  paused = true;
  loop = false;
  playbackRate = 1;
  preservesPitch = true;
  duration = NaN;
  crossOrigin: string | null = null;
  preload = '';
  onended: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {}
  getAttribute(name: string) {
    return name === 'src' && this.src ? this.src : null;
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
}

export class FakeAudioContext {
  state: 'suspended' | 'running' = 'suspended';
  currentTime = 0;
  destination = new FakeNode('destination');
  onstatechange: (() => void) | null = null;
  mediaSources = 0;
  bufferSources: (FakeNode & { started: number | null; stopped: boolean })[] = [];
  createGain() {
    return new FakeGain();
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode('limiter'), {
      threshold: new FakeParam(),
      knee: new FakeParam(),
      ratio: new FakeParam(),
      attack: new FakeParam(),
      release: new FakeParam(),
    });
  }
  createStereoPanner() {
    return Object.assign(new FakeNode('panner'), { pan: new FakeParam(0) });
  }
  createMediaElementSource(el: FakeElement) {
    this.mediaSources += 1;
    return Object.assign(new FakeNode('media'), { el });
  }
  createBufferSource() {
    const s = Object.assign(new FakeNode('buffer'), {
      buffer: null as unknown,
      started: null as number | null,
      stopped: false,
      onended: null as (() => void) | null,
      start(when: number) {
        s.started = when;
      },
      stop() {
        s.stopped = true;
      },
    });
    this.bufferSources.push(s);
    return s;
  }
  decodeAudioData(data: ArrayBuffer) {
    return Promise.resolve({ length: data.byteLength, numberOfChannels: 1, duration: 1 });
  }
  resume() {
    this.state = 'running';
    this.onstatechange?.();
    return Promise.resolve();
  }
}

/** Chemin d'un nœud jusqu'à la destination (types des nœuds traversés). */
export function pathToDestination(node: FakeNode): string[] {
  const path: string[] = [];
  let n: FakeNode | undefined = node;
  while (n) {
    path.push(n.kind);
    n = [...n.outputs][0];
  }
  return path;
}

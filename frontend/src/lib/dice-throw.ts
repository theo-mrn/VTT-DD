/**
 * Lanceur de dés 3D : petite API typée (store zustand) entre les écrans qui
 * lancent (table de dés, lanceur rapide, boutique) et le lanceur 3D
 * (`components/dice/three/thrower.tsx`, chargé à la demande par
 * `DiceThrowerHost`). Elle remplace les événements `window` non typés de
 * l'ancienne app : `vtt-trigger-3d-roll`, `vtt-prepare-3d-roll`,
 * `vtt-3d-roll-started` et `vtt-3d-roll-complete`.
 *
 * L'animation fait foi, comme dans l'ancienne app (`perform3DRoll`) : les dés
 * roulent, la face du dessus de chacun est lue à l'arrêt, et ces faces
 * partent au service dice (`physicalResults`), qui calcule le jet avec elles.
 * Jamais de résultat tiré d'abord puis imposé à l'animation.
 *
 * Repli (`null` : le serveur tire les dés) quand l'animation est coupée, pour
 * un jet caché, au-delà de 15 dés, ou si les dés ne se sont pas arrêtés à
 * temps : 30 s pour charger et préchauffer la 3D, puis 10 s une fois les dés
 * réellement lancés (compté au départ du lancer, `started`). Les dés sans
 * forme 3D (d100, d7…) sont laissés au serveur.
 */
import { create } from 'zustand';

/** Formes du rendu 3D ; les autres dés (d100…) sont tirés par le serveur. */
export const SHAPES_3D = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as const;
/** Au-delà, pas d'animation : le serveur tire les dés. */
export const MAX_3D_DICE = 15;
/** Délai de chargement de la 3D avant le lancer (téléchargement, shaders). */
export const LOAD_TIMEOUT_MS = 30_000;
/** Délai une fois les dés lancés, avant le repli (comme l'ancienne app). */
export const SETTLE_TIMEOUT_MS = 10_000;

/** Un symbole dessiné sur une face (dé à symboles). */
export interface Die3DSymbol {
  /** Icône lucide (`presentation.symboles.*.icone`). */
  icon?: string;
  /** Repli quand l'icône manque ou est inconnue (2 caractères affichés). */
  label?: string;
  /** Couleur du symbole ; celle des numéros de la skin sinon. */
  color?: string;
}

/** `count` dés de forme `type` (`d20`) à lancer. */
export interface ThrowRequest {
  type: string;
  count: number;
  /** Skin de ces dés (ex couleur d'un dé à symboles), sinon celui du jet. */
  skinId?: string;
  /** Identifiant renvoyé dans chaque résultat (ex sorte d'un dé à symboles). */
  tag?: string;
  /** Dé à symboles : symboles de chaque face déclarée (index 0 = face 1). */
  faces?: Die3DSymbol[][];
}

/** Face lue sur un dé arrêté. */
export interface ThrowResult {
  type: string;
  value: number;
  tag?: string;
}

/** Lancer en attente du lanceur 3D. */
export interface QueuedThrow {
  rollId: string;
  requests: ThrowRequest[];
  skinId?: string;
}

interface DiceThrowState {
  /** Le lanceur est monté (au premier besoin), puis le reste : contexte WebGL et shaders gardés. */
  active: boolean;
  /** Lancers demandés, pas encore pris par le lanceur. */
  queue: QueuedThrow[];
  /** Skins à préchauffer, pas encore pris par le lanceur. */
  warmup: string[];
  /** Incrémenté à chaque demande : le lanceur relit la file quand il change. */
  revision: number;
  /** Son des dés (préférence du service dice) : impacts et ambiances. */
  sound: boolean;
  /**
   * Des dés sont à l'écran : les autres canevas 3D (aperçu de la boutique)
   * se mettent en pause pour laisser le GPU au lancer.
   */
  onScreen: boolean;
}

export const useDiceThrowStore = create<DiceThrowState>()(() => ({
  active: false,
  queue: [],
  warmup: [],
  revision: 0,
  sound: true,
  onScreen: false,
}));

interface Waiter {
  onStarted(): void;
  onComplete(results: ThrowResult[]): void;
}

/** Lancers attendus par un appelant, par identifiant. */
const waiters = new Map<string, Waiter>();

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ─── Côté écrans ─────────────────────────────────────────────────────────────

/** Délai maximal avant un préchauffage reporté, même si le fil n'est jamais libre. */
const PREPARE_IDLE_TIMEOUT_MS = 3000;
/** Skins à préchauffer, regroupés jusqu'au prochain moment libre. */
const preparing = new Set<string>();
let prepareScheduled = false;

const whenIdle = (run: () => void) => {
  if (typeof window.requestIdleCallback === 'function')
    window.requestIdleCallback(run, { timeout: PREPARE_IDLE_TIMEOUT_MS });
  else window.setTimeout(run, 200);
};

/**
 * Prépare le lanceur (module 3D chargé, shaders de ces skins préchauffés)
 * avant le premier jet : à l'ouverture de la table, du lanceur rapide ou en
 * équipant un skin. Reporté au premier moment libre du fil principal : la
 * carte et le panneau qui s'ouvrent passent d'abord. Les demandes rapprochées
 * sont regroupées en une seule, et le lanceur ne préchauffe qu'un lot à la
 * fois (jamais deux rafales de compilation ensemble). Un lancer demandé
 * entre-temps n'attend pas : il préchauffe lui-même ses skins.
 */
export function prepareDice3D(skinIds: readonly string[]): void {
  if (typeof window === 'undefined') return;
  skinIds.filter(Boolean).forEach((id) => preparing.add(id));
  if (prepareScheduled) return;
  prepareScheduled = true;
  whenIdle(() => {
    prepareScheduled = false;
    const skins = [...preparing];
    preparing.clear();
    useDiceThrowStore.setState((s) => ({
      active: true,
      warmup: [...new Set([...s.warmup, ...skins])],
      revision: s.revision + 1,
    }));
  });
}

/** Son des dés (préférence du service) : le lanceur le lit à chaque impact. */
export function setDiceSound(enabled: boolean): void {
  if (useDiceThrowStore.getState().sound !== enabled)
    useDiceThrowStore.setState({ sound: enabled });
}

/** Vrai si le son des dés est actif. */
export const diceSoundEnabled = () => useDiceThrowStore.getState().sound;

/**
 * Lance des dés à l'écran sans attendre leur résultat (« Essayer » de la
 * boutique) : même lanceur, mêmes dés, rien n'est enregistré.
 */
export function previewDice3D(requests: ThrowRequest[], skinId?: string): void {
  const rollId = newId();
  useDiceThrowStore.setState((s) => ({
    active: true,
    queue: [...s.queue, { rollId, requests, ...(skinId ? { skinId } : {}) }],
    revision: s.revision + 1,
  }));
}

export interface Roll3DOptions {
  /** Préférence « animation 3D » : coupée, le serveur tire les dés. */
  enabled: boolean;
  /** Jet caché au MJ : son auteur ne doit pas voir les dés, le serveur tire. */
  blind?: boolean;
  /** Skin des dés (préférence du service). */
  skinId?: string;
}

/**
 * `perform3DRoll` de l'ancienne app : lance les dés 3D et rend les faces lues
 * à l'arrêt, ou `null` pour un repli (le serveur tire alors tous les dés).
 * Seuls les dés de forme 3D roulent ; les autres (d100…) sont omis et tirés
 * par le serveur, qui complète les valeurs manquantes.
 */
export function roll3D(
  requests: ThrowRequest[],
  options: Roll3DOptions,
): Promise<ThrowResult[] | null> {
  const requests3D = requests.filter(
    (r) => r.count > 0 && (SHAPES_3D as readonly string[]).includes(r.type),
  );
  const total3D = requests3D.reduce((n, r) => n + r.count, 0);
  if (
    typeof window === 'undefined' ||
    total3D === 0 ||
    !options.enabled ||
    options.blind ||
    total3D > MAX_3D_DICE
  )
    return Promise.resolve(null);

  const rollId = newId();
  return new Promise((resolve) => {
    // Deux délais : le chargement de la 3D (téléchargement, préchauffage des
    // shaders) peut être long au premier jet, puis 10 s une fois les dés
    // réellement lancés. Le repli ne doit jamais remplacer un lancer qui a
    // bien lieu à l'écran.
    const fallback = () => {
      if (!waiters.delete(rollId)) return;
      console.warn('Dés 3D sans résultat à temps : le serveur tire les dés');
      // Lancer pas encore pris par le lanceur : il ne partira plus
      useDiceThrowStore.setState((s) => ({ queue: s.queue.filter((q) => q.rollId !== rollId) }));
      resolve(null);
    };
    let timer = window.setTimeout(fallback, LOAD_TIMEOUT_MS);
    waiters.set(rollId, {
      onStarted() {
        window.clearTimeout(timer);
        timer = window.setTimeout(fallback, SETTLE_TIMEOUT_MS);
      },
      onComplete(results) {
        window.clearTimeout(timer);
        waiters.delete(rollId);
        resolve(results);
      },
    });
    useDiceThrowStore.setState((s) => ({
      active: true,
      queue: [
        ...s.queue,
        { rollId, requests: requests3D, ...(options.skinId ? { skinId: options.skinId } : {}) },
      ],
      revision: s.revision + 1,
    }));
  });
}

// ─── Côté lanceur 3D ─────────────────────────────────────────────────────────

/** Canal du lanceur 3D : il prend les demandes et rend compte de chaque lancer. */
export const diceThrowerChannel = {
  /** Prend les lancers et les skins à préchauffer en attente (la file est vidée). */
  take(): { throws: QueuedThrow[]; warmup: string[] } {
    const { queue, warmup } = useDiceThrowStore.getState();
    if (queue.length || warmup.length) useDiceThrowStore.setState({ queue: [], warmup: [] });
    return { throws: queue, warmup };
  },
  /** Les dés partent vraiment (après chargement et préchauffage) : le délai d'arrêt commence. */
  started(rollId: string): void {
    waiters.get(rollId)?.onStarted();
  },
  /** Des dés apparaissent à l'écran, ou le dernier vient d'en être retiré. */
  shown(onScreen: boolean): void {
    if (useDiceThrowStore.getState().onScreen !== onScreen)
      useDiceThrowStore.setState({ onScreen });
  },
  /** Tous les dés du lancer sont arrêtés : faces lues, dans l'ordre d'arrêt. */
  completed(rollId: string, results: ThrowResult[]): void {
    waiters.get(rollId)?.onComplete(results);
  },
};

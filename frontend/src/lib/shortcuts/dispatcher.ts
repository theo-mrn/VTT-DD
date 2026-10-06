/**
 * L'aiguilleur des raccourcis (docs/raccourcis.md § 2) : un seul écouteur pour tout le site.
 *
 * Deux passes sur chaque frappe :
 * - **tôt** (capture, sur `document`) : recherche, table. Elles passent avant la page (la
 *   touche N de la table ouvre les notes au lieu d'en créer une) ;
 * - **tard** (fin de propagation, sur `window`) : dés, notes, bulle (`late`). Une touche prise
 *   en chemin par la carte ou un champ (`defaultPrevented`) ne les déclenche pas.
 *
 * La carte garde son écoute (focus sur la carte) et lit ses touches au même endroit
 * (`store.ts`). Jamais pendant la saisie (sauf `inInput`), jamais en répétition de touche.
 * Une séquence (`Space Enter`) attend au plus 1 s entre deux frappes.
 */
import { chordFromEvent, parseBinding, type KeyLike } from './chord';
import type { ShortcutDescriptor } from './registry';

export const SEQUENCE_GAP_MS = 1_000;

export interface ShortcutHandler {
  /** Renvoie faux si rien n'a été fait (Échap sans panneau ouvert) : la frappe continue. */
  run(): boolean | void;
  /** Faux : la commande se tait (pas de héros, panneau absent…). */
  available?(): boolean;
}

interface Bound {
  descriptor: ShortcutDescriptor;
  handler: ShortcutHandler;
}

export type BindingResolver = (descriptor: ShortcutDescriptor) => string | null;

interface KeyEventLike extends KeyLike {
  target: EventTarget | null;
  repeat: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
}

/** Frappe dans un champ, un éditeur, un menu ou une fenêtre (hors panneau de la table). */
export function isTyping(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"], [role="dialog"]:not([data-table-panel]), [role="alertdialog"], [data-shortcut-recorder]',
    ) !== null
  );
}

export class ShortcutDispatcher {
  /** Commandes montées, par id : la dernière montée répond (remontage, deux écrans). */
  private readonly bound = new Map<string, Bound[]>();
  private history: { chord: string; at: number }[] = [];
  private lastEvent: object | null = null;
  private listening = false;

  constructor(
    private resolve: BindingResolver = (d) => d.defaultBinding,
    private readonly now: () => number = () => performance.now(),
  ) {}

  setResolver(resolve: BindingResolver) {
    this.resolve = resolve;
  }

  /** Branche une commande ; renvoie son débranchement. */
  bind(descriptor: ShortcutDescriptor, handler: ShortcutHandler): () => void {
    const entry: Bound = { descriptor, handler };
    this.bound.set(descriptor.id, [...(this.bound.get(descriptor.id) ?? []), entry]);
    this.listen();
    return () => {
      const rest = (this.bound.get(descriptor.id) ?? []).filter((b) => b !== entry);
      if (rest.length) this.bound.set(descriptor.id, rest);
      else this.bound.delete(descriptor.id);
    };
  }

  /** Commandes montées en ce moment (aide-mémoire). */
  active(): ShortcutDescriptor[] {
    return [...this.bound.values()].flatMap((list) => {
      const top = list.at(-1)!;
      return top.handler.available?.() === false ? [] : [top.descriptor];
    });
  }

  /** Traite une frappe pour une passe ; vrai si une commande l'a prise. */
  handle(e: KeyEventLike, phase: 'early' | 'late'): boolean {
    if (e.repeat) return false;
    const chord = chordFromEvent(e);
    if (!chord) return false;
    if (e !== this.lastEvent) {
      this.lastEvent = e;
      const at = this.now();
      const last = this.history.at(-1);
      if (last && at - last.at > SEQUENCE_GAP_MS) this.history = [];
      this.history = [...this.history.slice(-4), { chord, at }];
    }
    if (e.defaultPrevented) return false;
    const typing = isTyping(e.target);

    const matches: { bound: Bound; length: number }[] = [];
    for (const list of this.bound.values()) {
      const top = list.at(-1)!;
      const d = top.descriptor;
      if (d.scope === 'map' || Boolean(d.late) !== (phase === 'late')) continue;
      if (typing && !d.inInput) continue;
      const chords = parseBinding(this.resolve(d));
      if (!chords || chords.length > this.history.length) continue;
      const tail = this.history.slice(-chords.length);
      if (!chords.every((c, i) => c === tail[i]!.chord)) continue;
      matches.push({ bound: top, length: chords.length });
    }
    // La séquence la plus longue d'abord (« Espace Entrée » avant « Entrée »)
    matches.sort((a, b) => b.length - a.length);
    for (const { bound } of matches) {
      if (bound.handler.available?.() === false) continue;
      if (bound.handler.run() === false) continue;
      e.preventDefault();
      this.history = [];
      return true;
    }
    return false;
  }

  private listen() {
    if (this.listening || typeof document === 'undefined') return;
    this.listening = true;
    document.addEventListener('keydown', (e) => this.handle(e, 'early'), { capture: true });
    window.addEventListener('keydown', (e) => this.handle(e, 'late'));
  }
}

/** L'aiguilleur de l'onglet. */
export const shortcuts = new ShortcutDispatcher();

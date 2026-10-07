/**
 * Édition d'un texte en place (docs/carte.md § 10) : un champ DOM posé sur la carte, au-dessus
 * du texte (surcouche React `lib/map/features/drawings/ui/note-editor-overlay.tsx`). Ici, l'état et
 * ce qu'on écrit en sortant, hors de React :
 *
 * - `openNew(pos)` (outil Texte, clic dans le vide) ; `openExisting(entity)` (double clic) : le
 *   texte d'origine est caché pendant l'édition ;
 * - `commit()` (Entrée, clic ailleurs) : créer, modifier, ou supprimer un texte vidé, en une
 *   commande annulable ; `cancel()` (Échap) : rien n'est écrit.
 */
import { translate } from '@/i18n/runtime';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { Point } from '@/lib/map/engine/geometry';
import { deleteCommand } from '@/lib/map/store/commands';
import {
  createNote,
  noteDraft,
  placement,
  roundPoint,
  updateItems,
  type Placement,
} from './operations';
import type { DrawingsRuntime } from './runtime';
import { layoutNote } from './text-layout';
import { NOTES_COLLECTION, type NoteData } from './types';

/** Longueur maximale d'un texte (contrat : 5 000 caractères). */
export const NOTE_MAX_LENGTH = 5_000;
/** Un clic sur la carte qui vient de fermer l'éditeur n'en ouvre pas un autre. */
export const REOPEN_GUARD_MS = 250;

export interface NoteSession {
  /** Texte modifié ; null : nouveau texte. */
  id: string | null;
  /** Début de la ligne de base de la première ligne (monde). */
  pos: Point;
  /** Rotation du texte (degrés, autour de `pos`) : le champ tourne avec lui. */
  rotation: number;
  text: string;
  color: string;
  fontSize: number;
  fontFamily: string | null;
  /** Calque et `z` d'un nouveau texte. */
  place: Placement;
}

export interface NoteEditorState {
  session: NoteSession | null;
}

const EDIT_MASK = 'drawings:editing';

export class NoteEditor {
  readonly store: StoreApi<NoteEditorState> = createStore<NoteEditorState>()(() => ({
    session: null,
  }));
  private closedAt = -Infinity;

  constructor(private readonly rt: Pick<DrawingsRuntime, 'engine' | 'settings' | 'notes'>) {}

  get session(): NoteSession | null {
    return this.store.getState().session;
  }

  /** L'éditeur vient de se fermer (le clic qui l'a fermé ne pose pas un autre texte). */
  recentlyClosed(now = this.rt.engine.now()): boolean {
    return now - this.closedAt < REOPEN_GUARD_MS;
  }

  /** Nouveau texte : `topLeft` est le coin haut gauche de la boîte (le point cliqué). */
  openNew(topLeft: Point) {
    this.commit();
    const engine = this.rt.engine;
    const s = this.rt.settings.getState();
    const layout = layoutNote('', s.text.fontSize, s.text.fontFamily);
    this.store.setState({
      session: {
        id: null,
        pos: roundPoint({ x: topLeft.x, y: topLeft.y + layout.baseline }),
        rotation: 0,
        text: '',
        color: s.text.color,
        fontSize: s.text.fontSize,
        fontFamily: s.text.fontFamily,
        place: placement(engine, s.target),
      },
    });
  }

  /** Modifier un texte existant (caché pendant l'édition). */
  openExisting(entity: MapEntity) {
    this.commit();
    const n = entity.data as NoteData;
    this.rt.engine.setMask(entity, EDIT_MASK, true);
    this.store.setState({
      session: {
        id: entity.id,
        pos: { ...n.pos },
        rotation: typeof n.rotation === 'number' ? n.rotation : 0,
        text: n.text.replace(/<br\s*\/?>/gi, '\n'),
        color: n.color,
        fontSize: n.fontSize,
        fontFamily: n.fontFamily,
        place: { layerId: n.layerId, z: n.z },
      },
    });
  }

  setText(text: string) {
    const s = this.session;
    if (!s) return;
    this.store.setState({ session: { ...s, text: text.slice(0, NOTE_MAX_LENGTH) } });
  }

  /** Écrit ce qui a été saisi (création, modification, ou suppression d'un texte vidé). */
  commit(): Promise<boolean> | null {
    const s = this.session;
    if (!s) return null;
    this.close(s);
    const engine = this.rt.engine;
    const text = s.text.trimEnd();
    if (s.id === null) {
      if (!text.trim()) return null;
      return createNote(
        this.rt as DrawingsRuntime,
        noteDraft(
          engine,
          {
            text,
            pos: s.pos,
            color: s.color,
            fontSize: s.fontSize,
            fontFamily: s.fontFamily,
          },
          s.place,
        ),
      );
    }
    const entity = engine.entity(engine.commands.ctx.resolve(s.id));
    if (!entity) return null;
    if (!text.trim()) {
      // Texte vidé : il disparaît (annulable)
      return engine.execute(
        deleteCommand({
          label: translate('map.drawings.deleteText'),
          collection: NOTES_COLLECTION,
          persistence: this.rt.notes,
          items: [entity.data as NoteData],
        }),
      );
    }
    if (text === (entity.data as NoteData).text) return null;
    return updateItems(
      this.rt as DrawingsRuntime,
      translate('map.drawings.editText'),
      [entity],
      (d) => ({
        ...d,
        text,
      }),
    );
  }

  /** Échap : rien n'est écrit. */
  cancel() {
    const s = this.session;
    if (s) this.close(s);
  }

  private close(s: NoteSession) {
    const engine = this.rt.engine;
    if (s.id) {
      const entity = engine.entity(engine.commands.ctx.resolve(s.id));
      if (entity) engine.setMask(entity, EDIT_MASK, false);
    }
    this.closedAt = engine.now();
    this.store.setState({ session: null });
  }
}

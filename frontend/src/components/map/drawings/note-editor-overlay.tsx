'use client';

/**
 * Édition d'un texte en place (outil Texte, ou double clic sur un texte) : un champ posé sur la
 * carte, à la place et à la taille du texte, qui suit la caméra. Entrée valide, Maj+Entrée va à
 * la ligne, Échap annule ; cliquer ailleurs valide. L'état et l'écriture sont dans
 * `lib/map/modules/drawings/note-editor.ts`.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Kbd } from '@/components/ui/kbd';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { NoteSession } from '@/lib/map/modules/drawings/note-editor';
import { noteFontValue } from '@/lib/map/modules/drawings/palette';
import { layoutNote, LINE_HEIGHT } from '@/lib/map/modules/drawings/text-layout';
import { useCameraTick, useDrawingsRuntime, useNoteEditor } from './use-drawings';

export function NoteEditorOverlay({ engine }: { engine: MapEngine }) {
  const session = useNoteEditor(engine, (s) => s.session);
  useCameraTick(engine, session !== null);
  const host = engine.canvas?.parentElement ?? null;
  if (!session || !host) return null;
  return createPortal(
    <NoteField
      key={session.id ?? `new:${session.pos.x}:${session.pos.y}`}
      engine={engine}
      session={session}
    />,
    host,
  );
}

function NoteField({ engine, session }: { engine: MapEngine; session: NoteSession }) {
  const rt = useDrawingsRuntime(engine);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const focusMap = () => engine.canvas?.parentElement?.focus({ preventScroll: true });
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      rt.editor.cancel();
      focusMap();
    } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void rt.editor.commit();
      focusMap();
    }
  };

  const zoom = engine.camera.zoom;
  const layout = layoutNote(session.text, session.fontSize, session.fontFamily);
  // Coin haut gauche du texte droit ; le champ tourne autour du début de la ligne de base
  const anchor = engine.camera.worldToScreen(session.pos);
  const baselinePx = layout.baseline * zoom;
  const topLeft = { x: anchor.x, y: anchor.y - baselinePx };
  const fontPx = session.fontSize * zoom;
  // Place pour le curseur et le prochain caractère
  const width = Math.max(layout.width, session.fontSize) * zoom + fontPx * 0.75;
  const height = layout.height * zoom;

  return (
    <div className="pointer-events-auto absolute z-20" style={{ left: topLeft.x, top: topLeft.y }}>
      <textarea
        ref={ref}
        aria-label="Texte sur la carte"
        value={session.text}
        onChange={(e) => rt.editor.setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => void rt.editor.commit()}
        rows={1}
        wrap="off"
        spellCheck
        className="block resize-none overflow-hidden whitespace-pre rounded-sm border border-dashed border-primary/70 bg-background/40 p-0 caret-primary outline-none ring-2 ring-primary/20 [text-shadow:0_0_3px_hsl(var(--background))]"
        style={{
          width,
          height,
          transform: session.rotation ? `rotate(${session.rotation}deg)` : undefined,
          transformOrigin: `0 ${baselinePx}px`,
          fontSize: fontPx,
          lineHeight: LINE_HEIGHT,
          fontFamily: noteFontValue(session.fontFamily),
          color: session.color,
        }}
      />
      <p className="mt-1.5 flex w-max items-center gap-1.5 rounded-md border border-border bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-elevated backdrop-blur-md">
        <Kbd>Entrée</Kbd> valider <Kbd>⇧ Entrée</Kbd> à la ligne <Kbd>Échap</Kbd> annuler
      </p>
    </div>
  );
}

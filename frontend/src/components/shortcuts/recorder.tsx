'use client';

/**
 * Saisie d'une touche (docs/raccourcis.md § 5) : un clic, puis la combinaison voulue. Une
 * séquence (jusqu'à 3 frappes) se valide après 1 s sans frappe ; Échap annule. L'aiguilleur se
 * tait pendant la saisie (`data-shortcut-recorder`).
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { bindingLabel, chordFromEvent, MAX_SEQUENCE } from '@/lib/shortcuts/chord';
import { SEQUENCE_GAP_MS } from '@/lib/shortcuts/dispatcher';
import { cn } from '@/lib/utils';

export function ShortcutRecorder({
  binding,
  label,
  single,
  disabled,
  conflict,
  onRecord,
}: Readonly<{
  binding: string | null;
  /** Nom de la commande (annoncé). */
  label: string;
  /** Une seule frappe (carte). */
  single?: boolean;
  disabled?: boolean;
  conflict?: boolean;
  onRecord(binding: string): void;
}>) {
  const [recording, setRecording] = useState(false);
  const [chords, setChords] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRecording(false);
    setChords([]);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const commit = (list: string[]) => {
    stop();
    if (list.length) onRecord(list.join(' '));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') return stop();
    if (e.repeat) return;
    const chord = chordFromEvent(e);
    if (!chord) return;
    const next = [...chords, chord];
    if (single || next.length >= MAX_SEQUENCE) return commit(next);
    setChords(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), SEQUENCE_GAP_MS);
  };

  const shown = recording
    ? chords.length
      ? bindingLabel(chords.join(' '))
      : null
    : bindingLabel(binding);

  return (
    <button
      ref={ref}
      type="button"
      data-shortcut-recorder
      disabled={disabled}
      aria-label={recording ? `Nouvelle touche pour ${label}` : `Touche de ${label}`}
      aria-pressed={recording}
      onClick={() => (recording ? stop() : setRecording(true))}
      onBlur={() => recording && commit(chords)}
      onKeyDown={onKeyDown}
      className={cn(
        'flex h-7 min-w-16 shrink-0 items-center justify-center gap-1 rounded-md border px-2 text-xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        recording
          ? 'border-primary bg-primary/10 text-primary'
          : conflict
            ? 'border-destructive/60 text-foreground hover:bg-surface-2'
            : 'border-border text-foreground hover:bg-surface-2',
        disabled && 'cursor-default opacity-70 hover:bg-transparent',
      )}
    >
      {shown ? (
        <Kbd className="pointer-events-none">{shown}</Kbd>
      ) : (
        <span className={cn(recording ? 'animate-pulse' : 'text-subtle')}>
          {recording ? 'Appuyez…' : 'Aucune'}
        </span>
      )}
    </button>
  );
}

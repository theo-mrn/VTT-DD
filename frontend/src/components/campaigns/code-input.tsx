'use client';

/**
 * Saisie du code de salle en cases, comme l'ancienne app (InputOTP 3 + 3).
 * Un seul vrai champ, transparent, posé sur les cases : collage, effacement
 * et clavier mobile fonctionnent comme dans un champ normal. Un code plus
 * long (code d'invitation, lien collé) bascule sur un champ texte simple.
 */
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { glass } from './elements';

export const ROOM_CODE_LENGTH = 6;

/**
 * Code saisi ou collé : celui d'un lien d'invitation (…/join/<code>,
 * …/rejoindre/<code>, ?code=), sinon le texte lui-même. Un code de salle
 * (6 caractères) passe en capitales, sans espaces ni tirets, comme le
 * service l'accepte ; un code d'invitation garde sa casse.
 */
export function normalizeCode(raw: string): string {
  const text = raw.trim();
  const m = text.match(/\/(?:join|rejoindre)\/([^/?#\s]+)/) ?? text.match(/[?&]code=([^&#\s]+)/);
  if (m) return decodeURIComponent(m[1]!);
  const compact = text.replace(/[\s-]+/g, '');
  const roomCode = compact.length <= ROOM_CODE_LENGTH && !/^inv_/i.test(compact);
  return roomCode ? compact.toUpperCase() : text.replace(/\s+/g, '').replace(/^inv_/i, 'inv_');
}

export function CodeInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const long = value.length > ROOM_CODE_LENGTH;
  const slot = (i: number) => {
    const active =
      focused &&
      (i === value.length || (i === ROOM_CODE_LENGTH - 1 && value.length === ROOM_CODE_LENGTH));
    return (
      <div
        key={i}
        className={cn(
          'flex h-14 w-11 items-center justify-center rounded-xl border font-mono text-xl text-[var(--text-primary)] backdrop-blur-md transition-all xs:w-12 sm:w-14',
          active
            ? 'border-[var(--accent-brown)] shadow-[0_0_30px_rgba(192,160,128,0.15)]'
            : 'border-[var(--border-color)]',
        )}
        style={glass()}
      >
        {value[i] ??
          (active ? <span className="h-6 w-px animate-pulse bg-[var(--text-primary)]" /> : null)}
      </div>
    );
  };

  return (
    <div className="relative w-full">
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(normalizeCode(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        autoComplete="one-time-code"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={200}
        aria-label="Code de la salle ou code d'invitation"
        className={cn(
          long
            ? 'h-14 w-full rounded-xl border border-[var(--border-color)] px-4 font-mono text-sm text-[var(--text-primary)] outline-none backdrop-blur-md focus:border-[var(--accent-brown)]'
            : 'absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent',
        )}
        style={long ? glass() : undefined}
      />
      {!long && (
        <div
          className="flex items-center justify-center"
          aria-hidden
          onClick={() => ref.current?.focus()}
        >
          <div className="flex gap-2">{[0, 1, 2].map(slot)}</div>
          <div className="mx-1 text-[var(--text-secondary)] sm:mx-2">
            <div className="h-1 w-3 rounded-full bg-current" />
          </div>
          <div className="flex gap-2">{[3, 4, 5].map(slot)}</div>
        </div>
      )}
    </div>
  );
}

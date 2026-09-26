'use client';

/**
 * Notifications du panneau de dés : remplace `sonner` (absent du nouveau front)
 * avec la même forme d'appel (`toast(msg, { description, duration })`,
 * `toast.info`, `toast.success`, `toast.error`) pour garder le code repris de
 * l'ancienne app. `<Toaster />` les affiche, une seule fois par page.
 */
import { CircleAlert, CircleCheck, Dices, Info, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

type Tone = 'default' | 'info' | 'success' | 'error';

interface ToastOptions {
  description?: string;
  duration?: number;
  id?: string;
}

interface ToastItem {
  id: string;
  tone: Tone;
  title: string;
  description?: string;
}

const MAX = 4;
let items: ToastItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function dismiss(id: string) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(tone: Tone, title: string, options: ToastOptions = {}) {
  const id = options.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  items = [
    ...items.filter((t) => t.id !== id),
    {
      id,
      tone,
      title,
      ...(options.description ? { description: options.description } : {}),
    },
  ].slice(-MAX);
  emit();
  if (typeof window !== 'undefined')
    window.setTimeout(() => dismiss(id), options.duration ?? (tone === 'error' ? 6000 : 4000));
  return id;
}

export const toast = Object.assign(
  (title: string, options?: ToastOptions) => push('default', title, options),
  {
    info: (title: string, options?: ToastOptions) => push('info', title, options),
    success: (title: string, options?: ToastOptions) => push('success', title, options),
    error: (title: string, options?: ToastOptions) => push('error', title, options),
    dismiss,
  },
);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const ICONS: Record<Tone, typeof Info> = {
  default: Dices,
  info: Info,
  success: CircleCheck,
  error: CircleAlert,
};

const COLORS: Record<Tone, string> = {
  default: 'var(--accent-brown)',
  info: 'var(--accent-blue, #5c6bc0)',
  success: '#10b981',
  error: '#f87171',
};

export function Toaster() {
  const list = useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !list.length) return null;
  return createPortal(
    <ol
      className="pointer-events-none fixed inset-x-3 bottom-20 z-[10020] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-96"
      aria-live="polite"
    >
      {list.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <li
            key={t.id}
            className="animate-in fade-in slide-in-from-bottom-2 pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-3 shadow-2xl"
            style={{
              background: 'var(--bg-darker)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)',
            }}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: COLORS[t.tone] }} />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-bold">{t.title}</p>
              {t.description && (
                <p
                  className="truncate font-mono text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                  title={t.description}
                >
                  {t.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded p-0.5 text-zinc-500 hover:text-zinc-200"
              aria-label="Fermer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        );
      })}
    </ol>,
    document.body,
  );
}

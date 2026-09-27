'use client';

/**
 * Notifications de la carte : remplace `sonner` (absent du nouveau front) avec
 * la même forme d'appel que le code repris de l'ancienne app
 * (`toast(msg, { description, duration })`, `toast.info`, `toast.success`,
 * `toast.error`). Même mécanique que les notifications du panneau de dés
 * (components/dice-roller/toast.tsx), avec sa propre file : `<Toaster />`
 * les affiche, une seule fois par page.
 */
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
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

function dismiss(id?: string) {
  items = id ? items.filter((t) => t.id !== id) : [];
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
  return () => void listeners.delete(l);
};

const ICONS: Record<Tone, typeof Info> = {
  default: Info,
  info: Info,
  success: CircleCheck,
  error: CircleAlert,
};

const COLORS: Record<Tone, string> = {
  default: 'var(--accent-brown)',
  info: 'var(--accent-blue)',
  success: 'var(--accent-brown)',
  error: 'hsl(var(--destructive))',
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
      className="pointer-events-none fixed inset-x-3 top-20 z-[10020] flex flex-col items-center gap-2 sm:inset-x-auto sm:left-1/2 sm:w-96 sm:-translate-x-1/2"
      aria-live="polite"
    >
      {list.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <li
            key={t.id}
            className="animate-in fade-in slide-in-from-top-2 pointer-events-auto flex w-full items-start gap-3 rounded-xl border p-3 shadow-2xl"
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
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {t.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded p-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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

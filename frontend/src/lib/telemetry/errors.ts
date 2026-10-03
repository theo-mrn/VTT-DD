/**
 * Erreurs du navigateur (docs/observabilite.md § 4) : exceptions non rattrapées, promesses
 * rejetées et composants isolés par une frontière d'erreur. Sans dépendance : la capture commence
 * dès le premier affichage, les erreurs attendent dans un tampon que le SDK (chargé plus tard)
 * les envoie. Une même erreur part au plus une fois par minute.
 */

export interface ClientError {
  type: string;
  message: string;
  stack?: string;
  /** Origine : `window`, `promise`, ou le nom de la frontière d'erreur. */
  source: string;
  /** Chemin de la page, sans paramètres ni fragment. */
  path: string;
  /** Pile des composants React, pour une frontière d'erreur. */
  componentStack?: string;
}

type Sink = (e: ClientError) => void;

const BUFFER_MAX = 50;
const DEDUPE_MS = 60_000;
const STACK_MAX = 4_000;

let sink: Sink | null = null;
const buffer: ClientError[] = [];
const lastSent = new Map<string, number>();

/** Branche l'envoi (SDK chargé) : le tampon part aussitôt. */
export function setErrorSink(next: Sink): void {
  sink = next;
  for (const e of buffer.splice(0)) next(e);
}

/** Signale une erreur ; à appeler aussi depuis les frontières d'erreur (`componentDidCatch`). */
export function reportClientError(
  error: unknown,
  source: string,
  extra: { componentStack?: string | null } = {},
): void {
  if (typeof window === 'undefined') return;
  const e = error instanceof Error ? error : new Error(String(error));
  const key = `${e.name}:${e.message}:${e.stack?.split('\n')[1] ?? ''}`;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < DEDUPE_MS) return;
  lastSent.set(key, now);
  const entry: ClientError = {
    type: e.name,
    message: e.message.slice(0, 1_000),
    source,
    path: window.location.pathname,
    ...(e.stack ? { stack: e.stack.slice(0, STACK_MAX) } : {}),
    ...(extra.componentStack ? { componentStack: extra.componentStack.slice(0, STACK_MAX) } : {}),
  };
  if (sink) sink(entry);
  else if (buffer.length < BUFFER_MAX) buffer.push(entry);
}

let installed = false;

/** Écoute les erreurs non rattrapées de la page (une seule fois). */
export function installErrorCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (ev) => {
    // Ressource introuvable (image, script) : pas une exception
    if (!ev.error && !ev.message) return;
    reportClientError(ev.error ?? ev.message, 'window');
  });
  window.addEventListener('unhandledrejection', (ev) => reportClientError(ev.reason, 'promise'));
}

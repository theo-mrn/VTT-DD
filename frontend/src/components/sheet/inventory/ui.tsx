'use client';

/** Éléments communs de l'inventaire : contexte interne, dialogue au thème de la fiche, liste de choix. */
import type { Sorte } from '@vtt/rules';
import {
  createContext,
  useContext,
  useState,
  type CSSProperties,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { field, textMuted, titleFont } from '../styles';
import type { InventoryWidgetProps } from './types';
import type { Option } from './model';

// ─── Contexte interne ────────────────────────────────────────────────────────

export interface InventoryContextValue extends Omit<InventoryWidgetProps, 'kinds'> {
  /** Sortes affichées, dans l'ordre du système. */
  kinds: Sorte[];
  /** Variables CSS du thème, reposées sur les dialogues. */
  variables: CSSProperties;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);
export const InventoryProvider = InventoryContext.Provider;

export function useInventory(): InventoryContextValue {
  const c = useContext(InventoryContext);
  if (!c) throw new Error('useInventory doit être utilisé dans <InventoryWidget>');
  return c;
}

/** Lance une écriture en signalant l'attente (boutons désactivés pendant l'envoi). */
export function useSending() {
  const [sending, setSending] = useState(false);
  const run = async (f: () => Promise<boolean>) => {
    setSending(true);
    try {
      return await f();
    } finally {
      setSending(false);
    }
  };
  return [sending, run] as const;
}

// ─── Dialogue ────────────────────────────────────────────────────────────────

/** Dialogue rendu hors du cadre de la fiche (portail) : il repose les variables du thème. */
export function InventoryDialog({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose(): void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}) {
  const { variables } = useInventory();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={size === 'xl' ? 'sm:max-w-5xl' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'}
      >
        <div
          style={variables}
          className="max-h-[85vh] space-y-4 overflow-y-auto pr-1 font-[family-name:var(--fiche-police-corps)]"
        >
          <DialogHeader>
            <DialogTitle className={cn(titleFont, 'pr-8 text-white')}>{title}</DialogTitle>
            <DialogDescription className={cn(textMuted, !description && 'sr-only')}>
              {description ?? title}
            </DialogDescription>
          </DialogHeader>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Liste de choix ──────────────────────────────────────────────────────────

/** Liste native (accessible, utilisable au clavier et sur mobile), options rangées par groupe. */
export function Select({
  options,
  placeholder,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options: Option[]; placeholder?: string }) {
  const groups = new Map<string, Option[]>();
  for (const o of options) groups.set(o.group ?? '', [...(groups.get(o.group ?? '') ?? []), o]);
  return (
    <select {...props} className={cn(field, 'pr-8', className)}>
      {placeholder !== undefined && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {[...groups].map(([group, list]) =>
        group ? (
          <optgroup key={group} label={group}>
            {list.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : (
          list.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        ),
      )}
    </select>
  );
}

/** Normalise un texte pour la recherche (casse et accents ignorés). */
export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

'use client';

/**
 * Tiroir d'ajustement d'une ressource, repris de l'ancienne fiche : il monte
 * du bas de l'écran, avec −5 / −1 / valeur / +1 / +5 et le repos complet de
 * la ressource (vers son maximum, ou vers zéro pour une jauge qui se remplit).
 */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { Attribut } from '@vtt/rules';
import { Minus, Plus } from 'lucide-react';
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { formatNumber } from './format';
import { focus, secondaryButton, text, textAccent, textMuted, titleFont } from './styles';

type Resource = Extract<Attribut, { nature: 'ressource' }>;

function RoundButton({
  children,
  large,
  ...props
}: { children: ReactNode; large?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] font-bold transition-colors hover:border-[color:var(--fiche-accent)] disabled:cursor-not-allowed disabled:opacity-40',
        text,
        large ? 'h-10 w-10 text-sm' : 'h-8 w-8',
        focus,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function AdjustDrawer({ attribute: a, onClose }: { attribute: Resource; onClose(): void }) {
  const { json, variables, setValues, rest } = useSheet();
  const [sending, setSending] = useState(false);
  const v = json.valeurs[a.cle];
  const current = typeof v?.valeur === 'number' ? v.valeur : 0;
  const min = v?.min ?? 0;
  const max = v?.max ?? 0;
  const atMax = a.plafonnee && current >= max;
  const recoversToMin = a.recuperation === 'min';
  const target = recoversToMin ? min : max;
  const recovered = current === target;

  const adjust = (amount: number) => {
    const next = Math.max(min, a.plafonnee ? Math.min(max, current + amount) : current + amount);
    if (next !== current) void setValues({ [a.cle]: next });
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          style={variables}
          className={cn(
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom fixed inset-x-0 bottom-0 z-50 mt-24 rounded-t-[10px] border border-b-0 border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-fond)] font-[family-name:var(--fiche-police-corps)] outline-none duration-300',
            text,
          )}
        >
          <div
            aria-hidden
            className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-[color:var(--fiche-bordure)]"
          />
          <div className="mx-auto w-full max-w-sm">
            <div className="p-4 text-center sm:text-left">
              <DialogPrimitive.Title className={cn(titleFont, textAccent, 'text-lg font-semibold')}>
                Ajuster {a.nom}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className={cn(textMuted, 'text-sm')}>
                Modifiez {a.nom.toLowerCase()} de votre personnage.
              </DialogPrimitive.Description>
            </div>
            <div className="p-4 pb-0">
              <div className="flex items-center justify-center space-x-2">
                <RoundButton
                  large
                  aria-label={`${a.nom} : retirer 5`}
                  disabled={current <= min}
                  onClick={() => adjust(-5)}
                >
                  −5
                </RoundButton>
                <RoundButton
                  aria-label={`${a.nom} : retirer 1`}
                  disabled={current <= min}
                  onClick={() => adjust(-1)}
                >
                  <Minus className="h-4 w-4" />
                </RoundButton>
                <div className="flex-1 text-center" aria-live="polite">
                  <div className="text-5xl font-bold tracking-tighter tabular-nums">
                    {formatNumber(current)}
                  </div>
                  <div className={cn(textMuted, 'text-[0.70rem] uppercase')}>
                    {a.nom} actuel · {formatNumber(max)} max
                  </div>
                </div>
                <RoundButton
                  aria-label={`${a.nom} : ajouter 1`}
                  disabled={atMax}
                  onClick={() => adjust(1)}
                >
                  <Plus className="h-4 w-4" />
                </RoundButton>
                <RoundButton
                  large
                  aria-label={`${a.nom} : ajouter 5`}
                  disabled={atMax}
                  onClick={() => adjust(5)}
                >
                  +5
                </RoundButton>
              </div>
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  className={cn(
                    textAccent,
                    'rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-[color:var(--fiche-carte)] disabled:cursor-not-allowed disabled:opacity-40',
                    focus,
                  )}
                  disabled={recovered || sending}
                  onClick={async () => {
                    setSending(true);
                    await rest([a.cle]);
                    setSending(false);
                  }}
                >
                  {recoversToMin ? `Récupération complète (${a.nom})` : `Repos complet (${a.nom})`}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2 p-4">
              <DialogPrimitive.Close className={cn(secondaryButton, 'w-full')}>
                Fermer
              </DialogPrimitive.Close>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

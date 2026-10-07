'use client';

/**
 * Fenêtre d'ajustement d'une ressource (PV, stress…) : la valeur actuelle en grand avec sa
 * jauge, Dégâts, Soins ou Fixer, un montant (raccourcis 1, 2, 5, 10) et l'aperçu du
 * résultat, borné par le minimum et le maximum de la ressource. Rien n'est propre à un jeu.
 */
import { useTranslations } from 'next-intl';
import { translate } from '@/i18n/runtime';
import type { LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Mode = 'retirer' | 'ajouter' | 'fixer';

/** Modes d'ajustement ; nom : `sheet.resource.modes.<mode>`. */
const MODES: readonly Mode[] = ['retirer', 'ajouter', 'fixer'];

const RACCOURCIS = [1, 2, 5, 10];

export function ResourceDialog({
  nom,
  valeur,
  min,
  max,
  couleur,
  Icone,
  onAjuster,
  children,
}: Readonly<{
  nom: string;
  valeur: number;
  min?: number;
  max?: number;
  couleur?: string;
  Icone?: LucideIcon | null;
  onAjuster: (delta: number) => void;
  /** Déclencheur (la valeur affichée sur la fiche). */
  children: ReactNode;
}>) {
  const t = useTranslations();
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState<Mode>('retirer');
  const [texte, setTexte] = useState('');

  const montant = Number(texte.replace(',', '.'));
  const lisible = texte.trim() !== '' && Number.isFinite(montant) && montant >= 0;
  const brute = lisible ? ajuster(mode, valeur, montant) : valeur;
  const suivante = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, brute));
  const delta = suivante - valeur;

  const fermer = (o: boolean) => {
    setOuvert(o);
    if (!o) {
      setTexte('');
      setMode('retirer');
    }
  };
  const valider = () => {
    if (!delta) return;
    onAjuster(delta);
    fermer(false);
  };
  const action = libelleAction(mode, valeur, suivante);

  return (
    <Dialog open={ouvert} onOpenChange={fermer}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icone && (
              <Icone
                aria-hidden
                className="size-5"
                style={couleur ? { color: couleur } : undefined}
              />
            )}
            {nom}
          </DialogTitle>
          <DialogDescription>{t('sheet.resource.hint')}</DialogDescription>
        </DialogHeader>

        {/* Valeur actuelle et aperçu */}
        <Apercu valeur={valeur} suivante={suivante} max={max} couleur={couleur} />

        {/* Dégâts, soins ou valeur fixée */}
        <div
          role="radiogroup"
          aria-label={t('sheet.resource.type')}
          className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface-2 p-1"
        >
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'h-9 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                mode === m
                  ? MODE_ACTIF[m]
                  : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
              )}
            >
              {t(`sheet.resource.modes.${m}`)}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <label htmlFor="ressource-montant" className="text-xs font-medium text-muted-foreground">
            {mode === 'fixer' ? t('sheet.resource.newValue') : t('sheet.resource.amount')}
          </label>
          <Input
            id="ressource-montant"
            autoFocus
            inputMode="numeric"
            autoComplete="off"
            value={texte}
            placeholder="0"
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && valider()}
            className="h-12 text-center font-mono text-2xl tabular-nums"
          />
          {mode !== 'fixer' && (
            <div className="grid grid-cols-4 gap-1.5">
              {RACCOURCIS.map((n) => (
                <Button
                  key={n}
                  variant="secondary"
                  size="sm"
                  onClick={() => setTexte(String((lisible ? montant : 0) + n))}
                >
                  +{n}
                </Button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => fermer(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            variant={mode === 'retirer' ? 'destructive' : 'default'}
            disabled={!delta}
            onClick={valider}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MODE_ACTIF: Record<Mode, string> = {
  retirer: 'bg-destructive/15 text-destructive',
  ajouter: 'bg-success/15 text-success',
  fixer: 'bg-primary/15 text-primary',
};

/** Valeur après l'ajustement saisi (avant les bornes). */
/** Valeur actuelle, valeur après ajustement et écart ; jauge avant et après (avec un maximum). */
function Apercu({
  valeur,
  suivante,
  max,
  couleur,
}: Readonly<{ valeur: number; suivante: number; max?: number; couleur?: string }>) {
  const delta = suivante - valeur;
  const part = (n: number) => (max && max > 0 ? Math.max(0, Math.min(1, n / max)) : 0);
  return (
    <div className="space-y-2">
      <p className="flex items-baseline gap-3 font-mono tabular-nums">
        <span className={cn('text-4xl font-semibold', delta !== 0 && 'text-subtle')}>{valeur}</span>
        {delta !== 0 && (
          <>
            <span aria-hidden className="text-xl text-subtle">
              →
            </span>
            <span className="text-4xl font-semibold">{suivante}</span>
            <span
              className={cn('text-sm font-medium', delta < 0 ? 'text-destructive' : 'text-success')}
            >
              {delta > 0 ? `+${delta}` : `−${-delta}`}
            </span>
          </>
        )}
        {max !== undefined && <span className="ml-auto text-base text-subtle">/ {max}</span>}
      </p>
      {max !== undefined && (
        <div className="relative h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full opacity-35',
              !couleur && 'bg-success',
            )}
            style={{
              width: `${part(valeur) * 100}%`,
              ...(couleur ? { background: couleur } : {}),
            }}
          />
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-[width] duration-200',
              !couleur && 'bg-success',
            )}
            style={{
              width: `${part(suivante) * 100}%`,
              ...(couleur ? { background: couleur } : {}),
            }}
          />
        </div>
      )}
    </div>
  );
}

function ajuster(mode: Mode, valeur: number, montant: number): number {
  if (mode === 'retirer') return valeur - montant;
  if (mode === 'ajouter') return valeur + montant;
  return montant;
}

function libelleAction(mode: Mode, valeur: number, suivante: number): string {
  if (mode === 'retirer') return translate('sheet.resource.remove', { value: valeur - suivante });
  if (mode === 'ajouter') return translate('sheet.resource.add', { value: suivante - valeur });
  return translate('sheet.resource.setTo', { value: suivante });
}

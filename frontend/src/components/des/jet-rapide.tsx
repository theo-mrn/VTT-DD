'use client';

/**
 * Jet rapide (docs/raccourcis.md, `dice.quick-roll`, Espace puis Entrée comme le legacy) : un
 * champ flottant, on tape la notation (`1d20 + mod(@FOR)`), Entrée lance et ferme, Échap ferme.
 * ↑ et ↓ rappellent les dernières formules. À la table, le jet part avec le héros incarné ;
 * ailleurs, c'est un jet personnel.
 */
import { translate } from '@/i18n/runtime';
import { useTranslations } from 'next-intl';
import { Dices } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { ApiError, messageErreur } from '@/lib/api';
import { useLancer, verifierFormule, type Jet } from '@/lib/jets';
import { GENERAL_SHORTCUTS } from '@/lib/shortcuts/catalog';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import type { Fiche } from '@vtt/rules';

const HISTORIQUE = 'yner:ui:des:jets-rapides';
const HISTORIQUE_MAX = 20;

export function lireHistorique(): string[] {
  try {
    const brut = JSON.parse(localStorage.getItem(HISTORIQUE) ?? '[]') as unknown;
    return Array.isArray(brut) ? brut.filter((f): f is string => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

export function retenir(formule: string) {
  try {
    const liste = [formule, ...lireHistorique().filter((f) => f !== formule)];
    localStorage.setItem(HISTORIQUE, JSON.stringify(liste.slice(0, HISTORIQUE_MAX)));
  } catch {
    // Stockage indisponible : pas d'historique, le jet part quand même
  }
}

/** Résultat d'un jet lancé hors du panneau des dés : une notification. */
export function annoncerJet(jet: Jet) {
  const titre = jet.label?.trim() || jet.formula;
  const resultat =
    jet.symbolResult ??
    (jet.total === null ? translate('dice.launcher.hiddenRoll') : String(jet.total));
  toast(translate('dice.launcher.rollAnnounce', { title: titre, result: resultat }), {
    description: jet.total === null ? undefined : jet.output,
  });
}

export function JetRapide({
  open,
  onOpenChange,
  fiche,
  onRoll,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Fiche du héros : `@FOR` a un sens, la formule est vérifiée avec elle. */
  fiche?: Fiche | null;
  onRoll(formule: string): void;
}>) {
  const t = useTranslations('dice.quick');
  const [formule, setFormule] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const position = useRef(-1);
  const historique = useRef<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setFormule('');
    setErreur(null);
    position.current = -1;
    historique.current = lireHistorique();
  }, [open]);

  const lancer = () => {
    const f = formule.trim();
    if (!f) return onOpenChange(false);
    const verif = verifierFormule(f, fiche);
    if (!verif.ok) return setErreur(verif.message);
    retenir(f);
    onOpenChange(false);
    onRoll(f);
  };

  const rappeler = (pas: 1 | -1) => {
    const liste = historique.current;
    if (!liste.length) return;
    const i = Math.max(-1, Math.min(liste.length - 1, position.current + pas));
    position.current = i;
    setFormule(i < 0 ? '' : liste[i]!);
    setErreur(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      lancer();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      rappeler(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      rappeler(-1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        unstyled
        showCloseButton={false}
        className="top-[18vh] translate-y-0 sm:max-w-sm data-[state=open]:slide-in-from-top-2"
      >
        <DialogTitle className="sr-only">{t('title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('lead')}</DialogDescription>
        <div
          className={cn(
            'flex items-center gap-2 rounded-xl border bg-popover px-3.5 py-2.5 shadow-elevated',
            erreur ? 'border-destructive/60' : 'border-border-strong',
          )}
        >
          <Dices className="size-5 shrink-0 text-primary" aria-hidden />
          <input
            autoFocus
            value={formule}
            onChange={(e) => {
              setFormule(e.target.value);
              setErreur(null);
            }}
            onKeyDown={onKeyDown}
            placeholder="1d20 + 3"
            aria-label={t('notation')}
            aria-invalid={erreur ? true : undefined}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent font-mono text-base text-foreground outline-none placeholder:text-subtle"
          />
          <Kbd aria-hidden>{t('enter')}</Kbd>
        </div>
        {erreur && (
          <p role="alert" className="mt-1.5 px-1 text-xs text-destructive">
            {erreur}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Jet rapide hors de la table : un jet personnel, sa touche branchée tant que l'hôte est monté. */
export function JetRapidePersonnel() {
  const [open, setOpen] = useState(false);
  const lancer = useLancer();
  useShortcut(GENERAL_SHORTCUTS.quickRoll, () => setOpen((o) => !o));

  const onRoll = (formule: string) => {
    lancer
      .mutateAsync({ formula: formule, label: null, roomId: null })
      .then(annoncerJet)
      .catch((err: unknown) =>
        toast.error(translate('dice.launcher.rollFailed'), {
          description:
            err instanceof ApiError || !(err instanceof Error) ? messageErreur(err) : err.message,
        }),
      );
  };

  return <JetRapide open={open} onOpenChange={setOpen} onRoll={onRoll} />;
}

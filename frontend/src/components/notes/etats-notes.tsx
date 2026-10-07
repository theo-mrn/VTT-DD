'use client';

import { useTranslations } from 'next-intl';
import { CloudOff, FileQuestion, NotebookPen, Plus, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { EtatVide } from '@/components/commun/page';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { MODELES_NOTE, type ModeleNote } from './modeles';

/** Raccourcis de l'accueil ; libellé : `notes.shortcuts.<id>`. */
const RACCOURCIS: { id: 'new' | 'search' | 'browse' | 'open'; touches: ReactNode }[] = [
  { id: 'new', touches: <Kbd>N</Kbd> },
  { id: 'search', touches: <Kbd>/</Kbd> },
  {
    touches: (
      <>
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
      </>
    ),
    id: 'browse',
  },
  { id: 'open', touches: <Kbd>⏎</Kbd> },
];

/** Volet d'édition sans note ouverte (grand écran). */
export function AccueilEditeur({
  onNouvelle,
  enCours,
}: Readonly<{
  onNouvelle: () => void;
  enCours: boolean;
}>) {
  const t = useTranslations();
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-8 text-center">
      <div aria-hidden className="absolute inset-0 bg-dots opacity-50 mask-radial" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-64 bg-halo" />
      <div className="relative flex flex-col items-center animate-fade-up">
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-border-strong bg-surface-2 shadow-elevated">
          <NotebookPen className="size-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{t('notes.empty.pick')}</h2>
        <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{t('notes.empty.pickHint')}</p>
        <Button className="mt-6" onClick={onNouvelle} loading={enCours}>
          {!enCours && <Plus />}
          {t('notes.new')}
        </Button>
        <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-2.5 text-left text-xs">
          {RACCOURCIS.map((r) => (
            <div key={r.id} className="flex items-center gap-2.5">
              <dt className="flex min-w-[44px] items-center gap-1">{r.touches}</dt>
              <dd className="text-subtle">{t(`notes.shortcuts.${r.id}`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** Aucune note du tout : invitation à écrire la première, avec les modèles. */
export function GrimoireVide({
  onNouvelle,
  enCours,
}: Readonly<{
  onNouvelle: (modele?: ModeleNote) => void;
  enCours: boolean;
}>) {
  const t = useTranslations();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col justify-center px-4 py-8 sm:px-6 lg:min-h-full lg:py-12">
      <EtatVide
        icone={NotebookPen}
        titre={t('notes.empty.title')}
        description={t('notes.empty.hint')}
        className="bg-surface/30 py-12"
        action={
          <Button onClick={() => onNouvelle()} loading={enCours}>
            {!enCours && <Plus />}
            {t('notes.empty.first')}
          </Button>
        }
      />
      <div className="mt-8">
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.14em] text-subtle">
          {t('notes.empty.fromTemplate')}
        </p>
        <div className="grid gap-2 sm:grid-cols-5">
          {MODELES_NOTE.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={enCours}
              onClick={() => onNouvelle(m)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface/60 p-3 text-left shadow-surface transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px hover:border-primary/30 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 sm:flex-col sm:items-start sm:gap-2.5 sm:p-3.5"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-2 text-xl leading-none transition-transform duration-150 group-hover:scale-105">
                {m.icone}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium leading-snug text-foreground">
                  {t(`notes.templates.${m.id}.label`)}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-subtle">
                  {t(`notes.templates.${m.id}.description`)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Les notes n'ont pas pu être chargées (service injoignable). */
export function ErreurNotes({
  message,
  onReessayer,
}: Readonly<{
  message: string;
  onReessayer: () => void;
}>) {
  const t = useTranslations();
  return (
    <div className="flex items-center justify-center p-6 lg:h-[calc(100dvh-3.5rem)]">
      <EtatVide
        icone={CloudOff}
        titre={t('notes.empty.loadFailed')}
        description={message}
        className="w-full max-w-md"
        action={
          <Button variant="secondary" onClick={onReessayer}>
            <RotateCw />
            {t('common.actions.retry')}
          </Button>
        }
      />
    </div>
  );
}

/** Lien vers une note qui n'existe plus (supprimée, autre compte). */
export function NoteIntrouvable({ onRetour }: Readonly<{ onRetour: () => void }>) {
  const t = useTranslations();
  return (
    <div className="flex h-full items-center justify-center p-6">
      <EtatVide
        icone={FileQuestion}
        titre={t('notes.empty.notFound')}
        description={t('notes.empty.notFoundHint')}
        className="w-full max-w-md"
        action={
          <Button variant="secondary" onClick={onRetour}>
            {t('notes.empty.back')}
          </Button>
        }
      />
    </div>
  );
}

/** Éditeur en cours de chargement (lien direct vers une note). */
export function SqueletteEditeur() {
  return (
    <div className="mx-auto w-full max-w-[740px] px-5 pt-20 sm:px-8 lg:px-12" aria-busy>
      <Skeleton className="mb-4 size-14 rounded-2xl" />
      <Skeleton className="h-9 w-2/3" />
      <div className="mt-7 space-y-3">
        {[40, 52, 30, 46].map((l) => (
          <div key={l} className="flex gap-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4" style={{ width: `${l}%` }} />
          </div>
        ))}
      </div>
      <Skeleton className="my-7 h-px w-full" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

/** Espace complet en attente (Suspense des paramètres d'URL). */
export function SqueletteEspace() {
  return (
    <div className="lg:flex lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden">
      <div className="w-full shrink-0 space-y-3 border-border p-4 lg:w-[340px] lg:border-r xl:w-[360px]">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-9 w-full" />
        <div className="flex gap-1.5">
          {[56, 88, 60, 84].map((l) => (
            <Skeleton key={l} className="h-7 rounded-full" style={{ width: l }} />
          ))}
        </div>
      </div>
      <div className="hidden flex-1 lg:block">
        <SqueletteEditeur />
      </div>
    </div>
  );
}

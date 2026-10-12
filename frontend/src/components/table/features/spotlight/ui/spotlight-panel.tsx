'use client';

import { useTranslations } from 'next-intl';
import { Pause, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTable } from '../../../contexte';

/** Temps de scène de la séance, gardé dans l'onglet (une séance = un onglet ouvert). */
interface Spotlight {
  totals: Record<string, number>;
  current: string | null;
  since: number | null;
}

const VIDE: Spotlight = { totals: {}, current: null, since: null };
const cle = (campaignId: string) => `vtt:spotlight:${campaignId}`;

function lire(campaignId: string): Spotlight {
  try {
    const raw = sessionStorage.getItem(cle(campaignId));
    return raw ? { ...VIDE, ...(JSON.parse(raw) as Spotlight) } : VIDE;
  } catch {
    return VIDE;
  }
}

const temps = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Projecteur (MJ) : qui a la scène, et depuis combien de temps chacun l'a eue cette séance.
 * Un clic sur un joueur lui donne la scène ; « Au suivant » la donne à celui qui l'a eue le
 * moins. Pour équilibrer la table d'un coup d'œil, rien n'est montré aux joueurs.
 */
export function SpotlightPanel() {
  const t = useTranslations('table.spotlight');
  const { campagne } = useTable();
  const joueurs = useMemo(
    () => campagne.members.filter((m) => m.role !== 'gm'),
    [campagne.members],
  );
  const [etat, setEtat] = useState<Spotlight>(() => lire(campagne.id));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      sessionStorage.setItem(cle(campagne.id), JSON.stringify(etat));
    } catch {
      // Stockage indisponible : le décompte vit le temps du panneau
    }
  }, [campagne.id, etat]);

  useEffect(() => {
    if (!etat.current) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [etat.current]);

  const total = (id: string) =>
    (etat.totals[id] ?? 0) + (etat.current === id && etat.since ? now - etat.since : 0);

  /** Arrête le projecteur en cours (son temps est compté) et le pose sur `id`. */
  const donner = (id: string | null) =>
    setEtat((e) => {
      const t0 = Date.now();
      const totals = { ...e.totals };
      if (e.current && e.since) totals[e.current] = (totals[e.current] ?? 0) + t0 - e.since;
      return { totals, current: id, since: id ? t0 : null };
    });

  const max = Math.max(1, ...joueurs.map((j) => total(j.userId)));
  const moinsServi = [...joueurs].sort((a, b) => total(a.userId) - total(b.userId))[0];

  if (!joueurs.length) return <p className="p-4 text-sm text-muted-foreground">{t('noPlayers')}</p>;

  return (
    <div className="space-y-4 p-4">
      <ul className="space-y-1.5">
        {joueurs.map((j) => {
          const actif = etat.current === j.userId;
          const ms = total(j.userId);
          return (
            <li key={j.userId}>
              <button
                type="button"
                aria-pressed={actif}
                onClick={() => donner(actif ? null : j.userId)}
                className={cn(
                  'relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  actif
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border/70 hover:border-border-strong',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-y-0 left-0 transition-[width] duration-700',
                    actif ? 'bg-primary/15' : 'bg-surface-2/80',
                  )}
                  style={{ width: `${(ms / max) * 100}%` }}
                />
                <span className="relative">
                  <Illustration
                    largeur={48}
                    src={j.avatarUrl}
                    graine={j.name}
                    className="size-8 rounded-full"
                  />
                  {actif && (
                    <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full bg-primary ring-2 ring-card" />
                  )}
                </span>
                <span className="relative min-w-0 flex-1 truncate text-sm font-medium">
                  {j.name}
                </span>
                <span className="relative font-mono text-xs tabular-nums text-muted-foreground">
                  {temps(ms)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-1.5">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => moinsServi && donner(moinsServi.userId)}
        >
          <SkipForward />
          {t('next')}
        </Button>
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label={t('pause')}
          disabled={!etat.current}
          onClick={() => donner(null)}
        >
          <Pause />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('reset')}
          onClick={() => setEtat(VIDE)}
        >
          <RotateCcw />
        </Button>
      </div>
    </div>
  );
}

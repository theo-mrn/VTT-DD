'use client';

import { useTranslations } from 'next-intl';
import { Dices, Lock, RotateCcw, Send, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { formuleAvecAttributs } from '@/components/des/demande-jet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { systemRollableAttributes } from '@/lib/rollable-attributes';
import { useTable } from '../../../contexte';
import { groupRoll, groupRollActions } from '../state';
import { ResultsList } from './results-list';

/**
 * Panneau du MJ : demander un jet à tous les joueurs qui incarnent un héros (intitulé, formule
 * avec les attributs du système en puces), suivre les résultats, clore.
 */
export function GroupRollPanel() {
  const t = useTranslations('table.groupRoll');
  const { campagne } = useTable();
  const g = useStore(groupRoll.store, (s) => s.value);
  const sys = useCampaignSystem(campagne.system, campagne.id);
  const attributs = useMemo(
    () =>
      sys.data
        ? systemRollableAttributes(sys.data.systeme, sys.data.presentation).filter((a) => !a.gmOnly)
        : [],
    [sys.data],
  );
  const joueurs = campagne.members.filter((m) => m.role !== 'gm' && m.characterId);
  const [label, setLabel] = useState('');
  const [formule, setFormule] = useState('1d20');
  const [partage, setPartage] = useState(true);

  if (g) {
    const attendus = g.targets
      .filter((u) => !g.results.some((r) => r.userId === u))
      .map((u) => campagne.members.find((m) => m.userId === u)?.name ?? '…');
    return (
      <div className="space-y-4 p-4">
        <div className="rounded-2xl bg-surface-2/50 p-3">
          <p className="text-[11px] font-medium text-muted-foreground">
            {g.closed ? t('closed') : t('live')} · {g.results.length}/{g.targets.length}
          </p>
          <p className="truncate text-sm font-semibold">{g.label || g.formula}</p>
          <p className="truncate font-mono text-xs text-subtle">{g.formula}</p>
        </div>
        <ResultsList results={g.results} waiting={g.closed ? [] : attendus} />
        <div className="flex gap-1.5">
          {!g.closed && (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={groupRollActions.close}
            >
              <Lock />
              {t('close')}
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => groupRollActions.start(g.label, g.formula, g.shared, g.targets)}
          >
            <RotateCcw />
            {t('again')}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('clear')}
            onClick={groupRollActions.clear}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!formule.trim() || !joueurs.length) return;
        groupRollActions.start(
          label.trim(),
          formule.trim(),
          partage,
          joueurs.map((j) => j.userId),
        );
      }}
    >
      <Input
        value={label}
        maxLength={80}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={t('labelPlaceholder')}
        aria-label={t('label')}
        className="h-9 rounded-xl font-medium"
      />
      <div className="space-y-2">
        <Input
          value={formule}
          maxLength={200}
          onChange={(e) => setFormule(e.target.value)}
          aria-label={t('formula')}
          spellCheck={false}
          className="h-9 rounded-xl font-mono"
        />
        {attributs.length > 0 && (
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {attributs.map((a) => (
              <button
                key={a.key}
                type="button"
                title={a.name}
                onClick={() => {
                  setFormule((f) => formuleAvecAttributs(f, [a.key]));
                  if (!label.trim()) setLabel(a.name);
                }}
                className="rounded-lg bg-surface-2/70 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="group-roll-shared" className="text-[13px]">
          {t('shared')}
        </label>
        <Switch id="group-roll-shared" checked={partage} onCheckedChange={setPartage} />
      </div>
      <Button
        type="submit"
        size="sm"
        className="w-full"
        disabled={!formule.trim() || !joueurs.length}
      >
        {joueurs.length ? <Send /> : <Dices />}
        {joueurs.length ? t('ask', { count: joueurs.length }) : t('noPlayers')}
      </Button>
    </form>
  );
}

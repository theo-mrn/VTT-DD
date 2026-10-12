'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Copy, Dices, RefreshCw, UserRoundPlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import { messageErreur } from '@/lib/api';
import { npcTemplatesApi, useRefreshNpcTemplates } from '@/lib/bestiary';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { cn } from '@/lib/utils';
import { useTable } from '../../../contexte';
import {
  dataFor,
  FIELDS,
  generateField,
  generateName,
  generateNpc,
  type Field,
  type Gender,
  type GeneratedNpc,
} from '../generate';

const ANY = 'any';

/**
 * Générateur de PNJ (MJ) : peuple et genre au choix (ou au hasard), un PNJ complet d'un clic ;
 * chaque ligne se relance seule. Copier le texte, ou créer le modèle dans Mes PNJ.
 */
export function NpcGeneratorPanel() {
  const t = useTranslations('table.npcGenerator');
  const locale = useLocale();
  const data = useMemo(() => dataFor(locale), [locale]);
  const { campagne } = useTable();
  const systeme = useCampaignSystem(campagne.system, campagne.id);
  const refresh = useRefreshNpcTemplates(campagne.id);
  const [culture, setCulture] = useState<string>(ANY);
  const [gender, setGender] = useState<Gender | typeof ANY>(ANY);
  const [npc, setNpc] = useState<GeneratedNpc>(() => generateNpc(data, null, null));
  const [busy, setBusy] = useState(false);

  const nouveau = () =>
    setNpc(generateNpc(data, culture === ANY ? null : culture, gender === ANY ? null : gender));
  const cultureDe = data.cultures.find((c) => c.id === npc.culture)!;
  const nom = `${npc.first} ${npc.last}`;
  const texte = [
    `${nom} — ${cultureDe.label}, ${npc.occupation}`,
    ...FIELDS.filter((f) => f !== 'occupation').map((f) => `${t(`fields.${f}`)} : ${npc[f]}`),
  ].join('\n');

  const creer = async () => {
    const type = systeme.data ? [...systeme.data.systeme.entites.values()][0]?.type.id : undefined;
    setBusy(true);
    try {
      await npcTemplatesApi.create(campagne.id, {
        name: nom,
        systemeId: campagne.system,
        ...(type ? { type } : {}),
      });
      refresh();
      toast.success(t('created', { name: nom }));
    } catch (e) {
      toast.error(t('createFailed'), { description: messageErreur(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {[{ id: ANY, label: t('anyCulture') }, ...data.cultures].map((c) => (
            <Chip key={c.id} on={culture === c.id} onClick={() => setCulture(c.id)}>
              {c.label}
            </Chip>
          ))}
        </div>
        <div className="flex gap-1">
          {([ANY, 'female', 'male'] as const).map((g) => (
            <Chip key={g} on={gender === g} onClick={() => setGender(g)}>
              {t(`genders.${g}`)}
            </Chip>
          ))}
        </div>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.article
          key={npc.id}
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8 }}
          className="overflow-hidden rounded-2xl border border-border/70 bg-card"
        >
          <header className="flex items-center gap-3 bg-gradient-to-br from-primary/10 to-transparent p-4">
            <Illustration graine={nom} src={null} className="size-12 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold tracking-tight">{nom}</p>
              <p className="truncate text-xs text-muted-foreground">
                {cultureDe.label} · {npc.occupation}
              </p>
            </div>
            <Reroll
              label={t('rerollName')}
              onClick={() => setNpc({ ...npc, ...generateName(cultureDe, npc.gender) })}
            />
          </header>
          <dl className="divide-y divide-border/50">
            {FIELDS.map((f) => (
              <Ligne
                key={f}
                field={f}
                value={npc[f]}
                onReroll={() => setNpc({ ...npc, [f]: generateField(data, f) })}
              />
            ))}
          </dl>
        </motion.article>
      </AnimatePresence>

      <div className="flex gap-1.5">
        <Button size="sm" className="flex-1" onClick={nouveau}>
          <Dices />
          {t('generate')}
        </Button>
        <Button
          size="icon-sm"
          variant="secondary"
          aria-label={t('copy')}
          onClick={() =>
            void navigator.clipboard.writeText(texte).then(() => toast.success(t('copied')))
          }
        >
          <Copy />
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void creer()}>
          <UserRoundPlus />
          {t('toNpcs')}
        </Button>
      </div>
    </div>
  );
}

function Ligne({
  field,
  value,
  onReroll,
}: Readonly<{ field: Field; value: string; onReroll(): void }>) {
  const t = useTranslations('table.npcGenerator');
  return (
    <div className="group flex items-center gap-3 px-4 py-2">
      <dt className="w-24 shrink-0 text-[11px] font-medium text-subtle">{t(`fields.${field}`)}</dt>
      <dd className="min-w-0 flex-1 text-[13px] leading-snug">{value}</dd>
      <Reroll label={t('rerollField', { field: t(`fields.${field}`) })} onClick={onReroll} />
    </div>
  );
}

function Reroll({ label, onClick }: Readonly<{ label: string; onClick(): void }>) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="shrink-0 text-subtle opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 [header_&]:opacity-60"
    >
      <RefreshCw />
    </Button>
  );
}

function Chip({
  on,
  onClick,
  children,
}: Readonly<{ on: boolean; onClick(): void; children: React.ReactNode }>) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
        on
          ? 'bg-primary text-primary-foreground'
          : 'bg-surface-2/70 text-muted-foreground hover:bg-surface-3 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

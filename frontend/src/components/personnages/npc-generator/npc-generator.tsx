'use client';

import type { Presentation, SystemeCharge, Valeur } from '@vtt/rules';
import { useLocale, useTranslations } from 'next-intl';
import { Copy, Dices, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select';
import { useSystemBestiary } from '@/lib/bestiary';
import { keyAttributes, type NpcFormPreset } from '../npc-form';
import {
  dataFor,
  FIELDS,
  generateField,
  generateNpc,
  rollValues,
  type Field,
  type Gender,
  type GeneratedNpc,
} from './generate';

const ANY = '__any';
const NONE = '__none';

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

/**
 * Tirage d'un PNJ dans « Nouveau PNJ » : peuple, genre et base (une famille du bestiaire du
 * système, ou aucune) ; chaque tirage remplit le formulaire (nom, type, image, valeurs clés, et
 * la créature de base dont il reprend l'état et les actions). La personnalité tirée sert à
 * improviser : affichée, relançable, copiable, pas enregistrée.
 */
export function NpcGenerator({
  systemId,
  systeme,
  presentation,
  onRoll,
}: Readonly<{
  systemId: string;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  onRoll(preset: NpcFormPreset): void;
}>) {
  const t = useTranslations('table.npcGenerator');
  const locale = useLocale();
  const data = useMemo(() => dataFor(locale), [locale]);
  const bestiary = useSystemBestiary(systemId);
  const [culture, setCulture] = useState(ANY);
  const [gender, setGender] = useState<Gender | typeof ANY>(ANY);
  const [base, setBase] = useState(ANY);
  const [npc, setNpc] = useState<GeneratedNpc | null>(null);
  const [baseName, setBaseName] = useState<string | null>(null);

  const creatures = useMemo(
    () => (bestiary.data?.creatures ?? []).filter((c) => systeme.entites.has(c.entite)),
    [bestiary.data, systeme],
  );
  const familles = useMemo(
    () => [...new Set(creatures.map((c) => c.categorie))].sort((a, b) => a.localeCompare(b)),
    [creatures],
  );
  const typeParDefaut = [...systeme.entites.keys()][0] ?? '';

  const tirer = () => {
    const n = generateNpc(data, culture === ANY ? null : culture, gender === ANY ? null : gender);
    const name = `${n.first} ${n.last}`;
    const pool = base === NONE ? [] : creatures.filter((c) => base === ANY || c.categorie === base);
    if (pool.length) {
      const c = pick(pool);
      setBaseName(c.nom);
      onRoll({
        name,
        type: c.entite,
        imageUrl: c.image && /^https?:\/\//.test(c.image) ? c.image : null,
        valeurs: c.valeurs as Record<string, Valeur>,
        bestiaryKey: c.id,
      });
    } else {
      setBaseName(null);
      onRoll({
        name,
        type: typeParDefaut,
        imageUrl: null,
        valeurs: rollValues(keyAttributes(systeme, presentation, typeParDefaut)),
      });
    }
    setNpc(n);
  };

  const texte = npc
    ? FIELDS.map((f) => `${t(`fields.${f}`)} : ${npc[f]}`).join('\n') // i18n-ignore
    : '';

  return (
    <div className="space-y-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] to-transparent p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={tirer}>
          <Dices />
          {t('generate')}
        </Button>
        <SelectField
          value={culture}
          onValueChange={setCulture}
          aria-label={t('culture')}
          className="h-8 w-36 text-[13px]"
          options={[
            { valeur: ANY, nom: t('anyCulture') },
            ...data.cultures.map((c) => ({ valeur: c.id, nom: c.label })),
          ]}
        />
        <SelectField
          value={gender}
          onValueChange={(v) => setGender(v as Gender | typeof ANY)}
          aria-label={t('gender')}
          className="h-8 w-32 text-[13px]"
          options={([ANY, 'female', 'male'] as const).map((g) => ({
            valeur: g,
            nom: t(`genders.${g === ANY ? 'any' : g}`),
          }))}
        />
        {familles.length > 0 && (
          <SelectField
            value={base}
            onValueChange={setBase}
            aria-label={t('base')}
            className="h-8 w-44 text-[13px]"
            options={[
              { valeur: ANY, nom: t('anyBase') },
              { valeur: NONE, nom: t('noBase') },
              { groupe: t('base'), options: familles.map((f) => ({ valeur: f, nom: f })) },
            ]}
          />
        )}
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {npc && (
          <motion.div
            key={npc.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl bg-card/80 ring-1 ring-border/70"
          >
            <div className="flex items-center gap-2 px-3 pb-1 pt-2">
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                {baseName ? t('basedOn', { name: baseName }) : t('noBase')}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t('copy')}
                title={t('copy')}
                onClick={() =>
                  void navigator.clipboard.writeText(texte).then(() => toast.success(t('copied')))
                }
              >
                <Copy />
              </Button>
            </div>
            <dl className="grid gap-x-4 px-3 pb-2 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <Ligne
                  key={f}
                  field={f}
                  value={npc[f]}
                  onReroll={() => setNpc({ ...npc, [f]: generateField(data, f) })}
                />
              ))}
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
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
    <div className="group flex items-start gap-2 py-1">
      <dt className="w-20 shrink-0 pt-px text-[11px] font-medium text-subtle">
        {t(`fields.${field}`)}
      </dt>
      <dd className="min-w-0 flex-1 text-[12.5px] leading-snug">{value}</dd>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t('rerollField', { field: t(`fields.${field}`) })}
        title={t('rerollField', { field: t(`fields.${field}`) })}
        onClick={onReroll}
        className="-my-0.5 shrink-0 text-subtle opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
      >
        <RefreshCw />
      </Button>
    </div>
  );
}

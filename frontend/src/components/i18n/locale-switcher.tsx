'use client';

import { Languages } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SelectField } from '@/components/ui/select';
import { isLocale, LOCALE_NAMES, LOCALES } from '@/i18n/config';
import { useChangeLocale } from '@/i18n/use-change-locale';
import { cn } from '@/lib/utils';

const OPTIONS = LOCALES.map((l) => ({ valeur: l, nom: LOCALE_NAMES[l] }));

/**
 * Choix de la langue (docs/i18n.md § 3) : chaque langue écrite dans sa propre langue.
 * `compact` : pied de page (icône et nom de la langue) ; sinon un champ de formulaire.
 */
export function LocaleSwitcher({
  compact = false,
  className,
}: Readonly<{ compact?: boolean; className?: string }>) {
  const t = useTranslations('locale');
  const { locale, change, pending } = useChangeLocale();

  const field = (
    <SelectField
      value={locale}
      onValueChange={(v) => isLocale(v) && void change(v)}
      options={OPTIONS}
      disabled={pending}
      aria-label={t('label')}
      className={cn(
        compact &&
          'h-8 w-auto gap-1.5 border-transparent bg-transparent px-2 text-sm text-subtle hover:text-foreground',
        className,
      )}
    />
  );

  if (!compact) return field;
  return (
    <div className="flex items-center gap-1 text-subtle">
      <Languages className="size-4" aria-hidden />
      {field}
    </div>
  );
}

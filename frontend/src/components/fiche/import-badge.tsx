'use client';

/**
 * Personnage importé d'une fiche (docs/import-fiche.md § 5.2) : une pastille « Importé ». Le MJ
 * lit au survol les écarts aux règles ; le joueur, d'où vient la fiche.
 */
import { useTranslations } from 'next-intl';
import { FileInput } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Info } from '@/components/ui/tooltip';
import type { SheetImport } from '@/lib/personnages';

export function ImportBadge({
  sheetImport,
  mj,
}: Readonly<{ sheetImport: SheetImport; mj: boolean }>) {
  const t = useTranslations('creation.import');
  const source = sheetImport.source.site ?? 'PDF';
  const texte = mj
    ? sheetImport.ecarts.length
      ? `${t('deviations')} : ${sheetImport.ecarts.join(' ; ')}`
      : t('noDeviation')
    : t('importedFrom', { source });
  return (
    <Info texte={texte}>
      <Badge ton={mj && sheetImport.ecarts.length ? 'alerte' : 'neutre'} tabIndex={0}>
        <FileInput aria-hidden />
        {t('imported')}
      </Badge>
    </Info>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { FileDown } from 'lucide-react';
import { useState } from 'react';
import { useNomSysteme } from '@/components/campagnes/carte-campagne';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { personnages } from '@/lib/personnages';
import { calculerMemo } from '@/lib/rules-cache';
import { SheetExportDialog, type ExportCandidate } from './export-dialog';
import { useSheetSnapshot } from './use-sheet-snapshot';

/**
 * MJ : exporter les fiches des joueurs d'une campagne en un seul PDF (une fiche par page).
 * Chaque fiche est relue au service et calculée avec les règles de la campagne ; le MJ voit
 * aussi les valeurs réservées au MJ.
 */
export function ExportAllSheets({
  campaignId,
  systemId,
  characters,
  fileBase,
}: Readonly<{
  campaignId: string;
  systemId: string;
  characters: readonly ExportCandidate[];
  fileBase: string;
}>) {
  const t = useTranslations('sheet.export');
  const [open, setOpen] = useState(false);
  const sys = useCampaignSystem(systemId, campaignId);
  const nomSysteme = useNomSysteme(systemId);
  const snapshot = useSheetSnapshot();
  if (!characters.length) return null;

  const build = async (ids: string[]) => {
    const regles = sys.data;
    if (!regles) throw new Error(t('failed'));
    const lus = await Promise.all(ids.map((id) => personnages.lire(id)));
    return lus.map((p) => {
      const fiche = calculerMemo(regles.systeme, p.state);
      return snapshot(
        {
          systeme: fiche.systeme,
          presentation: regles.presentation,
          fiche,
          personnage: { id: p.id, name: p.name, roomId: p.roomId, portraitUrl: p.portraitUrl },
          mj: true,
        },
        nomSysteme ?? '',
        p.details.concept,
      );
    });
  };

  return (
    <>
      <Info texte={t('exportAll')}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('exportAll')}
          disabled={!sys.data}
          onClick={() => setOpen(true)}
        >
          <FileDown />
        </Button>
      </Info>
      {open && (
        <SheetExportDialog
          open={open}
          onOpenChange={setOpen}
          candidates={characters}
          build={build}
          fileBase={fileBase}
        />
      )}
    </>
  );
}

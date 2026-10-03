'use client';

/**
 * Création rapide d'un PNJ depuis la carte (docs/carte.md § 10) : le formulaire des modèles
 * (`NpcForm`) crée un modèle dans « Mes PNJ », puis le choisit pour la pose. Tout PNJ posé
 * vient donc d'un modèle, qui reste pour la suite.
 */
import type { Presentation, SystemeCharge } from '@vtt/rules';
import { Crosshair } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NpcForm } from '@/components/personnages/npc-form';
import { messageErreur } from '@/lib/api';
import { npcTemplatesApi, useNpcTemplates, useRefreshNpcTemplates } from '@/lib/bestiary';
import type { PlacementSource } from '@/lib/map/modules/tokens/state';

export function QuickCreate({
  campaignId,
  systemId,
  systeme,
  presentation,
  onArm,
  onCreated,
}: Readonly<{
  campaignId: string;
  systemId: string;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  onArm(source: PlacementSource | null): void;
  /** Modèle créé et choisi pour la pose (la bibliothèque revient à ses modèles). */
  onCreated?(): void;
}>) {
  const templates = useNpcTemplates(campaignId);
  const refresh = useRefreshNpcTemplates(campaignId);
  const [busy, setBusy] = useState(false);
  // Formulaire remis à neuf après chaque création
  const [round, setRound] = useState(0);

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Le PNJ est ajouté à « Mes PNJ » (U), puis choisi pour la pose : cliquez sur la carte.
      </p>
      <NpcForm
        key={round}
        campaignId={campaignId}
        systeme={systeme}
        presentation={presentation}
        categories={templates.data?.categories ?? []}
        submitLabel="Créer et poser"
        submitIcon={<Crosshair />}
        busy={busy}
        onSubmit={async (r) => {
          setBusy(true);
          try {
            const t = await npcTemplatesApi.create(campaignId, {
              name: r.name,
              categoryId: r.categoryId,
              imageUrl: r.imageUrl,
              systemeId: systemId,
              type: r.type,
              ...(Object.keys(r.valeurs).length ? { valeurs: r.valeurs } : {}),
            });
            refresh();
            onArm({
              key: `template:${t.id}`,
              name: t.name,
              imageUrl: t.tokenUrl ?? t.imageUrl,
              source: { templateId: t.id },
            });
            toast.success(`« ${t.name} » ajouté à Mes PNJ`, {
              description: 'Cliquez sur la carte pour le poser.',
            });
            setRound((n) => n + 1);
            onCreated?.();
          } catch (err) {
            toast.error('Le PNJ n’a pas pu être créé', { description: messageErreur(err) });
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

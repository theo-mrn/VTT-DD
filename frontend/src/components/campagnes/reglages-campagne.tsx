'use client';

import { Check, Globe, ImagePlus, Lock } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { Interrupteur } from '@/components/compte/elements';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, messageErreur } from '@/lib/api';
import {
  LONGUEUR_ACCROCHE,
  LONGUEUR_DESCRIPTION,
  useEnvoyerCouverture,
  useModifierCampagne,
  type DetailCampagne,
  type ModificationCampagne,
} from '@/lib/campagnes';
import { TYPES_IMAGE, verifierImage } from '@/lib/profil';
import { cn } from '@/lib/utils';
import { AMBIANCES, COUVERTURES } from './elements';

/** Réglages du MJ, dans un panneau latéral : tout sauf le système (définitif). */
export function ReglagesCampagne({
  campagne: c,
  ouvert,
  onOuvert,
}: {
  campagne: DetailCampagne;
  ouvert: boolean;
  onOuvert: (v: boolean) => void;
}) {
  const modifier = useModifierCampagne(c.id);
  const envoi = useEnvoyerCouverture(c.id);
  const champFichier = useRef<HTMLInputElement>(null);
  const initial = (): Required<ModificationCampagne> => ({
    name: c.name,
    pitch: c.pitch,
    description: c.description,
    coverUrl: c.coverUrl,
    ambiance: c.ambiance,
    visibility: c.visibility,
    freeCreation: c.freeCreation,
    tags: c.tags,
  });
  const [f, setF] = useState(initial);
  const maj = (m: ModificationCampagne) => setF((x) => ({ ...x, ...m }));

  // Repart des valeurs enregistrées à chaque ouverture (pas à chaque mise à jour du cache)
  useEffect(() => {
    if (ouvert) setF(initial());
  }, [ouvert]); // eslint-disable-line react-hooks/exhaustive-deps

  // Image importée : envoyée tout de suite, elle devient la couverture enregistrée
  async function importer(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    const probleme = verifierImage(fichier);
    if (probleme) return void toast.error(probleme);
    try {
      const suivante = await envoi.mutateAsync(fichier);
      maj({ coverUrl: suivante.coverUrl });
      toast.success('Couverture importée');
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 503
          ? "L'envoi d'images n'est pas disponible sur ce serveur."
          : messageErreur(err),
      );
    }
  }
  const importee = f.coverUrl !== null && !COUVERTURES.some((cv) => cv.url === f.coverUrl);

  async function enregistrer() {
    try {
      await modifier.mutateAsync({ ...f, name: f.name.trim(), pitch: f.pitch.trim() });
      toast.success('Campagne mise à jour');
      onOuvert(false);
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={onOuvert}>
      <SheetContent cote="right" className="w-[94vw] max-w-lg" data-ambiance={f.ambiance}>
        <div className="border-b border-border px-6 py-5">
          <DialogTitle className="text-lg font-semibold">Réglages de la campagne</DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground">
            Visibles par toute la table. Le système de jeu ne change pas.
          </DialogDescription>
        </div>
        <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
          <div className="space-y-2">
            <Label htmlFor="r-nom">Titre</Label>
            <Input
              id="r-nom"
              value={f.name}
              maxLength={80}
              onChange={(e) => maj({ name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-accroche">Accroche</Label>
            <Input
              id="r-accroche"
              value={f.pitch}
              maxLength={LONGUEUR_ACCROCHE}
              onChange={(e) => maj({ pitch: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-description">Présentation</Label>
            <Textarea
              id="r-description"
              value={f.description}
              maxLength={LONGUEUR_DESCRIPTION}
              onChange={(e) => maj({ description: e.target.value })}
              className="min-h-[120px]"
            />
          </div>

          <div className="space-y-3">
            <Label>Couverture</Label>
            <div className="grid grid-cols-4 gap-2">
              {COUVERTURES.map((cv) => (
                <button
                  key={cv.url}
                  type="button"
                  aria-label={cv.nom}
                  aria-pressed={f.coverUrl === cv.url}
                  onClick={() => maj({ coverUrl: cv.url })}
                  className={cn(
                    'overflow-hidden rounded-lg border-2 transition-colors',
                    f.coverUrl === cv.url
                      ? 'border-primary'
                      : 'border-transparent hover:border-border-strong',
                  )}
                >
                  <Illustration
                    src={cv.url}
                    graine={cv.nom}
                    initiale={false}
                    className="aspect-[16/10]"
                  />
                </button>
              ))}
              {importee && (
                <span className="overflow-hidden rounded-lg border-2 border-primary">
                  <Illustration
                    src={f.coverUrl}
                    graine={c.name}
                    initiale={false}
                    className="aspect-[16/10]"
                  />
                </span>
              )}
              <button
                type="button"
                onClick={() => champFichier.current?.click()}
                disabled={envoi.isPending}
                className="flex aspect-[16/10] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border-strong text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
              >
                <ImagePlus className="size-4" />
                {envoi.isPending ? 'Envoi…' : 'Importer'}
              </button>
              <input
                ref={champFichier}
                type="file"
                accept={TYPES_IMAGE.join(',')}
                className="hidden"
                onChange={(e) => void importer(e)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Couleur d&apos;ambiance</Label>
            <div className="flex flex-wrap gap-2">
              {AMBIANCES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-label={a.nom}
                  aria-pressed={f.ambiance === a.id}
                  onClick={() => maj({ ambiance: a.id })}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full transition-transform',
                    f.ambiance === a.id &&
                      'scale-110 ring-2 ring-white/40 ring-offset-2 ring-offset-popover',
                  )}
                  style={{ background: a.couleur }}
                >
                  {f.ambiance === a.id && (
                    <Check className="size-3.5 text-black/70" strokeWidth={3} />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['private', 'public'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={f.visibility === v}
                onClick={() => maj({ visibility: v })}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                  f.visibility === v
                    ? 'border-primary/50 bg-primary/10 text-primary-strong'
                    : 'border-border text-muted-foreground hover:border-border-strong',
                )}
              >
                {v === 'private' ? <Lock className="size-4" /> : <Globe className="size-4" />}
                {v === 'private' ? 'Privée' : 'Publique'}
              </button>
            ))}
          </div>

          <Interrupteur
            actif={f.freeCreation}
            onChange={(v) => maj({ freeCreation: v })}
            label="Création libre des personnages"
            description="Les joueurs créent leur héros eux-mêmes."
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={() => onOuvert(false)}>
            Annuler
          </Button>
          <Button
            onClick={() => void enregistrer()}
            loading={modifier.isPending}
            disabled={f.name.trim().length < 3}
          >
            Enregistrer
          </Button>
        </div>
      </SheetContent>
    </Dialog>
  );
}

'use client';

import { Check, Globe, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { Interrupteur } from '@/components/compte/elements';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { messageErreur } from '@/lib/api';
import {
  JOUEURS_MAX,
  nombreJoueurs,
  useModifierCampagne,
  type Campagne,
  type ModificationCampagne,
} from '@/lib/campagnes';
import { cn } from '@/lib/utils';
import { AMBIANCES, COUVERTURES } from './elements';

/** Réglages du MJ, dans un panneau latéral : tout sauf le système (définitif). */
export function ReglagesCampagne({
  campagne: c,
  ouvert,
  onOuvert,
}: {
  campagne: Campagne;
  ouvert: boolean;
  onOuvert: (v: boolean) => void;
}) {
  const modifier = useModifierCampagne(c.id);
  const initial = (): Required<ModificationCampagne> => ({
    name: c.name,
    pitch: c.pitch,
    description: c.description,
    coverUrl: c.coverUrl,
    ambiance: c.ambiance,
    visibility: c.visibility,
    maxPlayers: c.maxPlayers,
    freeCreation: c.freeCreation,
    tags: c.tags,
  });
  const [f, setF] = useState(initial);
  const maj = (m: ModificationCampagne) => setF((x) => ({ ...x, ...m }));

  // Repart des valeurs enregistrées à chaque ouverture (pas à chaque mise à jour du cache)
  useEffect(() => {
    if (ouvert) setF(initial());
  }, [ouvert]); // eslint-disable-line react-hooks/exhaustive-deps

  const minJoueurs = Math.max(1, nombreJoueurs(c));

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
              maxLength={140}
              onChange={(e) => maj({ pitch: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="r-description">Présentation</Label>
            <Textarea
              id="r-description"
              value={f.description}
              maxLength={4000}
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

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <Label>Joueurs</Label>
              <span className="font-mono text-lg font-semibold text-primary">{f.maxPlayers}</span>
            </div>
            <Slider
              min={minJoueurs}
              max={JOUEURS_MAX}
              step={1}
              value={[f.maxPlayers]}
              onValueChange={([v]) => maj({ maxPlayers: v ?? f.maxPlayers })}
              aria-label="Nombre maximal de joueurs"
            />
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

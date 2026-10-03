'use client';

/**
 * Créer ou modifier une scène (MJ) : nom, description, dossier, fond (image ou vidéo webm/mp4 :
 * glisser, coller ou choisir, envoyé sur le stockage aussitôt ; ou une adresse), visible des
 * joueurs.
 */
import type { MapGroup, MapScene } from '@vtt/contracts';
import { ImageIcon } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Info } from '@/components/ui/tooltip';
import { vignette } from '@/lib/assets';
import { isVideoUrl, videoVariant } from '@/lib/map/engine/background-prefs';
import { cn } from '@/lib/utils';
import { BackgroundPicker } from './background-picker';
import type { ScenesActions } from './use-scenes';

export function SceneDialog({
  campaignId,
  open,
  scene,
  groups,
  defaultGroupId,
  actions,
  onOpenChange,
}: Readonly<{
  campaignId: string;
  open: boolean;
  /** Scène modifiée ; null : nouvelle scène. */
  scene: MapScene | null;
  groups: readonly MapGroup[];
  defaultGroupId?: string | null;
  actions: ScenesActions;
  onOpenChange(open: boolean): void;
}>) {
  const ids = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState('');
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulaire remis à zéro à chaque ouverture
  useEffect(() => {
    if (!open) return;
    setName(scene?.name ?? '');
    setDescription(scene?.description ?? '');
    setGroupId(scene?.groupId ?? defaultGroupId ?? '');
    setVisible(scene?.visibleToPlayers ?? false);
    setUrl(scene?.backgroundUrl ?? null);
    setSaving(false);
  }, [open, scene, defaultGroupId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const backgroundUrl = url;
      const fields = {
        name: name.trim(),
        description: description.trim(),
        groupId: groupId || null,
        visibleToPlayers: visible,
        backgroundUrl,
      };
      // Un nouveau fond : sa taille naturelle est relue par le client du MJ à l'ouverture de la
      // scène, qui propose d'adapter les éléments si elle change
      if (scene)
        await actions.updateScene.mutateAsync({
          mapId: scene.id,
          patch: { ...fields, version: scene.version },
        });
      else await actions.createScene.mutateAsync(fields);
      onOpenChange(false);
    } catch {
      // Toast déjà affiché par la mutation
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void submit(e)} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{scene ? 'Modifier la scène' : 'Nouvelle scène'}</DialogTitle>
            <DialogDescription className="sr-only">
              Le fond fixe la taille de la carte : une image, ou une vidéo muette en boucle.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={`${ids}-name`}>Nom</Label>
            <Input
              id={`${ids}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="La taverne du Poney fringant"
              maxLength={100}
              required
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${ids}-desc`}>Description</Label>
            <Textarea
              id={`${ids}-desc`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Pour vous seulement : ce que la scène prépare."
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${ids}-group`}>Dossier</Label>
            <SelectField
              id={`${ids}-group`}
              value={groupId}
              onValueChange={setGroupId}
              options={[
                { valeur: '', nom: 'Sans dossier' },
                ...groups.map((g) => ({ valeur: g.id, nom: g.name })),
              ]}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-medium">Fond</span>
            <BackgroundField url={url} onOpen={() => setPicking(true)} />
            <BackgroundPicker
              open={picking}
              onOpenChange={setPicking}
              campaignId={campaignId}
              current={url}
              onPick={setUrl}
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
            <Info texte="Sinon, seuls les joueurs dont un personnage s’y trouve la voient.">
              <span className="text-sm font-medium">Visible des joueurs</span>
            </Info>
            <Switch checked={visible} onCheckedChange={setVisible} />
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" loading={saving} disabled={!name.trim()}>
              {scene ? 'Enregistrer' : 'Créer la scène'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Aperçu du fond choisi ; un clic ouvre le sélecteur (bibliothèque ou import). */
function BackgroundField({ url, onOpen }: Readonly<{ url: string | null; onOpen(): void }>) {
  const video = url ? isVideoUrl(url) : false;
  const variant = url && video ? videoVariant(url) : null;
  const poster = url
    ? video
      ? variant
        ? vignette(variant.replace(/\.mp4$/, '.webp'), 640)
        : null
      : vignette(url, 640)
    : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative grid aspect-video w-full place-items-center overflow-hidden rounded-xl border border-border bg-surface-2 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="absolute inset-0 size-full object-cover" />
      ) : url && video ? (
        <video
          src={`${url}#t=0.5`}
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      <span
        className={cn(
          'relative flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium',
          url
            ? 'bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'
            : 'text-muted-foreground',
        )}
      >
        <ImageIcon className="size-4" aria-hidden />
        {url ? 'Changer le fond' : 'Choisir un fond'}
      </span>
    </button>
  );
}

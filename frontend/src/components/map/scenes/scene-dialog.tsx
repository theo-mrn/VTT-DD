'use client';

/**
 * Créer ou modifier une scène (MJ) : nom, description, dossier, fond (image ou vidéo webm/mp4 :
 * glisser, coller ou choisir, envoyé sur le stockage aussitôt ; ou une adresse), visible des
 * joueurs.
 */
import { translate } from '@/i18n/runtime';
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
            <DialogTitle>
              {scene ? translate('map.scenes.edit') : translate('map.scenes.new')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {translate('map.scenes.dialogHint')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor={`${ids}-name`}>{translate('map.lights.name')}</Label>
            <Input
              id={`${ids}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={translate('map.scenes.namePlaceholder')}
              maxLength={100}
              required
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${ids}-desc`}>{translate('map.scenes.description')}</Label>
            <Textarea
              id={`${ids}-desc`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={translate('map.scenes.descriptionHint')}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${ids}-group`}>{translate('map.scenes.folder')}</Label>
            <SelectField
              id={`${ids}-group`}
              value={groupId}
              onValueChange={setGroupId}
              options={[
                { valeur: '', nom: translate('map.scenes.noFolder') },
                ...groups.map((g) => ({ valeur: g.id, nom: g.name })),
              ]}
            />
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-medium">{translate('map.scenes.backgroundShort')}</span>
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
            <Info texte={translate('map.scenes.visibleHint')}>
              <span className="text-sm font-medium">{translate('map.grid.visible')}</span>
            </Info>
            <Switch checked={visible} onCheckedChange={setVisible} />
          </label>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {translate('common.actions.cancel')}
            </Button>
            <Button type="submit" loading={saving} disabled={!name.trim()}>
              {scene ? translate('map.scenes.save') : translate('map.scenes.createScene')}
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
  let poster: string | null = null;
  if (url && !video) poster = vignette(url, 640);
  else if (variant) poster = vignette(variant.replace(/\.mp4$/, '.webp'), 640);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative grid aspect-video w-full place-items-center overflow-hidden rounded-xl border border-border bg-surface-2 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      {!poster && url && video && (
        <video
          src={`${url}#t=0.5`}
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <span
        className={cn(
          'relative flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium',
          url
            ? 'bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'
            : 'text-muted-foreground',
        )}
      >
        <ImageIcon className="size-4" aria-hidden />
        {url ? translate('map.scenes.changeBackground') : translate('map.scenes.pickBackground')}
      </span>
    </button>
  );
}

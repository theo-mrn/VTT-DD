'use client';

/**
 * Créer ou modifier une scène (MJ) : nom, description, dossier, fond (image ou vidéo webm/mp4,
 * envoyée par URL présignée, ou adresse), visible des joueurs.
 */
import type { MapGroup, MapScene } from '@vtt/contracts';
import { Film, ImagePlus, Link2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Illustration } from '@/components/commun/illustration';
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
import { BACKGROUND_ACCEPT, isVideoBackground, type ScenesActions } from './use-scenes';

export function SceneDialog({
  open,
  scene,
  groups,
  defaultGroupId,
  actions,
  onOpenChange,
}: {
  open: boolean;
  /** Scène modifiée ; null : nouvelle scène. */
  scene: MapScene | null;
  groups: readonly MapGroup[];
  defaultGroupId?: string | null;
  actions: ScenesActions;
  onOpenChange(open: boolean): void;
}) {
  const ids = useId();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState('');
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Formulaire remis à zéro à chaque ouverture
  useEffect(() => {
    if (!open) return;
    setName(scene?.name ?? '');
    setDescription(scene?.description ?? '');
    setGroupId(scene?.groupId ?? defaultGroupId ?? '');
    setVisible(scene?.visibleToPlayers ?? false);
    setUrl(scene?.backgroundUrl ?? '');
    setFile(null);
    setSaving(false);
  }, [open, scene, defaultGroupId]);

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const shown = preview ?? (url.trim() || null);
  const video = file ? file.type.startsWith('video/') : isVideoBackground(url);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      let backgroundUrl: string | null = url.trim() || null;
      if (file) backgroundUrl = await actions.upload.mutateAsync(file);
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
            <DialogDescription>
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
            <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-surface-2">
              {shown && video ? (
                <video
                  src={shown}
                  muted
                  loop
                  autoPlay
                  playsInline
                  className="size-full object-cover"
                />
              ) : (
                <Illustration
                  src={shown}
                  graine={name || 'scène'}
                  initiale={false}
                  className="size-full"
                />
              )}
              {shown && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-xs"
                  className="absolute right-2 top-2"
                  aria-label="Retirer le fond"
                  onClick={() => {
                    setFile(null);
                    setUrl('');
                  }}
                >
                  <X />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" size="sm" asChild>
                <label className="cursor-pointer">
                  {video ? <Film /> : <ImagePlus />}
                  Envoyer un fichier
                  <input
                    type="file"
                    accept={BACKGROUND_ACCEPT}
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setFile(f);
                      if (f) setUrl('');
                    }}
                  />
                </label>
              </Button>
              <span className="text-xs text-muted-foreground">
                Images de 10 Mo, vidéos webm ou mp4 de 100 Mo au plus.
              </span>
            </div>
            <div className="relative">
              <Link2
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
                aria-hidden
              />
              <Input
                aria-label="Adresse du fond"
                value={file ? file.name : url}
                disabled={!!file}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://… ou /bibliotheque/…"
                className="pl-9"
              />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium">Visible des joueurs</span>
              <span className="block text-xs text-muted-foreground">
                Sinon, seuls les joueurs dont un personnage s’y trouve la voient.
              </span>
            </span>
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

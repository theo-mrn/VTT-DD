'use client';

/**
 * Import d'une carte UVTT en nouvelle scène (docs/import-uvtt.md § 5) : fichier, aperçu, nom,
 * compteurs, options repliées (murs des objets, lumières), progression ; la scène s'ouvre à la
 * fin.
 */
import { translate } from '@/i18n/runtime';
import { useQueryClient } from '@tanstack/react-query';
import { BrickWall, DoorOpen, FileUp, Lightbulb } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
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
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { mapKeys } from '@/lib/map/api';
import {
  UVTT_EXTENSIONS,
  convertUvtt,
  parseUvtt,
  uvttImage,
  type UvttDocument,
} from '@/lib/map/uvtt/convert';
import { importUvtt } from '@/lib/map/uvtt/import';
import { openScene } from '../use-table-map';

interface Loaded {
  doc: UvttDocument;
  fileName: string;
  preview: string;
}

export function UvttImportDialog({
  campaignId,
  open,
  groupId,
  onOpenChange,
}: Readonly<{
  campaignId: string;
  open: boolean;
  groupId?: string | null;
  onOpenChange(open: boolean): void;
}>) {
  const ids = useId();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [name, setName] = useState('');
  const [objectWalls, setObjectWalls] = useState(true);
  const [lights, setLights] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);

  // Remis à zéro à chaque ouverture ; l'aperçu est libéré à la fermeture
  useEffect(() => {
    if (!open) return;
    setLoaded(null);
    setName('');
    setObjectWalls(true);
    setLights(true);
    setProgress(null);
  }, [open]);
  useEffect(() => () => void (loaded && URL.revokeObjectURL(loaded.preview)), [loaded]);

  const counts = useMemo(() => {
    if (!loaded) return null;
    const s = convertUvtt(loaded.doc);
    return {
      walls: s.walls.length + (objectWalls ? s.objectWalls.length : 0),
      objectWalls: s.objectWalls.length,
      doors: s.doors.length,
      lights: s.lights.length,
      baked: !!loaded.doc.environment.baked_lighting,
    };
  }, [loaded, objectWalls]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const doc = parseUvtt(await file.text());
    if (!doc) {
      toast.error(translate('map.scenes.uvtt.invalid'));
      return;
    }
    setLoaded({
      doc,
      fileName: file.name,
      preview: URL.createObjectURL(uvttImage(doc, file.name)),
    });
    setName(file.name.replace(/\.[^.]+$/, '').slice(0, 100));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!loaded || !name.trim()) return;
    setProgress(0);
    try {
      const scene = await importUvtt(campaignId, loaded.doc, loaded.fileName, {
        name: name.trim(),
        groupId: groupId ?? null,
        objectWalls,
        lights,
        onProgress: setProgress,
      });
      await qc.invalidateQueries({ queryKey: mapKeys.scope(campaignId) });
      openScene(scene.id);
      toast.success(translate('map.scenes.uvtt.done', { name: scene.name }));
      onOpenChange(false);
    } catch (err) {
      toast.error(messageErreur(err));
      setProgress(null);
    }
  };

  const busy = progress !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void submit(e)} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{translate('map.scenes.uvtt.title')}</DialogTitle>
            <DialogDescription className="sr-only">
              {translate('map.scenes.uvtt.formats')}
            </DialogDescription>
          </DialogHeader>

          <input
            ref={input}
            type="file"
            accept={UVTT_EXTENSIONS.join(',')}
            className="hidden"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-surface-2 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {loaded ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={loaded.preview}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <Info texte={translate('map.scenes.uvtt.formats')}>
                <span className="flex items-center gap-2 text-sm font-medium text-primary">
                  <FileUp className="size-5" aria-hidden />
                  {translate('map.scenes.uvtt.choose')}
                </span>
              </Info>
            )}
          </button>

          {loaded && counts && (
            <>
              <div className="grid gap-2">
                <Label htmlFor={`${ids}-name`}>{translate('map.lights.name')}</Label>
                <Input
                  id={`${ids}-name`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  required
                  disabled={busy}
                />
              </div>

              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <Count
                  icon={BrickWall}
                  label={translate('map.scenes.uvtt.walls')}
                  n={counts.walls}
                />
                <Count
                  icon={DoorOpen}
                  label={translate('map.scenes.uvtt.doors')}
                  n={counts.doors}
                />
                <Count
                  icon={Lightbulb}
                  label={translate('map.scenes.uvtt.lights')}
                  n={lights ? counts.lights : 0}
                />
              </div>

              <details className="group rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
                <summary className="cursor-pointer text-sm font-medium">
                  {translate('map.scenes.uvtt.options')}
                </summary>
                <div className="mt-3 grid gap-3">
                  <label className="flex items-center justify-between gap-3">
                    <Info texte={translate('map.scenes.uvtt.objectWallsHint')}>
                      <span className="text-sm">
                        {translate('map.scenes.uvtt.objectWalls')} ({counts.objectWalls})
                      </span>
                    </Info>
                    <Switch
                      checked={objectWalls}
                      onCheckedChange={setObjectWalls}
                      disabled={busy || !counts.objectWalls}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    {counts.baked ? (
                      <Info texte={translate('map.scenes.uvtt.bakedHint')}>
                        <span className="text-sm">{translate('map.scenes.uvtt.lights')}</span>
                      </Info>
                    ) : (
                      <span className="text-sm">{translate('map.scenes.uvtt.lights')}</span>
                    )}
                    <Switch
                      checked={lights && !counts.baked}
                      onCheckedChange={setLights}
                      disabled={busy || !counts.lights}
                    />
                  </label>
                </div>
              </details>
            </>
          )}

          {busy && (
            <Progress
              valeur={(progress ?? 0) * 100}
              label={translate('map.scenes.uvtt.importing')}
            />
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              {translate('common.actions.cancel')}
            </Button>
            <Button type="submit" loading={busy} disabled={!loaded || !name.trim()}>
              {translate('map.scenes.uvtt.run')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Count({
  icon: Icon,
  label,
  n,
}: Readonly<{ icon: typeof BrickWall; label: string; n: number }>) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1">
      <Icon className="size-4" aria-hidden />
      <span className="tabular-nums text-foreground">{n}</span>
      {label}
    </span>
  );
}

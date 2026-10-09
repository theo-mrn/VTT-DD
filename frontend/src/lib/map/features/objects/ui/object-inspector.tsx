'use client';

/**
 * Inspecteur d'un objet, section « Objet » (MJ ; docs/carte.md § 10) : nom, sorte, image,
 * taille, rotation, verrou, masqué, « Visible pour… », notes du MJ. Sélection multiple : les
 * réglages communs (verrou, masqué, fouille, sorte, taille). Chaque modification validée est
 * une commande annulable.
 */
import { translate } from '@/i18n/runtime';
import type { MapObjectKind } from '@vtt/contracts';
import {
  ImagePlus,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Package,
  RotateCcw,
  RotateCw,
  Square,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { mapsApi } from '@/lib/map/api';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import { normalizeDegrees } from '@/lib/map/engine/geometry';
import type { InspectorSectionProps, MapEngine } from '@/lib/map/engine/map-engine';
import {
  fitObjects,
  scaleObjects,
  setObjectKind,
  setSearchable,
  updateObjects,
} from '../engine/placement';
import { objectKindLabel, type ObjectData } from '../engine/types';
import { cn } from '@/lib/utils';
import { CharacterChoice } from '@/components/map/character-choice';
import {
  CommitInput,
  CommitNumber,
  CommitTextarea,
  FieldLabel,
  Segmented,
  ToggleRow,
} from './fields';
import { OBJECT_IMAGE_ACCEPT } from './object-library';
import { useDistanceScale } from '@/components/map/use-distance';

const kindOptions = () =>
  (['item', 'weapon', 'decor'] as const satisfies readonly MapObjectKind[]).map((value) => ({
    value,
    label: objectKindLabel(value),
  }));

const tri = (values: boolean[]): boolean | 'mixed' => {
  if (values.every(Boolean)) return true;
  return values.some(Boolean) ? 'mixed' : false;
};

export function ObjectInspector({ engine, entities }: Readonly<InspectorSectionProps>) {
  if (entities.length === 1) return <SingleObject engine={engine} entity={entities[0]!} />;
  return <ManyObjects engine={engine} entities={entities} />;
}

function SizeButtons({
  engine,
  entities,
}: Readonly<{ engine: MapEngine; entities: readonly MapEntity[] }>) {
  const locked = entities.every((e) => e.state.locked);
  return (
    <div className="flex gap-1.5">
      <Button
        variant="secondary"
        size="xs"
        disabled={locked}
        onClick={() => void scaleObjects(engine, entities, 0.8)}
      >
        <Minimize2 />
        {translate('map.objects.shrink')}
      </Button>
      <Button
        variant="secondary"
        size="xs"
        disabled={locked}
        onClick={() => void scaleObjects(engine, entities, 1.25)}
      >
        <Maximize2 />
        {translate('map.objects.enlarge')}
      </Button>
      <Info texte={translate('map.objects.oneSquareHint')}>
        <Button
          variant="ghost"
          size="xs"
          disabled={locked}
          onClick={() => void fitObjects(engine, entities)}
        >
          <Square />
          {translate('map.objects.oneSquareShort')}
        </Button>
      </Info>
    </div>
  );
}

function ManyObjects({
  engine,
  entities,
}: Readonly<{ engine: MapEngine; entities: readonly MapEntity[] }>) {
  const data = entities.map((e) => e.data as ObjectData);
  const kinds = new Set(data.map((o) => o.kind));
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel>{translate('map.objects.kind')}</FieldLabel>
        <Segmented
          label={translate('map.objects.kindOfMany')}
          value={kinds.size === 1 ? data[0]!.kind : null}
          options={kindOptions()}
          onChange={(k) => void setObjectKind(engine, entities, k)}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel>{translate('map.objects.size')}</FieldLabel>
        <SizeButtons engine={engine} entities={entities} />
      </div>
      <div className="space-y-3">
        <ToggleRow
          label={translate('map.objects.lockedMany')}
          checked={tri(entities.map((e) => e.state.locked))}
          onChange={(on) => void engine.setLocked(entities, on)}
        />
        <ToggleRow
          label={translate('map.objects.hiddenMany')}
          checked={tri(entities.map((e) => e.state.hiddenForPlayers))}
          onChange={(on) => void engine.setHidden(entities, on)}
        />
        <ToggleRow
          label={translate('map.objects.playersCanSearch')}
          checked={tri(data.map((o) => o.searchable === true))}
          onChange={(on) => void setSearchable(engine, entities, on)}
        />
      </div>
    </div>
  );
}

function SingleObject({ engine, entity }: Readonly<{ engine: MapEngine; entity: MapEntity }>) {
  const o = entity.data as ObjectData;
  const scale = useDistanceScale();
  const unit = scale.unitName;
  // Taille saisie dans l'unité de la scène : cases × distance par case
  const per = scale.unitsPerCell;
  const ppu = engine.kindContext().pixelsPerUnit;
  const g = entity.geometry;
  const locked = entity.state.locked;
  const idBase = `object-${entity.id}`;

  const transform = (label: string, next: Partial<typeof g>) =>
    void engine.transformEntities([{ entity, next: { ...g, ...next } }], label);
  const patch = (label: string, fn: (o: ObjectData) => ObjectData) =>
    void updateObjects(engine, label, [entity], fn);

  return (
    <div className="space-y-4">
      <ImageField engine={engine} entity={entity} />

      <div className="space-y-1.5">
        <FieldLabel htmlFor={`${idBase}-name`}>{translate('map.lights.name')}</FieldLabel>
        <CommitInput
          id={`${idBase}-name`}
          value={o.name ?? ''}
          maxLength={200}
          placeholder={translate('map.objects.namePlaceholder')}
          onCommit={(name) =>
            patch(translate('map.objects.rename'), (x) => ({ ...x, name: name.trim() }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <FieldLabel>{translate('map.objects.kind')}</FieldLabel>
        <Segmented
          label={translate('map.objects.kindOfOne')}
          value={o.kind}
          options={kindOptions()}
          onChange={(k) => void setObjectKind(engine, [entity], k)}
        />
        {o.kind === 'decor' && (
          <p className="text-xs text-muted-foreground">{translate('map.objects.decorExplained')}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <FieldLabel>{translate('map.objects.sizeIn', { unit })}</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          <CommitNumber
            aria-label={translate('map.objects.widthIn', { unit })}
            value={(g.width / ppu) * per}
            min={0.2}
            max={2000}
            step={0.25}
            suffix="L"
            disabled={locked}
            onCommit={(w) => transform(translate('map.objects.resize'), { width: (w / per) * ppu })}
          />
          <CommitNumber
            aria-label={translate('map.objects.heightIn', { unit })}
            value={(g.height / ppu) * per}
            min={0.2}
            max={2000}
            step={0.25}
            suffix="H"
            disabled={locked}
            onCommit={(h) =>
              transform(translate('map.objects.resize'), { height: (h / per) * ppu })
            }
          />
        </div>
        <SizeButtons engine={engine} entities={[entity]} />
      </div>

      <div className="space-y-1.5">
        <FieldLabel htmlFor={`${idBase}-rotation`}>{translate('map.objects.rotation')}</FieldLabel>
        <div className="flex items-center gap-1.5">
          <CommitNumber
            id={`${idBase}-rotation`}
            value={g.rotation}
            min={-360}
            max={360}
            suffix="°"
            className="w-24"
            disabled={locked}
            onCommit={(r) =>
              transform(translate('map.objects.rotate'), { rotation: normalizeDegrees(r) })
            }
          />
          <Info texte={translate('map.objects.rotateLeftHint')}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate('map.objects.rotateLeft')}
              disabled={locked}
              onClick={() => void engine.rotateEntities([entity], -15)}
            >
              <RotateCcw />
            </Button>
          </Info>
          <Info texte={translate('map.objects.rotateRightHint')}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={translate('map.objects.rotateRight')}
              disabled={locked}
              onClick={() => void engine.rotateEntities([entity], 15)}
            >
              <RotateCw />
            </Button>
          </Info>
          {g.rotation !== 0 && (
            <Button
              variant="ghost"
              size="xs"
              disabled={locked}
              onClick={() => transform(translate('map.objects.rotate'), { rotation: 0 })}
            >
              {translate('map.objects.straight')}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <ToggleRow
          label={translate('map.objects.locked')}
          hint={translate('map.objects.lockedHint')}
          checked={locked}
          onChange={(on) => void engine.setLocked([entity], on)}
        />
        <ToggleRow
          label={translate('map.objects.hidden')}
          hint={translate('map.objects.hiddenHint')}
          checked={entity.state.hiddenForPlayers}
          onChange={(on) => void engine.setHidden([entity], on)}
        />
      </div>

      <VisibleFor engine={engine} entity={entity} />

      <div className="space-y-1.5">
        <FieldLabel htmlFor={`${idBase}-notes`}>{translate('map.objects.gmNotes')}</FieldLabel>
        <CommitTextarea
          id={`${idBase}-notes`}
          value={o.notes ?? ''}
          maxLength={10_000}
          placeholder={translate('map.objects.gmNotesPlaceholder')}
          onCommit={(notes) =>
            patch(translate('map.objects.notes'), (x) => ({ ...x, notes: notes.trim() || null }))
          }
        />
      </div>
    </div>
  );
}

/** Image de l'objet : aperçu, remplacer (envoi), retirer (zone à fouiller). */
function ImageField({ engine, entity }: Readonly<{ engine: MapEngine; entity: MapEntity }>) {
  const o = entity.data as ObjectData;
  const [busy, setBusy] = useState(false);
  const campaignId = engine.store.getState().campaignId;
  const setImage = (url: string) =>
    void updateObjects(engine, translate('map.objects.changeImage'), [entity], (x) => ({
      ...x,
      imageUrl: url,
    }));

  return (
    <div className="flex items-center gap-3">
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-2">
        {o.imageUrl ? (
          <img src={o.imageUrl} alt="" className="size-full object-contain" />
        ) : (
          <Package className="size-6 text-subtle" aria-hidden />
        )}
      </span>
      <div className="min-w-0 space-y-1.5">
        <p className="text-xs text-muted-foreground">
          {o.imageUrl ? translate('map.objects.image') : translate('map.objects.noImageHint')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" size="xs" asChild>
            <label className={cn('cursor-pointer', busy && 'pointer-events-none opacity-60')}>
              {busy ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
              {o.imageUrl ? translate('map.objects.replace') : translate('map.objects.addImage')}
              <input
                type="file"
                accept={OBJECT_IMAGE_ACCEPT}
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (file.size > 10 * 1024 * 1024) {
                    toast.error(translate('map.objects.imageTooHeavy'));
                    return;
                  }
                  setBusy(true);
                  mapsApi
                    .upload(campaignId, file)
                    .then(setImage, (err: unknown) => toast.error(messageErreur(err)))
                    .finally(() => setBusy(false));
                }}
              />
            </label>
          </Button>
          {o.imageUrl && (
            <Button variant="ghost" size="xs" onClick={() => setImage('')}>
              <X />
              {translate('map.objects.remove')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** « Visible pour… » : tous les joueurs, ou certains personnages seulement. */
function VisibleFor({ engine, entity }: Readonly<{ engine: MapEngine; entity: MapEntity }>) {
  const o = entity.data as ObjectData;
  const restricted = o.visibility === 'custom';
  const chosen = new Set(restricted ? (o.visibleTo ?? []) : []);
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void engine.setRestrictedTo([entity], [...next]);
  };
  return (
    <div className="space-y-1.5">
      <FieldLabel>{translate('map.common.visibleFor')}</FieldLabel>
      <CharacterChoice
        label={translate('map.objects.visibleForShort')}
        isChosen={(id) => chosen.has(id)}
        onToggle={toggle}
        all={{
          checked: o.visibility === 'visible',
          onSelect: () => void engine.setRestrictedTo([entity], null),
        }}
      />
      {o.visibility === 'hidden' && (
        <p className="text-xs text-muted-foreground">{translate('map.objects.hiddenNobody')}</p>
      )}
      {restricted && !chosen.size && (
        <p className="text-xs text-warning">{translate('map.objects.nobodyChosen')}</p>
      )}
    </div>
  );
}

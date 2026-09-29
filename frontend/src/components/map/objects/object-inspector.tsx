'use client';

/**
 * Inspecteur d'un objet, section « Objet » (MJ ; docs/carte.md § 10) : nom, sorte, image,
 * taille, rotation, verrou, masqué, « Visible pour… », notes du MJ. Sélection multiple : les
 * réglages communs (verrou, masqué, fouille, sorte, taille). Chaque modification validée est
 * une commande annulable.
 */
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
} from '@/lib/map/modules/objects/placement';
import type { ObjectData } from '@/lib/map/modules/objects/types';
import { cn } from '@/lib/utils';
import { useMapState } from '../engine-context';
import {
  CommitInput,
  CommitNumber,
  CommitTextarea,
  FieldLabel,
  Segmented,
  ToggleRow,
} from './fields';
import { OBJECT_IMAGE_ACCEPT } from './object-library';

const KINDS: readonly { value: MapObjectKind; label: string }[] = [
  { value: 'item', label: 'Objet' },
  { value: 'weapon', label: 'Arme' },
  { value: 'decor', label: 'Décor' },
];

const tri = (values: boolean[]): boolean | 'mixed' =>
  values.every(Boolean) ? true : values.some(Boolean) ? 'mixed' : false;

export function ObjectInspector({ engine, entities }: InspectorSectionProps) {
  if (entities.length === 1) return <SingleObject engine={engine} entity={entities[0]!} />;
  return <ManyObjects engine={engine} entities={entities} />;
}

function SizeButtons({ engine, entities }: { engine: MapEngine; entities: readonly MapEntity[] }) {
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
        Rétrécir
      </Button>
      <Button
        variant="secondary"
        size="xs"
        disabled={locked}
        onClick={() => void scaleObjects(engine, entities, 1.25)}
      >
        <Maximize2 />
        Agrandir
      </Button>
      <Info texte="Une case sur le petit côté, aux proportions de l’image">
        <Button
          variant="ghost"
          size="xs"
          disabled={locked}
          onClick={() => void fitObjects(engine, entities)}
        >
          <Square />
          Une case
        </Button>
      </Info>
    </div>
  );
}

function ManyObjects({ engine, entities }: { engine: MapEngine; entities: readonly MapEntity[] }) {
  const data = entities.map((e) => e.data as ObjectData);
  const kinds = new Set(data.map((o) => o.kind));
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel>Sorte</FieldLabel>
        <Segmented
          label="Sorte des objets"
          value={kinds.size === 1 ? data[0]!.kind : null}
          options={KINDS}
          onChange={(k) => void setObjectKind(engine, entities, k)}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel>Taille</FieldLabel>
        <SizeButtons engine={engine} entities={entities} />
      </div>
      <div className="space-y-3">
        <ToggleRow
          label="Verrouillés"
          checked={tri(entities.map((e) => e.state.locked))}
          onChange={(on) => void engine.setLocked(entities, on)}
        />
        <ToggleRow
          label="Masqués aux joueurs"
          checked={tri(entities.map((e) => e.state.hiddenForPlayers))}
          onChange={(on) => void engine.setHidden(entities, on)}
        />
        <ToggleRow
          label="Les joueurs peuvent fouiller"
          checked={tri(data.map((o) => o.searchable === true))}
          onChange={(on) => void setSearchable(engine, entities, on)}
        />
      </div>
    </div>
  );
}

function SingleObject({ engine, entity }: { engine: MapEngine; entity: MapEntity }) {
  const o = entity.data as ObjectData;
  const unit = useMapState((s) => s.settings?.unitName ?? 'cases');
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
        <FieldLabel htmlFor={`${idBase}-name`}>Nom</FieldLabel>
        <CommitInput
          id={`${idBase}-name`}
          value={o.name ?? ''}
          maxLength={200}
          placeholder="Coffre, cadavre, table…"
          onCommit={(name) => patch('Renommer', (x) => ({ ...x, name: name.trim() }))}
        />
      </div>

      <div className="space-y-1.5">
        <FieldLabel>Sorte</FieldLabel>
        <Segmented
          label="Sorte de l’objet"
          value={o.kind}
          options={KINDS}
          onChange={(k) => void setObjectKind(engine, [entity], k)}
        />
        {o.kind === 'decor' && (
          <p className="text-xs text-muted-foreground">
            Un décor reste visible derrière les murs : l’obscurité le couvre, comme le fond.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <FieldLabel>Taille ({unit})</FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          <CommitNumber
            aria-label={`Largeur en ${unit}`}
            value={g.width / ppu}
            min={0.2}
            max={2000}
            step={0.25}
            suffix="L"
            disabled={locked}
            onCommit={(w) => transform('Redimensionner', { width: w * ppu })}
          />
          <CommitNumber
            aria-label={`Hauteur en ${unit}`}
            value={g.height / ppu}
            min={0.2}
            max={2000}
            step={0.25}
            suffix="H"
            disabled={locked}
            onCommit={(h) => transform('Redimensionner', { height: h * ppu })}
          />
        </div>
        <SizeButtons engine={engine} entities={[entity]} />
      </div>

      <div className="space-y-1.5">
        <FieldLabel htmlFor={`${idBase}-rotation`}>Rotation</FieldLabel>
        <div className="flex items-center gap-1.5">
          <CommitNumber
            id={`${idBase}-rotation`}
            value={g.rotation}
            min={-360}
            max={360}
            suffix="°"
            className="w-24"
            disabled={locked}
            onCommit={(r) => transform('Pivoter', { rotation: normalizeDegrees(r) })}
          />
          <Info texte="De 15° à gauche (⇧R)">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Pivoter de 15° à gauche"
              disabled={locked}
              onClick={() => void engine.rotateEntities([entity], -15)}
            >
              <RotateCcw />
            </Button>
          </Info>
          <Info texte="De 15° à droite (R)">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Pivoter de 15° à droite"
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
              onClick={() => transform('Pivoter', { rotation: 0 })}
            >
              Droit
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <ToggleRow
          label="Verrouillé"
          hint="Il se sélectionne mais ne bouge plus."
          checked={locked}
          onChange={(on) => void engine.setLocked([entity], on)}
        />
        <ToggleRow
          label="Masqué aux joueurs"
          hint="Vous le voyez hachuré ; les joueurs ne le reçoivent pas."
          checked={entity.state.hiddenForPlayers}
          onChange={(on) => void engine.setHidden([entity], on)}
        />
      </div>

      <VisibleFor engine={engine} entity={entity} />

      <div className="space-y-1.5">
        <FieldLabel htmlFor={`${idBase}-notes`}>Notes du MJ</FieldLabel>
        <CommitTextarea
          id={`${idBase}-notes`}
          value={o.notes ?? ''}
          maxLength={10_000}
          placeholder="Piège, clé cachée… (jamais montré aux joueurs)"
          onCommit={(notes) => patch('Notes', (x) => ({ ...x, notes: notes.trim() || null }))}
        />
      </div>
    </div>
  );
}

/** Image de l'objet : aperçu, remplacer (envoi), retirer (zone à fouiller). */
function ImageField({ engine, entity }: { engine: MapEngine; entity: MapEntity }) {
  const o = entity.data as ObjectData;
  const [busy, setBusy] = useState(false);
  const campaignId = engine.store.getState().campaignId;
  const setImage = (url: string) =>
    void updateObjects(engine, 'Changer l’image', [entity], (x) => ({ ...x, imageUrl: url }));

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
          {o.imageUrl ? 'Image de l’objet' : 'Sans image : seul le repère de fouille est vu.'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" size="xs" asChild>
            <label className={cn('cursor-pointer', busy && 'pointer-events-none opacity-60')}>
              {busy ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
              {o.imageUrl ? 'Remplacer' : 'Ajouter une image'}
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
                    toast.error('Image trop lourde : 10 Mo au plus.');
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
              Retirer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** « Visible pour… » : tous les joueurs, ou certains personnages seulement. */
function VisibleFor({ engine, entity }: { engine: MapEngine; entity: MapEntity }) {
  const o = entity.data as ObjectData;
  const characters = engine.directory.characters();
  const restricted = o.visibility === 'custom';
  const chosen = new Set(restricted ? (o.visibleTo ?? []) : []);
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    void engine.setRestrictedTo([entity], [...next]);
  };
  const chip = (pressed: boolean) =>
    cn(
      'h-7 rounded-full border px-2.5 text-xs transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      pressed
        ? 'border-primary/50 bg-primary/15 text-primary-strong'
        : 'border-border-strong text-muted-foreground hover:text-foreground',
    );
  return (
    <div className="space-y-1.5">
      <FieldLabel>Visible pour…</FieldLabel>
      {characters.length ? (
        <div role="group" aria-label="Visible pour" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={o.visibility === 'visible'}
            className={chip(o.visibility === 'visible')}
            onClick={() => void engine.setRestrictedTo([entity], null)}
          >
            Tous les joueurs
          </button>
          {characters.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={chosen.has(c.id)}
              className={chip(chosen.has(c.id))}
              onClick={() => toggle(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Aucun personnage joueur dans la campagne.</p>
      )}
      {o.visibility === 'hidden' && (
        <p className="text-xs text-muted-foreground">
          Masqué : aucun joueur ne le voit. Choisir des personnages le leur montre.
        </p>
      )}
      {restricted && !chosen.size && (
        <p className="text-xs text-warning">Aucun personnage choisi : personne ne le voit.</p>
      )}
    </div>
  );
}

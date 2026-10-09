'use client';

/**
 * Sections de l'inspecteur pour les tokens (docs/carte.md § 10) :
 * - « Personnage » : portrait, nom, camp, ressource principale, et la fiche complète
 *   (`FichePersonnage` dans le panneau de fiche, droits habituels) ;
 * - « Token » : visibilité (dont « pour certains joueurs »), vision (rayon, bonus), taille,
 *   forme et image du token (MJ) ; vision augmentée pour un joueur sur ses personnages.
 * Chaque réglage est une commande annulable, pour toute la sélection.
 */
import { translate } from '@/i18n/runtime';
import type { MapTokenShape, MapTokenVisibility } from '@vtt/contracts';
import { MediaUrl } from '@vtt/contracts';
import { Circle, IdCard, ImageUp, Square, Undo2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { messageErreur } from '@/lib/api';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { InspectorSectionProps } from '@/lib/map/engine/map-engine';
import { mapsApi } from '@/lib/map/api';
import {
  patchTokens,
  setVisibility,
  setVisionBoost,
  setVisionRadius,
  toggleVisibleTo,
} from '../engine/edit';
import {
  ownsToken,
  sideLabel,
  tokenImage,
  visibilityHint,
  visibilityLabel,
  VISIBILITY_ORDER,
  type ResourceGauge,
  type TokenData,
} from '../engine/model';
import type { TokensState } from '../engine/state';
import { cn } from '@/lib/utils';
import { CharacterChoice } from '@/components/map/character-choice';
import { useCharacterInfo, useTokens } from './use-tokens';

type TokenEntity = MapEntity<TokenData>;

const asTokens = (entities: InspectorSectionProps['entities']) =>
  entities as unknown as readonly TokenEntity[];

/** Valeur commune à la sélection, ou null si elle diffère. */
function common<T>(entities: readonly TokenEntity[], pick: (d: TokenData) => T): T | null {
  const first = entities[0] ? pick(entities[0].data) : null;
  return entities.every((e) => pick(e.data) === first) ? first : null;
}

const SIDE_TONE = { players: 'primaire', allies: 'succes', enemies: 'danger' } as const;

// ─── Personnage ──────────────────────────────────────────────────────────────

export function TokenCharacterSection({ engine, entities }: Readonly<InspectorSectionProps>) {
  const tokens = useTokens(engine);
  const token = asTokens(entities)[0]!.data;
  const info = useCharacterInfo(tokens, token.characterId);
  const name = info?.name ?? token.draft?.name ?? translate('map.common.character');
  const side = info?.side ?? token.draft?.side ?? null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Illustration
          src={tokenImage(token, info).url}
          graine={name}
          alt=""
          className="size-14 shrink-0 rounded-xl border border-border"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-[15px] font-semibold">{name}</p>
          <div className="flex flex-wrap gap-1.5">
            {side && <Badge ton={SIDE_TONE[side]}>{sideLabel(side)}</Badge>}
            {info?.kind === 'npc' && <Badge>{translate('map.tokens.inspector.npc')}</Badge>}
          </div>
        </div>
      </div>
      {info?.resource && <Gauge resource={info.resource} />}
      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        disabled={!!token.draft}
        onClick={() => tokens.library.setState({ sheetFor: token.characterId })}
      >
        <IdCard />
        {translate('map.tokens.inspector.openSheet')}
      </Button>
    </div>
  );
}

function Gauge({ resource: r }: Readonly<{ resource: ResourceGauge }>) {
  const part = r.max > 0 ? Math.max(0, Math.min(1, r.value / r.max)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium uppercase tracking-wider text-subtle">{r.label}</span>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {r.value} / {r.max}
        </span>
      </div>
      <div
        role="meter"
        aria-label={r.label}
        aria-valuemin={0}
        aria-valuemax={r.max}
        aria-valuenow={r.value}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
      >
        <div
          className={cn(
            'h-full rounded-full',
            !r.color && (r.rising ? 'bg-destructive' : 'bg-success'),
          )}
          // Couleur déclarée par la présentation du système (donnée)
          style={{ width: `${part * 100}%`, ...(r.color ? { background: r.color } : {}) }}
        />
      </div>
    </div>
  );
}

// ─── Réglages du token ───────────────────────────────────────────────────────

function Field({
  label,
  htmlFor,
  children,
}: Readonly<{
  label: string;
  htmlFor?: string;
  children: ReactNode;
}>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function TokenSettingsSection({ engine, entities }: Readonly<InspectorSectionProps>) {
  const tokens = useTokens(engine);
  const list = asTokens(entities).filter((e) => !e.data.draft);
  const gm = engine.viewer.role === 'gm';
  const boostId = useId();
  if (!list.length)
    return (
      <p className="text-sm text-muted-foreground">{translate('map.tokens.library.placing')}</p>
    );

  const boost = common(list, (d) => d.visionBoost);
  const boostSwitch = (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={boostId} className="text-[13px]">
        {translate('map.tokens.visionBoost')}
        <span className="block text-xs font-normal text-muted-foreground">
          {translate('map.tokens.inspector.boostHint')}
        </span>
      </Label>
      <Switch
        id={boostId}
        checked={boost === true}
        onCheckedChange={(on) => void setVisionBoost(tokens, list, on)}
      />
    </div>
  );
  if (!gm) {
    if (!list.every((e) => ownsToken(e.data, engine.viewer))) return null;
    return <div className="space-y-3">{boostSwitch}</div>;
  }

  return (
    <div className="space-y-4">
      <VisibilityField tokens={tokens} entities={list} />
      <VisionField tokens={tokens} entities={list} />
      {boostSwitch}
      <SizeField tokens={tokens} entities={list} />
      <ShapeField tokens={tokens} entities={list} />
      {list.length === 1 && <ImageField tokens={tokens} entity={list[0]!} />}
    </div>
  );
}

interface FieldProps {
  tokens: TokensState;
  entities: readonly TokenEntity[];
}

function VisibilityField({ tokens, entities: es }: Readonly<FieldProps>) {
  const id = useId();
  const value = common(es, (d) => d.visibility);
  return (
    <Field label={translate('map.tokens.visibilityTitle')} htmlFor={id}>
      <SelectField
        id={id}
        value={value ?? ''}
        placeholder={translate('map.tokens.inspector.several')}
        onValueChange={(v) => {
          if (!v) return;
          const next = v as MapTokenVisibility;
          // « Pour certains joueurs » sans personnage coché : le choix se fait dessous
          if (next === 'custom') void setVisibility(tokens, es, 'custom', es[0]!.data.visibleTo);
          else void setVisibility(tokens, es, next);
        }}
        options={VISIBILITY_ORDER.map((v) => ({
          valeur: v,
          nom: visibilityLabel(v),
        }))}
      />
      {value && <p className="text-xs text-muted-foreground">{visibilityHint(value)}</p>}
      {value === 'custom' && (
        <div className="pt-1">
          <CharacterChoice
            label={translate('map.tokens.inspector.seenBy')}
            isChosen={(cid) => es.every((e) => e.data.visibleTo.includes(cid))}
            onToggle={(cid) => void toggleVisibleTo(tokens, es, cid)}
          />
        </div>
      )}
    </Field>
  );
}

function VisionField({ tokens, entities: es }: Readonly<FieldProps>) {
  const { engine } = tokens;
  const ctx = engine.kindContext();
  const unit = ctx.unitName;
  // Saisie dans l'unité de la scène (cases × distance par case), stockée en pixels du monde
  const ppu = ctx.pixelsPerUnit / (ctx.unitsPerCell || 1);
  const radius = common(es, (d) => d.visionRadius);
  const units = radius === null ? null : Math.round((radius / ppu) * 10) / 10;
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? units ?? 0;
  return (
    <Field label={translate('map.tokens.inspector.radiusIn', { unit })}>
      <div className="flex items-center gap-3">
        <Slider
          aria-label={translate('map.tokens.visionRadius')}
          min={0}
          max={30 * (ctx.unitsPerCell || 1)}
          step={0.5}
          value={[shown]}
          onValueChange={([v]) => setDraft(v ?? 0)}
          onValueCommit={([v]) => {
            setDraft(null);
            void setVisionRadius(tokens, es, (v ?? 0) * ppu);
          }}
        />
        <NumberBox
          label={translate('map.tokens.visionRadius')}
          value={units}
          min={0}
          step={0.5}
          onCommit={(v) => void setVisionRadius(tokens, es, v * ppu)}
        />
      </div>
    </Field>
  );
}

function SizeField({ tokens, entities: es }: Readonly<FieldProps>) {
  const scale = common(es, (d) => d.scale);
  const [draft, setDraft] = useState<number | null>(null);
  const commit = (v: number) => {
    const s = Math.min(100, Math.max(0.1, Math.round(v * 100) / 100));
    void patchTokens(tokens, es, translate('map.tokens.inspector.size'), (d) =>
      d.scale === s ? d : { ...d, scale: s },
    );
  };
  return (
    <Field label="Taille (en cases)">
      <div className="flex items-center gap-3">
        <Slider
          aria-label={translate('map.tokens.inspector.tokenSize')}
          min={0.25}
          max={6}
          step={0.25}
          value={[draft ?? scale ?? 1]}
          onValueChange={([v]) => setDraft(v ?? 1)}
          onValueCommit={([v]) => {
            setDraft(null);
            commit(v ?? 1);
          }}
        />
        <NumberBox
          label={translate('map.tokens.inspector.size')}
          value={scale}
          min={0.1}
          step={0.25}
          onCommit={commit}
        />
      </div>
    </Field>
  );
}

function ShapeField({ tokens, entities: es }: Readonly<FieldProps>) {
  const shape = common(es, (d) => d.shape);
  const set = (s: MapTokenShape) =>
    void patchTokens(tokens, es, translate('map.tokens.inspector.shape'), (d) =>
      d.shape === s ? d : { ...d, shape: s },
    );
  const options = [
    { value: 'circle' as const, label: translate('map.tokens.inspector.round'), icon: Circle },
    { value: 'square' as const, label: translate('map.tokens.inspector.square'), icon: Square },
  ];
  return (
    <Field label={translate('map.tokens.inspector.shape')}>
      <div
        role="radiogroup"
        aria-label={translate('map.tokens.inspector.tokenShape')}
        className="grid grid-cols-2 gap-1.5"
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={shape === o.value}
            onClick={() => set(o.value)}
            className={cn(
              'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border text-[13px] transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-3.5',
              shape === o.value
                ? 'border-primary/50 bg-primary/15 text-primary-strong'
                : 'border-border-strong text-muted-foreground hover:text-foreground',
            )}
          >
            <o.icon aria-hidden />
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

function ImageField({ tokens, entity }: Readonly<{ tokens: TokensState; entity: TokenEntity }>) {
  const { engine } = tokens;
  const id = useId();
  const file = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(entity.data.imageUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setUrl(entity.data.imageUrl ?? ''), [entity.data.imageUrl]);
  const save = (next: string | null) =>
    void patchTokens(tokens, [entity], translate('map.tokens.inspector.image'), (d) =>
      d.imageUrl === next ? d : { ...d, imageUrl: next },
    );
  const submit = () => {
    const v = url.trim();
    if (!v) return save(null);
    const ok = MediaUrl.safeParse(v);
    if (!ok.success) {
      setError(translate('map.tokens.inspector.urlHint'));
      return;
    }
    setError(null);
    save(ok.data);
  };
  const upload = async (f: File) => {
    setBusy(true);
    setError(null);
    try {
      const campaignId = engine.store.getState().campaignId;
      const publicUrl = await mapsApi.upload(campaignId, f, 'npc-image');
      setUrl(publicUrl);
      save(publicUrl);
    } catch (err) {
      toast.error(messageErreur(err, translate('map.tokens.inspector.uploadFailed')));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Field label={translate('map.tokens.inspector.image')} htmlFor={id}>
      <Input
        id={id}
        value={url}
        placeholder={translate('map.tokens.inspector.portrait')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-erreur` : undefined}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        className="h-9 text-[13px]"
      />
      {error && (
        <p id={`${id}-erreur`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-1.5">
        <Button variant="secondary" size="xs" loading={busy} onClick={() => file.current?.click()}>
          <ImageUp />
          {translate('map.tokens.inspector.upload')}
        </Button>
        {entity.data.imageUrl && (
          <Button variant="ghost" size="xs" onClick={() => save(null)}>
            <Undo2 />
            {translate('map.tokens.inspector.portrait')}
          </Button>
        )}
      </div>
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
        }}
      />
    </Field>
  );
}

/** Petit champ numérique : validé à Entrée ou en quittant le champ. */
function NumberBox({
  label,
  value,
  min,
  step,
  onCommit,
}: Readonly<{
  label: string;
  value: number | null;
  min: number;
  step: number;
  onCommit(v: number): void;
}>) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => setText(value === null ? '' : String(value)), [value]);
  const commit = () => {
    const v = Number(text.replace(',', '.'));
    if (text.trim() === '' || !Number.isFinite(v) || v < min) {
      setText(value === null ? '' : String(value));
      return;
    }
    if (v !== value) onCommit(v);
  };
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      value={text}
      placeholder="—"
      step={step}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      className="h-8 w-16 shrink-0 px-2 text-center font-mono text-[13px] tabular-nums"
    />
  );
}

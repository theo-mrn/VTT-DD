'use client';

/**
 * Création rapide d'un PNJ (docs/carte.md § 10) : nom, image, type d'entité et valeurs clés,
 * tous lus dans le système et sa présentation (aucune clé de jeu en dur). Les valeurs clés
 * sont les attributs des statistiques du bestiaire déclarées pour ce type
 * (`references.bestiaire.statistiques`, sinon les blocs de sa fiche), que l'on peut saisir :
 * les valeurs calculées (Défense, PV max…) suivent les règles. Le PNJ est ensuite posé comme
 * une carte de la bibliothèque (clic sur la scène, ou glisser l'aperçu).
 */
import { MediaUrl } from '@vtt/contracts';
import type { Attribut, Presentation, SystemeCharge, Valeur } from '@vtt/rules';
import { Crosshair, ImageUp } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { statGroupsFor } from '@/components/resources/model/bestiary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { messageErreur } from '@/lib/api';
import { mapsApi } from '@/lib/map/api';
import type { PlacementSource } from '@/lib/map/modules/tokens/state';
import { LibraryCard, type CardDrag } from './library-card';

/** Natures qu'une création rapide saisit (les valeurs calculées suivent les règles). */
const SAISISSABLES = new Set<Attribut['nature']>(['base', 'choix', 'texte', 'booleen']);

type Saisie = string | boolean;

function defaultOf(a: Attribut): Saisie {
  switch (a.nature) {
    case 'base':
      return String(a.defaut);
    case 'choix':
      return a.defaut ?? '';
    case 'texte':
      return a.defaut;
    case 'booleen':
      return a.defaut;
    default:
      return '';
  }
}

/** Valeurs à envoyer : celles qui diffèrent du défaut, converties selon leur nature. */
function valeursDe(attributs: readonly Attribut[], saisies: Record<string, Saisie>) {
  const out: Record<string, Valeur> = {};
  for (const a of attributs) {
    const v = saisies[a.cle];
    if (v === undefined || v === defaultOf(a)) continue;
    if (a.nature === 'base') {
      const n = Number(String(v).replace(',', '.'));
      if (String(v).trim() !== '' && Number.isFinite(n)) out[a.cle] = n;
    } else if (a.nature === 'booleen') out[a.cle] = v === true;
    else if (typeof v === 'string' && v !== '') out[a.cle] = v.slice(0, 2000);
  }
  return out;
}

export function QuickCreate({
  campaignId,
  systeme,
  presentation,
  armedKey,
  drag,
  onArm,
}: {
  campaignId: string;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  armedKey: string | null;
  drag: CardDrag;
  onArm(source: PlacementSource | null): void;
}) {
  const ids = { name: useId(), type: useId(), image: useId() };
  const types = useMemo(
    () => [...systeme.entites.values()].map((e) => ({ id: e.type.id, nom: e.type.nom })),
    [systeme],
  );
  const [type, setType] = useState(types[0]?.id ?? '');
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});
  const [uploading, setUploading] = useState(false);
  const [touched, setTouched] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const attributs = useMemo(() => {
    const e = systeme.entites.get(type);
    if (!e) return [];
    const cles = [
      ...new Set(statGroupsFor(systeme, presentation, type).flatMap((g) => g.attributs)),
    ];
    return cles.flatMap((c) => {
      const a = e.attributs.get(c);
      return a && SAISISSABLES.has(a.nature) ? [a] : [];
    });
  }, [systeme, presentation, type]);

  const imageCheck = image.trim() ? MediaUrl.safeParse(image.trim()) : null;
  const imageError =
    imageCheck && !imageCheck.success ? 'Adresse https ou chemin du site attendu.' : null;
  const nameError = touched && !name.trim() ? 'Donnez un nom au PNJ.' : null;
  const ready = name.trim().length > 0 && !imageError && Boolean(type);

  const source = useMemo<PlacementSource | null>(() => {
    if (!ready) return null;
    const nom = name.trim().slice(0, 100);
    const imageUrl = imageCheck?.success ? imageCheck.data : null;
    const valeurs = valeursDe(attributs, saisies);
    return {
      key: `quick:${type}:${nom}:${imageUrl ?? ''}:${JSON.stringify(valeurs)}`,
      name: nom,
      imageUrl,
      source: {
        quick: {
          name: nom,
          type,
          ...(imageUrl ? { imageUrl } : {}),
          ...(Object.keys(valeurs).length ? { valeurs } : {}),
        },
      },
    };
  }, [ready, name, imageCheck, attributs, saisies, type]);

  // Déjà choisie pour la pose : la source suit les modifications du formulaire
  const armedQuick = armedKey?.startsWith('quick:') ?? false;
  useEffect(() => {
    if (!armedQuick || armedKey === (source?.key ?? null)) return;
    onArm(source);
  }, [armedQuick, armedKey, source, onArm]);

  const upload = async (f: File) => {
    setUploading(true);
    try {
      setImage(await mapsApi.upload(campaignId, f));
    } catch (err) {
      toast.error(messageErreur(err, 'L’image n’a pas pu être envoyée.'));
    } finally {
      setUploading(false);
    }
  };

  const typeNom = types.find((t) => t.id === type)?.nom ?? null;

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (source) onArm(source);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={ids.name} className="text-xs text-muted-foreground">
          Nom <span aria-hidden>*</span>
        </Label>
        <Input
          id={ids.name}
          value={name}
          maxLength={100}
          required
          placeholder="Garde du pont"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${ids.name}-erreur` : undefined}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          className="h-9 text-[13px]"
        />
        {nameError && (
          <p id={`${ids.name}-erreur`} role="alert" className="text-xs text-destructive">
            {nameError}
          </p>
        )}
      </div>

      {types.length > 1 && (
        <div className="space-y-1.5">
          <Label htmlFor={ids.type} className="text-xs text-muted-foreground">
            Type d’entité
          </Label>
          <SelectField
            id={ids.type}
            value={type}
            onValueChange={(v) => {
              setType(v);
              setSaisies({});
            }}
            options={types.map((t) => ({ valeur: t.id, nom: t.nom }))}
            className="h-9"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={ids.image} className="text-xs text-muted-foreground">
          Image du token
        </Label>
        <div className="flex gap-1.5">
          <Input
            id={ids.image}
            value={image}
            placeholder="https://…"
            aria-invalid={imageError ? true : undefined}
            aria-describedby={imageError ? `${ids.image}-erreur` : undefined}
            onChange={(e) => setImage(e.target.value)}
            className="h-9 min-w-0 flex-1 text-[13px]"
          />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Envoyer une image"
            loading={uploading}
            onClick={() => file.current?.click()}
          >
            <ImageUp />
          </Button>
        </div>
        {imageError && (
          <p id={`${ids.image}-erreur`} role="alert" className="text-xs text-destructive">
            {imageError}
          </p>
        )}
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
      </div>

      {attributs.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-xs font-medium uppercase tracking-[0.12em] text-subtle">
            Valeurs clés
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {attributs.map((a) => (
              <AttributeInput
                key={a.cle}
                attribut={a}
                value={saisies[a.cle] ?? defaultOf(a)}
                onChange={(v) => setSaisies((s) => ({ ...s, [a.cle]: v }))}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Les valeurs calculées (défense, maximums…) suivent les règles du système.
          </p>
        </fieldset>
      )}

      {source ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            Aperçu : glissez-le sur la scène, ou choisissez-le puis cliquez sur la carte.
          </p>
          <LibraryCard
            source={source}
            subtitle={typeNom}
            stats={[]}
            armed={armedKey === source.key}
            drag={drag}
            onArm={() => onArm(armedKey === source.key ? null : source)}
          />
        </div>
      ) : (
        <Button type="submit" variant="secondary" size="sm" className="w-full">
          <Crosshair />
          Choisir pour la pose
        </Button>
      )}
    </form>
  );
}

function AttributeInput({
  attribut: a,
  value,
  onChange,
}: {
  attribut: Attribut;
  value: Saisie;
  onChange(v: Saisie): void;
}) {
  const id = useId();
  const label = (
    <Label htmlFor={id} className="truncate text-xs text-muted-foreground" title={a.nom}>
      {a.abrege ?? a.nom}
    </Label>
  );
  if (a.nature === 'booleen')
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-2 py-1.5">
        {label}
        <Switch id={id} checked={value === true} onCheckedChange={(on) => onChange(on)} />
      </div>
    );
  if (a.nature === 'choix')
    return (
      <div className="space-y-1">
        {label}
        <SelectField
          id={id}
          value={typeof value === 'string' ? value : ''}
          onValueChange={onChange}
          options={a.options.map((o) => ({ valeur: o.valeur, nom: o.nom }))}
          className="h-8 text-[13px]"
        />
      </div>
    );
  return (
    <div className="space-y-1">
      {label}
      <Input
        id={id}
        value={typeof value === 'string' ? value : ''}
        inputMode={a.nature === 'base' ? 'numeric' : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 px-2 text-[13px]"
      />
    </div>
  );
}

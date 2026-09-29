'use client';

/**
 * Formulaire d'un modèle de PNJ (« Mes PNJ », création rapide de la carte) : nom, catégorie,
 * type d'entité, image et valeurs clés, tous lus dans le système et sa présentation (aucune
 * clé de jeu en dur). Les valeurs clés sont les attributs des statistiques du bestiaire
 * déclarées pour ce type (`references.bestiaire.statistiques`, sinon les blocs de sa fiche)
 * que l'on peut saisir : les valeurs calculées (Défense, PV max…) suivent les règles.
 *
 * En création, les valeurs envoyées sont celles qui diffèrent du défaut ; en modification,
 * celles qui ont changé depuis l'ouverture (le reste de l'état du modèle est gardé).
 */
import { MediaUrl } from '@vtt/contracts';
import type { Attribut, EtatEntite, Presentation, SystemeCharge, Valeur } from '@vtt/rules';
import { ImageUp } from 'lucide-react';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { statGroupsFor } from '@/components/resources/model/bestiary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { messageErreur } from '@/lib/api';
import type { NpcTemplateCategory } from '@/lib/bestiary';
import { mapsApi } from '@/lib/map/api';
import { cn } from '@/lib/utils';

/** Natures que le formulaire saisit (les valeurs calculées suivent les règles). */
const SAISISSABLES = new Set<Attribut['nature']>(['base', 'choix', 'texte', 'booleen']);
const NONE = '__none';

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

/** Saisie affichée d'une valeur de l'état (nombre en texte). */
export function saisieOf(v: Valeur | undefined, a: Attribut): Saisie {
  if (v === undefined) return defaultOf(a);
  if (a.nature === 'booleen') return v === true;
  return String(v);
}

/** Valeurs à envoyer : celles qui diffèrent de `depart`, converties selon leur nature. */
export function valeursDe(
  attributs: readonly Attribut[],
  saisies: Record<string, Saisie>,
  depart: (a: Attribut) => Saisie,
) {
  const out: Record<string, Valeur> = {};
  for (const a of attributs) {
    const v = saisies[a.cle];
    if (v === undefined || v === depart(a)) continue;
    if (a.nature === 'base') {
      const n = Number(String(v).replace(',', '.'));
      if (String(v).trim() !== '' && Number.isFinite(n)) out[a.cle] = n;
    } else if (a.nature === 'booleen') out[a.cle] = v === true;
    else if (typeof v === 'string' && v !== '') out[a.cle] = v.slice(0, 2000);
  }
  return out;
}

/** Valeurs clés saisissables d'un type d'entité. */
export function keyAttributes(
  systeme: SystemeCharge,
  presentation: Presentation | null,
  type: string,
): Attribut[] {
  const e = systeme.entites.get(type);
  if (!e) return [];
  const cles = [...new Set(statGroupsFor(systeme, presentation, type).flatMap((g) => g.attributs))];
  return cles.flatMap((c) => {
    const a = e.attributs.get(c);
    return a && SAISISSABLES.has(a.nature) ? [a] : [];
  });
}

export interface NpcFormResult {
  name: string;
  type: string;
  imageUrl: string | null;
  categoryId: string | null;
  /** Valeurs changées (création : par rapport au défaut ; modification : à l'ouverture). */
  valeurs: Record<string, Valeur>;
}

export interface NpcFormInitial {
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  etat: EtatEntite | null;
}

export function NpcForm({
  campaignId,
  systeme,
  presentation,
  categories,
  initial,
  defaultCategoryId,
  submitLabel,
  submitIcon,
  busy,
  columns = 2,
  onSubmit,
  onCancel,
}: {
  campaignId: string;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  categories: readonly NpcTemplateCategory[];
  /** Modèle à modifier (son type ne change pas) ; absent : création. */
  initial?: NpcFormInitial;
  /** Création : catégorie choisie d'avance (celle affichée dans la liste). */
  defaultCategoryId?: string | null;
  submitLabel: string;
  submitIcon?: ReactNode;
  busy?: boolean;
  /** Colonnes de la grille des valeurs. */
  columns?: 2 | 3;
  onSubmit(result: NpcFormResult): void;
  onCancel?(): void;
}) {
  const ids = { name: useId(), type: useId(), image: useId(), category: useId() };
  const types = useMemo(
    () => [...systeme.entites.values()].map((e) => ({ id: e.type.id, nom: e.type.nom })),
    [systeme],
  );
  const editing = Boolean(initial);
  const [type, setType] = useState(initial?.etat?.type ?? types[0]?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [image, setImage] = useState(initial?.imageUrl ?? '');
  const [category, setCategory] = useState(
    (initial ? initial.categoryId : defaultCategoryId) ?? NONE,
  );
  const [uploading, setUploading] = useState(false);
  const [touched, setTouched] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const attributs = useMemo(
    () => keyAttributes(systeme, presentation, type),
    [systeme, presentation, type],
  );
  // Départ des valeurs : celles du modèle ouvert, sinon les défauts du système
  const depart = useMemo(() => {
    const valeurs = initial?.etat?.type === type ? (initial.etat.valeurs ?? {}) : {};
    return (a: Attribut) => saisieOf(valeurs[a.cle], a);
  }, [initial, type]);
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});

  const imageCheck = image.trim() ? MediaUrl.safeParse(image.trim()) : null;
  const imageError =
    imageCheck && !imageCheck.success ? 'Adresse https ou chemin du site attendu.' : null;
  const nameError = touched && !name.trim() ? 'Donnez un nom au PNJ.' : null;
  const ready = name.trim().length > 0 && !imageError && Boolean(type);

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

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!ready || busy) return;
        onSubmit({
          name: name.trim().slice(0, 100),
          type,
          imageUrl: imageCheck?.success ? imageCheck.data : null,
          categoryId: category === NONE ? null : category,
          valeurs: valeursDe(attributs, saisies, depart),
        });
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

      <div className={cn('grid gap-3', categories.length > 0 && types.length > 1 && 'grid-cols-2')}>
        {categories.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor={ids.category} className="text-xs text-muted-foreground">
              Catégorie
            </Label>
            <SelectField
              id={ids.category}
              value={category}
              onValueChange={setCategory}
              options={[
                { valeur: NONE, nom: 'Sans catégorie' },
                ...categories.map((c) => ({ valeur: c.id, nom: c.name })),
              ]}
              className="h-9"
            />
          </div>
        )}
        {types.length > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor={ids.type} className="text-xs text-muted-foreground">
              Type d’entité
            </Label>
            <SelectField
              id={ids.type}
              value={type}
              disabled={editing}
              onValueChange={(v) => {
                setType(v);
                setSaisies({});
              }}
              options={types.map((t) => ({ valeur: t.id, nom: t.nom }))}
              className="h-9"
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={ids.image} className="text-xs text-muted-foreground">
          Image
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
          <div className={cn('grid gap-2', columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            {attributs.map((a) => (
              <AttributeInput
                key={a.cle}
                attribut={a}
                value={saisies[a.cle] ?? depart(a)}
                onChange={(v) => setSaisies((s) => ({ ...s, [a.cle]: v }))}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Les valeurs calculées (défense, maximums…) suivent les règles du système.
          </p>
        </fieldset>
      )}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Annuler
          </Button>
        )}
        <Button type="submit" size="sm" loading={busy} className={cn(!onCancel && 'w-full')}>
          {submitIcon}
          {submitLabel}
        </Button>
      </div>
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

'use client';

/**
 * Import d'une fiche (docs/import-fiche.md) : le joueur colle le lien de sa fiche en ligne, le
 * service la lit, le détecteur la rapproche du système de la campagne, puis le joueur vérifie
 * tout (valeurs, entrées, voies libres, apparence, histoire) avant de créer. Le personnage naît
 * terminé, engagé et incarné dans la campagne, marqué « Importé ». Aucune règle de jeu ici.
 */
import { useTranslations } from 'next-intl';
import type { SheetReading } from '@vtt/contracts';
import {
  calculer,
  deduireBases,
  EtatEntite,
  nouvellePossession,
  type Entree,
  type SystemeCharge,
} from '@vtt/rules';
import { Check, CircleHelp, Link2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Chargement } from '@/components/compte/elements';
import { EnTeteFocus } from '@/components/shell/cadre-focus';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Info } from '@/components/ui/tooltip';
import { api, messageErreur } from '@/lib/api';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { useCampagne } from '@/lib/campagnes';
import { detectSheet, type DetectedEntry, type SheetDetection } from '@/lib/import-fiche/detect';
import { TYPE_HEROS, useImporterPersonnage, type DemandeImport } from '@/lib/personnages';
import { cn } from '@/lib/utils';
import {
  entriesOf,
  freePathKinds,
  rankCount,
  type FreePathDraft,
} from '../fiche/blocks/skills/free-path';
import { ApercuFiche } from './apercu-fiche';
import { CreationFermee } from './assistant-personnage';

/** Voie absente du catalogue, posée en entrée libre (voie et capacités nommées par ses rangs). */
interface FreePath {
  name: string;
  rank: number;
  entries: Entree[];
  on: boolean;
}

/** Ce que le joueur vérifie et corrige avant de créer. */
interface Draft {
  name: string;
  values: Record<string, number | string | boolean>;
  entries: (DetectedEntry & { on: boolean })[];
  free: FreePath[];
  appearance: string;
  backstory: string;
  portrait: boolean;
}

function draftOf(systeme: SystemeCharge, d: SheetDetection): Draft {
  // Voies libres : brouillon de l'éditeur de voie, une capacité par rang nommé
  const kinds = freePathKinds(systeme, TYPE_HEROS);
  const vierge = calculer(
    systeme,
    EtatEntite.parse({
      type: TYPE_HEROS,
      systeme: { id: systeme.source.id, version: systeme.source.version },
    }),
  );
  const pris = new Set<string>(systeme.entrees.keys());
  const free = d.free.flatMap(({ item, sorte }) => {
    const s = systeme.sortes.get(sorte);
    const ability = kinds.abilities[0];
    if (!s || !ability) return [];
    const draft: FreePathDraft = {
      sorte,
      nom: item.name,
      description: '',
      ranks: Array.from({ length: rankCount(vierge, s) }, (_, i) => {
        const nom = item.ranks?.[i];
        return nom ? { sorte: ability.id, nom, description: '', champs: {}, effets: [] } : null;
      }),
    };
    const { entries } = entriesOf(systeme, draft, null, pris);
    for (const e of entries) pris.add(e.id);
    return [{ name: item.name, rank: item.rank ?? 0, entries, on: true }];
  });
  return {
    name: d.name,
    values: Object.fromEntries(d.values.map((v) => [v.key, v.value])),
    entries: d.entries.map((e) => ({ ...e, on: true })),
    free,
    appearance: d.appearance,
    backstory: d.backstory,
    portrait: !!d.portraitUrl,
  };
}

/** Corps de l'import, depuis le brouillon vérifié. */
function requestOf(
  systeme: SystemeCharge,
  reading: SheetReading,
  d: SheetDetection,
  draft: Draft,
): DemandeImport {
  return {
    systemeId: systeme.source.id,
    type: TYPE_HEROS,
    nom: draft.name.trim(),
    details: { appearance: draft.appearance.trim(), backstory: draft.backstory.trim() },
    valeurs: draft.values,
    possessions: [
      ...draft.entries
        .filter((e) => e.on)
        .map((e) => ({
          entree: e.entry,
          ...(e.rank !== undefined ? { rang: e.rank } : {}),
          ...(e.quantity !== undefined ? { quantite: e.quantity } : {}),
          ...(e.fields ? { champs: e.fields } : {}),
        })),
      ...draft.free.filter((f) => f.on).map((f) => ({ entree: f.entries[0]!.id, rang: f.rank })),
    ],
    entrees: draft.free.filter((f) => f.on).flatMap((f) => f.entries),
    lues: d.read,
    source: reading.source,
  };
}

/** État de l'aperçu : celui que le service construira (rangs posés, bases déduites). */
function previewOf(systeme: SystemeCharge, req: DemandeImport): EtatEntite {
  const etat = EtatEntite.parse({
    type: req.type,
    systeme: { id: systeme.source.id, version: systeme.source.version },
    valeurs: req.valeurs,
    entrees: req.entrees,
    possessions: req.possessions.map((p) =>
      nouvellePossession(p.entree, p.rang ?? 0, {
        ...(p.quantite !== undefined ? { quantite: p.quantite } : {}),
        ...(p.champs ? { champs: p.champs } : {}),
      }),
    ),
  });
  return deduireBases(systeme, etat, req.lues, new Set(Object.keys(req.valeurs)));
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: Readonly<{ on: boolean; onChange(on: boolean): void; label: string }>) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        on ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong',
      )}
    >
      {on && <Check className="size-3.5" aria-hidden />}
    </button>
  );
}

export function ImportFiche({ campagneId }: Readonly<{ campagneId: string }>) {
  const t = useTranslations();
  const router = useRouter();
  const campagne = useCampagne(campagneId);
  const sys = useCampaignSystem(campagne.data?.system, campagneId);
  const systeme = sys.data?.systeme ?? null;
  const presentation = sys.data?.presentation ?? null;
  const importer = useImporterPersonnage();

  const [link, setLink] = useState('');
  const [reading, setReading] = useState<SheetReading | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const detection = useMemo(
    () => (systeme && reading ? detectSheet(systeme, TYPE_HEROS, reading) : null),
    [systeme, reading],
  );
  const request = useMemo(
    () =>
      systeme && reading && detection && draft
        ? requestOf(systeme, reading, detection, draft)
        : null,
    [systeme, reading, detection, draft],
  );
  const fiche = useMemo(
    () => (systeme && request ? calculer(systeme, previewOf(systeme, request)) : null),
    [systeme, request],
  );

  async function read() {
    if (!systeme) return;
    setBusy(true);
    try {
      const r = await api<SheetReading>('/v1/characters/import/link', {
        method: 'POST',
        body: JSON.stringify({ url: link.trim() }),
      });
      setReading(r);
      setDraft(draftOf(systeme, detectSheet(systeme, TYPE_HEROS, r)));
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!request || !draft) return;
    try {
      const p = await importer.mutateAsync({
        campagneId,
        demande: request,
        ...(draft.portrait && detection?.portraitUrl ? { portraitUrl: detection.portraitUrl } : {}),
      });
      toast.success(t('creation.import.created', { name: p.name }));
      router.replace(`/personnages/${p.id}`);
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }

  const quitter = `/campagnes/${campagneId}/personnage`;
  const fermee = campagne.data && !campagne.data.freeCreation && campagne.data.role !== 'gm';
  const entity = systeme?.entites.get(TYPE_HEROS);
  const set = (patch: Partial<Draft>) => setDraft((d) => d && { ...d, ...patch });

  // Entrées rangées par sorte, dans l'ordre de la fiche
  const groups = new Map<string, number[]>();
  draft?.entries.forEach((e, i) => groups.set(e.sorte, [...(groups.get(e.sorte) ?? []), i]));

  return (
    <div className="flex min-h-dvh flex-col" data-ambiance={campagne.data?.ambiance}>
      <EnTeteFocus quitter={{ href: quitter }} />
      <div className="relative flex-1">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-halo" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-12">
          <main className="min-w-0 space-y-8">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
                {campagne.data?.name}
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                {t('creation.import.title')}
              </h1>
            </div>

            {fermee ? (
              <CreationFermee quitter={quitter} />
            ) : !systeme ? (
              <Chargement />
            ) : (
              <>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void read();
                  }}
                >
                  <div className="relative min-w-0 flex-1">
                    <Link2
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
                      aria-hidden
                    />
                    <Input
                      aria-label={t('creation.import.link')}
                      placeholder="https://"
                      inputMode="url"
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      className="pl-9"
                      autoFocus
                    />
                  </div>
                  <Button type="submit" disabled={!link.trim() || busy} loading={busy}>
                    {t('creation.import.read')}
                  </Button>
                </form>

                {draft && detection && entity && (
                  <>
                    <Section title={t('creation.import.identity')}>
                      <Input
                        aria-label={t('map.lights.name')}
                        value={draft.name}
                        maxLength={100}
                        onChange={(e) => set({ name: e.target.value })}
                      />
                    </Section>

                    {Object.keys(draft.values).length > 0 && (
                      <Section title={t('creation.import.values')}>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                          {Object.entries(draft.values).map(([key, value]) => {
                            const a = entity.attributs.get(key);
                            const id = `import-${key}`;
                            return (
                              <div key={key} className="space-y-1">
                                <Label htmlFor={id} className="text-[12px] text-muted-foreground">
                                  {a?.nom ?? key}
                                </Label>
                                <Input
                                  id={id}
                                  value={String(value)}
                                  inputMode={typeof value === 'number' ? 'numeric' : undefined}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    const n = Number(v);
                                    set({
                                      values: {
                                        ...draft.values,
                                        [key]:
                                          typeof value === 'number' &&
                                          v.trim() &&
                                          Number.isFinite(n)
                                            ? n
                                            : v,
                                      },
                                    });
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </Section>
                    )}

                    {draft.entries.length > 0 && (
                      <Section title={t('creation.import.entries')}>
                        <div className="space-y-4">
                          {[...groups].map(([sorte, indexes]) => {
                            const s = systeme.sortes.get(sorte);
                            return (
                              <div
                                key={sorte}
                                className="rounded-xl border border-border bg-surface-2/40"
                              >
                                <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
                                  {s?.nomPluriel ?? s?.nom ?? sorte}
                                </p>
                                <ul className="divide-y divide-border">
                                  {indexes.map((i) => {
                                    const e = draft.entries[i]!;
                                    const entree = systeme.entrees.get(e.entry);
                                    const nom =
                                      (e.fields && s?.nomExemplaire && e.fields[s.nomExemplaire]) ||
                                      entree?.nom ||
                                      e.entry;
                                    const setEntry = (patch: Partial<Draft['entries'][number]>) =>
                                      set({
                                        entries: draft.entries.map((x, j) =>
                                          j === i ? { ...x, ...patch } : x,
                                        ),
                                      });
                                    return (
                                      <li
                                        key={i}
                                        className="flex min-h-11 items-center gap-3 px-3 py-1.5"
                                      >
                                        <Toggle
                                          on={e.on}
                                          onChange={(on) => setEntry({ on })}
                                          label={nom}
                                        />
                                        <span
                                          className={cn(
                                            'min-w-0 flex-1 truncate text-sm',
                                            !e.on && 'text-subtle line-through',
                                          )}
                                        >
                                          {nom}
                                        </span>
                                        {e.confidence === 'probable' && (
                                          <Info
                                            texte={t('creation.import.probable', { from: e.from })}
                                          >
                                            <CircleHelp
                                              className="size-4 shrink-0 text-warning"
                                              aria-hidden
                                            />
                                          </Info>
                                        )}
                                        {s?.rangs && (
                                          <Input
                                            aria-label={`${t('creation.import.rank')} : ${nom}`}
                                            inputMode="numeric"
                                            className="h-8 w-16 text-center"
                                            value={String(e.rank ?? 0)}
                                            onChange={(ev) => {
                                              const n = Number(ev.target.value);
                                              if (Number.isInteger(n) && n >= 0)
                                                setEntry({ rank: n });
                                            }}
                                          />
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      </Section>
                    )}

                    {draft.free.length > 0 && (
                      <Section title={t('creation.import.freePaths')}>
                        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-2/40">
                          {draft.free.map((f, i) => {
                            const setFree = (patch: Partial<FreePath>) =>
                              set({
                                free: draft.free.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                              });
                            return (
                              <li
                                key={f.entries[0]!.id}
                                className="flex min-h-11 items-center gap-3 px-3 py-1.5"
                              >
                                <Toggle
                                  on={f.on}
                                  onChange={(on) => setFree({ on })}
                                  label={f.name}
                                />
                                <Info
                                  texte={f.entries
                                    .slice(1)
                                    .map((e) => e.nom)
                                    .join(' · ')}
                                >
                                  <span
                                    className={cn(
                                      'min-w-0 flex-1 truncate text-sm',
                                      !f.on && 'text-subtle line-through',
                                    )}
                                  >
                                    {f.name}
                                  </span>
                                </Info>
                                <Input
                                  aria-label={`${t('creation.import.rank')} : ${f.name}`}
                                  inputMode="numeric"
                                  className="ml-auto h-8 w-16 text-center"
                                  value={String(f.rank)}
                                  onChange={(ev) => {
                                    const n = Number(ev.target.value);
                                    if (Number.isInteger(n) && n >= 0) setFree({ rank: n });
                                  }}
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </Section>
                    )}

                    {detection.unmatched.length > 0 && (
                      <Section title={t('creation.import.unmatched')}>
                        <ul className="flex flex-wrap gap-1.5">
                          {detection.unmatched.map((u) => (
                            <li
                              key={u}
                              className="rounded-full border border-border px-2.5 py-1 text-[12px] text-muted-foreground"
                            >
                              {u}
                            </li>
                          ))}
                        </ul>
                      </Section>
                    )}

                    <Section title={t('creation.import.appearance')}>
                      <Textarea
                        aria-label={t('creation.import.appearance')}
                        value={draft.appearance}
                        maxLength={2000}
                        rows={3}
                        onChange={(e) => set({ appearance: e.target.value })}
                      />
                    </Section>
                    <Section title={t('creation.import.backstory')}>
                      <Textarea
                        aria-label={t('creation.import.backstory')}
                        value={draft.backstory}
                        maxLength={8000}
                        rows={6}
                        onChange={(e) => set({ backstory: e.target.value })}
                      />
                    </Section>

                    {detection.portraitUrl && (
                      <label className="flex items-center gap-3">
                        <Toggle
                          on={draft.portrait}
                          onChange={(portrait) => set({ portrait })}
                          label={t('creation.import.portrait')}
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={detection.portraitUrl}
                          alt=""
                          className="size-12 rounded-lg border border-border object-cover"
                        />
                        <span className="text-sm">{t('creation.import.portrait')}</span>
                      </label>
                    )}

                    <div className="flex justify-end">
                      <Button
                        size="lg"
                        disabled={draft.name.trim().length < 2 || importer.isPending}
                        loading={importer.isPending}
                        onClick={() => void create()}
                      >
                        {t('creation.import.create')}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </main>

          {fiche && draft && (
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <ApercuFiche
                  fiche={fiche}
                  presentation={presentation}
                  nom={draft.name}
                  portraitUrl={draft.portrait ? (detection?.portraitUrl ?? null) : null}
                />
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * Étape « choisir » d'une sorte qui se lit comme des voies (rangs successifs accordant chacun une
 * entrée : `pathSortes`) : les voies du héros, pas tout le catalogue.
 *
 * - En arrivant sans voie, celles que désignent la race et le profil (suggestions) sont prises.
 * - Une carte par voie : ses capacités par rang (un clic : la description), Changer (une autre
 *   voie à sa place) et Retirer.
 * - « + » : ajouter une voie, choisie dans un sélecteur : un onglet par genre (profil, race,
 *   prestige), un menu pour la classe ou la race, une recherche, les capacités en aperçu.
 *
 * Chaque écriture passe par le moteur (`choisirEtape`) ; une erreur laisse l'état inchangé.
 */
import { useTranslations } from 'next-intl';
import {
  choisirEtape,
  type EtapeCreation,
  type EtatEntite,
  type Entree,
  type Fiche,
  type Selection,
  type SystemeCharge,
} from '@vtt/rules';
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  ListPlus,
  Lock,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Message } from '@/components/compte/elements';
import { grantsOf, maxRank } from '@/components/fiche/blocks/tree/model';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FilterMenu } from '@/components/ui/filter-menu';
import { InputGroup } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info } from '@/components/ui/tooltip';
import { entreesDeSorte, prerequisManquant, suggestions } from '@/lib/creation';
import type { OperationCreation } from '@/lib/personnages';
import { cn } from '@/lib/utils';

type Etape = Extract<EtapeCreation, { type: 'choisir' }>;

/** Voie à ajouter (`remplace` absent) ou à mettre à la place d'une autre. */
type Selecteur = { remplace: string | null } | null;

const etiquette = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replaceAll('-', ' ');

export function EtapeVoies({
  systeme,
  etat,
  fiche,
  etape,
  onEtat,
}: Readonly<{
  systeme: SystemeCharge;
  etat: EtatEntite;
  fiche: Fiche;
  etape: Etape;
  onEtat: (e: EtatEntite, op: OperationCreation) => void;
}>) {
  const t = useTranslations('creation.paths');
  const tc = useTranslations('creation.choose');
  const [erreur, setErreur] = useState<string | null>(null);
  const [selecteur, setSelecteur] = useState<Selecteur>(null);

  const sorte = systeme.sortes.get(etape.sorte)!;
  const max = maxRank(fiche, sorte) ?? 5;
  const prises = etat.possessions.filter(
    (p) => systeme.entrees.get(p.entree)?.sorte === etape.sorte,
  );
  const selection: Selection[] = prises.map((p) => ({ entree: p.entree, choix: p.choix }));
  const ids = selection.map((s) => s.entree);
  const suggerees = suggestions(systeme, etat, etape.sorte);
  const manquantes = suggerees.filter((s) => !ids.includes(s));

  function appliquer(suivante: Selection[]) {
    const r = choisirEtape(systeme, etat, etape.id, suivante);
    if (r.ok) {
      setErreur(null);
      onEtat(r.etat, { type: 'etape', etape: etape.id, corps: { entrees: suivante } });
    } else setErreur(r.erreur);
  }

  // Première arrivée : les voies de la race et du profil, sans rien demander
  const initialise = useRef(false);
  useEffect(() => {
    if (initialise.current) return;
    initialise.current = true;
    if (!ids.length && suggerees.length)
      appliquer(suggerees.slice(0, etape.max).map((entree) => ({ entree })));
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function retirer(id: string) {
    if (ids.length <= etape.min)
      return setErreur(tc('atLeast', { name: etape.nom, min: etape.min }));
    appliquer(selection.filter((s) => s.entree !== id));
  }

  function choisir(id: string) {
    const remplace = selecteur?.remplace ?? null;
    setSelecteur(null);
    if (remplace) appliquer(selection.map((s) => (s.entree === remplace ? { entree: id } : s)));
    else appliquer([...selection, { entree: id }]);
  }

  const plein = ids.length >= etape.max;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-muted-foreground">
          {tc('multi', { count: ids.length, min: etape.min, max: etape.max })}
        </p>
        {manquantes.length > 0 && !plein && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() =>
              appliquer([
                ...selection,
                ...manquantes.slice(0, etape.max - ids.length).map((entree) => ({ entree })),
              ])
            }
          >
            <ListPlus />
            {t('addSuggested', { count: manquantes.length })}
          </Button>
        )}
      </div>

      {erreur && <Message>{erreur}</Message>}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ids.map((id) => {
          const voie = systeme.entrees.get(id);
          if (!voie) return null;
          return (
            <li key={id}>
              <CarteVoie
                voie={voie}
                fiche={fiche}
                max={max}
                suggeree={suggerees.includes(id)}
                onChanger={() => setSelecteur({ remplace: id })}
                onRetirer={() => retirer(id)}
              />
            </li>
          );
        })}
        <li>
          <button
            type="button"
            disabled={plein}
            onClick={() => setSelecteur({ remplace: null })}
            title={plein ? tc('atMost', { name: etape.nom, max: etape.max }) : undefined}
            className={cn(
              'flex h-full min-h-[13rem] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong text-muted-foreground transition-colors',
              'hover:border-primary/60 hover:bg-primary/[0.04] hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
            )}
          >
            <span className="grid size-10 place-items-center rounded-full bg-surface-2">
              <Plus className="size-5" aria-hidden />
            </span>
            <span className="text-sm font-medium">{t('add')}</span>
          </button>
        </li>
      </ul>

      <SelecteurVoie
        ouvert={selecteur !== null}
        remplace={selecteur?.remplace ? (systeme.entrees.get(selecteur.remplace) ?? null) : null}
        systeme={systeme}
        fiche={fiche}
        sorte={etape.sorte}
        max={max}
        prises={ids}
        possedees={etat.possessions.map((p) => p.entree)}
        onChoisir={choisir}
        onFermer={() => setSelecteur(null)}
      />
    </div>
  );
}

/** Une voie du héros : nom, étiquettes, capacités par rang, Changer et Retirer. */
function CarteVoie({
  voie,
  fiche,
  max,
  suggeree,
  onChanger,
  onRetirer,
}: Readonly<{
  voie: Entree;
  fiche: Fiche;
  max: number;
  suggeree: boolean;
  onChanger(): void;
  onRetirer(): void;
}>) {
  const t = useTranslations('creation.paths');
  const rangs = grantsOf(fiche, voie, max);
  return (
    <article
      className={cn(
        'group flex h-full flex-col rounded-2xl border bg-card shadow-surface',
        suggeree ? 'border-border' : 'border-primary/40',
      )}
    >
      <header className="flex items-start gap-2 px-4 pb-2 pt-3.5">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg font-semibold leading-tight text-primary-strong">
            {voie.nom}
          </h3>
          {voie.etiquettes.length > 0 && (
            <p className="mt-0.5 truncate text-[11px] uppercase tracking-wider text-subtle">
              {voie.etiquettes.map(etiquette).join(' · ')}
            </p>
          )}
        </div>
        <Info texte={t('change')}>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('changeOf', { name: voie.nom })}
            onClick={onChanger}
          >
            <ArrowLeftRight />
          </Button>
        </Info>
        <Info texte={t('remove')}>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('removeOf', { name: voie.nom })}
            onClick={onRetirer}
            className="hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </Info>
      </header>
      <ol className="flex-1 space-y-1 px-2.5 pb-3">
        {rangs.map((r) => (
          <li key={r.entry.id}>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-md bg-surface-3 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {r.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.entry.nom}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80">
                <p className="text-sm font-semibold">{r.entry.nom}</p>
                {r.entry.description ? (
                  <p className="mt-1.5 max-h-60 overflow-y-auto whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
                    {r.entry.description}
                  </p>
                ) : null}
              </PopoverContent>
            </Popover>
          </li>
        ))}
      </ol>
    </article>
  );
}

/** Onglet du sélecteur : une première étiquette (profil, race, prestige) et ses voies. */
interface Onglet {
  id: string;
  nom: string;
  voies: Entree[];
}

/**
 * Onglets par première étiquette : celles qui nomment une sorte (profil, race) d'abord, sous son
 * nom, puis les autres (prestige) ; chaque groupe du plus fourni au moins fourni.
 */
function ongletsDe(systeme: SystemeCharge, voies: readonly Entree[]): Onglet[] {
  const parEtiquette = new Map<string, Entree[]>();
  for (const v of voies) {
    const cle = v.etiquettes[0] ?? '';
    parEtiquette.set(cle, [...(parEtiquette.get(cle) ?? []), v]);
  }
  return [...parEtiquette.entries()]
    .map(([id, liste]) => {
      const sorte = systeme.sortes.get(id);
      return {
        id,
        nom: sorte ? (sorte.nomPluriel ?? sorte.nom) : id ? etiquette(id) : '—',
        voies: liste,
        rang: sorte ? 0 : 1,
      };
    })
    .sort((a, b) => a.rang - b.rang || b.voies.length - a.voies.length)
    .map(({ rang: _rang, ...o }) => o);
}

/** Nom d'une seconde étiquette : l'entrée qu'elle désigne (Barde, Elfe noir), sinon elle-même. */
const nomSousGroupe = (systeme: SystemeCharge, id: string) =>
  systeme.entrees.get(id)?.nom ?? etiquette(id.replaceAll('_', ' '));

/**
 * Choisir une voie à ajouter, ou à mettre à la place d'une autre : un onglet par genre de voie
 * (profil, race, prestige), un menu pour la classe ou la race, et une recherche. À l'ouverture :
 * le genre et le groupe de la voie remplacée, sinon ceux du héros (sa classe, sa race).
 */
function SelecteurVoie({
  ouvert,
  remplace,
  systeme,
  fiche,
  sorte,
  max,
  prises,
  possedees,
  onChoisir,
  onFermer,
}: Readonly<{
  ouvert: boolean;
  remplace: Entree | null;
  systeme: SystemeCharge;
  fiche: Fiche;
  sorte: string;
  max: number;
  prises: readonly string[];
  /** Entrées du héros (profil, race…) : le groupe ouvert d'office. */
  possedees: readonly string[];
  onChoisir(id: string): void;
  onFermer(): void;
}>) {
  const t = useTranslations('creation.paths');
  const [recherche, setRecherche] = useState('');
  // Voie ouverte en grand avant de la prendre (null : la liste)
  const [apercu, setApercu] = useState<Entree | null>(null);
  const [onglet, setOnglet] = useState('');
  const [groupe, setGroupe] = useState('');
  const toutes = useMemo(() => entreesDeSorte(systeme, sorte), [systeme, sorte]);
  const onglets = useMemo(() => ongletsDe(systeme, toutes), [systeme, toutes]);
  // Capacités de chaque voie, calculées une fois à l'ouverture (recherche et aperçu)
  const capacites = useMemo(
    () =>
      new Map(
        ouvert ? toutes.map((e) => [e.id, grantsOf(fiche, e, max).map((g) => g.entry.nom)]) : [],
      ),
    [ouvert, toutes, fiche, max],
  );

  // Ouverture : l'onglet et le groupe de la voie remplacée, sinon ceux du héros
  const [ouvertPour, setOuvertPour] = useState<Entree | null | false>(false);
  if (ouvert && ouvertPour !== remplace) {
    setOuvertPour(remplace);
    const premier = onglets[0]?.id ?? '';
    const cible = remplace?.etiquettes[0] ?? premier;
    const voiesOnglet = onglets.find((o) => o.id === cible)?.voies ?? [];
    const groupes = new Set(voiesOnglet.map((v) => v.etiquettes[1]).filter(Boolean));
    setOnglet(onglets.some((o) => o.id === cible) ? cible : premier);
    setGroupe(remplace?.etiquettes[1] ?? possedees.find((p) => groupes.has(p)) ?? '');
    setRecherche('');
    setApercu(null);
  }
  if (!ouvert && ouvertPour !== false) setOuvertPour(false);

  const courant = onglets.find((o) => o.id === onglet) ?? onglets[0];
  const groupesOnglet = useMemo(() => {
    const n = new Map<string, number>();
    for (const v of courant?.voies ?? []) {
      const g = v.etiquettes[1];
      if (g) n.set(g, (n.get(g) ?? 0) + 1);
    }
    return [...n.entries()]
      .map(([id, count]) => ({ id, nom: nomSousGroupe(systeme, id), count }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [courant, systeme]);

  const terme = recherche.trim().toLocaleLowerCase('fr');
  const visibles = (courant?.voies ?? []).filter(
    (v) =>
      (!groupe || v.etiquettes[1] === groupe) &&
      (!terme ||
        [v.nom, ...v.etiquettes, ...(capacites.get(v.id) ?? [])]
          .join(' ')
          .toLocaleLowerCase('fr')
          .includes(terme)),
  );
  // Tout le genre affiché : rangé par groupe (classe, race)
  const sections = groupe
    ? [{ id: groupe, voies: visibles }]
    : groupesOnglet
        .map((g) => ({ id: g.id, voies: visibles.filter((v) => v.etiquettes[1] === g.id) }))
        .concat([{ id: '', voies: visibles.filter((v) => !v.etiquettes[1]) }])
        .filter((g) => g.voies.length);

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent
        className="flex h-[min(42rem,88dvh)] flex-col gap-3 sm:max-w-2xl"
        onEscapeKeyDown={(e) => {
          // Échap dans l'aperçu : retour à la liste, pas fermeture
          if (!apercu) return;
          e.preventDefault();
          setApercu(null);
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {remplace ? t('replaceTitle', { name: remplace.nom }) : t('add')}
          </DialogTitle>
          <DialogDescription className="sr-only">{t('pickHint')}</DialogDescription>
        </DialogHeader>

        {apercu && (
          <ApercuVoie
            voie={apercu}
            fiche={fiche}
            max={max}
            prise={prises.includes(apercu.id)}
            bloque={prises.includes(apercu.id) ? null : prerequisManquant(fiche, apercu)}
            remplace={remplace}
            onPrendre={() => onChoisir(apercu.id)}
            onRetour={() => setApercu(null)}
          />
        )}

        {/* La liste reste montée sous l'aperçu : on la retrouve là où on l'avait laissée */}
        <div className={cn('flex min-h-0 flex-1 flex-col gap-3', apercu && 'hidden')}>
          {onglets.length > 1 && (
            <Tabs
              value={courant?.id ?? ''}
              onValueChange={(v) => {
                setOnglet(v);
                const voiesOnglet = onglets.find((o) => o.id === v)?.voies ?? [];
                const groupes = new Set(voiesOnglet.map((x) => x.etiquettes[1]).filter(Boolean));
                setGroupe(possedees.find((p) => groupes.has(p)) ?? '');
              }}
            >
              <TabsList className="w-full">
                {onglets.map((o) => (
                  <TabsTrigger key={o.id} value={o.id} className="flex-1 gap-1.5">
                    {o.nom}
                    <span className="text-[11px] tabular-nums opacity-60">{o.voies.length}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          <div className="flex items-center gap-2">
            <InputGroup
              avant={<Search />}
              autoFocus
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={t('search')}
              aria-label={t('search')}
              className="min-w-0 flex-1"
            />
            {groupesOnglet.length > 1 && (
              <FilterMenu
                label={courant?.nom ?? ''}
                value={groupe}
                allValue=""
                onChange={setGroupe}
                className="max-w-[11rem]"
                options={[
                  { value: '', label: t('all'), count: courant?.voies.length ?? 0 },
                  ...groupesOnglet.map((g) => ({ value: g.id, label: g.nom, count: g.count })),
                ]}
              />
            )}
          </div>

          <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 [scrollbar-width:thin]">
            {sections.map((section) => (
              <section key={section.id || 'autres'} className="mb-4">
                {!groupe && (
                  <h4 className="sticky top-0 z-10 bg-popover py-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">
                    {section.id ? nomSousGroupe(systeme, section.id) : '—'}
                  </h4>
                )}
                <ul className="space-y-1">
                  {section.voies.map((v) => {
                    const prise = prises.includes(v.id);
                    const bloque = prise ? null : prerequisManquant(fiche, v);
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => setApercu(v)}
                          title={bloque ?? undefined}
                          className={cn(
                            'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
                            (prise || bloque) && 'opacity-60',
                          )}
                        >
                          <span className="mt-0.5 grid size-5 shrink-0 place-items-center text-primary">
                            {prise && <Check className="size-4" aria-hidden />}
                            {bloque && <Lock className="size-3.5 text-subtle" aria-hidden />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">{v.nom}</span>
                            <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">
                              {(capacites.get(v.id) ?? []).join(' · ')}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {sections.length === 0 && (
              <p className="py-10 text-center text-sm text-subtle">{t('none')}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Une voie en grand dans le sélecteur, avant de la prendre : ses capacités rang par rang avec
 * leur description ; Retour (la liste), ou Ajouter (Mettre à la place, quand on en remplace une).
 */
function ApercuVoie({
  voie,
  fiche,
  max,
  prise,
  bloque,
  remplace,
  onPrendre,
  onRetour,
}: Readonly<{
  voie: Entree;
  fiche: Fiche;
  max: number;
  prise: boolean;
  bloque: string | null;
  remplace: Entree | null;
  onPrendre(): void;
  onRetour(): void;
}>) {
  const t = useTranslations();
  const rangs = grantsOf(fiche, voie, max);
  let action = t('creation.paths.addThis');
  let Icone = Plus;
  if (prise) {
    action = t('creation.paths.taken');
    Icone = Check;
  } else if (remplace) {
    action = t('creation.paths.putInsteadOf', { name: remplace.nom });
    Icone = ArrowLeftRight;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="pb-3">
        <h3 className="font-display text-2xl font-semibold leading-tight text-primary-strong">
          {voie.nom}
        </h3>
        {voie.etiquettes.length > 0 && (
          <p className="mt-1 text-[11px] uppercase tracking-wider text-subtle">
            {voie.etiquettes.map(etiquette).join(' · ')}
          </p>
        )}
      </div>
      <ol className="-mx-2 min-h-0 flex-1 space-y-2 overflow-y-auto px-2 [scrollbar-width:thin]">
        {rangs.map((r) => (
          <li key={r.entry.id} className="flex gap-3 rounded-xl bg-surface-2/60 p-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/15 font-mono text-sm font-semibold tabular-nums text-primary">
              {r.rank}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{r.entry.nom}</p>
              {r.entry.description && (
                <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
                  {r.entry.description}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {bloque && (
        <p className="flex items-center gap-2 pt-3 text-[13px] text-warning">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          {bloque}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <Button variant="ghost" onClick={onRetour}>
          <ArrowLeft />
          {t('common.actions.back')}
        </Button>
        <Button onClick={onPrendre} disabled={prise || Boolean(bloque)} autoFocus>
          <Icone />
          <span className="max-w-[16rem] truncate">{action}</span>
        </Button>
      </div>
    </div>
  );
}

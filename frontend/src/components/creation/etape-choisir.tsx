'use client';

import {
  calculer,
  choisirEtape,
  nombreChoix,
  optionsChoix,
  type Choix,
  type EtapeCreation,
  type EtatEntite,
  type Fiche,
  type Presentation,
  type Selection,
  type SystemeCharge,
} from '@vtt/rules';
import { Check, Lightbulb, Lock, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { Message } from '@/components/compte/elements';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InputGroup } from '@/components/ui/input';
import {
  champsLisibles,
  entreesDeSorte,
  prerequisManquant,
  suggestions,
  texteEffet,
} from '@/lib/creation';
import type { OperationCreation } from '@/lib/personnages';
import { imageEntree } from '@/lib/systemes';
import { cn } from '@/lib/utils';

type Etape = Extract<EtapeCreation, { type: 'choisir' }>;

/**
 * Étape « choisir » : une ou plusieurs entrées d'une sorte (race, profil,
 * voies…), avec leurs choix éventuels (compétences au choix…). Chaque clic
 * est validé par le moteur ; une erreur laisse l'état inchangé.
 */
export function EtapeChoisir({
  systeme,
  presentation,
  etat,
  fiche,
  etape,
  onEtat,
}: Readonly<{
  systeme: SystemeCharge;
  presentation: Presentation | null;
  etat: EtatEntite;
  fiche: Fiche;
  etape: Etape;
  /** Nouvel état calculé localement (aperçu) et l'écriture à envoyer au service. */
  onEtat: (e: EtatEntite, op: OperationCreation) => void;
}>) {
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const entrees = useMemo(() => entreesDeSorte(systeme, etape.sorte), [systeme, etape.sorte]);
  const sorte = systeme.sortes.get(etape.sorte)!;
  const unique = etape.max === 1;
  const avecImages = entrees.some((e) => imageEntree(presentation, e.id));
  const suggerees = suggestions(systeme, etat, etape.sorte);
  const prises = etat.possessions.filter(
    (p) => systeme.entrees.get(p.entree)?.sorte === etape.sorte,
  );
  const selection: Selection[] = prises.map((p) => ({ entree: p.entree, choix: p.choix }));
  const ids = selection.map((s) => s.entree);

  function appliquer(suivante: Selection[]) {
    const r = choisirEtape(systeme, etat, etape.id, suivante);
    if (r.ok) {
      setErreur(null);
      onEtat(r.etat, { type: 'etape', etape: etape.id, corps: { entrees: suivante } });
    } else setErreur(r.erreur);
  }

  function basculer(id: string) {
    setFocus(id);
    if (unique) {
      if (ids[0] === id) return;
      appliquer([{ entree: id }]);
      return;
    }
    if (ids.includes(id)) {
      if (ids.length <= etape.min) {
        setErreur(`${etape.nom} : ${etape.min} au moins`);
        return;
      }
      appliquer(selection.filter((s) => s.entree !== id));
    } else {
      if (ids.length >= etape.max) {
        setErreur(`${etape.nom} : ${etape.max} au plus`);
        return;
      }
      appliquer([...selection, { entree: id }]);
    }
  }

  function choisirOption(entree: string, choix: Choix, option: string, max: number) {
    const courante = selection.find((s) => s.entree === entree);
    if (!courante) return;
    const actuels = courante.choix?.[choix.id] ?? [];
    let suivants = actuels.includes(option)
      ? actuels.filter((x) => x !== option)
      : [...actuels, option];
    // Un seul choix possible : cliquer une autre option la remplace
    if (max === 1 && !actuels.includes(option)) suivants = [option];
    if (suivants.length > max) return;
    appliquer(
      selection.map((s) =>
        s.entree === entree ? { ...s, choix: { ...s.choix, [choix.id]: suivants } } : s,
      ),
    );
  }

  const t = recherche.trim().toLowerCase();
  const filtrees = t
    ? entrees.filter((e) => `${e.nom} ${e.etiquettes.join(' ')}`.toLowerCase().includes(t))
    : entrees;
  const groupes = grouper(filtrees, suggerees);
  const detail = systeme.entrees.get(focus ?? ids[0] ?? '') ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted-foreground">
          {unique
            ? `${entrees.length} options, une seule à choisir.`
            : `${ids.length} choisie(s) · entre ${etape.min} et ${etape.max}.`}
        </p>
        {entrees.length > 12 && (
          <div className="sm:w-64">
            <InputGroup
              avant={<Search />}
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher…"
              className="h-9"
              aria-label={`Rechercher parmi ${sorte.nomPluriel ?? sorte.nom}`}
            />
          </div>
        )}
      </div>

      {!unique && suggerees.some((s) => !ids.includes(s)) && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] p-3.5 sm:flex-row sm:items-center">
          <Lightbulb className="size-4 shrink-0 text-primary" />
          <p className="flex-1 text-[13px] text-foreground/85">
            {suggerees.length} suggestion(s) d&apos;après vos choix précédents.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              appliquer([
                ...selection,
                ...suggerees
                  .filter((s) => !ids.includes(s))
                  .slice(0, Math.max(0, etape.max - ids.length))
                  .map((entree) => ({ entree })),
              ])
            }
          >
            Tout prendre
          </Button>
        </div>
      )}

      {erreur && <Message>{erreur}</Message>}

      {groupes.map((g) => (
        <section key={g.titre ?? 'tout'} className="space-y-3">
          {g.titre && (
            <h3 className="text-xs font-medium uppercase tracking-wider text-subtle">{g.titre}</h3>
          )}
          <div
            role={unique ? 'radiogroup' : 'group'}
            className={cn(
              'grid gap-3',
              avecImages ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4' : 'sm:grid-cols-2',
            )}
          >
            {g.entrees.map((e) => {
              const choisie = ids.includes(e.id);
              const bloque = !choisie ? prerequisManquant(fiche, e) : null;
              const image = imageEntree(presentation, e.id);
              return avecImages ? (
                <button
                  key={e.id}
                  type="button"
                  role={unique ? 'radio' : 'checkbox'}
                  aria-checked={choisie}
                  disabled={Boolean(bloque)}
                  onClick={() => basculer(e.id)}
                  title={bloque ?? undefined}
                  className={cn(
                    'group relative overflow-hidden rounded-2xl border-2 text-left transition-all duration-200 disabled:opacity-40',
                    choisie
                      ? 'border-primary shadow-glow'
                      : 'border-transparent hover:-translate-y-0.5 hover:border-border-strong',
                  )}
                >
                  <Illustration
                    largeur={320}
                    src={image}
                    graine={e.nom}
                    position="top"
                    className="aspect-[3/4]"
                    classeImage="transition-transform duration-500 group-hover:scale-105"
                    voile
                  >
                    <span
                      className={cn(
                        'absolute right-2.5 top-2.5 flex size-6 items-center justify-center rounded-full border backdrop-blur transition-all',
                        choisie
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-white/25 bg-black/30 text-transparent',
                      )}
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                    <span className="absolute inset-x-3 bottom-3">
                      <span className="block font-display text-lg font-semibold leading-tight text-white">
                        {e.nom}
                      </span>
                      <ApercuEffets fiche={fiche} entree={e.id} max={2} clair />
                    </span>
                  </Illustration>
                </button>
              ) : (
                <button
                  key={e.id}
                  type="button"
                  role={unique ? 'radio' : 'checkbox'}
                  aria-checked={choisie}
                  disabled={Boolean(bloque)}
                  onClick={() => basculer(e.id)}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50',
                    choisie
                      ? 'border-primary/60 bg-primary/[0.07]'
                      : 'border-border bg-card hover:border-border-strong hover:bg-surface-2',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center border',
                      unique ? 'rounded-full' : 'rounded-md',
                      choisie
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border-strong',
                    )}
                  >
                    {bloque ? (
                      <Lock className="size-3 text-subtle" />
                    ) : (
                      choisie && <Check className="size-3" strokeWidth={3} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                      {e.nom}
                      {suggerees.includes(e.id) && (
                        <Badge ton="primaire">
                          <Lightbulb /> Suggérée
                        </Badge>
                      )}
                    </span>
                    {e.description && (
                      <span className="mt-1 line-clamp-2 block whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                        {e.description}
                      </span>
                    )}
                    {bloque && (
                      <span className="mt-1 block text-[11px] text-warning">{bloque}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {filtrees.length === 0 && (
        <p className="py-8 text-center text-sm text-subtle">Aucun résultat pour « {recherche} ».</p>
      )}

      {detail && (
        <DetailEntree
          systeme={systeme}
          presentation={presentation}
          etat={etat}
          fiche={fiche}
          entreeId={detail.id}
          choisie={ids.includes(detail.id)}
          selection={selection}
          onOption={choisirOption}
        />
      )}
    </div>
  );
}

/** Groupes d'affichage : suggestions d'abord, puis par première étiquette si la liste est longue. */
function grouper<T extends { id: string; etiquettes: string[] }>(
  entrees: T[],
  suggerees: string[],
) {
  const sugg = entrees.filter((e) => suggerees.includes(e.id));
  const reste = entrees.filter((e) => !suggerees.includes(e.id));
  const groupes: { titre: string | null; entrees: T[] }[] = [];
  if (sugg.length) groupes.push({ titre: 'Suggérées', entrees: sugg });
  if (reste.length > 20) {
    const parEtiquette = new Map<string, T[]>();
    for (const e of reste) {
      const cle = e.etiquettes[0] ?? 'autres';
      parEtiquette.set(cle, [...(parEtiquette.get(cle) ?? []), e]);
    }
    for (const [cle, liste] of parEtiquette)
      groupes.push({
        titre: cle.charAt(0).toUpperCase() + cle.slice(1).replace(/-/g, ' '),
        entrees: liste,
      });
  } else if (reste.length) groupes.push({ titre: sugg.length ? 'Autres' : null, entrees: reste });
  return groupes;
}

function ApercuEffets({
  fiche,
  entree,
  max = 3,
  clair = false,
}: Readonly<{
  fiche: Fiche;
  entree: string;
  max?: number;
  clair?: boolean;
}>) {
  const e = fiche.systeme.entrees.get(entree);
  const textes = (e?.effets ?? [])
    .filter((x) => x.sur === 'attribut')
    .map((x) => texteEffet(fiche, x))
    .filter((x): x is string => Boolean(x))
    .slice(0, max);
  if (!textes.length) return null;
  return (
    <span className="mt-1.5 flex flex-wrap gap-1">
      {textes.map((t) => (
        <span
          key={t}
          className={cn(
            'rounded-md px-1.5 py-0.5 font-mono text-[10px]',
            clair
              ? 'bg-black/40 text-white/85 backdrop-blur'
              : 'bg-surface-3 text-muted-foreground',
          )}
        >
          {t}
        </span>
      ))}
    </span>
  );
}

/** Détail de l'entrée survolée ou choisie : description, effets, champs, choix à faire. */
function DetailEntree({
  systeme,
  presentation,
  etat,
  fiche,
  entreeId,
  choisie,
  selection,
  onOption,
}: Readonly<{
  systeme: SystemeCharge;
  presentation: Presentation | null;
  etat: EtatEntite;
  fiche: Fiche;
  entreeId: string;
  choisie: boolean;
  selection: Selection[];
  onOption: (entree: string, choix: Choix, option: string, max: number) => void;
}>) {
  const e = systeme.entrees.get(entreeId)!;
  const effets = e.effets.map((x) => texteEffet(fiche, x)).filter((x): x is string => Boolean(x));
  const champs = champsLisibles(systeme, e);
  // Options calculées avec l'entrée possédée : ses marques comptent (compétences de carrière)
  const ficheAvec = choisie ? fiche : calculer(systeme, etat);
  const image = imageEntree(presentation, e.id);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-surface">
      <div className="flex gap-4 p-5">
        {image && (
          <Illustration
            largeur={150}
            src={image}
            graine={e.nom}
            position="top"
            className="hidden aspect-[3/4] w-28 shrink-0 rounded-xl sm:block"
          />
        )}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-semibold">{e.nom}</h3>
            {choisie && (
              <Badge ton="primaire">
                <Check /> Choisie
              </Badge>
            )}
          </div>
          {e.description && (
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
              {e.description}
            </p>
          )}
          {(effets.length > 0 || champs.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {champs.map((c) => (
                <Badge key={c.nom} ton="neutre" taille="md">
                  {c.nom} : <span className="text-foreground">{c.valeur}</span>
                </Badge>
              ))}
              {effets.slice(0, 10).map((t) => (
                <Badge key={t} ton="primaire" taille="md">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {choisie &&
        e.choix.map((c) => {
          const n = nombreChoix(ficheAvec, e.id, c);
          const options = optionsChoix(ficheAvec, c);
          const pris = selection.find((s) => s.entree === e.id)?.choix?.[c.id] ?? [];
          return (
            <div key={c.id} className="border-t border-border bg-surface/60 p-5">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold">{c.nom}</p>
                <span
                  className={cn(
                    'font-mono text-xs tabular',
                    pris.length === n ? 'text-success' : 'text-primary',
                  )}
                >
                  {pris.length}/{n}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {options.map((o) => {
                  const actif = pris.includes(o.id);
                  const plein = !actif && pris.length >= n && n !== 1;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={actif}
                      disabled={plein}
                      onClick={() => onOption(e.id, c, o.id, n)}
                      className={cn(
                        'flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-all disabled:opacity-40',
                        actif
                          ? 'border-primary/60 bg-primary/15 text-primary-strong'
                          : 'border-border-strong text-muted-foreground hover:border-subtle hover:text-foreground',
                      )}
                    >
                      {actif && <Check className="size-3.5" />}
                      {o.nom}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
    </section>
  );
}

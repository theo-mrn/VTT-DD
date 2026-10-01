'use client';

import { soldes, type Fiche, type Presentation } from '@vtt/rules';
import { Illustration } from '@/components/commun/illustration';
import { FittingLabel } from '@/components/ui/fitting-label';
import { Info } from '@/components/ui/tooltip';
import {
  afficherModificateur,
  afficherValeur,
  explication,
  groupesAttributs,
  resumer,
  widgetsFiche,
} from '@/lib/creation';
import { cn } from '@/lib/utils';

/** Tuile d'un attribut : abréviation, valeur, modificateur ; explication au survol. */
export function TuileAttribut({
  fiche,
  cle,
  compacte = false,
}: {
  fiche: Fiche;
  cle: string;
  compacte?: boolean;
}) {
  const a = fiche.entite.attributs.get(cle);
  const v = fiche.valeurs.get(cle);
  if (!a || !v) return null;
  const lignes = explication(v);
  const mod = afficherModificateur(v.modificateur);
  const tuile = (
    <div
      className={cn(
        'flex min-w-0 flex-col items-center justify-center rounded-xl border border-border bg-surface-2/70 text-center',
        compacte ? 'px-1.5 py-2' : 'px-2 py-3',
      )}
    >
      {/* Nom entier s'il tient, sinon l'abréviation */}
      <FittingLabel
        long={a.nom}
        short={a.abrege}
        className="text-[10px] font-medium uppercase tracking-wider text-subtle"
      />
      <span
        className={cn(
          'font-mono font-semibold leading-tight tabular',
          compacte ? 'text-lg' : 'text-2xl',
        )}
      >
        {afficherValeur(v)}
      </span>
      {mod && <span className="font-mono text-[11px] text-primary">{mod}</span>}
    </div>
  );
  return (
    <Info
      texte={
        <span className="block space-y-0.5">
          <span className="block font-medium">{a.nom}</span>
          {lignes.map((l) => (
            <span key={l} className="block font-mono text-[11px] text-muted-foreground">
              {l}
            </span>
          ))}
        </span>
      }
    >
      <div
        tabIndex={0}
        className="cursor-help rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {tuile}
      </div>
    </Info>
  );
}

/** Jauge d'une ressource (PV…) : valeur courante sur maximum. */
export function JaugeRessource({
  fiche,
  cle,
  presentation,
}: {
  fiche: Fiche;
  cle: string;
  presentation: Presentation | null;
}) {
  const a = fiche.entite.attributs.get(cle);
  const v = fiche.valeurs.get(cle);
  // Une jauge pour une ressource seulement (un bloc « ressources » en valeur peut lister la Défense)
  if (!a || !v || a.nature !== 'ressource' || typeof v.valeur !== 'number') return null;
  const max = v.max ?? v.valeur;
  const sens =
    presentation?.ressources[cle]?.sens ??
    (a.nature === 'ressource' && a.recuperation === 'min' ? 'montant' : 'descendant');
  const couleur = presentation?.ressources[cle]?.couleur;
  const pct = max > 0 ? Math.max(0, Math.min(100, (v.valeur / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{a.nom}</span>
        <span className="font-mono tabular text-foreground">
          {v.valeur} / {max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            !couleur && (sens === 'montant' ? 'bg-warning' : 'bg-success'),
          )}
          style={{ width: `${pct}%`, ...(couleur ? { background: couleur } : {}) }}
        />
      </div>
    </div>
  );
}

/**
 * Aperçu de la fiche en cours de création : portrait, nom, entrées uniques,
 * puis les premiers blocs de la présentation (sinon les groupes d'attributs).
 */
export function ApercuFiche({
  fiche,
  presentation,
  nom,
  portraitUrl,
  complet = false,
}: {
  fiche: Fiche;
  presentation: Presentation | null;
  nom: string;
  portraitUrl: string | null;
  /** Tous les blocs (récapitulatif) plutôt que les principaux. */
  complet?: boolean;
}) {
  const resume = resumer(fiche, presentation);
  const widgets = widgetsFiche(presentation, fiche.etat.type).filter(
    (w) => w.type === 'attributs' || w.type === 'ressources',
  );
  const blocs =
    widgets.length > 0
      ? widgets.slice(0, complet ? undefined : 3).map((w) => ({
          titre: w.titre,
          type: w.type,
          cles:
            w.type === 'ressources'
              ? w.attributs
              : (w.attributs ??
                [...fiche.entite.attributs.values()]
                  .filter((a) => a.groupe === w.groupe)
                  .map((a) => a.cle)),
        }))
      : groupesAttributs(fiche)
          .slice(0, complet ? undefined : 3)
          .map((g) => ({
            titre: g.nom,
            type: 'attributs' as const,
            cles: g.attributs.map((a) => a.cle),
          }));
  const monnaies = soldes(fiche);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-surface">
      <Illustration
        largeur={480}
        src={portraitUrl}
        graine={nom || 'Héros'}
        position="top"
        className={complet ? 'aspect-[4/3]' : 'aspect-[16/10]'}
        voile
      >
        <div className="absolute inset-x-4 bottom-4">
          <p className="truncate font-display text-2xl font-semibold text-white">
            {nom || 'Sans nom'}
          </p>
          <p className="truncate text-[13px] text-white/70">{resume.tagline || 'À définir…'}</p>
        </div>
        {resume.highlights[0] && (
          <span className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/45 px-2.5 py-0.5 text-[11px] text-white backdrop-blur">
            {resume.highlights[0].label} {resume.highlights[0].value}
          </span>
        )}
      </Illustration>
      <div className="space-y-5 p-4">
        {blocs.map((b) =>
          b.type === 'ressources' ? (
            <div key={b.titre} className="space-y-2">
              {b.cles.map((c) => (
                <JaugeRessource key={c} fiche={fiche} cle={c} presentation={presentation} />
              ))}
            </div>
          ) : (
            <div key={b.titre}>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">
                {b.titre}
              </p>
              <div
                className={cn('grid gap-1.5', b.cles.length > 4 ? 'grid-cols-3' : 'grid-cols-2')}
              >
                {b.cles.map((c) => (
                  <TuileAttribut key={c} fiche={fiche} cle={c} compacte />
                ))}
              </div>
            </div>
          ),
        )}
        {monnaies.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {monnaies.map((m) => (
              <span
                key={m.monnaie.id}
                className="rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted-foreground"
              >
                {m.monnaie.nom} : <span className="font-mono text-foreground">{m.solde}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

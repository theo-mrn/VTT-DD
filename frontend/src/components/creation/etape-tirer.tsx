'use client';

import {
  aleatoireCrypto,
  aleatoireImpose,
  tirerEtape,
  type EtapeCreation,
  type EtatEntite,
  type Fiche,
  type SystemeCharge,
  type Tirage,
} from '@vtt/rules';
import { motion } from 'framer-motion';
import { Dices, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Message } from '@/components/compte/elements';
import { DeVisuel } from '@/components/des/de-visuel';
import { Button } from '@/components/ui/button';
import { afficherModificateur } from '@/lib/creation';
import { cn } from '@/lib/utils';

type Etape = Extract<EtapeCreation, { type: 'tirer' }>;

/** Attributs de base visés par l'étape (liste explicite ou groupe). */
function cibles(fiche: Fiche, etape: Etape) {
  return [...fiche.entite.attributs.values()].filter(
    (a) =>
      a.nature === 'base' &&
      ((etape.attributs?.includes(a.cle) ?? false) ||
        (etape.groupe !== undefined && a.groupe === etape.groupe)),
  );
}

/**
 * Étape « tirer » : le moteur lance la formule pour chaque attribut (avec
 * contrainte et relances éventuelles). En attribution libre, le joueur répartit
 * les valeurs obtenues.
 */
export function EtapeTirer({
  systeme,
  etat,
  fiche,
  etape,
  onEtat,
}: {
  systeme: SystemeCharge;
  etat: EtatEntite;
  fiche: Fiche;
  etape: Etape;
  onEtat: (e: EtatEntite) => void;
}) {
  const [tirage, setTirage] = useState<Tirage | null>(null);
  const [nombre, setNombre] = useState(0);
  const [affectation, setAffectation] = useState<Record<string, number>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const attributs = cibles(fiche, etape);
  const libre = etape.attribution === 'libre' && attributs.length > 1;
  const dejaTire = attributs.every((a) => typeof etat.valeurs[a.cle] === 'number');

  function lancer() {
    const r = tirerEtape(systeme, etat, etape.id, aleatoireCrypto());
    setNombre((n) => n + 1);
    if (!r.ok) {
      setErreur(r.erreur);
      setTirage(r.tirages.at(-1) ?? null);
      return;
    }
    setErreur(null);
    setTirage(r.retenu);
    if (libre) {
      setAffectation({});
      return;
    }
    // Ordre imposé, ou un seul attribut : la valeur va directement à sa place
    const a = r.attribuer(r.attribution === 'libre' ? { [r.attributs[0]!]: 0 } : undefined);
    if (a.ok) onEtat(a.etat);
    else setErreur(a.erreur);
  }

  function repartir() {
    // Rejoue exactement le tirage affiché (mêmes dés, même ordre) : le moteur valide l'affectation
    const des = tirage!.jets.flatMap((j) => j.flatMap((x) => x.des.map((d) => d.valeur)));
    const r = tirerEtape(systeme, etat, etape.id, aleatoireImpose(des));
    if (!r.ok) return setErreur(r.erreur);
    const a = r.attribuer(affectation);
    if (a.ok) {
      setErreur(null);
      onEtat(a.etat);
    } else setErreur(a.erreur);
  }

  const utilisees = new Set(Object.values(affectation));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-surface sm:flex-row sm:items-center">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary shadow-glow">
          <Dices className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-lg font-semibold">
            {etape.formule}
            {attributs.length > 1 && <span className="text-subtle"> × {attributs.length}</span>}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {etape.attribution === 'ordre' || attributs.length === 1
              ? 'Les valeurs sont attribuées dans l’ordre.'
              : 'Vous répartissez ensuite les valeurs entre les attributs.'}
            {etape.contrainte && (
              <>
                {' '}
                Contrainte :{' '}
                <span className="font-mono text-foreground/80">{etape.contrainte}</span>
                {etape.relancer && ' (relancé automatiquement).'}
              </>
            )}
          </p>
        </div>
        <Button size="lg" onClick={lancer} className="shrink-0">
          {nombre > 0 || dejaTire ? <RefreshCw /> : <Dices />}
          {nombre > 0 || dejaTire ? 'Relancer' : 'Lancer les dés'}
        </Button>
      </div>

      {erreur && <Message>{erreur}</Message>}

      {tirage && tirage.relances > 0 && (
        <p className="flex items-center gap-2 text-[13px] text-subtle">
          <ShieldCheck className="size-4 text-success" />
          {tirage.relances} tirage(s) refait(s) pour respecter la contrainte · tirage n°{nombre}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {attributs.map((a, i) => {
          const v = fiche.valeurs.get(a.cle);
          const base = etat.valeurs[a.cle];
          const index = libre ? affectation[a.cle] : i;
          const jets = tirage && index !== undefined ? tirage.jets[index] : undefined;
          return (
            <motion.div
              key={`${a.cle}-${nombre}`}
              initial={nombre > 0 ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-border bg-card p-4 shadow-surface"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-subtle">
                    {a.abrege ?? a.nom}
                  </p>
                  <p className="text-[13px] text-muted-foreground">{a.nom}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-3xl font-bold leading-none tabular">
                    {typeof base === 'number' ? (v ? String(v.valeur) : base) : '—'}
                  </p>
                  {v?.modificateur !== undefined && typeof base === 'number' && (
                    <p className="mt-1 font-mono text-xs text-primary">
                      {afficherModificateur(v.modificateur)}
                    </p>
                  )}
                </div>
              </div>
              {jets && !libre && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {jets.flatMap((j, x) =>
                    j.des.map((d, y) => (
                      <DeVisuel
                        key={`${x}-${y}`}
                        faces={j.faces}
                        valeur={d.valeur}
                        etat={d.garde ? 'normal' : 'ecarte'}
                        taille="xs"
                        roulement
                        delai={i * 60 + y * 40}
                      />
                    )),
                  )}
                </div>
              )}
              {libre && tirage && (
                <select
                  value={affectation[a.cle] ?? ''}
                  onChange={(e) =>
                    setAffectation((x) => {
                      const suivante = { ...x };
                      if (e.target.value === '') delete suivante[a.cle];
                      else suivante[a.cle] = Number(e.target.value);
                      return suivante;
                    })
                  }
                  className="mt-3 h-9 w-full rounded-lg border border-input bg-surface-2 px-2 text-sm"
                  aria-label={`Valeur pour ${a.nom}`}
                >
                  <option value="">Choisir une valeur…</option>
                  {tirage.valeurs.map((val, k) => (
                    <option
                      key={k}
                      value={k}
                      disabled={utilisees.has(k) && affectation[a.cle] !== k}
                    >
                      {val}
                    </option>
                  ))}
                </select>
              )}
            </motion.div>
          );
        })}
      </div>

      {libre && tirage && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 p-3">
          <div className="flex flex-wrap gap-1.5">
            {tirage.valeurs.map((v, k) => (
              <span
                key={k}
                className={cn(
                  'flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 font-mono text-sm',
                  utilisees.has(k)
                    ? 'border-border text-subtle line-through'
                    : 'border-primary/40 bg-primary/10 text-primary-strong',
                )}
              >
                {v}
              </span>
            ))}
          </div>
          <Button
            size="sm"
            onClick={repartir}
            disabled={Object.keys(affectation).length !== attributs.length}
          >
            Valider la répartition
          </Button>
        </div>
      )}
    </div>
  );
}

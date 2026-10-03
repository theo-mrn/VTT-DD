'use client';

/**
 * « Modifier les valeurs » : les attributs de base en champs, selon les droits de saisie
 * du système (`saisie` : création, jeu, MJ ; voir `refusSaisie`), les attributs calculés
 * avec leur formule en clair (ils ne se saisissent pas : un bonus les change), et avant
 * d'enregistrer, ce que le changement entraîne (« PV max 28 → 30 »), calculé par le moteur.
 * Le service character refait les mêmes contrôles. Les ressources ont leur propre fenêtre.
 */
import {
  calculer,
  refusSaisie,
  soldes,
  type Attribut,
  type EtatEntite,
  type Fiche,
} from '@vtt/rules';
import { ArrowRight, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { afficherValeur } from '@/lib/creation';
import { cn } from '@/lib/utils';
import { visiblePour, type ContexteFiche } from './widgets';

type Base = Extract<Attribut, { nature: 'base' }>;
type Derivee = Extract<Attribut, { nature: 'derivee' }>;

function nomCourt(fiche: Fiche, cle: string): string {
  const a = fiche.entite.attributs.get(cle);
  return a?.abrege ?? a?.nom ?? cle;
}

/** Formule lisible : `mod(@FOR) + @niveau` → `mod(FOR) + Niveau`. */
function formuleLisible(fiche: Fiche, formule: string): string {
  return formule.replace(/@(\w+)/g, (_, cle: string) => nomCourt(fiche, cle));
}

/** Attributs par groupe du système, dans son ordre : base saisissables et calculés. */
function groupes(ctx: ContexteFiche) {
  const { fiche } = ctx;
  const parGroupe = new Map<string, { nom: string; base: Base[]; derivees: Derivee[] }>();
  for (const g of fiche.entite.type.groupes)
    parGroupe.set(g.id, { nom: g.nom, base: [], derivees: [] });
  const autres = { nom: 'Autres', base: [] as Base[], derivees: [] as Derivee[] };
  for (const a of fiche.entite.attributs.values()) {
    if (!visiblePour(ctx, a.cle)) continue;
    const g = (a.groupe && parGroupe.get(a.groupe)) || autres;
    if (a.nature === 'base') g.base.push(a);
    else if (a.nature === 'derivee' && a.type === 'nombre') g.derivees.push(a);
  }
  return [...parGroupe.values(), autres].filter((g) => g.base.length || g.derivees.length);
}

export interface Difference {
  cle: string;
  nom: string;
  avant: string;
  apres: string;
}

/** Valeurs visibles qui changent d'une fiche à l'autre (« PV max 28 / 28 → 30 / 30 »). */
export function differences(ctx: ContexteFiche, avant: Fiche, apres: Fiche): Difference[] {
  const r: Difference[] = [];
  for (const a of avant.entite.attributs.values()) {
    if (!visiblePour(ctx, a.cle)) continue;
    const av = avant.valeurs.get(a.cle);
    const ap = apres.valeurs.get(a.cle);
    if (!av || !ap) continue;
    const texte = (v: typeof av) =>
      `${afficherValeur(v)}${a.nature === 'ressource' && v.max !== undefined ? ` / ${v.max}` : ''}`;
    if (texte(av) !== texte(ap))
      r.push({ cle: a.cle, nom: a.nom, avant: texte(av), apres: texte(ap) });
  }
  // Monnaies gagnées avec la progression (points de capacité…) : leur solde
  const soldesAvant = new Map(soldes(avant).map((m) => [m.monnaie.id, m]));
  for (const m of soldes(apres)) {
    const av = soldesAvant.get(m.monnaie.id);
    if (av && av.solde !== m.solde)
      r.push({
        cle: `monnaie:${m.monnaie.id}`,
        nom: m.monnaie.nom,
        avant: String(av.solde),
        apres: String(m.solde),
      });
  }
  return r;
}

export function ValuesDialog({
  ctx,
  proprietaire,
  open,
  onOpenChange,
}: Readonly<{
  ctx: ContexteFiche;
  /** A la main sur la fiche (joueur qui l'incarne, propriétaire hors campagne) : `Saisisseur`. */
  proprietaire: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const { fiche, systeme } = ctx;
  const etat = fiche.etat;
  const qui = { proprietaire, mj: ctx.mj === true };
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const liste = useMemo(() => groupes(ctx), [ctx]);

  const actuelle = (a: Base) => {
    const v = etat.valeurs[a.cle];
    return typeof v === 'number' ? v : a.defaut;
  };

  // Valeurs changées et lisibles ; erreurs de saisie par clé
  const { changes, erreurs } = useMemo(() => {
    const changes: Record<string, number> = {};
    const erreurs: Record<string, string> = {};
    for (const g of liste)
      for (const a of g.base) {
        const t = saisies[a.cle];
        if (t === undefined) continue;
        const n = Number(t.replace(',', '.'));
        if (t.trim() === '' || !Number.isFinite(n)) {
          erreurs[a.cle] = 'Nombre attendu';
          continue;
        }
        const bornes = fiche.valeurs.get(a.cle);
        if (bornes?.min !== undefined && n < bornes.min) erreurs[a.cle] = `Au moins ${bornes.min}`;
        else if (bornes?.max !== undefined && n > bornes.max)
          erreurs[a.cle] = `Au plus ${bornes.max}`;
        else if (n !== actuelle(a)) changes[a.cle] = n;
      }
    return { changes, erreurs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisies, liste, fiche]);

  // Conséquences calculées par le moteur : valeurs visibles qui changent
  const { apercu, impacts } = useMemo(() => {
    if (!Object.keys(changes).length) return { apercu: null, impacts: [] };
    const suivant: EtatEntite = { ...etat, valeurs: { ...etat.valeurs, ...changes } };
    let nouvelle: Fiche;
    try {
      nouvelle = calculer(systeme, suivant);
    } catch {
      return { apercu: null, impacts: [] };
    }
    const impacts = differences(ctx, fiche, nouvelle).filter((i) => changes[i.cle] === undefined);
    return { apercu: suivant, impacts };
  }, [changes, etat, systeme, fiche, ctx]);

  const fermer = (o: boolean) => {
    onOpenChange(o);
    if (!o) setSaisies({});
  };
  const nbChanges = Object.keys(changes).length;
  const enregistrer = () => {
    if (!apercu || !ctx.operations || Object.keys(erreurs).length) return;
    ctx.operations.valeurs(changes, apercu);
    fermer(false);
  };

  return (
    <Dialog open={open} onOpenChange={fermer}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifier les valeurs</DialogTitle>
          <DialogDescription>
            Les valeurs calculées suivent leur formule : pour les changer, ajoutez un bonus.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 min-h-0 flex-1 space-y-6 overflow-y-auto px-6 [scrollbar-width:thin]">
          {liste.map((g) => (
            <section key={g.nom} className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-subtle">{g.nom}</h3>
              {g.base.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {g.base.map((a) => {
                    const refus = refusSaisie(a, etat.creation, qui);
                    const id = `valeur-${a.cle}`;
                    const erreur = erreurs[a.cle];
                    const change = changes[a.cle] !== undefined;
                    return (
                      <div key={a.cle} className="space-y-1">
                        <label
                          htmlFor={id}
                          className="flex items-center gap-1 text-xs text-muted-foreground"
                        >
                          <span className="truncate">{a.nom}</span>
                          {refus && <Lock className="size-3 shrink-0 text-subtle" aria-hidden />}
                        </label>
                        <Input
                          id={id}
                          inputMode="numeric"
                          disabled={!!refus}
                          title={refus}
                          aria-invalid={erreur ? true : undefined}
                          aria-describedby={`${id}-aide`}
                          value={saisies[a.cle] ?? String(actuelle(a))}
                          onChange={(e) => setSaisies((s) => ({ ...s, [a.cle]: e.target.value }))}
                          className={cn(
                            'h-9 font-mono tabular-nums',
                            change && 'border-primary/60',
                          )}
                        />
                        <p id={`${id}-aide`} className="min-h-4 text-[11px] text-subtle">
                          {erreur ? (
                            <span className="text-destructive">{erreur}</span>
                          ) : refus ? (
                            qui.mj ? (
                              'Non modifiable'
                            ) : (
                              'MJ seul'
                            )
                          ) : (
                            (() => {
                              const finale = fiche.valeurs.get(a.cle);
                              return finale && finale.valeur !== actuelle(a)
                                ? `Avec bonus : ${afficherValeur(finale)}`
                                : '';
                            })()
                          )}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
              {g.derivees.length > 0 && (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {g.derivees.map((a) => (
                    <li key={a.cle} className="flex items-baseline gap-3 px-3 py-2 text-sm">
                      <span className="w-28 shrink-0 truncate text-muted-foreground">{a.nom}</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-subtle">
                        {formuleLisible(fiche, a.formule)}
                      </span>
                      <span className="shrink-0 font-mono font-semibold tabular-nums">
                        {afficherValeur(fiche.valeurs.get(a.cle)!)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {impacts.length > 0 && (
          <div className="rounded-xl border border-primary/30 bg-primary/[0.06] p-3">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Conséquences</p>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {impacts.map((i) => (
                <li key={i.cle} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{i.nom}</span>
                  <span className="font-mono text-subtle">{i.avant}</span>
                  <ArrowRight className="size-3 text-subtle" aria-hidden />
                  <span className="font-mono font-semibold">{i.apres}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => fermer(false)}>
            Annuler
          </Button>
          <Button disabled={!nbChanges || Object.keys(erreurs).length > 0} onClick={enregistrer}>
            Enregistrer{nbChanges > 0 ? ` (${nbChanges})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

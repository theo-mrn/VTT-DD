'use client';

/**
 * Bonus d'une entrée (fenêtre d'une compétence, d'un nœud d'arbre, d'une possession du
 * profil) : une ligne par effet, ceux du catalogue et ceux ajoutés à la main (effets propres
 * de sa possession). Entrée acquise et fiche modifiable : un interrupteur par effet, la même
 * opération que le bloc Bonus (`etat.effetsDesactives`), donc le même état des deux côtés ;
 * « Gérer les bonus » ajoute ou retire les bonus propres. Entrée non acquise : lecture seule.
 */
import { sourceExemplaire, type Effet, type Entree, type Fiche } from '@vtt/rules';
import { ArrowRight, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Info } from '@/components/ui/tooltip';
import { texteEffet } from '@/lib/creation';
import { cn } from '@/lib/utils';
import { BonusForm } from '../../bonus-editor/bonus-form';
import { ECHAP_LOCAL } from '../../bonus-editor/escape';
import { attributsBonus, type CibleBonusPropres } from '../../bonus-editor/model';
import { rollEffectText } from '../skills/model';
import { effetsDeLEntree, libelleEffet, precisionEffet, raisonInactif } from './model';

/** Écritures possibles depuis le détail d'une entrée acquise (absentes : lecture seule). */
export interface EntryBonusEdit {
  /** Coupe ou rétablit des effets : la même opération que le bloc Bonus. */
  toggle?: ((cles: string[], actif: boolean) => void) | undefined;
  /** Bonus propres : où les poser, et l'écriture qui remplace leur liste. */
  own?: {
    cible: CibleBonusPropres;
    mj: boolean;
    set(effets: Effet[]): void;
  };
}

interface Ligne {
  cle: string;
  texte: string;
  precision: string | null;
  statut: 'actif' | 'desactive' | 'inactif';
  raison: string | null;
  /** Position dans les effets propres de la possession (bonus ajouté à la main). */
  propre?: number;
}

function acquise(fiche: Fiche, entry: Entree): boolean {
  const p = fiche.possessions.get(entry.id);
  return !!p && (!p.sorte.rangs || p.rang > 0);
}

function lignes(fiche: Fiche, entry: Entree, sourcePropre: string | null): Ligne[] {
  const p = fiche.possessions.get(entry.id);
  if (acquise(fiche, entry))
    return effetsDeLEntree(fiche, entry.id).map((e) => ({
      cle: e.cle,
      texte: libelleEffet(fiche, e),
      precision: precisionEffet(e),
      statut: e.statut,
      raison: e.statut === 'inactif' ? raisonInactif(e) : null,
      ...(e.genre === 'exemplaire' && e.source === sourcePropre ? { propre: e.index } : {}),
    }));
  // Entrée pas encore possédée : ce que ses effets du catalogue donneraient
  const rang = Math.max(p?.rang ?? 0, 1);
  return entry.effets.flatMap((effet, i) => {
    if (effet.sur === 'marque') return [];
    const texte =
      effet.sur === 'jet' ? rollEffectText(fiche, effet, rang) : texteEffet(fiche, effet);
    return texte
      ? [{ cle: `${entry.id}/${i}`, texte, precision: null, statut: 'inactif', raison: null }]
      : [];
  });
}

const TITRE = 'mb-1 text-[11px] font-medium uppercase tracking-wider text-subtle';

export function EntryBonuses({
  fiche,
  entry,
  onManage,
  edit,
}: {
  fiche: Fiche;
  entry: Entree;
  /** Amène le bloc Bonus à l'écran (absent : il n'est pas sur la fiche). */
  onManage?: (() => void) | undefined;
  /** Interrupteurs et gestion des bonus propres (absent : lecture seule). */
  edit?: EntryBonusEdit | undefined;
}) {
  const id = useId();
  const [gestion, setGestion] = useState(false);
  const possedee = acquise(fiche, entry);
  const cible = possedee ? edit?.own?.cible : undefined;
  const possession = cible?.ok ? cible.possession : undefined;
  const sourcePropre = possession ? sourceExemplaire(possession) : null;
  const liste = useMemo(() => lignes(fiche, entry, sourcePropre), [fiche, entry, sourcePropre]);
  const toggle = possedee ? edit?.toggle : undefined;
  const own = possedee ? edit?.own : undefined;
  const peutAjouter = useMemo(
    () => !!own && attributsBonus(fiche, own.mj).length > 0,
    [fiche, own],
  );
  // Marques d'entrées (compétences de carrière…) : des effets, pas des bonus
  const marques = entry.effets
    .filter((e) => e.sur === 'marque')
    .map((e) => texteEffet(fiche, e))
    .filter((t): t is string => !!t);
  if (!liste.length && !marques.length && !own) return null;

  const propres = possession?.effets ?? [];
  const bloque = own && !own.cible.ok ? own.cible.raison : null;
  const retirer = (index: number) => own?.set(propres.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      {(liste.length > 0 || own) && (
        <section aria-labelledby={`${id}-titre`}>
          <div className="mb-1 flex min-h-7 items-center justify-between gap-2">
            <h3 id={`${id}-titre`} className={cn(TITRE, 'mb-0')}>
              Bonus
            </h3>
            {own && (
              <Info texte={bloque ?? undefined}>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-expanded={bloque ? undefined : gestion}
                  aria-controls={bloque ? undefined : `${id}-gestion`}
                  aria-disabled={bloque ? true : undefined}
                  aria-describedby={bloque ? `${id}-bloque` : undefined}
                  className={cn('-mr-1.5', bloque && 'cursor-not-allowed opacity-50')}
                  onClick={() => !bloque && setGestion((g) => !g)}
                >
                  <SlidersHorizontal />
                  {gestion ? 'Terminer' : 'Gérer les bonus'}
                </Button>
              </Info>
            )}
          </div>
          {bloque && (
            <p id={`${id}-bloque`} className="sr-only">
              {bloque}
            </p>
          )}
          {liste.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {liste.map((l) => (
                <LigneBonus
                  key={l.cle}
                  l={l}
                  possedee={possedee}
                  toggle={toggle}
                  onRetirer={gestion && l.propre !== undefined ? retirer : undefined}
                />
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-subtle">Aucun bonus.</p>
          )}
          {possedee && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-subtle">
              {toggle
                ? 'Mêmes réglages que dans le bloc Bonus.'
                : 'Ces bonus s’activent ou se désactivent dans le bloc Bonus.'}
              {onManage && (
                <button
                  type="button"
                  onClick={onManage}
                  className="inline-flex items-center gap-0.5 rounded font-medium text-primary-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  Y aller
                  <ArrowRight className="size-3" aria-hidden />
                </button>
              )}
            </p>
          )}
          {own && gestion && !bloque && own.cible.ok && (
            <div id={`${id}-gestion`}>
              {propres.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Les bonus ajoutés se retirent par la corbeille de leur ligne.
                </p>
              )}
              {peutAjouter ? (
                <BonusForm
                  fiche={fiche}
                  sorte={own.cible.sorte}
                  mj={own.mj}
                  onAjouter={(effet) => own.set([...propres, effet])}
                  onAnnuler={() => setGestion(false)}
                />
              ) : (
                <p className="mt-2 text-xs text-subtle">Aucun attribut à modifier par un bonus.</p>
              )}
            </div>
          )}
        </section>
      )}
      {marques.length > 0 && (
        <div>
          <p className={TITRE}>Effets</p>
          <ul className="space-y-0.5 text-[13px] text-muted-foreground">
            {marques.map((t, i) => (
              <li key={`${t}-${i}`}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Une ligne d'effet : texte court, état écrit (« désactivé », raison), interrupteur ; en
 * gestion, un bonus ajouté à la main se retire après confirmation sur la ligne même.
 */
function LigneBonus({
  l,
  possedee,
  toggle,
  onRetirer,
}: {
  l: Ligne;
  possedee: boolean;
  toggle: ((cles: string[], actif: boolean) => void) | undefined;
  onRetirer: ((index: number) => void) | undefined;
}) {
  const [confirme, setConfirme] = useState(false);
  const corbeille = useRef<HTMLButtonElement>(null);
  const coupe = l.statut === 'desactive';
  const annuler = () => {
    setConfirme(false);
    window.setTimeout(() => corbeille.current?.focus(), 0);
  };

  if (confirme && onRetirer && l.propre !== undefined)
    return (
      <li
        {...ECHAP_LOCAL}
        className="flex min-h-9 items-center gap-2 bg-destructive/5 px-2.5 py-1 text-[13px]"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            annuler();
          }
        }}
      >
        <span className="min-w-0 flex-1 truncate" role="alert">
          Retirer « {l.texte} » ?
        </span>
        <Button type="button" variant="ghost" size="xs" autoFocus onClick={annuler}>
          Annuler
        </Button>
        <Button type="button" variant="destructive" size="xs" onClick={() => onRetirer(l.propre!)}>
          Retirer
        </Button>
      </li>
    );

  return (
    <li
      className={cn(
        'flex min-h-9 items-center gap-2 px-2.5 py-1 text-[13px]',
        l.statut === 'actif' ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {!toggle && (
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            l.statut === 'actif' ? 'bg-primary' : 'bg-surface-3',
          )}
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1">
        <span className={cn(coupe && 'line-through')}>{l.texte}</span>
        {l.precision && <span className="text-xs text-subtle"> · {l.precision}</span>}
        {l.propre !== undefined && <span className="text-xs text-subtle"> · ajouté</span>}
        {possedee && coupe && <span className="text-xs text-subtle"> · désactivé</span>}
        {l.raison && <span className="text-xs text-subtle"> · {l.raison}</span>}
      </span>
      {onRetirer && l.propre !== undefined && (
        <Button
          ref={corbeille}
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Retirer le bonus ${l.texte}`}
          onClick={() => setConfirme(true)}
        >
          <Trash2 />
        </Button>
      )}
      {toggle && (
        <Switch
          className="scale-90"
          checked={!coupe}
          disabled={l.statut === 'inactif'}
          onCheckedChange={(v) => toggle([l.cle], v)}
          aria-label={`${coupe ? 'Activer' : 'Désactiver'} ${l.texte}${l.raison ? `, ${l.raison}` : ''}`}
        />
      )}
    </li>
  );
}

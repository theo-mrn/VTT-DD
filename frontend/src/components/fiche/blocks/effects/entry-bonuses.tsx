'use client';

/**
 * Bonus d'une entrée (fenêtre d'une compétence, d'un nœud d'arbre, d'une possession du
 * profil) : en-tête (titre, compteur), puis une carte avec une ligne
 * par effet, ceux du catalogue et ceux ajoutés à la main (effets propres de sa possession).
 * Entrée acquise et fiche modifiable : un interrupteur par effet, la même opération que le
 * bloc Bonus (`etat.effetsDesactives`), donc le même état des deux côtés ; un bonus propre se
 * retire par son menu, après confirmation ; l'ajout se fait en ligne, en bas de la carte.
 * Entrée non acquise : lecture seule.
 */
import { sourceExemplaire, type Effet, type Entree, type Fiche } from '@vtt/rules';
import { BadgePlus, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Info } from '@/components/ui/tooltip';
import { texteEffet } from '@/lib/creation';
import { cn } from '@/lib/utils';
import { BonusForm } from '../../bonus-editor/bonus-form';
import { ECHAP_LOCAL } from '../../bonus-editor/escape';
import { attributsBonus, type CibleBonusPropres } from '../../bonus-editor/model';
import { rollEffectText } from '../skills/model';
import {
  effetEstBonus,
  effetsDeLEntree,
  libelleEffet,
  precisionEffet,
  raisonInactif,
} from './model';

/** Écritures possibles depuis le détail d'une entrée acquise (absentes : lecture seule). */
export interface EntryBonusEdit {
  /** Coupe ou rétablit des effets : la même opération que le bloc Bonus. */
  toggle?: (cles: string[], actif: boolean) => void;
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
      precision: precisionEffet(fiche, e),
      statut: e.statut,
      raison: e.statut === 'inactif' ? raisonInactif(e) : null,
      ...(e.genre === 'exemplaire' && e.source === sourcePropre ? { propre: e.index } : {}),
    }));
  // Entrée pas encore possédée : ce que ses effets du catalogue donneraient
  const rang = Math.max(p?.rang ?? 0, 1);
  return entry.effets.flatMap((effet, i) => {
    if (!effetEstBonus(effet)) return [];
    const texte =
      effet.sur === 'jet' ? rollEffectText(fiche, effet, rang) : texteEffet(fiche, effet);
    return texte
      ? [{ cle: `${entry.id}/${i}`, texte, precision: null, statut: 'inactif', raison: null }]
      : [];
  });
}

/** Titre d'une section du détail (même style que les autres titres du détail). */
const TITRE = 'text-sm font-semibold text-foreground';

/** Pourquoi un bonus propre ne peut pas être ajouté (cible refusée, aucun attribut), sinon null. */
function ajoutBloque(own: EntryBonusEdit['own'], peutAjouter: boolean): string | null {
  if (own && !own.cible.ok) return own.cible.raison;
  if (own && !peutAjouter) return 'Aucun attribut du personnage ne peut recevoir de bonus.';
  return null;
}

/** « 2 actifs / 3 » : effets de l'entrée possédée qui s'appliquent. */
function CompteActifs({ actifs, total }: Readonly<{ actifs: number; total: number }>) {
  return (
    <span className="font-mono text-xs tabular text-subtle">
      {actifs} actif{actifs > 1 ? 's' : ''} / {total}
    </span>
  );
}

/** Effets qui ne sont pas des bonus : rangs offerts, marques d'entrées. */
function EffetsMarques({ marques }: Readonly<{ marques: string[] }>) {
  if (marques.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className={TITRE}>Effets</h3>
      <ul className="space-y-0.5 text-[13px] text-muted-foreground">
        {marques.map((t, i) => (
          <li key={`${t}-${i}`}>{t}</li>
        ))}
      </ul>
    </section>
  );
}

export function EntryBonuses({
  fiche,
  entry,
  edit,
}: Readonly<{
  fiche: Fiche;
  entry: Entree;
  /** Interrupteurs et gestion des bonus propres (absent : lecture seule). */
  edit?: EntryBonusEdit;
}>) {
  const id = useId();
  const [ajout, setAjout] = useState(false);
  const boutonAjout = useRef<HTMLButtonElement>(null);
  const possedee = acquise(fiche, entry);
  const own = possedee ? edit?.own : undefined;
  const cible = own?.cible;
  const possession = cible?.ok ? cible.possession : undefined;
  const sourcePropre = possession ? sourceExemplaire(possession) : null;
  const liste = useMemo(() => lignes(fiche, entry, sourcePropre), [fiche, entry, sourcePropre]);
  const toggle = possedee ? edit?.toggle : undefined;
  const peutAjouter = useMemo(
    () => !!own && attributsBonus(fiche, own.mj).length > 0,
    [fiche, own],
  );
  // Rangs offerts et marques d'entrées (compétences de carrière…) : des effets, pas des bonus
  const marques = entry.effets
    .filter((e) => !effetEstBonus(e))
    .map((e) => texteEffet(fiche, e))
    .filter((t): t is string => !!t);
  if (!liste.length && !marques.length && !own) return null;

  const propres = possession?.effets ?? [];
  const bloque = ajoutBloque(own, peutAjouter);
  const retirer = (index: number) => own?.set(propres.filter((_, i) => i !== index));
  const fermerAjout = () => {
    setAjout(false);
    window.setTimeout(() => boutonAjout.current?.focus(), 0);
  };
  const actifs = liste.filter((l) => l.statut === 'actif').length;

  const formulaire =
    own && ajout && !bloque && own.cible.ok ? (
      <BonusForm
        fiche={fiche}
        sorte={own.cible.sorte}
        mj={own.mj}
        onAjouter={(effet) => {
          own.set([...propres, effet]);
          fermerAjout();
        }}
        onAnnuler={fermerAjout}
        className="space-y-2 border-t border-border bg-surface p-3"
      />
    ) : null;

  const boutonAjouter = (vide: boolean) =>
    own && (
      <Info texte={bloque ?? undefined}>
        <Button
          ref={boutonAjout}
          type="button"
          variant={vide ? 'secondary' : 'ghost'}
          size="xs"
          aria-disabled={bloque ? true : undefined}
          aria-describedby={bloque ? `${id}-bloque` : undefined}
          className={cn(
            !vide && 'w-full justify-start text-muted-foreground',
            bloque && 'cursor-not-allowed opacity-50',
          )}
          onClick={() => !bloque && setAjout(true)}
        >
          <Plus />
          Ajouter un bonus
        </Button>
      </Info>
    );

  return (
    <div className="space-y-4">
      {(liste.length > 0 || own) && (
        <section aria-labelledby={`${id}-titre`} className="space-y-2">
          <div className="flex min-h-7 items-center gap-2">
            <h3 id={`${id}-titre`} className={TITRE}>
              Bonus
            </h3>
            {possedee && liste.length > 0 && <CompteActifs actifs={actifs} total={liste.length} />}
          </div>
          {bloque && (
            <p id={`${id}-bloque`} className="sr-only">
              {bloque}
            </p>
          )}

          {liste.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
              <ul className="divide-y divide-border">
                {liste.map((l) => (
                  <LigneBonus
                    key={l.cle}
                    l={l}
                    possedee={possedee}
                    toggle={toggle}
                    onRetirer={own && l.propre !== undefined ? retirer : undefined}
                  />
                ))}
              </ul>
              {formulaire ??
                (own && (
                  <div className="border-t border-border px-1.5 py-1">{boutonAjouter(false)}</div>
                ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-dashed border-border-strong">
              {formulaire ?? (
                <div className="flex flex-col items-center gap-2 px-3 py-4 text-center">
                  <BadgePlus className="size-4 text-subtle" aria-hidden />
                  <p className="text-[13px] text-muted-foreground">
                    Aucun bonus sur cette compétence
                  </p>
                  {boutonAjouter(true)}
                </div>
              )}
            </div>
          )}
        </section>
      )}
      <EffetsMarques marques={marques} />
    </div>
  );
}

/**
 * Une ligne d'effet (~36 px) : texte court, provenance et état écrits (« ajouté »,
 * « désactivé », raison), interrupteur ; un bonus propre a un menu « … » pour le retirer,
 * après confirmation sur la ligne même.
 */
function LigneBonus({
  l,
  possedee,
  toggle,
  onRetirer,
}: Readonly<{
  l: Ligne;
  possedee: boolean;
  toggle: ((cles: string[], actif: boolean) => void) | undefined;
  onRetirer: ((index: number) => void) | undefined;
}>) {
  const [confirme, setConfirme] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const coupe = l.statut === 'desactive';
  const annuler = () => {
    setConfirme(false);
    window.setTimeout(() => menu.current?.focus(), 0);
  };

  if (confirme && onRetirer && l.propre !== undefined)
    return (
      <li
        {...ECHAP_LOCAL}
        className="flex min-h-9 items-center gap-2 bg-destructive/5 px-3 py-1 text-[13px]"
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

  const meta = [
    l.propre !== undefined ? 'ajouté' : null,
    l.precision,
    possedee && coupe ? 'désactivé' : null,
    l.raison,
  ].filter(Boolean);

  return (
    <li className="flex min-h-9 items-center gap-2 px-3 py-1 text-[13px]">
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          l.statut === 'actif' ? 'text-foreground' : 'text-muted-foreground',
          coupe && 'opacity-70',
        )}
        title={[l.texte, ...meta].join(' · ')}
      >
        {l.texte}
        {meta.length > 0 && <span className="text-xs text-subtle"> · {meta.join(' · ')}</span>}
      </span>
      {onRetirer && l.propre !== undefined && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={menu}
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={`Actions du bonus ${l.texte}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setConfirme(true)}
            >
              <Trash2 />
              Retirer…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

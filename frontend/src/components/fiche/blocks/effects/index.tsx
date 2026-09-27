'use client';

/**
 * Bloc Effets actifs (widget `bonus` de la présentation) : tout ce qui modifie le personnage
 * en ce moment, quelle que soit sa provenance. Les entrées possédées et les exemplaires
 * (épée +1) viennent des sources d'effets calculées par le moteur ; les bonus libres
 * (potion, bénédiction, décision du MJ) s'activent, se retirent et s'ajoutent ici.
 * Rien n'est propre à un jeu : les cibles proposées sont les attributs du type d'entité.
 */
import type { BonusLibre, Effet } from '@vtt/rules';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, styleChampBase } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { groupesAttributs, texteEffet } from '@/lib/creation';
import { cn } from '@/lib/utils';
import { Bloc, visiblePour, type ContexteFiche } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

/** Effets lisibles d'une source : ceux qui modifient une valeur, un jet ou des dégâts. */
function textes(ctx: ContexteFiche, effets: readonly Effet[]): string[] {
  return effets
    .filter((e) => e.sur !== 'rang' && e.sur !== 'marque')
    .map((e) => texteEffet(ctx.fiche, e))
    .filter((t): t is string => Boolean(t));
}

interface LigneEffet {
  id: string;
  nom: string;
  provenance: string;
  textes: string[];
}

function EffectsBlock({ ctx, widget }: SheetBlockProps<'bonus'>) {
  const { fiche, operations } = ctx;
  const [ajout, setAjout] = useState(false);

  // Entrées et exemplaires actifs qui portent des effets lisibles
  const sources = useMemo<LigneEffet[]>(
    () =>
      fiche.sources
        .filter((s) => s.genre !== 'bonus')
        .filter((s) => {
          const p = s.possession;
          if (!p) return true;
          if (p.sorte.rangs && p.rang === 0) return false;
          return !p.sorte.activable || p.actif;
        })
        .map((s) => ({
          id: s.id,
          nom: s.nom,
          provenance: s.possession?.sorte.nom ?? '',
          textes: textes(ctx, s.effets),
        }))
        .filter((l) => l.textes.length > 0),
    [fiche, ctx],
  );
  const libres = fiche.etat.bonus;

  function basculer(b: BonusLibre) {
    if (!operations) return;
    const suivant = { ...b, actif: !b.actif };
    operations.bonus(suivant, {
      ...fiche.etat,
      bonus: fiche.etat.bonus.map((x) => (x.id === b.id ? suivant : x)),
    });
  }

  function retirer(b: BonusLibre) {
    if (!operations) return;
    operations.retirerBonus(b.id, {
      ...fiche.etat,
      bonus: fiche.etat.bonus.filter((x) => x.id !== b.id),
    });
  }

  return (
    <Bloc
      titre={
        <span className="flex items-center gap-2">
          {widget.titre}
          <span className="text-xs font-normal text-subtle">{sources.length + libres.length}</span>
        </span>
      }
      action={
        operations && (
          <Button variant="ghost" size="xs" onClick={() => setAjout(true)}>
            <Plus />
            Bonus
          </Button>
        )
      }
    >
      {sources.length === 0 && libres.length === 0 ? (
        <p className="py-6 text-center text-sm text-subtle">Aucun effet actif.</p>
      ) : (
        <div className="space-y-4">
          {libres.length > 0 && (
            <section>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">
                Bonus libres
              </p>
              <ul className="divide-y divide-border">
                {libres.map((b) => (
                  <li key={b.id} className="flex items-start gap-3 py-2">
                    <Sparkles
                      className={cn(
                        'mt-0.5 size-4 shrink-0',
                        b.actif ? 'text-primary' : 'text-subtle',
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-sm', !b.actif && 'text-muted-foreground')}>
                        {b.nom}
                        {b.source && <span className="text-subtle"> · {b.source}</span>}
                        {b.duree !== undefined && (
                          <span className="text-subtle"> · {b.duree} round(s)</span>
                        )}
                      </p>
                      <Etiquettes textes={textes(ctx, b.effets)} actif={b.actif} />
                    </div>
                    <Switch
                      checked={b.actif}
                      disabled={!operations}
                      onCheckedChange={() => basculer(b)}
                      aria-label={`${b.actif ? 'Désactiver' : 'Activer'} ${b.nom}`}
                    />
                    {operations && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => retirer(b)}
                        aria-label={`Retirer ${b.nom}`}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {sources.length > 0 && (
            <section>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">
                Possessions
              </p>
              <ul className="divide-y divide-border">
                {sources.map((l) => (
                  <li key={l.id} className="py-2">
                    <p className="truncate text-sm">
                      {l.nom}
                      {l.provenance && <span className="text-subtle"> · {l.provenance}</span>}
                    </p>
                    <Etiquettes textes={l.textes} actif />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {operations && <AjoutBonus ctx={ctx} ouvert={ajout} onOuvert={setAjout} />}
    </Bloc>
  );
}

function Etiquettes({ textes: liste, actif }: { textes: string[]; actif: boolean }) {
  if (liste.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {liste.slice(0, 6).map((t) => (
        <Badge key={t} ton={actif ? 'primaire' : 'neutre'}>
          {t}
        </Badge>
      ))}
      {liste.length > 6 && <Badge>+{liste.length - 6}</Badge>}
    </div>
  );
}

/** Nouveau bonus libre : un nom et un modificateur ajouté à un attribut du personnage. */
function AjoutBonus({
  ctx,
  ouvert,
  onOuvert,
}: {
  ctx: ContexteFiche;
  ouvert: boolean;
  onOuvert: (v: boolean) => void;
}) {
  const { fiche, operations } = ctx;
  const groupes = useMemo(
    () =>
      groupesAttributs(fiche)
        .map((g) => ({ ...g, attributs: g.attributs.filter((a) => visiblePour(ctx, a.cle)) }))
        .filter((g) => g.attributs.length > 0),
    [fiche, ctx],
  );
  const [nom, setNom] = useState('');
  const [source, setSource] = useState('');
  const [attribut, setAttribut] = useState('');
  const [valeur, setValeur] = useState('1');
  const nombre = Number(valeur);
  const valide =
    nom.trim().length > 0 && attribut !== '' && Number.isFinite(nombre) && nombre !== 0;

  function enregistrer() {
    if (!operations || !valide) return;
    const effets: Effet[] = [
      { sur: 'attribut', attribut, operation: 'ajouter', valeur: String(nombre) },
    ];
    const demande = {
      nom: nom.trim(),
      ...(source.trim() ? { source: source.trim() } : {}),
      effets,
      actif: true,
    };
    // Aperçu : l'identifiant définitif est donné par le service
    const apercu: BonusLibre = { ...demande, id: `nouveau-${Date.now()}` };
    operations.bonus(demande, { ...fiche.etat, bonus: [...fiche.etat.bonus, apercu] });
    onOuvert(false);
    setNom('');
    setSource('');
    setValeur('1');
  }

  return (
    <Dialog open={ouvert} onOpenChange={onOuvert}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau bonus</DialogTitle>
          <DialogDescription>
            Un modificateur libre (potion, bénédiction, décision du MJ), activable à tout moment.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="bonus-nom">Nom</Label>
            <Input
              id="bonus-nom"
              value={nom}
              maxLength={200}
              onChange={(e) => setNom(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bonus-source">Provenance (facultatif)</Label>
            <Input
              id="bonus-source"
              value={source}
              maxLength={200}
              onChange={(e) => setSource(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <div className="space-y-2">
              <Label htmlFor="bonus-attribut">Attribut</Label>
              <select
                id="bonus-attribut"
                value={attribut}
                onChange={(e) => setAttribut(e.target.value)}
                className={cn(styleChampBase, 'h-10 px-3')}
              >
                <option value="">Choisir…</option>
                {groupes.map((g) => (
                  <optgroup key={g.id} label={g.nom}>
                    {g.attributs.map((a) => (
                      <option key={a.cle} value={a.cle}>
                        {a.nom}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bonus-valeur">Valeur</Label>
              <Input
                id="bonus-valeur"
                type="number"
                inputMode="numeric"
                value={valeur}
                onChange={(e) => setValeur(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOuvert(false)}>
            Annuler
          </Button>
          <Button disabled={!valide} onClick={enregistrer}>
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const effectsBlock: SheetBlockDefinition<'bonus'> = {
  type: 'bonus',
  label: 'Effets actifs',
  description: 'Bonus libres et effets des possessions actives, activables et retirables.',
  defaultSize: { w: 6, h: 6 },
  minSize: { w: 3, h: 4 },
  Component: EffectsBlock,
};

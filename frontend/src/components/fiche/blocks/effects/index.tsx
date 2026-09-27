'use client';

/**
 * Bloc Bonus (widget `bonus` de la présentation) : le seul endroit où l'on gère les bonus.
 *
 * Onglets : « Actifs » (par défaut, les seuls effets appliqués), puis une famille de sources
 * par onglet (objets, capacités, profil, bonus libres), celles que le système peut remplir.
 * Dans un onglet, une ligne compacte par source (objet, compétence, espèce, bonus libre) :
 * son nom, ses effets en texte court, un interrupteur pour toute la source. Un clic déplie ses
 * effets, pour les couper un à un (`etat.effetsDesactives`) sans déséquiper l'objet. Une
 * source qui ne s'applique pas (objet rangé) est grisée, avec sa raison. Les bonus libres
 * (potion, bénédiction, décision du MJ) s'activent en entier, s'ajoutent et se retirent dans
 * leur onglet. La liste défile au-delà d'une douzaine de lignes : le bloc reste bas.
 * Rien n'est propre à un jeu : tout vient de `listerEffets` de @vtt/rules.
 */
import type { BonusLibre, Effet, EffetListe } from '@vtt/rules';
import { ChevronRight, Plus, Search, Trash2, X } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { groupesAttributs } from '@/lib/creation';
import { cn } from '@/lib/utils';
import { Bloc, visiblePour, type ContexteFiche } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';
import {
  ancreBonus,
  apercuBascule,
  effetsDuPersonnage,
  familleDe,
  famillesDuSysteme,
  libelleEffet,
  libelleFamille,
  ongletFamille,
  precisionEffet,
  raisonInactif,
  sorteDe,
  type FamilleEffet,
} from './model';

/** Au-delà de ce nombre de sources dans un onglet, la recherche apparaît. */
const SEUIL_RECHERCHE = 8;

type Onglet = 'actifs' | FamilleEffet;

function plain(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

interface LigneEffet {
  e: EffetListe;
  libelle: string;
  precision: string | null;
}

/** Une source affichée : une entrée, un exemplaire (s'il y en a plusieurs) ou un bonus libre. */
interface GroupeSource {
  cle: string;
  nom: string;
  sorte: string | null;
  famille: FamilleEffet;
  /** Pourquoi la source ne s'applique pas (objet rangé…), sinon null. */
  raison: string | null;
  bonus?: BonusLibre;
  lignes: LigneEffet[];
}

function grouper(ctx: ContexteFiche, effets: EffetListe[]): GroupeSource[] {
  const groupes = new Map<string, GroupeSource>();
  for (const e of effets) {
    const p = e.possession;
    // Un seul exemplaire : ses effets propres rejoignent ceux de l'entrée
    const cle =
      e.genre === 'bonus' || !p
        ? e.source
        : e.genre === 'exemplaire' && p.exemplaires.length > 1
          ? e.source
          : p.entree.id;
    let g = groupes.get(cle);
    if (!g) {
      g = {
        cle,
        nom: e.nom,
        sorte: sorteDe(e),
        famille: familleDe(e),
        raison: e.statut === 'inactif' ? raisonInactif(e) : null,
        ...(e.bonus ? { bonus: e.bonus } : {}),
        lignes: [],
      };
      groupes.set(cle, g);
    }
    // Nom propre d'un exemplaire (objet personnalisé) plutôt que celui de l'entrée
    if (e.genre === 'exemplaire') g.nom = e.nom;
    if (e.statut === 'inactif' && !g.raison) g.raison = raisonInactif(e);
    g.lignes.push({ e, libelle: libelleEffet(ctx.fiche, e), precision: precisionEffet(e) });
  }
  return [...groupes.values()];
}

const compte = (gs: GroupeSource[]) => ({
  actifs: gs.reduce((n, g) => n + g.lignes.filter((l) => l.e.statut === 'actif').length, 0),
  total: gs.reduce((n, g) => n + g.lignes.length, 0),
});

function EffectsBlock({ ctx, widget, mode }: SheetBlockProps<'bonus'>) {
  const { fiche } = ctx;
  const operations = mode === 'read' ? ctx.operations : undefined;
  const [ajout, setAjout] = useState(false);
  const [onglet, setOnglet] = useState<Onglet>('actifs');
  const [recherche, setRecherche] = useState('');
  const differee = useDeferredValue(recherche);
  const [ouverts, setOuverts] = useState<ReadonlySet<string>>(new Set());

  const groupes = useMemo(() => grouper(ctx, effetsDuPersonnage(fiche)), [ctx, fiche]);
  const { familles, profil } = useMemo(() => famillesDuSysteme(fiche), [fiche]);
  const onglets = useMemo(
    () => [
      {
        id: 'actifs' as Onglet,
        nom: 'Actifs',
        titre: 'Bonus appliqués en ce moment',
        ...compte(groupes),
      },
      ...familles.map((f) => ({
        id: f as Onglet,
        nom: ongletFamille(f, profil),
        titre: libelleFamille(f, profil),
        ...compte(groupes.filter((g) => g.famille === f)),
      })),
    ],
    [groupes, familles, profil],
  );

  /** Sources de l'onglet ; « Actifs » ne garde que les effets appliqués. */
  const sources = useMemo(() => {
    const q = plain(differee.trim());
    const dansOnglet =
      onglet === 'actifs'
        ? groupes
            .map((g) => ({ ...g, lignes: g.lignes.filter((l) => l.e.statut === 'actif') }))
            .filter((g) => g.lignes.length > 0)
        : groupes.filter((g) => g.famille === onglet);
    if (!q) return dansOnglet;
    return dansOnglet.filter((g) =>
      plain(
        [g.nom, g.sorte ?? '', g.bonus?.source ?? '', ...g.lignes.map((l) => l.libelle)].join(' '),
      ).includes(q),
    );
  }, [groupes, onglet, differee]);
  const nombreDansOnglet =
    onglet === 'actifs'
      ? groupes.filter((g) => g.lignes.some((l) => l.e.statut === 'actif')).length
      : groupes.filter((g) => g.famille === onglet).length;

  function basculerEffets(cles: string[], actif: boolean) {
    if (!operations?.effet || !cles.length) return;
    const apercu = apercuBascule(fiche, cles, actif);
    if (apercu) operations.effet(cles, actif, apercu);
  }

  function basculerBonus(b: BonusLibre) {
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

  function deplier(cle: string) {
    setOuverts((o) => {
      const n = new Set(o);
      if (!n.delete(cle)) n.add(cle);
      return n;
    });
  }

  const total = onglets[0]!;

  return (
    <Bloc
      titre={
        <span className="flex items-center gap-2">
          {widget.titre}
          {total.total > 0 && (
            <span className="font-mono text-xs font-normal tabular text-subtle">
              {total.actifs}/{total.total}
            </span>
          )}
        </span>
      }
    >
      <div
        id={ancreBonus(ctx.personnage.id)}
        tabIndex={-1}
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Tabs
          value={onglet}
          onValueChange={(v) => {
            setOnglet(v as Onglet);
            setRecherche('');
          }}
        >
          <TabsList
            variante="ligne"
            aria-label="Sources des bonus"
            className="h-8 gap-3 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
          >
            {onglets.map((o) => (
              <TabsTrigger key={o.id} value={o.id} title={o.titre} className="shrink-0 text-xs">
                {o.nom}
                <span className="font-mono text-[10px] font-normal tabular text-subtle">
                  {o.id === 'libres' || o.id === 'actifs' ? o.actifs : `${o.actifs}/${o.total}`}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {onglets.map((o) => (
            <TabsContent key={o.id} value={o.id} className="mt-2 space-y-2">
              {nombreDansOnglet > SEUIL_RECHERCHE && (
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-subtle"
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={recherche}
                    onChange={(ev) => setRecherche(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Escape' && recherche) {
                        ev.stopPropagation();
                        setRecherche('');
                      }
                    }}
                    placeholder="Rechercher…"
                    aria-label={`Rechercher dans ${o.titre}`}
                    className="h-7 w-full rounded-md border border-input bg-surface-2/60 pl-7 pr-7 text-xs text-foreground placeholder:text-subtle focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
                  />
                  {recherche && (
                    <button
                      type="button"
                      onClick={() => setRecherche('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                      aria-label="Effacer la recherche"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              )}

              {sources.length === 0 ? (
                <p className="py-4 text-center text-xs text-subtle">
                  {recherche
                    ? 'Aucun résultat.'
                    : o.id === 'actifs'
                      ? 'Aucun bonus appliqué en ce moment.'
                      : o.id === 'libres'
                        ? 'Aucun bonus libre.'
                        : 'Rien ici pour l’instant.'}
                </p>
              ) : (
                // Une douzaine de lignes, puis défilement : le bloc garde une hauteur raisonnable
                <ul className="max-h-96 overflow-y-auto [scrollbar-width:thin]">
                  {sources.map((g) => (
                    <Source
                      key={g.cle}
                      g={g}
                      ouvert={ouverts.has(g.cle)}
                      onDeplier={() => deplier(g.cle)}
                      ecriture={!!operations}
                      peutBasculer={!!operations?.effet}
                      onEffets={basculerEffets}
                      onBonus={basculerBonus}
                      onRetirer={retirer}
                    />
                  ))}
                </ul>
              )}

              {o.id === 'libres' && operations && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => setAjout(true)}
                >
                  <Plus />
                  Ajouter un bonus libre
                </Button>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
      {operations && <AjoutBonus ctx={ctx} ouvert={ajout} onOuvert={setAjout} />}
    </Bloc>
  );
}

/**
 * Une source sur une ligne (~32 px) : nom, effets en texte court, un interrupteur pour toute
 * la source. Dépliée, une ligne par effet avec son propre interrupteur.
 */
function Source({
  g,
  ouvert,
  onDeplier,
  ecriture,
  peutBasculer,
  onEffets,
  onBonus,
  onRetirer,
}: {
  g: GroupeSource;
  ouvert: boolean;
  onDeplier: () => void;
  ecriture: boolean;
  peutBasculer: boolean;
  onEffets: (cles: string[], actif: boolean) => void;
  onBonus: (b: BonusLibre) => void;
  onRetirer: (b: BonusLibre) => void;
}) {
  const b = g.bonus;
  const eteinte = g.raison !== null;
  const basculables = g.lignes.filter((l) => l.e.basculable).map((l) => l.e.cle);
  const coupes = g.lignes.filter((l) => l.e.statut === 'desactive').length;
  // Interrupteur de la source : allumé si au moins un effet n'est pas coupé
  const allume = b ? b.actif : coupes < g.lignes.length;
  const resume = g.lignes
    .filter((l) => l.e.statut !== 'desactive')
    .map((l) => l.libelle)
    .join(' · ');
  const meta = b
    ? [b.source, b.duree !== undefined ? `${b.duree} round(s)` : null].filter(Boolean).join(' · ')
    : null;
  const idDetail = `bonus-${g.cle.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  return (
    <li className="border-b border-border last:border-b-0">
      <div className="flex h-8 items-center gap-1.5">
        <button
          type="button"
          onClick={onDeplier}
          aria-expanded={ouvert}
          aria-controls={idDetail}
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-subtle transition-transform',
              ouvert && 'rotate-90',
            )}
            aria-hidden
          />
          <span
            className={cn(
              'min-w-0 max-w-[55%] shrink-0 truncate text-[13px] font-medium',
              eteinte || !allume ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {g.nom}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-subtle">
            {resume || (coupes ? `${coupes} désactivé${coupes > 1 ? 's' : ''}` : '')}
          </span>
          {g.raison && <span className="shrink-0 text-[11px] text-subtle">{g.raison}</span>}
        </button>
        {b ? (
          <>
            <Switch
              className="scale-90"
              checked={b.actif}
              disabled={!ecriture}
              onCheckedChange={() => onBonus(b)}
              aria-label={`${b.actif ? 'Désactiver' : 'Activer'} le bonus ${b.nom}`}
            />
            {ecriture && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onRetirer(b)}
                aria-label={`Retirer le bonus ${b.nom}`}
              >
                <Trash2 />
              </Button>
            )}
          </>
        ) : (
          basculables.length > 0 && (
            <Switch
              className="scale-90"
              checked={allume}
              disabled={!peutBasculer || eteinte}
              onCheckedChange={(v) => onEffets(basculables, v)}
              aria-label={`${allume ? 'Désactiver' : 'Activer'} les bonus de ${g.nom}${
                g.raison ? `, ${g.raison}` : ''
              }`}
            />
          )
        )}
      </div>
      {ouvert && (
        <ul id={idDetail} className="pb-1.5 pl-6">
          {meta && <li className="pb-0.5 text-[11px] text-subtle">{meta}</li>}
          {g.sorte && !b && <li className="pb-0.5 text-[11px] text-subtle">{g.sorte}</li>}
          {g.lignes.map(({ e, libelle, precision }) => {
            const coupe = e.statut === 'desactive';
            return (
              <li
                key={e.cle}
                className={cn(
                  'flex h-7 items-center gap-2',
                  e.statut === 'actif' ? 'text-foreground' : 'text-subtle',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    e.statut === 'actif' ? 'bg-primary' : 'bg-surface-3',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-xs">
                  <span className={cn(coupe && 'line-through')}>{libelle}</span>
                  {precision && <span className="text-[11px] text-subtle"> · {precision}</span>}
                  {coupe && <span className="text-[11px] text-subtle"> · désactivé</span>}
                </span>
                {e.basculable && (
                  <Switch
                    className="scale-75"
                    checked={!coupe}
                    disabled={!peutBasculer || eteinte}
                    onCheckedChange={(v) => onEffets([e.cle], v)}
                    aria-label={`${coupe ? 'Activer' : 'Désactiver'} ${libelle} (${g.nom})`}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
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
  label: 'Bonus',
  description:
    'Tous les bonus du personnage par source, activables un à un ; bonus libres à ajouter.',
  defaultSize: { w: 6, h: 6 },
  minSize: { w: 3, h: 4 },
  Component: EffectsBlock,
};

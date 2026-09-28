'use client';

/**
 * Onglet Bestiaire : modèles de PNJ de la campagne (MJ) et créatures de référence du
 * système, avec recherche, filtre par catégorie et fiche détaillée (statistiques déclarées
 * par le système, actions, description).
 */
import type { Presentation, SystemeCharge } from '@vtt/rules';
import { AlertTriangle, SearchX, Skull } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SelectField } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { messageErreur } from '@/lib/api';
import { useNpcTemplates, useSystemBestiary } from '@/lib/bestiary';
import { creatureItem, templateItem, type BestiaryItem } from '../model/bestiary';
import { normaliser } from '../model/catalogue';
import { CatalogueText, Chips, Notice, SearchField, Thumb, Toolbar } from '../parts';

type Source = 'campaign' | 'system';

const PAGE = 48;
const TOUTES = '';

export function BestiaryTab({
  systemId,
  systeme,
  presentation,
  campaignId,
  reference,
}: {
  systemId: string;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  /** Campagne dont le MJ consulte les modèles de PNJ ; null : pas de bestiaire de campagne. */
  campaignId: string | null;
  /** Le système a un bestiaire de référence. */
  reference: boolean;
}) {
  const templates = useNpcTemplates(campaignId, campaignId !== null);
  const creatures = useSystemBestiary(systemId, reference);
  const [source, setSource] = useState<Source>(campaignId ? 'campaign' : 'system');
  const [query, setQuery] = useState('');
  const recherche = useDeferredValue(query);
  const [category, setCategory] = useState(TOUTES);
  const [limite, setLimite] = useState(PAGE);
  const [ouverte, setOuverte] = useState<BestiaryItem | null>(null);

  const campagne = useMemo(
    () =>
      templates.data
        ? templates.data.templates
            .map((t) => templateItem(systeme, presentation, t, templates.data.categories))
            .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        : [],
    [templates.data, systeme, presentation],
  );
  const systemeItems = useMemo(
    () =>
      creatures.data
        ? creatures.data.creatures.map((c) => creatureItem(systeme, presentation, c))
        : [],
    [creatures.data, systeme, presentation],
  );
  const requete = source === 'campaign' ? templates : creatures;
  const items = source === 'campaign' ? campagne : systemeItems;
  const categories = useMemo(
    () =>
      [...new Set(items.map((i) => i.category).filter((c): c is string => c !== null))].sort(
        (a, b) => a.localeCompare(b, 'fr'),
      ),
    [items],
  );
  const filtres = useMemo(() => {
    const q = normaliser(recherche);
    return items.filter(
      (i) => (!q || i.text.includes(q)) && (!category || i.category === category),
    );
  }, [items, recherche, category]);

  const changerSource = (v: string) => {
    setSource(v as Source);
    setCategory(TOUTES);
    setLimite(PAGE);
  };

  return (
    <div>
      <Toolbar>
        {campaignId && reference ? (
          <Chips
            label="Source"
            value={source}
            onChange={changerSource}
            options={[
              {
                value: 'campaign',
                label: 'Modèles de la campagne',
                ...(templates.data ? { count: campagne.length } : {}),
              },
              {
                value: 'system',
                label: 'Bestiaire du système',
                ...(creatures.data ? { count: systemeItems.length } : {}),
              },
            ]}
          />
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {source === 'campaign'
              ? 'Les modèles de PNJ de la campagne, visibles du MJ seul.'
              : 'Créatures de référence du système.'}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {categories.length > 1 && (
            <SelectField
              value={category}
              onValueChange={(v) => {
                setCategory(v);
                setLimite(PAGE);
              }}
              aria-label="Filtrer par catégorie"
              className="h-9 sm:w-48"
              options={[
                { valeur: TOUTES, nom: 'Toutes les catégories' },
                ...categories.map((c) => ({ valeur: c, nom: c })),
              ]}
            />
          )}
          <SearchField
            value={query}
            onChange={(v) => {
              setQuery(v);
              setLimite(PAGE);
            }}
            label="Rechercher une créature"
            placeholder="Rechercher une créature…"
          />
        </div>
      </Toolbar>

      {requete.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : requete.isError ? (
        <Notice
          tone="error"
          icon={AlertTriangle}
          title="Bestiaire indisponible"
          description={messageErreur(requete.error, 'Réessayez dans un instant.')}
          action={
            <Button variant="secondary" size="sm" onClick={() => void requete.refetch()}>
              Réessayer
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <Notice
          icon={Skull}
          title={source === 'campaign' ? 'Aucun modèle de PNJ' : 'Bestiaire vide'}
          description={
            source === 'campaign'
              ? 'Les modèles de PNJ de la campagne apparaîtront ici.'
              : 'Ce système n’a pas encore de créatures de référence.'
          }
          action={
            source === 'campaign' && reference ? (
              <Button variant="secondary" size="sm" onClick={() => changerSource('system')}>
                Voir le bestiaire du système
              </Button>
            ) : undefined
          }
        />
      ) : filtres.length === 0 ? (
        <Notice
          icon={SearchX}
          title="Aucun résultat"
          description={recherche ? `Aucune créature ne correspond à « ${recherche} ».` : undefined}
        />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filtres.slice(0, limite).map((i) => (
              <li key={i.key}>
                <CreatureCard item={i} onOpen={() => setOuverte(i)} />
              </li>
            ))}
          </ul>
          {filtres.length > limite && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => setLimite((l) => l + PAGE)}>
                Afficher plus ({filtres.length - limite} restantes)
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={ouverte !== null} onOpenChange={(o) => !o && setOuverte(null)}>
        <DialogContent className="gap-0 p-0 sm:max-w-2xl">
          {ouverte && <CreatureSheet item={ouverte} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreatureCard({ item, onOpen }: { item: BestiaryItem; onOpen(): void }) {
  const cles = item.stats[0]?.items.slice(0, 3) ?? [];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-surface transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span className="relative grid aspect-[4/3] place-items-center overflow-hidden bg-surface-2">
        <Skull className="absolute size-8 text-subtle/60" aria-hidden />
        <Thumb
          src={item.image}
          alt=""
          className="relative size-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.03]"
          fallback={null}
        />
      </span>
      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="truncate text-[13px] font-semibold">{item.name}</span>
        {(item.subtitle ?? item.category) && (
          <span className="truncate text-xs text-muted-foreground">
            {item.subtitle ?? item.category}
          </span>
        )}
        {cles.length > 0 && (
          <span className="mt-auto flex flex-wrap gap-x-2.5 gap-y-0.5 pt-1 text-[11px] text-subtle">
            {cles.map((s) => (
              <span key={s.key}>
                {s.label} <span className="font-medium text-foreground">{s.value}</span>
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

/** Fiche d'une créature : en-tête, statistiques par groupe, description, actions. */
function CreatureSheet({ item }: { item: BestiaryItem }) {
  return (
    <article className="flex flex-col">
      <header className="flex gap-4 border-b border-border p-5 pr-12">
        {item.image && (
          <span className="size-24 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2 sm:size-28">
            <Thumb
              src={item.image}
              alt=""
              className="size-full object-contain p-1"
              fallback={null}
            />
          </span>
        )}
        <div className="min-w-0 space-y-1.5">
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>{item.subtitle ?? item.category ?? 'Créature'}</DialogDescription>
          <div className="flex flex-wrap gap-1.5">
            <Badge ton={item.source === 'campaign' ? 'primaire' : 'neutre'}>
              {item.source === 'campaign' ? 'Modèle de la campagne' : 'Référence du système'}
            </Badge>
            {item.category && item.subtitle && <Badge>{item.category}</Badge>}
          </div>
        </div>
      </header>
      <div className="space-y-5 p-5">
        {item.stats.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
              {g.title}
            </h4>
            <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {g.items.map((s) => (
                <div
                  key={s.key}
                  title={s.name}
                  className="rounded-lg border border-border bg-surface-2/50 px-2 py-1.5 text-center"
                >
                  <dt className="truncate text-[10px] font-medium uppercase tracking-wide text-subtle">
                    {s.label}
                  </dt>
                  <dd className="text-[15px] font-semibold tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        {item.source === 'campaign' && item.stats.length === 0 && (
          <p className="text-[13px] text-muted-foreground">
            Statistiques illisibles avec les règles de cette campagne.
          </p>
        )}
        {item.description && <CatalogueText text={item.description} />}
        {item.actions.length > 0 && (
          <section aria-label="Actions">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
              Actions
            </h4>
            <ul className="space-y-3">
              {item.actions.map((a, i) => (
                <li key={i} className="text-[13px] leading-relaxed">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{a.name}</span>
                    {a.toHit !== null && (
                      <Badge ton="primaire">
                        {a.toHit >= 0 ? `+${a.toHit}` : `−${Math.abs(a.toHit)}`} pour toucher
                      </Badge>
                    )}
                  </p>
                  {a.description && (
                    <CatalogueText text={a.description} className="mt-0.5 text-muted-foreground" />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}

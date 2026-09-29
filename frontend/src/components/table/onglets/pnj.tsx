'use client';

/**
 * « Mes PNJ » (MJ, U) : les modèles de PNJ de la campagne, comme l'ancien gestionnaire de PNJ.
 * On les crée et les range ici (catégories), puis on les pose sur la carte (bibliothèque des
 * personnages, A) : chaque PNJ posé est une instance du modèle, qui reste.
 *
 * - Recherche, catégories en pastilles, gestion des catégories (ajouter, renommer, supprimer :
 *   ses modèles restent, sans catégorie).
 * - Carte d'un modèle : portrait, nom, type, statistiques de la présentation du système ; clic :
 *   modifier ; menu : dupliquer, changer de catégorie, supprimer (les PNJ déjà posés restent).
 */
import type { SystemeCharge } from '@vtt/rules';
import {
  AlertTriangle,
  Copy,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Plus,
  Skull,
  Tags,
  Trash2,
  UserRoundPlus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { NpcForm, type NpcFormResult } from '@/components/personnages/npc-form';
import { templateItem } from '@/components/resources/model/bestiary';
import { normaliser } from '@/components/resources/model/catalogue';
import { Chips, ListSkeleton, Notice, SearchField, Thumb } from '@/components/resources/parts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { messageErreur } from '@/lib/api';
import {
  npcTemplatesApi,
  useNpcTemplates,
  useRefreshNpcTemplates,
  type NpcTemplate,
  type NpcTemplateCategory,
} from '@/lib/bestiary';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { cn } from '@/lib/utils';
import { useTable } from '../contexte';

const ALL = '__all';
const NONE = '__none';

type Editing = { mode: 'new' } | { mode: 'edit'; template: NpcTemplate };

export function OngletPnj() {
  const { campagne } = useTable();
  const sys = useCampaignSystem(campagne.system, campagne.id);
  const templates = useNpcTemplates(campagne.id);
  const refresh = useRefreshNpcTemplates(campagne.id);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useMemo(() => templates.data?.categories ?? [], [templates.data]);
  const cards = useMemo(() => {
    const rules = sys.data;
    if (!rules || !templates.data) return [];
    return templates.data.templates
      .map((t) => ({
        template: t,
        item: templateItem(rules.systeme, rules.presentation, t, categories),
      }))
      .sort((a, b) => a.template.name.localeCompare(b.template.name, 'fr'));
  }, [sys.data, templates.data, categories]);

  const q = normaliser(query);
  const shown = cards.filter(
    (c) =>
      (!q || c.item.text.includes(q)) &&
      (category === ALL ||
        (category === NONE ? !c.template.categoryId : c.template.categoryId === category)),
  );
  const withoutCategory = cards.some((c) => !c.template.categoryId);

  const run = async (label: string, work: () => Promise<unknown>, done?: string) => {
    try {
      await work();
      refresh();
      if (done) toast.success(done);
      return true;
    } catch (err) {
      toast.error(label, { description: messageErreur(err) });
      return false;
    }
  };

  const save = async (r: NpcFormResult) => {
    if (!editing) return;
    setBusy(true);
    const valeurs = Object.keys(r.valeurs).length ? { valeurs: r.valeurs } : {};
    const ok =
      editing.mode === 'new'
        ? await run(
            'Le PNJ n’a pas pu être créé',
            () =>
              npcTemplatesApi.create(campagne.id, {
                name: r.name,
                categoryId: r.categoryId,
                imageUrl: r.imageUrl,
                systemeId: campagne.system,
                type: r.type,
                ...valeurs,
              }),
            `« ${r.name} » ajouté à vos PNJ`,
          )
        : await run('Le PNJ n’a pas pu être modifié', () =>
            npcTemplatesApi.update(campagne.id, editing.template.id, editing.template.version, {
              name: r.name,
              categoryId: r.categoryId,
              imageUrl: r.imageUrl,
              ...valeurs,
            }),
          );
    setBusy(false);
    if (ok) setEditing(null);
  };

  // Copie complète de l'état (un modèle à l'état illisible ne se duplique pas)
  const duplicate = (t: NpcTemplate) => {
    const etat = t.etat;
    if (!etat) return;
    void run(
      'Le PNJ n’a pas pu être dupliqué',
      () =>
        npcTemplatesApi.create(campagne.id, {
          name: `${t.name} (copie)`.slice(0, 100),
          categoryId: t.categoryId,
          imageUrl: t.imageUrl,
          tokenUrl: t.tokenUrl,
          etat,
        }),
      `« ${t.name} » dupliqué`,
    );
  };

  const remove = (t: NpcTemplate) =>
    void run(
      'Le PNJ n’a pas pu être supprimé',
      () => npcTemplatesApi.remove(campagne.id, t.id),
      `« ${t.name} » supprimé de vos PNJ`,
    );

  const move = (t: NpcTemplate, categoryId: string | null) =>
    void run('Le PNJ n’a pas pu être rangé', () =>
      npcTemplatesApi.update(campagne.id, t.id, t.version, { categoryId }),
    );

  if (sys.isPending || templates.isPending)
    return (
      <div className="px-4 py-5 sm:px-6">
        <ListSkeleton />
      </div>
    );
  if (sys.isError || templates.isError || !sys.data)
    return (
      <div className="px-4 py-5 sm:px-6">
        <Notice
          tone="error"
          icon={AlertTriangle}
          title="PNJ indisponibles"
          description={messageErreur(templates.error ?? sys.error, 'Réessayez dans un instant.')}
          action={
            <Button variant="secondary" size="sm" onClick={() => void templates.refetch()}>
              Réessayer
            </Button>
          }
        />
      </div>
    );

  return (
    <div className="space-y-4 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={query}
          onChange={setQuery}
          label="Rechercher un PNJ"
          placeholder="Rechercher un PNJ…"
          className="sm:w-64"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <CategoryManager campaignId={campagne.id} categories={categories} onChanged={refresh} />
          <Button size="sm" onClick={() => setEditing({ mode: 'new' })}>
            <Plus />
            Nouveau PNJ
          </Button>
        </div>
      </div>

      {categories.length > 0 && (
        <Chips
          label="Catégories"
          value={category}
          onChange={setCategory}
          options={[
            { value: ALL, label: 'Tous', count: cards.length },
            ...categories.map((c) => ({
              value: c.id,
              label: c.name,
              count: cards.filter((x) => x.template.categoryId === c.id).length,
            })),
            ...(withoutCategory
              ? [
                  {
                    value: NONE,
                    label: 'Sans catégorie',
                    count: cards.filter((x) => !x.template.categoryId).length,
                  },
                ]
              : []),
          ]}
        />
      )}

      {!cards.length ? (
        <Notice
          icon={Skull}
          title="Pas encore de PNJ"
          description="Créez vos PNJ ici, rangez-les par catégories, puis posez-les sur la carte depuis la bibliothèque des personnages (A). Chacun reste un modèle, à poser autant de fois qu’il le faut."
          action={
            <Button size="sm" onClick={() => setEditing({ mode: 'new' })}>
              <Plus />
              Nouveau PNJ
            </Button>
          }
        />
      ) : !shown.length ? (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-muted-foreground">
          Aucun PNJ ne correspond.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2.5">
          {shown.map(({ template: t, item }) => (
            <li key={t.id}>
              <TemplateCard
                template={t}
                name={item.name}
                subtitle={item.subtitle}
                category={item.category}
                image={item.image}
                stats={item.stats.flatMap((g) => g.items).slice(0, 4)}
                categories={categories}
                onEdit={() => setEditing({ mode: 'edit', template: t })}
                onDuplicate={() => duplicate(t)}
                onMove={(categoryId) => move(t, categoryId)}
                onDelete={() => remove(t)}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !busy && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing?.mode === 'edit' ? `Modifier « ${editing.template.name} »` : 'Nouveau PNJ'}
            </DialogTitle>
            <DialogDescription>
              {editing?.mode === 'edit'
                ? 'Les PNJ déjà posés gardent leur fiche ; les prochains suivront ce modèle.'
                : 'Un modèle à poser sur la carte autant de fois qu’il le faut (bibliothèque, A).'}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <EditorForm
              key={editing.mode === 'edit' ? editing.template.id : 'new'}
              campaignId={campagne.id}
              systeme={sys.data.systeme}
              presentation={sys.data.presentation}
              categories={categories}
              editing={editing}
              defaultCategory={category !== ALL && category !== NONE ? category : null}
              busy={busy}
              onSubmit={(r) => void save(r)}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditorForm({
  campaignId,
  systeme,
  presentation,
  categories,
  editing,
  defaultCategory,
  busy,
  onSubmit,
  onCancel,
}: {
  campaignId: string;
  systeme: SystemeCharge;
  presentation: Parameters<typeof NpcForm>[0]['presentation'];
  categories: readonly NpcTemplateCategory[];
  editing: Editing;
  defaultCategory: string | null;
  busy: boolean;
  onSubmit(r: NpcFormResult): void;
  onCancel(): void;
}) {
  const t = editing.mode === 'edit' ? editing.template : null;
  return (
    <NpcForm
      campaignId={campaignId}
      systeme={systeme}
      presentation={presentation}
      categories={categories}
      initial={
        t
          ? { name: t.name, imageUrl: t.imageUrl, categoryId: t.categoryId, etat: t.etat }
          : undefined
      }
      defaultCategoryId={defaultCategory}
      columns={3}
      submitLabel={t ? 'Enregistrer' : 'Créer le PNJ'}
      submitIcon={t ? <Pencil /> : <UserRoundPlus />}
      busy={busy}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}

function TemplateCard({
  template: t,
  name,
  subtitle,
  category,
  image,
  stats,
  categories,
  onEdit,
  onDuplicate,
  onMove,
  onDelete,
}: {
  template: NpcTemplate;
  name: string;
  subtitle: string | null;
  category: string | null;
  image: string | null;
  stats: { key: string; label: string; name: string; value: string }[];
  categories: readonly NpcTemplateCategory[];
  onEdit(): void;
  onDuplicate(): void;
  onMove(categoryId: string | null): void;
  onDelete(): void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="group relative flex gap-3 rounded-xl border border-border bg-surface p-2.5 transition-colors hover:border-border-strong">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Modifier ${name}`}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      />
      <Thumb
        src={image}
        alt=""
        className="size-14 shrink-0 rounded-lg bg-surface-2 object-cover object-top"
        fallback={
          <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-surface-2 text-subtle">
            <Skull className="size-6" aria-hidden />
          </span>
        }
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[subtitle, category].filter(Boolean).join(' · ') || 'Sans catégorie'}
        </p>
        {stats.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
            {stats.map((s) => (
              <span key={s.key} title={s.name}>
                {s.label}{' '}
                <span className="font-semibold tabular-nums text-foreground">{s.value}</span>
              </span>
            ))}
          </p>
        )}
      </div>
      <DropdownMenu onOpenChange={(open) => !open && setConfirm(false)}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions pour ${name}`}
            className="relative z-10 shrink-0 self-start"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!t.etat} onSelect={onDuplicate}>
            <Copy />
            Dupliquer
          </DropdownMenuItem>
          {categories.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput />
                Ranger dans
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                <DropdownMenuItem disabled={!t.categoryId} onSelect={() => onMove(null)}>
                  Sans catégorie
                </DropdownMenuItem>
                {categories.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    disabled={t.categoryId === c.id}
                    onSelect={() => onMove(c.id)}
                  >
                    {c.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              if (!confirm) {
                e.preventDefault();
                setConfirm(true);
                return;
              }
              onDelete();
            }}
          >
            <Trash2 />
            {confirm ? 'Confirmer la suppression' : 'Supprimer'}
          </DropdownMenuItem>
          {confirm && (
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              Les PNJ déjà posés sur la carte restent.
            </DropdownMenuLabel>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Catégories : ajouter, renommer, supprimer (leurs modèles restent, sans catégorie). */
function CategoryManager({
  campaignId,
  categories,
  onChanged,
}: {
  campaignId: string;
  categories: readonly NpcTemplateCategory[];
  onChanged(): void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (label: string, work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      onChanged();
      return true;
    } catch (err) {
      toast.error(label, { description: messageErreur(err) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    const n = name.trim();
    if (!n) return;
    if (
      await act('La catégorie n’a pas pu être créée', () =>
        npcTemplatesApi.createCategory(campaignId, n),
      )
    )
      setName('');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          <Tags />
          Catégories
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="mb-2 text-sm font-semibold">Catégories</p>
        {categories.length ? (
          <ul className="mb-3 space-y-1">
            {categories.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                disabled={busy}
                onRename={(n) =>
                  void act('La catégorie n’a pas pu être renommée', () =>
                    npcTemplatesApi.renameCategory(campaignId, c.id, c.version, n),
                  )
                }
                onDelete={() =>
                  void act('La catégorie n’a pas pu être supprimée', () =>
                    npcTemplatesApi.removeCategory(campaignId, c.id),
                  )
                }
              />
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">
            Rangez vos PNJ : bandits, gardes, marchands…
          </p>
        )}
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            value={name}
            maxLength={100}
            placeholder="Nouvelle catégorie"
            aria-label="Nom de la nouvelle catégorie"
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-[13px]"
          />
          <Button
            type="submit"
            size="icon-sm"
            aria-label="Ajouter la catégorie"
            disabled={busy || !name.trim()}
          >
            <Plus />
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function CategoryRow({
  category: c,
  disabled,
  onRename,
  onDelete,
}: {
  category: NpcTemplateCategory;
  disabled: boolean;
  onRename(name: string): void;
  onDelete(): void;
}) {
  const [draft, setDraft] = useState(c.name);
  const [confirm, setConfirm] = useState(false);
  const commit = () => {
    const n = draft.trim();
    if (n && n !== c.name) onRename(n);
    else setDraft(c.name);
  };
  return (
    <li className="flex items-center gap-1">
      <Input
        value={draft}
        maxLength={100}
        aria-label={`Nom de la catégorie ${c.name}`}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(c.name);
        }}
        className="h-8 text-[13px]"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        aria-label={confirm ? `Confirmer la suppression de ${c.name}` : `Supprimer ${c.name}`}
        title={confirm ? 'Cliquer encore : ses PNJ restent, sans catégorie' : undefined}
        onClick={() => (confirm ? onDelete() : setConfirm(true))}
        onBlur={() => setConfirm(false)}
        className={cn('shrink-0', confirm && 'bg-destructive/10 text-destructive')}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

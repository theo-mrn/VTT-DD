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
import { compareText } from '@/i18n/runtime';
import { useTranslations } from 'next-intl';
import type { Presentation, SystemeCharge } from '@vtt/rules';
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
import { NpcForm, type NpcFormPreset, type NpcFormResult } from '@/components/personnages/npc-form';
import { NpcGenerator } from '@/components/personnages/npc-generator/npc-generator';
import { templateItem, type BestiaryItem } from '@/components/resources/model/bestiary';
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

/**
 * Carte d'un modèle, calculée par les règles (fiche du modèle comprise) une fois par modèle :
 * le modèle garde son identité tant qu'il ne change pas (partage structurel de TanStack
 * Query), la carte est refaite seulement si lui, les règles ou les catégories changent.
 */
const cartes = new WeakMap<
  NpcTemplate,
  {
    systeme: SystemeCharge;
    presentation: Presentation | null;
    categories: readonly NpcTemplateCategory[];
    item: BestiaryItem;
  }
>();
function carteDe(
  systeme: SystemeCharge,
  presentation: Presentation | null,
  t: NpcTemplate,
  categories: readonly NpcTemplateCategory[],
): BestiaryItem {
  const connue = cartes.get(t);
  if (
    connue &&
    connue.systeme === systeme &&
    connue.presentation === presentation &&
    connue.categories === categories
  )
    return connue.item;
  const item = templateItem(systeme, presentation, t, categories);
  cartes.set(t, { systeme, presentation, categories, item });
  return item;
}

export function OngletPnj() {
  const t = useTranslations('table.npcs');
  const { campagne } = useTable();
  const sys = useCampaignSystem(campagne.system, campagne.id);
  const templates = useNpcTemplates(campagne.id);
  const refresh = useRefreshNpcTemplates(campagne.id);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  /** Dernier tirage du générateur (nouveau PNJ) ; `n` remonte le formulaire à chaque tirage. */
  const [tirage, setTirage] = useState<{ n: number; preset: NpcFormPreset } | null>(null);

  const categories = useMemo(() => templates.data?.categories ?? [], [templates.data]);
  const cards = useMemo(() => {
    const rules = sys.data;
    if (!rules || !templates.data) return [];
    return templates.data.templates
      .map((t) => ({
        template: t,
        item: carteDe(rules.systeme, rules.presentation, t, categories),
      }))
      .sort((a, b) => compareText(a.template.name, b.template.name));
  }, [sys.data, templates.data, categories]);

  const q = normaliser(query);
  const shown = useMemo(
    () =>
      cards.filter(
        (c) =>
          (!q || c.item.text.includes(q)) &&
          (category === ALL ||
            (category === NONE ? !c.template.categoryId : c.template.categoryId === category)),
      ),
    [cards, q, category],
  );
  // Modèles par catégorie (clé vide : sans catégorie), comptés une fois
  const counts = useMemo(() => {
    const n = new Map<string, number>();
    for (const c of cards) {
      const id = c.template.categoryId ?? '';
      n.set(id, (n.get(id) ?? 0) + 1);
    }
    return n;
  }, [cards]);
  const withoutCategory = (counts.get('') ?? 0) > 0;

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
            t('createFailed'),
            () =>
              npcTemplatesApi.create(campagne.id, {
                name: r.name,
                categoryId: r.categoryId,
                imageUrl: r.imageUrl,
                systemeId: campagne.system,
                type: r.type,
                ...(r.bestiaryKey ? { bestiary: { key: r.bestiaryKey } } : {}),
                ...valeurs,
              }),
            t('created', { name: r.name }),
          )
        : await run(t('updateFailed'), () =>
            npcTemplatesApi.update(campagne.id, editing.template.id, editing.template.version, {
              name: r.name,
              categoryId: r.categoryId,
              imageUrl: r.imageUrl,
              ...valeurs,
            }),
          );
    setBusy(false);
    if (ok) fermer();
  };

  const ouvrirNouveau = () => {
    setTirage(null);
    setEditing({ mode: 'new' });
  };
  const fermer = () => {
    setEditing(null);
    setTirage(null);
  };

  // Copie complète de l'état (un modèle à l'état illisible ne se duplique pas)
  const duplicate = (m: NpcTemplate) => {
    const etat = m.etat;
    if (!etat) return;
    void run(
      t('duplicateFailed'),
      () =>
        npcTemplatesApi.create(campagne.id, {
          name: t('copySuffix', { name: m.name }).slice(0, 100),
          categoryId: m.categoryId,
          imageUrl: m.imageUrl,
          tokenUrl: m.tokenUrl,
          etat,
        }),
      t('duplicated', { name: m.name }),
    );
  };

  const remove = (m: NpcTemplate) =>
    void run(
      t('deleteFailed'),
      () => npcTemplatesApi.remove(campagne.id, m.id),
      t('deleted', { name: m.name }),
    );

  const move = (m: NpcTemplate, categoryId: string | null) =>
    void run(t('moveFailed'), () =>
      npcTemplatesApi.update(campagne.id, m.id, m.version, { categoryId }),
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
          title={t('unavailable')}
          description={messageErreur(templates.error ?? sys.error, t('tryAgainSoon'))}
          action={
            <Button variant="secondary" size="sm" onClick={() => void templates.refetch()}>
              {t('retry')}
            </Button>
          }
        />
      </div>
    );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={query}
          onChange={setQuery}
          label={t('search')}
          placeholder={t('searchPlaceholder')}
          className="sm:w-64"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <CategoryManager campaignId={campagne.id} categories={categories} onChanged={refresh} />
          <Button size="sm" onClick={ouvrirNouveau}>
            <Plus />
            {t('newNpc')}
          </Button>
        </div>
      </div>

      {categories.length > 0 && (
        <Chips
          label={t('categories')}
          value={category}
          onChange={setCategory}
          options={[
            { value: ALL, label: t('all'), count: cards.length },
            ...categories.map((c) => ({
              value: c.id,
              label: c.name,
              count: counts.get(c.id) ?? 0,
            })),
            ...(withoutCategory
              ? [
                  {
                    value: NONE,
                    label: t('noCategory'),
                    count: counts.get('') ?? 0,
                  },
                ]
              : []),
          ]}
        />
      )}

      {!cards.length && (
        <Notice
          icon={Skull}
          title={t('empty')}
          description={t('emptyText')}
          action={
            <Button size="sm" onClick={ouvrirNouveau}>
              <Plus />
              {t('newNpc')}
            </Button>
          }
        />
      )}
      {cards.length > 0 && !shown.length && (
        <p className="rounded-2xl bg-surface-2/40 px-4 py-8 text-center text-[13px] text-muted-foreground">
          {t('noMatch')}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4">
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

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !busy && fermer()}>
        <DialogContent
          className={cn(
            'max-h-[calc(100dvh-2rem)] overflow-y-auto',
            editing?.mode === 'new' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {editing?.mode === 'edit'
                ? t('editTitle', { name: editing.template.name })
                : t('newNpc')}
            </DialogTitle>
            <DialogDescription>
              {editing?.mode === 'edit' ? t('editText') : t('newText')}
            </DialogDescription>
          </DialogHeader>
          {editing?.mode === 'new' && (
            <NpcGenerator
              systemId={campagne.system}
              systeme={sys.data.systeme}
              presentation={sys.data.presentation}
              onRoll={(preset) => setTirage((x) => ({ n: (x?.n ?? 0) + 1, preset }))}
            />
          )}
          {editing && (
            <EditorForm
              key={editing.mode === 'edit' ? editing.template.id : `new-${tirage?.n ?? 0}`}
              preset={tirage?.preset}
              campaignId={campagne.id}
              systeme={sys.data.systeme}
              presentation={sys.data.presentation}
              categories={categories}
              editing={editing}
              defaultCategory={category !== ALL && category !== NONE ? category : null}
              busy={busy}
              onSubmit={(r) => void save(r)}
              onCancel={fermer}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditorForm({
  preset,
  campaignId,
  systeme,
  presentation,
  categories,
  editing,
  defaultCategory,
  busy,
  onSubmit,
  onCancel,
}: Readonly<{
  preset?: NpcFormPreset;
  campaignId: string;
  systeme: SystemeCharge;
  presentation: Parameters<typeof NpcForm>[0]['presentation'];
  categories: readonly NpcTemplateCategory[];
  editing: Editing;
  defaultCategory: string | null;
  busy: boolean;
  onSubmit(r: NpcFormResult): void;
  onCancel(): void;
}>) {
  const tr = useTranslations('table.npcs');
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
      preset={preset}
      defaultCategoryId={defaultCategory}
      columns={3}
      submitLabel={t ? tr('save') : tr('create')}
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
}: Readonly<{
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
}>) {
  const tr = useTranslations('table.npcs');
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-elevated">
      <button
        type="button"
        onClick={onEdit}
        aria-label={tr('editOf', { name })}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      />
      <div className="pointer-events-none relative aspect-[4/3] overflow-hidden bg-[radial-gradient(circle_at_50%_35%,hsl(var(--surface-3)),hsl(var(--surface-2))_75%)]">
        <Skull
          className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-subtle/50"
          aria-hidden
        />
        <Thumb
          src={image}
          width={240}
          alt=""
          className="relative size-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.04]"
          fallback={null}
        />
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent"
        />
      </div>
      <div className="pointer-events-none relative -mt-3 flex flex-1 flex-col gap-0.5 px-3 pb-3">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[subtitle, category].filter(Boolean).join(' · ') || tr('noCategory')}
        </p>
        {stats.length > 0 && (
          <p className="mt-auto flex flex-wrap gap-1 pt-2">
            {stats.map((s) => (
              <span
                key={s.key}
                title={s.name}
                className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
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
            aria-label={tr('actionsFor', { name })}
            className="absolute right-2 top-2 z-10 bg-black/45 text-white/90 opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/65 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil />
            {tr('edit')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!t.etat} onSelect={onDuplicate}>
            <Copy />
            {tr('duplicate')}
          </DropdownMenuItem>
          {categories.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput />
                {tr('moveTo')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                <DropdownMenuItem disabled={!t.categoryId} onSelect={() => onMove(null)}>
                  {tr('noCategory')}
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
            {confirm ? tr('confirmDelete') : tr('delete')}
          </DropdownMenuItem>
          {confirm && (
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
              {tr('placedStay')}
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
}: Readonly<{
  campaignId: string;
  categories: readonly NpcTemplateCategory[];
  onChanged(): void;
}>) {
  const t = useTranslations('table.npcs');
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
    if (await act(t('categoryCreateFailed'), () => npcTemplatesApi.createCategory(campaignId, n)))
      setName('');
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          <Tags />
          {t('categories')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <p className="mb-2 text-sm font-semibold">{t('categories')}</p>
        {categories.length ? (
          <ul className="mb-3 space-y-1">
            {categories.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                disabled={busy}
                onRename={(n) =>
                  void act(t('categoryRenameFailed'), () =>
                    npcTemplatesApi.renameCategory(campaignId, c.id, c.version, n),
                  )
                }
                onDelete={() =>
                  void act(t('categoryDeleteFailed'), () =>
                    npcTemplatesApi.removeCategory(campaignId, c.id),
                  )
                }
              />
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">{t('categoriesHint')}</p>
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
            placeholder={t('newCategory')}
            aria-label={t('newCategoryName')}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-[13px]"
          />
          <Button
            type="submit"
            size="icon-sm"
            aria-label={t('addCategory')}
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
}: Readonly<{
  category: NpcTemplateCategory;
  disabled: boolean;
  onRename(name: string): void;
  onDelete(): void;
}>) {
  const t = useTranslations('table.npcs');
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
        aria-label={t('categoryName', { name: c.name })}
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
        aria-label={
          confirm ? t('confirmDeleteOf', { name: c.name }) : t('deleteOf', { name: c.name })
        }
        title={confirm ? t('clickAgain') : undefined}
        onClick={() => (confirm ? onDelete() : setConfirm(true))}
        onBlur={() => setConfirm(false)}
        className={cn('shrink-0', confirm && 'bg-destructive/10 text-destructive')}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

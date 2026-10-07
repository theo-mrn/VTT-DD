'use client';

import { useTranslations } from 'next-intl';
import type { Translator } from '@/i18n/text';
import { calculer } from '@vtt/rules';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Crown,
  DoorOpen,
  Eye,
  Hammer,
  Plus,
  TriangleAlert,
  UserPlus,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useNomSysteme } from '@/components/campagnes/carte-campagne';
import { Illustration } from '@/components/commun/illustration';
import { EnTetePage, EtatVide, TitreSection } from '@/components/commun/page';
import { JaugeRessource, TuileAttribut } from '@/components/creation/apercu-fiche';
import { EnTeteFocus } from '@/components/shell/cadre-focus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { messageErreur } from '@/lib/api';
import { useCampagne, type Membre } from '@/lib/campagnes';
import { widgetsFiche } from '@/lib/creation';
import {
  useCampaignPlayerCharacters,
  useJouerPersonnage,
  usePersonnage,
  usePersonnages,
  type Personnage,
} from '@/lib/personnages';
import { useSynchroCampagne } from '@/lib/realtime-sync';
import { useProfil } from '@/lib/session';
import { useSysteme } from '@/lib/systemes';
import { cn } from '@/lib/utils';

/** Valeur de l'option « maître du jeu » (les personnages ont des UUID). */
const GM_OPTION = 'gm';

/** Un personnage proposé, avec ce que l'écran en dit. */
interface CharacterOption {
  character: Personnage;
  /** Hors de la campagne : il y sera engagé en entrant à la table. */
  free: boolean;
  /** Je l'ai créé : moi seul reprends sa création. */
  mine: boolean;
  /** Membre qui l'incarne en ce moment (moi compris). */
  playedBy: Membre | null;
  /** Un autre membre l'incarne : le choisir le lui reprend. */
  takenFrom: Membre | null;
  /** Création en cours d'un autre joueur : lui seul la termine. */
  selectable: boolean;
}

/**
 * Choix du personnage incarné dans une campagne, avant d'aller à la table.
 * Un seul personnage actif, pas de possession : une seule liste des personnages
 * joueurs de la campagne (filtre `kind` du service), chacun avec qui l'incarne
 * en ce moment, sans verrou (en choisir un déjà incarné le reprend à son
 * joueur). Qui l'incarne modifie sa fiche avec le MJ ; les autres la lisent.
 * À part, « Amener un personnage existant » engage un de mes personnages hors
 * campagne du même système. Le MJ peut aussi entrer en maître du jeu ; une
 * création pas terminée se reprend dans l'assistant.
 */
export function CharacterPicker({ campaignId }: { campaignId: string }) {
  const t = useTranslations();
  const profile = useProfil();
  const router = useRouter();
  const campaign = useCampagne(campaignId);
  const pcs = useCampaignPlayerCharacters(campaignId);
  const mine = usePersonnages();
  const play = useJouerPersonnage(campaignId);
  // Un personnage pris ou libéré par un autre joueur se voit tout de suite
  useSynchroCampagne(campaignId);
  const systemName = useNomSysteme(campaign.data?.system);
  const [picked, setPicked] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Personnages à amener : repliés, sauf s'il n'y a encore aucun personnage joueur
  const [bringOpen, setBringOpen] = useState<boolean | null>(null);

  const c = campaign.data;
  const me = c?.members.find((m) => m.userId === profile.id) ?? null;

  const options = useMemo(() => {
    if (!c || !pcs.data || !mine.data) return null;
    const players = new Map(c.members.filter((m) => m.characterId).map((m) => [m.characterId!, m]));
    const engaged = new Set(pcs.data.map((p) => p.id));
    const option = (p: Personnage, free: boolean): CharacterOption => {
      const isMine = p.ownerId === profile.id;
      const playedBy = players.get(p.id) ?? null;
      return {
        character: p,
        free,
        mine: isMine,
        playedBy,
        takenFrom: playedBy && playedBy.userId !== profile.id ? playedBy : null,
        selectable: isMine || !p.inCreation,
      };
    };
    return {
      pcs: pcs.data.map((p) => option(p, false)),
      bring: mine.data
        .filter((p) => p.roomId === null && p.system.id === c.system && !engaged.has(p.id))
        .map((p) => option(p, true)),
    };
  }, [c, pcs.data, mine.data, profile.id]);

  const back = `/campagnes/${campaignId}`;
  const shell = (content: ReactNode) => (
    <div data-ambiance={c?.ambiance} className="min-h-dvh bg-background">
      <EnTeteFocus quitter={{ href: back }} libelleQuitter={t('table.scene.backToLobby')} />
      {content}
    </div>
  );

  if (campaign.isLoading) return shell(<PickerSkeleton />);
  if (!c)
    return shell(
      <div className="mx-auto max-w-xl px-4 py-16">
        <EtatVide
          icone={DoorOpen}
          titre={t('characters.picker.notFound')}
          description={t('characters.picker.notFoundHint')}
          action={
            <Button asChild variant="secondary">
              <Link href="/campagnes">{t('characters.picker.backToCampaigns')}</Link>
            </Button>
          }
        />
      </div>,
    );

  const role = c.role;
  const canCreate = canCreateIn(role, c.freeCreation);
  const createHref = `/personnages/nouveau?${new URLSearchParams({ campagne: campaignId })}`;
  const heading = (actions?: ReactNode) => (
    <EnTetePage
      surtitre={[c.name, systemName].filter(Boolean).join(' · ')}
      titre={t('characters.picker.title')}
      description={t('characters.picker.lead')}
      actions={actions}
    />
  );

  if (role === 'spectator')
    return shell(
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {heading()}
        <EtatVide
          icone={Eye}
          titre={t('characters.picker.spectator')}
          description={t('characters.picker.spectatorHint')}
          action={
            <Button asChild>
              <Link href={`/campagnes/${campaignId}/table`}>
                {t('characters.picker.enterTable')}
                <ArrowRight />
              </Link>
            </Button>
          }
        />
      </div>,
    );

  const loadError = pcs.error ?? mine.error;
  if (loadError)
    return shell(
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {heading()}
        <EtatVide
          icone={TriangleAlert}
          titre={t('characters.picker.loadFailed')}
          description={messageErreur(loadError)}
          action={
            <>
              <Button variant="secondary" onClick={() => void pcs.refetch()}>
                {t('common.actions.retry')}
              </Button>
              <Button asChild variant="ghost">
                <Link href={back}>{t('table.scene.backToLobby')}</Link>
              </Button>
            </>
          }
        />
      </div>,
    );

  if (!options) return shell(<PickerSkeleton />);

  const all = [...options.pcs, ...options.bring];

  // Aucun personnage joueur : seule l'invitation à créer le sien (le MJ garde son entrée)
  if (all.length === 0 && role !== 'gm')
    return shell(
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {heading()}
        <EtatVide
          icone={UserRound}
          titre={t('characters.picker.noCharacters')}
          description={
            canCreate ? t('characters.picker.createToJoin') : t('characters.picker.noCreation')
          }
          action={canCreate ? <CreateButton href={createHref} primary /> : undefined}
        />
      </div>,
    );

  // Sélection par défaut : ce que j'incarne déjà (le MJ sans personnage : maître du jeu)
  const current = currentValue(me, role);
  const played = options.pcs.find((o) => o.character.id === me?.characterId) ?? null;
  const showBring = bringOpen ?? options.pcs.length === 0;
  const selected = selectedOption(picked ?? current, role, all);

  async function enter(target: Choice) {
    const p = target === GM_OPTION ? null : target.character;
    // Création pas terminée : on la reprend là où elle s'est arrêtée
    if (p?.inCreation) {
      router.push(
        `/personnages/nouveau?${new URLSearchParams({ campagne: campaignId, personnage: p.id })}`,
      );
      return;
    }
    setSending(true);
    try {
      // Un personnage libre est d'abord engagé dans la campagne, puis incarné
      await play.mutateAsync(p);
      toast.success(p ? `Vous incarnez ${p.name}` : t('characters.picker.asGm'));
      router.push(`/campagnes/${campaignId}/table`);
    } catch (err) {
      toast.error(messageErreur(err));
      setSending(false);
    }
  }

  // Entrée sur une carte : entrer à la table avec le personnage choisi
  const onKeyDown = (e: KeyboardEvent) => {
    const onRadio = (e.target as HTMLElement).matches('input[type="radio"]');
    if (e.key === 'Enter' && onRadio && selected && !sending) {
      e.preventDefault();
      void enter(selected);
    }
  };
  const choose = (value: string) => setPicked(value);
  const optionProps: OptionChoice = {
    selectedValue: selectionValue(selected),
    onChoose: choose,
    onEnter: (o: CharacterOption) => void enter(o),
    disabled: sending,
  };

  return shell(
    <div className="mx-auto w-full max-w-6xl px-4 pb-32 pt-8 sm:px-6 lg:pb-12">
      {heading(headerCreate(options.pcs.length > 0 && canCreate, createHref))}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <fieldset className="min-w-0 space-y-8" onKeyDown={onKeyDown}>
          <legend className="sr-only">{t('characters.picker.played')}</legend>

          {role === 'gm' && (
            <section>
              <TitreSection>{t('characters.picker.runGame')}</TitreSection>
              <GmOption
                checked={selected === GM_OPTION}
                current={current === GM_OPTION}
                onChoose={() => choose(GM_OPTION)}
                onEnter={() => void enter(GM_OPTION)}
                disabled={sending}
              />
            </section>
          )}

          <PlayerCharacters
            pcs={options.pcs}
            gm={role === 'gm'}
            createHref={canCreate ? createHref : null}
            optionProps={optionProps}
          />

          <BringSection
            options={options.bring}
            open={showBring}
            onToggle={() => setBringOpen(!showBring)}
            optionProps={optionProps}
          />
        </fieldset>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <SelectionPanel
              selected={selected}
              played={role === 'gm' ? null : played}
              systemId={c.system}
              sending={sending}
              onEnter={() => selected && void enter(selected)}
            />
          </div>
        </aside>
      </div>

      <MobileBar
        selected={selected}
        sending={sending}
        onEnter={() => selected && void enter(selected)}
      />
    </div>,
  );
}

// ─── Sélection ───────────────────────────────────────────────────────────────

type Choice = CharacterOption | typeof GM_OPTION;

/** Ce que j'incarne déjà ; le MJ sans personnage : maître du jeu. */
function currentValue(me: Membre | null, role: string): string | null {
  return me?.characterId ?? (role === 'gm' ? GM_OPTION : null);
}

/** Option choisie : maître du jeu (MJ seulement), ou un personnage sélectionnable. */
function selectedOption(value: string | null, role: string, all: CharacterOption[]): Choice | null {
  if (value === GM_OPTION && role === 'gm') return GM_OPTION;
  return all.find((o) => o.character.id === value && o.selectable) ?? null;
}

/** Valeur cochée dans les grilles d'options. */
function selectionValue(selected: Choice | null): string | null {
  return selected === GM_OPTION ? GM_OPTION : (selected?.character.id ?? null);
}

/** Création permise : au MJ, et aux joueurs si la campagne la laisse libre. */
function canCreateIn(role: string, freeCreation: boolean): boolean {
  return role === 'gm' || (role === 'player' && freeCreation);
}

/** Lien vers l'assistant de création d'un personnage. */
function CreateButton({ href, primary }: Readonly<{ href: string; primary: boolean }>) {
  const t = useTranslations();
  return (
    <Button asChild variant={primary ? 'default' : 'secondary'}>
      <Link href={href}>
        <Plus />
        {t('characters.picker.createMine')}
      </Link>
    </Button>
  );
}

/** Création en en-tête, quand la liste des personnages joueurs n'est pas vide. */
function headerCreate(show: boolean, href: string): ReactNode {
  return show ? <CreateButton href={href} primary={false} /> : undefined;
}

/** Choix commun aux grilles d'options. */
interface OptionChoice {
  selectedValue: string | null;
  onChoose: (id: string) => void;
  onEnter: (o: CharacterOption) => void;
  disabled: boolean;
}

/** Personnages joueurs de la campagne, ou l'invitation à en créer un. */
function PlayerCharacters({
  pcs,
  gm,
  createHref,
  optionProps,
}: Readonly<{
  pcs: CharacterOption[];
  gm: boolean;
  /** Création permise : lien de l'assistant ; sinon null. */
  createHref: string | null;
  optionProps: OptionChoice;
}>) {
  const t = useTranslations();
  if (pcs.length > 0)
    return (
      <section>
        <TitreSection compte={pcs.length}>{t('characters.picker.playerCharacters')}</TitreSection>
        <OptionGrid options={pcs} {...optionProps} />
      </section>
    );
  return (
    <EtatVide
      icone={UserRound}
      titre={t('characters.picker.noneYet')}
      description={gm ? t('characters.picker.noneYetGm') : t('characters.picker.noneYetPlayer')}
      action={createHref ? <CreateButton href={createHref} primary /> : undefined}
    />
  );
}

/** Mes personnages hors campagne du même système, à amener (repliés). */
function BringSection({
  options,
  open,
  onToggle,
  optionProps,
}: Readonly<{
  options: CharacterOption[];
  open: boolean;
  onToggle: () => void;
  optionProps: OptionChoice;
}>) {
  if (options.length === 0) return null;
  return (
    <section>
      <BringToggle count={options.length} open={open} onToggle={onToggle} />
      {open && (
        <div className="mt-2.5">
          <OptionGrid options={options} {...optionProps} />
        </div>
      )}
    </section>
  );
}

// ─── Options ─────────────────────────────────────────────────────────────────

function OptionGrid({
  options,
  selectedValue,
  onChoose,
  onEnter,
  disabled,
}: Readonly<{
  options: CharacterOption[];
  selectedValue: string | null;
  onChoose: (id: string) => void;
  onEnter: (o: CharacterOption) => void;
  disabled: boolean;
}>) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {options.map((o) => (
        <OptionCard
          key={o.character.id}
          option={o}
          checked={selectedValue === o.character.id}
          onChoose={() => onChoose(o.character.id)}
          onEnter={() => onEnter(o)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

/**
 * Ligne sobre qui déplie mes personnages hors campagne du même système : ce ne sont pas
 * des personnages joueurs de la campagne, ils y seront engagés en entrant à la table.
 */
function BringToggle({
  count,
  open,
  onToggle,
}: Readonly<{
  count: number;
  open: boolean;
  onToggle: () => void;
}>) {
  const t = useTranslations();
  const id = useId();
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-describedby={id}
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border-strong px-3 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground">
        <UserPlus className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{t('characters.picker.bringExisting')}</span>
        <span id={id} className="block truncate text-[13px] text-muted-foreground">
          {t('characters.picker.bringHint')}
        </span>
      </span>
      <span className="tabular text-xs text-subtle">{count}</span>
      <ChevronDown
        aria-hidden
        className={cn(
          'size-4 shrink-0 text-muted-foreground transition-transform',
          open && 'rotate-180',
        )}
      />
    </button>
  );
}

/** Carte-bouton radio : le clavier (flèches, Tab) et les lecteurs d'écran la gèrent en natif. */
function RadioCard({
  value,
  checked,
  disabled,
  onChoose,
  onEnter,
  describedBy,
  children,
}: Readonly<{
  value: string;
  checked: boolean;
  disabled: boolean;
  onChoose: () => void;
  onEnter?: () => void;
  describedBy?: string;
  children: ReactNode;
}>) {
  return (
    <label
      onDoubleClick={disabled ? undefined : onEnter}
      className={cn(
        'group relative flex min-h-[88px] items-center gap-3 rounded-xl border bg-card p-2.5 pr-3 shadow-surface transition-colors',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
        checked ? 'border-primary bg-primary/5' : 'border-border hover:border-border-strong',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-surface-2',
        checked && 'hover:bg-primary/5',
      )}
    >
      <input
        type="radio"
        name="character"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChoose}
        aria-describedby={describedBy}
        className="sr-only"
      />
      {children}
      <span
        aria-hidden
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border-strong bg-transparent text-transparent',
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
    </label>
  );
}

function GmOption({
  checked,
  current,
  onChoose,
  onEnter,
  disabled,
}: Readonly<{
  checked: boolean;
  current: boolean;
  onChoose: () => void;
  onEnter: () => void;
  disabled: boolean;
}>) {
  const t = useTranslations();
  return (
    <div className="grid sm:grid-cols-2">
      <RadioCard
        value={GM_OPTION}
        checked={checked}
        disabled={disabled}
        onChoose={onChoose}
        onEnter={onEnter}
      >
        <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Crown className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{t('common.roles.gmLong')}</span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {t('characters.picker.gmHint')}
          </span>
          {current && (
            <Badge ton="primaire" point className="mt-1.5">
              Mode actuel
            </Badge>
          )}
        </span>
      </RadioCard>
    </div>
  );
}

function OptionCard({
  option: o,
  checked,
  onChoose,
  onEnter,
  disabled,
}: Readonly<{
  option: CharacterOption;
  checked: boolean;
  onChoose: () => void;
  onEnter: () => void;
  disabled: boolean;
}>) {
  const t = useTranslations();
  const p = o.character;
  const statusId = useId();
  const highlights = p.summary.highlights.slice(0, 2);

  return (
    <RadioCard
      value={p.id}
      checked={checked}
      disabled={disabled || !o.selectable}
      onChoose={onChoose}
      onEnter={onEnter}
      describedBy={statusId}
    >
      <Illustration
        largeur={64}
        src={p.portraitUrl}
        graine={p.name}
        position="top"
        className="h-16 w-12 shrink-0 rounded-lg"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{p.name}</span>
        <span className="block truncate text-[13px] text-muted-foreground">
          {p.summary.tagline || t('characters.picker.profileToComplete')}
        </span>
        <span id={statusId} className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {highlights.map((h) => (
            <span
              key={h.label}
              className="tabular inline-flex h-5 items-center gap-1 rounded-md bg-surface-2 px-1.5 text-[11px] text-foreground"
            >
              <span className="text-subtle">{h.label}</span>
              {h.value}
            </span>
          ))}
          <OptionStatus option={o} />
        </span>
      </span>
    </RadioCard>
  );
}

/** Où en est le personnage : en création, qui l'incarne en ce moment, libre, hors campagne. */
function OptionStatus({ option: o }: Readonly<{ option: CharacterOption }>) {
  const t = useTranslations();
  if (o.character.inCreation)
    return (
      <Badge ton="alerte">
        <Hammer />
        {o.mine ? t('characters.picker.toResume') : t('characters.picker.inCreation')}
      </Badge>
    );
  if (o.takenFrom)
    return (
      <Badge ton="neutre" point>
        {t('characters.picker.playedBy', { name: o.takenFrom.name })}
      </Badge>
    );
  if (o.playedBy)
    return (
      <Badge ton="primaire" point>
        {t('characters.picker.youPlay')}
      </Badge>
    );
  if (o.free) return <Badge ton="neutre">{t('characters.picker.outside')}</Badge>;
  return <Badge ton="neutre">{t('characters.picker.free')}</Badge>;
}

// ─── Sélection ───────────────────────────────────────────────────────────────

function selectionStatus(t: Translator, selected: Choice | null) {
  if (!selected) return t('characters.picker.selectOne');
  if (selected !== GM_OPTION && selected.takenFrom)
    return t('characters.picker.takeOver', { name: selected.takenFrom.name });
  return t('characters.picker.ready');
}

function enterLabel(t: Translator, selected: Choice) {
  if (selected === GM_OPTION) return t('characters.picker.enterAsGm');
  return selected.character.inCreation
    ? t('characters.picker.resumeCreation')
    : t('characters.picker.enterTable');
}

/**
 * Ce que le choix change : personnage repris, engagement, et la main sur les fiches (qui
 * incarne un personnage modifie sa fiche avec le MJ, les autres la lisent). `played` : ce
 * que j'incarne déjà (joueur seulement : le MJ modifie toutes les fiches).
 */
function SelectionNotes({
  option: o,
  played,
}: Readonly<{
  option: CharacterOption;
  played: CharacterOption | null;
}>) {
  const t = useTranslations();
  const notes: string[] = [];
  if (o.takenFrom) notes.push(t('characters.picker.takenNote', { name: o.takenFrom.name }));
  if (o.free) notes.push(t('characters.picker.engagedNote'));
  if (!o.character.inCreation && !o.playedBy) notes.push(t('characters.picker.editNote'));
  if (played && played.character.id !== o.character.id)
    notes.push(t('characters.picker.leaveNote', { name: played.character.name }));
  if (notes.length === 0) return null;
  return (
    <ul className="space-y-1 text-[13px] text-muted-foreground">
      {notes.map((n) => (
        <li key={n} className="flex gap-2">
          <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-current" />
          {n}
        </li>
      ))}
    </ul>
  );
}

function SelectionPanel({
  selected,
  played,
  systemId,
  sending,
  onEnter,
}: Readonly<{
  selected: Choice | null;
  played: CharacterOption | null;
  systemId: string;
  sending: boolean;
  onEnter: () => void;
}>) {
  const t = useTranslations();
  if (!selected)
    return (
      <div className="rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center text-sm text-muted-foreground">
        {t('characters.picker.selectToView')}
      </div>
    );

  const action = (
    <div className="space-y-2">
      <Button size="lg" className="w-full" onClick={onEnter} loading={sending}>
        {selected !== GM_OPTION && selected.character.inCreation ? <Hammer /> : <ArrowRight />}
        {enterLabel(t, selected)}
      </Button>
      <p className="text-center text-[11px] text-subtle">
        {t.rich('characters.picker.enterKeys', {
          enter: () => <Kbd>{t('chat.enterKey')}</Kbd>,
        })}
      </p>
    </div>
  );

  if (selected === GM_OPTION)
    return (
      <section
        aria-label={t('common.roles.gmLong')}
        className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-surface"
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Crown className="size-5" />
        </span>
        <div className="space-y-1">
          <h2 className="text-[15px] font-semibold">{t('common.roles.gmLong')}</h2>
          <p className="text-[13px] text-muted-foreground">{t('characters.picker.gmPower')}</p>
        </div>
        {action}
      </section>
    );

  return <CharacterPanel option={selected} played={played} systemId={systemId} action={action} />;
}

/** Fiche résumée du personnage choisi, calculée par le moteur de règles. */
function CharacterPanel({
  option: o,
  played,
  systemId,
  action,
}: Readonly<{
  option: CharacterOption;
  played: CharacterOption | null;
  systemId: string;
  action: ReactNode;
}>) {
  const p = o.character;
  const full = usePersonnage(p.id);
  const sys = useSysteme(systemId);
  const state = full.data?.state;
  const sheet = useMemo(
    () => (sys.data && state ? calculer(sys.data.systeme, state) : null),
    [sys.data, state],
  );
  const widgets = widgetsFiche(sys.data?.presentation, p.type);
  const attributes = widgets.find((w) => w.type === 'attributs');
  const resources = widgets.find((w) => w.type === 'ressources');
  let keys: readonly string[] = [];
  if (attributes?.type === 'attributs' && attributes.attributs) keys = attributes.attributs;
  else if (attributes?.type === 'attributs' && sheet)
    keys = [...sheet.entite.attributs.values()]
      .filter((a) => a.groupe === attributes.groupe)
      .map((a) => a.cle);
  const concept = full.data?.details.concept || p.concept;

  return (
    <section
      aria-label={p.name}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-surface"
    >
      <Illustration
        largeur={480}
        src={p.portraitUrl}
        graine={p.name}
        position="top"
        className="aspect-[4/3]"
        voile
      >
        <div className="absolute inset-x-4 bottom-3">
          <h2 className="truncate font-display text-2xl font-semibold text-white">{p.name}</h2>
          {p.summary.tagline && (
            <p className="truncate text-[13px] text-white/75">{p.summary.tagline}</p>
          )}
        </div>
      </Illustration>
      <div className="space-y-4 p-5">
        {concept && <p className="text-sm italic text-muted-foreground">« {concept} »</p>}
        {sheet && resources?.type === 'ressources' && (
          <div className="space-y-2">
            {resources.attributs.map((k) => (
              <JaugeRessource
                key={k}
                fiche={sheet}
                cle={k}
                presentation={sys.data?.presentation ?? null}
              />
            ))}
          </div>
        )}
        {sheet && keys.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {keys.slice(0, 6).map((k) => (
              <TuileAttribut key={k} fiche={sheet} cle={k} compacte />
            ))}
          </div>
        )}
        {!sheet && full.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8" />
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          </div>
        )}
        <SelectionNotes option={o} played={played} />
        {action}
      </div>
    </section>
  );
}

/** Mobile : le choix et son bouton restent sous le pouce. */
function MobileBar({
  selected,
  sending,
  onEnter,
}: Readonly<{
  selected: Choice | null;
  sending: boolean;
  onEnter: () => void;
}>) {
  const t = useTranslations();
  const name =
    selected === GM_OPTION
      ? t('common.roles.gmLong')
      : (selected?.character.name ?? t('characters.picker.none'));
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 lg:hidden">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        {selected && selected !== GM_OPTION ? (
          <Illustration
            largeur={48}
            src={selected.character.portraitUrl}
            graine={selected.character.name}
            position="top"
            className="h-12 w-9 shrink-0 rounded-md"
          />
        ) : (
          <span className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">
            {selected === GM_OPTION ? (
              <Crown className="size-4" />
            ) : (
              <UserRound className="size-4" />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{selectionStatus(t, selected)}</p>
        </div>
        <Button onClick={onEnter} disabled={!selected} loading={sending}>
          {selected ? enterLabel(t, selected) : t('characters.picker.enterTable')}
        </Button>
      </div>
    </div>
  );
}

// ─── Chargement ──────────────────────────────────────────────────────────────

function PickerSkeleton() {
  const t = useTranslations();
  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6"
      role="status"
      aria-label={t('characters.picker.loading')}
    >
      <div className="mb-8 space-y-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <div className="grid gap-2.5 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[88px] rounded-xl" />
            ))}
          </div>
        </div>
        <Skeleton className="hidden h-[420px] rounded-2xl lg:block" />
      </div>
    </div>
  );
}

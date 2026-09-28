'use client';

import { calculer } from '@vtt/rules';
import {
  ArrowRight,
  Check,
  Crown,
  DoorOpen,
  Eye,
  Hammer,
  Plus,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useNomSysteme } from '@/components/campagnes/carte-campagne';
import { Illustration } from '@/components/commun/illustration';
import { EnTetePage, EtatVide, TitreSection } from '@/components/commun/page';
import { AvatarJoueur } from '@/components/compte/elements';
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
  mine: boolean;
  owner: Membre | null;
  /** Membre qui l'incarne en ce moment (moi compris). */
  playedBy: Membre | null;
  /** Un autre membre l'incarne : le choisir le lui reprend. */
  takenFrom: Membre | null;
  /** Création en cours d'un autre joueur : lui seul la termine. */
  selectable: boolean;
}

/**
 * Choix du personnage incarné dans une campagne, avant d'aller à la table.
 * Seuls les personnages joueurs sont proposés (filtre `kind` du service) : les
 * miens, engagés ou libres du même système, et ceux des autres joueurs, sans
 * verrou (en choisir un déjà incarné le reprend à son joueur). Le MJ peut aussi
 * entrer en maître du jeu ; une création pas terminée se reprend dans l'assistant.
 */
export function CharacterPicker({ campaignId }: { campaignId: string }) {
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

  const c = campaign.data;
  const me = c?.members.find((m) => m.userId === profile.id) ?? null;

  const options = useMemo(() => {
    if (!c || !pcs.data || !mine.data) return null;
    const members = new Map(c.members.map((m) => [m.userId, m]));
    const players = new Map(c.members.filter((m) => m.characterId).map((m) => [m.characterId!, m]));
    const engaged = new Set(pcs.data.map((p) => p.id));
    const option = (p: Personnage, free: boolean): CharacterOption => {
      const isMine = p.ownerId === profile.id;
      const playedBy = players.get(p.id) ?? null;
      return {
        character: p,
        free,
        mine: isMine,
        owner: members.get(p.ownerId) ?? null,
        playedBy,
        takenFrom: playedBy && playedBy.userId !== profile.id ? playedBy : null,
        selectable: isMine || !p.inCreation,
      };
    };
    return {
      mine: [
        ...pcs.data.filter((p) => p.ownerId === profile.id).map((p) => option(p, false)),
        ...mine.data
          .filter((p) => p.roomId === null && p.system.id === c.system && !engaged.has(p.id))
          .map((p) => option(p, true)),
      ],
      others: pcs.data.filter((p) => p.ownerId !== profile.id).map((p) => option(p, false)),
    };
  }, [c, pcs.data, mine.data, profile.id]);

  const back = `/campagnes/${campaignId}`;
  const shell = (content: ReactNode) => (
    <div data-ambiance={c?.ambiance} className="min-h-dvh bg-background">
      <EnTeteFocus quitter={{ href: back }} libelleQuitter="Retour au salon" />
      {content}
    </div>
  );

  if (campaign.isLoading) return shell(<PickerSkeleton />);
  if (!c)
    return shell(
      <div className="mx-auto max-w-xl px-4 py-16">
        <EtatVide
          icone={DoorOpen}
          titre="Campagne introuvable"
          description="Elle a peut-être été supprimée, ou vous n'en faites plus partie."
          action={
            <Button asChild variant="secondary">
              <Link href="/campagnes">Retour aux campagnes</Link>
            </Button>
          }
        />
      </div>,
    );

  const role = c.role;
  const canCreate = role === 'gm' || (role === 'player' && c.freeCreation);
  const createHref = `/personnages/nouveau?${new URLSearchParams({ campagne: campaignId })}`;
  const heading = (actions?: ReactNode) => (
    <EnTetePage
      surtitre={[c.name, systemName].filter(Boolean).join(' · ')}
      titre="Choisir votre personnage"
      description="Le personnage que vous incarnez à la table. Vous pourrez en changer à tout moment en revenant ici."
      actions={actions}
    />
  );

  if (role === 'spectator')
    return shell(
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {heading()}
        <EtatVide
          icone={Eye}
          titre="Vous suivez cette campagne en spectateur"
          description="Les spectateurs n'incarnent pas de personnage : vous voyez la table sans y jouer."
          action={
            <Button asChild>
              <Link href={`/campagnes/${campaignId}/table`}>
                Entrer à la table
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
          titre="Impossible de charger les personnages"
          description={messageErreur(loadError)}
          action={
            <>
              <Button variant="secondary" onClick={() => void pcs.refetch()}>
                Réessayer
              </Button>
              <Button asChild variant="ghost">
                <Link href={back}>Retour au salon</Link>
              </Button>
            </>
          }
        />
      </div>,
    );

  if (!options) return shell(<PickerSkeleton />);

  const all = [...options.mine, ...options.others];
  const createButton = (primary: boolean) => (
    <Button asChild variant={primary ? 'default' : 'secondary'}>
      <Link href={createHref}>
        <Plus />
        Créer mon personnage
      </Link>
    </Button>
  );

  // Aucun personnage joueur : seule l'invitation à créer le sien (le MJ garde son entrée)
  if (all.length === 0 && role !== 'gm')
    return shell(
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {heading()}
        <EtatVide
          icone={UserRound}
          titre="Aucun personnage joueur dans cette campagne"
          description={
            canCreate
              ? 'Créez votre personnage pour rejoindre la table.'
              : "Le maître du jeu n'autorise pas la création de personnages ici : demandez-lui de vous en préparer un."
          }
          action={canCreate ? createButton(true) : undefined}
        />
      </div>,
    );

  // Sélection par défaut : ce que j'incarne déjà (le MJ sans personnage : maître du jeu)
  const current = me?.characterId ?? (role === 'gm' ? GM_OPTION : null);
  const selectedValue = picked ?? current;
  const selected =
    selectedValue === GM_OPTION && role === 'gm'
      ? GM_OPTION
      : (all.find((o) => o.character.id === selectedValue && o.selectable) ?? null);

  async function enter(target: CharacterOption | typeof GM_OPTION) {
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
      toast.success(p ? `Vous incarnez ${p.name}` : 'Vous entrez en maître du jeu');
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
  const optionProps = {
    selectedValue: selected === GM_OPTION ? GM_OPTION : (selected?.character.id ?? null),
    onChoose: choose,
    onEnter: (o: CharacterOption) => void enter(o),
    disabled: sending,
  };

  return shell(
    <div className="mx-auto w-full max-w-6xl px-4 pb-32 pt-8 sm:px-6 lg:pb-12">
      {heading(all.length > 0 && canCreate ? createButton(false) : undefined)}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <fieldset className="min-w-0 space-y-8" onKeyDown={onKeyDown}>
          <legend className="sr-only">Personnage incarné</legend>

          {role === 'gm' && (
            <section>
              <TitreSection>Mener la partie</TitreSection>
              <GmOption
                checked={selected === GM_OPTION}
                current={current === GM_OPTION}
                onChoose={() => choose(GM_OPTION)}
                onEnter={() => void enter(GM_OPTION)}
                disabled={sending}
              />
            </section>
          )}

          {options.mine.length > 0 && (
            <section>
              <TitreSection compte={options.mine.length}>Mes personnages</TitreSection>
              <OptionGrid options={options.mine} {...optionProps} />
            </section>
          )}

          {options.others.length > 0 && (
            <section>
              <TitreSection compte={options.others.length}>Autres personnages joueurs</TitreSection>
              <OptionGrid options={options.others} {...optionProps} />
            </section>
          )}

          {all.length === 0 && (
            <EtatVide
              icone={UserRound}
              titre="Aucun personnage joueur pour l'instant"
              description="Les personnages de vos joueurs apparaîtront ici dès qu'ils les auront créés."
              action={createButton(true)}
            />
          )}
        </fieldset>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <SelectionPanel
              selected={selected}
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

// ─── Options ─────────────────────────────────────────────────────────────────

function OptionGrid({
  options,
  selectedValue,
  onChoose,
  onEnter,
  disabled,
}: {
  options: CharacterOption[];
  selectedValue: string | null;
  onChoose: (id: string) => void;
  onEnter: (o: CharacterOption) => void;
  disabled: boolean;
}) {
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

/** Carte-bouton radio : le clavier (flèches, Tab) et les lecteurs d'écran la gèrent en natif. */
function RadioCard({
  value,
  checked,
  disabled,
  onChoose,
  onEnter,
  describedBy,
  children,
}: {
  value: string;
  checked: boolean;
  disabled: boolean;
  onChoose: () => void;
  onEnter?: () => void;
  describedBy?: string;
  children: ReactNode;
}) {
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
}: {
  checked: boolean;
  current: boolean;
  onChoose: () => void;
  onEnter: () => void;
  disabled: boolean;
}) {
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
          <span className="block truncate text-sm font-semibold">Maître du jeu</span>
          <span className="block truncate text-[13px] text-muted-foreground">
            Voir et diriger toute la table
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
}: {
  option: CharacterOption;
  checked: boolean;
  onChoose: () => void;
  onEnter: () => void;
  disabled: boolean;
}) {
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
        src={p.portraitUrl}
        graine={p.name}
        position="top"
        className="h-16 w-12 shrink-0 rounded-lg"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{p.name}</span>
        <span className="block truncate text-[13px] text-muted-foreground">
          {p.summary.tagline || 'Profil à compléter'}
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

/** Où en est le personnage : en création, incarné (par moi ou un autre), hors campagne, à qui. */
function OptionStatus({ option: o }: { option: CharacterOption }) {
  if (o.character.inCreation)
    return (
      <Badge ton="alerte">
        <Hammer />
        {o.mine ? 'Création à reprendre' : 'En création'}
      </Badge>
    );
  if (o.takenFrom)
    return (
      <Badge ton="neutre" point>
        Joué par {o.takenFrom.name}
      </Badge>
    );
  if (o.playedBy)
    return (
      <Badge ton="primaire" point>
        Vous l’incarnez
      </Badge>
    );
  if (o.free) return <Badge ton="neutre">Hors campagne</Badge>;
  if (!o.mine && o.owner)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <AvatarJoueur nom={o.owner.name} url={o.owner.avatarUrl} taille="xs" />
        {o.owner.name}
      </span>
    );
  return null;
}

// ─── Sélection ───────────────────────────────────────────────────────────────

function enterLabel(selected: CharacterOption | typeof GM_OPTION) {
  if (selected === GM_OPTION) return 'Entrer en maître du jeu';
  return selected.character.inCreation ? 'Reprendre la création' : 'Entrer à la table';
}

/** Ce que le choix change pour les autres : personnage repris, engagement, droits. */
function SelectionNotes({ option: o }: { option: CharacterOption }) {
  const notes: string[] = [];
  if (o.takenFrom)
    notes.push(`${o.takenFrom.name} l’incarne en ce moment : le choisir le lui reprend.`);
  if (o.free) notes.push('Il sera engagé dans la campagne.');
  if (!o.mine)
    notes.push(
      `Sa fiche reste modifiable par ${o.owner ? o.owner.name : 'son propriétaire'} et le MJ.`,
    );
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
  systemId,
  sending,
  onEnter,
}: {
  selected: CharacterOption | typeof GM_OPTION | null;
  systemId: string;
  sending: boolean;
  onEnter: () => void;
}) {
  if (!selected)
    return (
      <div className="rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center text-sm text-muted-foreground">
        Sélectionnez un personnage pour voir sa fiche.
      </div>
    );

  const action = (
    <div className="space-y-2">
      <Button size="lg" className="w-full" onClick={onEnter} loading={sending}>
        {selected !== GM_OPTION && selected.character.inCreation ? <Hammer /> : <ArrowRight />}
        {enterLabel(selected)}
      </Button>
      <p className="text-center text-[11px] text-subtle">
        <Kbd>Entrée</Kbd> ou double-clic sur une carte
      </p>
    </div>
  );

  if (selected === GM_OPTION)
    return (
      <section
        aria-label="Maître du jeu"
        className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-surface"
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Crown className="size-5" />
        </span>
        <div className="space-y-1">
          <h2 className="text-[15px] font-semibold">Maître du jeu</h2>
          <p className="text-[13px] text-muted-foreground">
            Vous voyez toute la carte, dirigez les PNJ et modifiez toutes les fiches.
          </p>
        </div>
        {action}
      </section>
    );

  return <CharacterPanel option={selected} systemId={systemId} action={action} />;
}

/** Fiche résumée du personnage choisi, calculée par le moteur de règles. */
function CharacterPanel({
  option: o,
  systemId,
  action,
}: {
  option: CharacterOption;
  systemId: string;
  action: ReactNode;
}) {
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
  const keys =
    attributes?.type === 'attributs'
      ? (attributes.attributs ??
        (sheet
          ? [...sheet.entite.attributs.values()]
              .filter((a) => a.groupe === attributes.groupe)
              .map((a) => a.cle)
          : []))
      : [];
  const concept = full.data?.details.concept || p.concept;

  return (
    <section
      aria-label={p.name}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-surface"
    >
      <Illustration
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
        {!o.mine && o.owner && (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <AvatarJoueur nom={o.owner.name} url={o.owner.avatarUrl} taille="xs" />
            Personnage de {o.owner.name}
          </p>
        )}
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
        <SelectionNotes option={o} />
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
}: {
  selected: CharacterOption | typeof GM_OPTION | null;
  sending: boolean;
  onEnter: () => void;
}) {
  const name =
    selected === GM_OPTION ? 'Maître du jeu' : (selected?.character.name ?? 'Aucun personnage');
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        {selected && selected !== GM_OPTION ? (
          <Illustration
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
          <p className="truncate text-xs text-muted-foreground">
            {!selected
              ? 'Sélectionnez un personnage'
              : selected !== GM_OPTION && selected.takenFrom
                ? `Joué par ${selected.takenFrom.name} : vous le lui reprenez`
                : 'Prêt à jouer'}
          </p>
        </div>
        <Button onClick={onEnter} disabled={!selected} loading={sending}>
          {selected ? enterLabel(selected) : 'Entrer à la table'}
        </Button>
      </div>
    </div>
  );
}

// ─── Chargement ──────────────────────────────────────────────────────────────

function PickerSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6"
      role="status"
      aria-label="Chargement des personnages"
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

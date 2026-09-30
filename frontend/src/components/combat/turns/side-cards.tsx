'use client';

/**
 * Cartes compactes de la colonne de droite (docs/combat.md § 12.3), comme l'ancien tableau de
 * bord : « Consulté » (participant choisi dans l'ordre), « Cibles (n) » (cibles des rapports en
 * attente : liste puis détail), « Personnage actif » (portrait, valeurs clés de la
 * présentation, ressource principale, « Attaquer avec »). Toute la carte ouvre la fiche
 * détaillée. Hors combat, la carte active laisse place au résumé de la préparation.
 */
import type { CampaignSide, CombatParticipant } from '@vtt/contracts';
import {
  ChevronRight,
  Crosshair,
  Eye,
  EyeOff,
  Hourglass,
  Swords,
  UserCheck,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SIDE_LABELS } from './model';
import { KeyStats, SituationChips } from './parts';
import type { SetupSummary } from './setup';
import { COMBAT_SHORTCUTS } from './shortcuts';
import { situationChips } from './situation';
import { StateBadge } from './states-manager';
import type { CastMember, ParticipantSheet } from './use-cast';

type Tone = 'primary' | 'danger' | 'info';

const TONES: Record<Tone, { border: string; wash: string; text: string; ring: string }> = {
  primary: {
    border: 'border-primary/45',
    wash: 'bg-primary/[0.06]',
    text: 'text-primary-strong',
    ring: 'ring-primary/70',
  },
  danger: {
    border: 'border-destructive/35',
    wash: 'bg-destructive/[0.05]',
    text: 'text-destructive',
    ring: 'ring-destructive/60',
  },
  info: {
    border: 'border-info/35',
    wash: 'bg-info/[0.05]',
    text: 'text-info',
    ring: 'ring-info/60',
  },
};

const CARD_MOTION = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12 } },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
} as const;

/** Cadre commun : toute la carte ouvre le détail ; les boutons internes passent au-dessus. */
function CardShell({
  tone,
  onOpen,
  openLabel,
  aside,
  children,
  className,
}: {
  tone: Tone;
  onOpen(): void;
  openLabel: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-card shadow-surface transition-colors',
        t.border,
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel}
        className="absolute inset-0 z-0 rounded-2xl transition-colors hover:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      />
      <div className={cn('pointer-events-none relative flex items-center gap-3 p-2.5', t.wash)}>
        {children}
        <span className="pointer-events-auto relative z-10 flex shrink-0 items-center gap-1">
          {aside}
          <ChevronRight className="size-4 text-subtle" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function CardLabel({
  tone,
  icon: Icon,
  children,
}: {
  tone: Tone;
  icon: typeof Swords;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider',
        TONES[tone].text,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

// ─── Consulté ────────────────────────────────────────────────────────────────

export function ConsultedCard({
  member,
  sheet,
  participant,
  onOpen,
  onClose,
}: {
  member: CastMember | null;
  sheet: ParticipantSheet | null;
  participant: CombatParticipant | null;
  onOpen(): void;
  onClose(): void;
}) {
  const name = member?.name ?? 'Personnage';
  const chips = participant ? situationChips(participant) : [];
  return (
    <CardShell
      tone="info"
      onOpen={onOpen}
      openLabel={`Fiche de ${name}`}
      aside={
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label={`Ne plus consulter ${name}`}
        >
          <X />
        </Button>
      }
    >
      <Illustration
        src={member?.portraitUrl ?? null}
        graine={name}
        position="top"
        className={cn('size-10 shrink-0 rounded-full ring-2', TONES.info.ring)}
      />
      <span className="min-w-0 flex-1">
        <CardLabel tone="info" icon={Eye}>
          Consulté
        </CardLabel>
        <span className="block truncate text-sm font-semibold">{name}</span>
        {chips.length > 0 && (
          <SituationChips chips={chips} className="pointer-events-auto relative z-10 mt-0.5" />
        )}
      </span>
      {sheet && <KeyStats stats={sheet.keyStats} />}
    </CardShell>
  );
}

// ─── Cibles (n) ──────────────────────────────────────────────────────────────

export function TargetsCard({
  ids,
  cast,
  onOpen,
}: {
  ids: readonly string[];
  cast: ReadonlyMap<string, CastMember>;
  onOpen(): void;
}) {
  const shown = ids.slice(0, 4);
  const first = cast.get(ids[0] ?? '')?.name ?? 'Personnage';
  const title = ids.length > 1 ? `Cibles (${ids.length})` : `Cible : ${first}`;
  return (
    <CardShell tone="danger" onOpen={onOpen} openLabel={title}>
      <span className="flex shrink-0 -space-x-2">
        {shown.map((id) => {
          const m = cast.get(id);
          return (
            <Illustration
              key={id}
              src={m?.portraitUrl ?? null}
              graine={m?.name ?? id}
              position="top"
              className="size-8 rounded-full ring-2 ring-card"
              initiale={(m?.name ?? '?').charAt(0).toUpperCase()}
            />
          );
        })}
      </span>
      <span className="min-w-0 flex-1">
        <CardLabel tone="danger" icon={Crosshair}>
          Visées par les rapports en attente
        </CardLabel>
        <span className="block truncate text-sm font-semibold">{title}</span>
      </span>
    </CardShell>
  );
}

/** Liste des cibles (plusieurs) : un clic ouvre la fiche de l'une d'elles. */
export function TargetsDialog({
  open,
  onOpenChange,
  ids,
  cast,
  sheets,
  onPick,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  ids: readonly string[];
  cast: ReadonlyMap<string, CastMember>;
  sheets: ReadonlyMap<string, ParticipantSheet>;
  onPick(characterId: string): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cibles des rapports</DialogTitle>
          <DialogDescription>
            Les personnages visés par les rapports qui attendent votre décision.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5">
          {ids.map((id) => {
            const m = cast.get(id);
            const name = m?.name ?? 'Personnage';
            const sheet = sheets.get(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onPick(id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-destructive/40 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <Illustration
                    src={m?.portraitUrl ?? null}
                    graine={name}
                    position="top"
                    className="size-10 shrink-0 rounded-full ring-1 ring-border"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    {m && (
                      <span className="block text-[11px] text-muted-foreground">
                        {SIDE_LABELS[m.side].name}
                      </span>
                    )}
                  </span>
                  {sheet && <KeyStats stats={sheet.keyStats.slice(0, 2)} />}
                  <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// ─── Personnage actif ────────────────────────────────────────────────────────

export function ActiveCard({
  member,
  sheet,
  participant,
  large,
  canAttack,
  onOpen,
  onAttack,
}: {
  member: CastMember | null;
  sheet: ParticipantSheet | null;
  participant: CombatParticipant;
  /** Vue empilée : la carte principale, plus grande (l'ancienne carte mobile). */
  large: boolean;
  canAttack: boolean;
  onOpen(): void;
  onAttack(): void;
}) {
  const name = member?.name ?? 'Personnage';
  const chips = situationChips(participant, { current: true, detailed: true });
  const states = sheet?.states ?? [];
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-card shadow-surface',
        TONES.primary.border,
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Fiche de ${name}, personnage actif`}
        className="absolute inset-0 rounded-2xl transition-colors hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      />
      <div
        className={cn(
          'pointer-events-none relative flex gap-3',
          TONES.primary.wash,
          large ? 'flex-col p-3.5' : 'items-center p-2.5',
        )}
      >
        <span className={cn('flex min-w-0 items-center gap-3', !large && 'flex-1')}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={participant.characterId} {...CARD_MOTION} className="shrink-0">
              <Illustration
                src={member?.portraitUrl ?? null}
                graine={name}
                position="top"
                className={cn(
                  'rounded-full ring-2',
                  TONES.primary.ring,
                  large ? 'size-16' : 'size-11',
                  participant.defeated && 'grayscale',
                )}
              />
            </motion.span>
          </AnimatePresence>
          <span className="min-w-0 flex-1">
            <CardLabel tone="primary" icon={Swords}>
              Personnage actif
            </CardLabel>
            <span className={cn('block truncate font-semibold', large ? 'text-lg' : 'text-sm')}>
              {name}
            </span>
            <span className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              {SIDE_LABELS[participant.side].name}
              {participant.initiative?.summary && (
                <Badge ton="primaire" className="font-mono tabular-nums">
                  Init. {participant.initiative.summary}
                </Badge>
              )}
              {participant.visibleToPlayers === false && (
                <EyeOff className="size-3.5 text-info" aria-label="Caché aux joueurs" />
              )}
            </span>
          </span>
        </span>
        {sheet && sheet.keyStats.length > 0 && (
          <span className={cn(large && 'rounded-xl border border-border bg-background/40 p-2.5')}>
            <KeyStats stats={sheet.keyStats} size={large ? 'md' : 'sm'} />
          </span>
        )}
        {(chips.length > 0 || states.length > 0) && large && (
          <span className="pointer-events-auto relative z-10 flex flex-wrap gap-1">
            <SituationChips chips={chips} />
            {states.map((s) => (
              <StateBadge key={s.key} state={s} />
            ))}
          </span>
        )}
        <span
          className={cn(
            'pointer-events-auto relative z-10 flex shrink-0 items-center gap-1.5',
            large && 'w-full',
          )}
        >
          <Info
            texte={
              <span className="flex items-center gap-2">
                Attaquer avec {name} <Kbd>{COMBAT_SHORTCUTS.attack.label}</Kbd>
              </span>
            }
          >
            <Button
              size="sm"
              onClick={onAttack}
              disabled={!canAttack || participant.defeated === true}
              aria-keyshortcuts={COMBAT_SHORTCUTS.attack.aria}
              className={cn(large && 'flex-1')}
            >
              <Swords />
              Attaquer avec
            </Button>
          </Info>
          {!large && <ChevronRight className="size-4 text-subtle" aria-hidden />}
        </span>
      </div>
      {!large && (chips.length > 0 || states.length > 0) && (
        <div className="pointer-events-none relative flex flex-wrap gap-1 border-t border-border/60 px-2.5 py-1.5">
          <span className="pointer-events-auto relative z-10 flex flex-wrap gap-1">
            <SituationChips chips={chips} />
            {states.map((s) => (
              <StateBadge key={s.key} state={s} />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Créneau sans acteur (mode slots) : « Qui agit ? » à la place du personnage actif, les
 * participants du camp du créneau (coche sur ceux qui ont agi : les faire rejouer).
 */
export function SlotPickCard({
  side,
  candidates,
  cast,
  busy,
  onChoose,
}: {
  side: CampaignSide;
  candidates: readonly { characterId: string; acted: boolean }[];
  cast: ReadonlyMap<string, CastMember>;
  busy: boolean;
  onChoose(characterId: string, force: boolean): void;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed bg-card p-3 shadow-surface',
        TONES.primary.border,
      )}
    >
      <CardLabel tone="primary" icon={UserCheck}>
        Créneau des {SIDE_LABELS[side].name.toLowerCase()}
      </CardLabel>
      <p className="mt-0.5 text-sm font-semibold">Qui agit ?</p>
      {candidates.length === 0 ? (
        <p className="mt-2 text-[13px] text-subtle">Personne de ce camp ne peut agir.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {candidates.map((c) => {
            const m = cast.get(c.characterId);
            const name = m?.name ?? 'Personnage';
            return (
              <li key={c.characterId}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onChoose(c.characterId, c.acted)}
                  title={c.acted ? `${name} a déjà agi ce round : le faire rejouer` : undefined}
                  className="h-9 gap-2 pl-1.5"
                >
                  <Illustration
                    src={m?.portraitUrl ?? null}
                    graine={name}
                    position="top"
                    className={cn('size-6 rounded-full', c.acted && 'opacity-60')}
                  />
                  <span className={cn('max-w-32 truncate', c.acted && 'text-subtle')}>{name}</span>
                  {c.acted && (
                    <Badge ton="succes" className="h-4 px-1.5 text-[10px]">
                      rejouer
                    </Badge>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Aucun participant n'agit (initiative à lancer, vue vide). */
export function NoActorCard({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border-strong px-3 py-3 text-[13px] text-muted-foreground">
      <Hourglass className="size-4 shrink-0 text-subtle" aria-hidden />
      {text}
    </div>
  );
}

// ─── Hors combat : la préparation ────────────────────────────────────────────

export function SetupCard({ summary }: { summary: SetupSummary }) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-card p-3 shadow-surface',
        summary.chosen ? TONES.primary.border : 'border-border',
      )}
    >
      <CardLabel tone="primary" icon={Swords}>
        Hors combat
      </CardLabel>
      <p className="mt-0.5 text-sm font-semibold">
        {summary.chosen
          ? `${summary.chosen} prêt${summary.chosen > 1 ? 's' : ''} à combattre`
          : 'Cochez qui se bat'}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {summary.sides.map((s) => (
          <Badge key={s} ton={s === 'enemies' ? 'danger' : s === 'players' ? 'info' : 'succes'}>
            {summary.bySide[s]} {SIDE_LABELS[s].name.toLowerCase()}
          </Badge>
        ))}
        {summary.hidden > 0 && (
          <Badge ton="info">
            <EyeOff />
            {summary.hidden} caché{summary.hidden > 1 ? 's' : ''}
          </Badge>
        )}
        {summary.surprised > 0 && (
          <Badge ton="alerte">
            <Zap />
            {summary.surprised} surpris
          </Badge>
        )}
      </div>
      <p className="mt-2 text-[11px] text-subtle">
        « Lancer l’initiative » démarre le combat avec eux et tire l’ordre en un clic.
      </p>
    </div>
  );
}

/** Carte animée à son arrivée (Consulté, Cibles). */
export function Appear({ id, children }: { id: string; children: ReactNode }) {
  return (
    <motion.div key={id} layout="position" {...CARD_MOTION}>
      {children}
    </motion.div>
  );
}

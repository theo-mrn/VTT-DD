'use client';

/**
 * Fiche détaillée d'un personnage du panneau Combat (docs/combat.md § 12.3), ouverte depuis une
 * carte compacte (Personnage actif, Consulté, Cible) ou une ligne de l'ordre : l'ancien
 * dialogue du tableau de bord. Bandeau (identité, valeurs clés de la présentation), puces de
 * situation, ressources ± (le bloc de la fiche), états et durées, caractéristiques ; pour un
 * participant : initiative (détail, paramètres de relance : l'ancien « Camp (défaut) », saisie
 * des clés pour des dés lancés à la table), visible, surpris, hors de combat. Actions :
 * attaquer avec, donner le tour, ouvrir la fiche, retirer du combat.
 */
import { translate } from '@/i18n/runtime';
import { useTranslations } from 'next-intl';
import type { ActionParams, CombatParticipant, CombatState } from '@vtt/contracts';
import {
  ChevronLeft,
  Crosshair,
  Dices,
  ExternalLink,
  EyeOff,
  Hand,
  Loader2,
  PencilLine,
  Skull,
  Swords,
  UserMinus,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { useFicheCalculee } from '@/components/fiche/fiche-personnage';
import { BlocRessources, widgetsDe } from '@/components/fiche/widgets';
import { PanelLink } from '@/components/table/panels/navigation';
import { TABLE_PARAMS } from '@/components/table/panels/registry';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { combatErrorMessage } from '@/lib/combat/api';
import { combatFailure, currentActorId, useCombatCommands } from '@/lib/combat/use-combat';
import { cn } from '@/lib/utils';
import { InitiativeParamsForm, initiativeAction, initiativeParams } from './initiative-form';
import { SIDE_LABELS } from './model';
import { SituationChips } from './parts';
import { situationChips } from './situation';
import { StatesManager } from './states-manager';
import { combatPresentation, statesOf, type CastMember } from './use-cast';
import { DotsBackdrop } from '../backdrop';

/** D'où la fiche a été ouverte : le libellé et la teinte de son bandeau. */
export interface DialogOrigin {
  label: string;
  icon: LucideIcon;
  tone: 'primary' | 'danger' | 'info';
}

const TONE_TEXT: Record<DialogOrigin['tone'], string> = {
  primary: 'text-primary-strong',
  danger: 'text-destructive',
  info: 'text-info',
};
const TONE_RING: Record<DialogOrigin['tone'], string> = {
  primary: 'ring-primary/70',
  danger: 'ring-destructive/60',
  info: 'ring-info/60',
};

export interface CharacterDialogActions {
  attackWith(characterId: string): void;
  giveTurn(characterId: string): void;
  /** Le personnage qui agit attaque celui-ci ; absent : personne n'agit. */
  aimAt?: { actorName: string; run(targetId: string): void; actorId: string };
}

export function CharacterDialog({
  campaignId,
  combat,
  characterId,
  member,
  playerName,
  origin,
  actions,
  canAttack,
  onBack,
  onClose,
}: Readonly<{
  campaignId: string;
  combat: CombatState | null;
  characterId: string | null;
  member: CastMember | null;
  playerName: string | null;
  origin: DialogOrigin;
  actions: CharacterDialogActions;
  /** Le menu d'attaque peut s'ouvrir (on est à la table). */
  canAttack: boolean;
  /** Retour à la liste des cibles (carte « Cibles (n) »). */
  onBack?: () => void;
  onClose(): void;
}>) {
  const participant =
    characterId && combat
      ? (combat.order.find((p) => p.characterId === characterId) ?? null)
      : null;
  return (
    <Dialog open={characterId !== null} onOpenChange={(open) => !open && onClose()}>
      {characterId && (
        <DialogContent className="isolate gap-0 p-0 sm:max-w-md">
          <DotsBackdrop tone={origin.tone} />
          <DialogBody
            key={characterId}
            campaignId={campaignId}
            characterId={characterId}
            participant={participant}
            current={participant !== null && currentActorId(combat) === characterId}
            member={member}
            playerName={playerName}
            origin={origin}
            actions={actions}
            canAttack={canAttack}
            onBack={onBack}
            onClose={onClose}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function Section({
  title,
  children,
  className,
}: Readonly<{
  title: string;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <section className={cn('space-y-2.5', className)}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{title}</h3>
      {children}
    </section>
  );
}

function DialogBody({
  campaignId,
  characterId,
  participant: p,
  current,
  member,
  playerName,
  origin,
  actions,
  canAttack,
  onBack,
  onClose,
}: Readonly<{
  campaignId: string;
  characterId: string;
  participant: CombatParticipant | null;
  current: boolean;
  member: CastMember | null;
  playerName: string | null;
  origin: DialogOrigin;
  actions: CharacterDialogActions;
  canAttack: boolean;
  onBack?: () => void;
  onClose(): void;
}>) {
  const t = useTranslations();
  const commands = useCombatCommands(campaignId);
  const { ctx, perso, sys, ecritures } = useFicheCalculee(characterId);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const name = member?.name ?? perso.data?.name ?? t('map.common.character');
  const side = p?.side ?? member?.side ?? null;

  const run = async (key: string, label: string, work: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await work();
      return true;
    } catch (err) {
      const message = combatFailure(err);
      if (message) toast.error(label, { description: message });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const systeme = sys.data?.systeme ?? null;
  const action = initiativeAction(systeme);
  const parametres = initiativeParams(action);
  const widgets = ctx ? widgetsDe(ctx) : [];
  const ressources = widgets.find((w) => w.type === 'ressources');
  const { stateSorts, stateIcons } = combatPresentation(sys.data?.presentation);
  const states = perso.data && systeme ? statesOf(perso.data, systeme, stateSorts, stateIcons) : [];
  const chips = p ? situationChips(p, { current, detailed: true }) : [];
  const Icon = origin.icon;

  const toggles = p ? participantToggles(p, commands) : [];

  return (
    <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <header className="flex items-center gap-3.5 px-5 pb-3 pt-5 pr-12">
        <Illustration
          largeur={56}
          src={member?.portraitUrl ?? perso.data?.portraitUrl ?? null}
          graine={name}
          position="top"
          className={cn(
            'size-14 shrink-0 rounded-2xl ring-2 ring-offset-2 ring-offset-background',
            TONE_RING[origin.tone],
            p?.defeated && 'grayscale',
          )}
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
              TONE_TEXT[origin.tone],
            )}
          >
            <Icon className="size-3" aria-hidden />
            {origin.label}
          </p>
          <DialogTitle className="truncate font-display text-xl leading-tight">{name}</DialogTitle>
          <DialogDescription className="truncate text-xs text-muted-foreground">
            {[side ? SIDE_LABELS[side].name : null, playerName].filter(Boolean).join(' · ') || ' '}
          </DialogDescription>
        </div>
      </header>

      <ToggleRow
        chips={chips}
        toggles={toggles}
        busy={busy}
        onToggle={(toggle) =>
          void run(toggle.key, t('combat.character.changeFailed'), () => toggle.set(!toggle.on))
        }
      />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto border-t border-border px-5 py-4">
        <CombatResources
          isError={perso.isError}
          error={perso.error}
          ctx={ctx}
          ressources={ressources}
        />

        <Section title={t('combat.character.states')}>
          {perso.data && systeme ? (
            <StatesManager
              systeme={systeme}
              stateSorts={stateSorts}
              states={states}
              sheet={perso.data}
              ecritures={ecritures}
              disabled={perso.data.permissions?.write === false}
            />
          ) : (
            <Skeleton className="h-9 w-full" />
          )}
        </Section>

        {p && (
          <InitiativeBlock
            participant={p}
            systeme={systeme}
            parametres={parametres}
            tri={systeme?.source.initiative?.tri ?? []}
            busy={busy}
            onReroll={(params) =>
              run('reroll', t('combat.character.rerollFailed'), () =>
                commands.rollParticipantInitiative(p.characterId, {
                  ...(Object.keys(params).length ? { params } : {}),
                  dice: 'server',
                }),
              )
            }
            onManual={(sortKeys) =>
              run('manual', t('combat.character.saveFailed'), () =>
                commands.updateParticipant(p.characterId, { sortKeys }),
              )
            }
          />
        )}
      </div>

      <footer className="flex items-center gap-1.5 border-t border-border px-4 py-3">
        {onBack && (
          <Info texte={t('combat.character.backToTargets')}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onBack}
              aria-label={t('combat.character.backToTargets')}
            >
              <ChevronLeft />
            </Button>
          </Info>
        )}
        <Info texte={t('map.tokens.inspector.openSheet')}>
          <Button variant="ghost" size="icon-sm" asChild>
            <PanelLink
              panel="joueurs"
              params={{ [TABLE_PARAMS.character]: characterId }}
              onClick={onClose}
              aria-label={t('map.tokens.inspector.openSheet')}
            >
              <ExternalLink />
            </PanelLink>
          </Button>
        </Info>
        {p && (
          <RemoveButton
            confirm={confirmRemove}
            busy={busy}
            onClick={() => {
              if (!confirmRemove) return setConfirmRemove(true);
              void run('remove', t('combat.character.removeFailed'), () =>
                commands.removeParticipant(p.characterId),
              ).then((ok) => ok && onClose());
            }}
            onBlur={() => setConfirmRemove(false)}
          />
        )}
        <span className="flex-1" />
        <TurnActions
          characterId={characterId}
          participant={p}
          current={current}
          canAttack={canAttack}
          actions={actions}
          onClose={onClose}
        />
      </footer>
    </div>
  );
}

/** Bascule d'un participant (caché, surpris, hors de combat). */
interface ParticipantToggle {
  key: string;
  label: string;
  icon: LucideIcon;
  on: boolean;
  danger?: boolean;
  set: (on: boolean) => Promise<unknown>;
}

/** Bascules d'un participant : caché aux joueurs, surpris, hors de combat. */
function participantToggles(
  p: CombatParticipant,
  commands: ReturnType<typeof useCombatCommands>,
): ParticipantToggle[] {
  return [
    {
      key: 'visible',
      label: translate('combat.hiddenShort'),
      icon: EyeOff,
      on: p.visibleToPlayers === false,
      set: (on) => commands.updateParticipant(p.characterId, { visibleToPlayers: !on }),
    },
    {
      key: 'surprised',
      label: translate('combat.situation.surprised'),
      icon: Zap,
      on: p.surprised === true,
      set: (on) => commands.updateParticipant(p.characterId, { surprised: on }),
    },
    {
      key: 'defeated',
      label: translate('combat.situation.defeated'),
      icon: Skull,
      on: p.defeated === true,
      danger: true,
      set: (on) => commands.updateParticipant(p.characterId, { defeated: on }),
    },
  ];
}

/** Bascules du participant, puis sa situation (tour, réactions, effets…). */
function ToggleRow({
  chips,
  toggles,
  busy,
  onToggle,
}: Readonly<{
  chips: ReturnType<typeof situationChips>;
  toggles: ParticipantToggle[];
  busy: string | null;
  onToggle(t: ParticipantToggle): void;
}>) {
  if (!(chips.length > 0 || toggles.length > 0)) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-5 pb-4">
      {toggles.map((t) => (
        <button
          key={t.key}
          type="button"
          aria-pressed={t.on}
          disabled={busy !== null}
          onClick={() => onToggle(t)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-60',
            toggleTone(t.on, t.danger),
          )}
        >
          {busy === t.key ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <t.icon className="size-3.5" aria-hidden />
          )}
          {t.label}
        </button>
      ))}
      <SituationChips chips={chips} />
    </div>
  );
}

/** Ressources du personnage (PV…), ou l'erreur et le chargement de sa fiche. */
function CombatResources({
  isError,
  error,
  ctx,
  ressources,
}: Readonly<{
  isError: boolean;
  error: unknown;
  ctx: ReturnType<typeof useFicheCalculee>['ctx'];
  ressources: ReturnType<typeof widgetsDe>[number] | undefined;
}>) {
  if (isError) return <p className="text-sm text-destructive">{combatErrorMessage(error)}</p>;
  if (!ctx) return <Skeleton className="h-16 w-full rounded-xl" />;
  if (ressources?.type !== 'ressources' || ressources.attributs.length === 0) return null;
  return (
    <div className="-mx-3 [&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none">
      <BlocRessources ctx={ctx} widget={ressources} />
    </div>
  );
}

/** Retirer du combat, en deux clics (le second confirme). */
function RemoveButton({
  confirm,
  busy,
  onClick,
  onBlur,
}: Readonly<{ confirm: boolean; busy: string | null; onClick(): void; onBlur(): void }>) {
  const t = useTranslations();
  return (
    <Info texte={confirm ? t('combat.character.clickToConfirm') : t('combat.character.remove')}>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn('hover:text-destructive', confirm && 'bg-destructive/15 text-destructive')}
        aria-label={confirm ? t('combat.character.confirmRemove') : t('combat.character.remove')}
        disabled={busy !== null && busy !== 'remove'}
        onClick={onClick}
        onBlur={onBlur}
      >
        {busy === 'remove' ? <Loader2 className="animate-spin" /> : <UserMinus />}
      </Button>
    </Info>
  );
}

/** Donner le tour, viser avec l'acteur du tour, ou attaquer avec ce personnage. */
function TurnActions({
  characterId,
  participant: p,
  current,
  canAttack,
  actions,
  onClose,
}: Readonly<{
  characterId: string;
  participant: CombatParticipant | null;
  current: boolean;
  canAttack: boolean;
  actions: CharacterDialogActions;
  onClose(): void;
}>) {
  const t = useTranslations();
  const aimAt = actions.aimAt;
  return (
    <>
      {p && !current && !p.defeated && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            actions.giveTurn(characterId);
            onClose();
          }}
        >
          <Hand />
          {t('combat.character.giveTurn')}
        </Button>
      )}
      {canAttack && aimAt && aimAt.actorId !== characterId && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            aimAt.run(characterId);
            onClose();
          }}
        >
          <Crosshair />
          Viser avec {aimAt.actorName}
        </Button>
      )}
      {canAttack && !p?.defeated && (
        <Button
          size="sm"
          onClick={() => {
            actions.attackWith(characterId);
            onClose();
          }}
        >
          <Swords />
          {t('combat.character.attack')}
        </Button>
      )}
    </>
  );
}

function InitiativeBlock({
  participant: p,
  systeme,
  parametres,
  tri,
  busy,
  onReroll,
  onManual,
}: Readonly<{
  participant: CombatParticipant;
  systeme: Parameters<typeof InitiativeParamsForm>[0]['systeme'] | null;
  parametres: Parameters<typeof InitiativeParamsForm>[0]['parametres'];
  tri: readonly string[];
  busy: string | null;
  onReroll(params: ActionParams): Promise<boolean>;
  onManual(sortKeys: number[]): Promise<boolean>;
}>) {
  const t = useTranslations();
  const [params, setParams] = useState<ActionParams>(p.initiative?.params ?? {});
  const [manual, setManual] = useState<string[] | null>(null);
  const keys = Math.max(1, tri.length);
  const manualValid =
    manual !== null && manual.every((v) => v.trim() !== '' && Number.isFinite(Number(v)));

  const score = p.sortKeys.length ? p.sortKeys[0] : null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          {t('combat.initiative.title')}
        </span>
        <span className="font-mono text-xl font-bold tabular-nums">
          {score ?? (p.initiativePending ? '…' : '—')}
        </span>
        <span className="flex-1" />
        <Info
          texte={p.sortKeys.length ? t('combat.initiative.reroll') : t('combat.character.roll')}
        >
          <Button
            size="icon-sm"
            variant="secondary"
            aria-label={
              p.sortKeys.length
                ? t('combat.character.rerollInitiative')
                : t('combat.initiative.roll')
            }
            disabled={busy !== null}
            onClick={() => void onReroll(params)}
          >
            {busy === 'reroll' ? <Loader2 className="animate-spin" /> : <Dices />}
          </Button>
        </Info>
        <Info texte={t('combat.character.enterResult')}>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('combat.character.enterInitiative')}
            aria-pressed={manual !== null}
            disabled={busy !== null}
            onClick={() =>
              setManual(
                manual === null
                  ? Array.from({ length: keys }, (_, i) =>
                      p.sortKeys[i] !== undefined ? String(p.sortKeys[i]) : '',
                    )
                  : null,
              )
            }
          >
            <PencilLine />
          </Button>
        </Info>
      </div>

      {systeme && parametres.length > 0 && (
        // « Par défaut » : le choix du camp (l'ancien « Camp (défaut) ») ; un autre choix ne
        // vaut que pour ce personnage (isolé et surpris quand son groupe est préparé)
        <InitiativeParamsForm
          systeme={systeme}
          parametres={parametres}
          value={params}
          onChange={setParams}
          idPrefix={`init-${p.characterId}`}
          disabled={busy !== null}
        />
      )}

      {manual !== null && (
        <form
          className="space-y-2 rounded-xl border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!manualValid) return;
            void onManual(manual.map(Number)).then((ok) => ok && setManual(null));
          }}
        >
          {manual.map((v, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Label htmlFor={`manual-${i}`} className="font-mono text-xs">
                {tri[i] ?? t('combat.initiative.title')}
              </Label>
              <Input
                id={`manual-${i}`}
                type="number"
                inputMode="numeric"
                value={v}
                onChange={(e) => setManual(manual.map((x, j) => (j === i ? e.target.value : x)))}
                className="h-8 w-24 text-right font-mono tabular-nums"
              />
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button type="button" size="xs" variant="ghost" onClick={() => setManual(null)}>
              {t('common.actions.cancel')}
            </Button>
            <Button type="submit" size="xs" disabled={!manualValid} loading={busy === 'manual'}>
              {t('common.actions.save')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Teinte d'un interrupteur d'état : actif (danger ou non) ou inactif. */
function toggleTone(on: boolean, danger: boolean | undefined): string {
  if (!on) return 'border-border bg-surface/60 text-muted-foreground hover:text-foreground';
  return danger
    ? 'border-destructive/40 bg-destructive/15 text-destructive'
    : 'border-primary/40 bg-primary/15 text-primary-strong';
}

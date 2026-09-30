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
import type { ActionParams, CombatParticipant, CombatState } from '@vtt/contracts';
import {
  ChevronLeft,
  Dices,
  ExternalLink,
  EyeOff,
  Hand,
  PencilLine,
  Skull,
  Swords,
  UserMinus,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { TuileAttribut } from '@/components/creation/apercu-fiche';
import { Illustration } from '@/components/commun/illustration';
import { useFicheCalculee } from '@/components/fiche/fiche-personnage';
import { BannerIdentity, BannerStats } from '@/components/fiche/banner';
import { BlocRessources, clesAttributs, widgetsDe } from '@/components/fiche/widgets';
import { PanelLink } from '@/components/table/panels/navigation';
import { TABLE_PARAMS } from '@/components/table/panels/registry';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { combatErrorMessage } from '@/lib/combat/api';
import { combatFailure, currentActorId, useCombatCommands } from '@/lib/combat/use-combat';
import { cn } from '@/lib/utils';
import { InitiativeParamsForm, initiativeAction, initiativeParams } from './initiative-form';
import { SIDE_LABELS } from './model';
import { SituationChips } from './parts';
import { situationChips } from './situation';
import { StatesManager } from './states-manager';
import { combatPresentation, statesOf, type CastMember } from './use-cast';

const SOURCES: Record<string, string> = {
  server: 'tirée par le serveur',
  physical: 'dés 3D',
  mixed: 'dés 3D et serveur',
  manual: 'saisie par le MJ',
};

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
}: {
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
}) {
  const participant =
    characterId && combat
      ? (combat.order.find((p) => p.characterId === characterId) ?? null)
      : null;
  return (
    <Dialog open={characterId !== null} onOpenChange={(open) => !open && onClose()}>
      {characterId && (
        <DialogContent className="gap-0 p-0 sm:max-w-3xl">
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
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
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
}: {
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
}) {
  const commands = useCombatCommands(campaignId);
  const { ctx, perso, sys, ecritures } = useFicheCalculee(characterId);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const name = member?.name ?? perso.data?.name ?? 'Personnage';
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
  const details = widgets.find((w) => w.type === 'details');
  const attributs = ctx
    ? widgets.flatMap((w) =>
        w.type === 'attributs' ? [{ titre: w.titre, cles: clesAttributs(ctx, w) }] : [],
      )
    : [];
  const { stateSorts, stateIcons } = combatPresentation(sys.data?.presentation);
  const states = perso.data && systeme ? statesOf(perso.data, systeme, stateSorts, stateIcons) : [];
  const chips = p ? situationChips(p, { current, detailed: true }) : [];
  const Icon = origin.icon;

  return (
    <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <header className="flex items-center gap-4 border-b border-border px-5 py-4 pr-12">
        <Illustration
          src={member?.portraitUrl ?? perso.data?.portraitUrl ?? null}
          graine={name}
          position="top"
          className={cn(
            'size-16 shrink-0 rounded-2xl ring-2',
            TONE_RING[origin.tone],
            p?.defeated && 'grayscale',
          )}
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider',
              TONE_TEXT[origin.tone],
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {origin.label}
          </p>
          <DialogTitle className="truncate text-xl">{name}</DialogTitle>
          <DialogDescription className="truncate text-xs">
            {[side ? SIDE_LABELS[side].name : null, playerName ? `joué par ${playerName}` : null]
              .filter(Boolean)
              .join(' · ') || 'Personnage de la campagne'}
          </DialogDescription>
          {(p || chips.length > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {p?.visibleToPlayers === false && (
                <Badge ton="info">
                  <EyeOff />
                  Caché aux joueurs
                </Badge>
              )}
              {p?.defeated && (
                <Badge ton="danger">
                  <Skull />
                  Hors de combat
                </Badge>
              )}
              <SituationChips chips={chips} />
            </div>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {ctx && details?.type === 'details' && (
          <div className="space-y-2">
            <BannerIdentity ctx={ctx} widget={details} />
            <BannerStats ctx={ctx} widget={details} />
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-5">
            <Section title="Ressources">
              {perso.isError ? (
                <p className="text-sm text-destructive">{combatErrorMessage(perso.error)}</p>
              ) : !ctx ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : ressources?.type === 'ressources' && ressources.attributs.length ? (
                <div className="-mx-3 [&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:shadow-none">
                  <BlocRessources ctx={ctx} widget={ressources} />
                </div>
              ) : (
                <p className="text-[13px] text-subtle">Aucune ressource suivie par ce système.</p>
              )}
            </Section>

            <Section title="États">
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
          </div>

          <div className="space-y-5">
            {p && (
              <Section title="Au combat">
                <div className="space-y-2.5 rounded-xl border border-border bg-surface/60 p-3">
                  <SwitchRow
                    id="participant-visible"
                    label="Visible des joueurs"
                    checked={p.visibleToPlayers !== false}
                    disabled={busy !== null}
                    onChange={(on) =>
                      void run('visible', 'La visibilité n’a pas pu changer', () =>
                        commands.updateParticipant(p.characterId, { visibleToPlayers: on }),
                      )
                    }
                  />
                  <SwitchRow
                    id="participant-surprised"
                    label="Surpris"
                    hint="Lu par les règles du système (surprise, attaque sournoise…)"
                    checked={p.surprised === true}
                    disabled={busy !== null}
                    onChange={(on) =>
                      void run('surprised', 'La surprise n’a pas pu changer', () =>
                        commands.updateParticipant(p.characterId, { surprised: on }),
                      )
                    }
                  />
                  <SwitchRow
                    id="participant-defeated"
                    label="Hors de combat"
                    checked={p.defeated === true}
                    disabled={busy !== null}
                    onChange={(on) =>
                      void run('defeated', 'L’état n’a pas pu changer', () =>
                        commands.updateParticipant(p.characterId, { defeated: on }),
                      )
                    }
                  />
                </div>
              </Section>
            )}

            {p && (
              <Section title="Initiative">
                <InitiativeBlock
                  participant={p}
                  systeme={systeme}
                  parametres={parametres}
                  tri={systeme?.source.initiative?.tri ?? []}
                  busy={busy}
                  onReroll={(params) =>
                    run('reroll', 'L’initiative n’a pas pu être relancée', () =>
                      commands.rollParticipantInitiative(p.characterId, {
                        ...(Object.keys(params).length ? { params } : {}),
                        dice: 'server',
                      }),
                    )
                  }
                  onManual={(sortKeys) =>
                    run('manual', 'L’initiative n’a pas pu être enregistrée', () =>
                      commands.updateParticipant(p.characterId, { sortKeys }),
                    )
                  }
                />
              </Section>
            )}

            {ctx && attributs.some((g) => g.cles.length) && (
              <Section title="Caractéristiques">
                <div className="space-y-3">
                  {attributs
                    .filter((g) => g.cles.length)
                    .map((g) => (
                      <div key={g.titre} className="space-y-1.5">
                        {attributs.length > 1 && (
                          <p className="text-xs font-medium text-muted-foreground">{g.titre}</p>
                        )}
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
                          {g.cles.map((c) => (
                            <TuileAttribut key={c} fiche={ctx.fiche} cle={c} compacte />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </Section>
            )}
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft />
            Retour aux cibles
          </Button>
        )}
        <Button variant="secondary" size="sm" asChild>
          <PanelLink
            panel="joueurs"
            params={{ [TABLE_PARAMS.character]: characterId }}
            onClick={onClose}
          >
            <ExternalLink />
            Ouvrir la fiche
          </PanelLink>
        </Button>
        {p && !current && !p.defeated && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              actions.giveTurn(characterId);
              onClose();
            }}
          >
            <Hand />
            Donner le tour
          </Button>
        )}
        <span className="flex-1" />
        {p && (
          <Button
            variant="destructive"
            size="sm"
            loading={busy === 'remove'}
            disabled={busy !== null && busy !== 'remove'}
            onClick={() => {
              if (!confirmRemove) return setConfirmRemove(true);
              void run('remove', 'Le participant n’a pas pu être retiré', () =>
                commands.removeParticipant(p.characterId),
              ).then((ok) => ok && onClose());
            }}
            onBlur={() => setConfirmRemove(false)}
          >
            <UserMinus />
            {confirmRemove ? 'Confirmer le retrait' : 'Retirer du combat'}
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
            Attaquer avec
          </Button>
        )}
      </footer>
    </div>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled: boolean;
  onChange(on: boolean): void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="min-w-0">
        <Label htmlFor={id} className="text-[13px]">
          {label}
        </Label>
        {hint && <span className="block text-[11px] text-subtle">{hint}</span>}
      </span>
      <Switch id={id} disabled={disabled} checked={checked} onCheckedChange={onChange} />
    </div>
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
}: {
  participant: CombatParticipant;
  systeme: Parameters<typeof InitiativeParamsForm>[0]['systeme'] | null;
  parametres: Parameters<typeof InitiativeParamsForm>[0]['parametres'];
  tri: readonly string[];
  busy: string | null;
  onReroll(params: ActionParams): Promise<boolean>;
  onManual(sortKeys: number[]): Promise<boolean>;
}) {
  const [params, setParams] = useState<ActionParams>(p.initiative?.params ?? {});
  const [manual, setManual] = useState<string[] | null>(null);
  const keys = Math.max(1, tri.length);
  const manualValid =
    manual !== null && manual.every((v) => v.trim() !== '' && Number.isFinite(Number(v)));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-surface px-3 py-2">
        {p.initiative ? (
          <>
            <p className="font-mono text-sm tabular-nums">{p.initiative.summary}</p>
            <p className="text-[11px] text-subtle">
              {SOURCES[p.initiative.source] ?? p.initiative.source}
            </p>
          </>
        ) : p.sortKeys.length ? (
          <p className="font-mono text-sm tabular-nums">{p.sortKeys.join(' · ')}</p>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            {p.initiativePending ? 'Demandée au joueur, pas encore lancée.' : 'Pas encore tirée.'}
          </p>
        )}
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

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          loading={busy === 'reroll'}
          disabled={busy !== null && busy !== 'reroll'}
          onClick={() => void onReroll(params)}
        >
          <Dices />
          {p.sortKeys.length ? 'Relancer' : 'Lancer'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
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
          Saisir
        </Button>
      </div>

      {manual !== null && (
        <form
          className="space-y-2 rounded-xl border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!manualValid) return;
            void onManual(manual.map(Number)).then((ok) => ok && setManual(null));
          }}
        >
          <p className="text-[11px] text-subtle">Dés lancés à la table : saisissez le résultat.</p>
          {manual.map((v, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <Label htmlFor={`manual-${i}`} className="font-mono text-xs">
                {tri[i] ?? 'Initiative'}
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
              Annuler
            </Button>
            <Button type="submit" size="xs" disabled={!manualValid} loading={busy === 'manual'}>
              Enregistrer
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

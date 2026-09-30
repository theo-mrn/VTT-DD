'use client';

/**
 * Fiche d'un participant (tiroir du panneau Combat, docs/combat.md § 12.3) : bandeau,
 * visibilité et hors de combat, ressources modifiables (le bloc de la fiche), états et durées,
 * initiative (détail, paramètres de relance : l'ancien « override » par personnage, saisie des
 * clés pour des dés lancés à la table), « Ouvrir la fiche », « Retirer du combat ».
 */
import type { ActionParams, CombatParticipant, CombatState } from '@vtt/contracts';
import { Dices, ExternalLink, EyeOff, PencilLine, Skull, UserMinus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { useFicheCalculee } from '@/components/fiche/fiche-personnage';
import { BannerIdentity, BannerStats } from '@/components/fiche/banner';
import { BlocRessources, widgetsDe } from '@/components/fiche/widgets';
import { PanelLink } from '@/components/table/panels/navigation';
import { TABLE_PARAMS } from '@/components/table/panels/registry';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { combatErrorMessage } from '@/lib/combat/api';
import { combatFailure, useCombatCommands } from '@/lib/combat/use-combat';
import { SIDE_LABELS } from './model';
import { InitiativeParamsForm, initiativeAction, initiativeParams } from './initiative-form';
import { StatesManager } from './states-manager';
import { combatPresentation, statesOf, type CastMember } from './use-cast';

const SOURCES: Record<string, string> = {
  server: 'tirée par le serveur',
  physical: 'dés 3D',
  mixed: 'dés 3D et serveur',
  manual: 'saisie par le MJ',
};

export function ParticipantDrawer({
  campaignId,
  combat,
  characterId,
  member,
  playerName,
  onClose,
}: {
  campaignId: string;
  combat: CombatState;
  characterId: string | null;
  member: CastMember | null;
  playerName: string | null;
  onClose(): void;
}) {
  const participant = characterId
    ? (combat.order.find((p) => p.characterId === characterId) ?? null)
    : null;
  return (
    <Dialog open={participant !== null} onOpenChange={(open) => !open && onClose()}>
      {participant && (
        <SheetContent cote="right" className="overflow-y-auto sm:max-w-md">
          <DrawerBody
            key={participant.characterId}
            campaignId={campaignId}
            participant={participant}
            member={member}
            playerName={playerName}
            onClose={onClose}
          />
        </SheetContent>
      )}
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5 border-t border-border px-5 py-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h3>
      {children}
    </section>
  );
}

function DrawerBody({
  campaignId,
  participant: p,
  member,
  playerName,
  onClose,
}: {
  campaignId: string;
  participant: CombatParticipant;
  member: CastMember | null;
  playerName: string | null;
  onClose(): void;
}) {
  const commands = useCombatCommands(campaignId);
  const { ctx, perso, sys, ecritures } = useFicheCalculee(p.characterId);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const name = member?.name ?? perso.data?.name ?? 'Personnage';

  const run = async (key: string, label: string, work: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await work();
      return true;
    } catch (err) {
      {
        const message = combatFailure(err);
        if (message) toast.error(label, { description: message });
      }
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
  // Bandeau de la fiche (présentation du système) : identité et valeurs clés
  const details = widgets.find((w) => w.type === 'details');
  const { stateSorts } = combatPresentation(sys.data?.presentation);
  const states = perso.data && systeme ? statesOf(perso.data, systeme, stateSorts) : [];

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 px-5 pb-4 pt-5 pr-12">
        <Illustration
          src={member?.portraitUrl ?? perso.data?.portraitUrl ?? null}
          graine={name}
          position="top"
          className="size-14 shrink-0 rounded-xl ring-1 ring-border"
        />
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-base">{name}</DialogTitle>
          <DialogDescription className="truncate text-xs">
            {[SIDE_LABELS[p.side].name, playerName ? `joué par ${playerName}` : null]
              .filter(Boolean)
              .join(' · ')}
          </DialogDescription>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {p.hasActed && <Badge>A agi ce round</Badge>}
            {p.visibleToPlayers === false && (
              <Badge ton="info">
                <EyeOff />
                Caché aux joueurs
              </Badge>
            )}
            {p.defeated && (
              <Badge ton="danger">
                <Skull />
                Hors de combat
              </Badge>
            )}
          </div>
        </div>
      </header>

      {ctx && details?.type === 'details' && (
        <div className="space-y-2 px-5 pb-4">
          <BannerIdentity ctx={ctx} widget={details} />
          <BannerStats ctx={ctx} widget={details} />
        </div>
      )}

      <Section title="Au combat">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="participant-visible" className="text-[13px]">
            Visible des joueurs
          </Label>
          <Switch
            id="participant-visible"
            disabled={busy !== null}
            checked={p.visibleToPlayers !== false}
            onCheckedChange={(on) =>
              void run('visible', 'La visibilité n’a pas pu changer', () =>
                commands.updateParticipant(p.characterId, { visibleToPlayers: on }),
              )
            }
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="participant-defeated" className="text-[13px]">
            Hors de combat
          </Label>
          <Switch
            id="participant-defeated"
            disabled={busy !== null}
            checked={p.defeated === true}
            onCheckedChange={(on) =>
              void run('defeated', 'L’état n’a pas pu changer', () =>
                commands.updateParticipant(p.characterId, { defeated: on }),
              )
            }
          />
        </div>
      </Section>

      <Section title="Ressources">
        {perso.isError ? (
          <p className="text-sm text-destructive">{combatErrorMessage(perso.error)}</p>
        ) : !ctx ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : ressources?.type === 'ressources' && ressources.attributs.length ? (
          <div className="-mx-5 [&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:shadow-none">
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

      <footer className="mt-auto flex flex-wrap items-center gap-2 border-t border-border px-5 py-4">
        <Button variant="secondary" size="sm" asChild>
          <PanelLink
            panel="joueurs"
            params={{ [TABLE_PARAMS.character]: p.characterId }}
            onClick={onClose}
          >
            <ExternalLink />
            Ouvrir la fiche
          </PanelLink>
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="ml-auto"
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
      </footer>
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
      <div className="rounded-lg border border-border bg-surface px-3 py-2">
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
          className="space-y-2 rounded-lg border border-border p-3"
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

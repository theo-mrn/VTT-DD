'use client';

/**
 * Pièces du combat reprises par la barre du MJ (docs/combat.md § 12.6) : la liste des cibles
 * des rapports en attente (menu ⋯, puis la fiche de l'une d'elles) et « Qui agit ? » d'un
 * créneau sans acteur (mode slots, dans l'ordre déplié).
 */
import type { CampaignSide } from '@vtt/contracts';
import { ChevronRight, UserCheck, type LucideIcon } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { SIDE_LABELS } from './model';
import { KeyStats } from './parts';
import type { CastMember, ParticipantSheet } from './use-cast';

type Tone = 'primary';

const TONES: Record<Tone, { border: string; text: string }> = {
  primary: { border: 'border-primary/45', text: 'text-primary-strong' },
};

function CardLabel({
  tone,
  icon: Icon,
  children,
}: Readonly<{
  tone: Tone;
  icon: LucideIcon;
  children: ReactNode;
}>) {
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

/** Liste des cibles (plusieurs) : un clic ouvre la fiche de l'une d'elles. */
export function TargetsDialog({
  open,
  onOpenChange,
  ids,
  cast,
  sheets,
  onPick,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  ids: readonly string[];
  cast: ReadonlyMap<string, CastMember>;
  sheets: ReadonlyMap<string, ParticipantSheet>;
  onPick(characterId: string): void;
}>) {
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
                    largeur={40}
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
}: Readonly<{
  side: CampaignSide;
  candidates: readonly { characterId: string; acted: boolean }[];
  cast: ReadonlyMap<string, CastMember>;
  busy: boolean;
  onChoose(characterId: string, force: boolean): void;
}>) {
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
                    largeur={24}
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

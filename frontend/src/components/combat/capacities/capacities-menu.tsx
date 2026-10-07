'use client';

/**
 * Menu « Capacités » du combat (docs/combat.md § 19.1) : les capacités utilisables de l'acteur,
 * rangées comme la vue Capacités de la fiche (actives, à activer, usages limités, autres), avec
 * leurs usages et leur durée ; le texte de la règle au survol. Jouer une capacité :
 * - à activer : l'interrupteur l'active sur la fiche (usage consommé, durée lancée) ;
 * - action dédiée : le menu d'attaque s'ouvre sur elle ;
 * - sinon : le menu d'attaque s'ouvre sur l'action générique, la capacité en paramètre (ses dés
 *   lancés, son texte au MJ). L'usage est consommé à la déclaration.
 */
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { DurationChip, timerOf } from '@/components/combat/duration-chip';
import { useFicheCalculee } from '@/components/fiche/fiche-personnage';
import { sheetWrites } from '@/components/fiche/blocks/tree/writes';
import { UsesChip } from '@/components/fiche/blocks/skills/uses';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { openAttackMenu } from '@/lib/combat/attack-menu-store';
import {
  capacitesDeCombat,
  closeCapacitiesMenu,
  groupeDe,
  useCapacitiesMenu,
  type CapaciteCombat,
  type CapacitiesMenuRequest,
  type GroupeCapacites,
} from '@/lib/combat/capacities';
import { cn } from '@/lib/utils';

const GROUPES: readonly GroupeCapacites[] = ['actives', 'aActiver', 'limitees', 'autres'];

/** Monté par l'hôte du menu d'attaque de la table : s'ouvre pour cette campagne. */
export function CapacitiesMenu({ campaignId }: Readonly<{ campaignId: string }>) {
  const request = useCapacitiesMenu();
  const open = request?.campaignId === campaignId;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeCapacitiesMenu()}>
      {open && request && <Contenu request={request} />}
    </Dialog>
  );
}

function Contenu({ request }: Readonly<{ request: CapacitiesMenuRequest }>) {
  const t = useTranslations('combat.capacities');
  const { ctx } = useFicheCalculee(request.actorId);
  const capacites = useMemo(
    () => (ctx ? capacitesDeCombat(ctx.systeme, ctx.presentation, ctx.fiche) : []),
    [ctx],
  );
  const writes = ctx ? sheetWrites(ctx, 'read') : undefined;
  const groupes = GROUPES.map(
    (g) => [g, capacites.filter((c) => groupeDe(c) === g)] as const,
  ).filter(([, l]) => l.length > 0);

  function jouer(c: CapaciteCombat, actionId: string, params?: Record<string, string>) {
    closeCapacitiesMenu();
    const soi = c.entree.champs.cibles === 'soi' || !c.entree.champs.cibles;
    openAttackMenu({
      campaignId: request.campaignId,
      origin: request.origin,
      attackerId: request.actorId,
      actionId,
      ...(params ? { params } : {}),
      ...(c.usages ? { usage: c.entree.id } : {}),
      ...(soi && c.jeu.type === 'generique' ? { targetIds: [request.actorId] } : {}),
    });
  }

  return (
    <DialogContent className="max-w-lg gap-0 p-0">
      <div className="border-b border-border px-5 py-4">
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription className="text-xs">{ctx?.personnage.name}</DialogDescription>
      </div>
      <div className="max-h-[70dvh] overflow-y-auto px-3 py-2">
        {ctx && capacites.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('none')}</p>
        )}
        {groupes.map(([groupe, liste]) => (
          <section key={groupe} aria-label={t(`groups.${groupe}`)} className="pb-2">
            <h3 className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-subtle">
              {t(`groups.${groupe}`)}
            </h3>
            <ul>
              {liste.map((c) => (
                <Ligne
                  key={c.entree.id}
                  c={c}
                  modifiable={Boolean(writes)}
                  onActiver={(v) => writes?.setActive(c.entree.id, v)}
                  onJouer={jouer}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </DialogContent>
  );
}

function Ligne({
  c,
  modifiable,
  onActiver,
  onJouer,
}: Readonly<{
  c: CapaciteCombat;
  modifiable: boolean;
  onActiver: (actif: boolean) => void;
  onJouer: (c: CapaciteCombat, actionId: string, params?: Record<string, string>) => void;
}>) {
  const t = useTranslations('combat.capacities');
  const minuterie = c.possession.exemplaires.map(timerOf).find((x) => x !== null) ?? null;
  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="min-w-0 flex-1 cursor-help rounded">
            <span
              className={cn(
                'block truncate text-sm font-medium',
                c.epuisee ? 'text-subtle' : 'text-foreground',
              )}
            >
              {c.entree.nom}
            </span>
            {c.activation && (
              <span className="block truncate text-[11px] text-subtle">{c.activation}</span>
            )}
          </span>
        </TooltipTrigger>
        {c.entree.description && (
          <TooltipContent side="left" className="max-w-sm whitespace-pre-line py-2 leading-relaxed">
            {c.entree.description}
          </TooltipContent>
        )}
      </Tooltip>
      {minuterie && <DurationChip timer={minuterie} />}
      {c.usages && <UsesChip uses={c.usages} />}
      {c.jeu.type === 'activer' && (
        <Switch
          checked={c.active}
          disabled={!modifiable || (!c.active && c.epuisee)}
          onCheckedChange={onActiver}
          aria-label={t(c.active ? 'deactivate' : 'activate', { name: c.entree.nom })}
        />
      )}
      {c.jeu.type === 'actions' &&
        c.jeu.actions.map((a) => (
          <Button
            key={a.id}
            size="xs"
            variant="secondary"
            disabled={c.epuisee}
            onClick={() => onJouer(c, a.id)}
          >
            {c.jeu.type === 'actions' && c.jeu.actions.length > 1 ? a.nom : t('use')}
          </Button>
        ))}
      {c.jeu.type === 'generique' && (
        <Button
          size="xs"
          variant="secondary"
          disabled={c.epuisee}
          onClick={() =>
            c.jeu.type === 'generique' &&
            onJouer(c, c.jeu.action.id, { [c.jeu.parametre]: c.entree.id })
          }
        >
          {t('use')}
        </Button>
      )}
    </li>
  );
}

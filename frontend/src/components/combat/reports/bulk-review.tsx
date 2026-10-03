'use client';

/**
 * « Tout appliquer » (docs/combat.md § 7.4) : revue groupée des rapports en attente, comme
 * l'ancienne app : une ligne par cible, cochée ; valeurs modifiables une à une ; ajustement
 * global ±1 des lignes cochées ; puis une application par rapport, en un appel au serveur
 * (tout ou rien, par lots de 50). Une ligne décochée reste en attente. Les personnages tombés
 * sont réunis ensuite dans le dialogue « Hors de combat ».
 */
import type { Attack } from '@vtt/contracts';
import type { SystemeCharge } from '@vtt/rules';
import { ArrowRight, CheckCheck, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { combatErrorMessage } from '@/lib/combat/api';
import { useAttackCommands } from '@/lib/combat/use-attacks';
import { cn } from '@/lib/utils';
import { CheckBox } from '../check-box';
import type { CastMember } from '../turns/use-cast';
import { reportDefeated } from './defeated-dialog';
import { attributeLabel, modificationText } from './labels';
import {
  adjust,
  adjustSelected,
  buildApplyAll,
  bulkRows,
  defeatedBy,
  isAmount,
  setAmount,
  type BulkRow,
} from './model';

export function BulkReview({
  open,
  onOpenChange,
  campaignId,
  attacks,
  systeme,
  cast,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  campaignId: string;
  attacks: readonly Attack[];
  systeme: SystemeCharge | null;
  cast: ReadonlyMap<string, CastMember>;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {open && (
          <ReviewBody
            campaignId={campaignId}
            attacks={attacks}
            systeme={systeme}
            cast={cast}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewBody({
  campaignId,
  attacks,
  systeme,
  cast,
  onDone,
}: Readonly<{
  campaignId: string;
  attacks: readonly Attack[];
  systeme: SystemeCharge | null;
  cast: ReadonlyMap<string, CastMember>;
  onDone(): void;
}>) {
  const commands = useAttackCommands(campaignId);
  // Figée à l'ouverture : un rapport arrivé pendant la revue attend la suivante
  const [snapshot] = useState(() => [...attacks]);
  const [rows, setRows] = useState<BulkRow[]>(() => bulkRows(snapshot));
  const [busy, setBusy] = useState(false);
  const selected = rows.filter((r) => r.selected).length;
  const nameOf = (id: string) => cast.get(id)?.name ?? 'Personnage';

  const update = (key: string, patch: Partial<BulkRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const apply = async () => {
    const batches = buildApplyAll(snapshot, rows);
    if (!batches.length) return;
    setBusy(true);
    let applied = 0;
    try {
      for (const batch of batches) {
        const done = await commands.applyMany(batch);
        applied += done.length;
        reportDefeated(done.flatMap(defeatedBy));
      }
      toast.success(
        `${applied} rapport${applied > 1 ? 's' : ''} appliqué${applied > 1 ? 's' : ''}`,
      );
      onDone();
    } catch (err) {
      toast.error(
        applied
          ? `${applied} rapport(s) appliqué(s), la suite a échoué`
          : 'Les rapports n’ont pas pu être appliqués',
        { description: combatErrorMessage(err) },
      );
    } finally {
      setBusy(false);
    }
  };

  const all = selected === rows.length ? true : selected ? ('mixed' as const) : false;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Tout appliquer</DialogTitle>
        <DialogDescription>
          {rows.length} cible{rows.length > 1 ? 's' : ''} dans {snapshot.length} rapport
          {snapshot.length > 1 ? 's' : ''}. Une ligne décochée reste en attente.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-2">
        <CheckBox
          checked={all}
          onChange={(on) => setRows((rs) => rs.map((r) => ({ ...r, selected: on })))}
          label="Tout cocher"
        />
        <span className="flex-1 text-[13px] text-muted-foreground">
          {selected} cochée{selected > 1 ? 's' : ''}
        </span>
        <span className="text-xs text-muted-foreground">Ajustement global</span>
        <Button
          size="icon-sm"
          variant="secondary"
          disabled={busy || !selected}
          onClick={() => setRows((rs) => adjustSelected(rs, -1))}
          aria-label="Un de moins sur les lignes cochées"
        >
          <Minus />
        </Button>
        <Button
          size="icon-sm"
          variant="secondary"
          disabled={busy || !selected}
          onClick={() => setRows((rs) => adjustSelected(rs, 1))}
          aria-label="Un de plus sur les lignes cochées"
        >
          <Plus />
        </Button>
      </div>

      <ul className="max-h-[55dvh] space-y-1.5 overflow-y-auto pr-1">
        {rows.map((r) => {
          const targetType = cast.get(r.characterId)?.type ?? null;
          return (
            <li
              key={r.key}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3 py-2',
                r.selected ? 'border-border bg-surface' : 'border-dashed border-border opacity-60',
              )}
            >
              <CheckBox
                checked={r.selected}
                onChange={(on) => update(r.key, { selected: on })}
                label={`Appliquer à ${nameOf(r.characterId)}`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-[13px] font-medium">
                  <span className="truncate">{nameOf(r.attackerId)}</span>
                  <ArrowRight className="size-3 shrink-0 text-subtle" aria-hidden />
                  <span className="truncate">{nameOf(r.characterId)}</span>
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {r.actionName}
                  {r.modifications.some((m) => !isAmount(m))
                    ? ` · ${r.modifications
                        .filter((m) => !isAmount(m))
                        .map((m) => modificationText(systeme, m, targetType))
                        .join(', ')}`
                    : ''}
                </span>
              </span>
              {r.modifications.map((m, i) =>
                isAmount(m) ? (
                  <span key={i} className="flex items-center gap-0.5">
                    <span className="mr-1 text-[11px] text-muted-foreground">
                      {m.operation === 'add' ? '+' : '−'}{' '}
                      {attributeLabel(systeme, m.attribute, targetType)}
                    </span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={busy || m.value <= 0}
                      onClick={() =>
                        update(r.key, { modifications: adjust(r.modifications, -1, i) })
                      }
                      aria-label="Un de moins"
                    >
                      <Minus />
                    </Button>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={String(m.value)}
                      disabled={busy}
                      onChange={(e) =>
                        update(r.key, {
                          modifications: setAmount(r.modifications, i, Number(e.target.value)),
                        })
                      }
                      className="h-7 w-14 px-1 text-center font-mono tabular-nums"
                      aria-label={`${attributeLabel(systeme, m.attribute, targetType)} pour ${nameOf(r.characterId)}`}
                    />
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        update(r.key, { modifications: adjust(r.modifications, 1, i) })
                      }
                      aria-label="Un de plus"
                    >
                      <Plus />
                    </Button>
                  </span>
                ) : null,
              )}
            </li>
          );
        })}
      </ul>

      <DialogFooter>
        <Button variant="ghost" onClick={onDone} disabled={busy}>
          Annuler
        </Button>
        <Button onClick={() => void apply()} loading={busy} disabled={!selected}>
          <CheckCheck />
          Appliquer ({selected})
        </Button>
      </DialogFooter>
    </>
  );
}

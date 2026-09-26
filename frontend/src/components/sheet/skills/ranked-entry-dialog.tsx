'use client';

/**
 * Détail d'une entrée à rangs : description, champs, rang actuel (et rangs
 * gratuits), coût du rang suivant, achat « +1 rang », annulation du dernier
 * achat, et outils MJ (fixer le rang sans dépense, réinitialiser l'entrée en
 * remboursant tous ses achats).
 */
import type { Sorte } from '@vtt/rules';
import { Lock, Minus, Plus, RefreshCw, Star, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { SheetBindings } from './common/bindings';
import { ConfirmDialog, WriteButton } from './common/controls';
import { EntryDialog } from './common/entry-dialog';
import {
  blockKind,
  blockLabel,
  blockMessages,
  currencyName,
  journalLines,
  markName,
  readableField,
  refundAllError,
  refundError,
  sourceNames,
} from './common/helpers';
import {
  accentButton,
  accentChip,
  dangerButton,
  ghostButton,
  text,
  textMuted,
} from './common/styles';
import type { RankedCard } from './ranked-entries';

export interface RankedEntryDialogProps extends SheetBindings {
  kind: Sorte;
  card: RankedCard;
  /** Achat et remboursement autorisés (hors lecture seule). */
  canEdit: boolean;
  onClose(): void;
}

export function RankedEntryDialog({
  system,
  sheet,
  kind,
  card,
  canEdit,
  gm,
  themeVariables,
  onBuy,
  onRefund,
  onUpdatePossession,
  onClose,
}: RankedEntryDialogProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const { entry, rank, bought, max, next } = card;
  const state = sheet.etat;
  const possession = sheet.possessions.get(entry.id);
  const free = rank - bought;
  const freeFrom = possession ? sourceNames(system, possession.sources) : [];
  const atMax = max !== undefined && rank >= max;
  const block = next ? blockKind(next) : null;
  const currency = next ? currencyName(system, next.monnaie) : '';

  // Remboursement : seul le dernier achat de l'entrée s'annule, et le moteur dit s'il le peut
  const lines = journalLines(state, entry.id);
  const last = lines.at(-1);
  const lastLine = last !== undefined ? state.journal[last] : undefined;
  const lastError = last !== undefined ? refundError(system, state, last) : null;
  const allError = lines.length ? refundAllError(system, state, lines) : null;
  const refundTotal = lines.reduce((s, i) => s + state.journal[i]!.cout, 0);

  const fields = kind.champs
    .filter((c) => c.type !== 'attribut' && c.type !== 'entrees')
    .map((c) => ({ c, v: readableField(sheet, entry, c) }))
    .filter(({ v }) => v !== '');

  const setRank = (n: number) => onUpdatePossession({ entree: entry.id, rang: Math.max(0, n) });

  const resetAll = async () => {
    for (const i of [...lines].reverse()) if (!(await onRefund(i))) return;
  };

  return (
    <>
      <EntryDialog
        open
        onClose={onClose}
        title={entry.nom}
        description={kind.nom}
        themeVariables={themeVariables}
        badges={card.marks.map((m) => (
          <span key={m} className={accentChip}>
            <Star className="h-3 w-3" />
            {markName(m)}
          </span>
        ))}
        footer={
          <>
            <p className={cn(textMuted, 'mr-auto text-sm')}>
              {atMax || block === 'max' ? (
                'Rang maximum atteint'
              ) : next ? (
                <>
                  Coût du prochain rang :{' '}
                  <strong className={text}>
                    {next.cout} {currency}
                  </strong>
                </>
              ) : (
                'Aucun achat ne fait progresser ce rang pour l’instant.'
              )}
            </p>
            {gm && lines.length > 0 && (
              <button
                type="button"
                className={dangerButton}
                disabled={!!allError}
                title={allError ?? 'Remettre cette entrée à 0 achat et recréditer son coût'}
                onClick={() => setConfirmReset(true)}
              >
                <RefreshCw />
                Réinitialiser
              </button>
            )}
            {canEdit && lastLine && last !== undefined && (
              <WriteButton
                className={ghostButton}
                disabled={!!lastError}
                title={lastError ?? `Annuler le dernier achat et recréditer ${lastLine.cout}`}
                onClick={() => onRefund(last)}
              >
                <Undo2 />
                Annuler le dernier rang (+{lastLine.cout} {currencyName(system, lastLine.monnaie)})
              </WriteButton>
            )}
            <button type="button" className={ghostButton} onClick={onClose}>
              Fermer
            </button>
            {canEdit && next && !atMax && block !== 'max' && (
              <WriteButton
                className={accentButton}
                disabled={!next.possible}
                title={next.possible ? undefined : blockMessages(next).join(' ; ')}
                onClick={() => onBuy(next.achat, next.objet)}
              >
                {next.possible ? (
                  `+1 rang (${next.cout} ${currency})`
                ) : (
                  <>
                    <Lock />
                    {blockLabel(block)}
                  </>
                )}
              </WriteButton>
            )}
          </>
        }
      >
        <div className="space-y-3 text-sm leading-relaxed">
          {entry.description && <p className="whitespace-pre-line">{entry.description}</p>}
          {card.linked && (
            <p>
              {card.linked.field} :{' '}
              <strong>
                {card.linked.name} {card.linked.value}
              </strong>
            </p>
          )}
          {fields.map(({ c, v }) => (
            <p key={c.id}>
              {c.nom} : <strong>{v}</strong>
            </p>
          ))}

          <div className="flex items-center justify-between gap-3">
            <span>
              Rang actuel :{' '}
              <strong>
                {rank}
                {max ? ` / ${max}` : ''}
              </strong>
            </span>
            {gm && (
              <div className="flex items-center gap-1 rounded-lg border border-[color:var(--fiche-bordure)]">
                <WriteButton
                  className={cn(ghostButton, 'h-7 min-h-7 w-7 px-0')}
                  disabled={bought <= 0}
                  label="Retirer un rang (MJ, sans remboursement)"
                  onClick={() => setRank(bought - 1)}
                >
                  <Minus />
                </WriteButton>
                <span className={cn(textMuted, 'px-1 text-[10px] uppercase tracking-wide')}>
                  MJ
                </span>
                <WriteButton
                  className={cn(ghostButton, 'h-7 min-h-7 w-7 px-0')}
                  disabled={atMax}
                  label="Ajouter un rang (MJ, sans dépense)"
                  onClick={() => setRank(bought + 1)}
                >
                  <Plus />
                </WriteButton>
              </div>
            )}
          </div>
          {free > 0 && (
            <p className={cn(textMuted, 'text-xs')}>
              Dont {free} rang{free > 1 ? 's' : ''} gratuit{free > 1 ? 's' : ''}
              {freeFrom.length ? ` : ${freeFrom.join(', ')}` : ''}.
            </p>
          )}
          {gm && <p className={cn(textMuted, 'text-xs')}>Modifier gratuitement, sans dépense.</p>}
          {canEdit && next && !next.possible && block !== 'max' && (
            <ul className="space-y-0.5 text-xs text-red-300">
              {blockMessages(next).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      </EntryDialog>

      <ConfirmDialog
        open={confirmReset}
        title={`Réinitialiser ${entry.nom} ?`}
        confirmLabel="Réinitialiser"
        themeVariables={themeVariables}
        onClose={() => setConfirmReset(false)}
        onConfirm={resetAll}
      >
        Les {lines.length} achat{lines.length > 1 ? 's' : ''} de <strong>{entry.nom}</strong> (rang
        actuel {rank}
        {max ? `/${max}` : ''}) seront annulés.{' '}
        <strong>
          {refundTotal} {lastLine ? currencyName(system, lastLine.monnaie) : ''}
        </strong>{' '}
        seront recrédités.
      </ConfirmDialog>
    </>
  );
}

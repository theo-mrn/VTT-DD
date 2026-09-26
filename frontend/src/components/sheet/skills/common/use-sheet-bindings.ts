'use client';

/**
 * Adaptateur : remplit les props des blocs depuis le contexte de la fiche
 * (`useSheet()`). C'est le seul fichier de ces dossiers qui dépend de la forme
 * du contexte : si elle change, seul lui est à reprendre.
 */
import { useSheet } from '../../context';
import type { SheetBindings } from './bindings';

export interface BindingsOptions {
  /** Outils MJ (le contexte ne sait pas encore qui est MJ). */
  gm?: boolean;
}

export function useSheetBindings(options: BindingsOptions = {}): SheetBindings {
  const s = useSheet();
  return {
    system: s.system,
    presentation: s.presentation,
    sheet: s.sheet,
    character: s.character,
    purchases: s.purchases,
    readOnly: s.readOnly,
    gm: !s.readOnly && !!options.gm,
    themeVariables: s.variables,
    onBuy: s.buy,
    onRefund: s.refund,
    onUpdatePossession: s.updatePossession,
    onRemovePossession: s.removePossession,
  };
}

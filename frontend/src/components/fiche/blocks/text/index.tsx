'use client';

/** Bloc Texte : un attribut texte du personnage (motivation, historique…). */
import { translate } from '@/i18n/runtime';
import { BlocTexte } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function TextBlock({ ctx, widget }: Readonly<SheetBlockProps<'texte'>>) {
  return <BlocTexte ctx={ctx} widget={widget} />;
}

export const textBlock: SheetBlockDefinition<'texte'> = {
  type: 'texte',
  get label() {
    return translate('sheet.blocks.text.label');
  },
  get description() {
    return translate('sheet.blocks.text.description');
  },
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 2 },
  Component: TextBlock,
};

'use client';

/** Bloc Texte : un attribut texte du personnage (motivation, historique…). */
import { BlocTexte } from '../../widgets';
import type { SheetBlockDefinition, SheetBlockProps } from '../types';

function TextBlock({ ctx, widget }: Readonly<SheetBlockProps<'texte'>>) {
  return <BlocTexte ctx={ctx} widget={widget} />;
}

export const textBlock: SheetBlockDefinition<'texte'> = {
  type: 'texte',
  label: 'Texte',
  description: 'Un attribut texte du personnage (motivation, historique…).',
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 2 },
  Component: TextBlock,
};

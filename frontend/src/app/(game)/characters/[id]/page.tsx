'use client';

import { useParams } from 'next/navigation';
import { CharacterPage } from '@/components/sheet/character-page';
import { CharacterSheet } from '@/components/sheet/sheet';

export default function SheetPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <CharacterPage id={id}>
      <CharacterSheet />
    </CharacterPage>
  );
}

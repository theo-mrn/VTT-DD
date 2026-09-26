'use client';

import { useParams } from 'next/navigation';
import { SheetHeader } from '@/components/sheet/header';
import { ThemeFrame, GeneratedSheet } from '@/components/sheet/sheet';
import { CharacterPage } from '@/components/sheet/character-page';

export default function SheetPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <CharacterPage id={id}>
      <div className="space-y-6">
        <SheetHeader page="fiche" />
        <ThemeFrame>
          <GeneratedSheet />
        </ThemeFrame>
      </div>
    </CharacterPage>
  );
}

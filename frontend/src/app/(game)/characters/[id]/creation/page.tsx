'use client';

import { useParams } from 'next/navigation';
import { CreationAssistant } from '@/components/sheet/creation/assistant';
import { SheetHeader } from '@/components/sheet/header';
import { ThemeFrame } from '@/components/sheet/sheet';
import { CharacterPage } from '@/components/sheet/character-page';

export default function CreationPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <CharacterPage id={id}>
      <div className="space-y-6">
        <SheetHeader page="creation" />
        <ThemeFrame>
          <CreationAssistant />
        </ThemeFrame>
      </div>
    </CharacterPage>
  );
}

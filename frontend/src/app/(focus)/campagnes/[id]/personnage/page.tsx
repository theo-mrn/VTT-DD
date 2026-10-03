'use client';

import { useParams } from 'next/navigation';
import { CharacterPicker } from '@/components/personnages/character-picker';

export default function CharacterPickerPage() {
  const { id } = useParams<{ id: string }>();
  return <CharacterPicker campaignId={id} />;
}

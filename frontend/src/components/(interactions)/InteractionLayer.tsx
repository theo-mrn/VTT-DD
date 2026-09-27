'use client';

/**
 * Interactions des tokens et objets (marchand, mini-jeu, butin d'un coffre).
 * Dans l'ancienne app, elles écrivaient inventaires et parties dans Firestore
 * (`cartes/{r}/games`, fiches des joueurs) : pas encore d'équivalent côté
 * serveur. Ouvrir une interaction affiche « Bientôt disponible ».
 */
import { ComingSoonPanel } from '@/components/(map)/ComingSoonPanel';
import type {
  Character,
  GameInteraction,
  LootInteraction,
  MapObject,
  VendorInteraction,
} from '@/app/(campaigns)/campaigns/[id]/play/map/types';

interface InteractionLayerProps {
  roomId: string;
  isMJ: boolean;
  characters: Character[];
  activeInteraction: {
    interaction: VendorInteraction | GameInteraction | LootInteraction;
    host: Character | MapObject;
  } | null;
  setActiveInteraction: (
    v: {
      interaction: VendorInteraction | GameInteraction | LootInteraction;
      host: Character | MapObject;
    } | null,
  ) => void;
  interactionConfigTarget: Character | null;
  setInteractionConfigTarget: (v: Character | null) => void;
  persoId: string | null;
  viewAsPersoId: string | null;
}

const LABELS: Record<string, string> = {
  vendor: 'Marchand',
  game: 'Mini-jeu',
  loot: 'Butin',
};

export default function InteractionLayer({
  activeInteraction,
  setActiveInteraction,
  interactionConfigTarget,
  setInteractionConfigTarget,
}: InteractionLayerProps) {
  const open = !!activeInteraction || !!interactionConfigTarget;
  const title = activeInteraction
    ? `${LABELS[activeInteraction.interaction.type] ?? 'Interaction'} : ${activeInteraction.interaction.name}`
    : 'Configurer les interactions';
  return (
    <ComingSoonPanel
      isOpen={open}
      title={title}
      onClose={() => {
        setActiveInteraction(null);
        setInteractionConfigTarget(null);
      }}
    />
  );
}

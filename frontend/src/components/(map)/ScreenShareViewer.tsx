'use client';

/**
 * Lecteur du partage d'écran du MJ, côté joueur. Sans partage d'écran pour
 * l'instant (voir ScreenShareProducer.tsx), il n'affiche rien.
 */
interface Props {
  roomId: string;
  userId: string;
}

export default function ScreenShareViewer(_props: Props) {
  return null;
}

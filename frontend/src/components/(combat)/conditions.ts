/**
 * États (conditions) affichables sur un token : repris de `CONDITIONS` de
 * l'ancien `components/(combat)/MJcombat.tsx`, seule partie du suivi de
 * combat dont la carte a besoin (icônes dessinées sur les tokens, menus).
 */
import { EyeOff, Skull, Zap } from 'lucide-react';
import poisonIcon from '@/app/(campaigns)/campaigns/[id]/play/map/icons/poison.svg';
import stunIcon from '@/app/(campaigns)/campaigns/[id]/play/map/icons/stun.svg';
import blindIcon from '@/app/(campaigns)/campaigns/[id]/play/map/icons/blind.svg';

export const CONDITIONS = [
  {
    id: 'poisoned',
    label: 'Empoisonné',
    icon: Skull,
    iconSrc: poisonIcon,
    color: 'text-green-500',
  },
  { id: 'stunned', label: 'Etourdi', icon: Zap, iconSrc: stunIcon, color: 'text-yellow-500' },
  { id: 'blinded', label: 'Aveuglé', icon: EyeOff, iconSrc: blindIcon, color: 'text-gray-500' },
];

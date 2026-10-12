import { Moon, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';
import type { Period } from '../state';

export const PERIOD_ICON: Record<Period, LucideIcon> = {
  dawn: Sunrise,
  morning: Sun,
  noon: Sun,
  afternoon: Sun,
  dusk: Sunset,
  night: Moon,
};

/** Teinte de chaque moment du jour. */
export const PERIOD_TONE: Record<Period, string> = {
  dawn: 'text-warning',
  morning: 'text-primary',
  noon: 'text-primary',
  afternoon: 'text-primary',
  dusk: 'text-warning',
  night: 'text-info',
};

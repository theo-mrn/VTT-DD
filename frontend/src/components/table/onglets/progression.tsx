'use client';

import { ProgressionContent } from '@/components/progression/progression-card';

/** Progression du compte à la table : niveau, paliers et défis, sans quitter la partie. */
export function OngletProgression() {
  return (
    <div className="p-4">
      <ProgressionContent />
    </div>
  );
}

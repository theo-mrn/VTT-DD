"use client";

import GameSystemManagerPanel from '@/components/(fiches)/game-system/GameSystemManagerPanel';

export default function GameSystemPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
      <div className="max-w-2xl mx-auto">
        <GameSystemManagerPanel />
      </div>
    </div>
  );
}

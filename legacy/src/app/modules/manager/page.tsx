"use client";

import ModuleManagerPanel from '@/modules/builtin/module-manager/ModuleManagerPanel';

export default function ModuleManagerPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
      <div className="max-w-2xl mx-auto">
        <ModuleManagerPanel />
      </div>
    </div>
  );
}

'use client';

import React, { useState, useMemo } from 'react';
import { useModules } from '@/modules/context';
import { useGame } from '@/contexts/GameContext';
import { moduleRegistry } from '@/modules/registry';
import { loadExternalModule, unloadExternalModule } from '@/modules/dynamic-loader';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, ExternalLink, Package, AlertTriangle, Loader2, Download } from 'lucide-react';
import type { InstalledModule } from '@/modules/types';

export default function ModuleManagerPanel() {
  const { modules, enableModule, disableModule, isModuleEnabled, getModuleApi } = useModules();
  const { isMJ } = useGame();
  const api = getModuleApi('module-manager');

  // External modules stored in RTDB
  const installedModules = api.getData<Record<string, InstalledModule>>('installed') ?? {};

  // UI state
  const [newUrl, setNewUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Separate built-in vs external modules
  const builtinModules = useMemo(
    () => modules.filter(m => !m.__external && m.manifest.id !== 'module-manager'),
    [modules]
  );
  const externalModules = useMemo(
    () => modules.filter(m => m.__external),
    [modules]
  );

  const handleInstall = async () => {
    const url = newUrl.trim();
    if (!url) return;

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setLoadError('URL invalide. Utilisez une URL complète (https://...)');
      return;
    }

    // Check if already installed
    const alreadyInstalled = Object.values(installedModules).some(m => m.url === url);
    if (alreadyInstalled) {
      setLoadError('Ce module est déjà installé.');
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      // Track modules before load to detect what was registered
      const beforeIds = new Set(modules.map(m => m.manifest.id));

      await loadExternalModule(url);

      // Find newly registered module
      const allAfter = moduleRegistry.getAllModules();
      const newMod = allAfter.find(m => !beforeIds.has(m.manifest.id));

      const entry: InstalledModule = {
        url,
        moduleId: newMod?.manifest.id,
        name: newMod?.manifest.name ?? url.split('/').pop() ?? 'Module inconnu',
        addedBy: api.getGameState().userId ?? 'unknown',
        addedAt: Date.now(),
        enabled: true,
      };

      const key = `ext_${Date.now()}`;
      await api.setData('installed', { ...installedModules, [key]: entry });

      setNewUrl('');
      api.showToast(`Module "${entry.name}" installé !`, { type: 'success' });
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUninstall = async (key: string, entry: InstalledModule) => {
    // Unregister from registry
    if (entry.moduleId) {
      moduleRegistry.unregister(entry.moduleId);
    }
    // Remove script tag
    unloadExternalModule(entry.url);

    // Remove from Firebase
    const copy = { ...installedModules };
    delete copy[key];
    await api.setData('installed', copy);

    api.showToast(`Module "${entry.name ?? 'inconnu'}" désinstallé.`);
  };

  const handleToggleBuiltin = (moduleId: string, enabled: boolean) => {
    if (enabled) {
      enableModule(moduleId);
    } else {
      disableModule(moduleId);
    }
  };

  if (!isMJ) {
    return (
      <div className="h-full flex flex-col" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-title)' }}>
            Modules
          </h2>
        </div>
        <div className="p-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Seul le MJ peut gérer les modules.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-title)' }}>
          Gestionnaire de Modules
        </h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          Activez ou installez des modules pour étendre votre VTT.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">

          {/* ── Built-in Modules ── */}
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Package size={14} />
              Modules intégrés
            </h3>
            <div className="space-y-2">
              {builtinModules.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Aucun module intégré.
                </p>
              )}
              {builtinModules.map(mod => (
                <div
                  key={mod.manifest.id}
                  className="flex items-center gap-3 p-3 rounded-lg border"
                  style={{ background: 'var(--bg-darker)', borderColor: 'var(--border-color)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{mod.manifest.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {mod.manifest.version}
                      </Badge>
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                      {mod.manifest.description}
                    </p>
                  </div>
                  <Switch
                    checked={isModuleEnabled(mod.manifest.id)}
                    onCheckedChange={(checked) => handleToggleBuiltin(mod.manifest.id, checked)}
                  />
                </div>
              ))}
            </div>
          </section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── External Modules ── */}
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Download size={14} />
              Modules externes
            </h3>

            {/* Install form */}
            <div className="rounded-lg p-3 space-y-2 border mb-3" style={{ background: 'var(--bg-darker)', borderColor: 'var(--border-color)' }}>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <AlertTriangle size={12} className="text-yellow-400 shrink-0" />
                Les modules externes ont accès à votre session. Installez uniquement des modules de confiance.
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://cdn.example.com/mon-module.js"
                  value={newUrl}
                  onChange={e => { setNewUrl(e.target.value); setLoadError(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleInstall()}
                  className="flex-1 bg-transparent border rounded px-2 py-1.5 text-xs focus:outline-none"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
                <Button
                  size="sm"
                  onClick={handleInstall}
                  disabled={isLoading || !newUrl.trim()}
                  className="gap-1"
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Installer
                </Button>
              </div>
              {loadError && (
                <p className="text-xs text-red-400">{loadError}</p>
              )}
            </div>

            {/* Installed external modules list */}
            <div className="space-y-2">
              {Object.keys(installedModules).length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Aucun module externe installé.
                </p>
              )}
              {Object.entries(installedModules).map(([key, entry]) => {
                const isRegistered = entry.moduleId ? moduleRegistry.getModule(entry.moduleId) !== undefined : false;
                const mod = entry.moduleId ? moduleRegistry.getModule(entry.moduleId) : undefined;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 p-3 rounded-lg border"
                    style={{ background: 'var(--bg-darker)', borderColor: 'var(--border-color)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {entry.name ?? 'Module inconnu'}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${isRegistered ? 'text-green-400 border-green-400/30' : 'text-red-400 border-red-400/30'}`}
                        >
                          {isRegistered ? 'Actif' : 'Erreur'}
                        </Badge>
                        {mod && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {mod.manifest.version}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] mt-0.5 truncate flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                        <ExternalLink size={10} />
                        {entry.url}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300 h-8 w-8 p-0"
                      onClick={() => handleUninstall(key, entry)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>

          <Separator style={{ background: 'var(--border-color)' }} />

          {/* ── Developer Info ── */}
          <section>
            <h3 className="text-sm font-semibold mb-2">Pour les développeurs</h3>
            <div
              className="rounded-lg p-3 border text-xs space-y-2"
              style={{ background: 'var(--bg-darker)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
            >
              <p>
                Créez vos propres modules en utilisant le SDK global <code className="px-1 py-0.5 rounded" style={{ background: 'var(--bg-card)' }}>window.__VTT_SDK__</code>
              </p>
              <pre
                className="p-2 rounded text-[10px] overflow-x-auto"
                style={{ background: 'var(--bg-card)' }}
              >{`const SDK = window.__VTT_SDK__;
const { React, register, ui, icons } = SDK;

register({
  manifest: {
    id: 'mon-module',
    name: 'Mon Module',
    version: '1.0.0',
    description: 'Description...',
    author: 'Moi',
    type: 'feature',
    defaultEnabled: true,
  },
  contributions: {
    sidebarTabs: [{
      id: 'mon-tab',
      label: 'Mon Tab',
      icon: icons.Star,
      component: MonComposant,
      order: 60,
    }],
  },
});`}</pre>
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

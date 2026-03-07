import type {
  ModuleDefinition,
  ModuleContributions,
  SidebarTabContribution,
  ToolbarItemContribution,
  ContextMenuContribution,
  CharacterWidgetContribution,
  ConditionContribution,
} from './types';

class ModuleRegistry {
  private modules = new Map<string, ModuleDefinition>();
  private enabledModules = new Set<string>();
  private listeners = new Set<() => void>();
  private snapshotVersion = 0;

  register(module: ModuleDefinition): void {
    if (this.modules.has(module.manifest.id)) {
      console.warn(`[VTT Modules] Module "${module.manifest.id}" is already registered.`);
      return;
    }
    this.modules.set(module.manifest.id, module);
    if (module.manifest.defaultEnabled) {
      this.enabledModules.add(module.manifest.id);
    }
    this.notify();
  }

  unregister(moduleId: string): void {
    this.modules.delete(moduleId);
    this.enabledModules.delete(moduleId);
    this.notify();
  }

  enable(moduleId: string): void {
    if (!this.modules.has(moduleId)) return;
    this.enabledModules.add(moduleId);
    this.notify();
  }

  disable(moduleId: string): void {
    this.enabledModules.delete(moduleId);
    this.notify();
  }

  isEnabled(moduleId: string): boolean {
    return this.enabledModules.has(moduleId);
  }

  getModule(id: string): ModuleDefinition | undefined {
    return this.modules.get(id);
  }

  getAllModules(): ModuleDefinition[] {
    return Array.from(this.modules.values());
  }

  getEnabledModules(): ModuleDefinition[] {
    return Array.from(this.modules.values())
      .filter(m => this.enabledModules.has(m.manifest.id));
  }

  // ── Aggregated contributions from enabled modules ──

  getSidebarTabs(): SidebarTabContribution[] {
    return this.collectContributions('sidebarTabs');
  }

  getToolbarItems(): ToolbarItemContribution[] {
    return this.collectContributions('toolbarItems');
  }

  getContextMenuItems(target: 'map' | 'character' | 'object'): ContextMenuContribution[] {
    return this.collectContributions('contextMenuItems')
      .filter((c: ContextMenuContribution) => c.target === target);
  }

  getCharacterWidgets(): CharacterWidgetContribution[] {
    return this.collectContributions('characterWidgets');
  }

  getConditions(): ConditionContribution[] {
    return this.collectContributions('conditions');
  }

  // ── useSyncExternalStore compatibility ──

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): number {
    return this.snapshotVersion;
  }

  // ── Internal ──

  private collectContributions<K extends keyof ModuleContributions>(
    key: K
  ): NonNullable<ModuleContributions[K]> extends Array<infer U> ? U[] : never {
    const result: unknown[] = [];
    for (const mod of this.getEnabledModules()) {
      const items = mod.contributions?.[key];
      if (Array.isArray(items)) {
        result.push(...items);
      }
    }
    return result as never;
  }

  private notify(): void {
    this.snapshotVersion++;
    this.listeners.forEach(fn => fn());
  }
}

export const moduleRegistry = new ModuleRegistry();

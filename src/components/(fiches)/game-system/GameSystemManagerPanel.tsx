'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { db, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collection } from '@/lib/firebase';
import { useGame } from '@/contexts/GameContext';
import { moduleRegistry } from '@/modules/registry';
import { dndClassicModule } from '@/modules/builtin/dnd-classic';
import type { GameSystemDefinition, StatDefinition, CharacterCreationRule, FormulaNode, RollConstraintRule, RollConstraintAggregate, RollComparisonOperator } from '@/modules/game-system/types';
import { FormulaEditor } from './FormulaEditor';
import { findRollFormulaCycle, rollCharacterStats, groupStats } from '@/lib/rules-engine';
import { Check, Plus, Trash2, Copy, AlertTriangle, ChevronLeft, Dice6, GripVertical, Pencil } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const UNGROUPED = '__ungrouped__';

// ─────────────────────────────────────────────────────────────────────────────
// Firestore: Salle/{roomId}.gameSystemId (string), Salle/{roomId}/gameSystemOverrides/{systemId}
// (GameSystemDefinition sérialisé — AST JSON pur, jamais de code exécutable).
// ─────────────────────────────────────────────────────────────────────────────

function newStatKey(existing: string[]): string {
  let i = existing.length + 1;
  while (existing.includes(`car${i}`)) i++;
  return `car${i}`;
}

function emptyStat(existingKeys: string[]): StatDefinition {
  return {
    key: newStatKey(existingKeys),
    label: '',
    category: 'ability',
    dataType: 'number',
    defaultValue: 10,
    isRollable: true,
    origin: 'module',
  };
}

/** Toute nouvelle fiche personnage doit pouvoir afficher une barre de vie — ces deux stats sont donc
 *  toujours présentes par défaut sur un nouveau système custom, et protégées contre la suppression
 *  (leur formule/nom reste éditable par le MJ). */
function defaultVitalStats(): StatDefinition[] {
  return [
    { key: 'PV_Max', label: 'PV Max', category: 'derived', dataType: 'number', valueFormula: { type: 'const', value: 10 }, origin: 'module', order: 0, protected: true },
    {
      key: 'PV', label: 'PV', category: 'vital', dataType: 'number', origin: 'module', order: 1, protected: true,
      minFormula: { type: 'const', value: 0 },
      maxFormula: { type: 'stat', key: 'PV_Max' },
      // Valeur de départ proposée par défaut (démarre à pleine vie) — entièrement modifiable par le MJ.
      rollFormula: { type: 'stat', key: 'PV_Max' },
    },
  ];
}

export function emptyGameSystem(systemId: string, name: string): Draft {
  return {
    systemId,
    name,
    description: '',
    stats: defaultVitalStats(),
    creation: { method: 'manual' },
    statGroups: [],
  };
}

export type Draft = GameSystemDefinition & { name: string; description: string };

export default function GameSystemManagerPanel() {
  const { isMJ, user } = useGame();
  const roomId = (user as { roomId?: string } | null)?.roomId ?? null;

  const [activeSystemId, setActiveSystemId] = useState<string>('dnd-classic');
  const [overrides, setOverrides] = useState<Record<string, Draft>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [confirmSwitchTo, setConfirmSwitchTo] = useState<string | null>(null);
  const [editingSystemId, setEditingSystemId] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) { setIsLoading(false); return; }
    const unsubRoom = onSnapshot(doc(db, 'Salle', roomId), (snap) => {
      setActiveSystemId((snap.data()?.gameSystemId as string) || 'dnd-classic');
      setIsLoading(false);
    });
    const unsubOverrides = onSnapshot(collection(db, `Salle/${roomId}/gameSystemOverrides`), (snap) => {
      const next: Record<string, Draft> = {};
      snap.forEach((d) => { next[d.id] = d.data() as Draft; });
      setOverrides(next);
    });
    return () => { unsubRoom(); unsubOverrides(); };
  }, [roomId]);

  const builtinSystems = useMemo(() => moduleRegistry.getAllGameSystemModules(), []);

  const allSystems = useMemo(() => {
    const list: Array<{ id: string; name: string; description: string; isCustom: boolean; statCount: number }> = builtinSystems.map((m) => ({
      id: m.gameSystem.systemId,
      name: m.manifest.name,
      description: m.manifest.description,
      isCustom: false,
      statCount: m.gameSystem.stats.length,
    }));
    for (const [id, draft] of Object.entries(overrides)) {
      list.push({ id, name: draft.name || 'Système sans nom', description: draft.description || '', isCustom: true, statCount: draft.stats?.length ?? 0 });
    }
    return list;
  }, [builtinSystems, overrides]);

  const handleSelectSystem = (systemId: string) => {
    if (!roomId || systemId === activeSystemId) return;
    setConfirmSwitchTo(systemId);
  };

  const confirmSwitch = async () => {
    if (!roomId || !confirmSwitchTo) return;
    await setDoc(doc(db, 'Salle', roomId), { gameSystemId: confirmSwitchTo }, { merge: true });
    setConfirmSwitchTo(null);
  };

  const handleCreateCustom = async () => {
    if (!roomId) return;
    const id = `custom_${Date.now()}`;
    const draft = emptyGameSystem(id, '');
    await setDoc(doc(db, `Salle/${roomId}/gameSystemOverrides`, id), draft);
    setEditingSystemId(id);
  };

  const handleDuplicateFromDndClassic = async () => {
    if (!roomId) return;
    const id = `custom_${Date.now()}`;
    const draft: Draft = {
      systemId: id,
      name: 'D&D Classique (copie)',
      description: 'Copie modifiable du système par défaut.',
      stats: dndClassicModule.gameSystem.stats,
      creation: dndClassicModule.gameSystem.creation as CharacterCreationRule,
      combatDefenseKey: dndClassicModule.gameSystem.combatDefenseKey,
      combatAttackKeys: dndClassicModule.gameSystem.combatAttackKeys,
    };
    await setDoc(doc(db, `Salle/${roomId}/gameSystemOverrides`, id), draft);
    setEditingSystemId(id);
  };

  const handleDeleteCustom = (systemId: string) => {
    if (!roomId) return;
    if (activeSystemId === systemId) {
      alert('Ce système est actuellement utilisé par la table. Activez-en un autre avant de le supprimer.');
      return;
    }
    if (!confirm('Supprimer ce système ? Cette action est définitive.')) return;
    deleteDoc(doc(db, `Salle/${roomId}/gameSystemOverrides`, systemId));
  };

  if (!isMJ) {
    return (
      <div className="w-full h-full min-w-0 flex flex-col" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-title)' }}>Règles du jeu</h2>
        </div>
        <div className="p-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Seul le MJ peut gérer les règles de la table.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Chargement…</div>;
  }

  if (editingSystemId) {
    const draft = overrides[editingSystemId];
    if (!draft) {
      setEditingSystemId(null);
      return null;
    }
    return (
      <GameSystemEditor
        draft={draft}
        onBack={() => setEditingSystemId(null)}
        onSave={(next) => updateDoc(doc(db, `Salle/${roomId}/gameSystemOverrides`, editingSystemId), next as unknown as Record<string, unknown>)}
      />
    );
  }

  return (
    <div className="w-full h-full min-w-0 flex flex-col" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
      <div className="p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-title)' }}>Règles du jeu</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          Le système actif définit les caractéristiques et les calculs utilisés par toute la table.
        </p>
      </div>

      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 space-y-4">
        <div className="space-y-2">
          {allSystems.map((sys) => {
            const isActive = sys.id === activeSystemId;
            return (
              <div
                key={sys.id}
                className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all"
                style={{
                  background: 'var(--bg-darker)',
                  borderColor: isActive ? 'var(--accent-brown)' : 'var(--border-color)',
                }}
                onClick={() => handleSelectSystem(sys.id)}
              >
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${isActive ? 'bg-[var(--accent-brown)] border-[var(--accent-brown)]' : 'border-[var(--border-color)]'}`}>
                  {isActive && <Check size={12} className="text-[var(--bg-dark)]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate min-w-0">{sys.name}</span>
                    {isActive && (
                      <span className="text-[10px] px-1.5 py-0 rounded border shrink-0" style={{ borderColor: 'var(--accent-brown)', color: 'var(--accent-brown)' }}>Actif à la table</span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                    {sys.description || `${sys.statCount} caractéristique${sys.statCount > 1 ? 's' : ''}`}
                  </p>
                </div>
                {sys.isCustom && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); setEditingSystemId(sys.id); }} className="text-xs px-2.5 py-1.5 rounded border font-medium" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>Modifier</button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteCustom(sys.id); }} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1.5"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button onClick={handleCreateCustom} className="flex-1 py-2.5 px-3 rounded-lg border border-dashed text-xs font-bold flex items-center justify-center gap-1.5 min-w-0 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            <Plus size={14} className="shrink-0" /> <span className="truncate">Créer un système vierge</span>
          </button>
          <button onClick={handleDuplicateFromDndClassic} className="flex-1 py-2.5 px-3 rounded-lg border border-dashed text-xs font-bold flex items-center justify-center gap-1.5 min-w-0 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            <Copy size={14} className="shrink-0" /> <span className="truncate">Partir de D&D Classique</span>
          </button>
        </div>
      </div>

      {confirmSwitchTo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="max-w-sm w-full rounded-xl border p-5 space-y-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-color)' }}>
            <div className="flex items-center gap-2 text-yellow-400">
              <AlertTriangle size={16} />
              <span className="font-bold text-sm">Changer le système de la table</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Les personnages existants gardent leurs stats actuelles en mémoire, mais les nouveaux formulaires (fiche, création) afficheront désormais celles du nouveau système. Rien n&apos;est supprimé.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setConfirmSwitchTo(null)} className="button-cancel !px-4 !py-2 !text-sm">Annuler</button>
              <button onClick={confirmSwitch} className="button-primary !px-4 !py-2 !text-sm">Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Éditeur de système custom — liste des stats à gauche, détail de la sélection à droite
// (comme un explorateur : on clique une ligne, son formulaire complet s'ouvre à droite)
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<'ability' | 'derived', { label: string; color: string; bg: string }> = {
  ability: { label: 'LIBRE', color: '#8fb4d9', bg: 'rgba(143,180,217,0.12)' },
  derived: { label: 'CALCULÉE', color: '#c9a15a', bg: 'rgba(201,161,90,0.12)' },
};

function TypeBadge({ kind }: { kind: 'ability' | 'derived' }) {
  const t = TYPE_BADGE[kind];
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 tracking-wider" style={{ color: t.color, background: t.bg }}>
      {t.label}
    </span>
  );
}

/** Une stat est "calculée" si elle a une formule de valeur — sinon c'est une valeur libre
 *  saisie par le joueur (une stat 'vital' comme PV, sans valueFormula, est donc "libre" ici ;
 *  ses bornes min/max sont configurées séparément, identiquement pour toute stat). */
function statKind(stat: StatDefinition): 'ability' | 'derived' {
  return stat.valueFormula ? 'derived' : 'ability';
}

type SelectionId = { kind: 'stat'; key: string } | { kind: 'general' } | { kind: 'modifier' } | { kind: 'roll' } | { kind: 'test' };

export function GameSystemEditor({ draft, onBack, onSave }: { draft: Draft; onBack: () => void; onSave: (next: Draft) => void | Promise<void> }) {
  const [local, setLocal] = useState<Draft>(draft);
  const [isSaving, setIsSaving] = useState(false);
  const [selection, setSelection] = useState<SelectionId>({ kind: 'general' });

  const save = async (next: Draft) => {
    setLocal(next);
    setIsSaving(true);
    try {
      await onSave(next);
    } finally {
      setIsSaving(false);
    }
  };

  const addStat = () => {
    const stat = emptyStat(local.stats.map((s) => s.key));
    save({ ...local, stats: [...local.stats, stat] });
    setSelection({ kind: 'stat', key: stat.key });
  };
  const updateStat = (key: string, patch: Partial<StatDefinition>) => save({ ...local, stats: local.stats.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  const removeStat = (key: string) => {
    const stat = local.stats.find((s) => s.key === key);
    if (stat?.protected) return; // Stat requise par l'architecture (ex PV/PV_Max) — non supprimable.
    save({ ...local, stats: local.stats.filter((s) => s.key !== key) });
    if (selection.kind === 'stat' && selection.key === key) setSelection({ kind: 'general' });
  };

  const selectedStat = selection.kind === 'stat' ? local.stats.find((s) => s.key === selection.key) : undefined;

  // ── Groupes de stats (organisation visuelle libre du MJ, sans rapport avec StatCategory) ──
  const statGroups = local.statGroups ?? [];
  const addGroup = () => {
    let i = statGroups.length + 1;
    while (statGroups.includes(`Groupe ${i}`)) i++;
    save({ ...local, statGroups: [...statGroups, `Groupe ${i}`] });
  };
  const renameGroup = (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) return;
    save({
      ...local,
      statGroups: statGroups.map((g) => (g === oldName ? newName : g)),
      stats: local.stats.map((s) => (s.group === oldName ? { ...s, group: newName } : s)),
    });
  };
  const removeGroup = (name: string) => {
    // Les stats du groupe supprimé retombent en "Sans groupe" — jamais supprimées elles-mêmes.
    save({
      ...local,
      statGroups: statGroups.filter((g) => g !== name),
      stats: local.stats.map((s) => (s.group === name ? { ...s, group: undefined } : s)),
    });
  };
  const moveStatToGroup = (key: string, group: string | undefined) => updateStat(key, { group });
  const reorderStats = (nextStats: StatDefinition[]) => save({ ...local, stats: nextStats });

  return (
    <div className="w-full h-full min-w-0 flex flex-col" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
      <div className="p-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--border-color)' }}>
        <button onClick={onBack} className="p-1.5 rounded hover:bg-[var(--bg-darker)] transition-colors shrink-0"><ChevronLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <input
            value={local.name}
            onChange={(e) => setLocal({ ...local, name: e.target.value })}
            onBlur={() => save(local)}
            placeholder="Nom du système (ex: Narratif simple)"
            className="text-base font-semibold bg-transparent border-none outline-none w-full placeholder:opacity-40"
            style={{ fontFamily: 'var(--font-title)' }}
          />
        </div>
        {isSaving && <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>Enregistré…</span>}
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* ── Colonne liste : juste les noms ── */}
        <div className="lg:w-[280px] shrink-0 overflow-y-auto p-3 space-y-1 lg:border-r" style={{ borderColor: 'var(--border-color)' }}>
          <NavRow label="Général" active={selection.kind === 'general'} onClick={() => setSelection({ kind: 'general' })} />
          <NavRow label="Modificateur" active={selection.kind === 'modifier'} onClick={() => setSelection({ kind: 'modifier' })} />
          <NavRow label="Tirage" active={selection.kind === 'roll'} onClick={() => setSelection({ kind: 'roll' })} />
          <NavRow label="Tester" active={selection.kind === 'test'} onClick={() => setSelection({ kind: 'test' })} />

          <StatList
            stats={local.stats}
            statGroups={statGroups}
            selection={selection}
            onSelectStat={(key) => setSelection({ kind: 'stat', key })}
            onRenameStat={(key, label) => updateStat(key, { label })}
            onAddStat={addStat}
            onAddGroup={addGroup}
            onRenameGroup={renameGroup}
            onRemoveGroup={removeGroup}
            onMoveStatToGroup={moveStatToGroup}
            onReorderStats={reorderStats}
          />
        </div>

        {/* ── Colonne détail de la sélection ── */}
        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4">
          {selection.kind === 'general' && (
            <GeneralPanel local={local} onChangeDescription={(description) => setLocal({ ...local, description })} onBlurSave={() => save(local)} />
          )}
          {selection.kind === 'modifier' && (
            <ModifierPanel local={local} onSave={save} />
          )}
          {selection.kind === 'roll' && (
            <RollConstraintPanel local={local} onSave={save} />
          )}
          {selection.kind === 'test' && (
            <TestPanel gameSystem={local} />
          )}
          {selection.kind === 'stat' && selectedStat && (
            <StatDetail stat={selectedStat} allStats={local.stats} onChange={(patch) => updateStat(selectedStat.key, patch)} onRemove={() => removeStat(selectedStat.key)} />
          )}
        </div>
      </div>
    </div>
  );
}

function NavRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2.5 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{
        background: active ? 'color-mix(in srgb, var(--accent-brown) 15%, transparent)' : 'transparent',
        color: active ? 'var(--accent-brown)' : 'var(--text-primary)',
      }}
    >
      {label}
    </button>
  );
}

function StatNavRow({ stat, active, autoFocus, onClick, onRename, dragHandleProps, dragging }: {
  stat: StatDefinition;
  active: boolean;
  autoFocus?: boolean;
  onClick: () => void;
  onRename: (label: string) => void;
  dragHandleProps?: { attributes: ReturnType<typeof useSortable>['attributes']; listeners: ReturnType<typeof useSortable>['listeners'] };
  dragging?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors min-w-0 cursor-pointer"
      style={{
        background: active ? 'color-mix(in srgb, var(--accent-brown) 15%, transparent)' : 'var(--bg-darker)',
        border: `1px solid ${active ? 'var(--accent-brown)' : 'var(--border-color)'}`,
        opacity: dragging ? 0.4 : 1,
      }}
    >
      {dragHandleProps && (
        <span
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 cursor-grab active:cursor-grabbing touch-none"
          style={{ color: 'var(--text-secondary)' }}
        >
          <GripVertical size={14} />
        </span>
      )}
      <TypeBadge kind={statKind(stat)} />
      <input
        value={stat.label}
        onChange={(e) => onRename(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        autoFocus={autoFocus}
        placeholder="Nom de la stat"
        className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm font-medium placeholder:opacity-40"
        style={{ color: 'var(--text-primary)' }}
      />
    </div>
  );
}

/** Item draggable — wrapper autour de StatNavRow avec useSortable, réordonnable ET déplaçable
 *  vers un autre groupe (le conteneur de groupe cible est lui-même une zone droppable). */
function SortableStatItem({ stat, active, autoFocus, onClick, onRename }: {
  stat: StatDefinition;
  active: boolean;
  autoFocus?: boolean;
  onClick: () => void;
  onRename: (label: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stat.key });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style}>
      <StatNavRow
        stat={stat}
        active={active}
        autoFocus={autoFocus}
        onClick={onClick}
        onRename={onRename}
        dragHandleProps={{ attributes, listeners }}
        dragging={isDragging}
      />
    </div>
  );
}

/** Zone droppable représentant un groupe (ou "Sans groupe") — le conteneur lui-même reçoit un drop
 *  quand on relâche une stat directement dessus (liste vide, ou zone en dessous des items). */
function GroupDropZone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useSortable({ id, data: { isGroupContainer: true } });
  return <div ref={setNodeRef} className="space-y-1 min-h-[8px]">{children}</div>;
}

function StatList({
  stats, statGroups, selection, onSelectStat, onRenameStat, onAddStat,
  onAddGroup, onRenameGroup, onRemoveGroup, onMoveStatToGroup, onReorderStats,
}: {
  stats: StatDefinition[];
  statGroups: string[];
  selection: SelectionId;
  onSelectStat: (key: string) => void;
  onRenameStat: (key: string, label: string) => void;
  onAddStat: () => void;
  onAddGroup: () => void;
  onRenameGroup: (oldName: string, newName: string) => void;
  onRemoveGroup: (name: string) => void;
  onMoveStatToGroup: (key: string, group: string | undefined) => void;
  onReorderStats: (nextStats: StatDefinition[]) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const groupOf = (key: string): string => stats.find((s) => s.key === key)?.group || UNGROUPED;
  const statsInGroup = (group: string) => stats.filter((s) => (s.group || UNGROUPED) === group);

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeKey = active.id as string;
    const overId = over.id as string;
    const sourceGroup = groupOf(activeKey);
    // La cible est soit un groupe vide/conteneur (over.id = nom de groupe ou UNGROUPED), soit une
    // autre stat (auquel cas son groupe est la cible réelle).
    const targetGroup = [...statGroups, UNGROUPED].includes(overId) ? overId : groupOf(overId);

    if (sourceGroup !== targetGroup) {
      onMoveStatToGroup(activeKey, targetGroup === UNGROUPED ? undefined : targetGroup);
      return;
    }

    // Réordonnancement dans le même groupe.
    const groupKeys = statsInGroup(sourceGroup).map((s) => s.key);
    const oldIndex = groupKeys.indexOf(activeKey);
    const newIndex = groupKeys.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
    const reorderedKeys = arrayMove(groupKeys, oldIndex, newIndex);
    const reorderedGroup = reorderedKeys.map((k) => stats.find((s) => s.key === k)!);
    const otherStats = stats.filter((s) => (s.group || UNGROUPED) !== sourceGroup);
    onReorderStats([...otherStats, ...reorderedGroup]);
  };

  const activeStat = activeId ? stats.find((s) => s.key === activeId) : null;

  return (
    <div className="pt-3 space-y-3">
      <div className="flex items-center justify-between px-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Stats</p>
        <button onClick={onAddGroup} className="text-[10px] font-bold flex items-center gap-1 transition-colors hover:text-[var(--accent-brown)]" style={{ color: 'var(--text-secondary)' }}>
          <Plus size={11} /> Groupe
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {statGroups.map((group) => (
          <GroupSection
            key={group}
            name={group}
            stats={statsInGroup(group)}
            selection={selection}
            onSelectStat={onSelectStat}
            onRenameStat={onRenameStat}
            onRenameGroup={(newName) => onRenameGroup(group, newName)}
            onRemoveGroup={() => onRemoveGroup(group)}
          />
        ))}

        {/* "Sans groupe" — toujours présent, non supprimable/renommable, cible droppable valide. */}
        <div className="space-y-1">
          {statGroups.length > 0 && (
            <p className="text-[10px] font-bold uppercase tracking-wider px-2.5 pt-1" style={{ color: 'var(--text-secondary)' }}>Sans groupe</p>
          )}
          <SortableContext items={statsInGroup(UNGROUPED).map((s) => s.key)} strategy={verticalListSortingStrategy}>
            <GroupDropZone id={UNGROUPED}>
              {statsInGroup(UNGROUPED).map((stat) => (
                <SortableStatItem
                  key={stat.key}
                  stat={stat}
                  active={selection.kind === 'stat' && selection.key === stat.key}
                  autoFocus={selection.kind === 'stat' && selection.key === stat.key && !stat.label}
                  onClick={() => onSelectStat(stat.key)}
                  onRename={(label) => onRenameStat(stat.key, label)}
                />
              ))}
            </GroupDropZone>
          </SortableContext>
        </div>

        <DragOverlay>
          {activeStat && (
            <StatNavRow stat={activeStat} active={false} onClick={() => {}} onRename={() => {}} />
          )}
        </DragOverlay>
      </DndContext>

      <button onClick={onAddStat} className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
        + Ajouter une stat
      </button>
    </div>
  );
}

function GroupSection({ name, stats, selection, onSelectStat, onRenameStat, onRenameGroup, onRemoveGroup }: {
  name: string;
  stats: StatDefinition[];
  selection: SelectionId;
  onSelectStat: (key: string) => void;
  onRenameStat: (key: string, label: string) => void;
  onRenameGroup: (newName: string) => void;
  onRemoveGroup: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);

  const commitRename = () => {
    setEditingName(false);
    if (draftName.trim() && draftName !== name) onRenameGroup(draftName.trim());
    else setDraftName(name);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 px-2.5 group">
        {editingName ? (
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); }}
            autoFocus
            className="flex-1 min-w-0 bg-transparent border-b outline-none text-[10px] font-bold uppercase tracking-wider py-0.5"
            style={{ color: 'var(--text-primary)', borderColor: 'var(--accent-brown)' }}
          />
        ) : (
          <p className="flex-1 min-w-0 text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: 'var(--text-secondary)' }}>{name}</p>
        )}
        <button onClick={() => setEditingName(true)} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-secondary)' }}>
          <Pencil size={10} />
        </button>
        <button onClick={onRemoveGroup} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400" style={{ color: 'var(--text-secondary)' }}>
          <Trash2 size={10} />
        </button>
      </div>
      <SortableContext items={stats.map((s) => s.key)} strategy={verticalListSortingStrategy}>
        <GroupDropZone id={name}>
          {stats.map((stat) => (
            <SortableStatItem
              key={stat.key}
              stat={stat}
              active={selection.kind === 'stat' && selection.key === stat.key}
              autoFocus={selection.kind === 'stat' && selection.key === stat.key && !stat.label}
              onClick={() => onSelectStat(stat.key)}
              onRename={(label) => onRenameStat(stat.key, label)}
            />
          ))}
          {stats.length === 0 && (
            <div className="px-2.5 py-2 text-[11px] italic rounded-lg border border-dashed" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}>
              Glissez une stat ici
            </div>
          )}
        </GroupDropZone>
      </SortableContext>
    </div>
  );
}

function DetailHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="space-y-0.5 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
      <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-title)' }}>{title}</h3>
      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{hint}</p>
    </div>
  );
}

function GeneralPanel({ local, onChangeDescription, onBlurSave }: { local: Draft; onChangeDescription: (v: string) => void; onBlurSave: () => void }) {
  return (
    <div>
      <DetailHeader title="Informations générales" hint="Le nom et la description de ce système de règles." />
      <div className="space-y-1.5 max-w-md">
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Description</label>
        <textarea
          value={local.description}
          onChange={(e) => onChangeDescription(e.target.value)}
          onBlur={onBlurSave}
          rows={3}
          placeholder="Décrivez en une phrase ce système (optionnel)"
          className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm placeholder:opacity-40"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>
    </div>
  );
}

const DEFAULT_MODIFIER_FORMULA: FormulaNode = {
  type: 'floor',
  arg: { type: 'div', args: [{ type: 'sub', args: [{ type: 'self' }, { type: 'const', value: 10 }] }, { type: 'const', value: 2 }] },
};

function ModifierPanel({ local, onSave }: { local: Draft; onSave: (next: Draft) => void }) {
  const referenceableStats = local.stats.filter((s) => s.category !== 'meta');
  return (
    <div>
      <DetailHeader title="Formule du modificateur" hint="Calcul commun à toutes les caractéristiques du système (mod()), utilisé par les formules d'autres stats." />
      <div className="space-y-1.5 max-w-md">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>mod(valeur) =</label>
          {local.modifierFormula && (
            <button type="button" onClick={() => onSave({ ...local, modifierFormula: undefined })} className="text-[10px] px-2 py-1 rounded border transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
              Revenir au calcul par défaut
            </button>
          )}
        </div>
        <FormulaEditor
          targetLabel="mod(valeur)"
          value={local.modifierFormula ?? DEFAULT_MODIFIER_FORMULA}
          onChange={(node) => onSave({ ...local, modifierFormula: node ?? undefined })}
          availableStats={referenceableStats}
          allowSelf
        />
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Par défaut : ⌊(valeur−10)/2⌋ (style D&amp;D). &quot;Valeur de la stat&quot; représente la caractéristique
          pour laquelle le modificateur est calculé (ex FOR, DEX...), quelle que soit son nom dans ce système.
        </p>
      </div>
    </div>
  );
}

const AGGREGATE_LABELS: Record<RollConstraintAggregate, string> = {
  evenCount: 'Nombre de valeurs paires',
  oddCount: 'Nombre de valeurs impaires',
  sumValues: 'Somme des valeurs',
  sumModifiers: 'Somme des modificateurs',
};

const OPERATOR_LABELS: Record<RollComparisonOperator, string> = {
  '=': '=',
  '<': '<',
  '>': '>',
  '<=': '≤',
  '>=': '≥',
};

function makeConstraintId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `constraint-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function RollConstraintPanel({ local, onSave }: { local: Draft; onSave: (next: Draft) => void }) {
  const allAbilities = local.stats.filter((s) => s.category === 'ability');
  const creation = local.creation ?? { method: 'manual' as const };
  const constraints = creation.rollConstraints ?? [];

  const saveConstraints = (next: RollConstraintRule[]) => {
    onSave({ ...local, creation: { ...creation, rollConstraints: next } });
  };

  const addConstraint = () => {
    const newConstraint: RollConstraintRule = {
      id: makeConstraintId(),
      statKeys: [],
      aggregate: 'evenCount',
      operator: '=',
      target: 0,
    };
    saveConstraints([...constraints, newConstraint]);
  };

  const updateConstraint = (id: string, patch: Partial<RollConstraintRule>) => {
    saveConstraints(constraints.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const removeConstraint = (id: string) => {
    saveConstraints(constraints.filter((c) => c.id !== id));
  };

  const toggleStatInConstraint = (constraint: RollConstraintRule, key: string, included: boolean) => {
    const nextKeys = included ? [...constraint.statKeys, key] : constraint.statKeys.filter((k) => k !== key);
    updateConstraint(constraint.id, { statKeys: nextKeys });
  };

  return (
    <div>
      <DetailHeader
        title="Contrainte de tirage"
        hint="Ajoute des règles sur le tirage des caractéristiques : chaque contrainte porte sur ses propres caractéristiques choisies, et compare un agrégat (nombre de pairs, somme...) à une valeur cible."
      />
      <div className="space-y-4 max-w-md">
        {constraints.length === 0 && (
          <p className="text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>Aucune contrainte pour le moment.</p>
        )}

        {constraints.map((constraint) => {
          const concernedAbilities = allAbilities.filter((s) => constraint.statKeys.includes(s.key));
          const evenCountTooHigh = constraint.aggregate === 'evenCount' && constraint.operator === '=' && constraint.target > concernedAbilities.length;

          return (
            <div key={constraint.id} className="p-3 rounded-lg border space-y-3" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-dark)' }}>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={constraint.label ?? ''}
                  onChange={(e) => updateConstraint(constraint.id, { label: e.target.value })}
                  placeholder="Nom de la contrainte (optionnel)"
                  className="flex-1 bg-transparent border-b border-dashed text-sm font-bold px-0.5 py-1 focus:outline-none"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                />
                <button type="button" onClick={() => removeConstraint(constraint.id)} className="p-1.5 rounded transition-colors hover:text-[#e05a5a]" style={{ color: 'var(--text-secondary)' }} title="Supprimer cette contrainte">
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Caractéristiques concernées</label>
                {allAbilities.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {allAbilities.map((stat) => {
                      const included = constraint.statKeys.includes(stat.key);
                      return (
                        <button
                          key={stat.key}
                          type="button"
                          onClick={() => toggleStatInConstraint(constraint, stat.key, !included)}
                          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
                          style={{
                            borderColor: included ? 'var(--accent-brown)' : 'var(--border-color)',
                            background: included ? 'color-mix(in srgb, var(--accent-brown) 15%, transparent)' : 'var(--bg-dark)',
                            color: included ? 'var(--accent-brown)' : 'var(--text-secondary)',
                          }}
                        >
                          {included && <Check size={12} />}
                          {stat.label || stat.key}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>Aucune caractéristique définie pour le moment.</p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={constraint.aggregate}
                  onChange={(e) => updateConstraint(constraint.id, { aggregate: e.target.value as RollConstraintAggregate })}
                  className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-xs"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {(Object.keys(AGGREGATE_LABELS) as RollConstraintAggregate[]).map((agg) => (
                    <option key={agg} value={agg}>{AGGREGATE_LABELS[agg]}</option>
                  ))}
                </select>
                <select
                  value={constraint.operator}
                  onChange={(e) => updateConstraint(constraint.id, { operator: e.target.value as RollComparisonOperator })}
                  className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-xs"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {(Object.keys(OPERATOR_LABELS) as RollComparisonOperator[]).map((op) => (
                    <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={constraint.target}
                  onChange={(e) => updateConstraint(constraint.id, { target: Number(e.target.value) })}
                  className="w-16 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm text-center"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>

              {evenCountTooHigh && (
                <p className="text-[11px] font-bold" style={{ color: '#e05a5a' }}>
                  {concernedAbilities.length} caractéristique{concernedAbilities.length > 1 ? 's' : ''} concernée{concernedAbilities.length > 1 ? 's' : ''} seulement — cette
                  contrainte ne pourra jamais être atteinte, le tirage échouera systématiquement.
                </p>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={addConstraint}
          className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <Plus size={12} /> Ajouter une contrainte
        </button>
      </div>
    </div>
  );
}

function TestPanel({ gameSystem }: { gameSystem: GameSystemDefinition }) {
  // Regroupées par StatDefinition.group (ordre défini par le MJ dans la liste de gauche) — même
  // regroupement que la colonne de gauche de l'éditeur et que l'onglet Caractéristiques de /creation.
  const groups = groupStats(gameSystem.stats.filter((s) => s.category !== 'meta'), gameSystem.statGroups);
  const [result, setResult] = useState<ReturnType<typeof rollCharacterStats> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRoll = () => {
    try {
      setError(null);
      setResult(rollCharacterStats(gameSystem, {}, [], {}));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const calculateModifier = (value: number) => Math.floor((value - 10) / 2);

  const valueOf = (stat: StatDefinition): number | string | boolean => {
    if (!result) return 0;
    if (stat.category === 'ability') return result.abilities[stat.key] ?? 0;
    return result.derived[stat.key] ?? 0;
  };

  return (
    <div>
      <DetailHeader title="Tester le système" hint="Simule un tirage de personnage complet avec les règles actuelles, sans avoir besoin de créer une salle ni un personnage." />
      <div className="space-y-4 max-w-2xl">
        <button
          type="button"
          onClick={handleRoll}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-colors"
          style={{ background: 'var(--accent-brown)', color: 'var(--bg-dark)' }}
        >
          <Dice6 size={16} /> Lancer les dés
        </button>

        {error && (
          <p className="text-[12px] font-bold p-3 rounded-lg border" style={{ color: '#e05a5a', borderColor: '#e05a5a', background: 'rgba(224,90,90,0.08)' }}>
            Erreur : {error}
          </p>
        )}

        {result && !error && (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.name ?? '__ungrouped__'}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>{group.name ?? 'Autres stats'}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {group.stats.map((stat) => {
                    const value = valueOf(stat);
                    const mod = calculateModifier(Number(value));
                    const showMod = stat.category === 'ability' && stat.rollUsesModifier;
                    return (
                      <div key={stat.key} className="p-3 rounded-lg border text-center" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-dark)' }}>
                        <p className="text-[10px] uppercase tracking-wider truncate" style={{ color: 'var(--text-secondary)' }}>{stat.label || stat.key}</p>
                        <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                          {showMod ? `${mod > 0 ? '+' : ''}${mod}` : String(value)}
                        </p>
                        {showMod && (
                          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>valeur brute {String(value)}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {!result && !error && (
          <p className="text-[12px] italic" style={{ color: 'var(--text-secondary)' }}>Cliquez sur &quot;Lancer les dés&quot; pour voir un exemple de personnage généré avec ces règles.</p>
        )}
      </div>
    </div>
  );
}

function StatDetail({ stat, allStats, onChange, onRemove }: {
  stat: StatDefinition;
  allStats: StatDefinition[];
  onChange: (patch: Partial<StatDefinition>) => void;
  onRemove: () => void;
}) {
  const kind = statKind(stat);
  const referenceableStats = allStats.filter((s) => s.key !== stat.key && s.category !== 'meta');
  const [cycleError, setCycleError] = useState<string | null>(null);

  // Empêche d'enregistrer une rollFormula qui créerait un cycle de dépendance (ex FOR dépend de FORM
  // qui dépend de FOR) — un tel cycle ferait planter le tirage des abilities à la création du personnage,
  // donc il vaut mieux bloquer à l'édition (MJ) plutôt que de laisser l'erreur remonter au joueur.
  const handleRollFormulaChange = (node: StatDefinition['rollFormula'] | null) => {
    const candidateStats = allStats.map((s) => (s.key === stat.key ? { ...s, rollFormula: node ?? undefined } : s));
    const cycleKey = findRollFormulaCycle(candidateStats.filter((s) => s.category === 'ability'));
    if (cycleKey) {
      setCycleError(`Cette formule crée une dépendance circulaire (via "${cycleKey}") — impossible à résoudre au tirage. Modifiez-la pour casser la boucle.`);
      return;
    }
    setCycleError(null);
    onChange({ rollFormula: node ?? undefined });
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="space-y-1.5 flex-1 min-w-0">
          <TypeBadge kind={kind} />
          <h3 className="text-lg font-bold truncate" style={{ color: stat.label ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: 'var(--font-title)' }}>
            {stat.label || '(sans nom — renommez-la dans la liste à gauche)'}
          </h3>
        </div>
        {stat.protected ? (
          <span className="text-[10px] italic px-2 py-1.5 shrink-0" style={{ color: 'var(--text-secondary)' }} title="Cette stat est requise par toute fiche de personnage (barre de vie) et ne peut pas être supprimée.">
            Requise
          </span>
        ) : (
          <button onClick={onRemove} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1.5 shrink-0"><Trash2 size={16} /></button>
        )}
      </div>

      <div className="space-y-4 max-w-md">
        {/* Une "ability" (libre) est calculée UNE FOIS à la création via rollFormula (ex "aléatoire
            entre 6 et 20"), jamais recalculée ensuite — le joueur peut modifier la valeur après coup.
            Une stat "calculée" (derived) utilise valueFormula, réévaluée en continu (ex Défense). */}
        {kind === 'derived' ? (
          <FormulaEditor
            key={`${stat.key}:value`}
            targetLabel={stat.label || 'Cette stat'}
            value={stat.valueFormula ?? null}
            onChange={(node) => onChange({ valueFormula: node ?? undefined, category: node ? 'derived' : 'ability' })}
            availableStats={referenceableStats}
          />
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Génération à la création (optionnel)
              </label>
              <FormulaEditor
                key={`${stat.key}:roll`}
                targetLabel={stat.label || 'Cette stat'}
                value={stat.rollFormula ?? (stat.category === 'vital' && stat.maxFormula ? stat.maxFormula : null)}
                onChange={handleRollFormulaChange}
                availableStats={referenceableStats}
              />
              {cycleError && (
                <p className="text-[11px] font-bold" style={{ color: '#e05a5a' }}>{cycleError}</p>
              )}
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {stat.category === 'vital'
                  ? 'Évaluée une seule fois à la création (ex Variable → Maximum), puis le joueur modifie librement (PV qui descend en combat) — toujours dans les bornes définies ci-dessous.'
                  : 'Sans règle ci-dessus, le joueur part de la valeur de départ ci-dessous et la modifie librement.'}
              </p>
            </div>

            {stat.category !== 'vital' && (
              <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                Valeur de départ
                <input type="number" value={Number(stat.defaultValue ?? 10)} onChange={(e) => onChange({ defaultValue: Number(e.target.value) })} className="w-16 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm text-center" style={{ color: 'var(--text-primary)' }} />
              </label>
            )}

            {stat.category !== 'vital' && (
              <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:border-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-dark)' }}>
                <input type="checkbox" checked={!!stat.rollUsesModifier} onChange={(e) => onChange({
                  rollUsesModifier: e.target.checked,
                })} className="mt-0.5 accent-[var(--accent-brown)]" />
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>S&apos;affiche comme un modificateur</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Style D&amp;D : cette stat s&apos;affiche partout (fiche, lanceur de dés) sous forme de modificateur au lieu de sa valeur brute.
                    Le calcul du modificateur lui-même (mod()) est commun à tout le système — configurable dans l&apos;onglet &quot;Modificateur&quot; à gauche.
                  </p>
                </div>
              </label>
            )}
          </>
        )}

        {/* Bornes optionnelles, identiques pour toute stat (ex PV : Minimum=0, Maximum=Variable→PV_Max) —
            chacune une formule quelconque (constante, variable, aléatoire...), pas juste une référence fixe. */}
        <BoundsSection stat={stat} referenceableStats={referenceableStats} onChange={onChange} />

        <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:border-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-dark)' }}>
          <input type="checkbox" checked={!!stat.isRollable} onChange={(e) => onChange({ isRollable: e.target.checked })} className="mt-0.5 accent-[var(--accent-brown)]" />
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Lançable aux dés</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Proposée par défaut dans le lanceur de dés des joueurs.</p>
          </div>
        </label>
      </div>
    </div>
  );
}

function BoundsSection({ stat, referenceableStats, onChange }: {
  stat: StatDefinition;
  referenceableStats: StatDefinition[];
  onChange: (patch: Partial<StatDefinition>) => void;
}) {
  return (
    <div className="space-y-3 p-3 rounded-lg border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-dark)' }}>
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Bornes (optionnel)</p>
      <BoundRow
        key={`${stat.key}:min`}
        label="Minimum"
        formula={stat.minFormula}
        onChange={(node) => onChange({ minFormula: node ?? undefined })}
        availableStats={referenceableStats}
        targetLabel={`Minimum de ${stat.label || 'cette stat'}`}
      />
      <BoundRow
        key={`${stat.key}:max`}
        label="Maximum"
        formula={stat.maxFormula}
        onChange={(node) => onChange({ maxFormula: node ?? undefined })}
        availableStats={referenceableStats}
        targetLabel={`Maximum de ${stat.label || 'cette stat'}`}
      />
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        La valeur courante reste toujours dans ces bornes si définies (ex Maximum = Variable → PV Max).
      </p>
    </div>
  );
}

function BoundRow({ label, formula, onChange, availableStats, targetLabel }: {
  label: string;
  formula: FormulaNode | undefined;
  onChange: (node: FormulaNode | null) => void;
  availableStats: StatDefinition[];
  targetLabel: string;
}) {
  const [enabled, setEnabled] = useState(!!formula);
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (!e.target.checked) onChange(null);
          }}
          className="accent-[var(--accent-brown)]"
        />
        {label}
      </label>
      {enabled && (
        <FormulaEditor
          targetLabel={targetLabel}
          value={formula ?? null}
          onChange={onChange}
          availableStats={availableStats}
        />
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { db, doc, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, collection, query, where } from '@/lib/firebase';
import { useGame } from '@/contexts/GameContext';
import { moduleRegistry } from '@/modules/registry';
import { dndClassicModule } from '@/modules/builtin/dnd-classic';
import type { GameSystemDefinition, StatDefinition, CharacterCreationRule, FormulaNode, RollConstraintRule, RollConstraintAggregate, RollComparisonOperator, RaceDefinition, ProfileDefinition, RacialAbility, SymbolDieDefinition, SymbolDieFace, GameRuleEntry, LocationFieldDefinition, SkillDefinition, CharacterLayoutEntry } from '@/modules/game-system/types';
import type { LocationDoc } from '@/modules/game-content/types';
import { useSpecializations, SpecializationsOverviewPanel, SpecializationDetail } from './SpecializationsPanel';
import { FormulaEditor } from './FormulaEditor';
import { findRollFormulaCycle, rollCharacterStats, groupStats } from '@/lib/rules-engine';
import { buildGameSystemExport, downloadGameSystemExport, parseGameSystemExport, isRacePackExport, parseRacePackExport, stripUndefinedDeep } from '@/modules/game-system/transfer';
import { toast } from 'sonner';
import { Check, Plus, Trash2, Copy, AlertTriangle, ChevronLeft, Dice6, GripVertical, Pencil, Download, Upload } from 'lucide-react';
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
    races: [],
    profiles: [],
    skills: [],
  };
}

export type Draft = GameSystemDefinition & { name: string; description: string };

export default function GameSystemManagerPanel() {
  const { isMJ, user } = useGame();
  const roomId = (user as { roomId?: string } | null)?.roomId ?? null;
  const uid = (user as { uid?: string } | null)?.uid ?? null;

  const [activeSystemId, setActiveSystemId] = useState<string>('dnd-classic');
  // Systèmes custom accessibles au MJ courant, quelle que soit leur source de stockage :
  // catalogue partagé gameSystems/{id} (nouveau, filtré par ownerId) OU legacy scopé à la room
  // Salle/{roomId}/gameSystemOverrides/{id} (anciennes salles). Fusionnés dans une seule map, avec
  // sourceKind pour savoir où écrire au moment de la sauvegarde/suppression.
  const [overrides, setOverrides] = useState<Record<string, Draft & { sourceKind: 'catalog' | 'legacy' }>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [confirmSwitchTo, setConfirmSwitchTo] = useState<string | null>(null);
  const [editingSystemId, setEditingSystemId] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) { setIsLoading(false); return; }
    const unsubRoom = onSnapshot(doc(db, 'Salle', roomId), (snap) => {
      setActiveSystemId((snap.data()?.gameSystemId as string) || 'dnd-classic');
      setIsLoading(false);
    });

    let catalogEntries: Record<string, Draft & { sourceKind: 'catalog' | 'legacy' }> = {};
    let legacyEntries: Record<string, Draft & { sourceKind: 'catalog' | 'legacy' }> = {};
    const mergeAndSet = () => setOverrides({ ...legacyEntries, ...catalogEntries });

    const unsubOverrides = onSnapshot(collection(db, `Salle/${roomId}/gameSystemOverrides`), (snap) => {
      legacyEntries = {};
      snap.forEach((d) => { legacyEntries[d.id] = { ...(d.data() as Draft), sourceKind: 'legacy' }; });
      mergeAndSet();
    });

    // Catalogue partagé : uniquement les systèmes créés par ce MJ (pas tout le catalogue global).
    const unsubCatalog = uid
      ? onSnapshot(query(collection(db, 'gameSystems'), where('ownerId', '==', uid)), (snap) => {
          catalogEntries = {};
          snap.forEach((d) => { catalogEntries[d.id] = { ...(d.data() as Draft), sourceKind: 'catalog' }; });
          mergeAndSet();
        })
      : () => {};

    return () => { unsubRoom(); unsubOverrides(); unsubCatalog(); };
  }, [roomId, uid]);

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
    const sourceKind = overrides[systemId]?.sourceKind ?? 'legacy';
    const ref = sourceKind === 'catalog' ? doc(db, 'gameSystems', systemId) : doc(db, `Salle/${roomId}/gameSystemOverrides`, systemId);
    deleteDoc(ref);
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
    const ref = draft.sourceKind === 'catalog'
      ? doc(db, 'gameSystems', editingSystemId)
      : doc(db, `Salle/${roomId}/gameSystemOverrides`, editingSystemId);
    // Chemin de la sous-collection 'content' de CE système (pas forcément celui actif de la table) —
    // mêmes deux cas que useGameSystem.contentPath, mais pour le système en cours d'édition ici.
    const contentPath = draft.sourceKind === 'catalog'
      ? `gameSystems/${editingSystemId}/content`
      : `Salle/${roomId}/gameSystemOverrides/${editingSystemId}/content`;
    return (
      <GameSystemEditor
        draft={draft}
        contentPath={contentPath}
        onBack={() => setEditingSystemId(null)}
        onSave={(next) => updateDoc(ref, stripUndefinedDeep(next) as unknown as Record<string, unknown>)}
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

type SelectionId =
  | { kind: 'stat'; key: string }
  | { kind: 'general' }
  | { kind: 'modifier' }
  | { kind: 'roll' }
  | { kind: 'test' }
  | { kind: 'characters' }
  | { kind: 'race'; id: string }
  | { kind: 'profile'; id: string }
  | { kind: 'groupEntity' }
  | { kind: 'groupEntityStat'; key: string }
  | { kind: 'symbolDice' }
  | { kind: 'symbolDie'; key: string }
  | { kind: 'rules' }
  | { kind: 'locations' }
  | { kind: 'location'; id: string }
  | { kind: 'skills' }
  | { kind: 'skill'; key: string }
  | { kind: 'specializations' }
  | { kind: 'specialization'; id: string };

export function GameSystemEditor({ draft, contentPath, onBack, onSave }: { draft: Draft; contentPath?: string; onBack: () => void; onSave: (next: Draft) => void | Promise<void> }) {
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

  // ── Races/profils (personnages jouables proposés à la création, remplace race.json/profile.json) ──
  const races = local.races ?? [];
  const profiles = local.profiles ?? [];
  const addRace = () => {
    const race: RaceDefinition = { id: makeId('content'), label: '', modifiers: {}, abilities: [] };
    save({ ...local, races: [...races, race] });
    setSelection({ kind: 'race', id: race.id });
  };
  const updateRace = (id: string, patch: Partial<RaceDefinition>) => save({ ...local, races: races.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const removeRace = (id: string) => {
    save({ ...local, races: races.filter((r) => r.id !== id) });
    if (selection.kind === 'race' && selection.id === id) setSelection({ kind: 'characters' });
  };
  const addProfile = () => {
    const profile: ProfileDefinition = { id: makeId('content'), label: '' };
    save({ ...local, profiles: [...profiles, profile] });
    setSelection({ kind: 'profile', id: profile.id });
  };
  const updateProfile = (id: string, patch: Partial<ProfileDefinition>) => save({ ...local, profiles: profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const removeProfile = (id: string) => {
    save({ ...local, profiles: profiles.filter((p) => p.id !== id) });
    if (selection.kind === 'profile' && selection.id === id) setSelection({ kind: 'characters' });
  };
  const selectedRace = selection.kind === 'race' ? races.find((r) => r.id === selection.id) : undefined;
  const selectedProfile = selection.kind === 'profile' ? profiles.find((p) => p.id === selection.id) : undefined;

  // ── Schéma de stats de l'entité de GROUPE (nom libre défini par le MJ, ex "Vaisseau", "Base secrète")
  //    — généricité identique aux stats de personnage, cf. StatList/StatDetail ci-dessus. Les instances
  //    vivent séparément, hors de ce Draft, dans Salle/{roomId}/groupEntities. ──
  const groupEntityStats = local.groupEntityStats ?? [];
  const groupEntityLabel = local.groupEntityLabel || 'Entité de groupe';
  const addGroupEntityStat = () => {
    const stat = emptyStat(groupEntityStats.map((s) => s.key));
    save({ ...local, groupEntityStats: [...groupEntityStats, stat] });
    setSelection({ kind: 'groupEntityStat', key: stat.key });
  };
  const updateGroupEntityStat = (key: string, patch: Partial<StatDefinition>) => save({ ...local, groupEntityStats: groupEntityStats.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  const removeGroupEntityStat = (key: string) => {
    save({ ...local, groupEntityStats: groupEntityStats.filter((s) => s.key !== key) });
    if (selection.kind === 'groupEntityStat' && selection.key === key) setSelection({ kind: 'groupEntity' });
  };
  const selectedGroupEntityStat = selection.kind === 'groupEntityStat' ? groupEntityStats.find((s) => s.key === selection.key) : undefined;

  // ── Dés à SYMBOLES (ex système narratif façon Star Wars) — 100% configuré par le MJ, aucun dé codé
  //    en dur : chaque dé a un nombre de faces libre, chaque face porte une combinaison de symboles
  //    libre (voir SymbolDieDefinition). Résolu par src/lib/rules-engine/symbol-dice.ts. ──
  const symbolDice = local.symbolDice ?? [];
  const addSymbolDie = () => {
    const existingKeys = new Set(symbolDice.map((d) => d.key));
    let i = symbolDice.length + 1;
    while (existingKeys.has(`de${i}`)) i++;
    const die: SymbolDieDefinition = { key: `de${i}`, label: '', faces: [{ values: {} }, { values: {} }] };
    save({ ...local, symbolDice: [...symbolDice, die] });
    setSelection({ kind: 'symbolDie', key: die.key });
  };
  const updateSymbolDie = (key: string, patch: Partial<SymbolDieDefinition>) =>
    save({ ...local, symbolDice: symbolDice.map((d) => (d.key === key ? { ...d, ...patch } : d)) });
  const removeSymbolDie = (key: string) => {
    save({ ...local, symbolDice: symbolDice.filter((d) => d.key !== key) });
    if (selection.kind === 'symbolDie' && selection.key === key) setSelection({ kind: 'symbolDice' });
  };
  const selectedSymbolDie = selection.kind === 'symbolDie' ? symbolDice.find((d) => d.key === selection.key) : undefined;

  // ── Compétences (ex Discrétion, Mécanique, Astrogation — façon système narratif type EotE) ──
  // Chacune liée à une Caractéristique de `stats` (SkillDefinition.linkedStatKey). Donnée de RÈGLES,
  // vit dans le Draft comme stats/races — pas de sous-collection Firestore séparée (contrairement aux
  // Spécialisations, plus volumineuses avec leur grille de talents).
  const skills = local.skills ?? [];
  const addSkill = () => {
    const skill: SkillDefinition = { key: newStatKey(skills.map((s) => s.key)), label: '', linkedStatKey: '' };
    save({ ...local, skills: [...skills, skill] });
    setSelection({ kind: 'skill', key: skill.key });
  };
  const updateSkill = (key: string, patch: Partial<SkillDefinition>) =>
    save({ ...local, skills: skills.map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  const removeSkill = (key: string) => {
    save({ ...local, skills: skills.filter((s) => s.key !== key) });
    if (selection.kind === 'skill' && selection.key === key) setSelection({ kind: 'skills' });
  };
  const selectedSkill = selection.kind === 'skill' ? skills.find((s) => s.key === selection.key) : undefined;

  // ── Lieux (ex Planète, Ville — nom libre défini par le MJ, façon narrative façon Star Wars) ──
  // Le SCHÉMA (locationLabel + champs additionnels) vit dans le Draft comme races/rules. Les INSTANCES
  // (chaque lieu) vivent en contenu Firestore (kind 'location', cf game-content/types.ts) — même
  // logique "gros contenu → sous-collection" que l'équipement/le bestiaire, pas dans ce Draft.
  const locationFields = local.locationFields ?? [];
  const addLocationField = () => save({ ...local, locationFields: [...locationFields, { key: makeId('field'), label: '' }] });
  const updateLocationField = (key: string, patch: Partial<LocationFieldDefinition>) =>
    save({ ...local, locationFields: locationFields.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
  const removeLocationField = (key: string) => save({ ...local, locationFields: locationFields.filter((f) => f.key !== key) });

  // Instances : non disponibles tant que ce système n'a pas de contentPath valide (ex brouillon en
  // cours de création de salle, pas encore persisté en Firestore — cf app/creer/page.tsx).
  const [locations, setLocations] = useState<(LocationDoc & { id: string })[]>([]);
  useEffect(() => {
    if (!contentPath) { setLocations([]); return; }
    const unsubscribe = onSnapshot(
      query(collection(db, contentPath), where('kind', '==', 'location')),
      (snap) => setLocations(snap.docs.map((d) => ({ id: d.id, ...(d.data() as LocationDoc) }))),
      (error) => { console.error('[GameSystemManagerPanel] erreur lecture lieux:', error.code, error.message); setLocations([]); },
    );
    return () => unsubscribe();
  }, [contentPath]);

  const addLocation = async () => {
    if (!contentPath) return;
    const docRef = await addDoc(collection(db, contentPath), stripUndefinedDeep({ kind: 'location', name: '', values: {} }));
    setSelection({ kind: 'location', id: docRef.id });
  };
  const updateLocation = (id: string, patch: Partial<LocationDoc>) => {
    if (!contentPath) return;
    updateDoc(doc(db, contentPath, id), stripUndefinedDeep(patch) as unknown as Record<string, unknown>);
  };
  const removeLocation = (id: string) => {
    if (!contentPath) return;
    deleteDoc(doc(db, contentPath, id));
    if (selection.kind === 'location' && selection.id === id) setSelection({ kind: 'locations' });
  };
  const selectedLocation = selection.kind === 'location' ? locations.find((l) => l.id === selection.id) : undefined;

  // ── Spécialisations (ex système narratif type EotE) — schéma ET instances vivent en contenu
  //    Firestore (kind 'specialization', gros contenu = grille de talents), aucune donnée dans ce Draft. ──
  const { specializations, addSpecialization, updateSpecialization, removeSpecialization } = useSpecializations(contentPath);
  const addSpecializationAndSelect = async () => {
    const id = await addSpecialization();
    if (id) setSelection({ kind: 'specialization', id });
  };
  const removeSpecializationAndDeselect = (id: string) => {
    removeSpecialization(id);
    if (selection.kind === 'specialization' && selection.id === id) setSelection({ kind: 'specializations' });
  };
  const selectedSpecialization = selection.kind === 'specialization' ? specializations.find((s) => s.id === selection.id) : undefined;

  const handleExport = () => {
    const exportData = buildGameSystemExport(local);
    downloadGameSystemExport(exportData, `${local.name || local.systemId}.json`);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string;

        // Fichier "pack de races" seul (races sans stats, ex race_star_wars.json) : ne remplace QUE
        // les races du système en cours d'édition, tout le reste (stats, dés, formules...) est conservé.
        if (isRacePackExport(JSON.parse(raw))) {
          const pack = parseRacePackExport(raw);
          if (races.length > 0 && !window.confirm(`Remplacer les ${races.length} ${(local.raceLabel || 'race').toLowerCase()}(s) actuelles par les ${pack.races.length} du fichier ? Le reste du système n'est pas modifié.`)) {
            return;
          }
          save({ ...local, races: pack.races, ...(pack.raceLabel != null ? { raceLabel: pack.raceLabel } : {}) });
          setSelection({ kind: 'characters' });
          toast.success(`${pack.races.length} ${(pack.raceLabel || local.raceLabel || 'race').toLowerCase()}(s) importée(s).`);
          return;
        }

        const imported = parseGameSystemExport(raw);
        const isNotEmpty = local.stats.length > defaultVitalStats().length || races.length > 0 || profiles.length > 0;
        if (isNotEmpty && !window.confirm('Importer remplacera les caractéristiques, contraintes de tirage, races et profils actuels. Continuer ?')) {
          return;
        }
        save({
          ...local,
          name: imported.name || local.name,
          description: imported.description || local.description,
          stats: imported.stats,
          creation: imported.creation,
          combatDefenseKey: imported.combatDefenseKey,
          combatAttackKeys: imported.combatAttackKeys,
          modifierFormula: imported.modifierFormula,
          statGroups: imported.statGroups,
          races: imported.races,
          profiles: imported.profiles,
          raceLabel: imported.raceLabel,
          profileLabel: imported.profileLabel,
          groupEntityLabel: imported.groupEntityLabel,
          groupEntityStats: imported.groupEntityStats,
          groupEntityCreation: imported.groupEntityCreation,
          symbolDice: imported.symbolDice,
          rules: imported.rules,
          locationLabel: imported.locationLabel,
          locationFields: imported.locationFields,
          skills: imported.skills,
          skillLabel: imported.skillLabel,
          startingXp: imported.startingXp,
          diceUpgradeRule: imported.diceUpgradeRule,
          defaultCharacterLayout: imported.defaultCharacterLayout,
        });
        setSelection({ kind: 'general' });
        toast.success('Système importé.');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Fichier invalide.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

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
        <button onClick={handleExport} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border shrink-0 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }} title="Exporter ce système en fichier JSON">
          <Download size={13} /> Exporter
        </button>
        <label className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border shrink-0 cursor-pointer transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }} title="Importer un système depuis un fichier JSON">
          <Upload size={13} /> Importer
          <input type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
        </label>
        {isSaving && <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>Enregistré…</span>}
        <div className="w-10 shrink-0" />
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* ── Colonne liste : juste les noms ── */}
        <div className="lg:w-[280px] shrink-0 overflow-y-auto p-3 space-y-1 lg:border-r" style={{ borderColor: 'var(--border-color)' }}>
          <NavRow label="Général" active={selection.kind === 'general'} onClick={() => setSelection({ kind: 'general' })} />
          <NavRow label="Modificateur" active={selection.kind === 'modifier'} onClick={() => setSelection({ kind: 'modifier' })} />
          <NavRow label="Tirage" active={selection.kind === 'roll'} onClick={() => setSelection({ kind: 'roll' })} />
          <NavRow label="Personnages" active={selection.kind === 'characters'} onClick={() => setSelection({ kind: 'characters' })} />
          <NavRow label={groupEntityLabel} active={selection.kind === 'groupEntity'} onClick={() => setSelection({ kind: 'groupEntity' })} />
          <NavRow label="Dés à symboles" active={selection.kind === 'symbolDice'} onClick={() => setSelection({ kind: 'symbolDice' })} />
          <NavRow label={local.skillLabel || 'Compétences'} active={selection.kind === 'skills'} onClick={() => setSelection({ kind: 'skills' })} />
          <NavRow label="Spécialisations" active={selection.kind === 'specializations'} onClick={() => setSelection({ kind: 'specializations' })} />
          <NavRow label="Glossaire" active={selection.kind === 'rules'} onClick={() => setSelection({ kind: 'rules' })} />
          <NavRow label={local.locationLabel ? `${local.locationLabel}s` : 'Lieux'} active={selection.kind === 'locations'} onClick={() => setSelection({ kind: 'locations' })} />
          <NavRow label="Tester" active={selection.kind === 'test'} onClick={() => setSelection({ kind: 'test' })} />

          {selection.kind === 'characters' || selectedRace || selectedProfile ? (
            <div className="pl-2.5 space-y-2 pt-1">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider px-1" style={{ color: 'var(--text-secondary)' }}>{local.raceLabel || 'Races'}</p>
                {races.map((r) => (
                  <NavRow key={r.id} label={r.label || '(sans nom)'} active={selection.kind === 'race' && selection.id === r.id} onClick={() => setSelection({ kind: 'race', id: r.id })} />
                ))}
                <button onClick={addRace} className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                  <Plus size={12} /> Ajouter : {local.raceLabel || 'Race'}
                </button>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider px-1" style={{ color: 'var(--text-secondary)' }}>{local.profileLabel || 'Profils'}</p>
                {profiles.map((p) => (
                  <NavRow key={p.id} label={p.label || '(sans nom)'} active={selection.kind === 'profile' && selection.id === p.id} onClick={() => setSelection({ kind: 'profile', id: p.id })} />
                ))}
                <button onClick={addProfile} className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                  <Plus size={12} /> Ajouter : {local.profileLabel || 'Profil'}
                </button>
              </div>
            </div>
          ) : null}

          {selection.kind === 'groupEntity' || selectedGroupEntityStat ? (
            <div className="pl-2.5 space-y-1 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider px-1" style={{ color: 'var(--text-secondary)' }}>Stats ({groupEntityLabel.toLowerCase()})</p>
              {groupEntityStats.map((s) => (
                <StatNavRow
                  key={s.key}
                  stat={s}
                  active={selection.kind === 'groupEntityStat' && selection.key === s.key}
                  autoFocus={selection.kind === 'groupEntityStat' && selection.key === s.key && !s.label}
                  onClick={() => setSelection({ kind: 'groupEntityStat', key: s.key })}
                  onRename={(label) => updateGroupEntityStat(s.key, { label })}
                />
              ))}
              <button onClick={addGroupEntityStat} className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                <Plus size={12} /> Ajouter une stat
              </button>
            </div>
          ) : null}

          {selection.kind === 'symbolDice' || selectedSymbolDie ? (
            <div className="pl-2.5 space-y-1 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider px-1" style={{ color: 'var(--text-secondary)' }}>Dés</p>
              {symbolDice.map((d) => (
                <NavRow key={d.key} label={d.label || '(sans nom)'} active={selection.kind === 'symbolDie' && selection.key === d.key} onClick={() => setSelection({ kind: 'symbolDie', key: d.key })} />
              ))}
              <button onClick={addSymbolDie} className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                <Plus size={12} /> Ajouter un dé
              </button>
            </div>
          ) : null}

          {selection.kind === 'skills' || selectedSkill ? (
            <div className="pl-2.5 space-y-1 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider px-1" style={{ color: 'var(--text-secondary)' }}>{local.skillLabel || 'Compétences'}</p>
              {skills.map((s) => (
                <NavRow key={s.key} label={s.label || '(sans nom)'} active={selection.kind === 'skill' && selection.key === s.key} onClick={() => setSelection({ kind: 'skill', key: s.key })} />
              ))}
              <button onClick={addSkill} className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                <Plus size={12} /> Ajouter une compétence
              </button>
            </div>
          ) : null}

          {selection.kind === 'specializations' || selectedSpecialization ? (
            <div className="pl-2.5 space-y-1 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider px-1" style={{ color: 'var(--text-secondary)' }}>Spécialisations</p>
              {specializations.map((s) => (
                <NavRow key={s.id} label={s.name || '(sans nom)'} active={selection.kind === 'specialization' && selection.id === s.id} onClick={() => setSelection({ kind: 'specialization', id: s.id })} />
              ))}
              {contentPath ? (
                <button onClick={addSpecializationAndSelect} className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                  <Plus size={12} /> Ajouter une spécialisation
                </button>
              ) : null}
            </div>
          ) : null}

          {selection.kind === 'locations' || selectedLocation ? (
            <div className="pl-2.5 space-y-1 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-wider px-1" style={{ color: 'var(--text-secondary)' }}>{local.locationLabel ? `${local.locationLabel}s` : 'Lieux'}</p>
              {locations.map((l) => (
                <NavRow key={l.id} label={l.name || '(sans nom)'} active={selection.kind === 'location' && selection.id === l.id} onClick={() => setSelection({ kind: 'location', id: l.id })} />
              ))}
              {contentPath ? (
                <button onClick={addLocation} className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
                  <Plus size={12} /> Ajouter : {local.locationLabel || 'Lieu'}
                </button>
              ) : null}
            </div>
          ) : null}

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
            <GeneralPanel local={local} onChangeDescription={(description) => setLocal({ ...local, description })} onBlurSave={() => save(local)} onSave={save} />
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
          {selection.kind === 'characters' && (
            <div>
              <DetailHeader title="Personnages" hint="Espèces et profils proposés aux joueurs à la création — applique des modificateurs de caractéristiques génériques, quel que soit le système de règles actif." />
              <div className="space-y-4 max-w-md">
                <div className="flex items-center gap-4">
                  <label className="flex-1 space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>Nom affiché (races)</span>
                    <input
                      type="text"
                      value={local.raceLabel ?? ''}
                      onChange={(e) => setLocal({ ...local, raceLabel: e.target.value || undefined })}
                      onBlur={() => save(local)}
                      placeholder="Race"
                      className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
                      style={{ color: 'var(--text-primary)' }}
                    />
                  </label>
                  <label className="flex-1 space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>Nom affiché (profils)</span>
                    <input
                      type="text"
                      value={local.profileLabel ?? ''}
                      onChange={(e) => setLocal({ ...local, profileLabel: e.target.value || undefined })}
                      onBlur={() => save(local)}
                      placeholder="Profil"
                      className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
                      style={{ color: 'var(--text-primary)' }}
                    />
                  </label>
                </div>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Change uniquement le nom affiché aux joueurs (ex &quot;Espèce&quot; au lieu de &quot;Race&quot;) — sans effet sur les données elles-mêmes.
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{races.length} {(local.raceLabel || 'race').toLowerCase()}{races.length > 1 ? 's' : ''}, {profiles.length} {(local.profileLabel || 'profil').toLowerCase()}{profiles.length > 1 ? 's' : ''}.</p>
              </div>
            </div>
          )}
          {selectedRace && (
            <RaceDetail race={selectedRace} availableStats={local.stats.filter((s) => s.category === 'ability')} onChange={(patch) => updateRace(selectedRace.id, patch)} onRemove={() => removeRace(selectedRace.id)} />
          )}
          {selectedProfile && (
            <ProfileDetail profile={selectedProfile} availableSkills={skills} onChange={(patch) => updateProfile(selectedProfile.id, patch)} onRemove={() => removeProfile(selectedProfile.id)} />
          )}
          {selection.kind === 'groupEntity' && (
            <div>
              <DetailHeader title="Entité de groupe" hint="Une entité possédée par le groupe (la table), pas par un personnage — le MJ choisit ce qu'elle représente pour son système (ex Vaisseau, Base secrète, Guilde) et définit ses stats, avec le même mécanisme que les caractéristiques de personnage. Les instances se gèrent depuis le menu du MJ, pas ici." />
              <div className="space-y-4 max-w-md">
                <label className="space-y-1 block">
                  <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>Nom affiché</span>
                  <input
                    type="text"
                    value={local.groupEntityLabel ?? ''}
                    onChange={(e) => setLocal({ ...local, groupEntityLabel: e.target.value || undefined })}
                    onBlur={() => save(local)}
                    placeholder="ex Vaisseau, Base secrète, Guilde"
                    className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </label>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{groupEntityStats.length} stat{groupEntityStats.length > 1 ? 's' : ''} définie{groupEntityStats.length > 1 ? 's' : ''}.</p>
              </div>
            </div>
          )}
          {selectedGroupEntityStat && (
            <StatDetail stat={selectedGroupEntityStat} allStats={groupEntityStats} onChange={(patch) => updateGroupEntityStat(selectedGroupEntityStat.key, patch)} onRemove={() => removeGroupEntityStat(selectedGroupEntityStat.key)} />
          )}
          {selection.kind === 'symbolDice' && (
            <div>
              <DetailHeader title="Dés à symboles" hint="Dés dont chaque face assigne une valeur à une ou plusieurs caractéristiques du système (ex système narratif façon Star Wars) au lieu de produire une valeur numérique classique. Les 'symboles' (Succès, Échec, Avantage...) sont des caractéristiques ordinaires que vous définissez dans l'onglet Caractéristiques — une caractéristique dérivée avec une formule (ex max(sub(SuccèsBrut, ÉchecBrut), 0)) calcule le résultat net affiché." />
              <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{symbolDice.length} dé{symbolDice.length > 1 ? 's' : ''} défini{symbolDice.length > 1 ? 's' : ''}.</p>
            </div>
          )}
          {selectedSymbolDie && (
            <SymbolDieDetail die={selectedSymbolDie} availableStats={local.stats.filter((s) => s.category === 'ability')} onChange={(patch) => updateSymbolDie(selectedSymbolDie.key, patch)} onRemove={() => removeSymbolDie(selectedSymbolDie.key)} />
          )}
          {selection.kind === 'skills' && (
            <SkillsPanel local={local} onSave={save} skillCount={skills.length} />
          )}
          {selectedSkill && (
            <SkillDetail
              skill={selectedSkill}
              availableStats={local.stats.filter((s) => s.category === 'ability')}
              onChange={(patch) => updateSkill(selectedSkill.key, patch)}
              onRemove={() => removeSkill(selectedSkill.key)}
            />
          )}
          {selection.kind === 'specializations' && (
            <SpecializationsOverviewPanel count={specializations.length} contentPath={contentPath} specializationLabel="Spécialisation" />
          )}
          {selectedSpecialization && (
            <SpecializationDetail
              specialization={selectedSpecialization}
              profiles={profiles}
              skills={skills}
              onChange={(patch) => updateSpecialization(selectedSpecialization.id, patch)}
              onRemove={() => removeSpecializationAndDeselect(selectedSpecialization.id)}
            />
          )}
          {selection.kind === 'rules' && (
            <RulesPanel local={local} onSave={save} />
          )}
          {selection.kind === 'locations' && (
            <LocationsPanel
              local={local}
              onSave={save}
              locationCount={locations.length}
              contentPath={contentPath}
              onAddLocation={addLocation}
            />
          )}
          {selectedLocation && (
            <LocationDetail
              location={selectedLocation}
              fields={locationFields}
              locationLabel={local.locationLabel || 'Lieu'}
              onChange={(patch) => updateLocation(selectedLocation.id, patch)}
              onRemove={() => removeLocation(selectedLocation.id)}
            />
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

/** Les "symboles" ne sont PAS un type connu du moteur — ce sont des StatDefinition ordinaires que le MJ
 *  définit lui-même dans son système (onglet Caractéristiques), exactement comme une race référence des
 *  stats par leur clé. Une face de dé assigne juste des valeurs à ces stats (pattern identique à
 *  RaceDefinition.modifiers : Record<string, number>, cf RaceDetail plus bas).
 *  UI en tableau : une colonne par symbole utilisé par ce dé, une ligne par face — bien plus rapide à
 *  saisir qu'un formulaire par face quand un dé a 8-12 faces. */
function SymbolDieDetail({ die, availableStats, onChange, onRemove }: {
  die: SymbolDieDefinition;
  availableStats: StatDefinition[];
  onChange: (patch: Partial<SymbolDieDefinition>) => void;
  onRemove: () => void;
}) {
  // faceValues() : tolère un dé stocké avant configuration de ses faces (ou par une version
  // antérieure de l'éditeur) — une face sans `values` est une face vide, jamais un crash.
  const faceValues = (face: SymbolDieFace): Record<string, number> => face.values ?? {};

  // Colonnes du tableau = symboles utilisés par au moins une face, ordonnés comme dans le système
  // + colonnes ajoutées à la main pas encore remplies (état local, tant qu'aucune valeur n'est saisie).
  const usedKeys = new Set(die.faces.flatMap((f) => Object.keys(faceValues(f))));
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const columns = availableStats.filter((s) => usedKeys.has(s.key) || extraColumns.includes(s.key));

  const toggleColumn = (key: string, included: boolean) => {
    if (included) {
      setExtraColumns((prev) => (prev.includes(key) ? prev : [...prev, key]));
    } else {
      setExtraColumns((prev) => prev.filter((k) => k !== key));
      // Retirer la colonne supprime aussi ses valeurs sur toutes les faces.
      onChange({
        faces: die.faces.map((f) => {
          const values = { ...faceValues(f) };
          delete values[key];
          return { values };
        }),
      });
    }
  };

  const updateFaceValue = (index: number, key: string, amount: number) => {
    const values = { ...faceValues(die.faces[index]) };
    if (amount !== 0) values[key] = amount;
    else delete values[key]; // 0 = la face ne produit pas ce symbole, pas besoin de le stocker.
    onChange({ faces: die.faces.map((f, i) => (i === index ? { values } : { values: faceValues(f) })) });
  };

  const addFace = () => onChange({ faces: [...die.faces.map((f) => ({ values: faceValues(f) })), { values: {} }] });
  const removeFace = (index: number) => {
    if (die.faces.length <= 2) return; // Un dé a toujours au moins 2 faces.
    onChange({ faces: die.faces.filter((_, i) => i !== index).map((f) => ({ values: faceValues(f) })) });
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <div className="space-y-1.5 flex-1 min-w-0">
          <label className="space-y-1 block">
            <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>Nom du dé</span>
            <input
              type="text"
              value={die.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="ex Boost, Setback, Ability..."
              className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
              style={{ color: 'var(--text-primary)' }}
            />
          </label>
        </div>
        <button onClick={onRemove} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1.5 shrink-0"><Trash2 size={16} /></button>
      </div>

      <p className="text-[11px] mb-3" style={{ color: 'var(--text-secondary)' }}>
        Un jet tire un nombre entre 1 et {die.faces.length} — la ligne correspondante du tableau indique combien de chaque symbole cette face produit.
        Les symboles sont des caractéristiques ordinaires du système (onglet Caractéristiques) : créez-y vos compteurs (ex &quot;Succès brut&quot;),
        puis une caractéristique calculée pour le résultat net (ex max(Succès brut − Échec brut, 0)).
      </p>

      {availableStats.length === 0 ? (
        <p className="text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>Aucune caractéristique définie dans ce système — créez-en d&apos;abord dans l&apos;onglet Caractéristiques.</p>
      ) : (
        <div className="space-y-4 max-w-3xl">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Symboles produits par ce dé</label>
            <div className="flex flex-wrap gap-2">
              {availableStats.map((stat) => {
                const included = columns.some((c) => c.key === stat.key);
                return (
                  <button
                    key={stat.key}
                    type="button"
                    onClick={() => toggleColumn(stat.key, !included)}
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
          </div>

          {columns.length === 0 ? (
            <p className="text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>Sélectionnez ci-dessus les symboles que ce dé peut produire, puis remplissez le tableau des faces.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
              <table className="w-full text-sm" style={{ background: 'var(--bg-dark)' }}>
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border-color)' }}>
                    <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Face</th>
                    {columns.map((stat) => (
                      <th key={stat.key} className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-center" style={{ color: 'var(--text-secondary)' }}>{stat.label || stat.key}</th>
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {die.faces.map((face, index) => {
                    const values = faceValues(face);
                    const isEmpty = Object.keys(values).length === 0;
                    return (
                      <tr key={index} className="border-b last:border-b-0" style={{ borderColor: 'var(--border-color)' }}>
                        <td className="px-3 py-1.5 font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                          {index + 1}
                          {isEmpty && <span className="ml-2 text-[10px] font-normal italic" style={{ color: 'var(--text-secondary)' }}>vide</span>}
                        </td>
                        {columns.map((stat) => (
                          <td key={stat.key} className="px-2 py-1.5 text-center">
                            <input
                              type="number"
                              min={0}
                              value={values[stat.key] ?? 0}
                              onChange={(e) => updateFaceValue(index, stat.key, Math.max(0, Number(e.target.value)))}
                              className="w-14 bg-[var(--bg-card)] border rounded px-1 py-1 text-sm text-center"
                              style={{
                                borderColor: (values[stat.key] ?? 0) > 0 ? 'var(--accent-brown)' : 'var(--border-color)',
                                color: (values[stat.key] ?? 0) > 0 ? 'var(--accent-brown)' : 'var(--text-secondary)',
                              }}
                            />
                          </td>
                        ))}
                        <td className="px-2 text-center">
                          {die.faces.length > 2 && (
                            <button onClick={() => removeFace(index)} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1" title="Supprimer cette face"><Trash2 size={13} /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <button onClick={addFace} className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            <Plus size={12} /> Ajouter une face ({die.faces.length} → {die.faces.length + 1})
          </button>
        </div>
      )}
    </div>
  );
}

/** Glossaire du système : règles textuelles (titre + description) affichées dans la recherche (onglet
 *  Règles) et le wiki — remplace le Rules.json statique, chaque système porte les siennes. */
function RulesPanel({ local, onSave }: { local: Draft; onSave: (next: Draft) => void | Promise<void> }) {
  const rules = local.rules ?? [];
  const addRule = () => onSave({ ...local, rules: [...rules, { title: '', description: '' }] });
  const updateRule = (index: number, patch: Partial<GameRuleEntry>) =>
    onSave({ ...local, rules: rules.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  const removeRule = (index: number) => onSave({ ...local, rules: rules.filter((_, i) => i !== index) });

  return (
    <div>
      <DetailHeader title="Glossaire" hint="Règles textuelles du système (ex Jet de sauvegarde, Repos long...) — affichées aux joueurs dans la recherche (onglet Règles) et le wiki. Chaque système porte son propre glossaire." />
      <div className="space-y-3 max-w-2xl">
        {rules.map((rule, index) => (
          <div key={index} className="p-3 rounded-lg border space-y-1.5" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-dark)' }}>
            <div className="flex items-center gap-2">
              <input
                value={rule.title}
                onChange={(e) => updateRule(index, { title: e.target.value })}
                placeholder="Titre (ex Jet de sauvegarde)"
                className="flex-1 bg-transparent border-none outline-none text-sm font-bold placeholder:opacity-40"
                style={{ color: 'var(--text-primary)' }}
              />
              <button onClick={() => removeRule(index)} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors shrink-0"><Trash2 size={14} /></button>
            </div>
            <textarea
              value={rule.description}
              onChange={(e) => updateRule(index, { description: e.target.value })}
              placeholder="Description de la règle..."
              rows={3}
              className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded px-2 py-1.5 text-xs resize-y"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        ))}
        <button onClick={addRule} className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
          <Plus size={12} /> Ajouter une règle
        </button>
      </div>
    </div>
  );
}

/** Vue d'ensemble des Compétences : nom d'affichage libre + compte total. Les compétences elles-mêmes
 *  se créent/éditent depuis la liste à gauche (cf skills/selectedSkill dans GameSystemEditor), même
 *  pattern que la vue d'ensemble des Dés à symboles (SymbolDice) juste au-dessus. */
function SkillsPanel({ local, onSave, skillCount }: { local: Draft; onSave: (next: Draft) => void | Promise<void>; skillCount: number }) {
  return (
    <div>
      <DetailHeader title="Compétences" hint="Compétences proposées aux joueurs (ex Discrétion, Mécanique, Astrogation — façon système narratif type EotE), chacune liée à une Caractéristique. Chaque Profil peut désigner certaines de ces compétences comme 'de carrière' (moins coûteuses à améliorer avec l'XP), depuis l'onglet Personnages." />
      <div className="space-y-4 max-w-md">
        <label className="space-y-1 block">
          <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>Nom affiché</span>
          <input
            type="text"
            value={local.skillLabel ?? ''}
            onChange={(e) => onSave({ ...local, skillLabel: e.target.value || undefined })}
            placeholder="Compétences"
            className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </label>
        <label className="space-y-1 block">
          <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>XP de départ</span>
          <input
            type="number"
            value={local.startingXp ?? ''}
            onChange={(e) => onSave({ ...local, startingXp: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="ex 110"
            className="w-32 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </label>
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Points d&apos;expérience donnés à un personnage fraîchement créé — dépensés ensuite via sa fiche (rangs de compétences, talents, nouvelles spécialisations).
        </p>
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{skillCount} compétence{skillCount > 1 ? 's' : ''} définie{skillCount > 1 ? 's' : ''}.</p>
      </div>
    </div>
  );
}

function SkillDetail({ skill, availableStats, onChange, onRemove }: {
  skill: SkillDefinition;
  availableStats: StatDefinition[];
  onChange: (patch: Partial<SkillDefinition>) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <input
          value={skill.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Nom de la compétence (ex Discrétion)"
          className="text-lg font-bold bg-transparent border-none outline-none flex-1 min-w-0 placeholder:opacity-40"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-title)' }}
        />
        <button onClick={onRemove} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1.5 shrink-0"><Trash2 size={16} /></button>
      </div>

      <div className="space-y-4 max-w-md">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Caractéristique liée</label>
          <select
            value={skill.linkedStatKey}
            onChange={(e) => onChange({ linkedStatKey: e.target.value })}
            className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
            style={{ color: 'var(--text-primary)' }}
          >
            <option value="">— Choisir —</option>
            {availableStats.map((stat) => (
              <option key={stat.key} value={stat.key}>{stat.label || stat.key}</option>
            ))}
          </select>
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            Utilisée pour composer le pool de dés d&apos;un jet de cette compétence (le plus grand des deux nombres entre la Caractéristique et le rang de la compétence donne le nombre de dés, le plus petit indique combien sont upgradés).
          </p>
        </div>

        <label className="space-y-1 block">
          <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>Groupe (optionnel)</span>
          <input
            type="text"
            value={skill.group ?? ''}
            onChange={(e) => onChange({ group: e.target.value || undefined })}
            placeholder="ex Combat, Social, Connaissance"
            className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </label>
      </div>
    </div>
  );
}

/** Schéma des lieux : nom d'affichage libre (ex "Planète", "Ville") + champs additionnels en plus de
 *  nom/description/image (toujours présents sur une instance, cf LocationDetail). Les instances
 *  elles-mêmes ne s'éditent pas ici (cf locations/selectedLocation dans GameSystemEditor). */
function LocationsPanel({ local, onSave, locationCount, contentPath, onAddLocation }: {
  local: Draft;
  onSave: (next: Draft) => void | Promise<void>;
  locationCount: number;
  contentPath?: string;
  onAddLocation: () => void;
}) {
  const fields = local.locationFields ?? [];
  const addField = () => onSave({ ...local, locationFields: [...fields, { key: makeId('field'), label: '' }] });
  const updateField = (key: string, patch: Partial<LocationFieldDefinition>) =>
    onSave({ ...local, locationFields: fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) });
  const removeField = (key: string) => onSave({ ...local, locationFields: fields.filter((f) => f.key !== key) });

  return (
    <div>
      <DetailHeader title="Lieux" hint="Lieux du monde (ex Planète, Ville, Plan) — nom, description et image sont toujours disponibles ; ajoutez ici des champs additionnels propres à votre système (ex Climat, Population, Faction dominante). Les lieux eux-mêmes se créent dans la liste à gauche." />
      <div className="space-y-4 max-w-md">
        <label className="space-y-1 block">
          <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>Nom affiché</span>
          <input
            type="text"
            value={local.locationLabel ?? ''}
            onChange={(e) => onSave({ ...local, locationLabel: e.target.value || undefined })}
            placeholder="ex Planète, Ville, Plan"
            className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </label>
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Laisser vide désactive l&apos;onglet correspondant dans la recherche/le wiki, même si des lieux existent déjà.
        </p>

        <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Champs additionnels</label>
          <div className="space-y-2">
            {fields.map((field) => (
              <div key={field.key} className="flex items-center gap-2">
                <input
                  value={field.label}
                  onChange={(e) => updateField(field.key, { label: e.target.value })}
                  placeholder="Nom du champ (ex Climat)"
                  className="flex-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm"
                  style={{ color: 'var(--text-primary)' }}
                />
                <button onClick={() => removeField(field.key)} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors shrink-0"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <button onClick={addField} className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            <Plus size={12} /> Ajouter un champ
          </button>
        </div>

        {contentPath ? (
          <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{locationCount} {(local.locationLabel || 'lieu').toLowerCase()}{locationCount > 1 ? 's' : ''} défini{locationCount > 1 ? 's' : ''}.</p>
        ) : (
          <p className="text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>Les lieux eux-mêmes pourront être créés une fois ce système enregistré (après la création de la table).</p>
        )}
      </div>
    </div>
  );
}

/** Détail d'une instance de lieu — nom/description/image toujours présents, plus les champs
 *  additionnels définis dans LocationsPanel (fields), stockés dans location.values par clé. */
function LocationDetail({ location, fields, locationLabel, onChange, onRemove }: {
  location: LocationDoc & { id: string };
  fields: LocationFieldDefinition[];
  locationLabel: string;
  onChange: (patch: Partial<LocationDoc>) => void;
  onRemove: () => void;
}) {
  const updateValue = (key: string, value: string) => onChange({ values: { ...location.values, [key]: value } });

  return (
    <div>
      <div className="flex items-start justify-between gap-3 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <input
          value={location.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={`Nom (ex ${locationLabel})`}
          className="text-lg font-bold bg-transparent border-none outline-none flex-1 min-w-0 placeholder:opacity-40"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-title)' }}
        />
        <button onClick={onRemove} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1.5 shrink-0"><Trash2 size={16} /></button>
      </div>

      <div className="space-y-4 max-w-md">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Description</label>
          <textarea
            value={location.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value })}
            rows={4}
            className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm resize-y"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          Image (URL)
          <input
            type="text"
            value={location.image ?? ''}
            onChange={(e) => onChange({ image: e.target.value })}
            placeholder="https://..."
            className="flex-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </label>

        {fields.length > 0 && (
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
            {fields.map((field) => (
              <label key={field.key} className="space-y-1 block">
                <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>{field.label || '(sans nom)'}</span>
                <input
                  type="text"
                  value={location.values?.[field.key] ?? ''}
                  onChange={(e) => updateValue(field.key, e.target.value)}
                  className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm"
                  style={{ color: 'var(--text-primary)' }}
                />
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
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

function GeneralPanel({ local, onChangeDescription, onBlurSave, onSave }: { local: Draft; onChangeDescription: (v: string) => void; onBlurSave: () => void; onSave: (next: Draft) => void | Promise<void> }) {
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
      <div className="mt-6">
        <DefaultLayoutPanel local={local} onSave={onSave} />
      </div>
    </div>
  );
}

function isCharacterLayoutEntry(v: unknown): v is CharacterLayoutEntry {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.i === 'string' && typeof o.x === 'number' && typeof o.y === 'number' && typeof o.w === 'number' && typeof o.h === 'number';
}

/** Disposition par défaut des widgets de la fiche personnage pour ce système — appliquée à tout
 *  personnage sans layout sauvegardé (remplace DEFAULT_LAYOUT codé en dur dans fiche.tsx). Édition en
 *  JSON brut : structure technique (positions/tailles react-grid-layout), pas un formulaire dédié —
 *  le MJ récupère ce JSON en ouvrant une fiche en mode édition puis en l'exportant/copiant (mécanisme
 *  d'aperçu déjà existant côté fiche), pas de saisie manuelle attendue champ par champ. */
function DefaultLayoutPanel({ local, onSave }: { local: Draft; onSave: (next: Draft) => void | Promise<void> }) {
  const [text, setText] = useState(() => JSON.stringify(local.defaultCharacterLayout ?? [], null, 2));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(local.defaultCharacterLayout ?? [], null, 2));
    setError(null);
  }, [local.defaultCharacterLayout]);

  const handleBlur = () => {
    if (text.trim() === '') {
      setError(null);
      onSave({ ...local, defaultCharacterLayout: undefined });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError('JSON invalide.');
      return;
    }
    if (!Array.isArray(parsed) || !parsed.every(isCharacterLayoutEntry)) {
      setError('Chaque entrée doit avoir au moins { i, x, y, w, h } (nombres pour x/y/w/h).');
      return;
    }
    setError(null);
    onSave({ ...local, defaultCharacterLayout: parsed.length > 0 ? parsed : undefined });
  };

  return (
    <div className="space-y-1.5 max-w-md">
      <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
        Disposition par défaut de la fiche personnage (JSON)
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        rows={8}
        placeholder="[]"
        spellCheck={false}
        className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs font-mono placeholder:opacity-40"
        style={{ color: 'var(--text-primary)' }}
      />
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        Appliquée à tout personnage sans disposition déjà sauvegardée. Vide = disposition générique par
        défaut. Format : tableau d&apos;objets {'{'}i, x, y, w, h, minW?, minH?{'}'} (react-grid-layout).
      </p>
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

function makeId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
      id: makeId('constraint'),
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
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          Nombre de tirages autorisés (optionnel)
          <input
            type="number"
            min={1}
            value={creation.maxRolls ?? ''}
            onChange={(e) => onSave({ ...local, creation: { ...creation, maxRolls: e.target.value ? Number(e.target.value) : undefined } })}
            placeholder="Illimité"
            className="w-24 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm text-center"
            style={{ color: 'var(--text-primary)' }}
          />
        </label>
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Laisser vide pour un nombre illimité de tirages (comportement par défaut). Une valeur (ex 1) désactive le bouton &quot;Lancer les dés&quot; à la création une fois ce nombre atteint.
        </p>

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
    const cycleKey = findRollFormulaCycle(candidateStats.filter((s) => s.category === 'ability' || s.category === 'derived' || s.category === 'vital'));
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
            Une stat "calculée" (derived) utilise valueFormula, réévaluée en continu (ex Défense), ET
            peut EN PLUS avoir sa propre rollFormula optionnelle (ex PV Max = aléatoire 7-20 tiré une
            seule fois à la création, au lieu du calcul normal réévalué en continu) — les deux blocs
            restent visibles et éditables indépendamment, jamais l'un au prix de l'autre. */}
        {kind === 'derived' && (
          <FormulaEditor
            key={`${stat.key}:value`}
            targetLabel={stat.label || 'Cette stat'}
            value={stat.valueFormula ?? null}
            onChange={(node) => onChange({ valueFormula: node ?? undefined, category: node ? 'derived' : 'ability' })}
            availableStats={referenceableStats}
          />
        )}

        {stat.category !== 'derived' && (
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
        )}

        {stat.category === 'ability' && (
          <>
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Valeur de départ
              <input type="number" value={Number(stat.defaultValue ?? 10)} onChange={(e) => onChange({ defaultValue: Number(e.target.value) })} className="w-16 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm text-center" style={{ color: 'var(--text-primary)' }} />
            </label>

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
          </>
        )}

        {kind === 'derived' && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Génération à la création (optionnel)
            </label>
            <FormulaEditor
              key={`${stat.key}:roll`}
              targetLabel={stat.label || 'Cette stat'}
              value={stat.rollFormula ?? null}
              onChange={handleRollFormulaChange}
              availableStats={referenceableStats}
            />
            {cycleError && (
              <p className="text-[11px] font-bold" style={{ color: '#e05a5a' }}>{cycleError}</p>
            )}
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Optionnel : si définie, cette valeur est tirée UNE SEULE FOIS à la création et figée ensuite
              (ex PV Max = aléatoire entre 7 et 20), au lieu d&apos;être recalculée en continu comme ci-dessus.
            </p>
          </div>
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

function RaceDetail({ race, availableStats, onChange, onRemove }: {
  race: RaceDefinition;
  availableStats: StatDefinition[];
  onChange: (patch: Partial<RaceDefinition>) => void;
  onRemove: () => void;
}) {
  const toggleStat = (key: string, included: boolean) => {
    const nextModifiers = { ...race.modifiers };
    if (included) nextModifiers[key] = nextModifiers[key] ?? 0;
    else delete nextModifiers[key];
    onChange({ modifiers: nextModifiers });
  };
  const updateModifier = (key: string, value: number) => onChange({ modifiers: { ...race.modifiers, [key]: value } });

  const addAbility = () => onChange({ abilities: [...race.abilities, { id: makeId('ability'), label: '' }] });
  const updateAbility = (id: string, patch: Partial<RacialAbility>) => onChange({ abilities: race.abilities.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const removeAbility = (id: string) => onChange({ abilities: race.abilities.filter((a) => a.id !== id) });

  return (
    <div>
      <div className="flex items-start justify-between gap-3 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <input
          value={race.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Nom de la race (ex Elfe)"
          className="text-lg font-bold bg-transparent border-none outline-none flex-1 min-w-0 placeholder:opacity-40"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-title)' }}
        />
        <button onClick={onRemove} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1.5 shrink-0"><Trash2 size={16} /></button>
      </div>

      <div className="space-y-4 max-w-md">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Description</label>
          <textarea
            value={race.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value })}
            rows={3}
            className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm resize-y"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          Image (URL)
          <input
            type="text"
            value={race.image ?? ''}
            onChange={(e) => onChange({ image: e.target.value })}
            placeholder="/images/races/elfe.webp"
            className="flex-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </label>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Taille moyenne (cm)
            <input type="number" value={race.avgHeight ?? ''} onChange={(e) => onChange({ avgHeight: e.target.value ? Number(e.target.value) : undefined })} className="w-20 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm text-center" style={{ color: 'var(--text-primary)' }} />
          </label>
          <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Poids moyen (kg)
            <input type="number" value={race.avgWeight ?? ''} onChange={(e) => onChange({ avgWeight: e.target.value ? Number(e.target.value) : undefined })} className="w-20 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm text-center" style={{ color: 'var(--text-primary)' }} />
          </label>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Modificateurs de caractéristiques</label>
          {availableStats.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {availableStats.map((stat) => {
                  const included = stat.key in race.modifiers;
                  return (
                    <button
                      key={stat.key}
                      type="button"
                      onClick={() => toggleStat(stat.key, !included)}
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
              {Object.keys(race.modifiers).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.keys(race.modifiers).map((key) => {
                    const stat = availableStats.find((s) => s.key === key);
                    return (
                      <label key={key} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {stat?.label || key}
                        <input
                          type="number"
                          value={race.modifiers[key]}
                          onChange={(e) => updateModifier(key, Number(e.target.value))}
                          className="w-14 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm text-center"
                          style={{ color: 'var(--text-primary)' }}
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>Aucune caractéristique définie dans ce système.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Capacités raciales</label>
          <div className="space-y-2">
            {race.abilities.map((ability) => (
              <div key={ability.id} className="p-2.5 rounded-lg border space-y-1.5" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-dark)' }}>
                <div className="flex items-center gap-2">
                  <input
                    value={ability.label}
                    onChange={(e) => updateAbility(ability.id, { label: e.target.value })}
                    placeholder="Nom de la capacité"
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm font-bold placeholder:opacity-40"
                    style={{ color: 'var(--text-primary)' }}
                  />
                  <button onClick={() => removeAbility(ability.id)} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1 shrink-0"><Trash2 size={13} /></button>
                </div>
                <textarea
                  value={ability.description ?? ''}
                  onChange={(e) => updateAbility(ability.id, { description: e.target.value })}
                  placeholder="Description (texte libre, affichée sur la fiche)"
                  rows={2}
                  className="w-full bg-transparent border-none outline-none text-xs resize-y placeholder:opacity-40"
                  style={{ color: 'var(--text-secondary)' }}
                />
              </div>
            ))}
          </div>
          <button onClick={addAbility} className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            <Plus size={12} /> Ajouter une capacité
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileDetail({ profile, availableSkills, onChange, onRemove }: {
  profile: ProfileDefinition;
  availableSkills: SkillDefinition[];
  onChange: (patch: Partial<ProfileDefinition>) => void;
  onRemove: () => void;
}) {
  const careerSkillKeys = profile.careerSkillKeys ?? [];
  const toggleCareerSkill = (key: string, included: boolean) => {
    const next = included ? [...careerSkillKeys, key] : careerSkillKeys.filter((k) => k !== key);
    onChange({ careerSkillKeys: next });
  };
  return (
    <div>
      <div className="flex items-start justify-between gap-3 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <input
          value={profile.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Nom du profil (ex Guerrier)"
          className="text-lg font-bold bg-transparent border-none outline-none flex-1 min-w-0 placeholder:opacity-40"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-title)' }}
        />
        <button onClick={onRemove} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1.5 shrink-0"><Trash2 size={16} /></button>
      </div>

      <div className="space-y-4 max-w-md">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Description</label>
          <textarea
            value={profile.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value })}
            rows={3}
            className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm resize-y"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          Image (URL)
          <input
            type="text"
            value={profile.image ?? ''}
            onChange={(e) => onChange({ image: e.target.value })}
            placeholder="/images/profiles/guerrier.webp"
            className="flex-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </label>

        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          Dé de vie (optionnel)
          <input
            type="text"
            value={profile.hitDie ?? ''}
            onChange={(e) => onChange({ hitDie: e.target.value || undefined })}
            placeholder="ex d8"
            className="w-20 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm text-center"
            style={{ color: 'var(--text-primary)' }}
          />
        </label>
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Utilisé par une stat vitale ayant une formule référençant le dé de vie (ex PV Max = 1 + mod(CON) + dé de vie).
        </p>

        {availableSkills.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Compétences de carrière</label>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              Les compétences cochées coûtent moins cher à améliorer avec l&apos;XP pour un personnage ayant ce profil comme carrière (façon système narratif type EotE — typiquement 8 compétences).
            </p>
            <div className="flex flex-wrap gap-2">
              {availableSkills.map((skill) => {
                const included = careerSkillKeys.includes(skill.key);
                return (
                  <button
                    key={skill.key}
                    type="button"
                    onClick={() => toggleCareerSkill(skill.key, !included)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
                    style={{
                      borderColor: included ? 'var(--accent-brown)' : 'var(--border-color)',
                      background: included ? 'color-mix(in srgb, var(--accent-brown) 15%, transparent)' : 'var(--bg-dark)',
                      color: included ? 'var(--accent-brown)' : 'var(--text-secondary)',
                    }}
                  >
                    {included && <Check size={12} />}
                    {skill.label || skill.key}
                  </button>
                );
              })}
            </div>
            {careerSkillKeys.length > 8 && (
              <p className="text-[11px] text-yellow-500">{careerSkillKeys.length} compétences cochées — typiquement 8 dans un système narratif type EotE.</p>
            )}
          </div>
        )}
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
      {stat.maxFormula && (
        <label className="flex items-center gap-2 text-xs pt-1 border-t" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={!!stat.recoversToZero}
            onChange={(e) => onChange({ recoversToZero: e.target.checked || undefined })}
          />
          Le bon état est à 0 (ex Blessures/Stress) plutôt qu'au maximum (ex PV) — inverse la cible du bouton &quot;Repos complet&quot; sur la fiche.
        </label>
      )}
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

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  applyNodeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { db, doc, updateDoc, deleteDoc, addDoc, onSnapshot, collection, query, where } from '@/lib/firebase';
import { stripUndefinedDeep } from '@/modules/game-system/transfer';
import { findTalentTreeCycle, type TalentNode } from '@/lib/rules-engine';
import type { SpecializationDoc } from '@/modules/game-content/types';
import type { ProfileDefinition, SkillDefinition } from '@/modules/game-system/types';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Éditeur MJ des Spécialisations (ex système narratif type EotE) — fichier séparé de
// GameSystemManagerPanel.tsx (déjà ~2100 lignes). Mêmes conventions : contentPath optionnel en prop
// (dégrade proprement si absent, ex brouillon de app/creer/page.tsx pas encore persisté en Firestore),
// CRUD direct onSnapshot/addDoc/updateDoc/deleteDoc — identique au pattern LocationsPanel/LocationDetail.
// La grille de talents utilise @xyflow/react pour un éditeur visuel drag-and-drop avec connexions
// tracées entre prérequis, plus fidèle à un arbre de talents EotE qu'une simple liste de champs.
// ─────────────────────────────────────────────────────────────────────────────

type SpecializationDocWithId = SpecializationDoc & { id: string };

function makeTalentId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `talent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useSpecializations(contentPath?: string) {
  const [specializations, setSpecializations] = useState<SpecializationDocWithId[]>([]);

  useEffect(() => {
    if (!contentPath) { setSpecializations([]); return; }
    const unsubscribe = onSnapshot(
      query(collection(db, contentPath), where('kind', '==', 'specialization')),
      (snap) => setSpecializations(snap.docs.map((d) => ({ id: d.id, ...(d.data() as SpecializationDoc) }))),
      (error) => { console.error('[SpecializationsPanel] erreur lecture spécialisations:', error.code, error.message); setSpecializations([]); },
    );
    return () => unsubscribe();
  }, [contentPath]);

  const addSpecialization = useCallback(async () => {
    if (!contentPath) return undefined;
    const docRef = await addDoc(collection(db, contentPath), stripUndefinedDeep({
      kind: 'specialization', name: '', careerIds: [], grantedSkillKeys: [], talents: [],
    }));
    return docRef.id;
  }, [contentPath]);

  const updateSpecialization = useCallback((id: string, patch: Partial<SpecializationDoc>) => {
    if (!contentPath) return;
    updateDoc(doc(db, contentPath, id), stripUndefinedDeep(patch) as unknown as Record<string, unknown>);
  }, [contentPath]);

  const removeSpecialization = useCallback((id: string) => {
    if (!contentPath) return;
    deleteDoc(doc(db, contentPath, id));
  }, [contentPath]);

  return { specializations, addSpecialization, updateSpecialization, removeSpecialization };
}

export function SpecializationsOverviewPanel({ count, contentPath, specializationLabel }: {
  count: number;
  contentPath?: string;
  specializationLabel: string;
}) {
  return (
    <div>
      <div className="space-y-0.5 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-title)' }}>Spécialisations</h3>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Domaines d&apos;expertise (ex système narratif type EotE) donnant accès à un arbre de talents exclusif et à 4 compétences ciblées. Une par une dans la liste à gauche.
        </p>
      </div>
      {contentPath ? (
        <p className="text-[11px] max-w-md" style={{ color: 'var(--text-secondary)' }}>{count} {specializationLabel.toLowerCase()}{count > 1 ? 's' : ''} définie{count > 1 ? 's' : ''}.</p>
      ) : (
        <p className="text-[11px] italic max-w-md" style={{ color: 'var(--text-secondary)' }}>Les spécialisations elles-mêmes pourront être créées une fois ce système enregistré (après la création de la table).</p>
      )}
    </div>
  );
}

export function SpecializationDetail({ specialization, profiles, skills, onChange, onRemove }: {
  specialization: SpecializationDocWithId;
  profiles: ProfileDefinition[];
  skills: SkillDefinition[];
  onChange: (patch: Partial<SpecializationDoc>) => void;
  onRemove: () => void;
}) {
  const careerIds = specialization.careerIds ?? [];
  const grantedSkillKeys = specialization.grantedSkillKeys ?? [];

  const toggleCareer = (id: string, included: boolean) =>
    onChange({ careerIds: included ? [...careerIds, id] : careerIds.filter((c) => c !== id) });
  const toggleSkill = (key: string, included: boolean) =>
    onChange({ grantedSkillKeys: included ? [...grantedSkillKeys, key] : grantedSkillKeys.filter((k) => k !== key) });

  return (
    <div>
      <div className="flex items-start justify-between gap-3 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <input
          value={specialization.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Nom de la spécialisation (ex Pilote)"
          className="text-lg font-bold bg-transparent border-none outline-none flex-1 min-w-0 placeholder:opacity-40"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-title)' }}
        />
        <button onClick={onRemove} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1.5 shrink-0"><Trash2 size={16} /></button>
      </div>

      <div className="space-y-4 max-w-2xl">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Description</label>
          <textarea
            value={specialization.description ?? ''}
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
            value={specialization.image ?? ''}
            onChange={(e) => onChange({ image: e.target.value })}
            placeholder="https://..."
            className="flex-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </label>

        {profiles.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Carrières d&apos;accès</label>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Vide = accessible à toutes les carrières au même coût. Sinon, un personnage d&apos;une autre carrière paie un surcoût pour l&apos;acheter.</p>
            <div className="flex flex-wrap gap-2">
              {profiles.map((profile) => {
                const included = careerIds.includes(profile.id);
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => toggleCareer(profile.id, !included)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
                    style={{
                      borderColor: included ? 'var(--accent-brown)' : 'var(--border-color)',
                      background: included ? 'color-mix(in srgb, var(--accent-brown) 15%, transparent)' : 'var(--bg-dark)',
                      color: included ? 'var(--accent-brown)' : 'var(--text-secondary)',
                    }}
                  >
                    {profile.label || '(sans nom)'}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {skills.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Compétences ciblées</label>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Typiquement 4 compétences de carrière supplémentaires apportées par cette spécialisation.</p>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => {
                const included = grantedSkillKeys.includes(skill.key);
                return (
                  <button
                    key={skill.key}
                    type="button"
                    onClick={() => toggleSkill(skill.key, !included)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
                    style={{
                      borderColor: included ? 'var(--accent-brown)' : 'var(--border-color)',
                      background: included ? 'color-mix(in srgb, var(--accent-brown) 15%, transparent)' : 'var(--bg-dark)',
                      color: included ? 'var(--accent-brown)' : 'var(--text-secondary)',
                    }}
                  >
                    {skill.label || skill.key}
                  </button>
                );
              })}
            </div>
            {grantedSkillKeys.length > 4 && (
              <p className="text-[11px] text-yellow-500">{grantedSkillKeys.length} compétences cochées — typiquement 4 dans un système narratif type EotE.</p>
            )}
          </div>
        )}

        <TalentTreeEditor talents={specialization.talents ?? []} onChange={(talents) => onChange({ talents })} />
      </div>
    </div>
  );
}

const TALENT_NODE_WIDTH = 180;

function talentToFlowNode(talent: TalentNode, selected: boolean): Node {
  return {
    id: talent.id,
    position: { x: talent.x, y: talent.y },
    data: { label: talent.title || '(sans nom)' },
    selected,
    style: {
      width: TALENT_NODE_WIDTH,
      background: selected ? 'color-mix(in srgb, var(--accent-brown) 20%, var(--bg-dark))' : 'var(--bg-dark)',
      border: `1px solid ${selected ? 'var(--accent-brown)' : 'var(--border-color)'}`,
      color: 'var(--text-primary)',
      borderRadius: 8,
      fontSize: 12,
      padding: 8,
    },
  };
}

function talentsToFlowEdges(talents: TalentNode[]): Edge[] {
  const edges: Edge[] = [];
  for (const talent of talents) {
    for (const prereqId of talent.prerequisiteIds) {
      edges.push({ id: `${prereqId}->${talent.id}`, source: prereqId, target: talent.id });
    }
  }
  return edges;
}

/** Éditeur visuel de la grille de talents d'une Spécialisation — nœuds déplaçables (position x/y),
 *  connexions tracées entre prérequis. La liste normalisée `talents: TalentNode[]` reste la source de
 *  vérité (Firestore) ; ce composant ne fait que la refléter en graphe et répercuter les changements. */
function TalentTreeEditor({ talents, onChange }: { talents: TalentNode[]; onChange: (talents: TalentNode[]) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTalent = talents.find((t) => t.id === selectedId);

  const nodes = useMemo(() => talents.map((t) => talentToFlowNode(t, t.id === selectedId)), [talents, selectedId]);
  const edges = useMemo(() => talentsToFlowEdges(talents), [talents]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const nextNodes = applyNodeChanges(changes, nodes);
    const positionByI: Record<string, { x: number; y: number }> = {};
    for (const n of nextNodes) positionByI[n.id] = { x: n.position.x, y: n.position.y };
    onChange(talents.map((t) => (positionByI[t.id] ? { ...t, x: positionByI[t.id].x, y: positionByI[t.id].y } : t)));
  }, [nodes, talents, onChange]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    onChange(talents.map((t) => (t.id === connection.target && !t.prerequisiteIds.includes(connection.source!)
      ? { ...t, prerequisiteIds: [...t.prerequisiteIds, connection.source!] }
      : t)));
  }, [talents, onChange]);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => setSelectedId(node.id), []);

  const addTalent = () => {
    const id = makeTalentId();
    const nextIndex = talents.length;
    const newTalent: TalentNode = {
      id,
      x: (nextIndex % 4) * (TALENT_NODE_WIDTH + 40),
      y: Math.floor(nextIndex / 4) * 120,
      title: '',
      xpCost: 5,
      prerequisiteIds: [],
    };
    onChange([...talents, newTalent]);
    setSelectedId(id);
  };

  const updateTalent = (id: string, patch: Partial<TalentNode>) =>
    onChange(talents.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const removeTalent = (id: string) => {
    onChange(talents.filter((t) => t.id !== id).map((t) => ({ ...t, prerequisiteIds: t.prerequisiteIds.filter((p) => p !== id) })));
    if (selectedId === id) setSelectedId(null);
  };

  const removeEdge = (edge: Edge) =>
    onChange(talents.map((t) => (t.id === edge.target ? { ...t, prerequisiteIds: t.prerequisiteIds.filter((p) => p !== edge.source) } : t)));

  const handleSave = () => {
    const cycleId = findTalentTreeCycle(talents);
    if (cycleId) {
      const bad = talents.find((t) => t.id === cycleId);
      toast.error(`Cycle de prérequis détecté (${bad?.title || cycleId}) — retirez une connexion pour continuer.`);
      return;
    }
    toast.success('Grille de talents valide.');
  };

  return (
    <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Arbre de talents</label>
        <div className="flex items-center gap-2">
          <button onClick={handleSave} className="text-[11px] px-2 py-1 rounded border transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            Vérifier les cycles
          </button>
          <button onClick={addTalent} className="text-[11px] px-2 py-1 rounded-lg border border-dashed font-bold flex items-center gap-1 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            <Plus size={11} /> Talent
          </button>
        </div>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        Glissez les nœuds pour les positionner. Tirez une connexion d&apos;un nœud vers un autre pour poser un prérequis (ET logique : tous les prérequis doivent être achetés avant que le nœud cible devienne accessible).
      </p>

      <div style={{ height: 360, border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-darker)' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={(_e, edge) => removeEdge(edge)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {selectedTalent && (
        <div className="p-3 rounded-lg border space-y-2" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-dark)' }}>
          <div className="flex items-center gap-2">
            <input
              value={selectedTalent.title}
              onChange={(e) => updateTalent(selectedTalent.id, { title: e.target.value })}
              placeholder="Nom du talent"
              className="flex-1 bg-transparent border-none outline-none text-sm font-bold placeholder:opacity-40"
              style={{ color: 'var(--text-primary)' }}
            />
            <button onClick={() => removeTalent(selectedTalent.id)} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors shrink-0"><Trash2 size={14} /></button>
          </div>
          <textarea
            value={selectedTalent.description ?? ''}
            onChange={(e) => updateTalent(selectedTalent.id, { description: e.target.value })}
            placeholder="Description de l'effet..."
            rows={2}
            className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded px-2 py-1.5 text-xs resize-y"
            style={{ color: 'var(--text-primary)' }}
          />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Coût XP (base)
              <input
                type="number"
                value={selectedTalent.xpCost}
                onChange={(e) => updateTalent(selectedTalent.id, { xpCost: Number(e.target.value) })}
                className="w-16 bg-[var(--bg-card)] border border-[var(--border-color)] rounded px-2 py-1 text-sm text-center"
                style={{ color: 'var(--text-primary)' }}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Rangs max (répétable)
              <input
                type="number"
                min={1}
                value={selectedTalent.maxRank ?? 1}
                onChange={(e) => updateTalent(selectedTalent.id, { maxRank: Number(e.target.value) || 1 })}
                className="w-16 bg-[var(--bg-card)] border border-[var(--border-color)] rounded px-2 py-1 text-sm text-center"
                style={{ color: 'var(--text-primary)' }}
              />
            </label>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            {selectedTalent.prerequisiteIds.length > 0
              ? `Prérequis : ${selectedTalent.prerequisiteIds.map((id) => talents.find((t) => t.id === id)?.title || id).join(', ')}`
              : 'Aucun prérequis — accessible dès le départ.'}
          </p>
        </div>
      )}
    </div>
  );
}

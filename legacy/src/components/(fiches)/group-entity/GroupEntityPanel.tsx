'use client';

import React, { useEffect, useState } from 'react';
import { db, doc, collection, addDoc, updateDoc, deleteDoc, onSnapshot, storage, ref, uploadBytes, getDownloadURL } from '@/lib/firebase';
import { useGame } from '@/contexts/GameContext';
import { useGameSystem } from '@/modules/game-system/useGameSystem';
import { resolveCharacterStats, rollGroupEntityStats } from '@/lib/rules-engine';
import type { StatDefinition } from '@/modules/game-system/types';
import { Plus, Trash2, Dice6, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// ─────────────────────────────────────────────────────────────────────────────
// Firestore: Salle/{roomId}/groupEntities/{entityId} — instances de l'entité de groupe (nom libre
// défini par le MJ, ex "Vaisseau", "Base secrète"), pas liées à un personnage individuel.
// Schéma défini par GameSystemDefinition.groupEntityStats/groupEntityLabel dans l'éditeur de règles.
// ─────────────────────────────────────────────────────────────────────────────

interface GroupEntityDoc {
  id: string;
  label: string;
  image?: string;
  /** Acquis par le groupe : mis en avant comme "flotte" dans le panneau joueurs (les entités non
   *  acquises restent visibles en catalogue). Basculé par le MJ uniquement. */
  acquis?: boolean;
  values: Record<string, number | string | boolean>;
}

export default function GroupEntityPanel() {
  const { isMJ, user } = useGame();
  const roomId = user?.roomId ?? null;
  const { gameSystem } = useGameSystem(roomId);
  const entityStats = gameSystem.groupEntityStats ?? [];
  const entityLabel = gameSystem.groupEntityLabel || 'Entité de groupe';
  const entityLabelLower = entityLabel.toLowerCase();

  const [entities, setEntities] = useState<GroupEntityDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) { setIsLoading(false); return; }
    const unsub = onSnapshot(collection(db, `Salle/${roomId}/groupEntities`), (snap) => {
      setEntities(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupEntityDoc, 'id'>) })));
      setIsLoading(false);
    }, () => setIsLoading(false));
    return () => unsub();
  }, [roomId]);

  // Commande dev de nettoyage (même pattern que window.give_dice) : les ré-imports de bundle
  // d'avant le correctif d'ExportImportPanel dupliquaient chaque entité. Panneau ouvert, en MJ :
  //   cleanup_group_entities()                      → supprime les doublons de label (garde la 1re)
  //   cleanup_group_entities(['Ancien label', …])   → supprime AUSSI toutes les occurrences de ces
  //                                                   labels (ex modèles obsolètes remplacés).
  // Les entités SANS label (créées à la main, pas encore nommées) ne sont jamais touchées.
  useEffect(() => {
    if (!roomId || !isMJ) return;
    (window as any).cleanup_group_entities = async (purgeLabels: string[] = []) => {
      const purge = new Set(purgeLabels);
      const seen = new Set<string>();
      const doomed: { id: string; label: string }[] = [];
      for (const e of entities) {
        const label = e.label ?? '';
        if (!label) continue;
        if (purge.has(label) || seen.has(label)) doomed.push({ id: e.id, label });
        else seen.add(label);
      }
      for (const d of doomed) await deleteDoc(doc(db, `Salle/${roomId}/groupEntities`, d.id));
      console.log(`${doomed.length} entité(s) supprimée(s), ${entities.length - doomed.length} conservée(s)`);
      return doomed.length;
    };
    return () => { delete (window as any).cleanup_group_entities; };
  }, [roomId, isMJ, entities]);

  const handleAdd = async () => {
    if (!roomId) return;
    const rolled = rollGroupEntityStats(gameSystem);
    const values = { ...rolled.abilities, ...rolled.derived };
    const docRef = await addDoc(collection(db, `Salle/${roomId}/groupEntities`), { label: '', values });
    setSelectedId(docRef.id);
  };

  const handleRename = (id: string, label: string) => {
    if (!roomId) return;
    updateDoc(doc(db, `Salle/${roomId}/groupEntities`, id), { label });
  };

  const handleUploadImage = async (id: string, file: File) => {
    if (!roomId) return;
    const imageRef = ref(storage, `Salle/${roomId}/groupEntities/${id}`);
    await uploadBytes(imageRef, file);
    const image = await getDownloadURL(imageRef);
    await updateDoc(doc(db, `Salle/${roomId}/groupEntities`, id), { image });
  };

  const handleUpdateValue = (id: string, key: string, value: number) => {
    if (!roomId) return;
    const entity = entities.find((e) => e.id === id);
    if (!entity) return;
    updateDoc(doc(db, `Salle/${roomId}/groupEntities`, id), { values: { ...entity.values, [key]: value } });
  };

  const handleToggleAcquis = (id: string, acquis: boolean) => {
    if (!roomId) return;
    updateDoc(doc(db, `Salle/${roomId}/groupEntities`, id), { acquis });
  };

  const handleRemove = (id: string) => {
    if (!roomId) return;
    setPendingRemoveId(id);
  };

  const confirmRemove = () => {
    if (!roomId || !pendingRemoveId) return;
    deleteDoc(doc(db, `Salle/${roomId}/groupEntities`, pendingRemoveId));
    if (selectedId === pendingRemoveId) setSelectedId(null);
    setPendingRemoveId(null);
  };

  if (!isMJ) {
    return (
      <div className="w-full h-full min-w-0 flex flex-col" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-title)' }}>{entityLabel}</h2>
        </div>
        <div className="p-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Seul le MJ peut gérer ce contenu de la table.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Chargement…</div>;
  }

  if (entityStats.length === 0) {
    return (
      <div className="w-full h-full min-w-0 flex flex-col" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-title)' }}>{entityLabel}</h2>
        </div>
        <div className="p-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Aucune stat définie pour ce système de règles — configurez-les d&apos;abord dans l&apos;onglet correspondant de l&apos;éditeur de règles (&quot;Règles du jeu&quot;).
          </p>
        </div>
      </div>
    );
  }

  const selected = entities.find((e) => e.id === selectedId);

  return (
    <div className="w-full h-full min-w-0 flex flex-col" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
      <div className="p-4 border-b flex items-start justify-between gap-3" style={{ borderColor: 'var(--border-color)' }}>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-title)' }}>{entityLabel}</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Appartient au groupe, pas à un personnage — visible par toute la table, modifiable par le MJ.
          </p>
        </div>
        <div className="w-10 shrink-0" />
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="lg:w-[280px] shrink-0 overflow-y-auto p-3 space-y-1 lg:border-r" style={{ borderColor: 'var(--border-color)' }}>
          {entities.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelectedId(e.id)}
              className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-sm font-medium transition-colors min-w-0"
              style={{
                background: selectedId === e.id ? 'color-mix(in srgb, var(--accent-brown) 15%, transparent)' : 'transparent',
                color: selectedId === e.id ? 'var(--accent-brown)' : 'var(--text-primary)',
              }}
            >
              {e.image ? (
                <img src={e.image} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded shrink-0" style={{ background: 'var(--bg-darker)' }} />
              )}
              <span className="truncate">{e.label || '(sans nom)'}</span>
              {e.acquis && (
                <span className="ml-auto shrink-0 w-2 h-2 rounded-full" title="Acquis par le groupe" style={{ background: 'var(--accent-brown)' }} />
              )}
            </button>
          ))}
          <button onClick={handleAdd} className="w-full py-1.5 rounded-lg border border-dashed text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            <Dice6 size={12} /> Ajouter : {entityLabel}
          </button>
        </div>

        <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4">
          {selected ? (
            <GroupEntityDetail
              key={selected.id}
              entity={selected}
              entityStats={entityStats}
              onRename={(label) => handleRename(selected.id, label)}
              onUploadImage={(file) => handleUploadImage(selected.id, file)}
              onUpdateValue={(key, value) => handleUpdateValue(selected.id, key, value)}
              onToggleAcquis={(acquis) => handleToggleAcquis(selected.id, acquis)}
              onRemove={() => handleRemove(selected.id)}
            />
          ) : (
            <p className="text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>Sélectionnez {entityLabelLower}, ou ajoutez-en un(e) nouveau(elle).</p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingRemoveId !== null}
        onOpenChange={(open) => !open && setPendingRemoveId(null)}
        title={`Supprimer ${entityLabelLower} ?`}
        description="Cette action est définitive."
        confirmLabel="Supprimer"
        destructive
        onConfirm={confirmRemove}
      />
    </div>
  );
}

function GroupEntityDetail({ entity, entityStats, onRename, onUploadImage, onUpdateValue, onToggleAcquis, onRemove }: {
  entity: GroupEntityDoc;
  entityStats: StatDefinition[];
  onRename: (label: string) => void;
  onUploadImage: (file: File) => void | Promise<void>;
  onUpdateValue: (key: string, value: number) => void;
  onToggleAcquis: (acquis: boolean) => void;
  onRemove: () => void;
}) {
  const resolved = resolveCharacterStats({ systemId: '', stats: entityStats }, [], entity.values);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await onUploadImage(file);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <input
          defaultValue={entity.label}
          onBlur={(e) => onRename(e.target.value)}
          placeholder="Nom"
          className="text-lg font-bold bg-transparent border-none outline-none flex-1 min-w-0 placeholder:opacity-40"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-title)' }}
        />
        <button onClick={onRemove} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1.5 shrink-0"><Trash2 size={16} /></button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        {entity.image ? (
          <img src={entity.image} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0 border" style={{ borderColor: 'var(--border-color)' }} />
        ) : (
          <div className="w-20 h-20 rounded-lg shrink-0 border flex items-center justify-center" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-dark)' }}>
            <ImagePlus size={20} style={{ color: 'var(--text-secondary)' }} />
          </div>
        )}
        <label className="flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg border cursor-pointer transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
          <ImagePlus size={14} />
          {isUploading ? 'Envoi…' : entity.image ? 'Changer l\'image' : 'Ajouter une image'}
          <input type="file" accept="image/*" onChange={handleFileChange} disabled={isUploading} className="hidden" />
        </label>
        <button
          onClick={() => onToggleAcquis(!entity.acquis)}
          className="flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg border transition-colors"
          title="Acquis = mis en avant comme flotte du groupe dans le panneau joueurs ; sinon reste au catalogue."
          style={entity.acquis
            ? { borderColor: 'var(--accent-brown)', background: 'color-mix(in srgb, var(--accent-brown) 15%, transparent)', color: 'var(--accent-brown)' }
            : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: entity.acquis ? 'var(--accent-brown)' : 'var(--border-color)' }} />
          {entity.acquis ? 'Acquis par le groupe' : 'Au catalogue'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl">
        {entityStats.filter((s) => s.category !== 'meta').map((stat) => {
          const value = resolved.values[stat.key];
          const editable = stat.category === 'ability' || stat.category === 'vital';
          return (
            <div key={stat.key} className="p-3 rounded-lg border" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-dark)' }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1 truncate" style={{ color: 'var(--text-secondary)' }}>{stat.label || stat.key}</p>
              {editable ? (
                <input
                  type={stat.dataType === 'number' ? 'number' : 'text'}
                  defaultValue={String(value ?? '')}
                  onBlur={(e) => onUpdateValue(stat.key, Number(e.target.value))}
                  className="w-full bg-transparent border-none outline-none text-lg font-bold"
                  style={{ color: 'var(--text-primary)' }}
                />
              ) : (
                <p className="text-lg font-bold">{String(value ?? 0)}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

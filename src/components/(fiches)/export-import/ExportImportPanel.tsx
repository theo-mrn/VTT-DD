'use client';

import React, { useState } from 'react';
import { db, collection, getDocs, doc, setDoc, addDoc } from '@/lib/firebase';
import { useGame } from '@/contexts/GameContext';
import { useGameSystem } from '@/modules/game-system/useGameSystem';
import { buildRoomExportBundle, downloadRoomExportBundle, parseRoomExportBundle } from '@/modules/export-bundle/transfer';
import { stripUndefinedDeep } from '@/modules/game-system/transfer';
import type { ContentDoc } from '@/modules/game-content/types';
import { buildCharacterExport, importCharacterExport, type CharacterExportData } from '@/utils/characterTransfer';
import type { Character } from '@/contexts/CharacterContext';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Panneau MJ additif : combine en un seul fichier JSON ce qui, jusqu'ici, s'exportait/importait
// séparément (système de règles dans GameSystemManagerPanel, flotte dans GroupEntityPanel, personnages
// un par un ailleurs). Les exports partiels existants restent en place — celui-ci ne les remplace pas.
// ─────────────────────────────────────────────────────────────────────────────

export default function ExportImportPanel() {
  const { isMJ, user } = useGame();
  const roomId = user?.roomId ?? null;
  const { gameSystem, contentPath } = useGameSystem(roomId);

  const [includeGameSystem, setIncludeGameSystem] = useState(true);
  const [includeGroupEntities, setIncludeGroupEntities] = useState(true);
  const [includeCharacters, setIncludeCharacters] = useState(true);
  const [includeContent, setIncludeContent] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const entityLabel = gameSystem.groupEntityLabel || 'Entité de groupe';

  const handleExport = async () => {
    if (!roomId) return;
    setIsExporting(true);
    try {
      const source: Parameters<typeof buildRoomExportBundle>[0] = {};

      if (includeGameSystem) {
        source.gameSystem = { name: gameSystem.systemId, description: '', ...gameSystem };
      }

      if (includeGroupEntities) {
        const snap = await getDocs(collection(db, `Salle/${roomId}/groupEntities`));
        source.groupEntities = {
          entityLabel,
          entities: snap.docs.map((d) => d.data() as Record<string, unknown>),
        };
      }

      if (includeCharacters) {
        const charactersSnap = await getDocs(collection(db, `cartes/${roomId}/characters`));
        const characters: CharacterExportData[] = [];
        for (const d of charactersSnap.docs) {
          const character = { id: d.id, ...(d.data() as Omit<Character, 'id'>) } as Character;
          characters.push(await buildCharacterExport(roomId, character));
        }
        source.characters = characters;
      }

      if (includeContent) {
        const contentSnap = await getDocs(collection(db, contentPath));
        source.content = contentSnap.docs.map((d) => d.data() as ContentDoc);
      }

      const bundle = buildRoomExportBundle(source);
      downloadRoomExportBundle(bundle, `table_${roomId}.json`);
      toast.success('Export généré.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'export.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      if (!roomId) return;
      setIsImporting(true);
      try {
        const bundle = parseRoomExportBundle(event.target?.result as string);
        let importedCount = 0;
        // Si un nouveau système est importé dans ce même fichier, le contenu (équipement, bestiaire,
        // voies) doit suivre CE système fraîchement créé, pas l'ancien système actif de la salle.
        let targetContentPath = contentPath;

        if (bundle.gameSystem) {
          const id = `custom_${Date.now()}`;
          targetContentPath = `Salle/${roomId}/gameSystemOverrides/${id}/content`;
          // Spread intégral (moins exportVersion/exportedAt, propres au format d'échange, jamais au doc
          // système) plutôt qu'une liste de champs recopiés à la main : GameSystemExportData a déjà
          // grandi plusieurs fois (symbolDice, rules, locationLabel/locationFields...) et cette liste
          // manuelle oubliait systématiquement les nouveaux champs à chaque ajout, silencieusement.
          // stripUndefinedDeep reste nécessaire : un champ optionnel absent du bundle importé (ex
          // combatDefenseKey) reste une clé `undefined` explicite tant qu'on ne l'omet pas — Firestore
          // rejette setDoc() dans ce cas (Unsupported field value: undefined), même niché.
          const { exportVersion: _exportVersion, exportedAt: _exportedAt, ...systemFields } = bundle.gameSystem;
          await setDoc(doc(db, `Salle/${roomId}/gameSystemOverrides`, id), stripUndefinedDeep({
            ...systemFields,
            systemId: id,
          }));
          await setDoc(doc(db, 'Salle', roomId), { gameSystemId: id }, { merge: true });
          importedCount += 1;
        }

        if (bundle.groupEntities) {
          for (const entity of bundle.groupEntities.entities) {
            await addDoc(collection(db, `Salle/${roomId}/groupEntities`), entity);
          }
          importedCount += bundle.groupEntities.entities.length;
        }

        if (bundle.characters) {
          for (const character of bundle.characters) {
            await importCharacterExport(roomId, character);
          }
          importedCount += bundle.characters.length;
        }

        if (bundle.content) {
          for (const contentDoc of bundle.content) {
            await addDoc(collection(db, targetContentPath), contentDoc);
          }
          importedCount += bundle.content.length;
        }

        toast.success(`Import terminé (${importedCount} élément(s)).`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Fichier invalide.');
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!isMJ) {
    return (
      <div className="w-full h-full min-w-0 flex flex-col" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-title)' }}>Export/Import</h2>
        </div>
        <div className="p-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Seul le MJ peut exporter/importer la table.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-w-0 flex flex-col" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
      <div className="p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-title)' }}>Export/Import</h2>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          Sauvegardez ou restaurez l&apos;intégralité du contenu de la table (système de règles, {entityLabel.toLowerCase()}s, personnages) en un seul fichier.
        </p>
      </div>

      <div className="p-4 space-y-6 max-w-lg">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>Exporter</p>
          <div className="space-y-2 mb-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={includeGameSystem} onChange={(e) => setIncludeGameSystem(e.target.checked)} className="accent-[var(--accent-brown)]" />
              Configuration du système (règles)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={includeGroupEntities} onChange={(e) => setIncludeGroupEntities(e.target.checked)} className="accent-[var(--accent-brown)]" />
              {entityLabel} (flotte)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={includeContent} onChange={(e) => setIncludeContent(e.target.checked)} className="accent-[var(--accent-brown)]" />
              Contenu (équipement, bestiaire, voies)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={includeCharacters} onChange={(e) => setIncludeCharacters(e.target.checked)} className="accent-[var(--accent-brown)]" />
              Personnages (tous)
            </label>
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting || (!includeGameSystem && !includeGroupEntities && !includeCharacters && !includeContent)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)] disabled:opacity-40 disabled:pointer-events-none"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            <Download size={13} /> {isExporting ? 'Export en cours…' : 'Exporter la sélection'}
          </button>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>Importer</p>
          <p className="text-[11px] mb-2" style={{ color: 'var(--text-secondary)' }}>
            Restaure chaque section présente dans le fichier (indépendamment des cases ci-dessus, qui ne pilotent que l&apos;export). Les personnages et {entityLabel.toLowerCase()}s importés sont ajoutés, jamais remplacés.
          </p>
          <label className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border cursor-pointer transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            <Upload size={13} /> {isImporting ? 'Import en cours…' : 'Importer un fichier'}
            <input type="file" accept="application/json" onChange={handleImportFile} disabled={isImporting} className="hidden" />
          </label>
        </div>
      </div>
    </div>
  );
}

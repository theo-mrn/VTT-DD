'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BookOpen, Eye, Sparkles } from 'lucide-react';
import { useCharacter } from '@/contexts/CharacterContext';
import { useGameSystem } from '@/modules/game-system/useGameSystem';
import { useGameContent } from '@/modules/game-content/useGameContent';
import type { SpecializationDoc } from '@/modules/game-content/types';
import { specializationPurchaseCost, isTalentPurchasable, nextTalentRankCost } from '@/lib/rules-engine';
import TalentTreeView from './TalentTreeView';
import SpecializationBrowser from './SpecializationBrowser';

// ─────────────────────────────────────────────────────────────────────────────
// Widget "Talents & Spécialisations" de la fiche — pendant de SkillsSheet (compétences), séparé pour
// que chaque widget ait une seule responsabilité, comme CompetencesDisplay/Competences côté dnd-classic.
// Affiche les spécialisations possédées (clic -> grille de talents TalentTreeView, achat au nœud),
// et l'achat de nouvelles spécialisations. L'XP est le même pool que SkillsSheet (character.xp) ;
// les outils MJ (ajustement d'XP, réinitialisation globale) restent dans SkillsSheet.
// ─────────────────────────────────────────────────────────────────────────────

interface TalentsSheetProps {
  roomId: string;
  characterId: string;
  canEdit?: boolean;
  style?: React.CSSProperties;
}

export default function TalentsSheet({ roomId, characterId, canEdit = false, style }: TalentsSheetProps) {
  const { characters, selectedCharacter, updateCharacter } = useCharacter();
  const { gameSystem } = useGameSystem(roomId);
  const { docs: specializationDocs } = useGameContent<SpecializationDoc & { id: string }>('specialization');

  const [selectedTalentSpec, setSelectedTalentSpec] = useState<SpecializationDoc & { id: string } | null>(null);
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);

  const character = characters.find((c) => c.id === characterId) ?? (selectedCharacter?.id === characterId ? selectedCharacter : null);

  if (!character) {
    return (
      <div className="w-full bg-[var(--bg-card)] rounded-lg p-8 text-center text-[var(--text-secondary)]" style={style}>
        Personnage introuvable.
      </div>
    );
  }

  const ownedSpecializationIds: string[] = character.specializations ?? [];
  const ownedSpecializations = specializationDocs.filter((s) => ownedSpecializationIds.includes(s.id));
  const xp: number = character.xp ?? 0;
  const unlockedTalents: Record<string, Record<string, number>> = character.unlockedTalents ?? {};

  const spend = (amount: number, updates: Record<string, unknown>) => {
    updateCharacter(characterId, { xp: xp - amount, xpSpent: (character.xpSpent ?? 0) + amount, ...updates });
  };

  const buySpecialization = (spec: SpecializationDoc & { id: string }) => {
    const isOutsideCareer = spec.careerIds.length > 0 && character.Profile != null && !spec.careerIds.includes(character.Profile);
    const cost = specializationPurchaseCost(ownedSpecializationIds.length + 1, isOutsideCareer);
    if (cost > xp) return;
    spend(cost, { specializations: [...ownedSpecializationIds, spec.id] });
  };

  const buyTalent = (spec: SpecializationDoc & { id: string }, talentId: string) => {
    const talent = spec.talents.find((t) => t.id === talentId);
    if (!talent) return;
    const purchasedRanks = unlockedTalents[spec.id] ?? {};
    const currentRank = purchasedRanks[talentId] ?? 0;
    if (!isTalentPurchasable(talent, { purchasedRanks }, spec.talents)) return;
    const cost = nextTalentRankCost(talent, currentRank);
    if (cost > xp) return;
    spend(cost, {
      unlockedTalents: { ...unlockedTalents, [spec.id]: { ...purchasedRanks, [talentId]: currentRank + 1 } },
    });
  };

  return (
    <>
      <div className="h-full w-full bg-[var(--bg-dark)] rounded-[length:var(--block-radius,0.5rem)] border border-[var(--border-color)] flex flex-col items-stretch overflow-hidden" style={style}>
        <div className="shrink-0 p-3 border-b border-[var(--border-color)] flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--accent-brown)]">Talents & Spécialisations</h2>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsBrowserOpen(true)}
              className="flex items-center justify-center h-9 w-9 rounded-lg border text-[var(--text-secondary)] hover:text-[var(--accent-brown)] transition-colors"
              style={{ borderColor: 'var(--border-color)' }}
              title="Codex : parcourir toutes les spécialisations et leurs arbres de talents"
            >
              <BookOpen size={15} />
            </button>
            <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 h-9 rounded-lg border" style={{ borderColor: 'var(--border-color)', background: 'color-mix(in srgb, var(--accent-brown) 12%, transparent)', color: 'var(--accent-brown)' }}>
              <Sparkles size={13} /> {xp} XP
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          {ownedSpecializations.length === 0 && !canEdit && (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
              <p className="text-sm">Aucune spécialisation</p>
            </div>
          )}

          {/* Colonnes dérivées de la largeur du WIDGET (auto-fill), pas du viewport — cohérent avec la
              grille de compétences de SkillsSheet. */}
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
            {ownedSpecializations.map((spec) => (
              <div
                key={spec.id}
                onClick={() => setSelectedTalentSpec(spec)}
                className="bg-[var(--bg-card)] border border-[var(--accent-brown)] rounded-lg p-3 cursor-pointer hover:shadow-[0_0_0_1px_rgba(192,160,128,0.2)] transition-all"
              >
                <h4 className="font-semibold text-sm text-[var(--accent-brown)]">{spec.name}</h4>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {Object.values(unlockedTalents[spec.id] ?? {}).reduce((a, b) => a + b, 0)} talent(s) débloqué(s)
                </span>
              </div>
            ))}
            {canEdit && specializationDocs.filter((s) => !ownedSpecializationIds.includes(s.id)).map((spec) => {
              const isOutsideCareer = spec.careerIds.length > 0 && character.Profile != null && !spec.careerIds.includes(character.Profile);
              const cost = specializationPurchaseCost(ownedSpecializationIds.length + 1, isOutsideCareer);
              return (
                <div key={spec.id} className="bg-[var(--bg-card)] border border-dashed rounded-lg p-3 flex items-center justify-between gap-2" style={{ borderColor: 'var(--border-color)' }}>
                  {/* Le nom ouvre l'arbre en APERÇU (lecture seule) — on ne devrait jamais acheter à
                      l'aveugle une spécialisation sans avoir pu parcourir ses talents. */}
                  <button
                    onClick={() => setSelectedTalentSpec(spec)}
                    className="flex items-center gap-1.5 min-w-0 text-sm text-[var(--text-secondary)] hover:text-[var(--accent-brown)] transition-colors"
                    title="Voir l'arbre de talents"
                  >
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{spec.name}</span>
                  </button>
                  <Button
                    size="sm"
                    disabled={cost > xp}
                    onClick={() => buySpecialization(spec)}
                    className="text-[11px] h-7 px-2 bg-[var(--accent-brown)]/10 text-[var(--accent-brown)] border border-[var(--accent-brown)]/50 hover:bg-[var(--accent-brown)]/20 disabled:opacity-30"
                  >
                    Acheter ({cost} XP)
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grille de talents d'une spécialisation possédée — disposition officielle (positions x/y,
          traits de connexion) via TalentTreeView, achat au clic sur un nœud. */}
      <Dialog open={!!selectedTalentSpec} onOpenChange={(open) => !open && setSelectedTalentSpec(null)}>
        <DialogContent borderTrail className="bg-transparent border-none shadow-none p-0 max-w-[95vw] xl:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">{selectedTalentSpec?.name}</DialogTitle>
          {selectedTalentSpec && (() => {
            const spec = selectedTalentSpec;
            const purchasedRanks = unlockedTalents[spec.id] ?? {};
            const isOwned = ownedSpecializationIds.includes(spec.id);
            return (
              <div className="p-6">
                <h2 className={`text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)] ${isOwned ? 'mb-4' : 'mb-1'}`}>
                  {spec.name}
                </h2>
                {!isOwned && (
                  <p className="text-xs text-[var(--text-secondary)] mb-4">
                    Aperçu — achetez cette spécialisation pour débloquer ses talents.
                  </p>
                )}
                <TalentTreeView
                  talents={spec.talents}
                  purchasedRanks={purchasedRanks}
                  xp={xp}
                  canBuy={canEdit && isOwned}
                  onBuy={(talentId) => buyTalent(spec, talentId)}
                />
                <div className="flex justify-end mt-4 pt-4 border-t border-black/5 dark:border-white/5">
                  <Button variant="ghost" onClick={() => setSelectedTalentSpec(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Fermer
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <SpecializationBrowser
        open={isBrowserOpen}
        onClose={() => setIsBrowserOpen(false)}
        specializations={specializationDocs}
        profiles={gameSystem.profiles ?? []}
        skills={gameSystem.skills ?? []}
      />
    </>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { isTalentPurchasable, nextTalentRankCost, type TalentNode } from '@/lib/rules-engine';

// ─────────────────────────────────────────────────────────────────────────────
// Vue LECTURE SEULE (achat) de la grille de talents d'une spécialisation, pour la fiche joueur —
// distincte de TalentTreeEditor (SpecializationsPanel.tsx, édition MJ drag-and-drop via @xyflow/react).
// Ici on veut reproduire fidèlement le visuel simple des grilles officielles EotE : des cases alignées
// sur une grille 4 colonnes x 5 lignes reliées par de simples traits droits (pas de lib de graphe avec
// poignées de connexion / courbes bezier / zoom-pan, overkill pour un affichage statique en lecture seule).
// ─────────────────────────────────────────────────────────────────────────────

const COL_WIDTH = 200;
const ROW_HEIGHT = 130;
const NODE_WIDTH = 176;
const NODE_HEIGHT = 64;

interface TalentTreeViewProps {
  talents: TalentNode[];
  purchasedRanks: Record<string, number>;
  xp: number;
  canBuy: boolean;
  onBuy: (talentId: string) => void;
}

function nodeState(talent: TalentNode, purchasedRanks: Record<string, number>, allTalents: TalentNode[]): 'owned' | 'purchasable' | 'locked' {
  const rank = purchasedRanks[talent.id] ?? 0;
  const maxRank = talent.maxRank ?? 1;
  if (rank >= maxRank) return 'owned';
  return isTalentPurchasable(talent, { purchasedRanks }, allTalents) ? 'purchasable' : 'locked';
}

export default function TalentTreeView({ talents, purchasedRanks, xp, canBuy, onBuy }: TalentTreeViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTalent = talents.find((t) => t.id === selectedId) ?? null;

  const byId = useMemo(() => new Map(talents.map((t) => [t.id, t])), [talents]);
  const cols = Math.max(1, ...talents.map((t) => t.x + 1));
  const rows = Math.max(1, ...talents.map((t) => t.y + 1));
  // Ancre horizontale = centre de la case (pour les liens verticaux), verticale = bord haut/bas (pour
  // ne jamais traverser le texte du cadre par-dessus, contrairement à un lien centre-à-centre).
  const anchorX = (t: TalentNode) => t.x * COL_WIDTH + NODE_WIDTH / 2;
  const topOf = (t: TalentNode) => t.y * ROW_HEIGHT;
  const bottomOf = (t: TalentNode) => t.y * ROW_HEIGHT + NODE_HEIGHT;

  const lines = useMemo(() => {
    const result: { key: string; x1: number; y1: number; x2: number; y2: number; active: boolean }[] = [];
    for (const talent of talents) {
      for (const prereqId of talent.prerequisiteIds) {
        const prereq = byId.get(prereqId);
        if (!prereq) continue;
        const active = (purchasedRanks[prereqId] ?? 0) >= 1;
        if (prereq.y === talent.y) {
          // Lien horizontal (même ligne) : bord droit de la source vers bord gauche de la cible, à mi-hauteur.
          const y = topOf(talent) + NODE_HEIGHT / 2;
          const leftNode = prereq.x < talent.x ? prereq : talent;
          const rightNode = prereq.x < talent.x ? talent : prereq;
          result.push({
            key: `${prereqId}->${talent.id}`,
            x1: leftNode.x * COL_WIDTH + NODE_WIDTH,
            y1: y,
            x2: rightNode.x * COL_WIDTH,
            y2: y,
            active,
          });
        } else {
          // Lien vertical : bas de la case du dessus vers haut de la case du dessous.
          result.push({
            key: `${prereqId}->${talent.id}`,
            x1: anchorX(prereq),
            y1: bottomOf(prereq),
            x2: anchorX(talent),
            y2: topOf(talent),
            active,
          });
        }
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talents, byId, purchasedRanks]);

  const rank = selectedTalent ? (purchasedRanks[selectedTalent.id] ?? 0) : 0;
  const maxRank = selectedTalent?.maxRank ?? 1;
  const isMaxed = rank >= maxRank;
  const purchasable = selectedTalent ? isTalentPurchasable(selectedTalent, { purchasedRanks }, talents) : false;
  const cost = selectedTalent ? nextTalentRankCost(selectedTalent, rank) : 0;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto p-4">
        <div className="relative" style={{ width: cols * COL_WIDTH, height: rows * ROW_HEIGHT }}>
          <svg className="absolute inset-0 pointer-events-none" width={cols * COL_WIDTH} height={rows * ROW_HEIGHT}>
            {lines.map((line) => (
              <line
                key={line.key}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={line.active ? 'var(--accent-brown)' : 'var(--border-color)'}
                strokeWidth={2}
              />
            ))}
          </svg>

          {talents.map((talent) => {
            const state = nodeState(talent, purchasedRanks, talents);
            const isSelected = talent.id === selectedId;
            const r = purchasedRanks[talent.id] ?? 0;
            const mr = talent.maxRank ?? 1;
            return (
              <button
                key={talent.id}
                onClick={() => setSelectedId(talent.id)}
                className={`absolute flex flex-col items-center justify-center text-center rounded-lg border px-2 transition-colors bg-[var(--bg-card)] ${
                  state === 'owned'
                    ? 'border-[var(--accent-brown)] shadow-[0_0_0_1px_rgba(192,160,128,0.2)]'
                    : isSelected
                      ? 'border-[var(--accent-brown)]'
                      : 'border-[var(--border-color)] hover:border-[var(--text-secondary)]'
                }`}
                style={{
                  left: talent.x * COL_WIDTH,
                  top: talent.y * ROW_HEIGHT,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                  opacity: state === 'locked' ? 0.55 : 1,
                }}
              >
                <span className={`text-xs font-semibold leading-tight ${state === 'owned' ? 'text-[var(--accent-brown)]' : 'text-[var(--text-primary)]'}`}>
                  {talent.title || '(sans nom)'}
                </span>
                {mr > 1 && (
                  <span className="text-[10px] font-mono mt-0.5 text-[var(--text-secondary)]">{r}/{mr}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Dialog open={!!selectedTalent} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent borderTrail className="bg-transparent border-none shadow-none p-0 max-w-md">
          <DialogTitle className="sr-only">{selectedTalent?.title}</DialogTitle>
          {selectedTalent && (
            <div className="p-6">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)]">
                  {selectedTalent.title || '(sans nom)'}
                </h3>
                {maxRank > 1 && <span className="font-mono text-xs shrink-0 text-[var(--text-secondary)]">{rank}/{maxRank}</span>}
              </div>
              {selectedTalent.description && (
                <p className="text-sm text-[var(--text-primary)] leading-relaxed mb-4">{selectedTalent.description}</p>
              )}
              <div className="flex justify-end gap-2 pt-3 border-t border-black/5 dark:border-white/5">
                <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  Fermer
                </Button>
                {canBuy && !isMaxed && (
                  <Button
                    size="sm"
                    disabled={!purchasable || cost > xp}
                    onClick={() => onBuy(selectedTalent.id)}
                    className="bg-[var(--accent-brown)]/10 text-[var(--accent-brown)] border border-[var(--accent-brown)]/50 hover:bg-[var(--accent-brown)]/20 disabled:opacity-30"
                  >
                    {!purchasable ? <><Lock className="h-3.5 w-3.5 mr-1.5" /> Prérequis manquant</> : `Acheter (${cost} XP)`}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

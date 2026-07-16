'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Search, X, Star, Sparkles, Lock, RefreshCw, PlusCircle, MinusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useCharacter } from '@/contexts/CharacterContext';
import { useGame } from '@/contexts/GameContext';
import { useGameSystem } from '@/modules/game-system/useGameSystem';
import { useGameContent } from '@/modules/game-content/useGameContent';
import type { SpecializationDoc } from '@/modules/game-content/types';
import type { SkillDefinition } from '@/modules/game-system/types';
import {
  skillUpgradeCost,
  totalSkillUpgradeCost,
  isCareerSkillForCharacter,
  specializationPurchaseCost,
  isTalentPurchasable,
  nextTalentRankCost,
} from '@/lib/rules-engine';

// ─────────────────────────────────────────────────────────────────────────────
// Fiche "Compétences" pour un système façon EotE (gameSystem.skills non vide) — remplace
// CompetencesDisplay UNIQUEMENT dans ce cas (branchement conditionnel dans fiche.tsx), jamais pour
// dnd-classic. Reprend le langage visuel de competencesD.tsx (header recherche/onglets, grille de
// cartes, dialog de détail avec dégradé) plutôt que d'inventer un style à part. Sert aussi de point
// d'achat de l'XP de départ (pas d'étape séparée à la création, cf plan Phase 5).
// ─────────────────────────────────────────────────────────────────────────────

interface SkillsSheetProps {
  roomId: string;
  characterId: string;
  canEdit?: boolean;
  onHeightChange?: (height: number) => void;
  style?: React.CSSProperties;
}

interface SkillCardData {
  skill: SkillDefinition;
  rank: number;
  isCareer: boolean;
  cost: number;
  linkedLabel?: string;
  linkedValue?: number;
}

export default function SkillsSheet({ roomId, characterId, canEdit = false, style }: SkillsSheetProps) {
  const { characters, selectedCharacter, updateCharacter } = useCharacter();
  const { isMJ } = useGame();
  const { gameSystem } = useGameSystem(roomId);
  const { docs: specializationDocs } = useGameContent<SpecializationDoc & { id: string }>('specialization');

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedSkill, setSelectedSkill] = useState<SkillCardData | null>(null);
  const [selectedTalentSpec, setSelectedTalentSpec] = useState<SpecializationDoc & { id: string } | null>(null);
  const [xpAdjustAmount, setXpAdjustAmount] = useState<number>(10);
  const [isResetAllDialogOpen, setIsResetAllDialogOpen] = useState(false);
  const [skillToReset, setSkillToReset] = useState<SkillCardData | null>(null);

  const character = characters.find((c) => c.id === characterId) ?? (selectedCharacter?.id === characterId ? selectedCharacter : null);

  const skills = gameSystem.skills ?? [];
  const skillLabel = gameSystem.skillLabel || 'Compétences';
  const statByKey = useMemo(() => new Map(gameSystem.stats.map((s) => [s.key, s])), [gameSystem.stats]);
  const groups = useMemo(() => {
    const set = new Set(skills.map((s) => s.group).filter((g): g is string => !!g));
    return Array.from(set);
  }, [skills]);

  if (!character) {
    return (
      <div className="w-full bg-[var(--bg-card)] rounded-lg p-8 text-center text-[var(--text-secondary)]" style={style}>
        Personnage introuvable.
      </div>
    );
  }

  const skillRanks: Record<string, number> = character.skillRanks ?? {};
  const ownedSpecializationIds: string[] = character.specializations ?? [];
  const ownedSpecializations = specializationDocs.filter((s) => ownedSpecializationIds.includes(s.id));
  const career = (gameSystem.profiles ?? []).find((p) => p.id === character.Profile);
  const careerSkillKeys = career?.careerSkillKeys ?? [];
  const xp: number = character.xp ?? 0;
  const unlockedTalents: Record<string, Record<string, number>> = character.unlockedTalents ?? {};

  const spend = (amount: number, updates: Record<string, unknown>) => {
    updateCharacter(characterId, { xp: xp - amount, xpSpent: (character.xpSpent ?? 0) + amount, ...updates });
  };

  const upgradeSkill = (skillKey: string) => {
    const currentRank = skillRanks[skillKey] ?? 0;
    if (currentRank >= 5) return;
    const isCareer = isCareerSkillForCharacter(skillKey, careerSkillKeys, ownedSpecializations);
    const cost = skillUpgradeCost(currentRank + 1, isCareer);
    if (cost > xp) return;
    spend(cost, { skillRanks: { ...skillRanks, [skillKey]: currentRank + 1 } });
    setSelectedSkill(null);
  };

  // Ajustement libre réservé au MJ : fixe le rang directement, SANS toucher à l'XP. Couvre les
  // capacités qui accordent un rang gratuit (ex capacité raciale "Charm : 1 rang gratuit, max 2 à la
  // création") — le moteur ne modélise pas ces effets automatiquement, le MJ les applique donc à la main.
  const setSkillRankFree = (skillKey: string, rank: number) => {
    const clamped = Math.max(0, Math.min(5, rank));
    updateCharacter(characterId, { skillRanks: { ...skillRanks, [skillKey]: clamped } });
  };

  // Ajoute (ou retire, si négatif) de l'XP sans toucher aux rangs/talents déjà acquis — ex donner de
  // l'XP de session, ou corriger une erreur de calcul.
  const adjustXp = (amount: number) => {
    if (amount === 0) return;
    updateCharacter(characterId, { xp: Math.max(0, xp + amount) });
    toast.success(amount > 0 ? `+${amount} XP` : `${amount} XP`, { duration: 2000 });
  };

  // Réinitialisation complète : remet toute la progression à zéro et recrédite l'intégralité de l'XP
  // dépensé (rangs de compétences, spécialisations achetées, talents débloqués) — équivalent EotE du
  // resetSkills() historique de competences.tsx (Voies D&D), pour ce système de compétences. Confirmée
  // via un vrai Dialog (isResetAllDialogOpen), pas window.confirm — cohérent avec le reste de l'UI.
  const confirmResetAllProgress = () => {
    const xpSpent = character.xpSpent ?? 0;
    updateCharacter(characterId, {
      skillRanks: {},
      unlockedTalents: {},
      specializations: [],
      specializationSkillChoices: {},
      xp: xp + xpSpent,
      xpSpent: 0,
    });
    toast.success('Progression réinitialisée', { description: `${xpSpent} XP recrédité(s).`, duration: 3000 });
    setIsResetAllDialogOpen(false);
  };

  // Réinitialise UNE seule compétence : rang remis à 0, XP recrédité pour cette compétence précise.
  // Le coût recrédité est recalculé via totalSkillUpgradeCost(0, rang actuel, isCareer) plutôt que
  // suivi achat par achat (pas d'historique stocké) — légère approximation si le statut carrière de la
  // compétence a changé depuis les achats (ex spécialisation acquise après coup), acceptable en pratique.
  const resetSingleSkill = (card: SkillCardData) => {
    if (card.rank <= 0) return;
    const refund = totalSkillUpgradeCost(0, card.rank, card.isCareer);
    const nextRanks = { ...skillRanks };
    delete nextRanks[card.skill.key];
    updateCharacter(characterId, {
      skillRanks: nextRanks,
      xp: xp + refund,
      xpSpent: Math.max(0, (character.xpSpent ?? 0) - refund),
    });
    toast.success(`${card.skill.label} réinitialisée`, { description: `${refund} XP recrédité(s).`, duration: 2500 });
    setSkillToReset(null);
    setSelectedSkill(null);
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
    if (!isTalentPurchasable(talent, { purchasedRanks })) return;
    const cost = nextTalentRankCost(talent, currentRank);
    if (cost > xp) return;
    spend(cost, {
      unlockedTalents: { ...unlockedTalents, [spec.id]: { ...purchasedRanks, [talentId]: currentRank + 1 } },
    });
  };

  const skillCards: SkillCardData[] = skills.map((skill) => {
    const rank = skillRanks[skill.key] ?? 0;
    const isCareer = isCareerSkillForCharacter(skill.key, careerSkillKeys, ownedSpecializations);
    const linkedStat = statByKey.get(skill.linkedStatKey);
    return {
      skill,
      rank,
      isCareer,
      cost: skillUpgradeCost(rank + 1, isCareer),
      linkedLabel: linkedStat?.label,
      linkedValue: linkedStat ? Number(character[linkedStat.key] ?? 0) : undefined,
    };
  });

  const filteredSkills = skillCards
    .filter((c) => activeTab === 'all' || c.skill.group === activeTab)
    .filter((c) => !searchQuery.trim() || c.skill.label.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <>
      <div className="h-full w-full bg-[var(--bg-dark)] rounded-[length:var(--block-radius,0.5rem)] border border-[var(--border-color)] flex flex-col items-stretch overflow-hidden" style={style}>
        {/* Header compact — recherche + onglets par groupe, même langage que competencesD. shrink-0 : ne
            doit jamais être compressé par le corps scrollable ci-dessous. */}
        <div className="shrink-0 p-3 border-b border-[var(--border-color)] flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <h2 className="text-lg font-bold text-[var(--accent-brown)] shrink-0">{skillLabel}</h2>
            <div className="relative flex-grow sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
              <Input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-8 bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] text-sm focus:ring-1 focus:ring-[var(--accent-brown)]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto items-center">
            {groups.length > 0 && (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
                <TabsList className="h-9 bg-[var(--bg-dark)] border border-[var(--border-color)] p-0.5 w-full sm:w-auto">
                  <TabsTrigger value="all" className="text-xs px-3 data-[state=active]:bg-[var(--accent-brown)] data-[state=active]:text-black h-full">Toutes</TabsTrigger>
                  {groups.map((g) => (
                    <TabsTrigger key={g} value={g} className="text-xs px-3 data-[state=active]:bg-[var(--accent-brown)] data-[state=active]:text-black h-full">{g}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
            <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 h-9 rounded-lg border shrink-0" style={{ borderColor: 'var(--border-color)', background: 'color-mix(in srgb, var(--accent-brown) 12%, transparent)', color: 'var(--accent-brown)' }}>
              <Sparkles size={13} /> {xp} XP
            </span>

            {isMJ && (
              <>
                <div className="flex items-center gap-1 h-9 px-1.5 rounded-lg border shrink-0" style={{ borderColor: 'var(--border-color)' }}>
                  <button onClick={() => adjustXp(-xpAdjustAmount)} title={`Retirer ${xpAdjustAmount} XP`} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors">
                    <MinusCircle size={15} />
                  </button>
                  <Input
                    type="number"
                    value={xpAdjustAmount}
                    onChange={(e) => setXpAdjustAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    className="h-6 w-14 text-xs text-center p-1 bg-transparent border-none"
                  />
                  <button onClick={() => adjustXp(xpAdjustAmount)} title={`Ajouter ${xpAdjustAmount} XP`} className="text-[var(--text-secondary)] hover:text-green-400 transition-colors">
                    <PlusCircle size={15} />
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsResetAllDialogOpen(true)}
                  title="Réinitialiser toute la progression (rangs, spécialisations, talents) et recréditer l'XP dépensé"
                  className="h-9 px-2.5 text-[var(--text-secondary)] hover:text-red-400"
                >
                  <RefreshCw size={14} className="mr-1.5" /> Réinitialiser
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Corps scrollable : grille de compétences + spécialisations. flex-1 min-h-0 est nécessaire
            pour qu'un enfant flex avec overflow-y-auto respecte la hauteur du parent au lieu de la
            forcer à grandir (bug de scroll déjà rencontré sur inventaire.tsx : sans min-h-0, le contenu
            déborde silencieusement et se fait couper par l'overflow-hidden du widget parent). */}
        <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Grille de compétences */}
        <div className="bg-transparent p-3">
          {filteredSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
              <p className="text-sm">Aucune compétence trouvée</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
              {filteredSkills.map((card) => (
                <div
                  key={card.skill.key}
                  onClick={() => setSelectedSkill(card)}
                  className={`group relative flex flex-col justify-center bg-[var(--bg-card)] border rounded-lg p-3 cursor-pointer transition-all duration-200 min-h-[3.5rem] ${
                    card.rank > 0 ? 'border-[var(--accent-brown)] shadow-[0_0_0_1px_rgba(192,160,128,0.2)]' : 'border-[var(--border-color)] hover:border-[var(--text-secondary)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${card.rank > 0 ? 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]' : 'bg-gray-600'}`} />
                    <h3 className={`font-semibold text-sm truncate flex-1 ${card.rank > 0 ? 'text-[var(--accent-brown)]' : 'text-[var(--text-primary)]'}`}>
                      {card.skill.label}
                    </h3>
                    {card.isCareer && <Star className="h-3 w-3 shrink-0" style={{ color: 'var(--accent-brown)' }} />}
                    <span className="font-mono text-xs shrink-0 text-[var(--text-secondary)]">{card.rank}/5</span>
                  </div>
                  {card.linkedLabel && (
                    <span className="text-[11px] mt-1 ml-4 text-[var(--text-secondary)]">{card.linkedLabel} {card.linkedValue}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Spécialisations */}
        <div className="p-3 border-t border-[var(--border-color)] space-y-3">
          <h3 className="text-sm font-bold text-[var(--accent-brown)]">Spécialisations</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                  <span className="text-sm truncate text-[var(--text-secondary)]">{spec.name}</span>
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
      </div>

      {/* Dialog de détail compétence — dégradé de titre, coût du prochain rang */}
      <Dialog open={!!selectedSkill} onOpenChange={(open) => !open && setSelectedSkill(null)}>
        <DialogContent borderTrail className="bg-transparent border-none shadow-none p-0 max-w-lg">
          <DialogTitle className="sr-only">{selectedSkill?.skill.label}</DialogTitle>
          {selectedSkill && (
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)] flex items-center gap-2">
                  {selectedSkill.skill.label}
                </h2>
                {selectedSkill.isCareer && (
                  <div className="px-2 py-1 rounded text-xs font-semibold border bg-[var(--accent-brown)]/10 text-[var(--accent-brown)] border-[var(--accent-brown)]/20 flex items-center gap-1">
                    <Star className="h-3 w-3" /> Carrière
                  </div>
                )}
              </div>

              <div className="my-6 text-[var(--text-primary)] leading-relaxed text-sm space-y-3">
                {selectedSkill.linkedLabel && <p>Caractéristique liée : <strong>{selectedSkill.linkedLabel} {selectedSkill.linkedValue}</strong></p>}

                <div className="flex items-center justify-between">
                  <span>Rang actuel : <strong>{selectedSkill.rank} / 5</strong></span>
                  {isMJ && (
                    <div className="flex items-center gap-1 rounded-lg border" style={{ borderColor: 'var(--border-color)' }}>
                      <button
                        disabled={selectedSkill.rank <= 0}
                        onClick={() => { setSkillRankFree(selectedSkill.skill.key, selectedSkill.rank - 1); setSelectedSkill({ ...selectedSkill, rank: selectedSkill.rank - 1, cost: skillUpgradeCost(selectedSkill.rank, selectedSkill.isCareer) }); }}
                        className="h-7 w-7 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        −
                      </button>
                      <span className="text-[10px] uppercase tracking-wide px-1" style={{ color: 'var(--text-secondary)' }}>MJ</span>
                      <button
                        disabled={selectedSkill.rank >= 5}
                        onClick={() => { setSkillRankFree(selectedSkill.skill.key, selectedSkill.rank + 1); setSelectedSkill({ ...selectedSkill, rank: selectedSkill.rank + 1, cost: skillUpgradeCost(selectedSkill.rank + 2, selectedSkill.isCareer) }); }}
                        className="h-7 w-7 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
                {isMJ && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Modifier gratuitement.</p>
                )}
              </div>

              <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-3">
                <p className="text-sm text-[var(--text-secondary)]">
                  {selectedSkill.rank < 5 ? <>Coût du prochain rang : <strong className="text-[var(--text-primary)]">{selectedSkill.cost} XP</strong></> : 'Rang maximum atteint'}
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {isMJ && selectedSkill.rank > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSkillToReset(selectedSkill)}
                      title="Remettre cette compétence à 0 et recréditer son XP"
                      className="text-red-400/80 hover:text-red-400 hover:bg-red-400/10"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Réinitialiser
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setSelectedSkill(null)} className="hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Fermer
                  </Button>
                  {canEdit && selectedSkill.rank < 5 && (
                    <Button
                      size="sm"
                      onClick={() => upgradeSkill(selectedSkill.skill.key)}
                      disabled={selectedSkill.cost > xp}
                      className={`relative overflow-hidden transition-all duration-300 ${
                        selectedSkill.cost > xp
                          ? 'opacity-50 cursor-not-allowed bg-[var(--bg-darker)]'
                          : 'bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)] hover:shadow-lg hover:shadow-[var(--accent-brown)]/20 text-[var(--bg-dark)] font-bold'
                      }`}
                    >
                      {selectedSkill.cost > xp ? <><Lock className="h-3.5 w-3.5 mr-1.5" /> XP insuffisant</> : `+1 rang (${selectedSkill.cost} XP)`}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog grille de talents d'une spécialisation possédée */}
      <Dialog open={!!selectedTalentSpec} onOpenChange={(open) => !open && setSelectedTalentSpec(null)}>
        <DialogContent borderTrail className="bg-transparent border-none shadow-none p-0 max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogTitle className="sr-only">{selectedTalentSpec?.name}</DialogTitle>
          {selectedTalentSpec && (() => {
            const spec = selectedTalentSpec;
            const purchasedRanks = unlockedTalents[spec.id] ?? {};
            return (
              <div className="p-6">
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)] mb-4">
                  {spec.name}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {spec.talents.map((talent) => {
                    const rank = purchasedRanks[talent.id] ?? 0;
                    const maxRank = talent.maxRank ?? 1;
                    const purchasable = isTalentPurchasable(talent, { purchasedRanks });
                    const cost = nextTalentRankCost(talent, rank);
                    const isMaxed = rank >= maxRank;
                    return (
                      <div
                        key={talent.id}
                        className={`p-3 rounded-lg border text-sm ${rank > 0 ? 'border-[var(--accent-brown)] bg-[var(--accent-brown)]/5' : 'border-[var(--border-color)] bg-[var(--bg-card)]'}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-semibold text-[var(--text-primary)] truncate">
                            {talent.title || '(sans nom)'} {maxRank > 1 && <span className="font-mono text-xs text-[var(--text-secondary)]">({rank}/{maxRank})</span>}
                          </span>
                        </div>
                        {talent.description && <p className="text-[11px] text-[var(--text-secondary)] mb-2">{talent.description}</p>}
                        {canEdit && !isMaxed && (
                          <Button
                            size="sm"
                            disabled={!purchasable || cost > xp}
                            onClick={() => buyTalent(spec, talent.id)}
                            className="h-7 text-[11px] px-2 bg-[var(--accent-brown)]/10 text-[var(--accent-brown)] border border-[var(--accent-brown)]/50 hover:bg-[var(--accent-brown)]/20 disabled:opacity-30"
                          >
                            {!purchasable ? <><Lock className="h-3 w-3 mr-1" /> Prérequis manquant</> : `Acheter (${cost} XP)`}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
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

      {/* Confirmation : réinitialisation complète de toute la progression */}
      <Dialog open={isResetAllDialogOpen} onOpenChange={setIsResetAllDialogOpen}>
        <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)] max-w-md">
          <DialogTitle className="text-red-400 font-bold text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5" /> Réinitialiser toute la progression ?
          </DialogTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            Tous les rangs de compétences, spécialisations et talents achetés seront perdus. L&apos;XP dépensé
            ({character.xpSpent ?? 0} XP) sera recrédité. Cette action est irréversible.
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setIsResetAllDialogOpen(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Annuler
            </Button>
            <Button onClick={confirmResetAllProgress} className="bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20 font-bold">
              Réinitialiser
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation : réinitialisation d'une seule compétence */}
      <Dialog open={!!skillToReset} onOpenChange={(open) => !open && setSkillToReset(null)}>
        <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)] max-w-md">
          <DialogTitle className="text-red-400 font-bold text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5" /> Réinitialiser {skillToReset?.skill.label} ?
          </DialogTitle>
          {skillToReset && (
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Le rang de <strong>{skillToReset.skill.label}</strong> (actuellement {skillToReset.rank}/5) sera remis à 0.
              {' '}<strong>{totalSkillUpgradeCost(0, skillToReset.rank, skillToReset.isCareer)} XP</strong> seront recrédités.
            </p>
          )}
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setSkillToReset(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Annuler
            </Button>
            <Button onClick={() => skillToReset && resetSingleSkill(skillToReset)} className="bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20 font-bold">
              Réinitialiser
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

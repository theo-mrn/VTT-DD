'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BookOpen, Check, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { useGameContent } from '@/modules/game-content/useGameContent';
import type { SpecializationDoc } from '@/modules/game-content/types';
import type { GameSystemDefinition, ProfileDefinition, SkillDefinition } from '@/modules/game-system/types';
import TalentTreeView from './TalentTreeView';
import SpecializationBrowser from './SpecializationBrowser';

// ─────────────────────────────────────────────────────────────────────────────
// Choix Carrière → 4 compétences de carrière (rang gratuit) → Spécialisation gratuite (doit faire partie
// de la Carrière) → 2 compétences ciblées (rang gratuit, cumul autorisé avec les 4 précédentes — une
// compétence choisie aux deux étapes monte directement à rang 2, conforme au système narratif de
// référence type EotE). Actif uniquement si gameSystem.skills est non vide (branché conditionnellement
// dans app/creation/page.tsx, à côté de CompetenceCreator pour dnd-classic — coexistence, pas remplacement).
// L'XP au-delà de ces 6 rangs gratuits ne se dépense PAS ici : le personnage reçoit gameSystem.startingXp
// et l'utilise ensuite via sa fiche (même composant qu'en jeu), pas de double surface de code d'achat.
// ─────────────────────────────────────────────────────────────────────────────

export interface CareerSkillSelection {
  career: string;
  careerSkillChoices: string[];
  specializations: string[];
  specializationSkillChoices: Record<string, string[]>;
  skillRanks: Record<string, number>;
}

const REQUIRED_CAREER_SKILLS = 4;
const REQUIRED_SPECIALIZATION_SKILLS = 2;

export default function CareerSkillPicker({ gameSystem, initialCareer, initialSelection, onSelectionChange, onFinalStepComplete, onFirstStepBack }: {
  gameSystem: GameSystemDefinition;
  initialCareer?: string;
  // Sélection déjà faite précédemment dans la même session (conservée par le parent, ex restaurée
  // depuis un brouillon local) — sans elle, revenir sur cet onglet démonte/remonte ce composant et son
  // state interne repart de zéro alors que le parent avait toujours la vraie sélection en mémoire.
  initialSelection?: CareerSkillSelection | null;
  onSelectionChange: (selection: CareerSkillSelection) => void;
  // Appelé quand "Suivant" est cliqué sur la toute dernière sous-étape déjà validée — remplace la
  // paire Précédent/Suivant dupliquée que page.tsx affichait par-dessus ce composant : une seule
  // paire de boutons pilote maintenant à la fois les sous-étapes internes ET le passage à l'onglet
  // de création suivant.
  onFinalStepComplete?: () => void;
  // Symétrique de onFinalStepComplete : "Précédent" cliqué sur la toute première sous-étape retourne
  // à l'onglet de création précédent au lieu de rester bloqué (bouton avant désactivé à ce point).
  onFirstStepBack?: () => void;
}) {
  const skillLabel = gameSystem.skillLabel || 'Compétences';
  const skills = gameSystem.skills ?? [];
  const skillByKey = useMemo(() => new Map(skills.map((s) => [s.key, s])), [skills]);
  const careers = useMemo(() => (gameSystem.profiles ?? []).filter((p) => (p.careerSkillKeys?.length ?? 0) > 0), [gameSystem.profiles]);

  const { docs: specializationDocs } = useGameContent<SpecializationDoc & { id: string }>('specialization');

  // Carrière déjà choisie dans l'onglet Carrière de la création (character.Profile) : on ne la
  // redemande JAMAIS ici — l'étape 'career' du picker n'existe que pour les systèmes sans onglet
  // Carrière (hasRaceProfileContent false), sinon le joueur choisissait deux fois la même chose.
  const externalCareer = initialCareer && careers.some((c) => c.id === initialCareer) ? initialCareer : '';

  const restoredCareer = initialSelection?.career || '';
  const restoredCareerSkillChoices = initialSelection?.careerSkillChoices ?? [];
  const restoredSpecializationId = initialSelection?.specializations?.[0] || '';
  const restoredSpecializationSkillChoices = restoredSpecializationId
    ? (initialSelection?.specializationSkillChoices?.[restoredSpecializationId] ?? [])
    : [];

  const [career, setCareer] = useState<string>(restoredCareer || initialCareer || '');
  const [careerSkillChoices, setCareerSkillChoices] = useState<string[]>(restoredCareerSkillChoices);
  const [specializationId, setSpecializationId] = useState<string>(restoredSpecializationId);
  const [specializationSkillChoices, setSpecializationSkillChoices] = useState<string[]>(restoredSpecializationSkillChoices);
  // Reprend à la première étape encore incomplète plutôt qu'au tout début — sans ça, revenir sur cet
  // onglet après avoir déjà tout choisi renverrait à l'étape Carrière/Compétences alors que le parent
  // a déjà une sélection complète en mémoire.
  const [step, setStep] = useState<'career' | 'careerSkills' | 'specialization' | 'specializationSkills'>(() => {
    if (!(restoredCareer || externalCareer)) return 'career';
    if (restoredCareerSkillChoices.length < REQUIRED_CAREER_SKILLS) return 'careerSkills';
    if (!restoredSpecializationId) return 'specialization';
    return 'specializationSkills';
  });
  // Aperçu de l'arbre de talents d'une spécialisation (lecture seule) — pour ne pas choisir à l'aveugle.
  const [previewSpec, setPreviewSpec] = useState<(SpecializationDoc & { id: string }) | null>(null);
  // Codex : parcourir TOUTES les spécialisations, toutes carrières confondues.
  const [isBrowserOpen, setIsBrowserOpen] = useState(false);

  const selectedCareer = careers.find((c) => c.id === career);
  const careerSkillKeys = selectedCareer?.careerSkillKeys ?? [];
  const availableSpecializations = specializationDocs.filter((s) => s.careerIds.length === 0 || s.careerIds.includes(career));
  const selectedSpecialization = availableSpecializations.find((s) => s.id === specializationId);

  const emitSelection = (patch: Partial<{
    career: string; careerSkillChoices: string[]; specializationId: string; specializationSkillChoices: string[];
  }>) => {
    const nextCareer = patch.career ?? career;
    const nextCareerChoices = patch.careerSkillChoices ?? careerSkillChoices;
    const nextSpecializationId = patch.specializationId ?? specializationId;
    const nextSpecChoices = patch.specializationSkillChoices ?? specializationSkillChoices;

    const skillRanks: Record<string, number> = {};
    for (const key of nextCareerChoices) skillRanks[key] = (skillRanks[key] ?? 0) + 1;
    for (const key of nextSpecChoices) skillRanks[key] = (skillRanks[key] ?? 0) + 1;

    onSelectionChange({
      career: nextCareer,
      careerSkillChoices: nextCareerChoices,
      specializations: nextSpecializationId ? [nextSpecializationId] : [],
      specializationSkillChoices: nextSpecializationId ? { [nextSpecializationId]: nextSpecChoices } : {},
      skillRanks,
    });
  };

  const selectCareer = (id: string) => {
    setCareer(id);
    setCareerSkillChoices([]);
    setSpecializationId('');
    setSpecializationSkillChoices([]);
    emitSelection({ career: id, careerSkillChoices: [], specializationId: '', specializationSkillChoices: [] });
  };

  const toggleCareerSkill = (key: string) => {
    const included = careerSkillChoices.includes(key);
    if (!included && careerSkillChoices.length >= REQUIRED_CAREER_SKILLS) return;
    const next = included ? careerSkillChoices.filter((k) => k !== key) : [...careerSkillChoices, key];
    setCareerSkillChoices(next);
    emitSelection({ careerSkillChoices: next });
  };

  const selectSpecialization = (id: string) => {
    setSpecializationId(id);
    setSpecializationSkillChoices([]);
    emitSelection({ specializationId: id, specializationSkillChoices: [] });
  };

  const toggleSpecializationSkill = (key: string) => {
    const included = specializationSkillChoices.includes(key);
    if (!included && specializationSkillChoices.length >= REQUIRED_SPECIALIZATION_SKILLS) return;
    const next = included ? specializationSkillChoices.filter((k) => k !== key) : [...specializationSkillChoices, key];
    setSpecializationSkillChoices(next);
    emitSelection({ specializationSkillChoices: next });
  };

  const stepsOrder: typeof step[] = [
    ...(externalCareer ? [] : (['career'] as const)),
    'careerSkills' as const,
    ...(availableSpecializations.length > 0 ? (['specialization', 'specializationSkills'] as const) : []),
  ];
  const stepIndex = stepsOrder.indexOf(step);
  const goNext = () => {
    if (stepIndex < stepsOrder.length - 1) setStep(stepsOrder[stepIndex + 1]);
    else onFinalStepComplete?.();
  };
  const goPrev = () => {
    if (stepIndex > 0) setStep(stepsOrder[stepIndex - 1]);
    else onFirstStepBack?.();
  };

  const canGoNext = (
    (step === 'career' && !!career) ||
    (step === 'careerSkills' && careerSkillChoices.length === REQUIRED_CAREER_SKILLS) ||
    (step === 'specialization' && !!specializationId) ||
    (step === 'specializationSkills' && specializationSkillChoices.length === REQUIRED_SPECIALIZATION_SKILLS)
  );

  if (careers.length === 0) {
    return (
      <div className="p-8 text-center text-zinc-500">
        Aucune carrière n&apos;est configurée pour ce système de règles (un Profil doit désigner des compétences de carrière dans l&apos;éditeur MJ).
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {externalCareer && selectedCareer && (
            <span className="px-2 py-0.5 rounded border border-[#c0a080]/40 text-[#c0a080] font-bold uppercase tracking-wide text-[10px] mr-1">
              {selectedCareer.label}
            </span>
          )}
          {stepsOrder.map((s, i) => (
            <span key={s} className={i === stepIndex ? 'text-[#c0a080] font-bold' : ''}>
              {i > 0 && '→ '}
              {{ career: 'Carrière', careerSkills: skillLabel, specialization: 'Spécialisation', specializationSkills: skillLabel }[s]}
            </span>
          ))}
        </div>
        {/* Codex : parcourir TOUTES les spécialisations (toutes carrières confondues) avec leur arbre
            de talents — aide au choix de carrière autant que de spécialisation. */}
        <button
          onClick={() => setIsBrowserOpen(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#333] text-zinc-400 hover:text-[#c0a080] hover:border-[#c0a080]/50 transition-colors shrink-0"
          title="Parcourir toutes les spécialisations et leurs arbres de talents"
        >
          <BookOpen className="w-3.5 h-3.5" /> Codex des spécialisations
        </button>
      </div>

      {step === 'career' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {careers.map((c) => (
            <button
              key={c.id}
              onClick={() => selectCareer(c.id)}
              className={`p-4 rounded-xl border text-left transition-all ${career === c.id ? 'border-[#c0a080] ring-1 ring-[#c0a080] bg-[#c0a080]/10' : 'border-[#27272a] hover:border-[#52525b]'}`}
            >
              <div className="font-serif font-bold text-zinc-200">{c.label || '(sans nom)'}</div>
              {c.description && <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{c.description}</p>}
            </button>
          ))}
        </div>
      )}

      {step === 'careerSkills' && selectedCareer && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">Choisissez exactement {REQUIRED_CAREER_SKILLS} compétences de carrière — vous gagnez 1 rang gratuit dans chacune ({careerSkillChoices.length}/{REQUIRED_CAREER_SKILLS}).</p>
          <div className="flex flex-wrap gap-2">
            {careerSkillKeys.map((key) => {
              const skill = skillByKey.get(key);
              const included = careerSkillChoices.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleCareerSkill(key)}
                  className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-colors ${included ? 'border-[#c0a080] bg-[#c0a080]/10 text-[#c0a080]' : 'border-[#27272a] text-zinc-400 hover:border-[#52525b]'}`}
                >
                  {included && <Check size={14} />}
                  {skill?.label || key}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 'specialization' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {availableSpecializations.map((spec) => (
            <div
              key={spec.id}
              onClick={() => selectSpecialization(spec.id)}
              className={`relative p-4 rounded-xl border text-left transition-all cursor-pointer ${specializationId === spec.id ? 'border-[#c0a080] ring-1 ring-[#c0a080] bg-[#c0a080]/10' : 'border-[#27272a] hover:border-[#52525b]'}`}
            >
              <div className="font-serif font-bold text-zinc-200 pr-8">{spec.name || '(sans nom)'}</div>
              {spec.description && <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{spec.description}</p>}
              {/* Aperçu de l'arbre de talents sans sélectionner (stopPropagation) */}
              <button
                onClick={(e) => { e.stopPropagation(); setPreviewSpec(spec); }}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-zinc-500 hover:text-[#c0a080] hover:bg-white/5 transition-colors"
                title="Voir l'arbre de talents"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {step === 'specializationSkills' && selectedSpecialization && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">Choisissez exactement {REQUIRED_SPECIALIZATION_SKILLS} compétences ciblées par cette spécialisation — vous gagnez 1 rang gratuit dans chacune ({specializationSkillChoices.length}/{REQUIRED_SPECIALIZATION_SKILLS}).</p>
          <div className="flex flex-wrap gap-2">
            {selectedSpecialization.grantedSkillKeys.map((key) => {
              const skill = skillByKey.get(key);
              const included = specializationSkillChoices.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleSpecializationSkill(key)}
                  className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-colors ${included ? 'border-[#c0a080] bg-[#c0a080]/10 text-[#c0a080]' : 'border-[#27272a] text-zinc-400 hover:border-[#52525b]'}`}
                >
                  {included && <Check size={14} />}
                  {skill?.label || key}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4 border-t border-[#2a2a2a]">
        <Button onClick={goPrev} variant="outline" disabled={stepIndex === 0 && !onFirstStepBack} className="border-[#333] text-zinc-400 hover:text-white">
          <ChevronLeft className="mr-2 w-4 h-4" /> Précédent
        </Button>
        <Button onClick={goNext} disabled={!canGoNext} className="bg-[#c0a080] text-black hover:bg-[#d0b090] font-bold">
          Suivant <ChevronRight className="ml-2 w-4 h-4" />
        </Button>
      </div>

      {/* Aperçu (lecture seule) de l'arbre de talents d'une spécialisation — la grille officielle
          complète avec ses connexions, pour choisir en connaissance de cause. */}
      <Dialog open={!!previewSpec} onOpenChange={(open) => !open && setPreviewSpec(null)}>
        <DialogContent borderTrail className="bg-transparent border-none shadow-none p-0 max-w-[95vw] xl:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">{previewSpec?.name}</DialogTitle>
          {previewSpec && (
            <div className="p-6">
              <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)] mb-1">
                {previewSpec.name}
              </h2>
              {previewSpec.description && <p className="text-xs text-[var(--text-secondary)] mb-4">{previewSpec.description}</p>}
              <TalentTreeView
                talents={previewSpec.talents}
                purchasedRanks={{}}
                xp={0}
                canBuy={false}
                onBuy={() => {}}
              />
              <div className="flex justify-end mt-4 pt-4 border-t border-black/5 dark:border-white/5">
                <Button variant="ghost" onClick={() => setPreviewSpec(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  Fermer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SpecializationBrowser
        open={isBrowserOpen}
        onClose={() => setIsBrowserOpen(false)}
        specializations={specializationDocs}
        profiles={gameSystem.profiles ?? []}
        skills={skills}
      />
    </div>
  );
}

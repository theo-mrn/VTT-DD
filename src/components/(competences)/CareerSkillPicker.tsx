'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGameContent } from '@/modules/game-content/useGameContent';
import type { SpecializationDoc } from '@/modules/game-content/types';
import type { GameSystemDefinition, ProfileDefinition, SkillDefinition } from '@/modules/game-system/types';

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

export default function CareerSkillPicker({ gameSystem, initialCareer, onSelectionChange }: {
  gameSystem: GameSystemDefinition;
  initialCareer?: string;
  onSelectionChange: (selection: CareerSkillSelection) => void;
}) {
  const skillLabel = gameSystem.skillLabel || 'Compétences';
  const skills = gameSystem.skills ?? [];
  const skillByKey = useMemo(() => new Map(skills.map((s) => [s.key, s])), [skills]);
  const careers = useMemo(() => (gameSystem.profiles ?? []).filter((p) => (p.careerSkillKeys?.length ?? 0) > 0), [gameSystem.profiles]);

  const { docs: specializationDocs } = useGameContent<SpecializationDoc & { id: string }>('specialization');

  const [step, setStep] = useState<'career' | 'careerSkills' | 'specialization' | 'specializationSkills'>('career');
  const [career, setCareer] = useState<string>(initialCareer ?? '');
  const [careerSkillChoices, setCareerSkillChoices] = useState<string[]>([]);
  const [specializationId, setSpecializationId] = useState<string>('');
  const [specializationSkillChoices, setSpecializationSkillChoices] = useState<string[]>([]);

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

  const stepsOrder: typeof step[] = availableSpecializations.length > 0
    ? ['career', 'careerSkills', 'specialization', 'specializationSkills']
    : ['career', 'careerSkills'];
  const stepIndex = stepsOrder.indexOf(step);
  const goNext = () => { if (stepIndex < stepsOrder.length - 1) setStep(stepsOrder[stepIndex + 1]); };
  const goPrev = () => { if (stepIndex > 0) setStep(stepsOrder[stepIndex - 1]); };

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
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        {stepsOrder.map((s, i) => (
          <span key={s} className={i === stepIndex ? 'text-[#c0a080] font-bold' : ''}>
            {i > 0 && '→ '}
            {{ career: 'Carrière', careerSkills: skillLabel, specialization: 'Spécialisation', specializationSkills: skillLabel }[s]}
          </span>
        ))}
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
            <button
              key={spec.id}
              onClick={() => selectSpecialization(spec.id)}
              className={`p-4 rounded-xl border text-left transition-all ${specializationId === spec.id ? 'border-[#c0a080] ring-1 ring-[#c0a080] bg-[#c0a080]/10' : 'border-[#27272a] hover:border-[#52525b]'}`}
            >
              <div className="font-serif font-bold text-zinc-200">{spec.name || '(sans nom)'}</div>
              {spec.description && <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{spec.description}</p>}
            </button>
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
        <Button onClick={goPrev} variant="outline" disabled={stepIndex === 0} className="border-[#333] text-zinc-400 hover:text-white">
          <ChevronLeft className="mr-2 w-4 h-4" /> Précédent
        </Button>
        <Button onClick={goNext} disabled={!canGoNext || stepIndex === stepsOrder.length - 1} className="bg-[#c0a080] text-black hover:bg-[#d0b090] font-bold">
          Suivant <ChevronRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

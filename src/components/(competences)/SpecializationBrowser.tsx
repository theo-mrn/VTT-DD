'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { SpecializationDoc } from '@/modules/game-content/types';
import type { ProfileDefinition, SkillDefinition } from '@/modules/game-system/types';
import TalentTreeView from './TalentTreeView';

// ─────────────────────────────────────────────────────────────────────────────
// Codex des spécialisations : un espace unique pour TOUTES les parcourir (liste groupée par carrière à
// gauche, arbre de talents + détails à droite) — sans avoir à entrer dans une carrière pour découvrir
// ses spécialisations. Lecture seule : le choix/l'achat reste dans CareerSkillPicker (création) et
// TalentsSheet (fiche), qui ouvrent ce codex comme aide à la décision.
// ─────────────────────────────────────────────────────────────────────────────

type SpecDoc = SpecializationDoc & { id: string };

interface SpecializationBrowserProps {
  open: boolean;
  onClose: () => void;
  specializations: SpecDoc[];
  /** Carrières du système (gameSystem.profiles) — résout les careerIds en noms lisibles. */
  profiles: ProfileDefinition[];
  /** Compétences du système — résout grantedSkillKeys en labels. Optionnel (masqué si absent). */
  skills?: SkillDefinition[];
}

export default function SpecializationBrowser({ open, onClose, specializations, profiles, skills = [] }: SpecializationBrowserProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = specializations.find((s) => s.id === selectedId) ?? specializations[0] ?? null;

  const skillByKey = useMemo(() => new Map(skills.map((s) => [s.key, s])), [skills]);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  // Groupes par carrière, dans l'ordre des profils du système ; une spécialisation multi-carrières
  // apparaît dans chaque carrière concernée ; sans carrière (ou carrière supprimée) => "Universelles".
  const groups = useMemo(() => {
    const byCareer = new Map<string, SpecDoc[]>();
    for (const spec of specializations) {
      const knownCareers = spec.careerIds.filter((cid) => profileById.has(cid));
      const careers = knownCareers.length > 0 ? knownCareers : ['__universal__'];
      for (const cid of careers) {
        if (!byCareer.has(cid)) byCareer.set(cid, []);
        byCareer.get(cid)!.push(spec);
      }
    }
    const ordered: { label: string; specs: SpecDoc[] }[] = [];
    for (const profile of profiles) {
      const specs = byCareer.get(profile.id);
      if (specs?.length) ordered.push({ label: profile.label, specs });
    }
    const universal = byCareer.get('__universal__');
    if (universal?.length) ordered.push({ label: 'Universelles', specs: universal });
    return ordered;
  }, [specializations, profileById, profiles]);

  const careerLabels = (spec: SpecDoc) =>
    spec.careerIds.map((cid) => profileById.get(cid)?.label).filter((l): l is string => !!l);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent borderTrail className="bg-transparent border-none shadow-none p-0 max-w-[95vw] xl:max-w-7xl">
        <DialogTitle className="sr-only">Codex des spécialisations</DialogTitle>
        <div className="flex h-[85vh] overflow-hidden rounded-lg">
          {/* Liste groupée par carrière */}
          <div className="w-56 shrink-0 overflow-y-auto border-r p-3 space-y-4" style={{ borderColor: 'var(--border-color)', background: 'var(--bg-dark)' }}>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--accent-brown)]">Spécialisations</h2>
            {groups.map((group) => (
              <div key={group.label} className="space-y-1">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] px-2">{group.label}</h3>
                {group.specs.map((spec) => (
                  <button
                    key={`${group.label}-${spec.id}`}
                    onClick={() => setSelectedId(spec.id)}
                    className={`w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors ${
                      selected?.id === spec.id
                        ? 'bg-[var(--accent-brown)]/15 text-[var(--accent-brown)] font-semibold'
                        : 'text-[var(--text-primary)] hover:bg-white/5'
                    }`}
                  >
                    {spec.name || '(sans nom)'}
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 && (
              <p className="text-xs text-[var(--text-secondary)]">Aucune spécialisation définie.</p>
            )}
          </div>

          {/* Détails + arbre de talents */}
          <div className="flex-1 min-w-0 overflow-y-auto p-6" style={{ background: 'var(--bg-dark)' }}>
            {selected ? (
              <>
                <div className="flex flex-wrap items-baseline gap-2 mb-1">
                  <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)]">
                    {selected.name || '(sans nom)'}
                  </h2>
                  {careerLabels(selected).map((label) => (
                    <span key={label} className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border border-[var(--accent-brown)]/40 text-[var(--accent-brown)]">
                      {label}
                    </span>
                  ))}
                </div>
                {selected.description && (
                  <p className="text-xs text-[var(--text-secondary)] mb-2 max-w-3xl">{selected.description}</p>
                )}
                {skills.length > 0 && selected.grantedSkillKeys.length > 0 && (
                  <p className="text-[11px] text-[var(--text-secondary)] mb-4">
                    <span className="font-semibold text-[var(--text-primary)]">Compétences de carrière bonus :</span>{' '}
                    {selected.grantedSkillKeys.map((key) => skillByKey.get(key)?.label || key).join(', ')}
                  </p>
                )}
                <TalentTreeView
                  talents={selected.talents}
                  purchasedRanks={{}}
                  xp={0}
                  canBuy={false}
                  onBuy={() => {}}
                />
                <div className="flex justify-end mt-4 pt-4 border-t border-black/5 dark:border-white/5">
                  <Button variant="ghost" onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    Fermer
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--text-secondary)] text-sm">
                Sélectionnez une spécialisation.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

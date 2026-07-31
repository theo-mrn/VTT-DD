"use client"

import React, { useMemo, useState } from 'react'
import { Search, X, Star } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { MAX_SKILL_RANK } from '@/hooks/useNpcStatFields'
import type { SkillDefinition, StatDefinition } from '@/modules/game-system/types'

// ─────────────────────────────────────────────────────────────────────────────
// Éditeur de rangs de compétences pour un PNJ (template de bibliothèque ou jeton posé sur la carte).
// Un PNJ stocke ses rangs dans `skillRanks[key]` EXACTEMENT comme un personnage joueur, pour que le
// moteur de combat (combat.tsx / MJcombat.tsx / dice-roller) compose le même pool carac+rang sans
// savoir si l'acteur est un PJ ou un PNJ.
//
// Différence assumée avec SkillsSheet (fiche joueur) : pas d'XP, pas de coût, pas de notion de
// carrière — le MJ fixe les rangs à la main. La liste des compétences vient de gameSystem.skills :
// un système qui n'en déclare pas (ex dnd-classic, qui passe par les Voies) n'affiche simplement
// rien, ce composant ne nomme aucune clé en dur.
// ─────────────────────────────────────────────────────────────────────────────

interface NpcSkillRanksEditorProps {
    skills: SkillDefinition[]
    skillLabel: string
    skillGroups: string[]
    /** Rangs actuels — `skillRanks` du PNJ. Une clé absente vaut 0. */
    skillRanks: Record<string, number>
    /** Appelé avec l'objet skillRanks complet mis à jour (rangs à 0 retirés). */
    onChange: (next: Record<string, number>) => void
    /** Résolution de la carac liée, pour afficher "Agilité 3" sous le nom de la compétence. */
    statByKey: Map<string, StatDefinition>
    /** Valeurs de stats du PNJ en cours d'édition, pour lire la carac liée. */
    values: Record<string, unknown>
    /** Lecture seule (mode consultation de l'inspecteur). */
    readOnly?: boolean
    /** N'affiche que les compétences ayant au moins un rang — utilisé en lecture seule pour ne pas
     *  noyer la fiche sous 30 compétences à 0. */
    onlyRanked?: boolean
}

export function NpcSkillRanksEditor({
    skills, skillLabel, skillGroups, skillRanks, onChange,
    statByKey, values, readOnly = false, onlyRanked = false,
}: NpcSkillRanksEditorProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [activeGroup, setActiveGroup] = useState('all')

    const setRank = (key: string, rank: number) => {
        const clamped = Math.max(0, Math.min(MAX_SKILL_RANK, rank))
        const next = { ...skillRanks }
        // Un rang à 0 est l'état par défaut : on retire la clé plutôt que d'écrire des zéros, pour ne
        // pas gonfler le document Firestore d'une entrée par compétence non entraînée.
        if (clamped <= 0) delete next[key]
        else next[key] = clamped
        onChange(next)
    }

    const visibleSkills = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        return skills
            .filter((s) => !onlyRanked || (skillRanks[s.key] ?? 0) > 0)
            .filter((s) => activeGroup === 'all' || s.group === activeGroup)
            .filter((s) => !query || s.label.toLowerCase().includes(query))
    }, [skills, skillRanks, onlyRanked, activeGroup, searchQuery])

    if (skills.length === 0) return null

    const rankedCount = skills.filter((s) => (skillRanks[s.key] ?? 0) > 0).length

    return (
        <div className="space-y-3">
            <h3 className="text-[var(--accent-brown)] text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-brown)]" />
                {skillLabel}
                <span className="ml-auto font-mono text-[10px] text-[var(--text-secondary)] normal-case tracking-normal">
                    {rankedCount} / {skills.length}
                </span>
            </h3>

            {/* Recherche + filtre par groupe — masqués en lecture seule (liste déjà réduite aux rangs > 0) */}
            {!readOnly && (
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative flex-1 min-w-[140px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                        <Input
                            type="text"
                            placeholder="Rechercher..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-8 pl-8 pr-7 bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] text-xs focus:border-[var(--accent-brown)]"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                    {skillGroups.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                            {['all', ...skillGroups].map((g) => (
                                <button
                                    key={g}
                                    type="button"
                                    onClick={() => setActiveGroup(g)}
                                    className={`h-8 px-2.5 rounded border text-[10px] font-bold uppercase tracking-wide transition-colors ${activeGroup === g
                                        ? 'bg-[var(--accent-brown)] text-black border-[var(--accent-brown)]'
                                        : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]'
                                        }`}
                                >
                                    {g === 'all' ? 'Toutes' : g}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {visibleSkills.length === 0 ? (
                <p className="text-xs text-[var(--text-secondary)] py-3 text-center">
                    {onlyRanked ? 'Aucune compétence entraînée' : 'Aucune compétence trouvée'}
                </p>
            ) : (
                // Pas de hauteur bornée ici : c'est le conteneur scrollable de l'écran hôte (ScrollArea
                // du dialogue, panneau de la bibliothèque) qui gère le débordement — un second niveau
                // de scroll imbriqué rendait la liste pénible à parcourir.
                <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
                    {visibleSkills.map((skill) => {
                        const rank = skillRanks[skill.key] ?? 0
                        const linkedStat = statByKey.get(skill.linkedStatKey)
                        const linkedValue = linkedStat ? Number(values[linkedStat.key] ?? 0) : undefined
                        return (
                            <div
                                key={skill.key}
                                className={`bg-[var(--bg-card)] border rounded p-2 flex items-center gap-2 transition-colors ${rank > 0 ? 'border-[var(--accent-brown)]' : 'border-[var(--border-color)]'
                                    }`}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className={`text-xs font-semibold truncate ${rank > 0 ? 'text-[var(--accent-brown)]' : 'text-[var(--text-primary)]'}`}>
                                        {skill.label}
                                    </div>
                                    {linkedStat && (
                                        <div className="text-[10px] text-[var(--text-secondary)] truncate">
                                            {linkedStat.shortLabel || linkedStat.label} {linkedValue}
                                        </div>
                                    )}
                                </div>

                                {/* Rang : pastilles cliquables (clic sur la pastille du rang courant = retour à 0),
                                    fidèles au /5 de la fiche joueur et bien plus rapides qu'un champ nombre. */}
                                <div className="flex items-center gap-0.5 shrink-0">
                                    {Array.from({ length: MAX_SKILL_RANK }, (_, i) => i + 1).map((step) => (
                                        <button
                                            key={step}
                                            type="button"
                                            disabled={readOnly}
                                            onClick={() => setRank(skill.key, rank === step ? step - 1 : step)}
                                            title={readOnly ? undefined : `Rang ${step}`}
                                            className={`w-3 h-3 rounded-sm border transition-colors ${step <= rank
                                                ? 'bg-[var(--accent-brown)] border-[var(--accent-brown)]'
                                                : 'bg-transparent border-[var(--border-color)]'
                                                } ${readOnly ? 'cursor-default' : 'hover:border-[var(--accent-brown)]'}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

/** Compact, lecture seule : puces "Compétence N" pour les rangs > 0 (chip de liste, tooltip de carte). */
export function NpcSkillRanksSummary({ skills, skillRanks }: { skills: SkillDefinition[], skillRanks: Record<string, number> }) {
    const ranked = skills
        .map((s) => ({ skill: s, rank: skillRanks[s.key] ?? 0 }))
        .filter((r) => r.rank > 0)
        .sort((a, b) => b.rank - a.rank)

    if (ranked.length === 0) return null

    return (
        <div className="flex flex-wrap gap-1">
            {ranked.map(({ skill, rank }) => (
                <span
                    key={skill.key}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border"
                    style={{
                        borderColor: 'color-mix(in srgb, var(--accent-brown) 30%, transparent)',
                        background: 'color-mix(in srgb, var(--accent-brown) 10%, transparent)',
                        color: 'var(--accent-brown)',
                    }}
                >
                    <Star className="w-2.5 h-2.5" />
                    {skill.label} {rank}
                </span>
            ))}
        </div>
    )
}

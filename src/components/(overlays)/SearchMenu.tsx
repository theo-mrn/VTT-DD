"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCompetences, Competence } from "@/contexts/CompetencesContext";
import { useParams } from "next/navigation";
import { useGameSystem } from "@/modules/game-system/useGameSystem";
import { useGameContent } from "@/modules/game-content/useGameContent";
import type { BestiaryChunkDoc } from "@/modules/game-content/types";
import debounce from "lodash/debounce";
import { FileText, Search, X, Layers, Users, Crown, Sparkles, Sword, Heart, Ruler, Weight, BookOpen, Package, Skull } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useShortcuts, SHORTCUT_ACTIONS } from "@/contexts/ShortcutsContext";

const ACCENT = "#c0a080";

type TabId = "all" | "races" | "classes" | "prestiges" | "regles" | "objets" | "bestiaire";

const TABS = [
    { id: "all", label: "Tout", icon: Layers },
    { id: "races", label: "Races", icon: Users },
    { id: "classes", label: "Classes", icon: Sword },
    { id: "prestiges", label: "Prestiges", icon: Crown },
    { id: "regles", label: "Règles", icon: BookOpen },
    { id: "objets", label: "Objets", icon: Package },
    { id: "bestiaire", label: "Bestiaire", icon: Skull },
] as const;

// Item d'équipement issu de /tabs/data.json
type EquipmentItem = {
    nom: string;
    type?: string;
    portée?: string;
    dégâts?: string;
    prix?: string;
    DEF?: string;
    commentaires?: string;
    effet?: string;
    utilisation?: string;
};
type EquipmentData = Record<string, EquipmentItem[]>;

// Monstre issu de /tabs/bestiairy.json
type MonsterAction = { Nom: string; Description: string; Toucher?: number };
type BestiaryMonster = {
    Nom: string;
    Category?: string;
    Type?: string;
    description?: string;
    image?: string;
    Challenge?: string;
    PV_Max?: number;
    Defense?: number;
    FOR?: number; DEX?: number; CON?: number; INT?: number; SAG?: number; CHA?: number;
    Actions?: MonsterAction[];
};
type BestiaryData = Record<string, BestiaryMonster>;

// Marqueurs de source pour reconnaître objets et monstres dans la liste fusionnée
const ITEM_SOURCE_PREFIX = "Objet:";
const MONSTER_SOURCE_PREFIX = "Créature:";

export default function SearchMenu() {
    const [open, setOpen] = useState(false);
    const { searchCompetences, isLoading, allCompetences } = useCompetences();
    const { isShortcutPressed, onActionTriggered } = useShortcuts();

    // Races/classes/règles du SYSTÈME ACTIF de la salle (Firestore, cf useGameSystem) — remplace les
    // entrées statiques race.json/profile.json/Rules.json que fournissait CompetencesContext : une
    // salle Star Wars voit SES espèces/carrières/règles, une salle D&D voit le contenu seedé.
    const params = useParams();
    const roomId = (params?.roomid as string) ?? null;
    const { gameSystem } = useGameSystem(roomId);
    // Le contenu STATIQUE legacy (voies de compétences, objets data.json, bestiaire) est du contenu
    // D&D Classique : il n'apparaît que si la salle utilise ce système. Une salle en système custom
    // ne voit QUE son propre contenu (races/classes/règles du système, et à terme son équipement/
    // bestiaire une fois les phases de migration suivantes faites).
    const isDndClassic = gameSystem.systemId === 'dnd-classic';
    const systemEntries = useMemo(() => {
        const entries: Competence[] = [];
        for (const race of gameSystem.races ?? []) {
            entries.push({
                titre: race.label || race.id,
                description: race.description ?? '',
                type: 'Race',
                source: 'Règles',
                ...(race.image ? { image: race.image } : {}),
                ...(race.modifiers && Object.keys(race.modifiers).length > 0 ? { modificateurs: race.modifiers } : {}),
                ...(race.avgHeight != null ? { tailleMoyenne: race.avgHeight } : {}),
                ...(race.avgWeight != null ? { poidsMoyen: race.avgWeight } : {}),
            });
        }
        for (const profile of gameSystem.profiles ?? []) {
            entries.push({
                titre: profile.label || profile.id,
                description: profile.description ?? '',
                type: 'Classe',
                source: 'Règles',
                ...(profile.image ? { image: profile.image } : {}),
                ...(profile.hitDie ? { hitDie: profile.hitDie } : {}),
            });
        }
        for (const rule of gameSystem.rules ?? []) {
            entries.push({ titre: rule.title, description: rule.description, type: 'Règle', source: 'Règles' });
        }
        return entries;
    }, [gameSystem]);
    const [searchResults, setSearchResults] = useState<Competence[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<TabId>("all");
    const [selectedCompetence, setSelectedCompetence] = useState<Competence | null>(null);
    const [items, setItems] = useState<Competence[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    // Charge la liste des objets (/tabs/data.json) et la transforme en Competence[] — contenu D&D
    // legacy, uniquement pour une salle dnd-classic.
    useEffect(() => {
        if (!isDndClassic) { setItems([]); return; }
        fetch('/tabs/data.json')
            .then(res => res.json())
            .then((data: EquipmentData) => {
                const mapped: Competence[] = [];
                for (const [category, list] of Object.entries(data)) {
                    if (!Array.isArray(list)) continue;
                    for (const item of list) {
                        // Construit une description lisible à partir des champs présents
                        const lines = [
                            item.type && `Type : ${item.type}`,
                            item.portée && `Portée : ${item.portée}`,
                            item.dégâts && `Dégâts : ${item.dégâts}`,
                            item.DEF && `DEF : ${item.DEF}`,
                            item.effet && item.effet,
                            item.utilisation && item.utilisation,
                            item.commentaires && item.commentaires,
                            item.prix && `Prix : ${item.prix}`,
                        ].filter(Boolean);
                        mapped.push({
                            titre: item.nom,
                            description: lines.join('\n'),
                            type: item.type || category.replace(/_/g, ' '),
                            source: `${ITEM_SOURCE_PREFIX} ${category.replace(/_/g, ' ')}`,
                        });
                    }
                }
                setItems(mapped);
            })
            .catch(err => console.error('Error loading data.json:', err));
    }, [isDndClassic]);

    // Bestiaire du SYSTÈME ACTIF (Firestore, kind 'bestiary' — seedé pour dnd-classic, propre à chaque
    // système custom) transformé en Competence[] — plus de bestiairy.json statique.
    const { docs: bestiaryChunks } = useGameContent<BestiaryChunkDoc & { id: string }>('bestiary');
    const monsters = useMemo(() => {
        const mapped: Competence[] = [];
        for (const chunk of bestiaryChunks) {
            for (const m of Object.values(chunk.entries ?? {}) as BestiaryMonster[]) {
                const stats = [
                    m.Defense != null && `DEF : ${m.Defense}`,
                    m.PV_Max != null && `PV : ${m.PV_Max}`,
                    m.FOR != null && `FOR ${m.FOR} · DEX ${m.DEX} · CON ${m.CON} · INT ${m.INT} · SAG ${m.SAG} · CHA ${m.CHA}`,
                ].filter(Boolean).join('\n');

                const actions = (m.Actions || [])
                    .map(a => `• ${a.Nom} : ${a.Description}`)
                    .join('\n\n');

                const description = [
                    m.description,
                    stats && `\n${stats}`,
                    actions && `\nActions :\n${actions}`,
                ].filter(Boolean).join('\n');

                mapped.push({
                    titre: m.Nom,
                    description,
                    type: m.Type || m.Category || 'Créature',
                    source: m.Challenge ? `${MONSTER_SOURCE_PREFIX} FP ${m.Challenge}` : MONSTER_SOURCE_PREFIX,
                    image: m.image && m.image.trim() !== '' ? m.image : undefined,
                });
            }
        }
        mapped.sort((a, b) => a.titre.localeCompare(b.titre));
        return mapped;
    }, [bestiaryChunks]);

    // Use ref to ensure we always have the latest state setters
    // Note: In this full rewrite, we might simplify this if we just filter locally,
    // but preserving the async/debounced structure is safer for performance if the list is huge.
    const searchResultsRef = useRef(setSearchResults);
    searchResultsRef.current = setSearchResults;

    const isSearchingRef = useRef(setIsSearching);
    isSearchingRef.current = setIsSearching;

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            // Check for search shortcut
            if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_OPEN_SEARCH)) {
                e.preventDefault();
                setOpen((open) => {
                    if (!open) {
                        setTimeout(() => inputRef.current?.focus(), 100);
                    }
                    return !open;
                });
            }
            if (e.key === "Escape" && open) {
                setOpen(false);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, [open, isShortcutPressed]);

    // Bouton personnalisable (voir CustomButtons) : même effet que le raccourci
    // clavier, déclenché par clic au lieu d'une touche.
    useEffect(() => {
        return onActionTriggered(SHORTCUT_ACTIONS.TOOL_OPEN_SEARCH, () => {
            setOpen((open) => {
                if (!open) setTimeout(() => inputRef.current?.focus(), 100);
                return !open;
            });
        });
    }, [onActionTriggered]);

    // Reset selection when results change or tab changes
    useEffect(() => {
        if (searchResults.length > 0 && !selectedCompetence) {
            // Optional: Auto-select first item? 
            // setSelectedCompetence(searchResults[0]);
        }
    }, [searchResults, activeTab]);

    const filterByTab = useCallback((list: Competence[], tab: TabId) => {
        if (tab === "all") return list;
        return list.filter(item => {
            const source = item.source || "";
            const isItem = source.startsWith(ITEM_SOURCE_PREFIX);
            const isMonster = source.startsWith(MONSTER_SOURCE_PREFIX);
            const isRuleType = item.type === "Règle";
            const isRaceType = item.type === "Race" || source.startsWith("Race:");
            const isPrestigeType = source.startsWith("Prestige:");

            if (tab === "objets") return isItem;
            if (tab === "bestiaire") return isMonster;
            if (isItem || isMonster) return false; // objets/créatures : seulement dans leur onglet dédié
            if (tab === "regles") return isRuleType;
            if (tab === "races") return isRaceType;
            if (tab === "prestiges") return isPrestigeType;
            if (tab === "classes") return !isRaceType && !isPrestigeType && !isRuleType;
            return true;
        });
    }, []);

    const debouncedSearch = useCallback(
        debounce((term: string) => {
            isSearchingRef.current(true);
            try {
                // We search everything first (les voies legacy du contexte = contenu D&D uniquement)
                let results = isDndClassic ? searchCompetences(term) : [];

                // Then set results -- filtering by tab happens in render or effect?
                // Actually, let's store ALL matches and filter in render for tab switching speed.
                searchResultsRef.current(results);

                // If we have results and no selection, select the first one
                if (results.length > 0) {
                    // setSelectedCompetence(results[0]); 
                }
            } catch (error) {
                console.error(error);
                searchResultsRef.current([]);
            } finally {
                isSearchingRef.current(false);
            }
        }, 300),
        [searchCompetences, isDndClassic]
    );

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchTerm(value);
        if (value.trim()) {
            setIsSearching(true);
            debouncedSearch(value);
        } else {
            setSearchResults([]);
            setIsSearching(false);
            setSelectedCompetence(null);
        }
    };

    // Recherche locale dans les données non gérées par le contexte (système actif + objets + bestiaire)
    const searchLocal = useCallback((term: string) => {
        const q = term.toLowerCase();
        const match = (c: Competence) =>
            c.titre.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q) ||
            (c.type || "").toLowerCase().includes(q);
        return [...systemEntries.filter(match), ...items.filter(match), ...monsters.filter(match)];
    }, [systemEntries, items, monsters]);

    // Derived state for display
    const visibleResults = useMemo(() => {
        if (!searchTerm.trim()) {
            // By default, only show results for specific categories, not for "all"
            if (activeTab === "all") return [];
            if (activeTab === "objets") return items;
            if (activeTab === "bestiaire") return monsters;
            return filterByTab([...systemEntries, ...(isDndClassic ? allCompetences : [])], activeTab);
        }
        // Fusionne résultats de compétences (contexte) + système actif + objets + bestiaire (local)
        const merged = [...searchResults, ...searchLocal(searchTerm)];
        return filterByTab(merged, activeTab);
    }, [searchResults, allCompetences, systemEntries, isDndClassic, activeTab, searchTerm, filterByTab, items, monsters, searchLocal]);

    const closeAll = () => {
        setOpen(false);
        setSelectedCompetence(null);
    };

    return (
        <AnimatePresence>
            {open && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-black/50 backdrop-blur-md"
                        onClick={closeAll}
                    />

                    {/* Command palette */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: -8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: -6, transition: { duration: 0.12 } }}
                        transition={{ type: 'spring', damping: 30, stiffness: 360 }}
                        className="relative w-full max-w-2xl max-h-[70vh] flex flex-col rounded-2xl border border-white/[0.08] bg-[#131315]/95 shadow-[0_32px_80px_-16px_rgba(0,0,0,0.8)] backdrop-blur-xl overflow-hidden"
                    >
                        {/* Search bar */}
                        <div className="flex items-center gap-3 h-14 px-4 shrink-0">
                            <Search className="w-4.5 h-4.5 text-white/35 shrink-0" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchTerm}
                                onChange={handleSearch}
                                placeholder="Rechercher une compétence, un objet, une créature…"
                                className="flex-1 bg-transparent border-none outline-none text-[15px] text-white placeholder:text-white/30 h-full"
                                autoComplete="off"
                            />
                            {searchTerm && (
                                <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => { setSearchTerm(''); setSearchResults([]); }}
                                    className="text-white/40 hover:text-white transition-colors shrink-0"
                                >
                                    <X className="w-4 h-4" />
                                </motion.button>
                            )}
                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={closeAll}
                                aria-label="Fermer"
                                className="h-7 w-7 flex items-center justify-center rounded-md text-white/30 hover:text-white hover:bg-white/5 transition-colors shrink-0"
                            >
                                <X className="w-4 h-4" />
                            </motion.button>
                        </div>

                        {/* Filter chips */}
                        <div className="relative flex items-center gap-1 px-3 pb-3 shrink-0 overflow-x-auto">
                            {TABS.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <motion.button
                                        key={tab.id}
                                        whileTap={{ scale: 0.94 }}
                                        onClick={() => setActiveTab(tab.id as TabId)}
                                        className={cn(
                                            "relative z-10 flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors duration-150",
                                            isActive ? "text-black" : "text-white/50 hover:text-white/80"
                                        )}
                                    >
                                        {isActive && (
                                            <motion.span
                                                layoutId="search-menu-chip-highlight"
                                                transition={{ type: 'spring', damping: 30, stiffness: 380 }}
                                                className="absolute inset-0 -z-10 rounded-full"
                                                style={{ background: ACCENT }}
                                            />
                                        )}
                                        <Icon className="w-3 h-3" />
                                        {tab.label}
                                    </motion.button>
                                );
                            })}
                        </div>

                        <div className="h-px bg-white/[0.06] shrink-0" />

                        {/* Body: list ↔ detail, same container */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <AnimatePresence mode="wait" initial={false}>
                                {selectedCompetence ? (
                                    <motion.div
                                        key="detail"
                                        initial={{ opacity: 0, x: 12 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 12, transition: { duration: 0.1 } }}
                                        transition={{ duration: 0.18 }}
                                        className="p-5"
                                    >
                                        <motion.button
                                            whileTap={{ scale: 0.96 }}
                                            onClick={() => setSelectedCompetence(null)}
                                            className="flex items-center gap-1.5 text-xs font-medium text-white/45 hover:text-white/80 transition-colors mb-4"
                                        >
                                            ← Retour aux résultats
                                        </motion.button>

                                        {selectedCompetence.image && (
                                            <div className="relative w-full h-52 bg-black rounded-xl overflow-hidden mb-5 border border-white/10">
                                                <Image
                                                    src={selectedCompetence.image}
                                                    alt={selectedCompetence.titre}
                                                    fill
                                                    className="object-contain"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-[#131315] via-transparent to-transparent pointer-events-none" />
                                            </div>
                                        )}

                                        <div className="flex items-start justify-between mb-4 gap-4">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1.5" style={{ color: ACCENT }}>
                                                    <FileText className="w-3.5 h-3.5" />
                                                    <span className="text-[10px] font-bold tracking-widest uppercase opacity-90">
                                                        {selectedCompetence.type || "Détails"}
                                                    </span>
                                                </div>
                                                <h2 className="text-2xl font-bold tracking-tight text-white mb-1.5">
                                                    {selectedCompetence.titre}
                                                </h2>
                                                {selectedCompetence.source && (
                                                    <div className="flex items-center gap-2 text-white/40">
                                                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />
                                                        <span className="text-xs font-medium">{selectedCompetence.source}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {selectedCompetence.hitDie && (
                                                <div className="flex flex-col items-center bg-white/5 border border-white/10 p-2.5 rounded-lg shrink-0">
                                                    <Heart className="w-4 h-4 text-red-400 mb-1" />
                                                    <span className="text-[9px] text-white/40 uppercase">Dé de vie</span>
                                                    <span className="font-bold text-sm text-white">{selectedCompetence.hitDie}</span>
                                                </div>
                                            )}
                                        </div>

                                        {selectedCompetence.modificateurs && Object.keys(selectedCompetence.modificateurs).length > 0 && (
                                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
                                                {Object.entries(selectedCompetence.modificateurs).map(([stat, value]) => (
                                                    <div key={stat} className="flex flex-col items-center justify-center p-2 rounded-lg bg-white/5 border border-white/10">
                                                        <span className="text-[9px] text-white/40 font-bold uppercase">{stat}</span>
                                                        <span className={cn("text-sm font-bold", value > 0 ? "text-green-400" : "text-red-400")}>
                                                            {value > 0 ? `+${value}` : value}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {(selectedCompetence.tailleMoyenne || selectedCompetence.poidsMoyen) && (
                                            <div className="flex gap-3 mb-5">
                                                {selectedCompetence.tailleMoyenne && (
                                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-full border border-white/10">
                                                        <Ruler className="w-3.5 h-3.5 text-white/40" />
                                                        <span className="text-xs text-white/80">{selectedCompetence.tailleMoyenne} cm</span>
                                                    </div>
                                                )}
                                                {selectedCompetence.poidsMoyen && (
                                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-full border border-white/10">
                                                        <Weight className="w-3.5 h-3.5 text-white/40" />
                                                        <span className="text-xs text-white/80">{selectedCompetence.poidsMoyen} kg</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="prose prose-invert prose-sm max-w-none text-white/60 leading-relaxed">
                                            <p className="whitespace-pre-line">
                                                {selectedCompetence.description.replace(/<[^>]*>?/gm, '')}
                                            </p>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="list"
                                        initial={{ opacity: 0, x: -12 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -12, transition: { duration: 0.1 } }}
                                        transition={{ duration: 0.18 }}
                                    >
                                        {isLoading && <div className="p-8 text-center text-white/40 text-sm">Chargement...</div>}
                                        {!isLoading && visibleResults.length === 0 && (
                                            <div className="p-8 text-center text-white/40 text-sm">
                                                {searchTerm ? (
                                                    "Aucun résultat"
                                                ) : activeTab === "all" ? (
                                                    <span className="opacity-40">Commencez à taper pour chercher</span>
                                                ) : (
                                                    "Aucun élément trouvé"
                                                )}
                                            </div>
                                        )}

                                        <div className="p-2.5 space-y-1">
                                            {visibleResults.map((competence, index) => (
                                                <button
                                                    key={`${competence.titre}-${index}`}
                                                    onClick={() => setSelectedCompetence(competence)}
                                                    className="group w-full flex flex-col gap-0.5 p-2.5 rounded-lg text-left transition-colors duration-150 hover:bg-white/5"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="font-medium text-sm text-white/85 group-hover:text-white truncate">
                                                            {competence.titre}
                                                        </span>
                                                        {competence.type && (
                                                            <span className="text-[10px] bg-black/30 px-1.5 py-0.5 rounded text-white/40 shrink-0">
                                                                {competence.type}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {competence.source && (
                                                        <span className="text-[11px] text-white/35 line-clamp-1">
                                                            {competence.source}
                                                        </span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

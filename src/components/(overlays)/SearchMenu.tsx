"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useCompetences, Competence } from "@/contexts/CompetencesContext";
import debounce from "lodash/debounce";
import { FileText, Search, X, Layers, Users, Crown, Sparkles, Sword, Heart, Ruler, Weight, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useShortcuts, SHORTCUT_ACTIONS } from "@/contexts/ShortcutsContext";

type TabId = "all" | "races" | "classes" | "prestiges" | "regles";

const TABS = [
    { id: "all", label: "Tout", icon: Layers },
    { id: "races", label: "Races", icon: Users },
    { id: "classes", label: "Classes", icon: Sword },
    { id: "prestiges", label: "Prestiges", icon: Crown },
    { id: "regles", label: "Règles", icon: BookOpen },
] as const;

export default function SearchMenu() {
    const [open, setOpen] = useState(false);
    const { searchCompetences, isLoading, allCompetences } = useCompetences();
    const { isShortcutPressed } = useShortcuts();
    const [searchResults, setSearchResults] = useState<Competence[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState<TabId>("all");
    const [selectedCompetence, setSelectedCompetence] = useState<Competence | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

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

    // Reset selection when results change or tab changes
    useEffect(() => {
        if (searchResults.length > 0 && !selectedCompetence) {
            // Optional: Auto-select first item? 
            // setSelectedCompetence(searchResults[0]);
        }
    }, [searchResults, activeTab]);

    const filterByTab = useCallback((items: Competence[], tab: TabId) => {
        if (tab === "all") return items;
        return items.filter(item => {
            const source = item.source || "";
            const isRuleType = item.type === "Règle";
            const isRaceType = item.type === "Race" || source.startsWith("Race:");
            const isPrestigeType = source.startsWith("Prestige:");

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
                // We search everything first
                let results = searchCompetences(term);

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
        [searchCompetences]
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

    // Derived state for display
    const visibleResults = useMemo(() => {
        if (!searchTerm.trim()) {
            // By default, only show results for specific categories, not for "all"
            if (activeTab === "all") return [];
            return filterByTab(allCompetences, activeTab);
        }
        return filterByTab(searchResults, activeTab);
    }, [searchResults, allCompetences, activeTab, searchTerm, filterByTab]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-background/60 backdrop-blur-xl transition-all"
                onClick={() => setOpen(false)}
            />

            {/* Main Window */}
            <div className="relative w-full max-w-7xl h-[85vh] bg-[#1a1a1a] border border-white/10 shadow-2xl rounded-2xl flex overflow-hidden ring-1 ring-white/5">

                {/* 1. Sidebar Tabs */}
                <div className="w-20 md:w-24 flex flex-col items-center py-6 bg-black/20 border-r border-white/5 gap-4 z-10">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabId)}
                                className={cn(
                                    "flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all duration-200 gap-1 group relative",
                                    isActive
                                        ? "bg-primary/10 text-primary shadow-[0_0_15px_rgba(var(--primary),0.3)]"
                                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                                )}
                                title={tab.label}
                            >
                                <Icon className={cn("w-6 h-6", isActive ? "stroke-[2.5px]" : "")} />
                                <span className="text-[9px] font-medium tracking-wide">{tab.label}</span>
                                {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full -ml-[19px] md:-ml-[21px]" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* 2. List & Search Column */}
                <div className="flex-1 max-w-md flex flex-col border-r border-white/5 bg-[#1e1e1e]">
                    {/* Search Header */}
                    <div className="h-20 border-b border-white/5 flex items-center px-6 gap-3 shrink-0">
                        <Search className="w-5 h-5 text-muted-foreground" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={searchTerm}
                            onChange={handleSearch}
                            placeholder="Rechercher..."
                            className="flex-1 bg-transparent border-none outline-none text-lg placeholder:text-muted-foreground/40 h-full"
                            autoComplete="off"
                        />
                        {searchTerm && (
                            <button onClick={() => { setSearchTerm(''); setSearchResults([]); }} className="text-muted-foreground hover:text-foreground">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Filtered List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {isLoading && <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>}
                        {!isLoading && visibleResults.length === 0 && (
                            <div className="p-8 text-center text-muted-foreground text-sm">
                                {searchTerm ? (
                                    "Aucun résultat"
                                ) : activeTab === "all" ? (
                                    <div className="flex flex-col items-center gap-2 opacity-40">
                                        <span>Commencez à taper pour chercher</span>
                                    </div>
                                ) : (
                                    "Aucun élément trouvé"
                                )}
                            </div>
                        )}

                        <div className="p-3 space-y-1">
                            {visibleResults.map((competence, index) => {
                                const isSelected = selectedCompetence?.titre === competence.titre; // Simple equality check, ideally use ID
                                return (
                                    <div
                                        key={`${competence.titre}-${index}`}
                                        onClick={() => setSelectedCompetence(competence)}
                                        className={cn(
                                            "group flex flex-col gap-1 p-3 rounded-lg cursor-pointer transition-all duration-200 border border-transparent",
                                            isSelected
                                                ? "bg-primary/10 border-primary/20"
                                                : "hover:bg-white/5 hover:border-white/5"
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={cn("font-medium text-sm transition-colors", isSelected ? "text-primary" : "text-foreground group-hover:text-foreground/90")}>
                                                {competence.titre}
                                            </span>
                                            {competence.type && (
                                                <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded text-muted-foreground">
                                                    {competence.type}
                                                </span>
                                            )}
                                        </div>
                                        {competence.source && (
                                            <span className="text-[11px] text-muted-foreground/60 line-clamp-1">
                                                {competence.source}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </div>

                {/* 3. Detail View (Right Panel) */}
                <div className="flex-[2] bg-[#141414] p-8 md:p-12 overflow-y-auto flex flex-col relative">
                    {/* Close Button Absolute */}
                    <button
                        onClick={() => setOpen(false)}
                        className="absolute top-6 right-6 p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors z-20"
                    >
                        <X className="w-6 h-6" />
                    </button>

                    {selectedCompetence ? (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-3xl mx-auto w-full">

                            {/* Image Header - Styled like CreatureLibraryModal */}
                            {selectedCompetence.image && (
                                <div className="relative w-full h-[400px] bg-black rounded-xl overflow-hidden mb-8 border border-white/10 group shadow-2xl">
                                    {/* Ambient Background */}
                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-black opacity-30" />

                                    <Image
                                        src={selectedCompetence.image}
                                        alt={selectedCompetence.titre}
                                        fill
                                        className="object-contain"
                                    />

                                    {/* Bottom Gradient Overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/40 to-transparent pointer-events-none z-20" />
                                </div>
                            )}

                            <div className="flex items-start justify-between mb-6">
                                <div>
                                    <div className="flex items-center gap-3 mb-2 text-primary">
                                        <FileText className="w-5 h-5" />
                                        <span className="text-xs font-bold tracking-widest uppercase opacity-80">
                                            {selectedCompetence.type || "Détails"}
                                        </span>
                                    </div>
                                    <h2 className="text-4xl font-bold tracking-tight text-white mb-2">
                                        {selectedCompetence.titre}
                                    </h2>
                                    {selectedCompetence.source && (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <span className="w-1.5 h-1.5 bg-primary/50 rounded-full" />
                                            <span className="text-sm font-medium">{selectedCompetence.source}</span>
                                        </div>
                                    )}
                                </div>

                                {selectedCompetence.hitDie && (
                                    <div className="flex flex-col items-center bg-white/5 border border-white/10 p-3 rounded-lg">
                                        <Heart className="w-5 h-5 text-red-400 mb-1" />
                                        <span className="text-xs text-muted-foreground uppercase">Dé de vie</span>
                                        <span className="font-bold text-lg text-white">{selectedCompetence.hitDie}</span>
                                    </div>
                                )}
                            </div>

                            {/* Stats Grid (Race Modifiers) */}
                            {selectedCompetence.modificateurs && Object.keys(selectedCompetence.modificateurs).length > 0 && (
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-8">
                                    {Object.entries(selectedCompetence.modificateurs).map(([stat, value]) => (
                                        <div key={stat} className="flex flex-col items-center justify-center p-2 rounded-lg bg-white/5 border border-white/10">
                                            <span className="text-[10px] text-muted-foreground font-bold uppercase">{stat}</span>
                                            <span className={cn("text-lg font-bold", value > 0 ? "text-green-400" : "text-red-400")}>
                                                {value > 0 ? `+${value}` : value}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Physical Stats (Race) */}
                            {(selectedCompetence.tailleMoyenne || selectedCompetence.poidsMoyen) && (
                                <div className="flex gap-4 mb-8">
                                    {selectedCompetence.tailleMoyenne && (
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
                                            <Ruler className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm text-foreground">{selectedCompetence.tailleMoyenne} cm</span>
                                        </div>
                                    )}
                                    {selectedCompetence.poidsMoyen && (
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
                                            <Weight className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm text-foreground">{selectedCompetence.poidsMoyen} kg</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="h-px w-full bg-gradient-to-r from-white/10 to-transparent mb-8" />

                            <div className="prose prose-invert prose-lg max-w-none text-muted-foreground leading-relaxed">
                                {/* Using replace to strip HTML tags if needed, styling dependent on pure text vs HTML */}
                                <p className="whitespace-pre-line">
                                    {selectedCompetence.description.replace(/<[^>]*>?/gm, '')}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/30 gap-6 select-none">
                            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center">
                                <FileText className="w-10 h-10" />
                            </div>
                            <div className="text-center space-y-2">
                                <p className="text-xl font-medium text-white/20">Aucune sélection</p>
                                <p className="text-sm max-w-xs mx-auto">
                                    Sélectionnez une compétence dans la liste pour voir les détails complets.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

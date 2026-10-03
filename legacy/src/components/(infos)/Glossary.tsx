"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Shield, BookOpen, Scroll, Skull, Heart, Sword, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import HTMLFlipBook from "react-pageflip";
import { cn } from "@/lib/utils";
import { useParams } from "next/navigation";
import { useGameSystem } from "@/modules/game-system/useGameSystem";
import { useGameContent } from "@/modules/game-content/useGameContent";
import type { BestiaryChunkDoc } from "@/modules/game-content/types";

// CSS embedded directly in component for specific flipbook needs
const flipbookStyles = `
  .bestiary-page {
    background-color: #f4e4bc;
    background-image: url('https://www.transparenttextures.com/patterns/aged-paper.png');
    box-shadow: inset 0 0 50px rgba(0,0,0,0.1);
    border-right: 1px solid rgba(0,0,0,0.1);
    border-left: 1px solid rgba(0,0,0,0.1);
    position: relative;
    overflow: hidden;
  }
  
  .bestiary-page::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 30px;
    background: linear-gradient(to right, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 100%);
    z-index: 10;
  }

  .bestiary-page.left-page::after {
    right: 0;
    background: linear-gradient(to left, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 100%);
  }
  
  .bestiary-page.right-page::after {
    left: 0;
    background: linear-gradient(to right, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0) 100%);
  }

  .page-number {
    position: absolute;
    bottom: 20px;
    font-family: serif;
    font-style: italic;
    color: #78350f;
    opacity: 0.7;
    font-size: 14px;
  }

  .left-page .page-number {
    left: 20px;
  }

  .right-page .page-number {
    right: 20px;
  }

  .book-cover {
    background-color: #2e1c0d;
    background-image: url('https://www.transparenttextures.com/patterns/leather.png');
    border: 8px solid #4a2c11;
    border-radius: 4px;
    box-shadow: inset 0 0 100px rgba(0,0,0,0.8), 0 20px 50px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  
  .book-cover::before {
    content: '';
    position: absolute;
    left: 10px;
    top: 0;
    bottom: 0;
    width: 20px;
    background: linear-gradient(to right, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 100%);
    border-left: 2px solid rgba(255,255,255,0.1);
  }

  .cover-ornament {
    width: 80%;
    height: 80%;
    border: 2px solid #b48e4b;
    border-radius: 8px;
    position: absolute;
    pointer-events: none;
  }
  
  .cover-ornament::before, .cover-ornament::after {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    border: 2px solid #b48e4b;
  }

  .styled-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .styled-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .styled-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(120, 53, 15, 0.3);
    border-radius: 10px;
  }
`;

interface Capability {
    [key: string]: string;
}

interface MonsterAction {
    Nom: string;
    Description: string;
    Toucher?: number;
}

interface Monster {
    id: string;
    Nom: string;
    Category: string;
    Type: string;
    description: string;
    image: string;
    niveau?: number;
    Challenge?: string;
    PV?: number;
    PV_Max?: number;
    Defense?: number;
    Contact?: number;
    Distance?: number;
    Magie?: number;
    INIT?: number;
    FOR?: number;
    DEX?: number;
    CON?: number;
    INT?: number;
    SAG?: number;
    CHA?: number;
    Actions?: MonsterAction[];
}

interface Profile {
    id: string;
    description: string;
    hitDie: string;
    image: string;
}

interface Race {
    id: string;
    description: string;
    image: string;
    modificateurs: Record<string, number>;
}

type TabType = 'bestiaire' | 'classes' | 'races';

export default function Glossary() {
    return <GlossaryContent />;
}

/** Lit ?roomId=... directement via window.location plutôt que useSearchParams() — ce dernier exige un
 *  <Suspense> englobant en Next.js App Router, qui restait bloqué en fallback indéfiniment ici. Recalculé
 *  au montage uniquement : cette page est toujours ouverte via window.open (jamais de navigation interne
 *  qui changerait la query string après le premier rendu). */
function useRoomIdFromQuery(): string | null {
    const [roomId, setRoomId] = useState<string | null>(null);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        setRoomId(new URLSearchParams(window.location.search).get('roomId'));
    }, []);
    return roomId;
}

function GlossaryContent() {
    const [activeTab, setActiveTab] = useState<TabType>('bestiaire');

    const [monsters, setMonsters] = useState<Monster[]>([]);

    // Races/classes du SYSTÈME ACTIF (Firestore via useGameSystem) au lieu des race.json/profile.json/
    // capacites.json statiques — dans une salle ([roomid] présent dans l'URL), c'est le système de la
    // salle. La page /ressources n'a pas de [roomid] dans son URL (elle vit hors contexte de salle,
    // ouverte via window.open depuis le panneau MJ) : on lit alors le roomId passé en query param
    // (?roomId=..., ajouté par panel.tsx) pour afficher quand même le système de la salle d'origine —
    // sans ce param, on retombe sur le système par défaut (dnd-classic seedé).
    const params = useParams();
    const roomIdFromQuery = useRoomIdFromQuery();
    const roomId = (params?.roomid as string) ?? roomIdFromQuery;
    const { gameSystem } = useGameSystem(roomId);

    // asset-mappings.json = résolution des chemins d'images locaux vers le CDN (hors périmètre de la
    // migration de contenu : c'est un index d'assets média, pas du contenu de jeu). Déclaré AVANT les
    // memos races/profils qui résolvent leurs images avec.
    const [assetMap, setAssetMap] = useState<Map<string, string>>(new Map());
    const profiles: Profile[] = useMemo(() =>
        (gameSystem.profiles ?? []).map((p) => ({
            id: p.label || p.id,
            description: p.description ?? '',
            hitDie: p.hitDie ?? '',
            image: !p.image ? '' : p.image.startsWith('http') ? p.image : (assetMap.get(p.image) || p.image),
        })), [gameSystem.profiles, assetMap]);

    const races: Race[] = useMemo(() =>
        (gameSystem.races ?? []).map((r) => ({
            id: r.label || r.id,
            description: r.description ?? '',
            image: !r.image ? '' : r.image.startsWith('http') ? r.image : (assetMap.get(r.image) || r.image),
            modificateurs: r.modifiers ?? {},
        })), [gameSystem.races, assetMap]);

    // Capacités raciales : désormais embarquées dans RaceDefinition.abilities (converties par le seed
    // depuis capacites.json) — reconstruites au format {capacite1: 'Label : texte'} attendu par le rendu.
    const capabilities: Record<string, Capability> = useMemo(() => {
        const caps: Record<string, Capability> = {};
        for (const r of gameSystem.races ?? []) {
            if (!r.abilities || r.abilities.length === 0) continue;
            const entry: Capability = {};
            r.abilities.forEach((a, i) => {
                entry[`capacite${i + 1}`] = a.description ? `${a.label} : ${a.description}` : a.label;
            });
            caps[r.label || r.id] = entry;
        }
        return caps;
    }, [gameSystem.races]);

    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(0);
    const bookRef = useRef<any>(null);

    // Mobile: selected item shown in a detail modal
    const [mobileDetail, setMobileDetail] = useState<{ type: TabType; data: any } | null>(null);

    // Bestiaire du SYSTÈME ACTIF (Firestore, kind 'bestiary' — seedé pour dnd-classic, propre à
    // chaque système custom) — plus de bestiairy.json statique.
    const { docs: bestiaryChunks, isLoading: bestiaryLoading } = useGameContent<BestiaryChunkDoc & { id: string }>('bestiary');

    useEffect(() => {
        const fetchMappings = async () => {
            try {
                const mappingsResponse = await fetch('/asset-mappings.json').then(res => res.json()).catch(() => []);
                const map = new Map<string, string>();
                if (Array.isArray(mappingsResponse)) {
                    mappingsResponse.forEach((m: any) => {
                        if (m.localPath && m.path) {
                            map.set(m.localPath, m.path);
                        }
                    });
                }
                setAssetMap(map);
            } catch (err) {
                console.error("Failed to load asset mappings", err);
            }
        };
        fetchMappings();
    }, []);

    useEffect(() => {
        const resolved: Monster[] = [];
        for (const chunk of bestiaryChunks) {
            for (const [id, val] of Object.entries(chunk.entries ?? {})) {
                const m = val as unknown as Omit<Monster, 'id'>;
                resolved.push({
                    id,
                    ...m,
                    image: !m.image ? "/placeholder.png" : m.image.startsWith('http') ? m.image : (assetMap.get(m.image) || m.image),
                });
            }
        }
        resolved.sort((a, b) => (a.Nom ?? '').localeCompare(b.Nom ?? ''));
        setMonsters(resolved);
    }, [bestiaryChunks, assetMap]);

    const loading = bestiaryLoading;

    // N'affiche un onglet que si le système actif a du contenu pour lui — une salle Star Wars sans
    // bestiaire ni voies configurées ne doit montrer QUE l'onglet Races (le seul renseigné), jamais un
    // onglet Bestiaire/Classes vide hérité d'un autre système.
    const availableTabs = useMemo(() => {
        const tabs: TabType[] = [];
        if (monsters.length > 0) tabs.push('bestiaire');
        if (profiles.length > 0) tabs.push('classes');
        if (races.length > 0) tabs.push('races');
        return tabs;
    }, [monsters.length, profiles.length, races.length]);

    useEffect(() => {
        if (availableTabs.length === 0) return;
        if (!availableTabs.includes(activeTab)) setActiveTab(availableTabs[0]);
    }, [availableTabs, activeTab]);

    const categoryTranslation: Record<string, string> = {
        "aberration": "Aberration",
        "beast": "Bête",
        "celestial": "Céleste",
        "construct": "Créature artificielle",
        "dragon": "Dragon",
        "elemental": "Élémentaire",
        "fey": "Fée",
        "fiend": "Fielon",
        "giant": "Géant",
        "humanoid": "Humanoïde",
        "monstrosity": "Monstruosité",
        "ooze": "Vase",
        "plant": "Plante",
        "undead": "Mort-vivant",
        "swarm of tiny beasts": "Nuée de bêtes",
    };

    const categories = useMemo(() => {
        if (activeTab !== 'bestiaire') return [];
        const cats = new Set(monsters.map(m => m.Category?.toLowerCase()).filter(Boolean));
        return Array.from(cats).sort();
    }, [monsters, activeTab]);

    const filteredMonsters = useMemo(() => {
        return monsters.filter(m => {
            const matchSearch = m.Nom.toLowerCase().includes(search.toLowerCase());
            const matchCat = selectedCategory ? m.Category?.toLowerCase() === selectedCategory : true;
            return matchSearch && matchCat;
        });
    }, [monsters, search, selectedCategory]);

    const filteredProfiles = useMemo(() => {
        return profiles.filter(p => p.id.toLowerCase().includes(search.toLowerCase()));
    }, [profiles, search]);

    const filteredRaces = useMemo(() => {
        return races.filter(r => r.id.toLowerCase().includes(search.toLowerCase()));
    }, [races, search]);

    useEffect(() => {
        setCurrentPage(0);
        setSearch("");
        setSelectedCategory(null);
        if (bookRef.current && bookRef.current.pageFlip()) {
            try {
                bookRef.current.pageFlip().turnToPage(0);
            } catch (e) { }
        }
    }, [activeTab]);

    useEffect(() => {
        setCurrentPage(0);
        if (bookRef.current && bookRef.current.pageFlip()) {
            try {
                bookRef.current.pageFlip().turnToPage(0);
            } catch (e) {
                // Ignore errors during re-render flip
            }
        }
    }, [search, selectedCategory]);

    const nextPage = () => {
        if (bookRef.current) {
            bookRef.current.pageFlip().flipNext();
        }
    };

    const prevPage = () => {
        if (bookRef.current) {
            bookRef.current.pageFlip().flipPrev();
        }
    };

    const onFlip = (e: any) => {
        setCurrentPage(e.data);
    };

    // --- Mobile card renderers (vertical scrollable list instead of the flipbook) ---
    const MobileImage = ({ src, alt }: { src?: string; alt: string }) => (
        src && src !== "/placeholder.png" ? (
            <div className="relative w-full h-44 rounded-lg overflow-hidden mb-3 bg-amber-900/10">
                <img src={src} alt={alt} loading="lazy" className="w-full h-full object-contain mix-blend-multiply" />
            </div>
        ) : null
    );

    const MobileStat = ({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) => (
        <div className="text-center">
            <span className="block text-[10px] font-bold text-amber-900 uppercase">{label}</span>
            <span className="text-base font-bold text-amber-950 flex items-center justify-center gap-1">{icon}{value}</span>
        </div>
    );

    // Compact thumbnail (image + name) — opens the detail modal on tap
    const MobileThumb = ({ type, data, name, image }: { type: TabType; data: any; name: string; image?: string }) => (
        <button
            type="button"
            onClick={() => setMobileDetail({ type, data })}
            className="group flex flex-col rounded-xl overflow-hidden border border-[#c0a080]/20 bg-black/40 active:scale-[0.98] transition-transform text-left"
        >
            <div className="relative w-full aspect-square bg-amber-900/10 overflow-hidden">
                {image && image !== "/placeholder.png" ? (
                    <img src={image} alt={name} loading="lazy" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-[#c0a080]/40" />
                    </div>
                )}
            </div>
            <div className="px-2 py-2">
                <span className="block text-sm font-bold text-[#c0a080] font-papyrus leading-tight line-clamp-2">{name}</span>
            </div>
        </button>
    );

    const renderMobileGrid = () => {
        if (activeTab === 'bestiaire') {
            return filteredMonsters.map(m => <MobileThumb key={m.id} type="bestiaire" data={m} name={m.Nom} image={m.image} />);
        }
        if (activeTab === 'classes') {
            return filteredProfiles.map(p => <MobileThumb key={p.id} type="classes" data={p} name={p.id} image={p.image} />);
        }
        return filteredRaces.map(r => <MobileThumb key={r.id} type="races" data={r} name={r.id} image={r.image} />);
    };

    // Full detail content for the mobile modal
    const renderMobileDetail = () => {
        if (!mobileDetail) return null;
        const { type, data } = mobileDetail;
        if (type === 'bestiaire') {
            const monster = data as Monster;
            return (
                <div className="bestiary-page rounded-xl p-4">
                    <h2 className="text-2xl font-serif font-bold text-amber-950 border-b-2 border-amber-900/30 pb-2 mb-2">{monster.Nom}</h2>
                    <div className="text-amber-800/80 italic font-serif flex justify-between text-sm mb-3">
                        <span>{monster.Type}</span>
                        {monster.Challenge && <span>FP {monster.Challenge}</span>}
                    </div>
                    <MobileImage src={monster.image} alt={monster.Nom} />
                    <p className="text-amber-950 leading-relaxed font-serif text-justify text-sm mb-4">{monster.description || "Une créature mystérieuse."}</p>
                    <div className="border-t border-b border-amber-900/30 py-3 mb-4 flex justify-around bg-amber-900/5">
                        <MobileStat label="Défense" value={monster.Defense || 10} icon={<Shield className="w-4 h-4 text-amber-800" />} />
                        <div className="w-px h-8 bg-amber-900/20" />
                        <MobileStat label="PV" value={monster.PV_Max || 10} icon={<Heart className="w-4 h-4 text-red-800" />} />
                    </div>
                    <div className="grid grid-cols-6 gap-1 mb-3 text-center">
                        {[{ l: 'FOR', v: monster.FOR }, { l: 'DEX', v: monster.DEX }, { l: 'CON', v: monster.CON }, { l: 'INT', v: monster.INT }, { l: 'SAG', v: monster.SAG }, { l: 'CHA', v: monster.CHA }].map(s => (
                            <div key={s.l}>
                                <div className="text-[10px] font-bold text-amber-900">{s.l}</div>
                                <div className="text-sm text-amber-950 font-serif">{s.v || 10}</div>
                            </div>
                        ))}
                    </div>
                    {monster.Actions && monster.Actions.length > 0 && (
                        <div>
                            <h3 className="font-serif font-bold text-lg text-amber-900 border-b border-amber-900/20 pb-1 mb-2">Actions</h3>
                            <div className="space-y-2">
                                {monster.Actions.map((action, idx) => (
                                    <div key={idx} className="text-sm font-serif">
                                        <span className="font-bold text-amber-950 italic">{action.Nom}.</span>{" "}
                                        <span className="text-amber-900">{action.Description}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            );
        }
        if (type === 'classes') {
            const profile = data as Profile;
            return (
                <div className="bestiary-page rounded-xl p-4">
                    <h2 className="text-2xl font-serif font-bold text-amber-950 border-b-2 border-amber-900/30 pb-2 mb-3">{profile.id}</h2>
                    <MobileImage src={profile.image} alt={profile.id} />
                    <p className="text-amber-950 leading-relaxed font-serif text-justify text-sm mb-4">{profile.description || "Une classe légendaire."}</p>
                    <div className="border-t border-b border-amber-900/30 py-3 flex justify-around bg-amber-900/5">
                        <MobileStat label="Dé de Vie" value={profile.hitDie} icon={<Heart className="w-4 h-4 text-red-800" />} />
                    </div>
                </div>
            );
        }
        const race = data as Race;
        const caps = capabilities[race.id];
        return (
            <div className="bestiary-page rounded-xl p-4">
                <h2 className="text-2xl font-serif font-bold text-amber-950 border-b-2 border-amber-900/30 pb-2 mb-3">{race.id}</h2>
                <MobileImage src={race.image} alt={race.id} />
                <p className="text-amber-950 leading-relaxed font-serif text-justify text-sm mb-4">{race.description || "Une race ancestrale."}</p>
                {race.modificateurs && Object.keys(race.modificateurs).length > 0 && (
                    <div className="border-t border-b border-amber-900/30 py-3 mb-4 bg-amber-900/5">
                        <span className="block text-[10px] font-bold text-amber-900 uppercase text-center mb-2">Modificateurs</span>
                        <div className="flex justify-center flex-wrap gap-3">
                            {Object.entries(race.modificateurs).map(([stat, val]) => (
                                <div key={stat} className="text-center">
                                    <span className="text-xs font-bold text-amber-900 mr-1">{stat}</span>
                                    <span className={`text-base font-bold font-serif ${val > 0 ? 'text-green-800' : 'text-red-800'}`}>{val > 0 ? '+' : ''}{val}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {caps && Object.keys(caps).length > 0 && (
                    <div>
                        <h3 className="font-serif font-bold text-lg text-amber-900 border-b border-amber-900/20 pb-1 mb-2">Capacités raciales</h3>
                        <div className="space-y-2">
                            {Object.entries(caps).map(([key, value]) => (
                                <div key={key} className="text-sm font-serif">
                                    <span className="font-bold text-amber-950 italic">{key}.</span>{" "}
                                    <span className="text-amber-900">{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-800"></div>
            </div>
        );
    }

    if (availableTabs.length === 0) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-amber-900/50 gap-3">
                <Sparkles className="w-12 h-12" />
                <p className="text-lg font-serif text-center px-6">Aucun contenu (bestiaire, classes, races) n&apos;est encore configuré pour ce système de règles.</p>
            </div>
        );
    }

    return (
        <div className="h-full w-full flex flex-col overflow-hidden relative p-4 md:p-8">
            <style dangerouslySetInnerHTML={{ __html: flipbookStyles }} />

            {/* Top Minimal Controls */}
            <div className="relative z-20 pb-4 md:pb-8 shrink-0 w-full max-w-5xl mx-auto flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-6">
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 gap-1 shrink-0 overflow-x-auto no-scrollbar">
                    {availableTabs.includes('bestiaire') && (
                        <button
                            onClick={() => setActiveTab('bestiaire')}
                            className={cn(
                                "flex items-center gap-2 px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-bold uppercase tracking-wider whitespace-nowrap transition-all",
                                activeTab === 'bestiaire'
                                    ? "bg-[#c0a080] text-[#1c1c1c] shadow-lg shadow-[#c0a080]/20"
                                    : "text-[#c0a080]/60 hover:text-[#c0a080] hover:bg-white/5"
                            )}
                        >
                            <Skull className="w-4 h-4" />
                            Bestiaire
                        </button>
                    )}
                    {availableTabs.includes('classes') && (
                        <button
                            onClick={() => setActiveTab('classes')}
                            className={cn(
                                "flex items-center gap-2 px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-bold uppercase tracking-wider whitespace-nowrap transition-all",
                                activeTab === 'classes'
                                    ? "bg-[#c0a080] text-[#1c1c1c] shadow-lg shadow-[#c0a080]/20"
                                    : "text-[#c0a080]/60 hover:text-[#c0a080] hover:bg-white/5"
                            )}
                        >
                            <BookOpen className="w-4 h-4" />
                            Classes
                        </button>
                    )}
                    {availableTabs.includes('races') && (
                        <button
                            onClick={() => setActiveTab('races')}
                            className={cn(
                                "flex items-center gap-2 px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-bold uppercase tracking-wider whitespace-nowrap transition-all",
                                activeTab === 'races'
                                    ? "bg-[#c0a080] text-[#1c1c1c] shadow-lg shadow-[#c0a080]/20"
                                    : "text-[#c0a080]/60 hover:text-[#c0a080] hover:bg-white/5"
                            )}
                        >
                            <Scroll className="w-4 h-4" />
                            Races
                        </button>
                    )}
                </div>

                {/* Search Bar & Filters Layout */}
                <div className="flex-1 w-full flex flex-col sm:flex-row gap-2 sm:gap-4">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#c0a080]/40 group-focus-within:text-[#c0a080] w-4 h-4 transition-colors" />
                        <input
                            type="text"
                            placeholder={activeTab === 'bestiaire' ? "Rechercher une créature..." : activeTab === 'classes' ? "Chercher une classe..." : "Chercher une race..."}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-black/60 border border-[#c0a080]/20 rounded-xl pl-12 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#c0a080]/50 focus:ring-1 focus:ring-[#c0a080]/20 transition-all font-papyrus"
                        />
                    </div>

                    {activeTab === 'bestiaire' && categories.length > 0 && (
                        <Select
                            value={selectedCategory || "all"}
                            onValueChange={(val) => setSelectedCategory(val === "all" ? null : val)}
                        >
                            <SelectTrigger className="w-full sm:w-48 bg-black/60 border-[#c0a080]/20 rounded-xl text-white font-papyrus">
                                <SelectValue placeholder="Tous les types" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white font-papyrus">
                                <SelectGroup>
                                    <SelectItem value="all">Tous les types</SelectItem>
                                    {categories.map(cat => (
                                        <SelectItem key={cat} value={cat} className="capitalize">
                                            {categoryTranslation[cat] || cat}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            {/* Mobile: compact grid of thumbnails (tap to open details). Flipbook is desktop-only. */}
            <div className="lg:hidden flex-1 w-full overflow-y-auto styled-scrollbar px-2 pb-8">
                {(() => {
                    const len = activeTab === 'bestiaire' ? filteredMonsters.length : activeTab === 'classes' ? filteredProfiles.length : filteredRaces.length;
                    return len > 0 ? (
                        <div className="grid grid-cols-3 xs:grid-cols-3 gap-2">
                            {renderMobileGrid()}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-amber-900/50 pt-20">
                            <Sparkles className="w-12 h-12 mb-3" />
                            <p className="text-lg font-serif text-center px-6">Aucun résultat ne correspond à votre recherche...</p>
                        </div>
                    );
                })()}
            </div>

            {/* Mobile detail modal */}
            {mobileDetail && (
                <div className="lg:hidden fixed inset-0 z-[300] flex items-end sm:items-center justify-center" onClick={() => setMobileDetail(null)}>
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                    <div
                        className="relative w-full sm:max-w-lg max-h-[88vh] overflow-y-auto styled-scrollbar rounded-t-2xl sm:rounded-2xl"
                        onClick={(e) => e.stopPropagation()}
                        style={{ touchAction: 'pan-y' }}
                    >
                        <button
                            onClick={() => setMobileDetail(null)}
                            className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center text-lg"
                            aria-label="Fermer"
                        >
                            ✕
                        </button>
                        {renderMobileDetail()}
                    </div>
                </div>
            )}

            {/* Book Container (desktop only) */}
            <div className="hidden lg:flex flex-1 w-full relative z-10 items-start justify-center px-2 sm:px-4 md:px-16 pt-6 sm:pt-12 pb-0">
                {/* Navigation Arrows */}
                <Button
                    variant="ghost"
                    className="absolute left-0 sm:left-4 md:left-12 top-1/2 -translate-y-1/2 text-[var(--accent-brown)] hover:text-[var(--accent-brown-hover)] hover:bg-[var(--bg-dark)] h-12 w-12 sm:h-16 sm:w-16 rounded-full z-30"
                    onClick={prevPage}
                >
                    <ChevronLeft className="w-7 h-7 sm:w-10 sm:h-10" />
                </Button>
                <Button
                    variant="ghost"
                    className="absolute right-0 sm:right-4 md:right-12 top-1/2 -translate-y-1/2 text-[var(--accent-brown)] hover:text-[var(--accent-brown-hover)] hover:bg-[var(--bg-dark)] h-12 w-12 sm:h-16 sm:w-16 rounded-full z-30"
                    onClick={nextPage}
                >
                    <ChevronRight className="w-7 h-7 sm:w-10 sm:h-10" />
                </Button>
                
                {(() => {
                    const currentItemsLength = activeTab === 'bestiaire'
                        ? filteredMonsters.length
                        : activeTab === 'classes'
                            ? filteredProfiles.length
                            : filteredRaces.length;

                    return currentItemsLength > 0 ? (
                        <div className="w-full h-full flex items-start justify-center max-w-[1200px]">
                            {/* We use a key based on the filter results to force React to completely remount HTMLFlipBook 
                                when the length/content changes. This prevents the "removeChild" DOM sync errors. */}
                            <HTMLFlipBook
                                key={`flipbook-${activeTab}-${activeTab === 'bestiaire' ? filteredMonsters.length :
                                    activeTab === 'classes' ? filteredProfiles.length :
                                        filteredRaces.length
                                    }-${search}-${selectedCategory}`}
                                width={550}
                                height={850}
                                size="stretch"
                                minWidth={300}
                                maxWidth={600}
                                minHeight={400}
                                maxHeight={1000}
                                maxShadowOpacity={0.8}
                                showCover={false}
                                mobileScrollSupport={true}
                                onFlip={onFlip}
                                className="drop-shadow-2xl"
                                style={{ margin: "0 auto" }}
                                startPage={0}
                                drawShadow={true}
                                flippingTime={1200}
                                usePortrait={true}
                                startZIndex={0}
                                autoSize={true}
                                clickEventForward={true}
                                useMouseEvents={true}
                                swipeDistance={30}
                                showPageCorners={true}
                                disableFlipByClick={false}
                                ref={bookRef}
                            >
                                {(() => {
                                    const pages = [];

                                    let currentItems: any[] = [];
                                    if (activeTab === 'bestiaire') currentItems = filteredMonsters;
                                    if (activeTab === 'classes') currentItems = filteredProfiles;
                                    if (activeTab === 'races') currentItems = filteredRaces;

                                    // Pages 1 to N
                                    currentItems.forEach((item, index) => {
                                        const actualPageNum = index + 1;
                                        const isLeft = actualPageNum % 2 !== 0;
                                        const commonClasses = `bestiary-page h-full w-full ${isLeft ? 'left-page' : 'right-page'}`;

                                        if (activeTab === 'bestiaire') {
                                            const monster = item as Monster;
                                            pages.push(
                                                <div key={monster.id} className={commonClasses}>
                                                    <div className="absolute inset-x-8 top-8 bottom-16 flex flex-col">
                                                        {/* Header */}
                                                        <div className="mb-4 shrink-0">
                                                            <h2 className="text-4xl font-serif font-bold text-amber-950 border-b-2 border-amber-900/30 pb-2">
                                                                {monster.Nom}
                                                            </h2>
                                                            <div className="text-amber-800/80 italic font-serif flex justify-between mt-1">
                                                                <span>{monster.Type}</span>
                                                                {monster.Challenge && <span>FP {monster.Challenge}</span>}
                                                            </div>
                                                        </div>

                                                        <div className="flex-1 min-h-0 overflow-y-auto styled-scrollbar pr-2 pb-2">
                                                        <div className="clearfix">
                                                            {monster.image && monster.image !== "/placeholder.png" && (
                                                                <div className={`float-${isLeft ? 'right ml-6' : 'left mr-6'} mb-4 relative w-[200px] h-[200px]`}>
                                                                    <div className="absolute inset-0 bg-amber-900/10 transform rotate-2 rounded transition-transform mix-blend-multiply" />
                                                                    <img
                                                                        src={monster.image}
                                                                        alt={monster.Nom}
                                                                        loading="lazy"
                                                                        className="relative object-contain w-full h-full mix-blend-multiply filter contrast-125 sepia-[0.3]"
                                                                    />
                                                                </div>
                                                            )}
                                                            <p className="text-amber-950 leading-relaxed font-serif text-justify first-letter:text-5xl first-letter:font-bold first-letter:text-amber-900 first-letter:float-left first-letter:mr-2">
                                                                {monster.description || "Une créature mystérieuse."}
                                                            </p>
                                                        </div>

                                                        <div className="mt-6 border-t border-b border-amber-900/30 py-3 mb-4 flex justify-around bg-amber-900/5 items-center">
                                                            <div className="text-center">
                                                                <span className="block text-xs font-bold text-amber-900 uppercase">Classe d'Armure</span>
                                                                <span className="text-xl font-bold text-amber-950 flex items-center justify-center gap-1">
                                                                    <Shield className="w-4 h-4 text-amber-800" /> {monster.Defense || 10}
                                                                </span>
                                                            </div>
                                                            <div className="w-px h-8 bg-amber-900/20" />
                                                            <div className="text-center">
                                                                <span className="block text-xs font-bold text-amber-900 uppercase">Points de Vie</span>
                                                                <span className="text-xl font-bold text-amber-950 flex items-center justify-center gap-1">
                                                                    <Heart className="w-4 h-4 text-red-800" /> {monster.PV_Max || 10}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-6 gap-1 mb-6 text-center">
                                                            {[
                                                                { label: 'FOR', value: monster.FOR }, { label: 'DEX', value: monster.DEX },
                                                                { label: 'CON', value: monster.CON }, { label: 'INT', value: monster.INT },
                                                                { label: 'SAG', value: monster.SAG }, { label: 'CHA', value: monster.CHA },
                                                            ].map(stat => (
                                                                <div key={stat.label}>
                                                                    <div className="text-xs font-bold text-amber-900">{stat.label}</div>
                                                                    <div className="text-sm text-amber-950 font-serif">{stat.value || 10}</div>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {monster.Actions && monster.Actions.length > 0 && (
                                                            <div>
                                                                <h3 className="font-serif font-bold text-xl text-amber-900 border-b border-amber-900/20 pb-1 mb-3">
                                                                    Actions
                                                                </h3>
                                                                <div className="space-y-4">
                                                                    {monster.Actions.map((action, idx) => (
                                                                        <div key={idx} className="text-sm font-serif">
                                                                            <span className="font-bold text-amber-950 italic">{action.Nom}.</span>{" "}
                                                                            <span className="text-amber-900">{action.Description}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    </div>
                                                    <div className="page-number">{actualPageNum}</div>
                                                </div>
                                            );
                                        } else if (activeTab === 'classes') {
                                            const profile = item as Profile;
                                            pages.push(
                                                <div key={profile.id} className={commonClasses}>
                                                    <div className="absolute inset-x-8 top-8 bottom-16 flex flex-col">
                                                        <h2 className="text-4xl font-serif font-bold text-amber-950 mb-6 border-b-2 border-amber-900/30 pb-2 shrink-0">
                                                            {profile.id}
                                                        </h2>
                                                        <div className="flex-1 min-h-0 overflow-y-auto styled-scrollbar pr-2 pb-2">
                                                        <div className="clearfix">
                                                            {profile.image && profile.image !== "/placeholder.png" && (
                                                                <div className={`float-${isLeft ? 'right ml-6' : 'left mr-6'} mb-4 relative w-[200px] h-[200px]`}>
                                                                    <div className="absolute inset-0 bg-amber-900/10 transform rotate-2 rounded transition-transform mix-blend-multiply" />
                                                                    <img
                                                                        src={profile.image}
                                                                        alt={profile.id}
                                                                        loading="lazy"
                                                                        className="relative object-contain w-full h-full mix-blend-multiply filter contrast-125 sepia-[0.3]"
                                                                    />
                                                                </div>
                                                            )}
                                                            <p className="text-amber-950 leading-relaxed font-serif text-justify first-letter:text-5xl first-letter:font-bold first-letter:text-amber-900 first-letter:float-left first-letter:mr-2">
                                                                {profile.description || "Une classe légendaire."}
                                                            </p>
                                                        </div>

                                                        <div className="mt-6 border-t border-b border-amber-900/30 py-3 mb-4 flex justify-around bg-amber-900/5 items-center">
                                                            <div className="text-center">
                                                                <span className="block text-xs font-bold text-amber-900 uppercase">Dé de Vie</span>
                                                                <span className="text-xl font-bold text-amber-950 flex items-center justify-center gap-1">
                                                                    <Heart className="w-4 h-4 text-red-800" /> {profile.hitDie}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    </div>
                                                    <div className="page-number">{actualPageNum}</div>
                                                </div>
                                            );
                                        } else if (activeTab === 'races') {
                                            const race = item as Race;
                                            const caps = capabilities[race.id];
                                            pages.push(
                                                <div key={race.id} className={commonClasses}>
                                                    <div className="absolute inset-x-8 top-8 bottom-16 flex flex-col">
                                                        <h2 className="text-4xl font-serif font-bold text-amber-950 mb-4 border-b-2 border-amber-900/30 pb-2 shrink-0">
                                                            {race.id}
                                                        </h2>
                                                        <div className="flex-1 min-h-0 overflow-y-auto styled-scrollbar pr-2 pb-2">
                                                        <div className="clearfix">
                                                            {race.image && race.image !== "/placeholder.png" && (
                                                                <div className={`float-${isLeft ? 'right ml-6' : 'left mr-6'} mb-4 relative w-[200px] h-[200px]`}>
                                                                    <div className="absolute inset-0 bg-amber-900/10 transform rotate-2 rounded transition-transform mix-blend-multiply" />
                                                                    <img
                                                                        src={race.image}
                                                                        alt={race.id}
                                                                        loading="lazy"
                                                                        className="relative object-contain w-full h-full mix-blend-multiply filter contrast-125 sepia-[0.3]"
                                                                    />
                                                                </div>
                                                            )}
                                                            <p className="text-amber-950 leading-relaxed font-serif text-justify first-letter:text-5xl first-letter:font-bold first-letter:text-amber-900 first-letter:float-left first-letter:mr-2">
                                                                {race.description || "Une race ancestrale."}
                                                            </p>
                                                        </div>

                                                        {race.modificateurs && Object.keys(race.modificateurs).length > 0 && (
                                                            <div className="mt-6 border-t border-b border-amber-900/30 py-3 mb-4 flex justify-around bg-amber-900/5 items-center">
                                                                <div className="w-full">
                                                                    <span className="block text-xs font-bold text-amber-900 uppercase text-center mb-2">Modificateurs</span>
                                                                    <div className="flex justify-center gap-4">
                                                                        {Object.entries(race.modificateurs).map(([stat, val]) => (
                                                                            <div key={stat} className="text-center">
                                                                                <span className="text-xs font-bold text-amber-900 mr-1">{stat}</span>
                                                                                <span className={`text-xl font-bold font-serif ${val > 0 ? 'text-green-800' : 'text-red-800'}`}>
                                                                                    {val > 0 ? '+' : ''}{val}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {caps && Object.keys(caps).length > 0 && (
                                                            <div className="mt-4">
                                                                <h3 className="font-serif font-bold text-xl text-amber-900 border-b border-amber-900/20 pb-1 mb-3">
                                                                    Capacités raciales
                                                                </h3>
                                                                <div className="space-y-4">
                                                                    {Object.entries(caps).map(([key, value]) => (
                                                                        <div key={key} className="text-sm font-serif">
                                                                            <span className="font-bold text-amber-950 italic">{key}.</span>{" "}
                                                                            <span className="text-amber-900">{value}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    </div>
                                                    <div className="page-number">{actualPageNum}</div>
                                                </div>
                                            );
                                        }
                                    });

                                    // Padding Page for Even Total Pages
                                    if (currentItems.length % 2 !== 0) {
                                        pages.push(
                                            <div key="padding-page" className="bestiary-page right-page h-full w-full opacity-50 flex items-center justify-center">
                                                <div className="page-number">{currentItems.length + 1}</div>
                                            </div>
                                        );
                                    }

                                    return pages;
                                })()}
                            </HTMLFlipBook>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-amber-900/50 pt-20">
                            <Sparkles className="w-16 h-16 mb-4" />
                            <p className="text-xl font-serif">Aucun résultat ne correspond à votre recherche...</p>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}

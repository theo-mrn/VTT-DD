"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Shield, Heart, Skull, Sword, Sparkles, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { Button } from "@/components/ui/button";
import HTMLFlipBook from "react-pageflip";

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
    const [activeTab, setActiveTab] = useState<TabType>('bestiaire');

    const [monsters, setMonsters] = useState<Monster[]>([]);
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [races, setRaces] = useState<Race[]>([]);
    const [capabilities, setCapabilities] = useState<Record<string, Capability>>({});

    const [search, setSearch] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState<number>(0);
    const bookRef = useRef<any>(null);

    useEffect(() => {
        Promise.all([
            fetch('/tabs/bestiairy.json').then(res => res.json()),
            fetch('/tabs/profile.json').then(res => res.json()),
            fetch('/tabs/race.json').then(res => res.json()),
            fetch('/tabs/capacites.json').then(res => res.json())
        ])
            .then(([bestiaryData, profileData, raceData, capsData]) => {
                setMonsters(Object.entries(bestiaryData as Record<string, Omit<Monster, 'id'>>).map(([id, val]) => ({ id, ...val })));
                setProfiles(Object.entries(profileData as Record<string, Omit<Profile, 'id'>>).map(([id, val]) => ({ id, ...val })));
                setRaces(Object.entries(raceData as Record<string, Omit<Race, 'id'>>).map(([id, val]) => ({ id, ...val })));
                setCapabilities(capsData);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load glossary data", err);
                setLoading(false);
            });
    }, []);

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

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-800"></div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-[var(--bg-canvas)] flex flex-col overflow-hidden relative">
            <style dangerouslySetInnerHTML={{ __html: flipbookStyles }} />

            {/* Top Header Controls */}
            <div className="relative z-20 pt-8 pb-4 px-8 w-full max-w-7xl mx-auto flex flex-col items-center gap-6">
                <div className="flex gap-4 max-w-4xl justify-center w-full">
                    <button
                        onClick={() => setActiveTab('bestiaire')}
                        className={activeTab === 'bestiaire' ? 'button-primary' : 'button-cancel'}
                    >
                        Bestiaire
                    </button>
                    <button
                        onClick={() => setActiveTab('classes')}
                        className={activeTab === 'classes' ? 'button-primary' : 'button-cancel'}
                    >
                        Classes
                    </button>
                    <button
                        onClick={() => setActiveTab('races')}
                        className={activeTab === 'races' ? 'button-primary' : 'button-cancel'}
                    >
                        Races
                    </button>
                </div>

                {/* Search Bar & Filters Layout */}
                <div className="w-full max-w-3xl mx-auto flex gap-4">
                    <div className="relative w-full flex items-center">
                        <Search className="absolute left-3 text-[var(--text-secondary)] w-5 h-5 pointer-events-none" />
                        <input
                            type="text"
                            placeholder={activeTab === 'bestiaire' ? "Rechercher dans le bestiaire..." : activeTab === 'classes' ? "Chercher une classe..." : "Chercher une race..."}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="input-field !pl-10 h-12"
                        />
                    </div>

                    {/* Dropdown for Bestiary Categories */}
                    {activeTab === 'bestiaire' && categories.length > 0 && (
                        <div className="relative w-1/3">
                            <select
                                value={selectedCategory || ''}
                                onChange={(e) => setSelectedCategory(e.target.value === '' ? null : e.target.value)}
                                className="input-field appearance-none !pr-8 cursor-pointer capitalize h-12"
                            >
                                <option value="">Tous les types</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>
                                        {categoryTranslation[cat] || cat}
                                    </option>
                                ))}
                            </select>
                            <div className="absolute top-1/2 right-3 -translate-y-1/2 pointer-events-none">
                                <ChevronRight className="w-4 h-4 text-[var(--text-secondary)] rotate-90" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Book Container */}
            <div className="flex-1 w-full relative z-10 flex items-center justify-center px-4 md:px-16 pb-12">
                {/* Navigation Arrows */}
                <Button
                    variant="ghost"
                    className="absolute left-4 md:left-12 top-1/2 -translate-y-1/2 text-[var(--accent-brown)] hover:text-[var(--accent-brown-hover)] hover:bg-[var(--bg-dark)] h-16 w-16 rounded-full z-30"
                    onClick={prevPage}
                >
                    <ChevronLeft className="w-10 h-10" />
                </Button>
                <Button
                    variant="ghost"
                    className="absolute right-4 md:right-12 top-1/2 -translate-y-1/2 text-[var(--accent-brown)] hover:text-[var(--accent-brown-hover)] hover:bg-[var(--bg-dark)] h-16 w-16 rounded-full z-30"
                    onClick={nextPage}
                >
                    <ChevronRight className="w-10 h-10" />
                </Button>

                {(() => {
                    const currentItemsLength = activeTab === 'bestiaire'
                        ? filteredMonsters.length
                        : activeTab === 'classes'
                            ? filteredProfiles.length
                            : filteredRaces.length;

                    return currentItemsLength > 0 ? (
                        <div className="w-full h-full flex items-center justify-center max-w-[1200px]">
                            {/* We use a key based on the filter results to force React to completely remount HTMLFlipBook 
                                when the length/content changes. This prevents the "removeChild" DOM sync errors. */}
                            <HTMLFlipBook
                                key={`flipbook-${activeTab}-${activeTab === 'bestiaire' ? filteredMonsters.length :
                                    activeTab === 'classes' ? filteredProfiles.length :
                                        filteredRaces.length
                                    }-${search}-${selectedCategory}`}
                                width={550}
                                height={750}
                                size="stretch"
                                minWidth={300}
                                maxWidth={600}
                                minHeight={400}
                                maxHeight={800}
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
                                        const commonClasses = `bestiary-page h-full w-full flex flex-col p-8 ${isLeft ? 'left-page' : 'right-page'}`;

                                        if (activeTab === 'bestiaire') {
                                            const monster = item as Monster;
                                            pages.push(
                                                <div key={monster.id} className={commonClasses}>
                                                    {/* Header */}
                                                    <div className="mb-4">
                                                        <h2 className="text-4xl font-serif font-bold text-amber-950 border-b-2 border-amber-900/30 pb-2">
                                                            {monster.Nom}
                                                        </h2>
                                                        <div className="text-amber-800/80 italic font-serif flex justify-between mt-1">
                                                            <span>{monster.Type}</span>
                                                            {monster.Challenge && <span>FP {monster.Challenge}</span>}
                                                        </div>
                                                    </div>

                                                    <div className="flex-grow overflow-y-auto styled-scrollbar pr-2 pb-8">
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
                                                    <div className="page-number">{actualPageNum}</div>
                                                </div>
                                            );
                                        } else if (activeTab === 'classes') {
                                            const profile = item as Profile;
                                            pages.push(
                                                <div key={profile.id} className={commonClasses}>
                                                    <h2 className="text-4xl font-serif font-bold text-amber-950 mb-6 border-b-2 border-amber-900/30 pb-2">
                                                        {profile.id}
                                                    </h2>
                                                    <div className="flex-grow overflow-y-auto styled-scrollbar pr-2 pb-8">
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
                                                    <div className="page-number">{actualPageNum}</div>
                                                </div>
                                            );
                                        } else if (activeTab === 'races') {
                                            const race = item as Race;
                                            const caps = capabilities[race.id];
                                            pages.push(
                                                <div key={race.id} className={commonClasses}>
                                                    <h2 className="text-4xl font-serif font-bold text-amber-950 mb-4 border-b-2 border-amber-900/30 pb-2">
                                                        {race.id}
                                                    </h2>
                                                    <div className="flex-grow overflow-y-auto styled-scrollbar pr-2 pb-8">
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

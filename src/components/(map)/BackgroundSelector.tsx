"use client";

import React, { useState, useEffect } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Upload, X, Film, Image as ImageIcon, Palette, Loader2 } from 'lucide-react';
import { cn } from "@/lib/utils";

interface MapFile {
    name: string;
    path: string;
    category: string;
    type: 'image' | 'video';
}

interface BackgroundSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectLocal: (path: string) => void;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

type MediaType = 'animated' | 'static' | 'illustration';

export default function BackgroundSelector({
    isOpen,
    onClose,
    onSelectLocal,
    onUpload
}: BackgroundSelectorProps) {
    const [maps, setMaps] = useState<MapFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [activeMediaType, setActiveMediaType] = useState<MediaType>('static');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchMaps();
        }
    }, [isOpen]);

    const fetchMaps = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/maps');
            const data = await response.json();
            setMaps(data.maps || []);
        } catch (error) {
            console.error('Error fetching maps:', error);
        } finally {
            setLoading(false);
        }
    };

    // Get all unique main categories
    // - Everything from /Cartes -> "Autres"
    // - Everything from /Map -> actual subcategory (Camps, Lake, etc.)
    const getAllCategories = () => {
        const categoryMap = new Map<string, number>();
        maps.forEach(map => {
            const parts = map.category.split('/');
            let categoryName: string;

            if (parts[0] === 'Cartes') {
                // Everything from Cartes goes to "Autres"
                categoryName = 'Autres';
            } else if (parts[0] === 'Map' && parts[1]) {
                // From Map, use the subcategory (Camps, Lake, etc.)
                categoryName = parts[1];
            } else {
                // Fallback
                categoryName = parts[parts.length - 1] || parts[0];
            }

            categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + 1);
        });

        return Array.from(categoryMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name));
    };

    const allCategories = getAllCategories();

    // Helper function to get category name from map
    const getMapCategory = (map: MapFile): string => {
        const parts = map.category.split('/');
        if (parts[0] === 'Cartes') {
            return 'Autres';
        } else if (parts[0] === 'Map' && parts[1]) {
            return parts[1];
        } else {
            return parts[parts.length - 1] || parts[0];
        }
    };

    // Filter maps based on selected category and media type
    const filteredMaps = maps.filter(map => {
        const matchesSearch = map.name.toLowerCase().includes(search.toLowerCase());

        // Get category for this map
        const mapCategory = getMapCategory(map);
        const matchesCategory = !selectedCategory || mapCategory === selectedCategory;

        // Filter by media type within the selected category
        let matchesMediaType = false;
        if (activeMediaType === 'animated') {
            matchesMediaType = map.type === 'video';
        } else if (activeMediaType === 'static') {
            matchesMediaType = map.type === 'image' && !map.name.toLowerCase().includes('illustration');
        } else if (activeMediaType === 'illustration') {
            matchesMediaType = map.type === 'image' && map.name.toLowerCase().includes('illustration');
        }

        return matchesSearch && matchesCategory && matchesMediaType;
    });

    // Count available items per media type for the selected category
    const getMediaTypeCounts = () => {
        const categoryMaps = selectedCategory
            ? maps.filter(map => getMapCategory(map) === selectedCategory)
            : maps;

        return {
            static: categoryMaps.filter(m => m.type === 'image' && !m.name.toLowerCase().includes('illustration')).length,
            animated: categoryMaps.filter(m => m.type === 'video').length,
            illustration: categoryMaps.filter(m => m.type === 'image' && m.name.toLowerCase().includes('illustration')).length,
        };
    };

    const mediaTypeCounts = getMediaTypeCounts();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm">
            <div className="h-full w-full flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-[#333] bg-[#0a0a0a]/80">
                    <div>
                        <h1 className="text-3xl font-bold text-[#c0a080]">Sélection du Fond de Carte</h1>
                        <p className="text-gray-400 text-sm mt-1">
                            {selectedCategory
                                ? `Parcourez ${selectedCategory} - ${filteredMaps.length} carte(s) trouvée(s)`
                                : 'Sélectionnez une catégorie pour commencer'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="h-10 w-10 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center hover:bg-[#c0a080] hover:text-black transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar - Main Categories */}
                    <div className="w-64 border-r border-[#333] bg-[#0a0a0a]/50 flex flex-col">
                        <div className="p-4 border-b border-[#333]">
                            <h2 className="text-sm font-bold uppercase tracking-wider text-[#c0a080] mb-3">Catégories</h2>
                            <button
                                onClick={() => setSelectedCategory(null)}
                                className={cn(
                                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors mb-1",
                                    !selectedCategory
                                        ? "bg-[#c0a080] text-black font-medium"
                                        : "text-gray-300 hover:bg-[#1a1a1a] hover:text-white"
                                )}
                            >
                                Toutes
                            </button>
                        </div>

                        <ScrollArea className="flex-1 p-4">
                            <div className="space-y-1">
                                {allCategories.map(({ name, count }) => (
                                    <button
                                        key={name}
                                        onClick={() => setSelectedCategory(name)}
                                        className={cn(
                                            "w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                                            selectedCategory === name
                                                ? "bg-[#c0a080] text-black font-medium"
                                                : "text-gray-300 hover:bg-[#1a1a1a] hover:text-white"
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span>{name}</span>
                                            <span className="text-xs opacity-60">{count}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Main Panel */}
                    <div className="flex-1 flex flex-col">
                        {/* Media Type Tabs */}
                        <div className="flex items-center gap-2 px-8 py-4 border-b border-[#333] bg-[#0a0a0a]/50">
                            <button
                                onClick={() => setActiveMediaType('static')}
                                disabled={!selectedCategory || mediaTypeCounts.static === 0}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
                                    activeMediaType === 'static'
                                        ? "bg-[#c0a080] text-black shadow-lg"
                                        : "bg-[#1a1a1a] text-gray-400 hover:text-white hover:bg-[#2a2a2a] border border-[#333]",
                                    (!selectedCategory || mediaTypeCounts.static === 0) && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <ImageIcon size={18} />
                                Statique
                                {selectedCategory && <span className="text-xs opacity-70">({mediaTypeCounts.static})</span>}
                            </button>
                            <button
                                onClick={() => setActiveMediaType('animated')}
                                disabled={!selectedCategory || mediaTypeCounts.animated === 0}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
                                    activeMediaType === 'animated'
                                        ? "bg-[#c0a080] text-black shadow-lg"
                                        : "bg-[#1a1a1a] text-gray-400 hover:text-white hover:bg-[#2a2a2a] border border-[#333]",
                                    (!selectedCategory || mediaTypeCounts.animated === 0) && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <Film size={18} />
                                Animé
                                {selectedCategory && <span className="text-xs opacity-70">({mediaTypeCounts.animated})</span>}
                            </button>
                            <button
                                onClick={() => setActiveMediaType('illustration')}
                                disabled={!selectedCategory || mediaTypeCounts.illustration === 0}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all",
                                    activeMediaType === 'illustration'
                                        ? "bg-[#c0a080] text-black shadow-lg"
                                        : "bg-[#1a1a1a] text-gray-400 hover:text-white hover:bg-[#2a2a2a] border border-[#333]",
                                    (!selectedCategory || mediaTypeCounts.illustration === 0) && "opacity-50 cursor-not-allowed"
                                )}
                            >
                                <Palette size={18} />
                                Illustration
                                {selectedCategory && <span className="text-xs opacity-70">({mediaTypeCounts.illustration})</span>}
                            </button>

                            <div className="flex-1" />

                            {/* Search */}
                            <div className="relative w-80">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    placeholder="Rechercher..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-10 bg-[#1a1a1a] border-[#333] text-white"
                                />
                            </div>

                            {/* Upload Button */}
                            <label htmlFor="bg-upload-main">
                                <input
                                    id="bg-upload-main"
                                    type="file"
                                    accept="image/*,video/webm,video/mp4"
                                    onChange={(e) => {
                                        onUpload(e);
                                        onClose();
                                    }}
                                    className="hidden"
                                />
                                <Button
                                    asChild
                                    className="bg-[#c0a080] text-black hover:bg-[#d4b494]"
                                >
                                    <span>
                                        <Upload className="w-4 h-4 mr-2" />
                                        Téléverser
                                    </span>
                                </Button>
                            </label>
                        </div>

                        {/* Maps Grid */}
                        <div className="flex-1 overflow-hidden p-8">
                            {loading ? (
                                <div className="flex items-center justify-center h-full">
                                    <Loader2 className="w-12 h-12 animate-spin text-[#c0a080]" />
                                </div>
                            ) : !selectedCategory ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                    <ImageIcon className="w-24 h-24 mb-4 opacity-30" />
                                    <p className="text-lg">Sélectionnez une catégorie</p>
                                    <p className="text-sm mt-2">Choisissez une catégorie dans la barre latérale pour voir les cartes disponibles</p>
                                </div>
                            ) : filteredMaps.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                    <ImageIcon className="w-24 h-24 mb-4 opacity-30" />
                                    <p className="text-lg">Aucune carte trouvée</p>
                                    <p className="text-sm mt-2">Essayez un autre type de média ou modifiez votre recherche</p>
                                </div>
                            ) : (
                                <ScrollArea className="h-full">
                                    <div className="grid grid-cols-4 gap-6 pb-4">
                                        {filteredMaps.map((map, index) => (
                                            <button
                                                key={index}
                                                onClick={() => {
                                                    onSelectLocal(map.path);
                                                    onClose();
                                                }}
                                                className="group relative aspect-video rounded-xl overflow-hidden border-2 border-[#333] hover:border-[#c0a080] transition-all duration-200 bg-[#0a0a0a] hover:scale-105 hover:shadow-2xl hover:shadow-[#c0a080]/20"
                                            >
                                                {/* Thumbnail */}
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    {map.type === 'video' ? (
                                                        <>
                                                            <video
                                                                src={map.path}
                                                                className="w-full h-full object-cover"
                                                                muted
                                                            />
                                                            <div className="absolute top-2 right-2 bg-black/70 rounded-full p-2">
                                                                <Film className="w-4 h-4 text-white" />
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <img
                                                            src={map.path}
                                                            alt={map.name}
                                                            className="w-full h-full object-cover"
                                                            loading="lazy"
                                                        />
                                                    )}
                                                </div>

                                                {/* Overlay */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <div className="absolute bottom-0 left-0 right-0 p-3">
                                                        <p className="text-sm text-white font-medium truncate">{map.name}</p>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </ScrollArea>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

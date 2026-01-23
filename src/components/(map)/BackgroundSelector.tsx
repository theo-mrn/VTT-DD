"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Image from 'next/image';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X, Film, Image as ImageIcon, Palette, Loader2, AlertCircle, Upload } from 'lucide-react';
import { cn } from "@/lib/utils";
import { useDialogVisibility } from '@/contexts/DialogVisibilityContext';

interface MapFile {
    name: string;
    path: string;
    category: string;
    type: 'image' | 'video';
}

const MediaItem = React.memo(({ map, onClick }: { map: MapFile, onClick: () => void }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [progress, setProgress] = useState(0);
    const [hasError, setHasError] = useState(false);
    const [objectUrl, setObjectUrl] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const containerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isVisible || map.type !== 'video') {
            if (map.type === 'image') {
                setIsLoading(false);
            }
            return;
        }

        let xhr: XMLHttpRequest | null = null;
        let url: string | null = null;

        const loadAsset = () => {
            setIsLoading(true);
            setProgress(0);
            setHasError(false);

            xhr = new XMLHttpRequest();
            xhr.open('GET', map.path, true);
            xhr.responseType = 'blob';

            xhr.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    setProgress(percentComplete);
                }
            };

            xhr.onload = () => {
                if (xhr && xhr.status === 200) {
                    const blob = xhr.response;
                    url = URL.createObjectURL(blob);
                    setObjectUrl(url);
                    setIsLoading(false);
                    setProgress(100);
                } else {
                    setHasError(true);
                    setIsLoading(false);
                }
            };

            xhr.onerror = () => {
                setHasError(true);
                setIsLoading(false);
            };

            xhr.send();
        };

        loadAsset();

        return () => {
            if (xhr) {
                xhr.abort();
            }
            if (url) {
                URL.revokeObjectURL(url);
            }
        };
    }, [map.path, isVisible, map.type]);

    return (
        <button
            ref={containerRef}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick();
            }}
            disabled={(isLoading || hasError) && isVisible && map.type === 'video'}
            className="group relative aspect-video rounded-xl overflow-hidden border-2 border-[#333] hover:border-[#c0a080] transition-all duration-200 bg-[#0a0a0a] hover:scale-105 hover:shadow-2xl hover:shadow-[#c0a080]/20 disabled:hover:scale-100 disabled:cursor-not-allowed"
        >
            <div className="absolute inset-0 flex items-center justify-center">
                {!isVisible ? (
                    <div className="flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-[#333]" />
                    </div>
                ) : (
                    <>
                        {map.type === 'video' ? (
                            <>
                                {isLoading && !hasError && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-[#0a0a0a]/90 backdrop-blur-sm">
                                        <div className="relative w-16 h-16 flex items-center justify-center mb-2">
                                            <Loader2 className="w-8 h-8 animate-spin text-[#c0a080] absolute" />
                                            <span className="text-[10px] font-bold text-white z-10">{progress}%</span>
                                        </div>
                                        <div className="w-1/2 h-1 bg-gray-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-[#c0a080] transition-all duration-300 ease-out"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {hasError && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-[#1a0505] text-red-500 p-2 text-center">
                                        <AlertCircle className="w-8 h-8 mb-2" />
                                        <span className="text-xs">Échec du chargement</span>
                                    </div>
                                )}

                                {objectUrl && (
                                    <>
                                        <video
                                            src={objectUrl}
                                            className="w-full h-full object-cover"
                                            muted
                                            autoPlay
                                            loop
                                            playsInline
                                        />
                                        <div className="absolute top-2 right-2 bg-black/70 rounded-full p-2">
                                            <Film className="w-4 h-4 text-white" />
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <Image
                                src={map.path}
                                alt={map.name}
                                fill
                                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                                className="object-cover"
                                quality={10}
                                loading="lazy"
                            />
                        )}
                    </>
                )}
            </div>

            {/* Overlay */}
            {isVisible && !isLoading && !hasError && (
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-sm text-white font-medium truncate">{map.name}</p>
                    </div>
                </div>
            )}
        </button>
    );
});

interface BackgroundSelectorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectLocal: (path: string) => void;
}

type MediaType = 'animated' | 'static' | 'illustration';

export default function BackgroundSelector({
    isOpen,
    onClose,
    onSelectLocal
}: BackgroundSelectorProps) {
    const { setDialogOpen } = useDialogVisibility();

    // Register dialog state when selector opens/closes
    useEffect(() => {
        setDialogOpen(isOpen);
    }, [isOpen, setDialogOpen]);

    const [maps, setMaps] = useState<MapFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [activeMediaType, setActiveMediaType] = useState<MediaType>('static');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            onSelectLocal(url);
            onClose();
        }
    };

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

    // Helper function to get category name from map
    const getMapCategory = useCallback((map: MapFile): string => {
        const parts = map.category.split('/');
        if (parts[0] === 'Cartes') {
            return 'Autres';
        } else if (parts[0] === 'Map' && parts[1]) {
            return parts[1];
        } else {
            return parts[parts.length - 1] || parts[0];
        }
    }, []);

    // Get all unique main categories memoized
    const allCategories = useMemo(() => {
        const categoryMap = new Map<string, number>();
        maps.forEach(map => {
            const categoryName = getMapCategory(map);
            categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + 1);
        });

        return Array.from(categoryMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [maps, getMapCategory]);

    // Filter maps based on selected category and media type memoized
    const filteredMaps = useMemo(() => {
        const searchTerm = search.toLowerCase();
        return maps.filter(map => {
            const matchesSearch = map.name.toLowerCase().includes(searchTerm);
            const mapCategory = getMapCategory(map);
            const matchesCategory = !selectedCategory || mapCategory === selectedCategory;

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
    }, [maps, search, selectedCategory, activeMediaType, getMapCategory]);

    // Count available items per media type for the selected category memoized
    const mediaTypeCounts = useMemo(() => {
        const categoryMaps = selectedCategory
            ? maps.filter(map => getMapCategory(map) === selectedCategory)
            : maps;

        return {
            static: categoryMaps.filter(m => m.type === 'image' && !m.name.toLowerCase().includes('illustration')).length,
            animated: categoryMaps.filter(m => m.type === 'video').length,
            illustration: categoryMaps.filter(m => m.type === 'image' && m.name.toLowerCase().includes('illustration')).length,
        };
    }, [maps, selectedCategory, getMapCategory]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >

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
                                    (!selectedCategory || mediaTypeCounts.static === 0) ? "opacity-50 cursor-not-allowed" : ""
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
                                    (!selectedCategory || mediaTypeCounts.animated === 0) ? "opacity-50 cursor-not-allowed" : ""
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
                                    (!selectedCategory || mediaTypeCounts.illustration === 0) ? "opacity-50 cursor-not-allowed" : ""
                                )}
                            >
                                <Palette size={18} />
                                Illustration
                                {selectedCategory && <span className="text-xs opacity-70">({mediaTypeCounts.illustration})</span>}
                            </button>

                            <div className="ml-2 pl-2 border-l border-[#333]">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*,video/*"
                                    onChange={handleFileUpload}
                                />
                                <Button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="bg-[#1a1a1a] border border-[#333] text-gray-300 hover:bg-[#c0a080] hover:text-black hover:border-[#c0a080] transition-all gap-2"
                                >
                                    <Upload size={18} />
                                    Importer
                                </Button>
                            </div>

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
                                        {filteredMaps.map((map) => (
                                            <MediaItem
                                                key={map.path}
                                                map={map}
                                                onClick={() => {
                                                    onSelectLocal(map.path);
                                                    onClose();
                                                }}
                                            />
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

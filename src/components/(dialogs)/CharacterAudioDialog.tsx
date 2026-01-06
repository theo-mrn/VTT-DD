import React, { useState, useEffect, useRef } from 'react';
import { Upload, X, Play, Pause, RefreshCw, Volume2, Music, Check, Disc, Trash2, Library, Search, PlayCircle, StopCircle, ArrowLeft } from 'lucide-react';
import { Character } from '@/app/[roomid]/map/types';
import { SUGGESTED_SOUNDS, SOUND_CATEGORIES } from '@/lib/suggested-sounds';
import { motion, AnimatePresence } from 'framer-motion';

interface CharacterAudioDialogProps {
    isOpen: boolean;
    onClose: () => void;
    character: Character | null;
    onSave: (audioData: NonNullable<Character['audio']>) => Promise<void>;
    onDelete: () => Promise<void>;
    onUpload?: (file: File) => Promise<string>;
    onRadiusChange?: (radius: number) => void;
}

export const CharacterAudioDialog: React.FC<CharacterAudioDialogProps> = ({
    isOpen,
    onClose,
    character,
    onSave,
    onDelete,
    onUpload,
    onRadiusChange
}) => {
    const [name, setName] = useState('');
    const [url, setUrl] = useState('');
    const [radius, setRadius] = useState(200);
    const [volume, setVolume] = useState(0.5);
    const [loop, setLoop] = useState(true);
    const [loading, setLoading] = useState(false);

    // Library State
    const [view, setView] = useState<'main' | 'library'>('main');
    const [librarySearch, setLibrarySearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [libraryAudio, setLibraryAudio] = useState<HTMLAudioElement | null>(null);

    // Preview Player State (Main Dialog)
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Initialise inputs when character changes or dialog opens
    useEffect(() => {
        if (isOpen && character) {
            setName(character.audio?.name || character.name);
            setUrl(character.audio?.url || '');
            setRadius(character.audio?.radius || 200);
            setVolume(character.audio?.volume ?? 0.5);
            setLoop(character.audio?.loop ?? true);
            setView('main'); // Reset view
        }
        if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
        }
    }, [isOpen, character]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
            audioRef.current.loop = loop;
        }
    }, [volume, loop]);

    // Library Audio Cleanup
    useEffect(() => {
        if (view !== 'library' && libraryAudio) {
            libraryAudio.pause();
            setPreviewUrl(null);
        }
    }, [view, libraryAudio]);

    const handlePlayPreview = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!audioRef.current || !url) return;

        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.src = url;
            audioRef.current.play().catch(console.error);
            setIsPlaying(true);
        }
    };

    const toggleLibraryPreview = (path: string) => {
        if (previewUrl === path && libraryAudio) {
            libraryAudio.pause();
            setPreviewUrl(null);
        } else {
            if (libraryAudio) libraryAudio.pause();
            const audio = new Audio(path);
            audio.volume = 0.4;
            audio.play();
            audio.onended = () => setPreviewUrl(null);
            setLibraryAudio(audio);
            setPreviewUrl(path);
        }
    };

    const handleSelectFromLibrary = (sound: typeof SUGGESTED_SOUNDS[0]) => {
        setUrl(sound.path);
        setName(sound.name);
        setView('main');
        if (libraryAudio) {
            libraryAudio.pause();
            setPreviewUrl(null);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        if (!url) {
            await onDelete();
        } else {
            await onSave({ name, url, radius, volume, loop });
        }
        setLoading(false);
        onClose();
    };

    // Close handler
    const handleClose = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
        }
        if (libraryAudio) {
            libraryAudio.pause();
        }
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999]"
                    />

                    {/* Modal Container */}
                    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-[#121212] border border-white/10 rounded-2xl shadow-2xl w-full pointer-events-auto overflow-hidden flex flex-col max-h-[85vh] transition-all duration-300"
                            style={{
                                maxWidth: view === 'library' ? '800px' : '400px',
                                height: view === 'library' ? '600px' : 'auto'
                            }}
                        >
                            {/* --- MAIN VIEW --- */}
                            {view === 'main' && (
                                <>
                                    {/* Custom Header */}
                                    <div className="relative h-32 bg-gradient-to-br from-purple-900/50 to-blue-900/20 flex flex-col items-center justify-center border-b border-white/5 shrink-0">
                                        <button
                                            onClick={handleClose}
                                            className="absolute top-3 right-3 p-2 rounded-full hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                                        >
                                            <X size={16} />
                                        </button>

                                        {/* Vinyl/Music Icon Animation */}
                                        <div className={`w-16 h-16 rounded-full flex items-center justify-center bg-black/40 border-2 border-white/10 shadow-xl mb-3 relative ${isPlaying ? 'animate-spin-slow' : ''}`}>
                                            <div className="absolute inset-0 rounded-full border border-white/5" />
                                            <div className="absolute inset-2 rounded-full border border-white/5" />
                                            <Music size={24} className="text-purple-400" />
                                        </div>

                                        {/* Track Name Input */}
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Nom du morceau..."
                                            className="bg-transparent border-none text-center font-serif text-xl font-bold text-white placeholder:text-white/20 focus:outline-none w-full px-8"
                                        />
                                    </div>

                                    {/* Controls Body */}
                                    <div className="p-6 space-y-6 overflow-y-auto">
                                        {/* Source Control */}
                                        <div className="flex flex-col gap-2">
                                            <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold ml-1">Source Audio</label>
                                            {!url ? (
                                                <div className="flex gap-2">
                                                    {/* LIBRARY BUTTON - PRIMARY */}
                                                    <button
                                                        onClick={() => setView('library')}
                                                        className="flex-1 h-12 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center gap-2 cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/10 transition-all group relative bg-blue-900/5"
                                                        title="Ouvrir la bibliothèque"
                                                    >
                                                        <Library size={16} className="text-blue-400" />
                                                        <span className="text-xs font-semibold text-blue-200">Choisir dans la Bibliothèque</span>
                                                    </button>

                                                    {/* UPLOAD BUTTON - SECONDARY/ICON */}
                                                    <div
                                                        className="h-12 w-12 border-2 border-dashed border-white/10 rounded-lg flex items-center justify-center gap-2 cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group relative"
                                                        title="Importer MP3"
                                                    >
                                                        <Upload size={16} className="text-gray-400 group-hover:text-purple-400" />
                                                        {onUpload && <input
                                                            type="file"
                                                            accept="audio/*"
                                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                                            onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file && onUpload) {
                                                                    setLoading(true);
                                                                    try {
                                                                        const newUrl = await onUpload(file);
                                                                        setUrl(newUrl);
                                                                        if (!name) setName(file.name.split('.')[0]);
                                                                    } catch (err) { console.error(err); }
                                                                    finally { setLoading(false); }
                                                                }
                                                            }}
                                                        />}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3 bg-white/5 p-2 rounded-lg border border-white/5 pr-4">
                                                    <button
                                                        onClick={handlePlayPreview}
                                                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${isPlaying ? 'bg-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-white/10 text-gray-400 hover:text-white hover:bg-white/20'}`}
                                                    >
                                                        {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                                                    </button>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs text-green-400 flex items-center gap-1.5">
                                                            <Check size={10} />
                                                            Fichier chargé
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => setUrl('')}
                                                        className="text-gray-500 hover:text-red-400 transition-colors"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            )}
                                            <audio ref={audioRef} onEnded={() => { if (!loop) setIsPlaying(false); }} className="hidden" />
                                        </div>

                                        {/* Sliders Area */}
                                        <div className="space-y-5">
                                            {/* Volume */}
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs">
                                                    <div className="flex items-center gap-2 text-gray-400">
                                                        <Volume2 size={14} />
                                                        <span>Volume</span>
                                                    </div>
                                                    <span className="text-white font-mono">{Math.round(volume * 100)}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0" max="1" step="0.05"
                                                    value={volume}
                                                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                />
                                            </div>

                                            {/* Radius */}
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs">
                                                    <div className="flex items-center gap-2 text-gray-400">
                                                        <Disc size={14} />
                                                        <span>Rayon</span>
                                                    </div>
                                                    <span className="text-white font-mono">{radius} px</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="50" max="1000" step="10"
                                                    value={radius}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value);
                                                        setRadius(val);
                                                        onRadiusChange?.(val);
                                                    }}
                                                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                />
                                            </div>
                                        </div>

                                        {/* Loop Toggle & Footer Actions */}
                                        <div className="flex items-center justify-between pt-2">
                                            <button
                                                onClick={() => setLoop(!loop)}
                                                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-all ${loop ? 'bg-green-900/20 border-green-500/30 text-green-400' : 'bg-transparent border-transparent text-gray-500 hover:bg-white/5'}`}
                                            >
                                                <RefreshCw size={12} className={loop ? "animate-spin-slow-reverse" : ""} />
                                                {loop ? "Boucle active" : "Boucle désac."}
                                            </button>

                                            <button
                                                onClick={handleSave}
                                                disabled={loading || (!url && !character?.audio?.url)}
                                                className="bg-white text-black text-xs font-bold px-6 py-2 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {loading ? "..." : "Enregistrer"}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Delete Option - secondary */}
                                    {character?.audio?.url && (
                                        <div className="border-t border-white/5 p-2 bg-black/20 text-center shrink-0">
                                            <button
                                                onClick={async () => {
                                                    if (confirm("Supprimer l'audio ?")) {
                                                        setLoading(true);
                                                        await onDelete();
                                                        setLoading(false);
                                                        onClose();
                                                    }
                                                }}
                                                className="text-[10px] text-red-500/50 hover:text-red-400 uppercase tracking-widest font-semibold transition-colors"
                                            >
                                                Supprimer l'audio
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* --- LIBRARY VIEW --- */}
                            {view === 'library' && (
                                <div className="flex flex-col h-full bg-[#121212]">
                                    <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#1a1a1a] shrink-0">
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => setView('main')}
                                                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                            >
                                                <ArrowLeft size={16} />
                                            </button>
                                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                                <Library size={16} className="text-purple-400" />
                                                Bibliothèque
                                            </h3>
                                        </div>
                                        <div className="relative w-64">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                                            <input
                                                value={librarySearch}
                                                onChange={(e) => setLibrarySearch(e.target.value)}
                                                placeholder="Rechercher un son..."
                                                className="w-full bg-[#202020] border-none rounded-full py-1.5 pl-8 text-xs text-white focus:ring-1 focus:ring-purple-500 outline-none placeholder:text-gray-600"
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    <div className="flex flex-1 overflow-hidden">
                                        {/* Categories Sidebar */}
                                        <div className="w-48 border-r border-white/5 bg-[#161616] p-2 overflow-y-auto">
                                            <div className="text-[10px] font-bold text-gray-500 uppercase px-2 mb-2">Catégories</div>
                                            <div className="space-y-1">
                                                {SOUND_CATEGORIES.map(cat => (
                                                    <button
                                                        key={cat.id}
                                                        onClick={() => setSelectedCategory(cat.id)}
                                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between ${selectedCategory === cat.id
                                                                ? 'bg-purple-900/20 text-purple-200 font-medium'
                                                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                                            }`}
                                                    >
                                                        {cat.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Sounds Grid */}
                                        <div className="flex-1 overflow-y-auto p-4 bg-[#0a0a0a]">
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                {SUGGESTED_SOUNDS
                                                    .filter(s => {
                                                        const matchesSearch = s.name.toLowerCase().includes(librarySearch.toLowerCase());
                                                        const matchesCat = selectedCategory === 'all' || s.category === selectedCategory;
                                                        return matchesSearch && matchesCat;
                                                    })
                                                    .map((sound, i) => {
                                                        const isPreviewing = previewUrl === sound.path;
                                                        return (
                                                            <div
                                                                key={i}
                                                                className={`group relative p-3 rounded-xl border transition-all duration-200 bg-[#161616] hover:bg-[#1f1f1f] flex flex-col gap-3 ${isPreviewing ? 'border-purple-500/50 shadow-lg shadow-purple-900/20' : 'border-white/5 hover:border-white/10'}`}
                                                            >
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div>
                                                                        <div className={`text-xs font-bold truncate ${isPreviewing ? 'text-purple-300' : 'text-gray-200'}`}>{sound.name}</div>
                                                                        <div className="text-[10px] text-gray-600 capitalize">{sound.category}</div>
                                                                    </div>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); toggleLibraryPreview(sound.path); }}
                                                                        className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${isPreviewing ? 'bg-purple-500 text-white' : 'bg-[#252525] text-gray-400 hover:bg-white/10 hover:text-white'}`}
                                                                    >
                                                                        {isPreviewing ? <StopCircle size={14} /> : <PlayCircle size={14} />}
                                                                    </button>
                                                                </div>

                                                                <button
                                                                    onClick={() => handleSelectFromLibrary(sound)}
                                                                    className="w-full py-1.5 rounded-lg bg-[#252525] hover:bg-purple-600 hover:text-white text-[10px] font-medium text-gray-400 transition-colors"
                                                                >
                                                                    Choisir
                                                                </button>
                                                            </div>
                                                        )
                                                    })
                                                }
                                            </div>
                                            {SUGGESTED_SOUNDS.filter(s => (s.name.toLowerCase().includes(librarySearch.toLowerCase()) || s.category.includes(librarySearch))).length === 0 && (
                                                <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
                                                    <Search size={32} strokeWidth={1} className="mb-2" />
                                                    <p className="text-xs">Aucun son trouvé</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};

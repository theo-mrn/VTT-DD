'use client'
import React from 'react'
import YouTube, { YouTubeEvent } from 'react-youtube'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Aclonica } from "next/font/google"
import { Music, Play, Pause, Upload, Youtube, FileAudio, Library, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SUGGESTED_SOUNDS, SOUND_CATEGORIES, SUGGESTED_MUSICS, MUSIC_CATEGORIES } from '@/lib/suggested-sounds'

const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

function extractVideoId(url: string): string | null {
    const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/, /^([a-zA-Z0-9_-]{11})$/]
    for (const pattern of patterns) {
        const match = url.match(pattern)
        if (match && match[1]) return match[1]
    }
    return null
}

// La source actuellement chargée dans le player, quelle que soit son origine
// (fichier importé, YouTube, ou un item de la bibliothèque) — une seule
// source de vérité pour que le bouton play/pause principal fonctionne
// toujours, peu importe d'où vient le son.
type ActiveSource =
    | { kind: 'file'; label: string }
    | { kind: 'youtube'; videoId: string }
    | { kind: 'library'; name: string }
    | null

export function AmbiancePlayerCard({ delay = 0 }: { delay?: number }) {
    const [creationType, setCreationType] = React.useState<'file' | 'youtube'>('file')
    const [youtubeInput, setYoutubeInput] = React.useState('')
    const [isPlaying, setIsPlaying] = React.useState(false)
    const [activeSource, setActiveSource] = React.useState<ActiveSource>(null)
    const [libraryOpen, setLibraryOpen] = React.useState(false)
    const [libraryTab, setLibraryTab] = React.useState<'sounds' | 'music'>('sounds')
    const [librarySearch, setLibrarySearch] = React.useState('')
    const [libraryCategory, setLibraryCategory] = React.useState('all')

    const audioRef = React.useRef<HTMLAudioElement | null>(null)
    const objectUrlRef = React.useRef<string | null>(null)
    const youtubePlayerRef = React.useRef<any>(null)
    const fileInputRef = React.useRef<HTMLInputElement>(null)

    // Coupe toute lecture en cours (fichier, bibliothèque ou YouTube) avant
    // d'en démarrer une nouvelle — une seule source joue à la fois.
    const stopAll = React.useCallback(() => {
        audioRef.current?.pause()
        audioRef.current = null
        youtubePlayerRef.current?.stopVideo?.()
        setActiveSource(null)
        setIsPlaying(false)
    }, [])

    // Lecture 100% locale : fichier importé via object URL, vidéo via player
    // YouTube caché — rien n'est envoyé ni stocké côté serveur.
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return

        stopAll()
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
        const url = URL.createObjectURL(file)
        objectUrlRef.current = url

        const audio = new Audio(url)
        audio.loop = true
        audio.volume = 0.5
        audio.onended = () => { setActiveSource(null); setIsPlaying(false) }
        audioRef.current = audio
        audio.play().then(() => { setActiveSource({ kind: 'file', label: file.name }); setIsPlaying(true) }).catch(() => {})
    }

    const loadYoutube = () => {
        const id = extractVideoId(youtubeInput)
        if (!id) return
        stopAll()
        setActiveSource({ kind: 'youtube', videoId: id })
        setIsPlaying(true)
    }

    const playFromLibrary = (name: string, path: string) => {
        if (activeSource?.kind === 'library' && activeSource.name === name) {
            stopAll()
            return
        }
        stopAll()
        const audio = new Audio(path)
        audio.loop = true
        audio.volume = 0.5
        audio.onended = () => { setActiveSource(null); setIsPlaying(false) }
        audioRef.current = audio
        audio.play().then(() => {
            setActiveSource({ kind: 'library', name })
            setIsPlaying(true)
            setLibraryOpen(false)
        }).catch(() => {})
    }

    const togglePlay = () => {
        if (!activeSource) {
            if (creationType === 'file') fileInputRef.current?.click()
            else loadYoutube()
            return
        }
        if (isPlaying) {
            if (activeSource.kind === 'youtube') youtubePlayerRef.current?.pauseVideo()
            else audioRef.current?.pause()
            setIsPlaying(false)
        } else {
            if (activeSource.kind === 'youtube') youtubePlayerRef.current?.playVideo()
            else audioRef.current?.play().catch(() => {})
            setIsPlaying(true)
        }
    }

    React.useEffect(() => {
        return () => {
            audioRef.current?.pause()
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
        }
    }, [])

    const filteredLibraryItems = React.useMemo(() => {
        const items = libraryTab === 'music' ? SUGGESTED_MUSICS : SUGGESTED_SOUNDS
        return items.filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(librarySearch.toLowerCase())
            const matchesCat = libraryCategory === 'all' || s.category === libraryCategory
            return matchesSearch && matchesCat
        })
    }, [libraryTab, librarySearch, libraryCategory])

    const canToggle = activeSource !== null || (creationType === 'youtube' && !!youtubeInput) || creationType === 'file'

    return (
        <>
        <motion.div
            className="glass-card glass-card-hover relative rounded-2xl p-6 flex flex-col"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
        >
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#c9a965]/10 text-[#c9a965] shrink-0 mb-3 relative">
                <Music className="w-5 h-5" />
                {isPlaying && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#c9a965] animate-pulse" />
                )}
            </div>
            <h3 className={cn("text-lg font-semibold text-white", aclonica.className)}>
                Ambiance sonore
            </h3>
            <div className="mt-4 grid grid-cols-3 gap-2 bg-white/5 p-1 rounded-lg">
                <button
                    onClick={() => setCreationType('file')}
                    className={cn("text-xs py-1.5 rounded-md transition flex items-center justify-center gap-1.5 cursor-pointer", creationType === 'file' ? "bg-white/15 text-white" : "text-white/40")}
                >
                    <FileAudio className="w-3.5 h-3.5" /> Fichier
                </button>
                <button
                    onClick={() => setCreationType('youtube')}
                    className={cn("text-xs py-1.5 rounded-md transition flex items-center justify-center gap-1.5 cursor-pointer", creationType === 'youtube' ? "bg-red-500/20 text-red-300" : "text-white/40")}
                >
                    <Youtube className="w-3.5 h-3.5" /> YouTube
                </button>
                <button
                    onClick={() => setLibraryOpen(true)}
                    className="text-xs py-1.5 rounded-md transition flex items-center justify-center gap-1.5 cursor-pointer text-white/40 hover:text-[#c9a965]"
                >
                    <Library className="w-3.5 h-3.5" /> Bibliothèque
                </button>
            </div>

            {creationType === 'file' ? (
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                        "mt-2 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 bg-white/5 border border-dashed border-white/20 text-white/60 hover:text-white hover:border-[#c9a965]/40 transition-all text-xs cursor-pointer",
                        aclonica.className
                    )}
                >
                    <Upload className="w-3.5 h-3.5" />
                    {activeSource?.kind === 'file' ? activeSource.label : 'Importer un fichier audio'}
                </button>
            ) : (
                <div className="mt-2 flex gap-2">
                    <Input
                        placeholder="URL YouTube"
                        value={youtubeInput}
                        onChange={e => setYoutubeInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && loadYoutube()}
                        className="h-8 bg-white/5 border-white/15 text-white text-xs"
                    />
                </div>
            )}

            <button
                onClick={togglePlay}
                disabled={!canToggle}
                className={cn(
                    "mt-3 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 border text-xs transition-all",
                    canToggle
                        ? "bg-[#c9a965]/10 border-[#c9a965]/25 text-[#c9a965] hover:bg-[#c9a965]/20 cursor-pointer"
                        : "bg-white/5 border-white/10 text-white/25 cursor-not-allowed",
                    aclonica.className
                )}
            >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? 'Pause' : 'Lecture'}
            </button>

            <p className={cn("mt-2 text-[9px] text-white/25 text-center", aclonica.className)}>
                Rien n&apos;est envoyé, tout reste dans votre navigateur.
            </p>

            {activeSource?.kind === 'youtube' && (
                <div className="hidden">
                    <YouTube
                        videoId={activeSource.videoId}
                        opts={{ height: '0', width: '0', playerVars: { autoplay: 1, loop: 1 } }}
                        onReady={(e: YouTubeEvent) => { youtubePlayerRef.current = e.target }}
                        onEnd={() => { setActiveSource(null); setIsPlaying(false) }}
                    />
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
            />
        </motion.div>

        {libraryOpen && (
            <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="absolute inset-0" onClick={() => setLibraryOpen(false)} />
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="relative w-full max-w-3xl max-h-[80vh] glass-card rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                >
                    <div className="p-5 border-b border-white/10 flex flex-col gap-3 shrink-0">
                        <div className="flex items-center justify-between">
                            <span className={cn("text-sm tracking-widest uppercase text-[#c9a965]/80", aclonica.className)}>
                                Bibliothèque
                            </span>
                            <button onClick={() => setLibraryOpen(false)} aria-label="Fermer" className="text-white/40 hover:text-white/80 transition-colors cursor-pointer">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-white/5 p-1 rounded-lg">
                            <button
                                onClick={() => { setLibraryTab('sounds'); setLibraryCategory('all') }}
                                className={cn("text-xs py-1.5 rounded-md transition cursor-pointer", libraryTab === 'sounds' ? "bg-white/15 text-white" : "text-white/40")}
                            >
                                Effets sonores
                            </button>
                            <button
                                onClick={() => { setLibraryTab('music'); setLibraryCategory('all') }}
                                className={cn("text-xs py-1.5 rounded-md transition cursor-pointer", libraryTab === 'music' ? "bg-[#c9a965]/20 text-[#c9a965]" : "text-white/40")}
                            >
                                Musiques
                            </button>
                        </div>

                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                            <Input
                                value={librarySearch}
                                onChange={e => setLibrarySearch(e.target.value)}
                                placeholder="Rechercher (pluie, épée, taverne...)"
                                className="pl-9 h-9 bg-white/5 border-white/15 text-white text-sm"
                            />
                        </div>
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                            {(libraryTab === 'music' ? MUSIC_CATEGORIES : SOUND_CATEGORIES).map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setLibraryCategory(cat.id)}
                                    className={cn(
                                        "shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all",
                                        libraryCategory === cat.id ? "bg-[#c9a965] text-black" : "bg-white/5 text-white/50 hover:bg-white/10"
                                    )}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {filteredLibraryItems.map(item => {
                                const isItemPlaying = isPlaying && activeSource?.kind === 'library' && activeSource.name === item.name
                                return (
                                    <button
                                        key={item.path}
                                        onClick={() => playFromLibrary(item.name, item.path)}
                                        className={cn(
                                            "flex items-center gap-2 rounded-lg px-3 py-2.5 border text-left transition-all cursor-pointer",
                                            isItemPlaying
                                                ? "bg-[#c9a965]/15 border-[#c9a965]/40 text-[#c9a965]"
                                                : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20"
                                        )}
                                    >
                                        {isItemPlaying ? <Pause className="w-3.5 h-3.5 shrink-0" /> : <Play className="w-3.5 h-3.5 shrink-0" />}
                                        <span className={cn("text-xs truncate", aclonica.className)}>{item.name}</span>
                                    </button>
                                )
                            })}
                        </div>
                        {filteredLibraryItems.length === 0 && (
                            <p className={cn("text-center text-white/30 text-sm py-10", aclonica.className)}>
                                Aucun résultat.
                            </p>
                        )}
                    </div>
                </motion.div>
            </div>
        )}
        </>
    )
}

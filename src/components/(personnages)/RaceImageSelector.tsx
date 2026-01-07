"use client"

import React, { useState, useEffect, useRef, memo } from 'react'
import { X, ImageIcon, Loader2 } from 'lucide-react'
import Image from 'next/image'

interface RaceImageSelectorProps {
    isOpen: boolean
    onClose: () => void
    onSelectImage: (imageUrl: string) => void
    raceName: string
    currentImage?: string
    raceDefaultImage?: string // The default race image to show as fallback
}

interface AssetMapping {
    name: string
    path: string
    category: string
    type: string
}

// Map race names to their file naming convention
const getRaceFilePrefix = (raceName: string): string => {
    const lowerRace = raceName.toLowerCase()

    // Special cases mappings
    const mappings: Record<string, string> = {
        'orque': 'orc',
        'elfe_sylvain': 'elfesylvain',
        'elfe_noir': 'elfenoir',
        'elfe_des_bois': 'elfedesbois',
        'humain_des_neiges': 'humaindesneiges',
        // Add more special cases as needed
    }

    // Return mapped value if exists, otherwise use the first part before underscore
    if (mappings[lowerRace]) {
        return mappings[lowerRace]
    }

    // Default: use first part before underscore
    return lowerRace.split('_')[0]
}

const BATCH_SIZE = 20

// Memoized Image Item Component
const RaceImageItem = memo(({
    asset,
    isSelected,
    handleSelect,
    priority
}: {
    asset: AssetMapping,
    isSelected: boolean,
    handleSelect: (path: string) => void,
    priority: boolean
}) => {
    return (
        <div
            onClick={() => handleSelect(asset.path)}
            className={`group relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all hover:scale-105 hover:shadow-xl ${isSelected
                ? 'border-[#c0a080] ring-2 ring-[#c0a080]/50 shadow-lg'
                : 'border-[#2a2a2a] hover:border-[#c0a080]'
                }`}
        >
            <Image
                src={asset.path}
                alt={asset.name}
                fill
                quality={1}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                className="object-cover"
                loading={priority ? "eager" : "lazy"}
                priority={priority}
                onLoad={(e) => console.log('Loaded image src:', e.currentTarget.currentSrc, 'Natural size:', e.currentTarget.naturalWidth, 'x', e.currentTarget.naturalHeight)}
            />

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-2">
                    <p className="text-white text-xs font-medium truncate">
                        {asset.name.replace(/\.[^.]+$/, '')}
                    </p>
                </div>
            </div>

            {/* Selected indicator */}
            {isSelected && (
                <div className="absolute inset-0 bg-[#c0a080]/20 flex items-center justify-center">
                    <div className="bg-[#c0a080] rounded-full p-2 shadow-lg">
                        <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>
            )}
        </div>
    )
})

RaceImageItem.displayName = 'RaceImageItem'

export function RaceImageSelector({ isOpen, onClose, onSelectImage, raceName, currentImage, raceDefaultImage }: RaceImageSelectorProps) {
    const [mode, setMode] = useState<'token' | 'photo'>('token')
    const [assets, setAssets] = useState<AssetMapping[]>([])
    const [photos, setPhotos] = useState<AssetMapping[]>([])
    const [loading, setLoading] = useState(false)
    const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
    const observerTarget = useRef<HTMLDivElement>(null)

    // Reset pagination when mode or race changes
    useEffect(() => {
        setVisibleCount(BATCH_SIZE)
    }, [mode, raceName])

    // Load assets on mount
    useEffect(() => {
        if (!isOpen) return

        setLoading(true)

        Promise.all([
            fetch('/asset-mappings.json').then(res => res.json()),
            fetch('/api/assets?category=Photos').then(res => res.json())
        ])
            .then(([mappings, photosData]) => {

                // Get the file prefix for this race
                const raceFilePrefix = getRaceFilePrefix(raceName)

                // Filter Assets (tokens) for this specific race
                const raceTokens = mappings.filter((m: AssetMapping) => {
                    if (m.category !== 'Assets') return false

                    // Extract race name from filename (e.g., "Elfe1.png" -> "Elfe")
                    const match = m.name.match(/^([A-Za-z]+)\d+\.png$/)
                    if (!match) return false

                    const fileRaceName = match[1].toLowerCase()

                    return fileRaceName === raceFilePrefix
                })

                setAssets(raceTokens)

                // Filter photos for this race (use raceFilePrefix for consistency)
                const racePhotos = (photosData.assets || []).filter((p: AssetMapping) =>
                    p.category.toLowerCase().includes(raceFilePrefix)
                )

                setPhotos(racePhotos)

                // Auto-select mode based on what's available
                if (raceTokens.length > 0) {
                    setMode('token')
                } else if (racePhotos.length > 0) {
                    setMode('photo')
                }

                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load race images:', err)
                setLoading(false)
            })
    }, [isOpen, raceName])

    const handleImageSelect = (imageUrl: string) => {
        onSelectImage(imageUrl)
        onClose()
    }

    // Calculate displayed images and total count
    const allImages = mode === 'token' ? assets : photos
    const displayedImages = allImages.slice(0, visibleCount)
    const totalCount = assets.length + photos.length

    // Infinite scroll observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && displayedImages.length < allImages.length) {
                    setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, allImages.length))
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        )

        if (observerTarget.current) {
            observer.observe(observerTarget.current)
        }

        return () => observer.disconnect()
    }, [displayedImages.length, allImages.length])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-md">
            <div className="relative w-[90vw] h-[85vh] max-w-6xl bg-[#09090b] rounded-2xl border border-[#2a2a2a] shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="px-6 py-4 border-b border-[#2a2a2a] bg-[#121214] flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-serif font-bold text-[#e4e4e7]">Images de {raceName.replace('_', ' ')}</h2>
                        <p className="text-xs text-zinc-500 mt-1">{totalCount} images disponibles</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 bg-black/40 text-white/70 hover:text-white rounded-full hover:bg-black/80 transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Mode Toggle - Only show if there are images AND show only tabs with content */}
                {totalCount > 0 && (
                    <div className="px-6 py-3 border-b border-[#2a2a2a] bg-[#0f0f11] flex gap-3">
                        {assets.length > 0 && (
                            <button
                                onClick={() => setMode('token')}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${mode === 'token'
                                    ? 'bg-[#c0a080] text-black shadow-md'
                                    : 'bg-[#1a1a1a] text-zinc-400 hover:text-white hover:bg-[#222]'
                                    }`}
                            >
                                Tokens ({assets.length})
                            </button>
                        )}
                        {photos.length > 0 && (
                            <button
                                onClick={() => setMode('photo')}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${mode === 'photo'
                                    ? 'bg-[#c0a080] text-black shadow-md'
                                    : 'bg-[#1a1a1a] text-zinc-400 hover:text-white hover:bg-[#222]'
                                    }`}
                            >
                                Photos ({photos.length})
                            </button>
                        )}
                    </div>
                )}

                {/* Image Grid */}
                <div className="flex-1 p-6 overflow-y-auto h-[calc(85vh-180px)] custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="w-8 h-8 text-[#c0a080] animate-spin" />
                        </div>
                    ) : allImages.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            {displayedImages.map((asset, index) => (
                                <RaceImageItem
                                    key={asset.path}
                                    asset={asset}
                                    isSelected={currentImage === asset.path}
                                    handleSelect={handleImageSelect}
                                    priority={index < 10}
                                />
                            ))}
                            {/* Sentinel for infinite scrolling */}
                            <div ref={observerTarget} className="h-10 w-full col-span-full" />
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            {raceDefaultImage ? (
                                <div className="text-center max-w-md">
                                    <div className="relative w-64 h-64 mx-auto mb-6 rounded-xl overflow-hidden border-2 border-[#2a2a2a]">
                                        <Image
                                            src={raceDefaultImage}
                                            alt={raceName}
                                            fill
                                            className="object-cover"
                                            sizes="(max-width: 640px) 100vw, 300px"
                                        />
                                    </div>
                                    <p className="text-zinc-400 text-lg mb-2">Aucune image supplémentaire disponible</p>
                                    <p className="text-zinc-600 text-sm mb-6">Vous pouvez utiliser l'image par défaut de cette race</p>
                                    <button
                                        onClick={() => handleImageSelect(raceDefaultImage)}
                                        className="px-6 py-3 bg-[#c0a080] hover:bg-[#e0c0a0] text-black font-bold rounded-lg transition-all shadow-lg hover:shadow-xl"
                                    >
                                        Utiliser cette image
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center">
                                    <ImageIcon className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
                                    <p className="text-zinc-500 text-lg">Aucune image disponible</p>
                                    <p className="text-zinc-600 text-sm mt-2">
                                        Essayez de basculer vers {mode === 'token' ? 'Photos' : 'Tokens'}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

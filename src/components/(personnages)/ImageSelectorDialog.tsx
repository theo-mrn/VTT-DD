"use client"

import React, { useState, useEffect } from 'react'
import { X, Upload, User, ImageIcon } from 'lucide-react'

interface ImageSelectorDialogProps {
    isOpen: boolean
    onClose: () => void
    onSelectImage: (imageUrl: string) => void
    currentImage?: string
    initialRace?: string
}

interface AssetMapping {
    name: string
    path: string
    category: string
    type: string
}

const RACES = ['Drakonide', 'Elfe', 'Halfelin', 'Humain', 'Minotaure', 'Nain', 'Orc']

export function ImageSelectorDialog({ isOpen, onClose, onSelectImage, currentImage, initialRace }: ImageSelectorDialogProps) {
    const [mode, setMode] = useState<'token' | 'image'>('token')
    const [selectedRace, setSelectedRace] = useState(initialRace || 'Humain')
    const [selectedCategory, setSelectedCategory] = useState('all')
    const [assets, setAssets] = useState<AssetMapping[]>([])
    const [photos, setPhotos] = useState<AssetMapping[]>([])
    const [loading, setLoading] = useState(false)

    // Load assets on mount
    useEffect(() => {
        if (!isOpen) return

        setLoading(true)

        // Load both tokens (from JSON) and photos (from API)
        Promise.all([
            fetch('/asset-mappings.json').then(res => res.json()),
            fetch('/api/assets?category=Photos').then(res => res.json())
        ])
            .then(([mappings, photosData]) => {
                // Filter Assets (character portraits) from JSON
                const assetFiles = mappings.filter((m: AssetMapping) => m.category === 'Assets')
                setAssets(assetFiles)

                // Use photos from API
                setPhotos(photosData.assets || [])

                setLoading(false)
            })
            .catch(err => {
                console.error('Failed to load assets:', err)
                setLoading(false)
            })
    }, [isOpen])

    const handleImageSelect = (imageUrl: string) => {
        onSelectImage(imageUrl)
        onClose()
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = (event) => {
                const imageUrl = event.target?.result as string
                handleImageSelect(imageUrl)
            }
            reader.readAsDataURL(file)
        }
    }

    // Get images based on current mode
    const getDisplayedImages = () => {
        if (mode === 'token') {
            // Filter assets by selected race
            return assets.filter(asset => {
                const match = asset.name.match(/^([A-Za-z]+)\d+\.png$/)
                return match && match[1] === selectedRace
            })
        } else {
            // Filter photos by category
            if (selectedCategory === 'all') {
                return photos
            }
            return photos.filter(p => p.category === selectedCategory)
        }
    }

    // Get unique photo categories
    const getPhotoCategories = () => {
        const categories = new Set(photos.map(p => p.category))
        return Array.from(categories).sort()
    }

    if (!isOpen) return null

    const displayedImages = getDisplayedImages()
    const photoCategories = getPhotoCategories()

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="relative w-[95vw] h-[90vh] max-w-[1600px] bg-gradient-to-br from-[var(--bg-dark)] to-[var(--bg-darker)] rounded-2xl border-2 shadow-2xl overflow-hidden" style={{ borderColor: 'color-mix(in srgb, var(--accent-brown) 30%, transparent)' }}>

                {/* Header */}
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-[var(--border-color)] to-transparent p-6 border-b z-10" style={{ borderColor: 'color-mix(in srgb, var(--accent-brown) 20%, transparent)' }}>
                    <div className="flex items-center justify-between">
                        <h2 className="text-3xl font-bold text-[var(--accent-brown)]">Sélectionner une image</h2>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-[color-mix(in_srgb,var(--accent-brown)_20%,transparent)] text-[var(--accent-brown)] transition-colors"
                            style={{ background: 'color-mix(in srgb, var(--accent-brown) 10%, transparent)' }}
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Mode Toggle */}
                    <div className="flex gap-4 mt-6">
                        <button
                            onClick={() => setMode('token')}
                            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-all ${mode === 'token'
                                ? 'bg-[var(--accent-brown)] text-black shadow-lg scale-105'
                                : 'bg-[var(--border-color)] text-gray-400 hover:bg-[var(--border-color)] hover:text-white border border-[#444]'
                                }`}
                        >
                            <User className="w-5 h-5" />
                            Tokens de personnage
                        </button>
                        <button
                            onClick={() => setMode('image')}
                            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-all ${mode === 'image'
                                ? 'bg-[var(--accent-brown)] text-black shadow-lg scale-105'
                                : 'bg-[var(--border-color)] text-gray-400 hover:bg-[var(--border-color)] hover:text-white border border-[#444]'
                                }`}
                        >
                            <ImageIcon className="w-5 h-5" />
                            Photos
                        </button>

                        {/* Upload Button */}
                        <label className="ml-auto cursor-pointer">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <div className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)] text-black font-bold rounded-lg hover:shadow-xl hover:scale-105 transition-all">
                                <Upload className="w-5 h-5" />
                                Uploader une image
                            </div>
                        </label>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex h-full pt-40 pb-6">
                    {/* Sidebar - Filters */}
                    <div className="w-64 bg-[var(--bg-dark)] border-r p-6 overflow-y-auto" style={{ borderColor: 'color-mix(in srgb, var(--accent-brown) 20%, transparent)' }}>
                        <h3 className="text-lg font-bold text-[var(--accent-brown)] mb-4">
                            {mode === 'token' ? 'Races' : 'Catégories'}
                        </h3>

                        <div className="space-y-2">
                            {mode === 'token' ? (
                                // Race filters for tokens
                                RACES.map(race => (
                                    <button
                                        key={race}
                                        onClick={() => setSelectedRace(race)}
                                        className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all ${selectedRace === race
                                            ? 'bg-[var(--accent-brown)] text-black shadow-md'
                                            : 'bg-[var(--border-color)] text-gray-300 hover:bg-[var(--border-color)] hover:text-white'
                                            }`}
                                    >
                                        {race}
                                    </button>
                                ))
                            ) : (
                                // Category filters for photos
                                <>
                                    <button
                                        onClick={() => setSelectedCategory('all')}
                                        className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all ${selectedCategory === 'all'
                                            ? 'bg-[var(--accent-brown)] text-black shadow-md'
                                            : 'bg-[var(--border-color)] text-gray-300 hover:bg-[var(--border-color)] hover:text-white'
                                            }`}
                                    >
                                        Toutes
                                    </button>
                                    {photoCategories.map(category => (
                                        <button
                                            key={category}
                                            onClick={() => setSelectedCategory(category)}
                                            className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all ${selectedCategory === category
                                                ? 'bg-[var(--accent-brown)] text-black shadow-md'
                                                : 'bg-[var(--border-color)] text-gray-300 hover:bg-[var(--border-color)] hover:text-white'
                                                }`}
                                        >
                                            {category.replace('Photos/', '')}
                                        </button>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Image Grid */}
                    <div className="flex-1 px-8 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-[var(--accent-brown)] text-xl">Chargement...</div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 pb-6">
                                {displayedImages.map((asset, index) => (
                                    <div
                                        key={asset.path}
                                        onClick={() => handleImageSelect(asset.path)}
                                        className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-105 hover:shadow-2xl ${currentImage === asset.path
                                            ? 'border-[var(--accent-brown)] ring-4 ring-[color-mix(in_srgb,var(--accent-brown)_50%,transparent)] shadow-lg shadow-[color-mix(in_srgb,var(--accent-brown)_30%,transparent)]'
                                            : 'border-[#444] hover:border-[var(--accent-brown)]'
                                            }`}
                                    >
                                        <img
                                            src={asset.path}
                                            alt={asset.name}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />

                                        {/* Overlay on hover */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                            <div className="absolute bottom-0 left-0 right-0 p-3">
                                                <p className="text-white text-sm font-medium truncate">
                                                    {asset.name.replace(/\.[^.]+$/, '')}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Selected indicator */}
                                        {currentImage === asset.path && (
                                            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--accent-brown) 20%, transparent)' }}>
                                                <div className="bg-[var(--accent-brown)] rounded-full p-3 shadow-lg">
                                                    <svg className="w-8 h-8 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {!loading && displayedImages.length === 0 && (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center">
                                    <ImageIcon className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                                    <p className="text-gray-400 text-lg">Aucune image disponible</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

"use client"

import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ImagePlus, MapPin, Upload, Map } from 'lucide-react'

interface City {
    id: string
    name: string
    icon?: string
    backgroundUrl?: string
}

interface NoBackgroundModalProps {
    isOpen: boolean
    onClose: () => void
    onUploadBackground: () => void
    cities: City[]
    onSelectCity: (cityId: string) => void
    selectedCityId: string | null // null = world map
}

export function NoBackgroundModal({
    isOpen,
    onClose,
    onUploadBackground,
    cities,
    onSelectCity,
    selectedCityId
}: NoBackgroundModalProps) {
    // Filtrer les villes qui ont un fond
    const citiesWithBackground = cities.filter(city => city.backgroundUrl)

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-[#1a1a1a] border-[#333] text-[#e0e0e0] max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-[#c0a080] flex items-center gap-2">
                        <ImagePlus className="w-5 h-5" />
                        Aucun fond de carte
                    </DialogTitle>
                    <DialogDescription className="text-gray-400">
                        {selectedCityId
                            ? "Cette ville n'a pas encore de fond de carte. Importez-en un ou naviguez vers une autre ville."
                            : "La carte principale n'a pas encore de fond. Importez-en un ou naviguez vers une ville existante."
                        }
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Option 1: Upload Background */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                            Option 1 : Importer un fond
                        </h3>
                        <Button
                            onClick={() => {
                                onUploadBackground()
                                onClose()
                            }}
                            className="w-full bg-[#c0a080] text-black font-bold hover:bg-[#b09070] h-12"
                        >
                            <Upload className="w-5 h-5 mr-2" />
                            Importer une image
                        </Button>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-[#333]" />
                        <span className="text-xs text-gray-500 uppercase">ou</span>
                        <div className="flex-1 h-px bg-[#333]" />
                    </div>

                    {/* Option 2: Navigate to another city */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                            Option 2 : Aller vers une autre ville
                        </h3>

                        {citiesWithBackground.length > 0 ? (
                            <div className="grid gap-2 max-h-48 overflow-y-auto">
                                {citiesWithBackground.map(city => (
                                    <button
                                        key={city.id}
                                        onClick={() => {
                                            onSelectCity(city.id)
                                            onClose()
                                        }}
                                        className="flex items-center gap-3 p-3 bg-[#222] rounded-lg border border-[#333] hover:border-[#c0a080] hover:bg-[#2a2a2a] transition-all text-left group"
                                    >
                                        <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] flex items-center justify-center text-xl border border-[#444] group-hover:border-[#c0a080]">
                                            {city.icon || '🏰'}
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-medium text-white group-hover:text-[#c0a080]">{city.name}</p>
                                            <p className="text-xs text-gray-500">Fond disponible</p>
                                        </div>
                                        <MapPin className="w-4 h-4 text-gray-500 group-hover:text-[#c0a080]" />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="p-4 bg-[#222] rounded-lg border border-[#333] text-center">
                                <Map className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                                <p className="text-sm text-gray-500">
                                    Aucune ville avec un fond disponible.
                                </p>
                                <p className="text-xs text-gray-600 mt-1">
                                    Créez des villes depuis la carte du monde.
                                </p>
                            </div>
                        )}

                        {/* Return to World Map option if in a city */}
                        {selectedCityId && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    onSelectCity('') // Empty string to go back to world map
                                    onClose()
                                }}
                                className="w-full border-[#444] text-gray-300 hover:bg-[#222] hover:text-white"
                            >
                                <Map className="w-4 h-4 mr-2" />
                                Retourner à la carte du monde
                            </Button>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="text-gray-400 hover:text-white hover:bg-[#222]"
                    >
                        Fermer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

"use client"

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Upload, Check } from 'lucide-react'

interface ImageSelectorDialogProps {
    isOpen: boolean
    onClose: () => void
    onSelectImage: (imageUrl: string) => void
    currentImage?: string
}

const RACES = [
    { name: 'Drakonide', count: 10 },
    { name: 'Elfe', count: 10 },
    { name: 'Halfelin', count: 10 },
    { name: 'Humain', count: 10 },
    { name: 'Minotaure', count: 10 },
    { name: 'Nain', count: 10 },
    { name: 'Orc', count: 10 }
]

export function ImageSelectorDialog({ isOpen, onClose, onSelectImage, currentImage }: ImageSelectorDialogProps) {
    const [selectedRace, setSelectedRace] = useState('Humain')
    const [selectedImage, setSelectedImage] = useState<string | null>(null)

    const handleImageSelect = (imageUrl: string) => {
        setSelectedImage(imageUrl)
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

    const getImagesForRace = (race: string, count: number) => {
        return Array.from({ length: count }, (_, i) => `/Assets/${race}${i + 1}.png`)
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-[#1a1a1a] border-[#333] text-[#e0e0e0] w-[85vw] sm:max-w-[1200px] max-h-[85vh] overflow-hidden p-6">
                <DialogHeader className="pb-4">
                    <DialogTitle className="text-[#c0a080] text-xl font-bold">
                        Choisir une image de personnage
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-4 overflow-hidden">
                    {/* Upload Button */}
                    <div className="flex justify-center">
                        <label className="cursor-pointer">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <div className="flex items-center gap-2 px-6 py-3 bg-[#c0a080] text-black font-bold rounded-lg hover:bg-[#b09070] transition-colors">
                                <Upload className="w-5 h-5" />
                                Uploader ma propre image
                            </div>
                        </label>
                    </div>

                    <div className="text-center text-sm text-gray-400">ou choisissez parmi les images disponibles</div>

                    {/* Race Tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {RACES.map((race) => (
                            <Button
                                key={race.name}
                                variant={selectedRace === race.name ? 'default' : 'outline'}
                                onClick={() => setSelectedRace(race.name)}
                                className={`shrink-0 ${selectedRace === race.name
                                    ? 'bg-[#c0a080] text-black hover:bg-[#b09070]'
                                    : 'border-[#444] text-gray-300 hover:bg-[#222] hover:text-white'
                                    }`}
                            >
                                {race.name}
                            </Button>
                        ))}
                    </div>

                    {/* Image Grid */}
                    <ScrollArea className="h-[480px] w-full">
                        <div className="grid grid-cols-5 gap-4 pr-4">
                            {getImagesForRace(
                                selectedRace,
                                RACES.find((r) => r.name === selectedRace)?.count || 10
                            ).map((imageUrl, index) => (
                                <div
                                    key={imageUrl}
                                    onClick={() => handleImageSelect(imageUrl)}
                                    className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all hover:scale-105 ${currentImage === imageUrl || selectedImage === imageUrl
                                        ? 'border-[#c0a080] ring-2 ring-[#c0a080]/50'
                                        : 'border-[#333] hover:border-[#c0a080]/50'
                                        }`}
                                >
                                    <img
                                        src={imageUrl}
                                        alt={`${selectedRace} ${index + 1}`}
                                        className="w-full h-full object-cover"
                                    />
                                    {(currentImage === imageUrl || selectedImage === imageUrl) && (
                                        <div className="absolute inset-0 bg-[#c0a080]/20 flex items-center justify-center">
                                            <div className="bg-[#c0a080] rounded-full p-2">
                                                <Check className="w-5 h-5 text-black" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    )
}

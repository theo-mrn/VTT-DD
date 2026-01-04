"use client"

import React, { useState, useEffect } from 'react'
import { Volume2, Sliders, X, Music, MapPin, Film, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'

interface AudioMixerProps {
    isOpen: boolean
    onClose: () => void
}

// Hook pour gérer les volumes audio
export const useAudioMixer = () => {
    // Initialize from localStorage or use defaults
    const [volumes, setVolumes] = useState(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('audioMixerVolumes')
            if (saved) {
                try {
                    const parsed = JSON.parse(saved)
                    return parsed
                } catch (e) {
                    console.error('Error loading audio mixer preferences:', e)
                }
            }
        }
        // Default values
        return {
            quickSounds: 1,
            musicZones: 1,
            backgroundAudio: 1,
            backgroundMusic: 1
        }
    })

    // Listen for volume changes from other instances
    useEffect(() => {
        const handleVolumeChange = (e: Event) => {
            const customEvent = e as CustomEvent
            if (customEvent.detail) {
                setVolumes(customEvent.detail)
            }
        }

        window.addEventListener('audioMixerVolumeChange', handleVolumeChange)
        return () => window.removeEventListener('audioMixerVolumeChange', handleVolumeChange)
    }, [])

    // Sauvegarder les préférences
    const updateVolume = (key: keyof typeof volumes, value: number) => {
        const newVolumes = { ...volumes, [key]: value }
        setVolumes(newVolumes)
        localStorage.setItem('audioMixerVolumes', JSON.stringify(newVolumes))

        // Dispatch event to sync other instances
        window.dispatchEvent(new CustomEvent('audioMixerVolumeChange', { detail: newVolumes }))
    }

    return { volumes, updateVolume }
}

export function AudioMixerPanel({ isOpen, onClose }: AudioMixerProps) {
    const { volumes, updateVolume } = useAudioMixer()

    if (!isOpen) return null

    const audioChannels = [
        {
            id: 'quickSounds' as const,
            label: 'Sons Rapides',
            icon: Zap,
        },
        {
            id: 'musicZones' as const,
            label: 'Zones Audio',
            icon: MapPin,
        },
        {
            id: 'backgroundAudio' as const,
            label: 'Audio de Fond',
            icon: Film,
        },
        {
            id: 'backgroundMusic' as const,
            label: 'Musique',
            icon: Music,
        }
    ]

    return (
        <div className="fixed right-0 top-16 h-auto w-72 bg-[#141414] border border-[#333] z-50 flex flex-col shadow-2xl rounded-l-xl overflow-hidden mr-2">

            {/* Header Compact */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] bg-[#1a1a1a]">
                <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#c0a080]" />
                    <span className="text-sm font-bold text-[#e0e0e0] uppercase tracking-wider">Mixeur</span>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="h-6 w-6 text-gray-500 hover:text-white hover:bg-[#333]"
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Channels List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {audioChannels.map((channel) => {
                    const Icon = channel.icon
                    const volume = volumes[channel.id]
                    const isMuted = volume === 0

                    return (
                        <div
                            key={channel.id}
                            className="group bg-[#1a1a1a] hover:bg-[#222] border border-transparent hover:border-[#333] rounded-md p-3 transition-all"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <Icon className={`w-3.5 h-3.5 ${isMuted ? 'text-gray-600' : 'text-[#c0a080]'}`} />
                                    <Label className={`text-xs font-medium cursor-pointer ${isMuted ? 'text-gray-500' : 'text-gray-300 group-hover:text-white'}`}>
                                        {channel.label}
                                    </Label>
                                </div>
                                <span className="text-[10px] font-mono text-gray-500 w-8 text-right">
                                    {Math.round(volume * 100)}%
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <Slider
                                    value={[volume * 100]}
                                    onValueChange={(values) => updateVolume(channel.id, values[0] / 100)}
                                    max={100}
                                    step={1}
                                    className={`flex-1 ${isMuted ? 'opacity-50' : 'opacity-100'} [&>.relative>.absolute]:bg-[#c0a080]`}
                                />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => updateVolume(channel.id, volume > 0 ? 0 : 1)}
                                    className={`h-5 w-5 rounded-full ${isMuted ? 'text-red-900 bg-red-900/10' : 'text-gray-500 hover:text-white'}`}
                                    title={isMuted ? "Réactiver" : "Couper"}
                                >
                                    {isMuted ? (
                                        <div className="w-2 h-2 rounded-full bg-red-500/50" />
                                    ) : (
                                        <Volume2 className="w-3 h-3" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Footer Compact */}
            <div className="p-2 border-t border-[#333] bg-[#1a1a1a]">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        Object.keys(volumes).forEach((key) => {
                            updateVolume(key as keyof typeof volumes, 1)
                        })
                    }}
                    className="w-full h-7 text-[10px] uppercase tracking-widest text-[#c0a080] hover:bg-[#c0a080]/10 hover:text-[#c0a080]"
                >
                    Réinitialiser
                </Button>
            </div>
        </div>
    )
}

"use client"

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff, Users, Check, UserCheck, Ghost } from 'lucide-react'
import { type NPC } from '@/components/(personnages)/personnages'

interface PlaceNPCModalProps {
    isOpen: boolean
    template: NPC | null
    onClose: () => void
    onConfirm: (config: { nombre: number; visibility: 'visible' | 'hidden' | 'ally' | 'invisible' }) => void
}

export function PlaceNPCModal({ isOpen, template, onClose, onConfirm }: PlaceNPCModalProps) {
    const [nombre, setNombre] = useState(1)
    const [visibility, setVisibility] = useState<'visible' | 'hidden' | 'ally' | 'invisible'>('visible')

    const handleConfirm = () => {
        onConfirm({ nombre, visibility })
        // Reset for next time
        setNombre(1)
        setVisibility('visible')
    }

    const handleClose = () => {
        onClose()
        // Reset
        setNombre(1)
        setVisibility('visible')
    }

    if (!template) return null

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="bg-[#1a1a1a] border-[#333] text-[#e0e0e0] max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-[#c0a080] flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Placer {template.Nomperso}
                    </DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Configurez les paramètres avant de placer ce PNJ sur la carte
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Template Preview */}
                    <div className="flex items-center gap-3 p-3 bg-[#222] rounded-lg border border-[#333]">
                        <div className="w-16 h-16 rounded-full border-2 border-[#c0a080] overflow-hidden flex-shrink-0 bg-[#1a1a1a]">
                            {template.imageURL2 ? (
                                <img
                                    src={template.imageURL2}
                                    alt={template.Nomperso}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Users className="w-8 h-8 text-gray-600" />
                                </div>
                            )}
                        </div>
                        <div>
                            <h3 className="font-bold text-white">{template.Nomperso}</h3>
                            <p className="text-xs text-[#c0a080]">Niveau {template.niveau}</p>
                            <div className="flex gap-2 mt-1 text-xs text-gray-400">
                                <span>PV: {template.PV_Max}</span>
                                <span>•</span>
                                <span>Def: {template.Defense}</span>
                            </div>
                        </div>
                    </div>

                    {/* Nombre */}
                    <div className="space-y-2">
                        <Label className="text-gray-400 text-sm uppercase">Nombre d'instances</Label>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setNombre(Math.max(1, nombre - 1))}
                                className="h-9 w-9 p-0 border-[#444] hover:bg-[#222] text-white"
                            >
                                -
                            </Button>
                            <Input
                                type="number"
                                min="1"
                                max="20"
                                value={nombre}
                                onChange={(e) => setNombre(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                                className="text-center bg-[#252525] border-[#444] text-[#e0e0e0] h-9 font-mono"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setNombre(Math.min(20, nombre + 1))}
                                className="h-9 w-9 p-0 border-[#444] hover:bg-[#222] text-white"
                            >
                                +
                            </Button>
                        </div>
                        <p className="text-xs text-gray-500">
                            {nombre > 1 ? `${nombre} PNJ seront placés` : '1 PNJ sera placé'}
                        </p>
                    </div>

                    {/* Visibilité */}
                    <div className="space-y-3">
                        <Label className="text-gray-400 text-sm uppercase">Visibilité</Label>
                        <div className="grid grid-cols-4 gap-2">
                            <Button
                                type="button"
                                variant={visibility === 'visible' ? 'default' : 'outline'}
                                onClick={() => setVisibility('visible')}
                                className={`h-auto p-3 flex flex-col items-center gap-2 ${visibility === 'visible'
                                    ? 'bg-[#c0a080] text-black hover:bg-[#b09070]'
                                    : 'border-[#444] hover:bg-[#222] text-white'
                                    }`}
                            >
                                <Eye className="w-5 h-5" />
                                <div className="text-center">
                                    <p className="text-xs font-bold">Visible</p>
                                </div>
                            </Button>
                            <Button
                                type="button"
                                variant={visibility === 'hidden' ? 'default' : 'outline'}
                                onClick={() => setVisibility('hidden')}
                                className={`h-auto p-3 flex flex-col items-center gap-2 ${visibility === 'hidden'
                                    ? 'bg-[#c0a080] text-black hover:bg-[#b09070]'
                                    : 'border-[#444] hover:bg-[#222] text-white'
                                    }`}
                            >
                                <EyeOff className="w-5 h-5" />
                                <div className="text-center">
                                    <p className="text-xs font-bold">Caché</p>
                                </div>
                            </Button>
                            <Button
                                type="button"
                                variant={visibility === 'ally' ? 'default' : 'outline'}
                                onClick={() => setVisibility('ally')}
                                className={`h-auto p-3 flex flex-col items-center gap-2 ${visibility === 'ally'
                                    ? 'bg-[#c0a080] text-black hover:bg-[#b09070]'
                                    : 'border-[#444] hover:bg-[#222] text-white'
                                    }`}
                            >
                                <UserCheck className="w-5 h-5" />
                                <div className="text-center">
                                    <p className="text-xs font-bold">Allié</p>
                                </div>
                            </Button>
                            <Button
                                type="button"
                                variant={visibility === 'invisible' ? 'default' : 'outline'}
                                onClick={() => setVisibility('invisible')}
                                className={`h-auto p-3 flex flex-col items-center gap-2 ${visibility === 'invisible'
                                    ? 'bg-[#c0a080] text-black hover:bg-[#b09070]'
                                    : 'border-[#444] hover:bg-[#222] text-white'
                                    }`}
                            >
                                <Ghost className="w-5 h-5" />
                                <div className="text-center">
                                    <p className="text-xs font-bold">Invisible</p>
                                </div>
                            </Button>
                        </div>
                    </div>
                </div>

                <DialogFooter className="flex gap-2">
                    <Button
                        variant="ghost"
                        onClick={handleClose}
                        className="text-gray-400 hover:text-white hover:bg-[#222]"
                    >
                        Annuler
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        className="bg-[#c0a080] text-black font-bold hover:bg-[#b09070]"
                    >
                        <Check className="w-4 h-4 mr-2" />
                        Placer sur la carte
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

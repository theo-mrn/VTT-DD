"use client"

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Eye, EyeOff, Package, Check, Ghost, Hand } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { type ObjectTemplate, type Character, type LootItem } from '@/app/[roomid]/map/types'

// Mêmes catégories que AddItemDialog / l'inventaire — la valeur voyage telle quelle jusqu'à
// Inventaire/{roomId}/{perso} au ramassage (LootComponent), donc doit rester compatible.
const ITEM_CATEGORIES = ['armes-contact', 'armes-distance', 'armures', 'potions', 'bourse', 'nourriture', 'autre']

interface PlaceObjectModalProps {
    isOpen: boolean
    template: ObjectTemplate | null
    players: Character[]
    onClose: () => void
    onConfirm: (config: { nombre: number; visibility: 'visible' | 'hidden' | 'custom'; visibleToPlayerIds: string[]; pickupItem?: LootItem }) => void
}

export function PlaceObjectModal({ isOpen, template, players, onClose, onConfirm }: PlaceObjectModalProps) {
    const [nombre, setNombre] = useState(1)
    const [visibility, setVisibility] = useState<'visible' | 'hidden' | 'custom'>('visible')
    const [visibleToPlayerIds, setVisibleToPlayerIds] = useState<string[]>([])
    // Section "objet ramassable" — désactivée par défaut : l'objet reste un simple décor.
    const [isPickup, setIsPickup] = useState(false)
    const [itemName, setItemName] = useState('')
    const [itemCategory, setItemCategory] = useState('autre')
    const [itemQuantity, setItemQuantity] = useState(1)
    const [itemDescription, setItemDescription] = useState('')

    const resetForm = () => {
        setNombre(1)
        setVisibility('visible')
        setVisibleToPlayerIds([])
        setIsPickup(false)
        setItemName('')
        setItemCategory('autre')
        setItemQuantity(1)
        setItemDescription('')
    }

    const handleConfirm = () => {
        let pickupItem: LootItem | undefined
        if (isPickup && template) {
            pickupItem = {
                id: uuidv4(),
                name: itemName.trim() || template.name,
                quantity: Math.max(1, itemQuantity),
                category: itemCategory,
                image: template.imageUrl || undefined,
                ...(itemDescription.trim() && { description: itemDescription.trim() }),
            }
        }
        onConfirm({ nombre, visibility, visibleToPlayerIds, pickupItem })
        resetForm()
    }

    const handleClose = () => {
        onClose()
        resetForm()
    }

    if (!template) return null

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="bg-[#1a1a1a] border-[#333] text-[#e0e0e0] max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-[#80c0a0] flex items-center gap-2">
                        <Package className="w-5 h-5" />
                        Placer {template.name}
                    </DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Configurez les paramètres avant de placer cet objet sur la carte
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Template Preview */}
                    <div className="flex items-center gap-3 p-3 bg-[#222] rounded-lg border border-[#333]">
                        <div className="w-16 h-16 rounded-md border border-[#80c0a0] overflow-hidden flex-shrink-0 bg-[#1a1a1a]">
                            {template.imageUrl ? (
                                <img
                                    src={template.imageUrl}
                                    alt={template.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Package className="w-8 h-8 text-gray-600" />
                                </div>
                            )}
                        </div>
                        <div>
                            <h3 className="font-bold text-white">{template.name}</h3>
                            {template.category && <p className="text-xs text-[#80c0a0]">{template.category}</p>}
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
                            {nombre > 1 ? `${nombre} objets seront placés` : '1 objet sera placé'}
                        </p>
                    </div>

                    {/* Visibilité */}
                    <div className="space-y-3">
                        <Label className="text-gray-400 text-sm uppercase">Visibilité</Label>
                        <div className="grid grid-cols-3 gap-2">
                            <Button
                                type="button"
                                variant={visibility === 'visible' ? 'default' : 'outline'}
                                onClick={() => setVisibility('visible')}
                                className={`h-auto p-3 flex flex-col items-center gap-2 ${visibility === 'visible'
                                    ? 'bg-[#80c0a0] text-black hover:bg-[#90d0b0]'
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
                                    ? 'bg-[#80c0a0] text-black hover:bg-[#90d0b0]'
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
                                variant={visibility === 'custom' ? 'default' : 'outline'}
                                onClick={() => setVisibility('custom')}
                                className={`h-auto p-3 flex flex-col items-center gap-2 ${visibility === 'custom'
                                    ? 'bg-[#80c0a0] text-black hover:bg-[#90d0b0]'
                                    : 'border-[#444] hover:bg-[#222] text-white'
                                    }`}
                            >
                                <Check className="w-5 h-5" />
                                <div className="text-center">
                                    <p className="text-xs font-bold">Custom</p>
                                </div>
                            </Button>
                        </div>

                        {/* Player Selection for Custom Visibility */}
                        {visibility === 'custom' && (
                            <div className="mt-2 bg-[#1a1a1a] p-2 rounded border border-[#444] space-y-1 max-h-40 overflow-y-auto">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Visible pour:</p>
                                {players.length === 0 ? (
                                    <p className="text-xs text-gray-500 italic">Aucun joueur disponible</p>
                                ) : (
                                    players.map(player => {
                                        const isSelected = visibleToPlayerIds.includes(player.id);
                                        return (
                                            <div
                                                key={player.id}
                                                className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-all duration-150 ${isSelected ? 'bg-[#80c0a0]/20 border border-[#80c0a0]/50' : 'hover:bg-[#252525] border border-transparent'
                                                    }`}
                                                onClick={() => {
                                                    setVisibleToPlayerIds(prev =>
                                                        prev.includes(player.id)
                                                            ? prev.filter(id => id !== player.id)
                                                            : [...prev, player.id]
                                                    );
                                                }}
                                            >
                                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-[#80c0a0] border-[#80c0a0]' : 'border-gray-500 bg-transparent'
                                                    }`}>
                                                    {isSelected && <Check size={12} className="text-black" strokeWidth={3} />}
                                                </div>
                                                {player.image && (typeof player.image === 'object' ? player.image.src : player.image) ? (
                                                    <img src={typeof player.image === 'object' ? player.image.src : player.image as string} className="w-6 h-6 rounded-full object-cover" alt={player.name} />
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full bg-blue-900 flex items-center justify-center text-[10px] text-white font-bold">
                                                        {player.name[0]}
                                                    </div>
                                                )}
                                                <span className="text-xs text-gray-300 flex-1">{player.name}</span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>

                    {/* Objet ramassable — l'objet posé portera items:[item] + type:'item' et pourra être
                        pris dans l'inventaire d'un joueur (LootComponent), puis disparaîtra une fois vidé. */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-gray-400 text-sm uppercase flex items-center gap-2">
                                <Hand className="w-4 h-4" />
                                Objet ramassable
                            </Label>
                            <Switch checked={isPickup} onCheckedChange={setIsPickup} />
                        </div>
                        {isPickup && (
                            <div className="bg-[#1a1a1a] p-3 rounded border border-[#444] space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-gray-500 uppercase">Nom de l&apos;objet</Label>
                                        <Input
                                            value={itemName}
                                            onChange={(e) => setItemName(e.target.value)}
                                            placeholder={template.name}
                                            className="bg-[#252525] border-[#444] text-[#e0e0e0] h-9"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-gray-500 uppercase">Catégorie</Label>
                                        <Select value={itemCategory} onValueChange={setItemCategory}>
                                            <SelectTrigger className="bg-[#252525] border-[#444] text-[#e0e0e0] h-9">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#252525] border-[#444] text-[#e0e0e0]">
                                                {ITEM_CATEGORIES.map((cat) => (
                                                    <SelectItem key={cat} value={cat} className="capitalize">{cat}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] text-gray-500 uppercase">Description (optionnel)</Label>
                                    <Input
                                        value={itemDescription}
                                        onChange={(e) => setItemDescription(e.target.value)}
                                        placeholder="ex: Un blaster en parfait état"
                                        className="bg-[#252525] border-[#444] text-[#e0e0e0] h-9"
                                    />
                                </div>
                                <div className="space-y-1 w-24">
                                    <Label className="text-[10px] text-gray-500 uppercase">Quantité</Label>
                                    <Input
                                        type="number" min="1"
                                        value={itemQuantity}
                                        onChange={(e) => setItemQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="bg-[#252525] border-[#444] text-[#e0e0e0] h-9 text-center"
                                    />
                                </div>
                            </div>
                        )}
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
                        className="bg-[#80c0a0] text-black font-bold hover:bg-[#90d0b0]"
                    >
                        <Check className="w-4 h-4 mr-2" />
                        Placer sur la carte
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

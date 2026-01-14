"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db, collection, onSnapshot, query } from '@/lib/firebase';
import type { Portal, Scene } from '@/app/[roomid]/map/types';
import { ArrowUpDown, DoorOpen, Hexagon, ArrowDownUp } from 'lucide-react';

interface PortalConfigDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    portal: Partial<Portal> | null;
    onSave: (portal: Partial<Portal>) => void;
    roomId: string;
    currentCityId: string | null;
}

const ICON_TYPES = [
    { value: 'stairs', label: 'Escaliers', icon: ArrowUpDown },
    { value: 'door', label: 'Porte', icon: DoorOpen },
    { value: 'portal', label: 'Portail', icon: Hexagon },
    { value: 'ladder', label: 'Échelle', icon: ArrowDownUp },
] as const;

const COLORS = [
    { value: '#3b82f6', label: 'Bleu' },
    { value: '#8b5cf6', label: 'Violet' },
    { value: '#ec4899', label: 'Rose' },
    { value: '#f59e0b', label: 'Orange' },
    { value: '#10b981', label: 'Vert' },
    { value: '#ef4444', label: 'Rouge' },
];

export default function PortalConfigDialog({
    open,
    onOpenChange,
    portal,
    onSave,
    roomId,
    currentCityId
}: PortalConfigDialogProps) {
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [formData, setFormData] = useState<Partial<Portal>>({
        name: '',
        radius: 50,
        targetSceneId: '',
        targetX: 0,
        targetY: 0,
        iconType: 'portal',
        visible: true,
        color: '#3b82f6',
        ...portal
    });

    // Load available scenes
    useEffect(() => {
        if (!roomId) return;
        const unsubscribe = onSnapshot(
            collection(db, `cartes/${roomId}/cities`),
            (snapshot) => {
                const loadedScenes: Scene[] = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    loadedScenes.push({
                        id: doc.id,
                        name: data.name,
                        description: data.description,
                        visibleToPlayers: data.visibleToPlayers,
                        backgroundUrl: data.backgroundUrl,
                        groupId: data.groupId,
                        x: data.x,
                        y: data.y
                    });
                });
                // Filter out current scene
                setScenes(loadedScenes.filter(s => s.id !== currentCityId));
            }
        );
        return () => unsubscribe();
    }, [roomId, currentCityId]);

    useEffect(() => {
        if (portal) {
            setFormData({
                name: '',
                radius: 50,
                targetSceneId: '',
                targetX: 0,
                targetY: 0,
                iconType: 'portal',
                visible: true,
                color: '#3b82f6',
                ...portal
            });
        }
    }, [portal]);

    const handleSave = () => {
        if (!formData.name || !formData.targetSceneId) {
            return;
        }
        onSave(formData);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#111] border border-white/10 text-white sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-white">
                        {portal?.id ? 'Modifier le portail' : 'Nouveau portail'}
                    </DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Configurez une zone de transition vers une autre scène
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Name */}
                    <div className="space-y-2">
                        <Label className="text-white">Nom du portail</Label>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Ex: Escaliers vers le sous-sol"
                            className="bg-white/5 border-white/10 text-white"
                        />
                    </div>

                    {/* Target Scene */}
                    <div className="space-y-2">
                        <Label className="text-white">Scène de destination</Label>
                        <Select
                            value={formData.targetSceneId}
                            onValueChange={(value) => setFormData({ ...formData, targetSceneId: value })}
                        >
                            <SelectTrigger className="bg-white/5 border-white/10 text-white">
                                <SelectValue placeholder="Sélectionner une scène..." />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a1a1a] border-white/10 text-white">
                                {scenes.map((scene) => (
                                    <SelectItem key={scene.id} value={scene.id}>
                                        {scene.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Radius */}
                    <div className="space-y-2">
                        <Label className="text-white">Rayon (pixels)</Label>
                        <Input
                            type="number"
                            value={formData.radius}
                            onChange={(e) => setFormData({ ...formData, radius: parseInt(e.target.value) || 50 })}
                            className="bg-white/5 border-white/10 text-white"
                            min={20}
                            max={200}
                        />
                        <p className="text-xs text-gray-400">Zone d'activation du portail (20-200px)</p>
                    </div>

                    {/* Visibility */}
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="visible"
                            checked={formData.visible}
                            onChange={(e) => setFormData({ ...formData, visible: e.target.checked })}
                            className="w-4 h-4 rounded border-white/10 bg-white/5"
                        />
                        <Label htmlFor="visible" className="text-white cursor-pointer">
                            Visible aux joueurs
                        </Label>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-white/50 hover:text-white">
                        Annuler
                    </Button>
                    <Button
                        onClick={handleSave}
                        className="bg-[#c0a080] text-black hover:bg-[#d4b594] font-bold"
                        disabled={!formData.name || !formData.targetSceneId}
                    >
                        {portal?.id ? 'Enregistrer' : 'Créer'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ConeConfigDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (length: number, width: number) => void;
    unitName: string;
}

export default function ConeConfigDialog({
    isOpen,
    onClose,
    onConfirm,
    unitName
}: ConeConfigDialogProps) {
    const [length, setLength] = useState('15');
    const [width, setWidth] = useState('15');

    const handleConfirm = () => {
        const lengthVal = parseFloat(length);
        const widthVal = parseFloat(width);

        if (!isNaN(lengthVal) && !isNaN(widthVal) && lengthVal > 0 && widthVal > 0) {
            onConfirm(lengthVal, widthVal);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl p-6 w-[400px]">
                <h2 className="text-xl font-bold text-white mb-4">Configuration du Cône</h2>

                <div className="space-y-4">
                    <div>
                        <Label htmlFor="cone-length" className="text-white">
                            Longueur ({unitName})
                        </Label>
                        <Input
                            id="cone-length"
                            type="number"
                            value={length}
                            onChange={(e) => setLength(e.target.value)}
                            className="bg-[#0a0a0a] border-[#333] text-white mt-1"
                            placeholder="15"
                            min="0"
                            step="1"
                        />
                    </div>

                    <div>
                        <Label htmlFor="cone-width" className="text-white">
                            Largeur ({unitName})
                        </Label>
                        <Input
                            id="cone-width"
                            type="number"
                            value={width}
                            onChange={(e) => setWidth(e.target.value)}
                            className="bg-[#0a0a0a] border-[#333] text-white mt-1"
                            placeholder="15"
                            min="0"
                            step="1"
                        />
                    </div>

                    <div className="text-xs text-gray-400 bg-[#0a0a0a] p-3 rounded border border-[#333]">
                        <p><strong>Longueur :</strong> Distance depuis le point d'origine</p>
                        <p><strong>Largeur :</strong> Largeur du cône à son extrémité</p>
                    </div>
                </div>

                <div className="flex gap-2 mt-6">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="flex-1 text-gray-400 hover:text-white"
                    >
                        Annuler
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        className="flex-1 bg-[#c0a080] text-black hover:bg-[#d4b494]"
                    >
                        Confirmer
                    </Button>
                </div>
            </div>
        </div>
    );
}

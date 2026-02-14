"use client";

import React, { useState } from 'react';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Keyboard, ChevronRight } from "lucide-react";
import { ShortcutsDialog } from "./ShortcutsDialog";

interface GlobalSettingsDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    isMJ: boolean;
    globalTokenScale: number;
    setGlobalTokenScale: (scale: number) => void;
    updateGlobalTokenScale: (scale: number) => void;
    performanceMode: 'high' | 'eco' | 'static';
    setPerformanceMode: (mode: 'high' | 'eco' | 'static') => void;
    showCharBorders: boolean;
    setShowCharBorders: (show: boolean) => void;
    showMyCursor: boolean;
    setShowMyCursor: (show: boolean) => void;
    showOtherCursors: boolean;
    setShowOtherCursors: (show: boolean) => void;
}

export default function GlobalSettingsDialog({
    isOpen,
    onOpenChange,
    isMJ,
    globalTokenScale,
    setGlobalTokenScale,
    updateGlobalTokenScale,
    performanceMode,
    setPerformanceMode,
    showCharBorders,
    setShowCharBorders,
    showMyCursor,
    setShowMyCursor,
    showOtherCursors,
    setShowOtherCursors
}: GlobalSettingsDialogProps) {
    const [showShortcuts, setShowShortcuts] = useState(false);

    return (
        <>
            <Sheet open={isOpen} onOpenChange={onOpenChange}>
                <SheetContent side="right" className="sm:max-w-[420px] w-full bg-[#1c1c1c] text-[#d4d4d4] border-l border-[#333] shadow-2xl p-0">
                    <div className="flex flex-col h-full">
                        <SheetHeader className="p-6 pb-6 border-b border-white/5 bg-[#242424]">
                            <SheetTitle className="font-title text-2xl text-[#c0a080] tracking-wide">
                                Paramètres
                            </SheetTitle>
                            <SheetDescription className="text-gray-500">
                                Configuration globale de l'interface
                            </SheetDescription>
                        </SheetHeader>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8 m-0 focus-visible:ring-0">
                            {/* Shortcuts Section */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <h4 className="font-title text-sm font-semibold text-white uppercase tracking-wider">
                                        Raccourcis
                                    </h4>
                                    <Separator className="flex-1 bg-white/10" />
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full bg-[#242424] border-white/10 hover:bg-[#2c2c2c] hover:text-[#c0a080] text-gray-300 justify-between h-auto py-4 group"
                                    onClick={() => {
                                        onOpenChange(false);
                                        setShowShortcuts(true);
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-black/20 rounded-lg group-hover:bg-[#c0a080]/10 transition-colors">
                                            <Keyboard className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <div className="font-medium">Raccourcis Clavier</div>
                                            <div className="text-xs text-gray-500 font-normal">Gérer les commandes rapides</div>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-[#c0a080] transition-colors" />
                                </Button>
                            </div>

                            {/* Appearance Section */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <h4 className="font-title text-sm font-semibold text-white uppercase tracking-wider">
                                        Apparence
                                    </h4>
                                    <Separator className="flex-1 bg-white/10" />
                                </div>

                                <div className="space-y-4">
                                    {/* Token Scale */}
                                    <Card className="p-4 bg-[#242424] border-white/5 space-y-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-base text-gray-200">Échelle des Tokens</Label>
                                            <p className="text-xs text-gray-500">Taille par défaut des nouveaux tokens (0.5 - 2.0)</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <Slider
                                                value={[globalTokenScale]}
                                                min={0.5}
                                                max={2}
                                                step={0.1}
                                                onValueChange={(val) => setGlobalTokenScale(val[0])}
                                                onValueCommit={(val) => updateGlobalTokenScale(val[0])}
                                                className="flex-1"
                                            />
                                            <span className="w-12 text-right font-mono text-sm text-[#c0a080]">
                                                {globalTokenScale.toFixed(1)}x
                                            </span>
                                        </div>
                                    </Card>

                                    {/* Character Borders */}
                                    <Card className="p-4 bg-[#242424] border-white/5 flex items-center justify-between">
                                        <div className="space-y-1">
                                            <Label className="text-base text-gray-200">Bordures de Personnage</Label>
                                            <p className="text-xs text-gray-500">Afficher les bordures colorées sur la carte</p>
                                        </div>
                                        <Switch
                                            checked={showCharBorders}
                                            onCheckedChange={setShowCharBorders}
                                            className="data-[state=checked]:bg-[#c0a080]"
                                        />
                                    </Card>

                                    {/* Show My Cursor Toggle */}
                                    <Card className="p-4 bg-[#242424] border-white/5 flex items-center justify-between">
                                        <div className="space-y-1">
                                            <Label className="text-base text-gray-200">Montrer mon curseur</Label>
                                            <p className="text-xs text-gray-500">Visible par les autres joueurs</p>
                                        </div>
                                        <Switch
                                            checked={showMyCursor}
                                            onCheckedChange={setShowMyCursor}
                                            className="data-[state=checked]:bg-[#c0a080]"
                                        />
                                    </Card>

                                    {/* Show Other Cursors Toggle */}
                                    <Card className="p-4 bg-[#242424] border-white/5 flex items-center justify-between">
                                        <div className="space-y-1">
                                            <Label className="text-base text-gray-200">Voir les autres curseurs</Label>
                                            <p className="text-xs text-gray-500">Afficher les curseurs des autres joueurs</p>
                                        </div>
                                        <Switch
                                            checked={showOtherCursors}
                                            onCheckedChange={setShowOtherCursors}
                                            className="data-[state=checked]:bg-[#c0a080]"
                                        />
                                    </Card>
                                </div>
                            </div>

                            {/* Performance Section */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <h4 className="font-title text-sm font-semibold text-white uppercase tracking-wider">
                                        Performance
                                    </h4>
                                    <Separator className="flex-1 bg-white/10" />
                                </div>

                                <Card className="p-4 bg-[#242424] border-white/5 space-y-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-base text-gray-200">Mode de Rendu</Label>
                                        <p className="text-xs text-gray-500">Optimisez pour votre configuration</p>
                                    </div>
                                    <Select value={performanceMode} onValueChange={(v: any) => setPerformanceMode(v)}>
                                        <SelectTrigger className="bg-black/20 border-white/10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="high">Haute Qualité (Toutes animations)</SelectItem>
                                            <SelectItem value="eco">Économique (Animations réduites)</SelectItem>
                                            <SelectItem value="static">Statique (Performance maximale)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Card>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-white/5 bg-[#242424]">
                            <p className="text-center text-xs text-gray-600">
                                VTT D&D System v2.0
                            </p>
                        </div>
                    </div>
                </SheetContent>

                <ShortcutsDialog
                    isOpen={showShortcuts}
                    onClose={() => setShowShortcuts(false)}
                    isMJ={isMJ}
                />
            </Sheet>
        </>
    );
}

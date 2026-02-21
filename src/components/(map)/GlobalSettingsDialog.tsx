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
import { Keyboard, ChevronRight, Palette } from "lucide-react";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { ThemeSwitcher } from "@/components/ui/ThemeSwitcher";

import { useSettings } from '@/contexts/SettingsContext';
import { useGame } from '@/contexts/GameContext';
import { saveUserSettings } from '@/lib/saveSettings';

interface GlobalSettingsDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    isMJ: boolean;
}

export default function GlobalSettingsDialog({
    isOpen,
    onOpenChange,
    isMJ
}: GlobalSettingsDialogProps) {
    const { user } = useGame();
    const settings = useSettings();

    // Local state - initialized from context
    const [localGlobalTokenScale, setLocalGlobalTokenScale] = useState(settings.globalTokenScale);
    const [localPerformanceMode, setLocalPerformanceMode] = useState(settings.performanceMode);
    const [localShowCharBorders, setLocalShowCharBorders] = useState(settings.showCharBorders);
    const [localShowMyCursor, setLocalShowMyCursor] = useState(settings.showMyCursor);
    const [localShowOtherCursors, setLocalShowOtherCursors] = useState(settings.showOtherCursors);
    const [localCursorColor, setLocalCursorColor] = useState(settings.cursorColor);
    const [localCursorTextColor, setLocalCursorTextColor] = useState(settings.cursorTextColor);
    const [showShortcuts, setShowShortcuts] = useState(false);

    // Sync local state when context changes (from DB updates)
    React.useEffect(() => {
        setLocalGlobalTokenScale(settings.globalTokenScale);
        setLocalPerformanceMode(settings.performanceMode);
        setLocalShowCharBorders(settings.showCharBorders);
        setLocalShowMyCursor(settings.showMyCursor);
        setLocalShowOtherCursors(settings.showOtherCursors);
        setLocalCursorColor(settings.cursorColor);
        setLocalCursorTextColor(settings.cursorTextColor);
    }, [
        settings.globalTokenScale,
        settings.performanceMode,
        settings.showCharBorders,
        settings.showMyCursor,
        settings.showOtherCursors,
        settings.cursorColor,
        settings.cursorTextColor
    ]);

    // Save all settings to DB and context
    const handleSave = async () => {
        // Update context (which updates UI everywhere)
        settings.setGlobalTokenScale(localGlobalTokenScale);
        settings.setPerformanceMode(localPerformanceMode);
        settings.setShowCharBorders(localShowCharBorders);
        settings.setShowMyCursor(localShowMyCursor);
        settings.setShowOtherCursors(localShowOtherCursors);
        settings.setCursorColor(localCursorColor);
        settings.setCursorTextColor(localCursorTextColor);

        // Save to DB
        if (user?.uid) {
            await saveUserSettings(user.uid, {
                globalTokenScale: localGlobalTokenScale,
                performanceMode: localPerformanceMode,
                showCharBorders: localShowCharBorders,
                showMyCursor: localShowMyCursor,
                showOtherCursors: localShowOtherCursors,
                cursorColor: localCursorColor,
                cursorTextColor: localCursorTextColor
            });
        }
    };

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

                                    {/* Theme Switcher */}
                                    <Card className="p-4 bg-[#1a1a1a] border-white/5 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Palette className="w-4 h-4 text-[#c0a080]" />
                                            <Label className="text-base text-gray-200">Thème de l&apos;Interface</Label>
                                        </div>
                                        <p className="text-xs text-gray-500">Choisissez l&apos;ambiance visuelle de l&apos;application</p>
                                        <ThemeSwitcher />
                                    </Card>

                                    {/* Token Scale */}
                                    <Card className="p-4 bg-[#242424] border-white/5 space-y-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-base text-gray-200">Échelle des Tokens</Label>
                                            <p className="text-xs text-gray-500">Taille par défaut des nouveaux tokens (0.5 - 2.0)</p>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <Slider
                                                value={[localGlobalTokenScale]}
                                                min={0.5}
                                                max={2}
                                                step={0.1}
                                                onValueChange={(val) => setLocalGlobalTokenScale(val[0])}
                                                className="flex-1"
                                            />
                                            <span className="w-12 text-right font-mono text-sm text-[#c0a080]">
                                                {localGlobalTokenScale.toFixed(1)}x
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
                                            checked={localShowCharBorders}
                                            onCheckedChange={setLocalShowCharBorders}
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
                                            checked={localShowMyCursor}
                                            onCheckedChange={setLocalShowMyCursor}
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
                                            checked={localShowOtherCursors}
                                            onCheckedChange={setLocalShowOtherCursors}
                                            className="data-[state=checked]:bg-[#c0a080]"
                                        />
                                    </Card>
                                    {/* Cursor Customization */}
                                    <Card className="p-4 bg-[#242424] border-white/5 space-y-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-base text-gray-200">Personnalisation du Curseur</Label>
                                            <p className="text-xs text-gray-500">Modifier les couleurs de votre curseur</p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs text-gray-400">Fond</Label>
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-8 h-8 rounded-full border border-white/10 shadow-sm"
                                                        style={{ backgroundColor: localCursorColor }}
                                                    />
                                                    <input
                                                        type="color"
                                                        value={localCursorColor}
                                                        onChange={(e) => setLocalCursorColor(e.target.value)}
                                                        className="h-8 w-full bg-transparent cursor-pointer"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label className="text-xs text-gray-400">Texte</Label>
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-8 h-8 rounded-full border border-white/10 shadow-sm flex items-center justify-center text-xs font-bold"
                                                        style={{ backgroundColor: localCursorColor, color: localCursorTextColor }}
                                                    >
                                                        A
                                                    </div>
                                                    <input
                                                        type="color"
                                                        value={localCursorTextColor}
                                                        onChange={(e) => setLocalCursorTextColor(e.target.value)}
                                                        className="h-8 w-full bg-transparent cursor-pointer"
                                                    />
                                                </div>
                                            </div>
                                        </div>
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
                                    <Select value={localPerformanceMode} onValueChange={(v: any) => setLocalPerformanceMode(v)}>
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
                        <div className="p-4 border-t border-white/5 bg-[#242424] space-y-3">
                            <Button
                                onClick={handleSave}
                                className="w-full bg-[#c0a080] hover:bg-[#d4b494] text-black font-semibold"
                            >
                                Sauvegarder
                            </Button>
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

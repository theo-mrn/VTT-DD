"use client";

import React from 'react';
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
    setShowCharBorders
}: GlobalSettingsDialogProps) {
    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="sm:max-w-[400px] w-full bg-card text-card-foreground border-l border-border shadow-2xl overflow-y-auto">
                <SheetHeader className="mb-6">
                    <SheetTitle className="font-title text-3xl text-primary tracking-wide">
                        Paramètres
                    </SheetTitle>
                    <SheetDescription className="text-muted-foreground">
                        Personnalisez votre expérience de jeu.
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-8 pb-8">
                    {/* GM Section */}
                    {isMJ && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <h4 className="font-title text-base font-semibold text-foreground uppercase tracking-wider">
                                    Maître du Jeu
                                </h4>
                                <Separator className="flex-1 bg-border/50" />
                            </div>

                            <Card className="p-5 border-border/50 bg-secondary/5 shadow-sm hover:shadow-md transition-all">
                                <div className="space-y-5">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="token-scale" className="text-base font-medium">
                                            Échelle des Pions
                                        </Label>
                                        <span className="text-sm font-mono font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md border border-primary/20">
                                            x{globalTokenScale.toFixed(1)}
                                        </span>
                                    </div>
                                    <Slider
                                        id="token-scale"
                                        min={0.5}
                                        max={3}
                                        step={0.1}
                                        value={[globalTokenScale]}
                                        onValueChange={(vals) => setGlobalTokenScale(vals[0])}
                                        onValueCommit={(vals) => updateGlobalTokenScale(vals[0])}
                                        className="py-2"
                                    />
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        Ajuste la taille globale de tous les pions sur la carte pour tous les joueurs.
                                    </p>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* Display Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <h4 className="font-title text-base font-semibold text-foreground uppercase tracking-wider">
                                Affichage
                            </h4>
                            <Separator className="flex-1 bg-border/50" />
                        </div>

                        <Card className="flex items-center justify-between p-5 border-border/50 bg-secondary/5 shadow-sm hover:shadow-md transition-all hover:bg-secondary/10 cursor-pointer" onClick={() => setShowCharBorders(!showCharBorders)}>
                            <div className="space-y-1.5">
                                <Label htmlFor="char-borders" className="text-base font-medium cursor-pointer pointer-events-none">
                                    Interface Personnages
                                </Label>
                                <p className="text-xs text-muted-foreground pointer-events-none">
                                    Afficher cercles, noms et stats
                                </p>
                            </div>
                            <Switch
                                id="char-borders"
                                checked={showCharBorders}
                                onCheckedChange={setShowCharBorders}
                            />
                        </Card>
                    </div>

                    {/* Performance Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <h4 className="font-title text-base font-semibold text-foreground uppercase tracking-wider">
                                Performance
                            </h4>
                            <Separator className="flex-1 bg-border/50" />
                        </div>
                        <Card className="p-1 border-border/50 bg-secondary/5 shadow-sm">
                            <Select
                                value={performanceMode}
                                onValueChange={(val: 'high' | 'eco' | 'static') => setPerformanceMode(val)}
                            >
                                <SelectTrigger className="w-full border-0 bg-transparent focus:ring-0 shadow-none h-14 pl-4">
                                    <SelectValue placeholder="Sélectionner le mode" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="high" className="py-3">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-semibold text-base">Haute Qualité</span>
                                            <span className="text-muted-foreground text-xs">Expérience visuelle maximale (Défaut)</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="eco" className="py-3">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-semibold text-base">Économie</span>
                                            <span className="text-muted-foreground text-xs">Limité à 30 FPS pour économiser la batterie</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="static" className="py-3">
                                        <div className="flex flex-col gap-1">
                                            <span className="font-semibold text-base">Statique</span>
                                            <span className="text-muted-foreground text-xs">Pas d'animations, performance maximale</span>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </Card>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

"use client";

import React, { useEffect, useState } from 'react';
import { Minus, Triangle, Circle, Square, Settings, Trash2, ArrowLeftRight, Lock, Unlock, Grid3X3, Divide, Check, Sparkles } from 'lucide-react';
import { ToolbarSkinSelector } from './MapToolbar';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator";

export type MeasurementShape = 'line' | 'cone' | 'circle' | 'cube';

interface MeasurementPanelProps {
    selectedShape: MeasurementShape;
    onShapeChange: (shape: MeasurementShape) => void;

    // Calibration & Cleanup
    isCalibrating?: boolean;
    onStartCalibration?: () => void;
    onCancelCalibration?: () => void;
    onClearMeasurements?: () => void;

    // Persistence
    isPermanent?: boolean;
    onPermanentChange?: (val: boolean) => void;



    // Cone Parameters
    coneAngle: number;
    setConeAngle: (angle: number) => void;
    coneShape: 'flat' | 'rounded';
    setConeShape: (shape: 'flat' | 'rounded') => void;
    lockWidthHeight: boolean;
    setLockWidthHeight: (val: boolean) => void;

    // Measurement Mode (Angle vs Dimensions)
    coneMode: 'angle' | 'dimensions';
    setConeMode: (mode: 'angle' | 'dimensions') => void;
    coneWidth?: number;
    setConeWidth: (width: number | undefined) => void;
    coneLength?: number;
    setConeLength: (length: number | undefined) => void;

    // Skin
    selectedSkin?: string;
    onSkinChange?: (skin: string) => void;

    onClose: () => void;
}

export default function MeasurementPanel({
    selectedShape,
    onShapeChange,
    isCalibrating = false,
    onStartCalibration,
    onCancelCalibration,
    onClearMeasurements,
    isPermanent = false,
    onPermanentChange,

    coneAngle,
    setConeAngle,
    coneShape,
    setConeShape,
    lockWidthHeight,
    setLockWidthHeight,
    coneMode,
    setConeMode,
    coneWidth,
    setConeWidth,
    coneLength,
    setConeLength,
    selectedSkin,
    onSkinChange,
    onClose
}: MeasurementPanelProps) {
    const [customAngle, setCustomAngle] = useState(coneAngle.toString());

    // Update local state when prop changes
    useEffect(() => {
        setCustomAngle(coneAngle.toString());
    }, [coneAngle]);

    const handleAngleChange = (val: string) => {
        setCustomAngle(val);
        const num = parseFloat(val);
        if (!isNaN(num) && num > 0 && num <= 360) {
            setConeAngle(num);
        }
    };

    const shapes: Array<{ id: MeasurementShape; icon: any; label: string }> = [
        { id: 'line', icon: Minus, label: 'Ligne' },
        { id: 'cone', icon: Triangle, label: 'Cône' },
        { id: 'circle', icon: Circle, label: 'Cercle' },
        { id: 'cube', icon: Square, label: 'Carré' }
    ];

    const currentShape = shapes.find(s => s.id === selectedShape);

    return (
        <div className="fixed top-24 right-4 z-[50] w-[320px] max-h-[calc(100vh-8rem)] flex flex-col bg-[#0a0a0a]/95 backdrop-blur-xl border border-[#333] rounded-xl shadow-2xl font-sans animate-in slide-in-from-right-4 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Settings className="w-4 h-4 text-[#c0a080]" />
                    Mesures
                </h3>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-white" onClick={onClose}>
                    <div className="bg-[#c0a080] text-black rounded px-1.5 py-0.5 text-[10px] font-bold">
                        «
                    </div>
                </Button>
            </div>

            <div className="p-4 space-y-5 overflow-y-auto custom-scrollbar">
                {/* Shape Selection */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <Label className="text-xs font-medium text-gray-400 uppercase">Forme</Label>
                    </div>

                    <div className="flex gap-3">
                        {/* Shape Dropdown */}
                        <Select value={selectedShape} onValueChange={(val) => onShapeChange(val as MeasurementShape)}>
                            <SelectTrigger className="flex-1 bg-[#c0a080] text-black border-none font-medium h-9 focus:ring-0">
                                <SelectValue>
                                    <div className="flex items-center gap-2">
                                        {currentShape && <currentShape.icon size={16} strokeWidth={2.5} />}
                                        {currentShape?.label}
                                    </div>
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a1a1a] border-[#333] text-white">
                                {shapes.map(shape => (
                                    <SelectItem key={shape.id} value={shape.id} className="focus:bg-white/10 focus:text-white cursor-pointer">
                                        <div className="flex items-center gap-2">
                                            <shape.icon size={16} />
                                            {shape.label}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>


                    </div>
                </div>

                <Separator className="bg-white/10" />

                <div className="space-y-4">
                    {selectedShape === 'cone' ? (
                        <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2">
                            {/* Mode Selection */}
                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-400 uppercase">Mode de définition</Label>
                                <div className="flex bg-white/5 p-1 rounded-lg">
                                    <button
                                        onClick={() => setConeMode('angle')}
                                        className={cn(
                                            "flex-1 py-1.5 text-xs font-medium rounded transition-all",
                                            coneMode === 'angle'
                                                ? "bg-white/20 text-white shadow-sm"
                                                : "text-gray-500 hover:text-gray-300"
                                        )}
                                    >
                                        ANGLE
                                    </button>
                                    <button
                                        onClick={() => setConeMode('dimensions')}
                                        className={cn(
                                            "flex-1 py-1.5 text-xs font-medium rounded transition-all",
                                            coneMode === 'dimensions'
                                                ? "bg-white/20 text-white shadow-sm"
                                                : "text-gray-500 hover:text-gray-300"
                                        )}
                                    >
                                        DIMENSIONS
                                    </button>
                                </div>
                            </div>

                            {coneMode === 'angle' ? (
                                <>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-medium text-gray-400 uppercase">Angle du cône</Label>
                                        <div className="flex gap-2">
                                            {[45, 60, 90].map(angle => (
                                                <Button
                                                    key={angle}
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={lockWidthHeight}
                                                    onClick={() => {
                                                        setConeAngle(angle);
                                                        setCustomAngle(angle.toString());
                                                    }}
                                                    className={cn(
                                                        "flex-1 h-9 border",
                                                        coneAngle === angle && !lockWidthHeight
                                                            ? "bg-white/20 border-white/30 text-white"
                                                            : "bg-white/5 border-transparent text-gray-400 hover:bg-white/10"
                                                    )}
                                                >
                                                    {angle}°
                                                </Button>
                                            ))}
                                            <div className="relative flex-1 min-w-[80px]">
                                                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500">
                                                    <Triangle size={12} className="rotate-90" />
                                                </div>
                                                <Input
                                                    type="number"
                                                    value={customAngle}
                                                    disabled={lockWidthHeight}
                                                    onChange={(e) => handleAngleChange(e.target.value)}
                                                    className="h-9 pl-7 bg-white/5 border-white/10 focus:border-[#c0a080] text-center"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    {/* Toggle Width/Height Lock (Only in Angle Mode) */}
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm text-gray-300">Verrouiller ratio 1:1</Label>
                                        <div className="flex items-center gap-2">
                                            {lockWidthHeight ? <Lock size={14} className="text-[#c0a080]" /> : <Unlock size={14} className="text-gray-500" />}
                                            <Switch
                                                checked={lockWidthHeight}
                                                onCheckedChange={setLockWidthHeight}
                                                className="data-[state=checked]:bg-[#c0a080]"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-500 -mt-2">Force un angle de ~53°</p>
                                </>
                            ) : (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-gray-400">Largeur (à la fin)</Label>
                                            <Input
                                                type="number"
                                                placeholder="Auto"
                                                value={coneWidth || ''}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setConeWidth(isNaN(val) ? undefined : val);
                                                }}
                                                className="bg-white/5 border-white/10"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-gray-400">Longueur (Fixe)</Label>
                                            <Input
                                                type="number"
                                                placeholder="Libre"
                                                value={coneLength || ''}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setConeLength(isNaN(val) ? undefined : val);
                                                }}
                                                className="bg-white/5 border-white/10"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-500">
                                        Laisser vide pour "Auto" / "Libre".
                                    </p>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label className="text-xs font-medium text-gray-400 uppercase">Forme du cône</Label>
                                <div className="flex bg-white/5 p-1 rounded-lg">
                                    <button
                                        onClick={() => setConeShape('flat')}
                                        className={cn(
                                            "flex-1 py-1.5 text-xs font-medium rounded transition-all",
                                            coneShape === 'flat'
                                                ? "bg-white/20 text-white shadow-sm"
                                                : "text-gray-500 hover:text-gray-300"
                                        )}
                                    >
                                        PLAT
                                    </button>
                                    <button
                                        onClick={() => setConeShape('rounded')}
                                        className={cn(
                                            "flex-1 py-1.5 text-xs font-medium rounded transition-all",
                                            coneShape === 'rounded'
                                                ? "bg-white/20 text-white shadow-sm"
                                                : "text-gray-500 hover:text-gray-300"
                                        )}
                                    >
                                        ARRONDI
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Standard options for other shapes */
                        <div className="space-y-4">
                            {/* Toggle Width/Height Lock */}
                            <div className="flex items-center justify-between">
                                <Label className="text-sm text-gray-300">Verrouiller largeur/hauteur</Label>
                                <div className="flex items-center gap-2">
                                    {lockWidthHeight ? <Lock size={14} className="text-[#c0a080]" /> : <Unlock size={14} className="text-gray-500" />}
                                    <Switch
                                        checked={lockWidthHeight}
                                        onCheckedChange={setLockWidthHeight}
                                        className="data-[state=checked]:bg-[#c0a080]"
                                    />
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-500 -mt-2">Force un ratio 1:1</p>
                        </div>
                    )}
                </div>

                <Separator className="bg-white/10" />

                {/* Animation/Skin Selector */}
                {(selectedShape === 'circle' || selectedShape === 'cone') && selectedSkin !== undefined && onSkinChange && (
                    <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-400 uppercase">Animation</Label>
                        {/* We use the existing selector but might need to adjust its styling context */}
                        <div className="bg-black/20 rounded-xl overflow-hidden p-1">
                            <ToolbarSkinSelector
                                selectedSkin={selectedSkin}
                                onSkinChange={onSkinChange}
                                shape={selectedShape === 'circle' ? 'circle' : 'cone'}
                                className="border-none shadow-none bg-transparent w-full p-0"
                            />
                        </div>
                    </div>
                )}
                {(selectedShape === 'circle' || selectedShape === 'cone') && <Separator className="bg-white/10" />}

                {/* Actions */}
                <div className="space-y-2">
                    {/* Persistent Toggle */}
                    {onPermanentChange && (
                        <div className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5">
                            <div className="flex items-center gap-2">
                                <div className={cn("w-2 h-2 rounded-full", isPermanent ? "bg-[#c0a080] animate-pulse" : "bg-gray-600")} />
                                <span className={cn("text-xs font-medium", isPermanent ? "text-[#c0a080]" : "text-gray-400")}>
                                    Mode Permanent
                                </span>
                            </div>
                            <Switch
                                checked={isPermanent}
                                onCheckedChange={onPermanentChange}
                                className="data-[state=checked]:bg-[#c0a080] scale-75"
                            />
                        </div>
                    )}

                    <div className="flex gap-2">
                        {!isCalibrating && onStartCalibration && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onStartCalibration}
                                className="flex-1 h-8 text-xs border-white/10 text-gray-400 hover:bg-white/5 hover:text-white"
                            >
                                <Divide size={12} className="mr-2" />
                                Étalonner
                            </Button>
                        )}
                        {isCalibrating && onCancelCalibration && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={onCancelCalibration}
                                className="flex-1 h-8 text-xs"
                            >
                                Annuler
                            </Button>
                        )}

                        {onClearMeasurements && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onClearMeasurements}
                                className="h-8 w-8 p-0 text-red-400 hover:bg-red-400/10 hover:text-red-300"
                                title="Tout effacer"
                            >
                                <Trash2 size={14} />
                            </Button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}

"use client";

import React from 'react';
import { Minus, Triangle, Circle, Square, Settings } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@/components/ui/tooltip";

export type MeasurementShape = 'line' | 'cone' | 'circle' | 'cube';

interface MeasurementShapeSelectorProps {
    selectedShape: MeasurementShape;
    onShapeChange: (shape: MeasurementShape) => void;
    onConeConfig?: () => void;
    isCalibrating?: boolean;
    onStartCalibration?: () => void;
    onCancelCalibration?: () => void;
}

export default function MeasurementShapeSelector({
    selectedShape,
    onShapeChange,
    onConeConfig,
    isCalibrating = false,
    onStartCalibration,
    onCancelCalibration
}: MeasurementShapeSelectorProps) {
    const shapes: Array<{ id: MeasurementShape; icon: any; label: string; description: string }> = [
        {
            id: 'line',
            icon: Minus,
            label: 'Ligne',
            description: 'Mesure linéaire simple'
        },
        {
            id: 'cone',
            icon: Triangle,
            label: 'Cône',
            description: 'Cône personnalisable'
        },
        {
            id: 'circle',
            icon: Circle,
            label: 'Cercle',
            description: 'Cercle/Sphère par rayon'
        },
        {
            id: 'cube',
            icon: Square,
            label: 'Carré',
            description: 'Carré/Cube par rayon'
        }
    ];

    return (
        <div className="flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <span className="text-xs text-gray-400 font-medium mr-2">Forme:</span>

            <TooltipProvider delayDuration={300}>
                {shapes.map((shape) => {
                    const Icon = shape.icon;
                    const isActive = selectedShape === shape.id;

                    return (
                        <Tooltip key={shape.id}>
                            <TooltipTrigger asChild>
                                <Button
                                    variant={isActive ? "secondary" : "ghost"}
                                    size="sm"
                                    className={cn(
                                        "h-9 px-3 transition-all duration-200",
                                        isActive
                                            ? "bg-[#c0a080] text-black hover:bg-[#d4b494]"
                                            : "text-gray-400 hover:text-white hover:bg-white/10",
                                        "rounded-lg"
                                    )}
                                    onClick={() => onShapeChange(shape.id)}
                                >
                                    <Icon size={16} strokeWidth={isActive ? 2.5 : 2} className="mr-1.5" />
                                    <span className="text-xs font-medium">{shape.label}</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-black/90 border-[#333] text-white">
                                <p className="font-medium">{shape.label}</p>
                                <p className="text-xs text-gray-400">{shape.description}</p>
                            </TooltipContent>
                        </Tooltip>
                    );
                })}

                {/* Cone Configuration Button */}
                {selectedShape === 'cone' && onConeConfig && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 px-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
                                onClick={onConeConfig}
                            >
                                <Settings size={16} strokeWidth={2} />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-black/90 border-[#333] text-white">
                            <p className="font-medium">Configurer le cône</p>
                            <p className="text-xs text-gray-400">Longueur et largeur</p>
                        </TooltipContent>
                    </Tooltip>
                )}

                {/* Calibration Button */}
                {!isCalibrating && onStartCalibration && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onStartCalibration}
                        className="h-9 px-3 ml-2 text-xs font-medium text-gray-400 hover:text-white hover:bg-white/10 rounded-lg border-l border-white/10 pl-3"
                    >
                        Étalonner
                    </Button>
                )}
                {isCalibrating && onCancelCalibration && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onCancelCalibration}
                        className="h-9 px-3 ml-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg border-l border-white/10 pl-3"
                    >
                        Annuler
                    </Button>
                )}
            </TooltipProvider>
        </div>
    );
}

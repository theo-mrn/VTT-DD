"use client"

import React, { useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from 'lucide-react';

export type EntityType =
    | 'character'
    | 'object'
    | 'light'
    | 'obstacle'
    | 'musicZone'
    | 'note'
    | 'measurement'
    | 'drawing'
    | 'fogCells';

export interface EntityToDelete {
    type: EntityType;
    id?: string;
    ids?: string[];
    name?: string;
    count?: number;
}

interface DeleteConfirmationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    entity: EntityToDelete | null;
    onConfirm: () => void;
}

const getEntityTypeLabel = (type: EntityType): string => {
    const labels: Record<EntityType, string> = {
        character: 'personnage',
        object: 'objet',
        light: 'source lumineuse',
        obstacle: 'obstacle',
        musicZone: 'zone musicale',
        note: 'note',
        measurement: 'mesure',
        drawing: 'dessin',
        fogCells: 'cellules de brouillard'
    };
    return labels[type] || 'élément';
};

export function DeleteConfirmationModal({
    open,
    onOpenChange,
    entity,
    onConfirm
}: DeleteConfirmationModalProps) {

    // Handle keyboard shortcuts
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
                onOpenChange(false);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onOpenChange(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onConfirm, onOpenChange]);

    if (!entity) return null;

    const typeLabel = getEntityTypeLabel(entity.type);
    const isMultiple = entity.count && entity.count > 1;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Confirmer la suppression
                    </DialogTitle>
                    <DialogDescription>
                        {isMultiple ? (
                            <>
                                Voulez-vous vraiment supprimer <strong>{entity.count}</strong> {typeLabel}(s) ?
                            </>
                        ) : (
                            <>
                                Voulez-vous vraiment supprimer {entity.name ? (
                                    <>ce {typeLabel} <strong>&quot;{entity.name}&quot;</strong></>
                                ) : (
                                    <>ce {typeLabel}</>
                                )} ?
                            </>
                        )}
                        <br />
                        <span className="text-muted-foreground text-sm">
                            Cette action est irréversible.
                        </span>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-4">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Annuler <span className="text-muted-foreground ml-1">(Esc)</span>
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => {
                            onConfirm();
                            onOpenChange(false);
                        }}
                    >
                        Supprimer <span className="text-muted-foreground ml-1">(Enter)</span>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

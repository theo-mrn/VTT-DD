import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Save, FileText } from 'lucide-react';

interface EntityNotesProps {
    initialNotes?: string;
    onSave: (notes: string) => void;
    isReadOnly?: boolean;
}

export function EntityNotes({ initialNotes = "", onSave, isReadOnly = false }: EntityNotesProps) {
    const [notes, setNotes] = useState(initialNotes);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        setNotes(initialNotes || "");
        setHasChanges(false);
    }, [initialNotes]);

    const handleSave = () => {
        onSave(notes);
        setHasChanges(false);
    };

    return (
        <div className="space-y-3 h-full flex flex-col">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-gray-400">
                    <FileText size={14} />
                    <span className="text-xs font-semibold uppercase tracking-wider">Notes</span>
                </div>
                {hasChanges && !isReadOnly && (
                    <span className="text-[10px] text-amber-500 italic animate-pulse">
                        Modifications non enregistrées
                    </span>
                )}
            </div>

            <Textarea
                value={notes}
                onChange={(e) => {
                    setNotes(e.target.value);
                    setHasChanges(e.target.value !== (initialNotes || ""));
                }}
                disabled={isReadOnly}
                className="flex-1 min-h-[150px] resize-none bg-[#111]/50 border-white/10 text-sm text-gray-300 focus:border-white/20 p-3"
                placeholder={isReadOnly ? "Aucune note disponible." : "Écrivez vos notes ici sur ce personnage ou objet..."}
            />

            {!isReadOnly && (
                <Button
                    onClick={handleSave}
                    disabled={!hasChanges}
                    className={`w-full h-9 text-xs transition-all ${hasChanges
                            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
                            : 'bg-[#252525] text-gray-500 border border-transparent cursor-not-allowed'
                        }`}
                >
                    <Save size={14} className="mr-2" />
                    Enregistrer les notes
                </Button>
            )}
        </div>
    );
}

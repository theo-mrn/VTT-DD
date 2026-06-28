'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Shield } from 'lucide-react';
import { cn } from "@/lib/utils";

export type CustomCompetenceFormValue = {
    name: string;
    description: string;
    type: string; // 'active' | 'passive'
};

interface CustomCompetenceFormProps {
    onCreate: (value: CustomCompetenceFormValue) => void;
    onCancel?: () => void;
    /** Reset the form whenever this key changes (e.g. slot changes) */
    resetKey?: string | number;
}

/**
 * Formulaire pour écrire soi-même une compétence (nom libre + description libre + type active/passive).
 * Produit un objet réutilisé pour construire une CustomCompetence.
 */
export default function CustomCompetenceForm({ onCreate, onCancel, resetKey }: CustomCompetenceFormProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<'active' | 'passive'>('active');

    // Réinitialiser le formulaire quand le slot change
    useEffect(() => {
        setName('');
        setDescription('');
        setType('active');
    }, [resetKey]);

    const canSubmit = name.trim().length > 0 && description.trim().length > 0;

    const handleSubmit = () => {
        if (!canSubmit) return;
        onCreate({ name: name.trim(), description: description.trim(), type });
    };

    return (
        <div className="max-w-2xl mx-auto w-full space-y-5 bg-[var(--bg-card)] p-6 rounded-xl border border-[var(--border-color)]">
            <div className="space-y-2">
                <Label className="text-[var(--text-secondary)] text-xs uppercase tracking-wider">Nom de la compétence</Label>
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Frappe tournoyante"
                    className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--accent-brown)]"
                />
            </div>

            <div className="space-y-2">
                <Label className="text-[var(--text-secondary)] text-xs uppercase tracking-wider">Description</Label>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Décrivez l'effet de la compétence, ses conditions, ses dégâts..."
                    className="w-full min-h-[140px] p-3 rounded-md bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--accent-brown)] outline-none transition-all resize-y text-sm"
                />
            </div>

            <div className="space-y-2">
                <Label className="text-[var(--text-secondary)] text-xs uppercase tracking-wider">Type</Label>
                <div className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => setType('active')}
                        className={cn(
                            "flex items-center justify-center gap-2 p-3 rounded-lg border transition-all text-sm font-semibold",
                            type === 'active'
                                ? "border-[var(--accent-brown)] bg-[var(--accent-brown)]/10 text-[var(--accent-brown)]"
                                : "border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent-brown)]/50"
                        )}
                    >
                        <Sparkles className="w-4 h-4" />
                        Active
                    </button>
                    <button
                        type="button"
                        onClick={() => setType('passive')}
                        className={cn(
                            "flex items-center justify-center gap-2 p-3 rounded-lg border transition-all text-sm font-semibold",
                            type === 'passive'
                                ? "border-[var(--accent-brown)] bg-[var(--accent-brown)]/10 text-[var(--accent-brown)]"
                                : "border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent-brown)]/50"
                        )}
                    >
                        <Shield className="w-4 h-4" />
                        Passive
                    </button>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
                {onCancel && (
                    <Button variant="ghost" onClick={onCancel} className="button-cancel">
                        Annuler
                    </Button>
                )}
                <Button onClick={handleSubmit} disabled={!canSubmit} className="button-primary">
                    Créer cette compétence
                </Button>
            </div>
        </div>
    );
}

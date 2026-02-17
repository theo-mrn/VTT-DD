"use client";

import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export default function EmptyState({
    icon: Icon,
    title,
    description,
    action,
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--bg-darker)] flex items-center justify-center mb-4">
                <Icon className="w-8 h-8 text-[var(--text-secondary)]" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                {title}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] max-w-sm mb-6">
                {description}
            </p>
            {action && (
                <Button
                    onClick={action.onClick}
                    className="bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-white"
                >
                    {action.label}
                </Button>
            )}
        </div>
    );
}

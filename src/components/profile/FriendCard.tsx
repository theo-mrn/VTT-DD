"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { ReactNode } from "react";

interface FriendCardProps {
    id: string;
    name: string;
    titre: string;
    pp: string;
    badge?: ReactNode;
    actions?: ReactNode;
    loading?: boolean;
    onClick?: () => void;
}

export default function FriendCard({
    name,
    titre,
    pp,
    badge,
    actions,
    loading,
    onClick,
}: FriendCardProps) {
    return (
        <div
            className={`flex items-center justify-between p-4 bg-[var(--bg-darker)] rounded-lg border border-[var(--border-color)] hover:border-[var(--accent-brown)] transition-all duration-200 ${onClick ? "cursor-pointer" : ""
                } ${loading ? "opacity-50 pointer-events-none" : ""}`}
            onClick={onClick}
        >
            <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="relative flex-shrink-0">
                    <Avatar className="h-12 w-12 border-2 border-[var(--accent-brown)]">
                        <AvatarImage src={pp} alt={name} />
                        <AvatarFallback className="bg-[var(--accent-brown)] text-white">
                            {name[0]?.toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    {badge && (
                        <div className="absolute -top-1 -right-1">
                            {badge}
                        </div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--text-primary)] truncate">
                        {name}
                    </p>
                    <p className="text-sm text-[var(--text-secondary)] truncate">
                        {titre}
                    </p>
                </div>
            </div>
            {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-[var(--accent-brown)]" />
            ) : (
                actions && <div className="flex gap-2 flex-shrink-0">{actions}</div>
            )}
        </div>
    );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, X as XIcon, Inbox, Send } from "lucide-react";
import FriendCard from "../FriendCard";
import EmptyState from "../EmptyState";

interface FriendData {
    id: string;
    name: string;
    titre: string;
    pp: string;
}

interface RequestsTabProps {
    friendRequests: FriendData[];
    sentRequests: FriendData[];
    onAcceptRequest: (requestId: string, friendData: FriendData) => Promise<void>;
    onDeclineRequest: (requestId: string) => Promise<void>;
    onCancelRequest: (requestId: string) => Promise<void>;
    loading?: boolean;
    actionLoading?: string | null;
}

type RequestView = "received" | "sent";

export default function RequestsTab({
    friendRequests,
    sentRequests,
    onAcceptRequest,
    onDeclineRequest,
    onCancelRequest,
    loading,
    actionLoading,
}: RequestsTabProps) {
    const [view, setView] = useState<RequestView>("received");

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2].map((i) => (
                    <div
                        key={i}
                        className="h-20 bg-[var(--bg-darker)] rounded-lg animate-pulse"
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Sub-tabs for Received/Sent */}
            <div className="flex gap-2 p-1 bg-[var(--bg-darker)] rounded-lg border border-[var(--border-color)]">
                <button
                    onClick={() => setView("received")}
                    className={`
            flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all flex-1
            ${view === "received"
                            ? "bg-[var(--accent-blue)] text-white"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }
          `}
                >
                    <Inbox className="w-4 h-4" />
                    Reçues
                    {friendRequests.length > 0 && (
                        <span
                            className={`
                flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold
                ${view === "received"
                                    ? "bg-white text-[var(--accent-blue)]"
                                    : "bg-red-500 text-white"
                                }
              `}
                        >
                            {friendRequests.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setView("sent")}
                    className={`
            flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all flex-1
            ${view === "sent"
                            ? "bg-[var(--accent-blue)] text-white"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        }
          `}
                >
                    <Send className="w-4 h-4" />
                    Envoyées
                    {sentRequests.length > 0 && (
                        <span className="ml-1 text-xs opacity-70">
                            ({sentRequests.length})
                        </span>
                    )}
                </button>
            </div>

            {/* Received Requests */}
            {view === "received" && (
                <div className="space-y-3">
                    {friendRequests.length > 0 ? (
                        friendRequests.map((request) => (
                            <FriendCard
                                key={request.id}
                                id={request.id}
                                name={request.name}
                                titre={request.titre}
                                pp={request.pp}
                                loading={actionLoading === request.id}
                                actions={
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            onClick={() => onAcceptRequest(request.id, request)}
                                            disabled={actionLoading === request.id}
                                            className="bg-green-500 hover:bg-green-600 text-white"
                                        >
                                            <Check className="w-4 h-4 mr-2" />
                                            Accepter
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onDeclineRequest(request.id)}
                                            disabled={actionLoading === request.id}
                                            className="border-[var(--border-color)]"
                                        >
                                            <XIcon className="w-4 h-4 mr-2" />
                                            Refuser
                                        </Button>
                                    </div>
                                }
                            />
                        ))
                    ) : (
                        <EmptyState
                            icon={Inbox}
                            title="Aucune demande reçue"
                            description="Vous n'avez pas de demandes d'amis en attente."
                        />
                    )}
                </div>
            )}

            {/* Sent Requests */}
            {view === "sent" && (
                <div className="space-y-3">
                    {sentRequests.length > 0 ? (
                        sentRequests.map((request) => (
                            <FriendCard
                                key={request.id}
                                id={request.id}
                                name={request.name}
                                titre={request.titre}
                                pp={request.pp}
                                loading={actionLoading === request.id}
                                badge={
                                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                                }
                                actions={
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => onCancelRequest(request.id)}
                                        disabled={actionLoading === request.id}
                                        className="border-[var(--border-color)]"
                                    >
                                        Annuler
                                    </Button>
                                }
                            />
                        ))
                    ) : (
                        <EmptyState
                            icon={Send}
                            title="Aucune demande envoyée"
                            description="Vous n'avez pas de demandes d'amis en attente."
                        />
                    )}
                </div>
            )}
        </div>
    );
}

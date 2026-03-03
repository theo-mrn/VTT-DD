'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDocs } from '@/lib/firebase';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Shield, UserPlus, Skull, TrendingUp, HandCoins, Activity, Star } from 'lucide-react';
import { useGame } from '@/contexts/GameContext';

// Define event types for better styling and icons
export type EventType =
    | 'creation'
    | 'combat'
    | 'mort'
    | 'niveau'
    | 'stats'
    | 'inventaire'
    | 'competence'
    | 'info';

export interface GameEvent {
    id?: string;
    type: EventType;
    message: string;
    timestamp: any;
    characterId?: string;
    characterName?: string;
    details?: Record<string, any>;
}

interface HistoriqueProps {
    roomId: string;
}

export default function Historique({ roomId }: HistoriqueProps) {
    const [events, setEvents] = useState<GameEvent[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        if (!roomId) return;

        // 1. Subscribe to events collection to display history
        const eventsRef = collection(db, `Historique/${roomId}/events`);
        const q = query(eventsRef, orderBy('timestamp', 'asc'));

        const unsubscribeEvents = onSnapshot(q, (snapshot) => {
            const loadedEvents: GameEvent[] = [];
            snapshot.forEach((doc) => {
                loadedEvents.push({ id: doc.id, ...doc.data() } as GameEvent);
            });
            setEvents(loadedEvents);

            // Auto-scroll to bottom
            setTimeout(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            }, 100);
        });

        return () => {
            unsubscribeEvents();
        };
    }, [roomId]);


    // Make nice icons for events
    const getEventIcon = (type: EventType) => {
        switch (type) {
            case 'creation': return <UserPlus className="w-4 h-4 text-blue-400" />;
            case 'combat': return <Activity className="w-4 h-4 text-red-500" />;
            case 'mort': return <Skull className="w-4 h-4 text-gray-400" />;
            case 'niveau': return <TrendingUp className="w-4 h-4 text-yellow-400" />;
            case 'stats': return <Shield className="w-4 h-4 text-green-400" />;
            case 'inventaire': return <HandCoins className="w-4 h-4 text-amber-600" />;
            case 'competence': return <Star className="w-4 h-4 text-purple-400" />;
            default: return <History className="w-4 h-4 text-[var(--accent-brown)]" />;
        }
    };

    const formatEventTime = (timestamp: any) => {
        if (!timestamp) return '';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return format(date, 'HH:mm', { locale: fr });
        } catch (e) {
            return '';
        }
    };

    return (
        <Card className="flex flex-col h-full bg-[#1c1c1c] border-[var(--border-color)]">
            <CardHeader className="py-3 px-4 border-b border-[var(--border-color)]">
                <CardTitle className="text-lg font-semibold text-[var(--accent-brown)] flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Historique de la partie
                </CardTitle>
            </CardHeader>

            <ScrollArea className="flex-1 p-6" ref={scrollRef}>
                {events.length === 0 ? (
                    <div className="text-center text-[var(--text-secondary)] py-8 text-sm italic">
                        L'aventure commence... aucun événement pour le moment.
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Group events by Date */}
                        {Object.entries(
                            events.reduce((groups, event) => {
                                const dateStr = event.timestamp?.toDate
                                    ? format(event.timestamp.toDate(), 'd MMM, yyyy', { locale: fr }).toUpperCase()
                                    : event.timestamp
                                        ? format(new Date(event.timestamp), 'd MMM, yyyy', { locale: fr }).toUpperCase()
                                        : 'INCONNU';

                                if (!groups[dateStr]) groups[dateStr] = [];
                                groups[dateStr].push(event);
                                return groups;
                            }, {} as Record<string, GameEvent[]>)
                        ).map(([date, dayEvents], groupIndex) => (
                            <div key={date} className="relative">
                                {/* Date Header */}
                                <h3 className="text-[13px] font-bold text-[#a1a1aa] mb-4 tracking-wider uppercase">
                                    {date}
                                </h3>

                                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[5px] before:-translate-x-px before:h-full before:w-[1px] before:bg-gradient-to-b before:from-transparent before:via-[#3f3f46] before:to-transparent">
                                    {(dayEvents as GameEvent[]).map((event, index) => {
                                        return (
                                            <div key={event.id || index} className="relative flex gap-4 group">
                                                {/* Dot/Icon indicator */}
                                                <div className="relative mt-1">
                                                    <div className="absolute left-[5px] -translate-x-1/2 w-3 h-3 rounded-full bg-[#3f3f46] border-2 border-[#1c1c1c] z-10" />
                                                </div>

                                                {/* Content block */}
                                                <div className="flex flex-col space-y-2 w-full pt-0.5">
                                                    {/* Top row: Icon + Message */}
                                                    <div className="flex items-start gap-2">
                                                        <div className="mt-1 opacity-80 shrink-0">
                                                            {getEventIcon(event.type)}
                                                        </div>
                                                        <span className="font-bold text-[#f8fafc] text-[15px] leading-snug">
                                                            {event.message}
                                                        </span>
                                                    </div>

                                                    {/* Bottom row: Avatar + Name + Time */}
                                                    <div className="flex items-center gap-2 pl-[22px]">
                                                        <div className="w-5 h-5 rounded-full bg-[#27272a] border border-[#3f3f46] flex items-center justify-center text-[10px] text-white font-medium overflow-hidden shrink-0">
                                                            {event.characterName ? event.characterName.substring(0, 1).toUpperCase() : '?'}
                                                        </div>
                                                        <span className="text-[13px] text-[#a1a1aa]">
                                                            {event.characterName || 'Système'}
                                                        </span>
                                                        <span className="text-[11px] text-[#52525b] ml-auto">
                                                            {formatEventTime(event.timestamp)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </Card>
    );
}

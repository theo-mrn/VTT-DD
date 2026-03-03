'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDocs } from '@/lib/firebase';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { History, Shield, UserPlus, Skull, TrendingUp, HandCoins, Activity, Star } from 'lucide-react';
import { useGame } from '@/contexts/GameContext';
import { useCharacter } from '@/contexts/CharacterContext';

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
    characterAvatar?: string;
    details?: Record<string, any>;
}

interface HistoriqueProps {
    roomId: string;
}

export default function Historique({ roomId }: HistoriqueProps) {
    const [events, setEvents] = useState<GameEvent[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { characters } = useCharacter();


    useEffect(() => {
        if (!roomId) return;

        // 1. Subscribe to events collection to display history
        const eventsRef = collection(db, `Historique/${roomId}/events`);
        const q = query(eventsRef, orderBy('timestamp', 'desc'));

        const unsubscribeEvents = onSnapshot(q, (snapshot) => {
            const loadedEvents: GameEvent[] = [];
            snapshot.forEach((doc) => {
                loadedEvents.push({ id: doc.id, ...doc.data() } as GameEvent);
            });
            setEvents(loadedEvents);
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
        <div className="flex flex-col h-full bg-[#1c1c1c] border border-[var(--border-color)] rounded-lg">
            <div className="py-3 px-4 border-b border-[var(--border-color)]">
                <div className="text-lg font-semibold text-[var(--accent-brown)] flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Historique de la partie
                </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto" ref={scrollRef}>
                {events.length === 0 ? (
                    <div className="text-center text-[var(--text-secondary)] py-8 text-sm italic">
                        L'aventure commence... aucun événement pour le moment.
                    </div>
                ) : (
                    <div className="space-y-8">
                        <div className="w-full">
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
                                <React.Fragment key={date}>
                                    {/* Heading */}
                                    <div className="ps-2 my-2 first:mt-0">
                                        <h3 className="text-xs font-medium uppercase text-gray-500 dark:text-neutral-400">
                                            {date}
                                        </h3>
                                    </div>
                                    {/* End Heading */}

                                    {(dayEvents as GameEvent[]).map((event, index) => {
                                        let finalAvatar = event.characterAvatar;
                                        if (!finalAvatar && event.characterId) {
                                            const char = characters.find(c => c.id === event.characterId);
                                            if (char) {
                                                const rawImage = char.imageURL2 || char.imageURLFinal || char.image || char.imageUrl || char.imageURL;
                                                finalAvatar = typeof rawImage === 'object' && rawImage?.src ? rawImage.src : (typeof rawImage === 'string' ? rawImage : undefined);
                                            }
                                        }

                                        return (
                                            <div key={event.id || index} className="flex gap-x-3">
                                                {/* Line/Icon container */}
                                                <div className="relative last:after:hidden after:absolute after:top-7 after:bottom-0 after:start-3.5 after:-translate-x-[0.5px] after:border-s after:border-gray-200 dark:after:border-neutral-700">
                                                    <div className="relative z-10 size-7 flex justify-center items-center bg-white dark:bg-[#1c1c1c] rounded-full border border-gray-200 dark:border-neutral-700 overflow-hidden shrink-0">
                                                        <div className="text-gray-500 dark:text-neutral-400">
                                                            {getEventIcon(event.type)}
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* End Icon */}

                                                {/* Right Content */}
                                                <div className="grow pt-0.5 pb-8">
                                                    <h3 className="flex gap-x-1.5 font-medium text-gray-800 dark:text-neutral-200">
                                                        {event.message}
                                                    </h3>
                                                    <div className="mt-1 flex items-center justify-between">
                                                        <div className="inline-flex items-center gap-x-2 text-xs text-gray-500 dark:text-neutral-400">
                                                            {finalAvatar ? (
                                                                <img className="shrink-0 size-4 rounded-full object-cover" src={finalAvatar} alt={event.characterName || 'Avatar'} />
                                                            ) : (
                                                                <div className="shrink-0 size-4 rounded-full bg-gray-200 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 flex items-center justify-center text-[10px] text-gray-800 dark:text-white font-medium uppercase overflow-hidden">
                                                                    {event.characterName ? event.characterName.substring(0, 1).toUpperCase() : '?'}
                                                                </div>
                                                            )}
                                                            {event.characterName || 'Système'}
                                                        </div>
                                                        <span className="text-xs text-gray-500 dark:text-neutral-400">
                                                            {formatEventTime(event.timestamp)}
                                                        </span>
                                                    </div>
                                                </div>
                                                {/* End Right Content */}
                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

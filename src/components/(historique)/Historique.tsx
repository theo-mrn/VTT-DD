'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db, auth, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDocs, setDoc } from '@/lib/firebase';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { History, Shield, UserPlus, Skull, TrendingUp, HandCoins, Activity, Star, Book, MapPin, Sparkles, Loader2, Brain, Pencil, Check, X, ScrollText } from 'lucide-react';
import { useGame } from '@/contexts/GameContext';
import { useCharacter } from '@/contexts/CharacterContext';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from "@/components/ui/dialog";

// Define event types for better styling and icons
export type EventType =
    | 'creation'
    | 'combat'
    | 'mort'
    | 'niveau'
    | 'stats'
    | 'inventaire'
    | 'competence'
    | 'note'
    | 'deplacement'
    | 'info';

export interface GameEvent {
    id?: string;
    type: EventType;
    message: string;
    timestamp: any;
    characterId?: string;
    characterName?: string;
    characterAvatar?: string;
    characterType?: string;
    targetUserId?: string; // If set, only this user (and MJ) can see the event
    details?: Record<string, any>;
}

interface HistoriqueProps {
    roomId: string;
}

export default function Historique({ roomId }: HistoriqueProps) {
    const [events, setEvents] = useState<GameEvent[]>([]);
    const [summaries, setSummaries] = useState<Record<string, string>>({}); // Keyed by date
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
    const [editingModalDate, setEditingModalDate] = useState<string | null>(null);
    const [editedModalText, setEditedModalText] = useState<string>('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const { characters } = useCharacter();


    useEffect(() => {
        if (!roomId) return;

        // 1. Subscribe to events collection to display history
        const eventsRef = collection(db, `Historique/${roomId}/events`);
        const qEvents = query(eventsRef, orderBy('timestamp', 'desc'));

        const unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
            const userId = auth.currentUser?.uid;
            const loadedEvents: GameEvent[] = [];

            snapshot.forEach((doc) => {
                const data = doc.data() as GameEvent;
                if (!data.targetUserId || data.targetUserId === userId) {
                    loadedEvents.push({ id: doc.id, ...data });
                }
            });
            setEvents(loadedEvents);

            // Auto-select the most recent date for the summary modal context
            if (loadedEvents.length > 0) {
                const latestEvent = loadedEvents[0];
                const latestDateStr = latestEvent.timestamp?.toDate
                    ? format(latestEvent.timestamp.toDate(), 'yyyy-MM-dd')
                    : format(new Date(latestEvent.timestamp), 'yyyy-MM-dd');

                setSelectedDate(prev => prev || latestDateStr);
            }
        });

        // 2. Subscribe to summaries collection to show persisted AI summaries
        const summariesRef = collection(db, `Historique/${roomId}/summaries`);
        const unsubscribeSummaries = onSnapshot(summariesRef, (snapshot) => {
            const loadedSummaries: Record<string, string> = {};
            snapshot.forEach((doc) => {
                loadedSummaries[doc.id] = doc.data().text;
            });
            setSummaries(loadedSummaries);
        });

        return () => {
            unsubscribeEvents();
            unsubscribeSummaries();
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
            case 'note': return <Book className="w-4 h-4 text-blue-400" />;
            case 'deplacement': return <MapPin className="w-4 h-4 text-emerald-500" />;
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

    const handleStartEdit = (date: string, text: string) => {
        setEditingModalDate(date);
        setEditedModalText(text);
    };

    const handleSaveEdit = async () => {
        if (!editingModalDate || !roomId) return;

        try {
            const summaryRef = doc(db, `Historique/${roomId}/summaries`, editingModalDate);
            await setDoc(summaryRef, {
                text: editedModalText,
                updatedAt: serverTimestamp()
            }, { merge: true });
            setEditingModalDate(null);
        } catch (error) {
            console.error("Error saving summary:", error);
        }
    };

    const generateSummary = async () => {
        if (events.length === 0 || isSummarizing || !selectedDate) return;

        setIsSummarizing(true);

        try {
            const targetDate = selectedDate;
            const sessionEvents = events.filter(event => {
                const eventDate = event.timestamp?.toDate
                    ? format(event.timestamp.toDate(), 'yyyy-MM-dd')
                    : format(new Date(event.timestamp), 'yyyy-MM-dd');
                return eventDate === targetDate;
            }).reverse();

            if (sessionEvents.length === 0) {
                console.warn("No events found for the selected date:", targetDate);
                return;
            }

            const response = await fetch('/api/summarize-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: sessionEvents })
            });

            if (!response.ok) throw new Error('Erreur lors du résumé');

            const data = await response.json();

            const summaryRef = doc(db, `Historique/${roomId}/summaries`, targetDate);
            await setDoc(summaryRef, {
                text: data.summary,
                updatedAt: serverTimestamp()
            });

        } catch (error) {
            console.error("Summary error:", error);
        } finally {
            setIsSummarizing(false);
        }
    };

    // Extract unique dates for navigation in the modal
    const uniqueDates = Array.from(new Set(events.map(event => {
        return event.timestamp?.toDate
            ? format(event.timestamp.toDate(), 'yyyy-MM-dd')
            : format(new Date(event.timestamp), 'yyyy-MM-dd');
    }))).sort((a, b) => b.localeCompare(a));

    return (
        <div className="flex flex-col h-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg overflow-hidden shadow-xl">
            {/* Header */}
            <div className="py-2 px-5 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-darker)]/40 backdrop-blur-md sticky top-0 z-20">
                <div className="text-lg font-bold text-[var(--accent-brown)] flex items-center gap-2">
                    <History className="w-5 h-5" />
                    <span className="font-title tracking-tight">Archives du Destin</span>
                </div>
            </div>

            {/* Event List */}
            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-[var(--bg-dark)]/10" ref={scrollRef}>
                {events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-40 py-20 pointer-events-none text-center">
                        <History className="w-16 h-16 mb-4 text-[var(--text-secondary)] mx-auto" />
                        <p className="text-[var(--text-secondary)] font-medium italic">L'aventure commence... les parchemins sont encore vierges.</p>
                    </div>
                ) : (
                    <div className="space-y-6 max-w-4xl mx-auto">
                        {/* Group events by Date */}
                        {Object.entries(
                            events.reduce((groups, event) => {
                                const dateStr = event.timestamp?.toDate
                                    ? format(event.timestamp.toDate(), 'd MMMM yyyy', { locale: fr }).toUpperCase()
                                    : event.timestamp
                                        ? format(new Date(event.timestamp), 'd MMMM yyyy', { locale: fr }).toUpperCase()
                                        : 'INCONNU';

                                if (!groups[dateStr]) groups[dateStr] = [];
                                groups[dateStr].push(event);
                                return groups;
                            }, {} as Record<string, GameEvent[]>)
                        ).map(([date, dayEvents]) => (
                            <div key={date} className="space-y-4">
                                <div className="flex items-center gap-4 py-2 sticky top-0 bg-[var(--bg-dark)]/80 backdrop-blur-sm z-10 -mx-4 px-4">
                                    <div className="h-px grow bg-gradient-to-r from-transparent via-[var(--border-color)] to-transparent opacity-50"></div>
                                    <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-secondary)] bg-[var(--bg-dark)] px-4 py-1.5 rounded-full border border-[var(--border-color)] shadow-sm">
                                        {date}
                                    </h3>
                                    <button
                                        onClick={() => setIsSummaryModalOpen(true)}
                                        className="flex items-center gap-x-2 px-3 py-1.5 bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-[var(--bg-darker)] rounded-full text-[10px] font-bold transition-all shadow-md active:scale-95 group uppercase tracking-widest"
                                    >
                                        <ScrollText className="w-3.5 h-3.5 group-hover:rotate-6 transition-transform" />
                                        Résumé
                                    </button>
                                    <div className="h-px grow bg-gradient-to-r from-transparent via-[var(--border-color)] to-transparent opacity-50"></div>
                                </div>


                                <div className="space-y-3">
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
                                            <div key={event.id || index} className="flex gap-x-4 items-start group/event hover:bg-white/[0.02] p-3 -mx-3 rounded-2xl transition-all duration-200">
                                                {/* Left side: Avatar */}
                                                <div className="shrink-0 pt-1">
                                                    <div className="size-10 flex justify-center items-center bg-[var(--bg-darker)] rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-inner ring-1 ring-white/5 transition-transform group-hover/event:scale-110 group-hover/event:rotate-2">
                                                        {finalAvatar ? (
                                                            <img className="size-full object-cover" src={finalAvatar} alt={event.characterName || 'Avatar'} />
                                                        ) : (
                                                            <div className="size-full flex items-center justify-center text-sm text-[var(--accent-brown)] font-bold uppercase">
                                                                {event.characterName ? event.characterName.substring(0, 1).toUpperCase() : '?'}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Content */}
                                                <div className="grow space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-[var(--accent-brown)] uppercase tracking-widest flex items-center gap-2">
                                                            {getEventIcon(event.type)}
                                                            {event.characterName || 'Système'}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-[var(--text-secondary)] opacity-40 uppercase">
                                                            {formatEventTime(event.timestamp)}
                                                        </span>
                                                    </div>
                                                    <div className="text-[13px] text-[var(--text-primary)] leading-relaxed font-body">
                                                        {event.message.split(/(\*\*.*?\*\*)/g).map((part, i) => {
                                                            if (part.startsWith('**') && part.endsWith('**')) {
                                                                return (
                                                                    <span key={i} className="px-2 py-0.5 bg-[var(--accent-brown)]/10 border border-[var(--accent-brown)]/20 text-[var(--accent-brown)] rounded-md text-[9px] font-black uppercase tracking-widest inline-block mx-0.5 shadow-sm align-baseline">
                                                                        {part.slice(2, -2)}
                                                                    </span>
                                                                );
                                                            }
                                                            return part;
                                                        })}
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
            </div>

            {/* Summary Modal */}
            <Dialog open={isSummaryModalOpen} onOpenChange={setIsSummaryModalOpen}>
                <DialogContent unstyled className="sm:max-w-4xl !p-0 fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full outline-none">
                    <div className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] overflow-hidden flex flex-col max-h-[85vh] rounded-[2.5rem] shadow-[0_32px_120px_-10px_rgba(0,0,0,0.9)] relative isolate">
                        {/* Close Button Overlay */}
                        <div className="absolute top-4 right-4 z-[70]">
                            <DialogClose className="p-2 transition-all hover:bg-white/10 text-white/40 hover:text-white rounded-full border border-transparent hover:border-white/10">
                                <X className="size-5" />
                            </DialogClose>
                        </div>

                        <DialogHeader className="p-4 px-8 border-b border-[var(--border-color)] bg-[var(--bg-darker)] backdrop-blur-2xl relative z-50 rounded-t-[2.5rem]">
                            <div className="absolute top-0 right-14 p-4 opacity-5 pointer-events-none">
                                <Brain className="w-16 h-16 text-[var(--accent-brown)]" />
                            </div>

                            <div className="flex items-center justify-between gap-6 mr-10 relative z-10">
                                <DialogTitle className="text-2xl font-title text-[var(--accent-brown)] flex items-center gap-3">
                                    <ScrollText className="w-6 h-6" />
                                    <span className="uppercase tracking-[0.2em] font-black">Chroniques</span>
                                </DialogTitle>

                                <div className="flex items-center gap-4">
                                    <select
                                        value={selectedDate || ''}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        className="bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-xl px-4 py-2 text-[11px] font-bold focus:ring-1 focus:ring-[var(--accent-brown)]/50 outline-none min-w-[170px] shadow-inner appearance-none cursor-pointer hover:border-[var(--accent-brown)]/30 transition-colors uppercase tracking-widest"
                                    >
                                        <option value="" disabled>Parchemins...</option>
                                        {uniqueDates.map(date => (
                                            <option key={date} value={date}>
                                                {format(new Date(date), 'dd MMMM yyyy', { locale: fr })}
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        onClick={generateSummary}
                                        disabled={isSummarizing || !selectedDate}
                                        className="flex items-center gap-x-2 px-5 py-2 bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] disabled:opacity-50 text-[var(--bg-darker)] rounded-xl text-[10px] font-black transition-all shadow-md active:scale-95 group uppercase tracking-widest"
                                    >
                                        {isSummarizing ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                                        )}
                                        {isSummarizing ? "Codification..." : "IA"}
                                    </button>
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar bg-gradient-to-b from-[var(--bg-dark)]/40 to-transparent min-h-0 relative z-10">
                            {selectedDate ? (
                                summaries[selectedDate] ? (
                                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
                                        <div className="flex items-center justify-between">
                                            <h4 className="flex items-center gap-x-4 text-[var(--accent-brown)] font-black text-[11px] uppercase tracking-[0.4em] opacity-80">
                                                <Sparkles className="w-4 h-4 text-indigo-400" />
                                                Parchemin du {format(new Date(selectedDate), 'dd/MM/yyyy')}
                                            </h4>

                                            {editingModalDate === selectedDate ? (
                                                <div className="flex items-center gap-x-3">
                                                    <button
                                                        onClick={handleSaveEdit}
                                                        className="flex items-center gap-2 px-6 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-xl text-[10px] font-black transition-all border border-green-500/30 uppercase tracking-[0.2em] shadow-lg shadow-green-500/10"
                                                    >
                                                        <Check className="w-4 h-4" /> Sauvegarder
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingModalDate(null)}
                                                        className="flex items-center gap-2 px-6 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-xl text-[10px] font-black transition-all border border-red-500/30 uppercase tracking-[0.2em]"
                                                    >
                                                        <X className="w-4 h-4" /> Annuler
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => handleStartEdit(selectedDate, summaries[selectedDate])}
                                                    className="flex items-center gap-2 px-6 py-2 bg-white/5 hover:bg-white/10 text-[var(--accent-brown)] rounded-xl text-[10px] font-black transition-all border border-[var(--border-color)] uppercase tracking-[0.2em] shadow-sm group/btn"
                                                >
                                                    <Pencil className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                                                    L'édit de la plume
                                                </button>
                                            )}
                                        </div>

                                        {editingModalDate === selectedDate ? (
                                            <textarea
                                                value={editedModalText}
                                                onChange={(e) => setEditedModalText(e.target.value)}
                                                className="w-full min-h-[450px] bg-black/40 border-2 border-[var(--accent-brown)]/20 rounded-3xl p-10 text-[16px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-brown)]/40 transition-all custom-scrollbar leading-[1.8] font-body shadow-inner"
                                                placeholder="Rédigez ici le récit épique de votre séance..."
                                                autoFocus
                                            />
                                        ) : (
                                            <div className="bg-[var(--bg-darker)]/40 border border-[var(--border-color)] p-12 rounded-[2.5rem] shadow-2xl relative isolate group/summary transition-all hover:bg-[var(--bg-darker)]/50">
                                                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-transparent via-[var(--accent-brown)]/40 to-transparent opacity-0 group-hover/summary:opacity-100 transition-opacity duration-1000"></div>
                                                <div className="text-[15px] text-[var(--text-primary)] leading-[1.8] whitespace-pre-wrap font-body selection:bg-[var(--accent-brown)]/30">
                                                    {summaries[selectedDate].split(/(\*\*.*?\*\*)/g).map((part, i) => {
                                                        if (part.startsWith('**') && part.endsWith('**')) {
                                                            return (
                                                                <span key={i} className="px-2.5 py-0.5 mx-1 bg-[var(--accent-brown)]/10 border border-[var(--accent-brown)]/20 text-[var(--accent-brown)] rounded-lg font-black text-[10px] uppercase tracking-[0.2em] inline-block shadow-lg shadow-black/20 align-baseline transition-transform hover:scale-105 active:scale-95 cursor-default">
                                                                    {part.slice(2, -2)}
                                                                </span>
                                                            );
                                                        }
                                                        return part;
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full py-24 opacity-30 text-center space-y-10 grayscale hover:grayscale-0 transition-all duration-1000">
                                        <div className="p-10 bg-[var(--bg-darker)] rounded-full border border-[var(--border-color)] shadow-inner">
                                            <Sparkles className="w-20 h-20 text-[var(--accent-brown)] animate-pulse" />
                                        </div>
                                        <p className="text-sm font-black uppercase tracking-[0.5em] max-w-xs leading-loose">
                                            Aucune chronique n'a été gravée pour cette séance.
                                        </p>
                                    </div>
                                )
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full py-24 opacity-20 text-center space-y-10">
                                    <ScrollText className="w-32 h-32 stroke-[1px]" />
                                    <p className="text-xs font-black uppercase tracking-[0.6em]">Sélectionnez un parchemin d'aventure</p>
                                </div>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { db, auth, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDocs, setDoc, where, limit } from '@/lib/firebase';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { History, Shield, UserPlus, Skull, TrendingUp, HandCoins, Activity, Star, Book, MapPin, Sparkles, Loader2, Pencil, Check, X, ScrollText, ChevronDown } from 'lucide-react';
import { useGame } from '@/contexts/GameContext';
import { useCharacter } from '@/contexts/CharacterContext';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
    const [displayDate, setDisplayDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
    const [historyDates, setHistoryDates] = useState<string[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { characters } = useCharacter();

    // 1. Fetch available dates ONCE to populate the dropdown
    useEffect(() => {
        if (!roomId) return;

        const fetchDates = async () => {
            try {
                // Only fetch timestamp field via a lightweight query
                const eventsRef = collection(db, `Historique/${roomId}/events`);
                const q = query(eventsRef, orderBy('timestamp', 'desc'), limit(200));
                const snapshot = await getDocs(q);
                const dates = new Set<string>();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.timestamp) {
                        const d = data.timestamp.toDate ? format(data.timestamp.toDate(), 'yyyy-MM-dd') : format(new Date(data.timestamp), 'yyyy-MM-dd');
                        dates.add(d);
                    }
                });

                const todayStr = format(new Date(), 'yyyy-MM-dd');
                dates.add(todayStr);

                const datesArr = Array.from(dates).sort((a, b) => b.localeCompare(a));
                setHistoryDates(datesArr);
                // Switch to the most recent date with actual events
                if (datesArr[0]) setDisplayDate(datesArr[0]);
            } catch (err) {
                console.error("Error fetching history dates:", err);
            }
        };

        fetchDates();
    }, [roomId]);

    // 2. Subscribe to events specifically for the displayDate with a WHERE clause
    useEffect(() => {
        if (!roomId || !displayDate) return;

        const start = new Date(displayDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(displayDate);
        end.setHours(23, 59, 59, 999);

        const eventsRef = collection(db, `Historique/${roomId}/events`);
        const qEvents = query(
            eventsRef,
            where('timestamp', '>=', start),
            where('timestamp', '<=', end),
            orderBy('timestamp', 'desc')
        );

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

            if (loadedEvents.length > 0 && !selectedDate) {
                const latestEvent = loadedEvents[0];
                const latestDateStr = latestEvent.timestamp?.toDate
                    ? format(latestEvent.timestamp.toDate(), 'yyyy-MM-dd')
                    : format(new Date(latestEvent.timestamp), 'yyyy-MM-dd');

                setSelectedDate(prev => prev || latestDateStr);
            }
        });

        // 3. Subscribe to summaries collection to show persisted AI summaries
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
    }, [roomId, displayDate]);


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

    const parseAndFormatDateString = (dateStr: string) => {
        try {
            return format(new Date(dateStr), 'd MMMM yyyy', { locale: fr }).toUpperCase();
        } catch (e) {
            return dateStr;
        }
    };

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
                        {displayDate && (
                            <div key={displayDate} className="space-y-4">
                                <div className="flex items-center gap-4 py-2 sticky top-0 bg-[var(--bg-dark)]/80 backdrop-blur-sm z-10 -mx-4 px-4">
                                    <div className="h-px grow bg-gradient-to-r from-transparent via-[var(--border-color)] to-transparent opacity-50"></div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-dark)] hover:bg-[var(--bg-darker)] px-4 py-1.5 rounded-full border border-[var(--border-color)] shadow-sm transition-colors group">
                                                {parseAndFormatDateString(displayDate)} <ChevronDown className="w-3 h-3 group-hover:translate-y-px transition-transform text-[var(--accent-brown)]" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent className="bg-[var(--bg-card)] border-[var(--border-color)] max-h-[300px] overflow-y-auto z-50">
                                            {historyDates.map(d => (
                                                <DropdownMenuItem key={d} onClick={() => setDisplayDate(d)} className={`text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${d === displayDate ? 'text-[var(--accent-brown)] bg-[var(--bg-darker)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-dark)]'}`}>
                                                    {parseAndFormatDateString(d)}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
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
                                    {events.map((event, index) => {
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
                        )}
                    </div>
                )}
            </div>

            {/* Summary Modal */}
            <Dialog open={isSummaryModalOpen} onOpenChange={setIsSummaryModalOpen}>
                <DialogContent unstyled showCloseButton={false} className="sm:max-w-3xl !p-0 fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full outline-none">
                    <div className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] overflow-hidden flex flex-col max-h-[85vh] rounded-2xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.7)]">

                        {/* Header - sticky */}
                        <DialogHeader className="shrink-0 px-6 py-5 border-b border-[var(--border-color)] bg-[var(--bg-darker)]">
                            <div className="flex items-center justify-between">
                                <DialogTitle className="text-lg font-title text-[var(--accent-brown)] flex items-center gap-2.5">
                                    <ScrollText className="w-5 h-5" />
                                    <span className="uppercase tracking-widest font-black">Chroniques</span>
                                </DialogTitle>
                                <DialogClose className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-dark)] transition-colors">
                                    <X className="size-4" />
                                </DialogClose>
                            </div>

                            {/* Controls row */}
                            <div className="flex items-center gap-3 mt-4">
                                <select
                                    value={selectedDate || ''}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="flex-1 bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-xs font-semibold focus:ring-1 focus:ring-[var(--accent-brown)]/50 outline-none appearance-none cursor-pointer hover:border-[var(--accent-brown)]/30 transition-colors"
                                >
                                    <option value="" disabled>Choisir une date...</option>
                                    {historyDates.map(date => (
                                        <option key={date} value={date}>
                                            {format(new Date(date), 'dd MMMM yyyy', { locale: fr })}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={generateSummary}
                                    disabled={isSummarizing || !selectedDate}
                                    className="shrink-0 flex items-center gap-2 px-4 py-2 bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-darker)] rounded-lg text-xs font-bold transition-all active:scale-95 group"
                                >
                                    {isSummarizing ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Sparkles className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                                    )}
                                    {isSummarizing ? "Génération..." : "Générer avec IA"}
                                </button>
                            </div>
                        </DialogHeader>

                        {/* Content - scrollable */}
                        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
                            {selectedDate ? (
                                summaries[selectedDate] ? (
                                    <div className="p-6 space-y-4">
                                        {/* Date badge */}
                                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                            <Sparkles className="w-3.5 h-3.5 text-[var(--accent-brown)]" />
                                            <span className="text-[11px] font-semibold uppercase tracking-wider">
                                                Séance du {format(new Date(selectedDate), 'dd MMMM yyyy', { locale: fr })}
                                            </span>
                                        </div>

                                        {/* Summary text or edit area */}
                                        {editingModalDate === selectedDate ? (
                                            <textarea
                                                value={editedModalText}
                                                onChange={(e) => setEditedModalText(e.target.value)}
                                                className="w-full min-h-[350px] bg-[var(--bg-dark)] border border-[var(--border-color)] focus:border-[var(--accent-brown)]/40 rounded-lg p-5 text-sm text-[var(--text-primary)] focus:outline-none transition-colors leading-relaxed font-body resize-y scrollbar-thin"
                                                placeholder="Rédigez ici le récit de votre séance..."
                                                autoFocus
                                            />
                                        ) : (
                                            <div className="bg-[var(--bg-dark)]/60 border border-[var(--border-color)] rounded-lg p-6 relative">
                                                <div className="absolute top-0 left-0 w-0.5 h-full bg-gradient-to-b from-[var(--accent-brown)]/60 via-[var(--accent-brown)]/20 to-transparent rounded-full"></div>
                                                <div className="text-sm text-[var(--text-primary)] leading-[1.9] whitespace-pre-wrap font-body pl-3 selection:bg-[var(--accent-brown)]/20">
                                                    {summaries[selectedDate].split(/(\*\*.*?\*\*)/g).map((part, i) => {
                                                        if (part.startsWith('**') && part.endsWith('**')) {
                                                            return (
                                                                <span key={i} className="px-1.5 py-0.5 mx-0.5 bg-[var(--accent-brown)]/10 border border-[var(--accent-brown)]/20 text-[var(--accent-brown)] rounded text-[10px] font-bold uppercase tracking-wider inline-block align-baseline">
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
                                    <div className="flex flex-col items-center justify-center py-20 text-center space-y-5">
                                        <div className="p-6 bg-[var(--bg-dark)] rounded-2xl border border-[var(--border-color)]">
                                            <Sparkles className="w-10 h-10 text-[var(--accent-brown)] opacity-40" />
                                        </div>
                                        <p className="text-xs text-[var(--text-secondary)] font-medium max-w-[220px] leading-relaxed">
                                            Aucune chronique pour cette séance. Utilisez le bouton IA pour en générer une.
                                        </p>
                                    </div>
                                )
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 text-center space-y-5">
                                    <ScrollText className="w-12 h-12 text-[var(--text-secondary)] opacity-30" />
                                    <p className="text-xs text-[var(--text-secondary)] font-medium">
                                        Sélectionnez une date ci-dessus
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Footer - sticky actions */}
                        {selectedDate && summaries[selectedDate] && (
                            <div className="shrink-0 px-6 py-4 border-t border-[var(--border-color)] bg-[var(--bg-darker)] flex items-center justify-end gap-3">
                                {editingModalDate === selectedDate ? (
                                    <>
                                        <button
                                            onClick={() => setEditingModalDate(null)}
                                            className="flex items-center gap-1.5 px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-dark)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-xs font-semibold transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                            Annuler
                                        </button>
                                        <button
                                            onClick={handleSaveEdit}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-[var(--bg-darker)] rounded-lg text-xs font-bold transition-colors active:scale-95"
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                            Sauvegarder
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => handleStartEdit(selectedDate, summaries[selectedDate])}
                                        className="flex items-center gap-1.5 px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--accent-brown)] bg-[var(--bg-dark)] hover:bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-xs font-semibold transition-colors group/edit"
                                    >
                                        <Pencil className="w-3.5 h-3.5 group-hover/edit:scale-110 transition-transform" />
                                        Modifier
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

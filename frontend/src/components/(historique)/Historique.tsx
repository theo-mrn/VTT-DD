'use client';

/**
 * Panneau Historique (« Archives du Destin ») de l'ancienne app, branché sur
 * le service history : Journal d'une journée (choix de la date), vue « Par
 * personnage », mises à jour en direct. Seul l'accès aux données change :
 * lecture paginée de `/v1/history` (visibilité appliquée par le serveur) au
 * lieu de `Historique/{roomId}/events`, noms lus en lot (campagne, personnages,
 * système). Les chroniques IA (`Historique/{roomId}/summaries`) n'ont pas
 * encore de service : la fenêtre « Résumé » est gardée, sans génération.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  History,
  Shield,
  UserPlus,
  Skull,
  TrendingUp,
  HandCoins,
  Activity,
  Star,
  Book,
  MapPin,
  Sparkles,
  Loader2,
  X,
  ScrollText,
  ChevronDown,
  Users,
  ArrowLeft,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { HistoryEvent } from '@/lib/history';
import { formatHistoryEvent, type EventType, type GameEvent } from './format';
import {
  touchesRoster,
  useHistoryFeed,
  useHistoryLabels,
  useHistoryLive,
  type HistoryFilter,
} from './use-history';

export type { EventType, GameEvent } from './format';

interface HistoriqueProps {
  /** Identifiant de la campagne. */
  roomId: string;
  initialCharacterId?: string;
  // Si vrai, verrouille l'affichage sur le seul personnage donné :
  // pas de bouton retour, pas de toggle Journal/Par personnage.
  // Utilisé pour qu'un joueur ne puisse voir que l'historique de son propre personnage.
  lockToCharacter?: boolean;
}

/** Journal d'une journée : pages de 200 (l'ancienne app lisait toute la journée d'un coup). */
const DAY_PAGE = 200;
/** Vue « Par personnage » : 100 événements, comme l'ancienne app, puis la suite au défilement. */
const CHARACTER_PAGE = 100;

// ─── Dates (formats de l'ancienne app, en français) ─────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const MONTH_LONG = new Intl.DateTimeFormat('fr-FR', { month: 'long' });
const MONTH_SHORT = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

/** `yyyy-MM-dd` dans le fuseau du navigateur. */
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Minuit (heure locale) d'une journée `yyyy-MM-dd`. */
function dayStart(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** Bornes `from` (incluse) et `to` (exclue) d'une journée locale. */
function dayRange(key: string): HistoryFilter {
  const start = dayStart(key);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** `d MMMM yyyy`, ou `dd MMMM yyyy` avec `padDay`. */
function longDate(d: Date, padDay = false) {
  return `${padDay ? pad(d.getDate()) : d.getDate()} ${MONTH_LONG.format(d)} ${d.getFullYear()}`;
}

const shortDate = (d: Date) => `${d.getDate()} ${MONTH_SHORT.format(d)} ${d.getFullYear()}`;

export default function Historique({
  roomId,
  initialCharacterId,
  lockToCharacter,
}: HistoriqueProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [displayDate, setDisplayDate] = useState<string>(() => dayKey(new Date()));
  const [historyDates, setHistoryDates] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const characterScrollRef = useRef<HTMLDivElement>(null);

  // ─── Mode "Par personnage" ──────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'timeline' | 'characterList' | 'characterEvents'>(
    initialCharacterId ? 'characterEvents' : 'timeline',
  );
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    initialCharacterId ?? null,
  );

  // 1. Derniers événements (dates proposées), puis chaque nouvel événement en direct
  const liveHandler = useRef<(events: HistoryEvent[]) => void>(() => undefined);
  const onLive = useCallback((events: HistoryEvent[]) => liveHandler.current(events), []);
  const { recent } = useHistoryLive(roomId, onLive);

  // 2. Événements de la journée affichée (bornes from/to), une fois les dates connues
  const timeline = useHistoryFeed(
    roomId,
    viewMode === 'timeline' && recent !== null ? dayRange(displayDate) : null,
    DAY_PAGE,
  );

  // 3. Événements du personnage choisi (mode "Par personnage")
  const characterFeed = useHistoryFeed(
    roomId,
    viewMode === 'characterEvents' && selectedCharacterId
      ? { characterId: selectedCharacterId }
      : null,
    CHARACTER_PAGE,
  );

  const allEvents = useMemo(
    () => [...(recent ?? []), ...timeline.events, ...characterFeed.events],
    [recent, timeline.events, characterFeed.events],
  );
  const { ctx, characters, loadingCharacters, refreshCharacters } = useHistoryLabels(
    roomId,
    allEvents,
  );

  // Dates disponibles, à partir des derniers événements (comme l'ancienne app)
  const datesInitialized = useRef(false);
  useEffect(() => {
    datesInitialized.current = false;
    setHistoryDates([]);
    setSelectedDate(null);
    setDisplayDate(dayKey(new Date()));
  }, [roomId]);
  useEffect(() => {
    if (recent === null) return;
    const dates = new Set<string>(recent.map((e) => dayKey(new Date(e.occurredAt))));
    const latestEventDate = recent[0] ? dayKey(new Date(recent[0].occurredAt)) : null;
    dates.add(dayKey(new Date()));
    const datesArr = Array.from(dates).sort((a, b) => b.localeCompare(a));
    setHistoryDates((prev) =>
      Array.from(new Set([...prev, ...datesArr])).sort((a, b) => b.localeCompare(a)),
    );
    if (!datesInitialized.current && latestEventDate) {
      datesInitialized.current = true;
      // Switch to the most recent date with actual events
      setDisplayDate(latestEventDate);
      setSelectedDate((prev) => prev || latestEventDate);
    }
  }, [recent]);

  // Nouveaux événements : en haut de la liste qui les concerne
  liveHandler.current = (incoming) => {
    timeline.push(incoming);
    characterFeed.push(incoming);
    const dates = incoming.map((e) => dayKey(new Date(e.occurredAt)));
    setHistoryDates((prev) => {
      const next = Array.from(new Set([...prev, ...dates])).sort((a, b) => b.localeCompare(a));
      return next.length === prev.length ? prev : next;
    });
    if (touchesRoster(incoming)) refreshCharacters();
  };

  const format = useCallback(
    (list: HistoryEvent[]) =>
      list.map((e) => formatHistoryEvent(e, ctx)).filter((e): e is GameEvent => e !== null),
    [ctx],
  );
  const events = useMemo(
    () => format(timeline.events).filter((e) => !e.hiddenFromTimeline),
    [format, timeline.events],
  );
  const characterEvents = useMemo(
    () => format(characterFeed.events),
    [format, characterFeed.events],
  );
  const isLoadingCharacterEvents = characterFeed.loading;
  /** Journal de la journée entièrement lu (plus rien à charger). */
  const timelineDone = !timeline.loading && !timeline.hasMore;

  const openCharacterEvents = (characterId: string) => {
    setSelectedCharacterId(characterId);
    setViewMode('characterEvents');
  };

  // Make nice icons for events
  const getEventIcon = (type: EventType) => {
    switch (type) {
      case 'creation':
        return <UserPlus className="w-4 h-4 text-blue-400" />;
      case 'combat':
        return <Activity className="w-4 h-4 text-red-500" />;
      case 'mort':
        return <Skull className="w-4 h-4 text-gray-400" />;
      case 'niveau':
        return <TrendingUp className="w-4 h-4 text-yellow-400" />;
      case 'stats':
        return <Shield className="w-4 h-4 text-green-400" />;
      case 'inventaire':
        return <HandCoins className="w-4 h-4 text-amber-600" />;
      case 'competence':
        return <Star className="w-4 h-4 text-purple-400" />;
      case 'note':
        return <Book className="w-4 h-4 text-blue-400" />;
      case 'deplacement':
        return <MapPin className="w-4 h-4 text-emerald-500" />;
      default:
        return <History className="w-4 h-4 text-[var(--accent-brown)]" />;
    }
  };

  const formatEventTime = (timestamp: Date) => {
    if (Number.isNaN(timestamp.getTime())) return '';
    return `${pad(timestamp.getHours())}:${pad(timestamp.getMinutes())}`;
  };

  const parseAndFormatDateString = (dateStr: string) => {
    const date = dayStart(dateStr);
    return Number.isNaN(date.getTime()) ? dateStr : longDate(date).toUpperCase();
  };

  // Personnage retiré de la campagne : nom connu par ses événements
  const viewedCharacter = selectedCharacterId
    ? (ctx.characters.get(selectedCharacterId.toLowerCase()) ?? null)
    : null;

  const renderMessage = (message: string) =>
    message.split(/(\*\*.*?\*\*)/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <span
            key={i}
            className="px-2 py-0.5 border text-[var(--accent-brown)] rounded-md text-[9px] font-black uppercase tracking-widest inline-block mx-0.5 shadow-sm align-baseline"
            style={{
              background: 'color-mix(in srgb, var(--accent-brown) 10%, transparent)',
              borderColor: 'color-mix(in srgb, var(--accent-brown) 20%, transparent)',
            }}
          >
            {part.slice(2, -2)}
          </span>
        );
      }
      return part;
    });

  return (
    <div className="flex flex-col h-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg overflow-hidden shadow-xl">
      {/* Header */}
      <div
        className="py-2 px-5 border-b border-[var(--border-color)] flex items-center justify-between backdrop-blur-md sticky top-0 z-20"
        style={{ background: 'color-mix(in srgb, var(--bg-darker) 40%, transparent)' }}
      >
        <div className="text-lg font-bold text-[var(--accent-brown)] flex items-center gap-2">
          {viewMode === 'characterEvents' ? (
            lockToCharacter ? (
              <>
                <History className="w-5 h-5" />
                <span className="font-title tracking-tight">
                  Historique de {viewedCharacter?.name || 'ce personnage'}
                </span>
              </>
            ) : (
              <button
                onClick={() => {
                  setViewMode('characterList');
                  setSelectedCharacterId(null);
                }}
                className="flex items-center gap-2 hover:text-[var(--accent-brown-hover)] transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-title tracking-tight">
                  {viewedCharacter?.name || 'Personnage'}
                </span>
              </button>
            )
          ) : (
            <>
              <History className="w-5 h-5" />
              <span className="font-title tracking-tight">Archives du Destin</span>
            </>
          )}
        </div>
        {!lockToCharacter && (
          <div className="flex items-center gap-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-full p-1">
            <button
              onClick={() => {
                setViewMode('timeline');
                setSelectedCharacterId(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors ${viewMode === 'timeline' ? 'bg-[var(--accent-brown)] text-[var(--bg-darker)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              <History className="w-3.5 h-3.5" />
              Journal
            </button>
            <button
              onClick={() => setViewMode('characterList')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors ${viewMode !== 'timeline' ? 'bg-[var(--accent-brown)] text-[var(--bg-darker)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              <Users className="w-3.5 h-3.5" />
              Par personnage
            </button>
          </div>
        )}
      </div>

      {viewMode === 'characterList' && (
        <div
          className="flex-1 p-6 overflow-y-auto custom-scrollbar"
          style={{ background: 'color-mix(in srgb, var(--bg-dark) 10%, transparent)' }}
        >
          <div className="max-w-4xl mx-auto grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-6 gap-4">
            {characters.map((char) => {
              const avatar = char.avatarUrl ?? undefined;
              return (
                <button
                  key={char.characterId}
                  onClick={() => openCharacterEvents(char.characterId)}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className="size-14 flex justify-center items-center bg-[var(--bg-darker)] rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-inner ring-1 ring-white/5 transition-transform group-hover:scale-110 group-hover:border-[var(--accent-brown)]">
                    {avatar ? (
                      <img className="size-full object-cover" src={avatar} alt={char.name} />
                    ) : (
                      <div className="size-full flex items-center justify-center text-lg text-[var(--accent-brown)] font-bold uppercase">
                        {char.name ? char.name.substring(0, 1).toUpperCase() : '?'}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] truncate max-w-[80px] text-center">
                    {char.name}
                  </span>
                </button>
              );
            })}
            {characters.length === 0 &&
              (loadingCharacters ? (
                <div className="col-span-full flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-brown)]" />
                </div>
              ) : (
                <div className="col-span-full text-center py-20 text-[var(--text-secondary)] text-sm italic">
                  Aucun personnage dans cette partie.
                </div>
              ))}
          </div>
        </div>
      )}

      {viewMode === 'characterEvents' && (
        <div
          className="flex-1 p-6 overflow-y-auto custom-scrollbar"
          ref={characterScrollRef}
          style={{ background: 'color-mix(in srgb, var(--bg-dark) 10%, transparent)' }}
        >
          <div className="max-w-4xl mx-auto space-y-3">
            {isLoadingCharacterEvents && characterEvents.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-brown)]" />
              </div>
            ) : characterEvents.length === 0 && !characterFeed.hasMore ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-40 text-center">
                <History className="w-12 h-12 mb-4 text-[var(--text-secondary)] mx-auto" />
                <p className="text-[var(--text-secondary)] font-medium italic">
                  {characterFeed.error ?? 'Aucun événement enregistré pour ce personnage.'}
                </p>
              </div>
            ) : (
              characterEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex gap-x-4 items-start group/event hover:bg-white/[0.02] p-3 -mx-3 rounded-2xl transition-all duration-200"
                >
                  <div className="shrink-0 pt-1">
                    <div className="size-10 flex justify-center items-center bg-[var(--bg-darker)] rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-inner ring-1 ring-white/5">
                      {getEventIcon(event.type)}
                    </div>
                  </div>
                  <div className="grow space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-[var(--text-secondary)] opacity-60 uppercase tracking-wider">
                        {Number.isNaN(event.timestamp.getTime()) ? '' : shortDate(event.timestamp)}
                      </span>
                      <span className="text-[9px] font-bold text-[var(--text-secondary)] opacity-40 uppercase">
                        {formatEventTime(event.timestamp)}
                      </span>
                    </div>
                    <div className="text-[13px] text-[var(--text-primary)] leading-relaxed font-body">
                      {renderMessage(event.message)}
                    </div>
                  </div>
                </div>
              ))
            )}
            <LoadMore
              rootRef={characterScrollRef}
              active={characterFeed.hasMore && !characterFeed.loading}
              loading={characterFeed.loadingMore}
              onLoad={characterFeed.loadMore}
              itemCount={characterFeed.events.length}
            />
          </div>
        </div>
      )}

      {/* Event List (Timeline) */}
      {viewMode === 'timeline' && (
        <div
          className="flex-1 p-6 overflow-y-auto custom-scrollbar"
          ref={scrollRef}
          style={{ background: 'color-mix(in srgb, var(--bg-dark) 10%, transparent)' }}
        >
          {recent === null ? (
            <div className="flex items-center justify-center h-full py-20">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-brown)]" />
            </div>
          ) : events.length === 0 && timelineDone && historyDates.length <= 1 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-40 py-20 pointer-events-none text-center">
              <History className="w-16 h-16 mb-4 text-[var(--text-secondary)] mx-auto" />
              <p className="text-[var(--text-secondary)] font-medium italic">
                {timeline.error ?? "L'aventure commence... les parchemins sont encore vierges."}
              </p>
            </div>
          ) : (
            <div className="space-y-6 max-w-4xl mx-auto">
              {displayDate && (
                <div key={displayDate} className="space-y-4">
                  <div
                    className="flex items-center gap-4 py-2 sticky top-0 backdrop-blur-sm z-10 -mx-4 px-4"
                    style={{ background: 'color-mix(in srgb, var(--bg-dark) 80%, transparent)' }}
                  >
                    <div className="h-px grow bg-gradient-to-r from-transparent via-[var(--border-color)] to-transparent opacity-50"></div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-dark)] hover:bg-[var(--bg-darker)] px-4 py-1.5 rounded-full border border-[var(--border-color)] shadow-sm transition-colors group">
                          {parseAndFormatDateString(displayDate)}{' '}
                          <ChevronDown className="w-3 h-3 group-hover:translate-y-px transition-transform text-[var(--accent-brown)]" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-[var(--bg-card)] border-[var(--border-color)] max-h-[300px] overflow-y-auto z-50">
                        {historyDates.map((d) => (
                          <DropdownMenuItem
                            key={d}
                            onClick={() => setDisplayDate(d)}
                            className={`text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors ${d === displayDate ? 'text-[var(--accent-brown)] bg-[var(--bg-darker)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-dark)]'}`}
                          >
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
                    {events.length === 0 && timeline.loading && (
                      <div className="flex items-center justify-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-brown)]" />
                      </div>
                    )}
                    {events.length === 0 && timelineDone && (
                      <div className="text-center py-10 text-[var(--text-secondary)] text-sm italic opacity-60">
                        {timeline.error ?? 'Aucun événement ce jour-là.'}
                      </div>
                    )}
                    {events.map((event) => {
                      let finalAvatar = event.characterAvatar;
                      if (!finalAvatar && event.characterId) {
                        finalAvatar =
                          ctx.characters.get(event.characterId.toLowerCase())?.avatarUrl ??
                          undefined;
                      }

                      return (
                        <div
                          key={event.id}
                          className="flex gap-x-4 items-start group/event hover:bg-white/[0.02] p-3 -mx-3 rounded-2xl transition-all duration-200"
                        >
                          {/* Left side: Avatar */}
                          <div className="shrink-0 pt-1">
                            <div className="size-10 flex justify-center items-center bg-[var(--bg-darker)] rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-inner ring-1 ring-white/5 transition-transform group-hover/event:scale-110 group-hover/event:rotate-2">
                              {finalAvatar ? (
                                <img
                                  className="size-full object-cover"
                                  src={finalAvatar}
                                  alt={event.characterName || 'Avatar'}
                                />
                              ) : (
                                <div className="size-full flex items-center justify-center text-sm text-[var(--accent-brown)] font-bold uppercase">
                                  {event.characterName
                                    ? event.characterName.substring(0, 1).toUpperCase()
                                    : '?'}
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
                              {renderMessage(event.message)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <LoadMore
                      rootRef={scrollRef}
                      active={timeline.hasMore && !timeline.loading}
                      loading={timeline.loadingMore}
                      onLoad={timeline.loadMore}
                      itemCount={timeline.events.length}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Summary Modal */}
      <Dialog open={isSummaryModalOpen} onOpenChange={setIsSummaryModalOpen}>
        <DialogContent
          unstyled
          showCloseButton={false}
          className="sm:max-w-3xl !p-0 fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full outline-none"
        >
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex-1 flex items-center justify-between gap-2 bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-xs font-semibold text-left">
                      <span className={selectedDate ? '' : 'opacity-70'}>
                        {selectedDate
                          ? longDate(dayStart(selectedDate), true)
                          : 'Choisir une date...'}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)] max-h-[300px] overflow-y-auto z-50">
                    {historyDates.map((date) => (
                      <DropdownMenuItem
                        key={date}
                        onClick={() => setSelectedDate(date)}
                        className={`text-xs cursor-pointer ${date === selectedDate ? 'text-[var(--accent-brown)] bg-[var(--bg-darker)]' : ''}`}
                      >
                        {longDate(dayStart(date), true)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  disabled
                  title="Les chroniques IA ne sont pas encore disponibles"
                  className="shrink-0 flex items-center gap-2 px-4 py-2 bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-[var(--bg-darker)] rounded-lg text-xs font-bold transition-all active:scale-95 group"
                >
                  <Sparkles className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                  Générer avec IA
                </button>
              </div>
            </DialogHeader>

            {/* Content - scrollable */}
            <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
              {selectedDate ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-5">
                  <div className="p-6 bg-[var(--bg-dark)] rounded-2xl border border-[var(--border-color)]">
                    <Sparkles className="w-10 h-10 text-[var(--accent-brown)] opacity-40" />
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] font-medium max-w-[220px] leading-relaxed">
                    Aucune chronique pour cette séance. Les chroniques IA arrivent bientôt sur le
                    nouveau serveur.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-5">
                  <ScrollText className="w-12 h-12 text-[var(--text-secondary)] opacity-30" />
                  <p className="text-xs text-[var(--text-secondary)] font-medium">
                    Sélectionnez une date ci-dessus
                  </p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Suite de la liste au défilement (page précédente par `beforeSeq`). L'observateur
 * est recréé après chaque page : si la sentinelle est encore visible (lignes
 * masquées du Journal), la page suivante est chargée aussitôt.
 */
function LoadMore({
  rootRef,
  active,
  loading,
  onLoad,
  itemCount,
}: {
  rootRef: React.RefObject<HTMLDivElement | null>;
  active: boolean;
  loading: boolean;
  onLoad: () => void;
  itemCount: number;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!active || loading || !el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoad();
      },
      { root: rootRef.current, rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [active, loading, onLoad, rootRef, itemCount]);

  if (!active && !loading) return null;
  return (
    <div ref={sentinel} className="flex items-center justify-center py-4">
      {loading && <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-brown)]" />}
    </div>
  );
}

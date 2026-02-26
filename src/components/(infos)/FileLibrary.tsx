"use client";

import { useState, useEffect, useCallback } from "react";
import { getDocs, collection, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useGame } from "@/contexts/GameContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Image as ImageIcon,
    User,
    MessageSquare,
    Map,
    Package,
    Music,
    Book,
    Copy,
    ZoomIn,
    Loader2,
    X,
    RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LibraryItem = {
    id: string;
    url: string;
    label?: string;
    meta?: string; // e.g. character type
    date?: number; // Unix ms, for sorting
};

type Category = "backgrounds" | "characters" | "objects" | "chat" | "sounds" | "notes";

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<
    Category,
    { label: string; icon: React.ReactNode; emptyLabel: string }
> = {
    backgrounds: {
        label: "Fonds",
        icon: <Map className="w-4 h-4" />,
        emptyLabel: "Aucun fond de carte créé",
    },
    characters: {
        label: "PNJ",
        icon: <User className="w-4 h-4" />,
        emptyLabel: "Aucun personnage créé",
    },
    objects: {
        label: "Objets",
        icon: <Package className="w-4 h-4" />,
        emptyLabel: "Aucun objet placé sur la carte",
    },
    chat: {
        label: "Chat",
        icon: <MessageSquare className="w-4 h-4" />,
        emptyLabel: "Aucune image partagée dans le chat",
    },
    sounds: {
        label: "Sons",
        icon: <Music className="w-4 h-4" />,
        emptyLabel: "Aucun son uploadé",
    },
    notes: {
        label: "Notes",
        icon: <Book className="w-4 h-4" />,
        emptyLabel: "Aucune image dans vos notes",
    },
};

// ─── Data loading: one-shot getDocs ───────────────────────────────────────────

function extractDate(data: Record<string, unknown>): number | undefined {
    const candidates = ["timestamp", "createdAt", "created_at", "updatedAt", "updated_at", "date"];
    for (const k of candidates) {
        const v = data[k];
        if (v && typeof (v as { toMillis?: () => number }).toMillis === "function") {
            return (v as { toMillis: () => number }).toMillis();
        }
        if (typeof v === "number" && v > 1_000_000_000) return v;
    }
    return undefined;
}

async function fetchItems(
    path: string,
    fields: string[],
    labelField?: string,
    metaField?: string
): Promise<LibraryItem[]> {
    if (!path) return [];
    try {
        const snap = await getDocs(query(collection(db, path)));
        const result: LibraryItem[] = [];
        snap.forEach((doc) => {
            const data = doc.data();
            const date = extractDate(data);
            fields.forEach((f) => {
                const url = data[f];
                if (url && typeof url === "string" && (url.startsWith("http") || url.startsWith("data:"))) {
                    result.push({
                        id: `${doc.id}_${f}`,
                        url,
                        label: labelField ? (data[labelField] as string) : undefined,
                        meta: metaField ? (data[metaField] as string) : undefined,
                        date,
                    });
                }
            });
        });
        return result;
    } catch {
        return [];
    }
}

function deduplicate(items: LibraryItem[]): LibraryItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    });
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

type SortOrder = "newest" | "oldest";

function sortItems(items: LibraryItem[], order: SortOrder): LibraryItem[] {
    return [...items].sort((a, b) => {
        const da = a.date ?? 0;
        const db2 = b.date ?? 0;
        return order === "newest" ? db2 - da : da - db2;
    });
}

function SortBar({ order, onChange, total }: { order: SortOrder; onChange: (o: SortOrder) => void; total: number }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)] mr-1">{total} fichier{total !== 1 ? "s" : ""}</span>
            {(["newest", "oldest"] as SortOrder[]).map((o) => (
                <button
                    key={o}
                    onClick={() => onChange(o)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${order === o
                        ? "bg-[var(--accent-brown)] text-black border-[var(--accent-brown)]"
                        : "bg-transparent border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent-brown)]/50"
                        }`}
                >
                    {o === "newest" ? "↓ Plus récent" : "↑ Plus ancien"}
                </button>
            ))}
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ImageGrid({
    items,
    loading,
    emptyLabel,
    onPreview,
}: {
    items: LibraryItem[];
    loading: boolean;
    emptyLabel: string;
    onPreview: (item: LibraryItem) => void;
}) {
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = (item: LibraryItem) => {
        navigator.clipboard.writeText(item.url).then(() => {
            setCopiedId(item.id);
            setTimeout(() => setCopiedId(null), 1500);
        });
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-secondary)]">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-brown)]" />
                <span className="text-sm">Chargement...</span>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-[var(--text-secondary)] opacity-50">
                <ImageIcon className="w-10 h-10" />
                <span className="text-sm">{emptyLabel}</span>
            </div>
        );
    }

    // Group items by date
    const grouped = items.reduce((acc, item) => {
        const dateStr = item.date
            ? new Date(item.date).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
            })
            : "Date inconnue";
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(item);
        return acc;
    }, {} as Record<string, LibraryItem[]>);

    return (
        <div className="flex flex-col gap-8">
            {Object.entries(grouped).map(([dateLabel, groupItems]) => (
                <div key={dateLabel}>
                    <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3 pb-1 border-b border-[var(--border-color)]">
                        {dateLabel}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                        {groupItems.map((item) => (
                            <div
                                key={item.id}
                                className="group relative aspect-square rounded-xl overflow-hidden border border-[var(--border-color)] bg-black/30 hover:border-[var(--accent-brown)]/60 transition-all shadow-sm hover:shadow-[0_0_16px_rgba(192,160,128,0.15)]"
                            >
                                {item.url?.match(/\.(webm|mp4)(\?.*)?$/i) ? (
                                    <video
                                        src={`${item.url}#t=0.1`}
                                        className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                                        preload="metadata"
                                    />
                                ) : (
                                    <img
                                        src={item.url}
                                        alt={item.label || ""}
                                        className="w-full h-full object-contain p-2 transition-transform duration-500 group-hover:scale-105"
                                        loading="lazy"
                                    />
                                )}
                                {/* Gradient + actions */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-2 gap-1.5">
                                    {item.label && (
                                        <p className="text-[10px] text-white/80 truncate leading-tight font-medium">
                                            {item.label}
                                        </p>
                                    )}
                                    <div className="flex gap-1.5">
                                        <button
                                            onClick={() => onPreview(item)}
                                            className="flex-1 flex items-center justify-center text-xs bg-white/10 hover:bg-white/20 text-white rounded-lg px-2 py-1.5 backdrop-blur-sm border border-white/10 transition-colors"
                                            title="Voir en grand"
                                        >
                                            <ZoomIn className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleCopy(item)}
                                            className="flex-1 flex items-center justify-center text-xs bg-[var(--accent-brown)]/80 hover:bg-[var(--accent-brown)] text-white rounded-lg px-2 py-1.5 backdrop-blur-sm transition-colors"
                                            title="Copier l'URL"
                                        >
                                            {copiedId === item.id ? (
                                                <span className="font-bold text-xs">✓</span>
                                            ) : (
                                                <Copy className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function SoundList({ items, loading, emptyLabel }: { items: LibraryItem[]; loading: boolean; emptyLabel: string }) {
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = (item: LibraryItem) => {
        navigator.clipboard.writeText(item.url).then(() => {
            setCopiedId(item.id);
            setTimeout(() => setCopiedId(null), 1500);
        });
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--text-secondary)]">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-brown)]" />
                <span className="text-sm">Chargement...</span>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-[var(--text-secondary)] opacity-50">
                <Music className="w-10 h-10" />
                <span className="text-sm">{emptyLabel}</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {items.map((item) => {
                const isYoutube = !item.url.startsWith("http") || item.url.includes("youtube") || item.url.includes("youtu.be");
                return (
                    <div
                        key={item.id}
                        className="flex items-center gap-3 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl px-4 py-3 group hover:border-[var(--accent-brown)]/50 transition-all"
                    >
                        <Music className="w-5 h-5 text-[var(--accent-brown)] shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-[var(--text-primary)] truncate font-medium">
                                {item.label || "Son sans titre"}
                            </p>
                            {!isYoutube && (
                                <audio
                                    src={item.url}
                                    controls
                                    preload="none"
                                    className="mt-2 h-8 w-full max-w-xs"
                                />
                            )}
                            {isYoutube && (
                                <p className="text-xs text-[var(--text-secondary)] mt-1 truncate opacity-60">
                                    YouTube · {item.url}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={() => handleCopy(item)}
                            className="shrink-0 p-2 rounded-lg hover:bg-[var(--accent-brown)]/10 text-[var(--text-secondary)] hover:text-[var(--accent-brown)] transition-colors"
                            title="Copier l'URL"
                        >
                            {copiedId === item.id ? (
                                <span className="text-xs font-bold text-green-400">✓</span>
                            ) : (
                                <Copy className="w-4 h-4" />
                            )}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

// ─── PNJ Filter bar ───────────────────────────────────────────────────────────

type PnjFilter = "all" | "joueurs" | "pnj";

const PNJ_FILTERS: { key: PnjFilter; label: string }[] = [
    { key: "all", label: "Tous" },
    { key: "joueurs", label: "Joueurs" },
    { key: "pnj", label: "PNJ" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function FileLibrary() {
    const { user, persoId } = useGame();
    const roomId = user?.roomId ?? "";

    const [activeTab, setActiveTab] = useState<Category>("backgrounds");
    const [preview, setPreview] = useState<LibraryItem | null>(null);
    const [pnjFilter, setPnjFilter] = useState<PnjFilter>("all");
    const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

    // Per-category data state
    const [data, setData] = useState<Record<Category, LibraryItem[]>>({
        backgrounds: [],
        characters: [],
        objects: [],
        chat: [],
        sounds: [],
        notes: [],
    });
    const [loading, setLoading] = useState<Record<Category, boolean>>({
        backgrounds: true,
        characters: true,
        objects: true,
        chat: true,
        sounds: true,
        notes: true,
    });

    const setLoaded = (cat: Category, items: LibraryItem[]) => {
        setData((prev) => ({ ...prev, [cat]: items }));
        setLoading((prev) => ({ ...prev, [cat]: false }));
    };

    const fetchAll = useCallback(async () => {
        if (!roomId) return;

        // Reset loading
        setLoading({ backgrounds: true, characters: true, objects: true, chat: true, sounds: true, notes: true });

        // 1. Backgrounds: cartes/{roomId}/cities → backgroundUrl
        fetchItems(`cartes/${roomId}/cities`, ["backgroundUrl"], "name").then((items) =>
            setLoaded("backgrounds", items.filter((i) => i.url))
        );

        // 2. Characters: cartes/{roomId}/characters → imageURL, imageURL2
        //    + templates: npc_templates/{roomId}/templates → imageURL2
        //    Each item gets meta = type (joueurs | pnj | ...)
        Promise.all([
            fetchItems(`cartes/${roomId}/characters`, ["imageURL", "imageURL2"], "Nomperso", "type"),
            fetchItems(`npc_templates/${roomId}/templates`, ["imageURL2"], "name"),
        ]).then(([charItems, tplItems]) =>
            setLoaded("characters", deduplicate([...charItems, ...tplItems]))
        );

        // 3. Objects: cartes/{roomId}/objects → imageUrl
        fetchItems(`cartes/${roomId}/objects`, ["imageUrl"], "name").then((items) =>
            setLoaded("objects", items)
        );

        // 4. Chat: rooms/{roomId}/chat → imageUrl
        fetchItems(`rooms/${roomId}/chat`, ["imageUrl"], "sender").then((items) =>
            setLoaded("chat", items)
        );

        // 5. Sounds: sound_templates/{roomId}/templates → soundUrl (keep mp3 only)
        fetchItems(`sound_templates/${roomId}/templates`, ["soundUrl"], "name").then((items) =>
            setLoaded(
                "sounds",
                items.filter((i) => i.url.startsWith("http"))
            )
        );

        // 6. Notes: SharedNotes/{roomId}/notes & Notes/{roomId}/{persoId} → image
        const notesPromises = [
            fetchItems(`SharedNotes/${roomId}/notes`, ["image"], "title", "type"),
        ];
        if (persoId) {
            notesPromises.push(fetchItems(`Notes/${roomId}/${persoId}`, ["image"], "title", "type"));
        }
        Promise.all(notesPromises).then((results) =>
            setLoaded("notes", deduplicate(results.flat()))
        );
    }, [roomId, persoId]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // Apply PNJ filter + sort
    const filteredCharacters = sortItems(
        data.characters.filter((item) => {
            if (pnjFilter === "all") return true;
            if (pnjFilter === "joueurs") return item.meta === "joueurs";
            if (pnjFilter === "pnj") return item.meta !== "joueurs";
            return true;
        }),
        sortOrder
    );

    const totalItems =
        data.backgrounds.length +
        data.characters.length +
        data.objects.length +
        data.chat.length +
        data.sounds.length +
        data.notes.length;

    const getCount = (cat: Category) => {
        if (cat === "characters") return filteredCharacters.length;
        return data[cat].length;
    };

    return (
        <div className="w-full h-full flex flex-col bg-[var(--bg-dark)] text-[var(--text-primary)]">
            {/* Header */}
            <div className="px-8 pt-10 pb-6 border-b border-[var(--border-color)]">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-serif text-[var(--accent-brown)] mb-1">
                            Bibliothèque de Fichiers
                        </h1>
                        <p className="text-sm text-[var(--text-secondary)]">
                            Tous les fichiers de cette partie — {totalItems} fichier
                            {totalItems !== 1 ? "s" : ""}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as Category)}
                className="flex-1 flex flex-col overflow-hidden px-8 py-4"
            >
                <TabsList className="w-fit mb-4">
                    {(Object.keys(CATEGORY_CONFIG) as Category[]).map((cat) => {
                        const count = getCount(cat);
                        const isLoading = loading[cat];
                        return (
                            <TabsTrigger
                                key={cat}
                                value={cat}
                                className="flex items-center gap-2"
                            >
                                {CATEGORY_CONFIG[cat].icon}
                                <span>{CATEGORY_CONFIG[cat].label}</span>
                                <span
                                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-black/10`}
                                >
                                    {isLoading ? "·" : count}
                                </span>
                            </TabsTrigger>
                        );
                    })}
                </TabsList>

                {/* Backgrounds */}
                <TabsContent value="backgrounds" className="flex-1 overflow-y-auto m-0 focus-visible:outline-none">
                    <div className="flex flex-col gap-4 pb-10">
                        <SortBar order={sortOrder} onChange={setSortOrder} total={data.backgrounds.length} />
                        <ImageGrid
                            items={sortItems(data.backgrounds, sortOrder)}
                            loading={loading.backgrounds}
                            emptyLabel={CATEGORY_CONFIG.backgrounds.emptyLabel}
                            onPreview={setPreview}
                        />
                    </div>
                </TabsContent>

                {/* Characters / PNJ with filters */}
                <TabsContent value="characters" className="flex-1 overflow-y-auto m-0 focus-visible:outline-none">
                    <div className="flex flex-col gap-4 pb-10">
                        {/* Filter + Sort bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                {PNJ_FILTERS.map((f) => {
                                    const isActive = pnjFilter === f.key;
                                    const cnt = f.key === "all"
                                        ? data.characters.length
                                        : f.key === "joueurs"
                                            ? data.characters.filter((i) => i.meta === "joueurs").length
                                            : data.characters.filter((i) => i.meta !== "joueurs").length;
                                    return (
                                        <button
                                            key={f.key}
                                            onClick={() => setPnjFilter(f.key)}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${isActive
                                                ? "bg-[var(--accent-brown)] text-black border-[var(--accent-brown)] shadow-sm"
                                                : "bg-transparent border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent-brown)]/50 hover:text-[var(--text-primary)]"}`}
                                        >
                                            {f.label}
                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? "bg-black/20" : "bg-white/10"}`}>
                                                {cnt}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <SortBar order={sortOrder} onChange={setSortOrder} total={filteredCharacters.length} />
                        </div>

                        <ImageGrid
                            items={filteredCharacters}
                            loading={loading.characters}
                            emptyLabel={CATEGORY_CONFIG.characters.emptyLabel}
                            onPreview={setPreview}
                        />
                    </div>
                </TabsContent>

                {/* Objects */}
                <TabsContent value="objects" className="flex-1 overflow-y-auto m-0 focus-visible:outline-none">
                    <div className="flex flex-col gap-4 pb-10">
                        <SortBar order={sortOrder} onChange={setSortOrder} total={data.objects.length} />
                        <ImageGrid
                            items={sortItems(data.objects, sortOrder)}
                            loading={loading.objects}
                            emptyLabel={CATEGORY_CONFIG.objects.emptyLabel}
                            onPreview={setPreview}
                        />
                    </div>
                </TabsContent>

                {/* Chat */}
                <TabsContent value="chat" className="flex-1 overflow-y-auto m-0 focus-visible:outline-none">
                    <div className="flex flex-col gap-4 pb-10">
                        <SortBar order={sortOrder} onChange={setSortOrder} total={data.chat.length} />
                        <ImageGrid
                            items={sortItems(data.chat, sortOrder)}
                            loading={loading.chat}
                            emptyLabel={CATEGORY_CONFIG.chat.emptyLabel}
                            onPreview={setPreview}
                        />
                    </div>
                </TabsContent>

                {/* Sounds */}
                <TabsContent value="sounds" className="flex-1 overflow-y-auto m-0 focus-visible:outline-none">
                    <div className="flex flex-col gap-4 pb-10">
                        <SortBar order={sortOrder} onChange={setSortOrder} total={data.sounds.length} />
                        <SoundList
                            items={sortItems(data.sounds, sortOrder)}
                            loading={loading.sounds}
                            emptyLabel={CATEGORY_CONFIG.sounds.emptyLabel}
                        />
                    </div>
                </TabsContent>

                {/* Notes */}
                <TabsContent value="notes" className="flex-1 overflow-y-auto m-0 focus-visible:outline-none">
                    <div className="flex flex-col gap-4 pb-10">
                        <SortBar order={sortOrder} onChange={setSortOrder} total={data.notes.length} />
                        <ImageGrid
                            items={sortItems(data.notes, sortOrder)}
                            loading={loading.notes}
                            emptyLabel={CATEGORY_CONFIG.notes.emptyLabel}
                            onPreview={setPreview}
                        />
                    </div>
                </TabsContent>
            </Tabs>

            {/* Lightbox */}
            {preview && (
                <div
                    className="fixed inset-0 z-[9000] bg-black/95 flex items-center justify-center p-8 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setPreview(null)}
                >
                    <button
                        onClick={() => setPreview(null)}
                        className="absolute top-5 right-5 text-white/50 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                    >
                        <X className="h-7 w-7" />
                    </button>
                    {preview.label && (
                        <p className="absolute top-5 left-1/2 -translate-x-1/2 text-white/70 text-sm font-medium">
                            {preview.label}
                        </p>
                    )}
                    {preview.url?.match(/\.(webm|mp4)(\?.*)?$/i) ? (
                        <video
                            src={`${preview.url}#t=0.1`}
                            controls
                            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <img
                            src={preview.url}
                            alt={preview.label || ""}
                            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

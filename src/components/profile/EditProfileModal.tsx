"use client";

import { useRef, useState, ChangeEvent, useEffect } from "react";
import { db, storage, doc, setDoc, ref, uploadBytes, getDownloadURL, getDoc, onSnapshot } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X as XIcon, Camera, Loader2, Upload, Lock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fetchTitles, getUserTitlesStatus, initializeUserTitles, seedTitles, Title, INITIAL_TITLES, checkAndUnlockTimeTitles, generateSlug } from "@/lib/titles";
import { toast } from "sonner";

interface EditProfileModalProps {
    uid: string;
    currentName: string;
    currentTitre: string;
    currentPp: string;
    currentImageURL: string;
    onClose: () => void;
    onSave: (data: { name: string; titre: string; pp: string; imageURL: string }) => void;
}


export default function EditProfileModal({
    uid,
    currentName,
    currentTitre,
    currentPp,
    currentImageURL,
    onClose,
    onSave,
}: EditProfileModalProps) {
    const [name, setName] = useState(currentName);
    const [titre, setTitre] = useState(currentTitre);
    const [ppPreview, setPpPreview] = useState(currentPp);
    const [bannerPreview, setBannerPreview] = useState(currentImageURL);
    const [ppFile, setPpFile] = useState<File | null>(null);
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // New state for dynamic titles
    const [allTitles, setAllTitles] = useState<Title[]>([]);
    const [userTitlesStatus, setUserTitlesStatus] = useState<Record<string, "locked" | "unlocked">>({});
    const [userTimeSpent, setUserTimeSpent] = useState(0); // In minutes
    const [loadingTitles, setLoadingTitles] = useState(true);

    const ppInputRef = useRef<HTMLInputElement>(null);

    // Fetch titles and user status on mount
    useEffect(() => {
        let unsubscribe: () => void;

        const setupRealtimeListener = async () => {
            try {
                // 1. Fetch all titles (static reference)
                let titles = await fetchTitles();

                // Check if we need to seed new titles (auto-migration)
                const existingSlugs = new Set(titles.map(t => t.id));
                const hasMissingTitles = INITIAL_TITLES.some(t => !existingSlugs.has(generateSlug(t.label)));
                const hasObsoleteTitles = existingSlugs.has("maudit_par_les_des");

                if (titles.length === 0 || hasMissingTitles || hasObsoleteTitles) {
                    console.log("Seeding/Updating titles...");
                    await seedTitles();
                    titles = await fetchTitles();
                }

                // Merge with INITIAL_TITLES to ensure conditions are present
                const mergedTitles = titles.map(t => {
                    const codeTitle = INITIAL_TITLES.find(it => it.label === t.label);
                    if (codeTitle && codeTitle.condition) {
                        return { ...t, condition: codeTitle.condition } as Title;
                    }
                    return t;
                });
                setAllTitles(mergedTitles);

                // 2. Setup real-time listener for user data
                const userRef = doc(db, "users", uid);

                unsubscribe = onSnapshot(userRef, async (userSnap) => {
                    let statusMap: Record<string, "locked" | "unlocked"> = {};

                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        statusMap = data.titles || {};
                        const timeSpent = data.timeSpent || 0;
                        setUserTimeSpent(timeSpent);

                        // If map is empty but user exists, initialize it
                        if (Object.keys(statusMap).length === 0) {
                            statusMap = await initializeUserTitles(uid, titles);
                        }
                    } else {
                        // Should not happen for existing users but safe fallback
                        statusMap = await initializeUserTitles(uid, titles);
                    }

                    setUserTitlesStatus(statusMap);
                    setLoadingTitles(false);
                });

            } catch (err) {
                console.error("Failed to load titles", err);
                setError("Erreur lors du chargement des titres");
                setLoadingTitles(false);
            }
        };

        if (uid) {
            setupRealtimeListener();
        }

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [uid]);

    const handleImagePreview = (
        event: ChangeEvent<HTMLInputElement>,
        type: "pp" | "banner"
    ) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            if (type === "pp") {
                setPpPreview(reader.result as string);
                setPpFile(file);
            } else {
                setBannerPreview(reader.result as string);
                setBannerFile(file);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        if (!name.trim() || !titre.trim()) {
            setError("Le nom et le titre sont requis");
            return;
        }

        setLoading(true);
        setError("");

        try {
            let newPp = currentPp || null;
            let newBanner = currentImageURL || null;

            // Upload profile picture if changed
            if (ppFile) {
                const ppRef = ref(storage, `users/${uid}/pp`);
                await uploadBytes(ppRef, ppFile);
                newPp = await getDownloadURL(ppRef);
            }

            // Upload banner if changed
            if (bannerFile) {
                const bannerRef = ref(storage, `users/${uid}/imageURL`);
                await uploadBytes(bannerRef, bannerFile);
                newBanner = await getDownloadURL(bannerRef);
            }

            // Update Firestore
            const userRef = doc(db, "users", uid);
            await setDoc(
                userRef,
                {
                    name: name.trim(),
                    titre: titre.trim(),
                    pp: newPp,
                    imageURL: newBanner,
                },
                { merge: true }
            );

            onSave({
                name: name.trim(),
                titre: titre.trim(),
                pp: newPp || "",
                imageURL: newBanner || "",
            });
            onClose();
        } catch (err) {
            console.error("Error updating profile:", err);
            setError("Erreur lors de la mise à jour du profil");
        } finally {
            setLoading(false);
        }
    };

    const handleTitleSelect = async (newTitle: string) => {
        setTitre(newTitle);
        // Immediate save to DB
        try {
            const userRef = doc(db, "users", uid);
            await setDoc(userRef, { titre: newTitle }, { merge: true });
        } catch (err) {
            console.error("Failed to save title immediately", err);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[202] p-4">
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--border-color)]">
                    <h2 className="text-2xl font-bold text-[var(--accent-brown)]">
                        Modifier le profil
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                        disabled={loading}
                    >
                        <XIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-lg">
                            {error}
                        </div>
                    )}

                    {/* Name Input */}
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-[var(--text-primary)] font-semibold">
                            Nom
                        </Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]"
                            disabled={loading}
                        />
                    </div>

                    {/* Title Selector */}
                    <div className="space-y-2">
                        <Label className="text-[var(--text-primary)] font-semibold">
                            Titre
                        </Label>
                        {loadingTitles ? (
                            <div className="flex items-center justify-center p-8">
                                <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-brown)]" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-1">
                                {allTitles.map((t) => {
                                    const status = userTitlesStatus[t.id];
                                    const isUnlocked = status === "unlocked";
                                    const isSelected = titre === t.label;

                                    // Time progress calculation
                                    let progress = 0;
                                    let timeRequired = 0;

                                    const isTimeBased = t.condition?.type === 'time';
                                    const isEventBased = t.condition?.type === 'event';

                                    if (isTimeBased && t.condition && 'minutes' in t.condition) {
                                        timeRequired = t.condition.minutes;
                                        progress = Math.min(100, (userTimeSpent / timeRequired) * 100);
                                    }

                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => {
                                                if (isUnlocked) {
                                                    handleTitleSelect(t.label);
                                                } else {
                                                    console.log(`Titre verrouillé: ${t.label}`);
                                                    if (isTimeBased) {
                                                        console.log(`Temps requis: ${timeRequired}min, Actuel: ${userTimeSpent}min`);
                                                    }
                                                }
                                            }}
                                            disabled={false} // We want to allow clicking to see logs even if locked
                                            className={`relative px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex flex-col items-center justify-center gap-1 min-h-[60px] ${isSelected
                                                ? "bg-[var(--accent-brown)] text-[var(--bg-dark)] shadow-md transform scale-105"
                                                : isUnlocked
                                                    ? "bg-[var(--bg-dark)] text-[var(--text-secondary)] hover:bg-[var(--bg-darker)] hover:text-[var(--text-primary)] border border-[var(--border-color)] cursor-pointer"
                                                    : "bg-[var(--bg-dark)] text-[var(--text-secondary)] opacity-70 border border-transparent cursor-not-allowed" // Removed opacity-50 to make progress readable
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                {t.label}
                                                {!isUnlocked && <Lock className="w-3 h-3" />}
                                            </div>

                                            {/* Progress Bar for Locked Time-Based Titles */}
                                            {!isUnlocked && isTimeBased && (
                                                <div className="w-full mt-1">
                                                    <div className="flex justify-between text-[10px] opacity-80 mb-0.5">
                                                        <span>{userTimeSpent}min</span>
                                                        <span>{timeRequired}min</span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-[var(--accent-brown)] transition-all duration-500"
                                                            style={{ width: `${progress}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {!isUnlocked && isEventBased && t.condition && 'description' in t.condition && (
                                                <div className="w-full mt-1 text-[10px] text-center opacity-80 leading-tight px-1">
                                                    {t.condition.description}
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Profile Picture Upload */}
                    <div className="space-y-2">
                        <Label className="text-[var(--text-primary)] font-semibold">
                            Photo de profil
                        </Label>
                        <div className="flex items-center gap-4">
                            <div className="relative group cursor-pointer" onClick={() => ppInputRef.current?.click()}>
                                <Avatar className="h-24 w-24 rounded-full border-4 border-[var(--bg-card)] shadow-lg transition-transform group-hover:scale-105">
                                    <AvatarImage src={ppPreview} alt="Profile" className="object-cover" />
                                    <AvatarFallback className="bg-[var(--accent-brown)] text-white text-3xl font-bold">
                                        {name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Camera className="w-8 h-8 text-white" />
                                </div>
                            </div>
                            <label className="cursor-pointer">
                                <div className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-brown)] text-[var(--bg-dark)] rounded-lg hover:bg-[var(--accent-brown-hover)] transition-colors">
                                    <Upload className="w-4 h-4" />
                                    <span>Changer</span>
                                </div>
                                <input
                                    ref={ppInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleImagePreview(e, "pp")}
                                    className="hidden"
                                    disabled={loading}
                                />
                            </label>
                        </div>
                    </div>

                    {/* Banner Upload */}
                    <div className="space-y-2">
                        <Label className="text-[var(--text-primary)] font-semibold">
                            Image de bannière
                        </Label>
                        <div className="space-y-3">
                            <div className="relative w-full h-32 rounded-lg overflow-hidden border-2 border-[var(--border-color)]">
                                {bannerPreview ? (
                                    <img
                                        src={bannerPreview}
                                        alt="Banner preview"
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-blue)] opacity-20 flex items-center justify-center">
                                        <Camera className="w-8 h-8 text-[var(--text-secondary)]" />
                                    </div>
                                )}
                            </div>
                            <label className="cursor-pointer inline-block">
                                <div className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-brown)] text-[var(--bg-dark)] rounded-lg hover:bg-[var(--accent-brown-hover)] transition-colors">
                                    <Upload className="w-4 h-4" />
                                    <span>Changer la bannière</span>
                                </div>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => handleImagePreview(e, "banner")}
                                    className="hidden"
                                    disabled={loading}
                                />
                            </label>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-[var(--border-color)]">
                    <Button
                        onClick={onClose}
                        variant="outline"
                        disabled={loading}
                        className="border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-darker)]"
                    >
                        Annuler
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={loading}
                        className="bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)]"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Enregistrement...
                            </>
                        ) : (
                            "Enregistrer"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

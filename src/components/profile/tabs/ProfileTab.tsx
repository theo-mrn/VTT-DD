"use client";

import { useRef, useState, ChangeEvent, useEffect } from "react";
import { db, storage, doc, setDoc, ref, uploadBytes, getDownloadURL, onSnapshot } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X as XIcon, Camera, Loader2, Upload, Lock, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fetchTitles, initializeUserTitles, seedTitles, Title, INITIAL_TITLES, generateSlug } from "@/lib/titles";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface ProfileTabProps {
    uid: string;
    userData: any;
}

export default function ProfileTab({ uid, userData }: ProfileTabProps) {
    const [name, setName] = useState(userData.name || "");
    const [titre, setTitre] = useState(userData.titre || "");
    const [ppPreview, setPpPreview] = useState(userData.pp || "");
    const [bannerPreview, setBannerPreview] = useState(userData.imageURL || "");
    const [ppFile, setPpFile] = useState<File | null>(null);
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);

    const [allTitles, setAllTitles] = useState<Title[]>([]);
    const [userTitlesStatus, setUserTitlesStatus] = useState<Record<string, "locked" | "unlocked">>({});
    const [userTimeSpent, setUserTimeSpent] = useState(0);
    const [loadingTitles, setLoadingTitles] = useState(true);

    const ppInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    // Sync state when userData changes from outside
    useEffect(() => {
        if (userData) {
            if (!ppFile) setPpPreview(userData.pp || "");
            if (!bannerFile) setBannerPreview(userData.imageURL || "");
            // Only update name and titre if not currently editing (or just sync once)
        }
    }, [userData]);

    useEffect(() => {
        let unsubscribe: () => void;
        const setupTitles = async () => {
            try {
                let titles = await fetchTitles();
                const existingSlugs = new Set(titles.map(t => t.id));
                const hasMissingTitles = INITIAL_TITLES.some(t => !existingSlugs.has(generateSlug(t.label)));
                if (titles.length === 0 || hasMissingTitles) {
                    await seedTitles();
                    titles = await fetchTitles();
                }
                const mergedTitles = titles.map(t => {
                    const codeTitle = INITIAL_TITLES.find(it => it.label === t.label);
                    return codeTitle && codeTitle.condition ? { ...t, condition: codeTitle.condition } : t;
                }) as Title[];
                setAllTitles(mergedTitles);

                const userRef = doc(db, "users", uid);
                unsubscribe = onSnapshot(userRef, async (userSnap) => {
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        let statusMap = data.titles || {};
                        setUserTimeSpent(data.timeSpent || 0);
                        if (Object.keys(statusMap).length === 0) {
                            statusMap = await initializeUserTitles(uid, titles);
                        }
                        setUserTitlesStatus(statusMap);
                    }
                    setLoadingTitles(false);
                });
            } catch (err) {
                console.error("Failed to load titles", err);
                setLoadingTitles(false);
            }
        };
        setupTitles();
        return () => unsubscribe && unsubscribe();
    }, [uid]);

    const handleImagePreview = (event: ChangeEvent<HTMLInputElement>, type: "pp" | "banner") => {
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
        if (!name.trim()) {
            toast.error("Le nom est requis");
            return;
        }

        setLoading(true);
        try {
            let newPp = userData.pp;
            let newBanner = userData.imageURL;

            if (ppFile) {
                const ppRef = ref(storage, `users/${uid}/pp`);
                await uploadBytes(ppRef, ppFile);
                newPp = await getDownloadURL(ppRef);
            }

            if (bannerFile) {
                const bannerRef = ref(storage, `users/${uid}/imageURL`);
                await uploadBytes(bannerRef, bannerFile);
                newBanner = await getDownloadURL(bannerRef);
            }

            const userRef = doc(db, "users", uid);
            await setDoc(userRef, {
                name: name.trim(),
                titre: titre || userData.titre,
                pp: newPp,
                imageURL: newBanner,
            }, { merge: true });

            toast.success("Profil mis à jour !");
            setPpFile(null);
            setBannerFile(null);
        } catch (err) {
            console.error("Error updating profile:", err);
            toast.error("Erreur lors de la mise à jour");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-2">
                <User className="w-5 h-5 text-[var(--text-secondary)]" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Modifier votre profil
                </h3>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
            >
                {/* Images Section */}
                <div className="flex flex-col sm:flex-row gap-6">
                    {/* Profile Picture */}
                    <div className="space-y-3 flex-shrink-0">
                        <Label className="text-[var(--text-primary)] font-semibold">Photo de profil</Label>
                        <div className="relative group w-32 h-32 cursor-pointer" onClick={() => ppInputRef.current?.click()}>
                            <Avatar className="h-full w-full rounded-2xl border-4 border-[var(--bg-card)] shadow-lg overflow-hidden">
                                <AvatarImage src={ppPreview} className="object-cover" />
                                <AvatarFallback className="bg-[var(--accent-brown)] text-white text-3xl font-bold">
                                    {name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                                <Camera className="w-8 h-8 text-white" />
                            </div>
                            <input ref={ppInputRef} type="file" accept="image/*" onChange={(e) => handleImagePreview(e, "pp")} className="hidden" />
                        </div>
                    </div>

                    {/* Banner Card */}
                    <div className="space-y-3 flex-1">
                        <Label className="text-[var(--text-primary)] font-semibold">Bannière</Label>
                        <div
                            className="relative h-32 w-full rounded-2xl border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-darker)] overflow-hidden cursor-pointer group"
                            onClick={() => bannerInputRef.current?.click()}
                        >
                            {bannerPreview ? (
                                <img src={bannerPreview} alt="Banner" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)]">
                                    <Upload className="w-6 h-6 mb-1" />
                                    <span className="text-xs">Cliquez pour uploader</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Camera className="w-6 h-6 text-white" />
                            </div>
                            <input ref={bannerInputRef} type="file" accept="image/*" onChange={(e) => handleImagePreview(e, "banner")} className="hidden" />
                        </div>
                    </div>
                </div>

                {/* Info Section */}
                <div className="grid grid-cols-1 gap-4 p-5 rounded-2xl bg-[var(--bg-darker)] border border-[var(--border-color)]">
                    <div className="space-y-2">
                        <Label htmlFor="edit-name">Votre nom</Label>
                        <Input
                            id="edit-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-[var(--bg-card)] border-[var(--border-color)]"
                            placeholder="Entrez votre nom..."
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Votre titre</Label>
                        {loadingTitles ? (
                            <div className="h-20 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 animate-spin text-[var(--accent-brown)]" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                {allTitles.map((t) => {
                                    const isUnlocked = userTitlesStatus[t.id] === "unlocked";
                                    const isSelected = titre === t.label || (!titre && userData.titre === t.label);

                                    const isTimeBased = t.condition?.type === 'time';
                                    let progress = 0;
                                    let timeRequired = 0;
                                    if (isTimeBased && t.condition && 'minutes' in t.condition) {
                                        timeRequired = t.condition.minutes;
                                        progress = Math.min(100, (userTimeSpent / timeRequired) * 100);
                                    }

                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => isUnlocked && setTitre(t.label)}
                                            className={`p-2 rounded-xl text-xs font-medium text-left transition-all border flex flex-col gap-1 ${isSelected
                                                    ? "bg-[var(--accent-brown)] text-white border-transparent"
                                                    : isUnlocked
                                                        ? "bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border-color)] hover:border-[var(--accent-brown)]"
                                                        : "bg-[var(--bg-card)] text-[var(--text-secondary)] border-transparent opacity-60 cursor-not-allowed"
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-1">
                                                <span className="truncate">{t.label}</span>
                                                {!isUnlocked && <Lock className="w-3 h-3 flex-shrink-0" />}
                                            </div>
                                            {!isUnlocked && isTimeBased && (
                                                <div className="w-full h-1 bg-black/10 rounded-full overflow-hidden mt-0.5">
                                                    <div className="h-full bg-[var(--accent-brown)]" style={{ width: `${progress}%` }} />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <Button
                    onClick={handleSave}
                    disabled={loading}
                    className="w-full bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-dark)] text-white font-bold py-6 rounded-2xl shadow-lg shadow-[var(--accent-brown)]/10"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Enregistrer les modifications"}
                </Button>
            </motion.div>
        </div>
    );
}

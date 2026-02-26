"use client";

import { useRef, useState, ChangeEvent, useEffect } from "react";
import { db, storage, doc, setDoc, ref, uploadBytes, getDownloadURL, onSnapshot } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X as XIcon, Camera, Loader2, Upload, Lock, User, Check, Crown, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { fetchTitles, initializeUserTitles, seedTitles, Title, INITIAL_TITLES, generateSlug } from "@/lib/titles";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Eye } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { ProfileCard } from "@/components/ui/profile-card";

interface ProfileTabProps {
    uid: string;
    userData: any;
}

export default function ProfileTab({ uid, userData }: ProfileTabProps) {
    const [name, setName] = useState(userData.name || "");
    const [titre, setTitre] = useState(userData.titre || "");
    const [bio, setBio] = useState(userData.bio || "");
    const [ppPreview, setPpPreview] = useState(userData.pp || "");
    const [bannerPreview, setBannerPreview] = useState(userData.imageURL || "");
    const [ppFile, setPpFile] = useState<File | null>(null);
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [borderType, setBorderType] = useState<"none" | "blue" | "orange" | "magic" | "magic_purple" | "magic_green" | "magic_red" | "magic_double" | "magic_shine" | "magic_shine_aurora" | "magic_shine_solar" | "magic_shine_twilight">(userData.borderType || "none");

    // Categorize initial border type
    const initialBorder = userData.borderType || "none";
    const initialCategory = initialBorder === "none" ? "none" : initialBorder.startsWith("magic_shine") ? "shine" : initialBorder.startsWith("magic") ? "beam" : "classique";
    const [borderCategory, setBorderCategory] = useState<"none" | "classique" | "beam" | "shine">(initialCategory);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [showPremiumBadge, setShowPremiumBadge] = useState<boolean>(userData.showPremiumBadge ?? true);

    // Check if user is premium
    const isPremium = userData.premium === true;

    const [allTitles, setAllTitles] = useState<Title[]>([]);
    const [userTitlesStatus, setUserTitlesStatus] = useState<Record<string, "locked" | "unlocked">>({});
    const [userTimeSpent, setUserTimeSpent] = useState(0);
    const [loadingTitles, setLoadingTitles] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

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
                bio: bio.trim(),
                pp: newPp,
                imageURL: newBanner,
                borderType: borderType,
                showPremiumBadge: showPremiumBadge,
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
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-[var(--text-secondary)]" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Modifier votre profil
                    </h3>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPreviewOpen(true)}
                    className="text-xs flex items-center gap-2 text-[var(--accent-brown)] hover:text-[var(--accent-brown-dark)] hover:bg-[var(--accent-brown)]/10"
                >
                    <Eye className="w-4 h-4" />
                    Aperçu du profil
                </Button>
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
                        <Label htmlFor="edit-bio">Votre bio</Label>
                        <Textarea
                            id="edit-bio"
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            className="bg-[var(--bg-card)] border-[var(--border-color)] resize-none"
                            placeholder="Un voyageur mystérieux explorant les terres de VTT-DD."
                            maxLength={150}
                            rows={3}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Votre titre</Label>
                        {loadingTitles ? (
                            <div className="h-20 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 animate-spin text-[var(--accent-brown)]" />
                            </div>
                        ) : (
                            <>
                                {/* Barre de recherche */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                                    <Input
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Rechercher un titre..."
                                        className="pl-10 bg-[var(--bg-card)] border-[var(--border-color)] text-sm"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                    {allTitles
                                        .filter((t) =>
                                            searchTerm === "" ||
                                            t.label.toLowerCase().includes(searchTerm.toLowerCase())
                                        )
                                        .sort((a, b) => {
                                            const aIsPremium = a.condition?.type === 'premium';
                                            const bIsPremium = b.condition?.type === 'premium';

                                            const aUnlocked = userTitlesStatus[a.id] === "unlocked" || userTitlesStatus[a.label] === "unlocked" || (aIsPremium && isPremium);
                                            const bUnlocked = userTitlesStatus[b.id] === "unlocked" || userTitlesStatus[b.label] === "unlocked" || (bIsPremium && isPremium);

                                            if (aUnlocked && !bUnlocked) return -1;
                                            if (!aUnlocked && bUnlocked) return 1;
                                            return a.label.localeCompare(b.label);
                                        })
                                        .map((t) => {
                                            const isTimeBased = t.condition?.type === 'time';
                                            const isPremiumTitle = t.condition?.type === 'premium';

                                            // Vérifier à la fois le nouveau format (slug) et l'ancien format (label)
                                            let isUnlocked = userTitlesStatus[t.id] === "unlocked" || userTitlesStatus[t.label] === "unlocked";
                                            if (isPremiumTitle) {
                                                isUnlocked = isPremium;
                                            }

                                            const isSelected = titre === t.label || (!titre && userData.titre === t.label);

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
                                                        {!isUnlocked && (
                                                            isPremiumTitle ? (
                                                                <Crown className="w-3 h-3 flex-shrink-0 text-[var(--accent-brown)]" />
                                                            ) : (
                                                                <Lock className="w-3 h-3 flex-shrink-0" />
                                                            )
                                                        )}
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
                            </>
                        )}
                    </div>

                    <div className="space-y-3">
                        <Label className="text-[var(--text-primary)] font-semibold">Style de bordure</Label>

                        {/* Selector Categories */}
                        <div className="flex gap-2 p-1 bg-[var(--bg-canvas)] rounded-lg w-fit border border-[var(--border-color)]">
                            <button
                                type="button"
                                onClick={() => {
                                    setBorderCategory("none");
                                    setBorderType("none");
                                }}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${borderCategory === "none" ? "bg-[var(--accent-brown)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]"
                                    }`}
                            >
                                Sans effet
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!isPremium) {
                                        toast.error("Ces effets sont réservés aux abonnés Premium ! ⭐\nVisitez la Boutique pour les débloquer.");
                                        return;
                                    }
                                    setBorderCategory("classique");
                                    if (!["blue", "orange"].includes(borderType)) setBorderType("blue");
                                }}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${borderCategory === "classique" ? "bg-[var(--accent-brown)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]"
                                    }`}
                            >
                                <div className="flex items-center gap-1.5">
                                    Classique
                                    {!isPremium && <Lock className="w-3 h-3 opacity-70" />}
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!isPremium) {
                                        toast.error("Ces effets sont réservés aux abonnés Premium ! ⭐\nVisitez la Boutique pour les débloquer.");
                                        return;
                                    }
                                    setBorderCategory("beam");
                                    if (!borderType.startsWith("magic") || borderType.startsWith("magic_shine")) setBorderType("magic");
                                }}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${borderCategory === "beam" ? "bg-[var(--accent-brown)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]"
                                    }`}
                            >
                                <div className="flex items-center gap-1.5">
                                    Faisceau
                                    {!isPremium && <Lock className="w-3 h-3 opacity-70" />}
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!isPremium) {
                                        toast.error("Ces effets sont réservés aux abonnés Premium ! ⭐\nVisitez la Boutique pour les débloquer.");
                                        return;
                                    }
                                    setBorderCategory("shine");
                                    if (!borderType.startsWith("magic_shine")) setBorderType("magic_shine");
                                }}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${borderCategory === "shine" ? "bg-[var(--accent-brown)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border-color)]"
                                    }`}
                            >
                                <div className="flex items-center gap-1.5">
                                    Lueur
                                    {!isPremium && <Lock className="w-3 h-3 opacity-70" />}
                                </div>
                            </button>
                        </div>

                        {/* Items within category */}
                        <div className="flex flex-wrap gap-2 mt-4">
                            {borderCategory === "none" && [
                                { id: 'none', label: 'Aucune', bg: 'var(--bg-darker)', outline: 'dashed 2px var(--border-color)', accent: "var(--border-color)" },
                            ].map((option) => {
                                const isActive = borderType === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => setBorderType(option.id as any)}
                                        className={`group relative flex flex-col items-center gap-2 rounded-xl p-2.5 transition-all w-[96px] ${isActive ? "bg-[var(--border-color)]" : "hover:bg-[var(--border-color)]"
                                            }`}
                                        style={isActive ? { boxShadow: `0 0 0 2px ${option.accent}` } : {}}
                                    >
                                        <div
                                            className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl shadow-sm transition-transform group-hover:scale-105"
                                            style={{
                                                backgroundColor: 'var(--bg-darker)',
                                                outline: (option as any).outline,
                                                outlineOffset: '-2px',
                                            }}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-[var(--text-primary)] opacity-10" />
                                            {isActive && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                                                    <div className="flex h-5 w-5 items-center justify-center rounded-full shadow-lg" style={{ backgroundColor: option.accent }}>
                                                        <Check className="h-3.5 w-3.5 text-white" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <span className={`text-[11px] font-semibold leading-none mt-1 transition-colors ${isActive ? "text-white" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"}`} style={{ color: isActive ? option.accent : undefined }}>
                                            {option.label}
                                        </span>
                                    </button>
                                );
                            })}

                            {borderCategory === "classique" && [
                                { id: 'blue', label: 'Bleu', bg: 'var(--bg-darker)', border: 'solid 2px #3b82f6', accent: "#3b82f6" },
                                { id: 'orange', label: 'Bronze', bg: 'var(--bg-darker)', border: 'solid 2px #c0a080', accent: "#c0a080" },
                            ].map((option) => {
                                const isActive = borderType === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => {
                                            if (!isPremium) {
                                                toast.error("Ces bordures sont réservées aux abonnés Premium ! ⭐\nVisitez la Boutique pour les débloquer.");
                                                return;
                                            }
                                            setBorderType(option.id as any);
                                        }}
                                        className={`group relative flex flex-col items-center gap-2 rounded-xl p-2.5 transition-all w-[96px] ${isActive ? "bg-[var(--border-color)]" : "hover:bg-[var(--border-color)]"
                                            }`}
                                        style={isActive ? { boxShadow: `0 0 0 2px ${option.accent}` } : {}}
                                    >
                                        <div
                                            className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl shadow-sm transition-transform group-hover:scale-105"
                                            style={{
                                                backgroundColor: 'var(--bg-darker)',
                                                outline: (option as any).outline,
                                                outlineOffset: '-2px',
                                                border: (option as any).border
                                            }}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-[var(--text-primary)] opacity-10" />
                                            {isActive && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                                                    <div className="flex h-5 w-5 items-center justify-center rounded-full shadow-lg" style={{ backgroundColor: option.accent }}>
                                                        <Check className="h-3.5 w-3.5 text-white" />
                                                    </div>
                                                </div>
                                            )}
                                            {!isPremium && !isActive && (
                                                <div className="absolute top-1 right-1 bg-black/60 rounded-full p-1 backdrop-blur-sm z-30">
                                                    <Lock className="w-3 h-3 text-[var(--accent-brown)]" />
                                                </div>
                                            )}
                                        </div>
                                        <span className={`text-[11px] font-semibold leading-none mt-1 transition-colors ${isActive ? "text-white" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"}`} style={{ color: isActive ? option.accent : undefined }}>
                                            {option.label}
                                        </span>
                                    </button>
                                );
                            })}

                            {borderCategory === "beam" && [
                                { id: 'magic', label: 'Or', color: 'linear-gradient(to right, #ffaa40, #9c40ff)', accent: "#9c40ff" },
                                { id: 'magic_purple', label: 'Nébuleuse', color: 'linear-gradient(to right, #9333ea, #ec4899)', accent: "#9333ea" },
                                { id: 'magic_green', label: 'Forêt', color: 'linear-gradient(to right, #10b981, #a3e635)', accent: "#10b981" },
                                { id: 'magic_red', label: 'Enfer', color: 'linear-gradient(to right, #ef4444, #f97316)', accent: "#f97316" },
                                { id: 'magic_double', label: 'Cosmique', color: 'linear-gradient(to right, #06b6d4, #a855f7)', accent: "#a855f7" },
                            ].map((option) => {
                                const isActive = borderType === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => {
                                            if (!isPremium) {
                                                toast.error("Ces bordures sont réservées aux abonnés Premium ! ⭐\nVisitez la Boutique pour les débloquer.");
                                                return;
                                            }
                                            setBorderType(option.id as any);
                                        }}
                                        className={`group relative flex flex-col items-center gap-2 rounded-xl p-2.5 transition-all w-[96px] ${isActive ? "bg-[var(--border-color)]" : "hover:bg-[var(--border-color)]"
                                            }`}
                                        style={isActive ? { boxShadow: `0 0 0 2px ${option.accent}` } : {}}
                                    >
                                        <div
                                            className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl shadow-sm transition-transform group-hover:scale-105"
                                        >
                                            {/* Gradient Border Simulation */}
                                            <div className="absolute inset-0 rounded-[inherit] overflow-hidden p-[3px]">
                                                <div className="w-full h-full rounded-[13px] bg-[var(--bg-darker)] relative z-10 flex items-center justify-center">
                                                    <div className="w-8 h-8 rounded-full bg-[var(--text-primary)] opacity-10" />
                                                </div>
                                                <div
                                                    className="absolute inset-[0px] z-0 animate-spin"
                                                    style={{ backgroundImage: option.color, animationDuration: '3s' }}
                                                />
                                            </div>

                                            {isActive && (
                                                <div className="absolute z-20 inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                                                    <div className="flex h-5 w-5 items-center justify-center rounded-full shadow-lg" style={{ backgroundColor: option.accent }}>
                                                        <Check className="h-3.5 w-3.5 text-white" />
                                                    </div>
                                                </div>
                                            )}
                                            {!isPremium && !isActive && (
                                                <div className="absolute top-1 right-1 bg-black/60 rounded-full p-1 backdrop-blur-sm z-30">
                                                    <Lock className="w-3 h-3 text-[var(--accent-brown)]" />
                                                </div>
                                            )}
                                        </div>
                                        <span className={`text-[11px] font-semibold leading-none mt-1 transition-colors ${isActive ? "text-white" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"}`} style={{ color: isActive ? option.accent : undefined }}>
                                            {option.label}
                                        </span>
                                    </button>
                                );
                            })}

                            {borderCategory === "shine" && [
                                { id: 'magic_shine', label: 'Originale', color: 'radial-gradient(ellipse at 50% 50%, #A07CFE, #FE8FB5, #FFBE7B, transparent, transparent)', accent: "#A07CFE" },
                                { id: 'magic_shine_aurora', label: 'Aurore', color: 'radial-gradient(ellipse at 50% 50%, #10b981, #3b82f6, #8b5cf6, transparent, transparent)', accent: "#10b981" },
                                { id: 'magic_shine_solar', label: 'Solaire', color: 'radial-gradient(ellipse at 50% 50%, #fef08a, #f97316, #ef4444, transparent, transparent)', accent: "#f97316" },
                                { id: 'magic_shine_twilight', label: 'Crépuscule', color: 'radial-gradient(ellipse at 50% 50%, #1e3a8a, #7e22ce, #db2777, transparent, transparent)', accent: "#7e22ce" },
                            ].map((option) => {
                                const isActive = borderType === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => {
                                            if (!isPremium) {
                                                toast.error("Ces bordures sont réservées aux abonnés Premium ! ⭐\nVisitez la Boutique pour les débloquer.");
                                                return;
                                            }
                                            setBorderType(option.id as any);
                                        }}
                                        className={`group relative flex flex-col items-center gap-2 rounded-xl p-2.5 transition-all w-[96px] ${isActive ? "bg-[var(--border-color)]" : "hover:bg-[var(--border-color)]"
                                            }`}
                                        style={isActive ? { boxShadow: `0 0 0 2px ${option.accent}` } : {}}
                                    >
                                        <div
                                            className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl shadow-sm transition-transform group-hover:scale-105"
                                        >
                                            {/* Glow Simulation Filter Base */}
                                            <div className="absolute inset-0 rounded-[inherit] overflow-hidden p-[2px]">
                                                <div className="w-full h-full rounded-[14px] bg-[var(--bg-darker)] relative z-10 flex items-center justify-center">
                                                    <div className="w-8 h-8 rounded-full bg-[var(--text-primary)] opacity-10" />
                                                </div>
                                                <div
                                                    className="absolute -inset-[50%] z-0"
                                                    style={{ backgroundImage: option.color, opacity: 0.9, filter: 'blur(4px)' }}
                                                />
                                            </div>

                                            {isActive && (
                                                <div className="absolute z-20 inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                                                    <div className="flex h-5 w-5 items-center justify-center rounded-full shadow-lg" style={{ backgroundColor: option.accent }}>
                                                        <Check className="h-3.5 w-3.5 text-white" />
                                                    </div>
                                                </div>
                                            )}
                                            {!isPremium && !isActive && (
                                                <div className="absolute top-1 right-1 bg-black/60 rounded-full p-1 backdrop-blur-sm z-30">
                                                    <Lock className="w-3 h-3 text-[var(--accent-brown)]" />
                                                </div>
                                            )}
                                        </div>
                                        <span className={`text-[11px] font-semibold leading-none mt-1 transition-colors ${isActive ? "text-white" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"}`} style={{ color: isActive ? option.accent : undefined }}>
                                            {option.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {isPremium && (
                        <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)]">
                            <div className="space-y-0.5 relative">
                                <Label className="text-[var(--text-primary)] font-semibold flex items-center gap-2">
                                    Afficher le badge Premium
                                    <Crown className="w-4 h-4 text-amber-500" />
                                </Label>
                                <p className="text-xs text-[var(--text-secondary)]">Montrer aux autres joueurs que vous êtes Premium</p>
                            </div>
                            <Switch
                                checked={showPremiumBadge}
                                onCheckedChange={setShowPremiumBadge}
                                className="data-[state=checked]:bg-[var(--accent-brown)]"
                            />
                        </div>
                    )}
                </div>

                <Button
                    onClick={handleSave}
                    disabled={loading}
                    className="w-full bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-dark)] text-white font-bold py-6 rounded-2xl shadow-lg shadow-[var(--accent-brown)]/10"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Enregistrer les modifications"}
                </Button>
            </motion.div >

            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent unstyled className="sm:max-w-md p-0 bg-transparent border-none">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Aperçu de votre profil</DialogTitle>
                        <DialogDescription>Voici comment les autres joueurs verront votre profil</DialogDescription>
                    </DialogHeader>
                    <ProfileCard
                        name={name}
                        characterName={titre || userData.titre}
                        bio={bio || undefined}
                        avatarUrl={ppPreview}
                        backgroundUrl={bannerPreview}
                        borderType={borderType}
                        timeSpent={userData.timeSpent || 0}
                        achievements={userData.achievements || 0}
                        isPremium={isPremium && showPremiumBadge}
                    />
                </DialogContent>
            </Dialog>
        </div >
    );
}

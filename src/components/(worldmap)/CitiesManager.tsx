// CitiesManager.tsx - Inventaire de scènes (Drawer)
"use client";

import { useState, useEffect, useRef } from "react";
import { useGame } from "@/contexts/GameContext";
import { db, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, writeBatch } from "@/lib/firebase";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Edit2, Plus, Image as ImageIcon, Search, MoreVertical, Map as MapIcon, Upload, FolderPlus, Folder, X, ChevronRight, Users, User as UserIcon, Navigation } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import BackgroundSelector from "@/components/(map)/BackgroundSelector";


interface Scene {
    id: string;
    name: string;
    description?: string;
    visibleToPlayers?: boolean;
    backgroundUrl?: string;
    groupId?: string;
    x?: number;
    y?: number;
}

interface SceneGroup {
    id: string;
    name: string;
    order?: number;
}

interface PlayerCharacter {
    id: string;
    name: string;
    image?: string;
    currentSceneId?: string; // To track where they currently are
}

interface CitiesManagerProps {
    onCitySelect?: (cityId: string) => void;
    roomId?: string;
    onClose?: () => void; // New prop to close drawer
    globalCityId?: string | null;
}

export default function CitiesManager({ onCitySelect, roomId, onClose, globalCityId }: CitiesManagerProps) {
    const { user, isMJ } = useGame();
    const effectiveRoomId = roomId || user?.roomId;

    const [scenes, setScenes] = useState<Scene[]>([]);
    const [groups, setGroups] = useState<SceneGroup[]>([]);
    const [players, setPlayers] = useState<PlayerCharacter[]>([]); // Liste des joueurs pour le déplacement
    const [searchQuery, setSearchQuery] = useState("");

    // Safety: Prevent immediate closing on mount (e.g. from lingering click events)
    const [canClose, setCanClose] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setCanClose(true), 500);
        return () => clearTimeout(timer);
    }, []);

    const handleClose = () => {
        if (canClose && onClose) {
            onClose();
        }
    };

    // Formulaire Scène
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState<Partial<Scene>>({ name: "", description: "", visibleToPlayers: true, backgroundUrl: "", groupId: "" });
    const [editingId, setEditingId] = useState<string | null>(null);
    const sceneBackgroundInputRef = useRef<HTMLInputElement>(null);

    // Formulaire Groupe
    const [showGroupForm, setShowGroupForm] = useState(false);
    const [groupFormData, setGroupFormData] = useState({ name: "" });
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false); // État de chargement pour l'upload
    const [showBackgroundSelector, setShowBackgroundSelector] = useState(false);


    // Déplacement
    const [showMoveDialog, setShowMoveDialog] = useState(false);
    const [moveTargetCity, setMoveTargetCity] = useState<Scene | null>(null);
    const [moveMode, setMoveMode] = useState<'all' | 'select'>('all');
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());

    // Charger les scènes
    useEffect(() => {
        if (!effectiveRoomId) return;
        const unsubscribe = onSnapshot(collection(db, `cartes/${effectiveRoomId}/cities`), (snapshot) => {
            const loaded: Scene[] = [];
            snapshot.forEach((doc) => loaded.push({ id: doc.id, ...doc.data() } as Scene));
            setScenes(loaded);
        });
        return () => unsubscribe();
    }, [effectiveRoomId]);

    // Charger les groupes
    useEffect(() => {
        if (!effectiveRoomId) return;
        const q = query(collection(db, `cartes/${effectiveRoomId}/groups`), orderBy("name"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedGroups: SceneGroup[] = [];
            snapshot.forEach((doc) => loadedGroups.push({ id: doc.id, ...doc.data() } as SceneGroup));
            setGroups(loadedGroups);
        });
        return () => unsubscribe();
        return () => unsubscribe();
    }, [effectiveRoomId]);

    // Charger les joueurs (pour le menu de déplacement)
    useEffect(() => {
        if (!effectiveRoomId) return;
        const q = query(collection(db, `cartes/${effectiveRoomId}/characters`), where("type", "==", "joueurs"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedPlayers: PlayerCharacter[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                loadedPlayers.push({
                    id: doc.id,
                    name: data.Nomperso || "Inconnu",
                    image: data.imageURLFinal || data.imageURL || data.imageURL2,
                    currentSceneId: data.currentSceneId
                });
            });
            setPlayers(loadedPlayers);
        });
        return () => unsubscribe();
    }, [effectiveRoomId]);


    // Filtrer les scènes
    const filteredScenes = scenes.filter(scene => {
        return scene.name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    // --- Gestion des Groupes ---

    const handleAddGroup = () => {
        setGroupFormData({ name: "" });
        setEditingGroupId(null);
        setShowGroupForm(true);
    };

    const handleEditGroup = (group: SceneGroup) => {
        setGroupFormData({ name: group.name });
        setEditingGroupId(group.id);
        setShowGroupForm(true);
    };

    const handleSaveGroup = async () => {
        if (!effectiveRoomId || !groupFormData.name.trim()) return;

        if (editingGroupId) {
            await updateDoc(doc(db, `cartes/${effectiveRoomId}/groups/${editingGroupId}`), { name: groupFormData.name });
        } else {
            await addDoc(collection(db, `cartes/${effectiveRoomId}/groups`), { name: groupFormData.name, order: Date.now() });
        }
        setShowGroupForm(false);
    };

    const handleDeleteGroup = async (groupId: string) => {
        if (!effectiveRoomId || !confirm("Supprimer ce groupe ? Les scènes seront déplacées dans 'Non classé'.")) return;
        await deleteDoc(doc(db, `cartes/${effectiveRoomId}/groups/${groupId}`));
    };


    // --- Gestion des Scènes ---

    const handleAddScene = (preselectedGroupId?: string) => {
        setFormData({ name: "", description: "", visibleToPlayers: true, backgroundUrl: "", groupId: preselectedGroupId || (groups.length > 0 ? groups[0].id : "") });
        setEditingId(null);
        setShowForm(true);
    };

    const handleSave = async () => {
        console.log('🔘 [CitiesManager] handleSave called, formData:', formData, 'effectiveRoomId:', effectiveRoomId);

        if (!effectiveRoomId) {
            console.error('❌ [CitiesManager] No roomId available');
            alert('Erreur: Impossible de sauvegarder (pas de roomId)');
            return;
        }

        if (!formData.name?.trim()) {
            console.error('❌ [CitiesManager] No name provided');
            alert('Veuillez entrer un nom pour la scène');
            return;
        }

        const dataToSave = {
            ...formData,
            x: 0,
            y: 0
        };

        console.log('💾 [CitiesManager] Saving scene:', {
            isEditing: !!editingId,
            editingId,
            dataToSave,
            roomId: effectiveRoomId
        });

        try {
            if (editingId) {
                await updateDoc(doc(db, `cartes/${effectiveRoomId}/cities/${editingId}`), dataToSave);
                console.log('✅ [CitiesManager] Scene updated successfully:', editingId);
            } else {
                const docRef = await addDoc(collection(db, `cartes/${effectiveRoomId}/cities`), dataToSave);
                console.log('✅ [CitiesManager] Scene created successfully with ID:', docRef.id);
            }
        } catch (error) {
            console.error('❌ [CitiesManager] Error saving scene:', error);
            alert('Erreur lors de la sauvegarde: ' + (error as Error).message);
        }

        setShowForm(false);
        setEditingId(null);
    };

    const handleEdit = (scene: Scene) => {
        setFormData({
            name: scene.name,
            description: scene.description || "",
            visibleToPlayers: scene.visibleToPlayers ?? true,
            backgroundUrl: scene.backgroundUrl || "",
            groupId: scene.groupId || ""
        });
        setEditingId(scene.id);
        setShowForm(true);
    };

    const handleDelete = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!effectiveRoomId || !confirm("Supprimer cette scène ?")) return;
        await deleteDoc(doc(db, `cartes/${effectiveRoomId}/cities/${id}`));
    };

    // --- Gestion des Déplacements ---

    const handleMoveClick = (scene: Scene, e: React.MouseEvent) => {
        e.stopPropagation();
        setMoveTargetCity(scene);
        setMoveMode('all');
        setSelectedPlayerIds(new Set()); // Reset selection
        setShowMoveDialog(true);
    };

    const togglePlayerSelection = (playerId: string) => {
        const newSet = new Set(selectedPlayerIds);
        if (newSet.has(playerId)) {
            newSet.delete(playerId);
        } else {
            newSet.add(playerId);
        }
        setSelectedPlayerIds(newSet);
    };

    const handleExecuteMove = async () => {
        if (!effectiveRoomId || !moveTargetCity) return;

        try {
            const batch = writeBatch(db);
            const charactersRef = collection(db, `cartes/${effectiveRoomId}/characters`);

            // 1. Si mode "groupe" (Classique)
            if (moveMode === 'all') {
                // A. Mettre à jour le setting global
                const settingsRef = doc(db, `cartes/${effectiveRoomId}/settings/general`);
                batch.update(settingsRef, { currentCityId: moveTargetCity.id });

                // B. Réinitialiser les positions individuelles de TOUS les joueurs (pour qu'ils suivent le global)
                // On doit le faire pour tous les joueurs trouvés
                players.forEach(p => {
                    const charRef = doc(charactersRef, p.id);
                    batch.update(charRef, { currentSceneId: null }); // Remove override
                });

                if (onCitySelect) onCitySelect(moveTargetCity.id);
            }
            // 2. Si mode "sélection" (Individuel)
            else {
                // Mettre à jour uniquement les joueurs sélectionnés avec l'ID de la scène
                selectedPlayerIds.forEach(pId => {
                    const charRef = doc(charactersRef, pId);
                    batch.update(charRef, { currentSceneId: moveTargetCity.id });
                });
            }

            await batch.commit();
            console.log(`✅ [CitiesManager] Moved ${moveMode === 'all' ? 'everyone' : selectedPlayerIds.size + ' players'} to ${moveTargetCity.name}`);
            setShowMoveDialog(false);

        } catch (error) {
            console.error("❌ [CitiesManager] Error executing move:", error);
            alert("Erreur lors du déplacement.");
        }
    };


    const handleSceneBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !effectiveRoomId) return;

        console.log('📤 [CitiesManager] Starting image upload, file size:', (file.size / 1024 / 1024).toFixed(2), 'MB');
        setIsUploadingImage(true);

        try {
            // Créer une référence unique dans Firebase Storage
            const storage = getStorage();
            const timestamp = Date.now();
            const fileName = `scenes/${effectiveRoomId}/${timestamp}_${file.name}`;
            const fileRef = storageRef(storage, fileName);

            console.log('📤 [CitiesManager] Uploading to Storage:', fileName);

            // Upload du fichier
            const snapshot = await uploadBytes(fileRef, file);

            // Obtenir l'URL de téléchargement
            const downloadUrl = await getDownloadURL(snapshot.ref);

            console.log('✅ [CitiesManager] Image uploaded successfully, URL:', downloadUrl);

            // Mettre à jour le formulaire avec l'URL
            setFormData({ ...formData, backgroundUrl: downloadUrl });
        } catch (error) {
            console.error('❌ [CitiesManager] Error uploading image:', error);
            alert('Erreur lors de l\'upload de l\'image. Veuillez réessayer.');
        } finally {
            setIsUploadingImage(false);
        }
    };

    const isVideo = (url?: string) => {
        if (!url) return false;
        return url.toLowerCase().includes('.webm') || url.toLowerCase().includes('.mp4');
    };

    // --- Rendu ---

    const organizedScenes: Record<string, Scene[]> = { "uncategorized": [] };
    groups.forEach(g => organizedScenes[g.id] = []);

    filteredScenes.forEach(scene => {
        if (scene.groupId && organizedScenes[scene.groupId]) {
            organizedScenes[scene.groupId].push(scene);
        } else {
            organizedScenes["uncategorized"].push(scene);
        }
    });

    const renderSceneCard = (scene: Scene, index: number) => {
        // Logic to find players in this scene
        const playersExplicitlyHere = players.filter(p => p.currentSceneId === scene.id);
        const playersImplicitlyHere = players.filter(p => !p.currentSceneId && globalCityId === scene.id);
        const allPlayersHere = [...playersExplicitlyHere, ...playersImplicitlyHere];
        const isGlobalLocation = globalCityId === scene.id;

        return (
            <motion.div
                key={scene.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                onClick={() => onCitySelect && onCitySelect(scene.id)}
                className="group relative h-40 bg-[#121212] border border-white/10 rounded-xl overflow-hidden cursor-pointer hover:border-[#c0a080]/50 hover:shadow-xl hover:shadow-[#c0a080]/10 transition-all duration-300"
            >
                <div className="absolute inset-0">
                    {scene.backgroundUrl ? (
                        isVideo(scene.backgroundUrl) ? (
                            <video
                                src={scene.backgroundUrl}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                autoPlay
                                muted
                                loop
                                playsInline
                            />
                        ) : (
                            <img
                                src={scene.backgroundUrl}
                                alt={scene.name}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                        )
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] flex items-center justify-center">
                            <MapIcon className="w-8 h-8 text-white/5 group-hover:text-[#c0a080]/20 transition-colors" />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-80" />
                </div>



                {/* Move Button (Bottom Right) */}
                {
                    isMJ && (
                        <div className="absolute bottom-3 right-3 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <Button
                                size="sm"
                                className="h-8 bg-[#c0a080] text-black hover:bg-[#d4b594] font-bold shadow-lg text-xs"
                                onClick={(e) => handleMoveClick(scene, e)}
                            >
                                <Navigation className="w-3 h-3 mr-1" /> Aller
                            </Button>
                        </div>
                    )
                }

                <div className="absolute bottom-0 left-0 right-0 p-4 pt-10 text-left">
                    <h3 className="text-base font-bold text-white group-hover:text-[#c0a080] transition-colors leading-none mb-1 shadow-black drop-shadow-md truncate">
                        {scene.name}
                    </h3>
                    {/* 📍 Location Status */}
                    {isGlobalLocation && (
                        <div className="flex items-center gap-1 text-[10px] text-[#c0a080] font-medium uppercase tracking-wider mt-1">
                            <MapIcon className="w-3 h-3" /> Position Groupe
                        </div>
                    )}
                </div>

                {/* 👤 Players Avatars */}
                {allPlayersHere.length > 0 && (
                    <div className="absolute top-2 left-2 flex -space-x-2 z-20">
                        {allPlayersHere.map((p, i) => (
                            <div key={p.id} className="relative group/avatar" style={{ zIndex: 10 + i }}>
                                <div className={cn(
                                    "w-6 h-6 rounded-full border border-white/20 bg-black overflow-hidden shadow-lg",
                                    p.currentSceneId ? "ring-2 ring-blue-500/50" : "ring-1 ring-white/10"
                                )}>
                                    {p.image ? (
                                        <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-[8px] text-white">
                                            {p.name.substring(0, 2)}
                                        </div>
                                    )}
                                </div>
                                {/* Tooltip Name */}
                                <div className="absolute left-1/2 -bottom-4 -translate-x-1/2 opacity-0 group-hover/avatar:opacity-100 bg-black/80 text-[10px] text-white px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap transition-opacity">
                                    {p.name}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {
                    isMJ && (
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size="icon" variant="secondary" className="h-6 w-6 bg-black/40 text-white hover:bg-black/60 shadow-md backdrop-blur-md border border-white/10" onClick={(e) => e.stopPropagation()}>
                                        <MoreVertical className="w-3 h-3" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="bg-[#1a1a1a] border-white/10 text-white">
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(scene); }}>
                                        <Edit2 className="w-4 h-4 mr-2" /> Modifier
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={(e) => { e.stopPropagation(); handleDelete(scene.id, e); }}
                                        className="text-red-400 focus:text-red-400 focus:bg-red-400/10"
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" /> Supprimer
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )
                }
            </motion.div >
        );
    };

    return (
        <>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleClose}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
            />

            {/* Drawer Panel */}
            <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="fixed top-0 right-0 h-full w-full md:w-[50%] bg-[#0a0a0a] z-50 shadow-2xl border-l border-white/10 flex flex-col"
            >
                {/* Background Atmosphere */}
                <div className="absolute inset-0 pointer-events-none opacity-20">
                    <div className="absolute inset-0 bg-gradient-to-tr from-[#0a0a0a] via-[#1a1510] to-[#0a0a0a]" />
                </div>

                {/* Header Section */}
                <div className="relative p-6 border-b border-white/10 flex-shrink-0 bg-[#0a0a0a]/80 backdrop-blur-md">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <Button size="icon" variant="ghost" className="text-gray-400 hover:text-white md:hidden" onClick={handleClose}>
                                <ChevronRight className="w-6 h-6" />
                            </Button>
                            <div>
                                <h1 className="text-3xl font-bold text-white tracking-tight">
                                    <span className="text-[#c0a080]">Scènes</span> & Lieux
                                </h1>
                            </div>
                        </div>
                        <Button size="icon" variant="ghost" onClick={handleClose} className="rounded-full text-gray-500 hover:text-white hover:bg-white/10">
                            <X className="w-6 h-6" />
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Rechercher..."
                                className="pl-9 bg-white/5 border-white/10 text-white focus:border-[#c0a080]/50 h-9"
                            />
                        </div>

                        {isMJ && (
                            <div className="flex gap-2">
                                <Button
                                    onClick={handleAddGroup}
                                    size="sm"
                                    className="bg-white/5 text-white hover:bg-white/10 border border-white/10 h-9"
                                >
                                    <FolderPlus className="w-4 h-4 mr-2" />
                                    Groupe
                                </Button>
                                <Button
                                    onClick={() => handleAddScene()}
                                    size="sm"
                                    className="bg-[#c0a080] text-black hover:bg-[#d4b594] font-medium shadow-lg shadow-[#c0a080]/20 h-9"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Scène
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative">
                    <div className="space-y-8 pb-10">
                        {/* Render Groups */}
                        {groups.map((group) => (
                            <div key={group.id} className="relative">
                                <motion.div
                                    className="flex items-center justify-between mb-4 border-b border-white/5 pb-2 group/header"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                >
                                    <div className="flex items-center gap-3">
                                        <Folder className="w-5 h-5 text-[#c0a080]" />
                                        <h2 className="text-xl font-bold text-white tracking-tight">{group.name}</h2>
                                        <span className="text-xs text-gray-600 font-mono bg-white/5 px-2 py-0.5 rounded-full">
                                            {organizedScenes[group.id]?.length || 0}
                                        </span>
                                    </div>
                                    {isMJ && (
                                        <div className="flex items-center gap-2 opacity-0 group-hover/header:opacity-100 transition-opacity">
                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-white" onClick={() => handleEditGroup(group)}>
                                                <Edit2 className="w-3 h-3" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-red-400" onClick={() => handleDeleteGroup(group.id)}>
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                            <div className="h-3 w-px bg-white/10 mx-2" />
                                            <Button size="sm" variant="secondary" className="h-7 bg-white/5 text-[#c0a080] hover:bg-white/10 text-[10px] px-2" onClick={() => handleAddScene(group.id)}>
                                                <Plus className="w-3 h-3 mr-1" /> Ajouter
                                            </Button>
                                        </div>
                                    )}
                                </motion.div>

                                {organizedScenes[group.id]?.length > 0 ? (
                                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        <AnimatePresence>
                                            {organizedScenes[group.id].map((scene, index) => renderSceneCard(scene, index))}
                                        </AnimatePresence>
                                    </div>
                                ) : (
                                    <div className="h-16 border-2 border-dashed border-white/5 rounded-lg flex items-center justify-center text-white/10 text-xs">
                                        Vide
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Uncategorized Section */}
                        {organizedScenes["uncategorized"] && organizedScenes["uncategorized"].length > 0 && (
                            <div className="pt-6 border-t border-white/10">
                                <h2 className="text-lg font-bold text-gray-400 mb-4 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-gray-600" />
                                    Non classé
                                </h2>
                                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    <AnimatePresence>
                                        {organizedScenes["uncategorized"].map((scene, index) => renderSceneCard(scene, index))}
                                    </AnimatePresence>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Form Dialog */}
                <Dialog open={showForm} onOpenChange={setShowForm}>
                    <DialogContent className="bg-[#111] border border-white/10 text-white sm:max-w-[500px] shadow-2xl z-[60]">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold flex items-center gap-2">
                                {editingId ? "Modifier la scène" : "Nouvelle scène"}
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-6 mt-4">
                            <div className="space-y-2">
                                <Label className="uppercase text-xs font-bold text-gray-500 tracking-wider">Visuel</Label>
                                <div className="relative w-full aspect-video bg-white/5 border border-white/10 rounded-lg overflow-hidden group hover:border-[#c0a080]/50 transition-colors cursor-pointer" onClick={() => setShowBackgroundSelector(true)}>

                                    {isUploadingImage ? (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#c0a080]"></div>
                                            <span className="text-xs">Upload en cours...</span>
                                        </div>
                                    ) : formData.backgroundUrl ? (
                                        <>
                                            {isVideo(formData.backgroundUrl) ? (
                                                <video
                                                    src={formData.backgroundUrl}
                                                    className="w-full h-full object-cover"
                                                    autoPlay
                                                    muted
                                                    loop
                                                    playsInline
                                                />
                                            ) : (
                                                <img src={formData.backgroundUrl} className="w-full h-full object-cover" alt="Preview" />
                                            )}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="text-white font-medium flex items-center gap-2"><Upload className="w-4 h-4" /> Changer</span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-2"><ImageIcon className="w-10 h-10 opacity-50" /><span className="text-xs">Ajouter image/vidéo</span></div>
                                    )}
                                </div>
                            </div>



                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="uppercase text-xs font-bold text-gray-500 tracking-wider">Nom</Label>
                                    <Input
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="bg-white/5 border-white/10 focus:border-[#c0a080]/50"
                                        placeholder="Nom du lieu..."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="uppercase text-xs font-bold text-gray-500 tracking-wider">Groupe</Label>
                                    <select
                                        value={formData.groupId}
                                        onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                                        className="w-full h-10 px-3 rounded-md bg-white/5 border border-white/10 text-white focus:outline-none focus:border-[#c0a080]/50"
                                    >
                                        <option value="" className="bg-[#111]">Non classé</option>
                                        {groups.map(g => (
                                            <option key={g.id} value={g.id} className="bg-[#111]">{g.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="uppercase text-xs font-bold text-gray-500 tracking-wider">Description</Label>
                                <Textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="bg-white/5 border-white/10 focus:border-[#c0a080]/50 min-h-[80px] resize-none"
                                    placeholder="Description rapide..."
                                />
                            </div>
                        </div>

                        <DialogFooter className="mt-6">
                            <Button variant="ghost" onClick={() => setShowForm(false)} className="text-white/50 hover:text-white">Annuler</Button>
                            <Button onClick={handleSave} className="bg-[#c0a080] text-black hover:bg-[#d4b594]">
                                {editingId ? "Enregistrer" : "Créer"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Group Form Dialog */}
                <Dialog open={showGroupForm} onOpenChange={setShowGroupForm}>
                    <DialogContent className="bg-[#111] border border-white/10 text-white sm:max-w-[400px] z-[60]">
                        <DialogHeader>
                            <DialogTitle>{editingGroupId ? "Renommer le groupe" : "Nouveau groupe"}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Nom du groupe</Label>
                                <Input
                                    value={groupFormData.name}
                                    onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })}
                                    className="bg-white/5 border-white/10"
                                    placeholder="Ex: Villes, Donjons..."
                                    autoFocus
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setShowGroupForm(false)}>Annuler</Button>
                            <Button onClick={handleSaveGroup} className="bg-[#c0a080] text-black">Valider</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>


                {/* Move Selection Dialog */}
                <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
                    <DialogContent className="bg-[#111] border border-white/10 text-white sm:max-w-[450px] z-[60]">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Navigation className="w-5 h-5 text-[#c0a080]" />
                                Déplacement vers : <span className="text-[#c0a080]">{moveTargetCity?.name}</span>
                            </DialogTitle>
                            <DialogDescription>
                                Choisissez qui doit être déplacé vers ce lieu.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="flex bg-white/5 p-1 rounded-lg">
                                <button
                                    onClick={() => setMoveMode('all')}
                                    className={cn(
                                        "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                                        moveMode === 'all' ? "bg-[#c0a080] text-black shadow" : "text-gray-400 hover:text-white"
                                    )}
                                >
                                    Tout le groupe
                                </button>
                                <button
                                    onClick={() => setMoveMode('select')}
                                    className={cn(
                                        "flex-1 py-2 text-sm font-medium rounded-md transition-all",
                                        moveMode === 'select' ? "bg-[#c0a080] text-black shadow" : "text-gray-400 hover:text-white"
                                    )}
                                >
                                    Sélection
                                </button>
                            </div>

                            {moveMode === 'all' ? (
                                <div className="p-4 border border-white/10 rounded-lg bg-white/5 text-center text-sm text-gray-300">
                                    <p>Déplacer tout le groupe vers <strong>{moveTargetCity?.name}</strong>.</p>
                                    <p className="text-xs text-gray-500 mt-2">Cela réinitialisera aussi les positions individuelles.</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar p-1">
                                    {players.map(player => (
                                        <div
                                            key={player.id}
                                            onClick={() => togglePlayerSelection(player.id)}
                                            className={cn(
                                                "flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all",
                                                selectedPlayerIds.has(player.id)
                                                    ? "bg-[#c0a080]/10 border-[#c0a080] shadow-[0_0_10px_rgba(192,160,128,0.1)]"
                                                    : "bg-white/5 border-transparent hover:bg-white/10"
                                            )}
                                        >
                                            <div className="w-5 h-5 rounded border border-white/30 flex items-center justify-center flex-shrink-0 transition-colors">
                                                {selectedPlayerIds.has(player.id) && (
                                                    <div className="w-3 h-3 bg-[#c0a080] rounded-[2px]" />
                                                )}
                                            </div>

                                            {player.image ? (
                                                <img src={player.image} alt={player.name} className="w-8 h-8 rounded-full object-cover bg-black" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                                    <UserIcon className="w-4 h-4 text-white/50" />
                                                </div>
                                            )}

                                            <div className="flex-1">
                                                <p className={cn("text-sm font-medium", selectedPlayerIds.has(player.id) ? "text-[#c0a080]" : "text-white")}>
                                                    {player.name}
                                                </p>
                                                {player.currentSceneId && (
                                                    <p className="text-xs text-gray-500">
                                                        Actuellement à : {scenes.find(s => s.id === player.currentSceneId)?.name || 'Inconnu'}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {players.length === 0 && (
                                        <p className="text-sm text-gray-500 text-center py-4">Aucun joueur trouvé.</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setShowMoveDialog(false)}>Annuler</Button>
                            <Button
                                onClick={handleExecuteMove}
                                className="bg-[#c0a080] text-black hover:bg-[#d4b594]"
                                disabled={moveMode === 'select' && selectedPlayerIds.size === 0}
                            >
                                Confirmer
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

            </motion.div >

            <BackgroundSelector
                isOpen={showBackgroundSelector}
                onClose={() => setShowBackgroundSelector(false)}
                onSelectLocal={(path) => setFormData(prev => ({ ...prev, backgroundUrl: path }))}
                onUpload={handleSceneBackgroundUpload}
            />
        </>
    );
}

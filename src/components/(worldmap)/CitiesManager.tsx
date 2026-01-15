// CitiesManager.tsx - Inventaire de scènes (Drawer)
"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";



import { useGame } from "@/contexts/GameContext";
import { db, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, writeBatch, getDoc, setDoc, getDocs } from "@/lib/firebase";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Edit2, Plus, Image as ImageIcon, Search, MoreVertical, Map as MapIcon, FolderPlus, Folder, X, ChevronRight, Users, User as UserIcon, Navigation } from "lucide-react";
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
    spawnX?: number;  // 🆕 Default spawn X coordinate for players
    spawnY?: number;  // 🆕 Default spawn Y coordinate for players
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

    // Formulaire Groupe
    const [showGroupForm, setShowGroupForm] = useState(false);
    const [groupFormData, setGroupFormData] = useState({ name: "" });
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [showBackgroundSelector, setShowBackgroundSelector] = useState(false);
    // Confirmations & Alerts States
    const [alertConfig, setAlertConfig] = useState<{ open: boolean, title: string, message: string }>({ open: false, title: "", message: "" });
    const [confirmConfig, setConfirmConfig] = useState<{ open: boolean, title: string, message: string, onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => { } });

    // Helper functions
    const showAlert = (title: string, message: string) => setAlertConfig({ open: true, title, message });
    const showConfirm = (title: string, message: string, onConfirm: () => void) => setConfirmConfig({ open: true, title, message, onConfirm });



    // Déplacement
    const [showMoveDialog, setShowMoveDialog] = useState(false);
    const [moveTargetCity, setMoveTargetCity] = useState<Scene | null>(null);
    const [moveMode, setMoveMode] = useState<'all' | 'select'>('all');
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);




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
        if (!effectiveRoomId) return;

        showConfirm(
            "Supprimer ce groupe ?",
            "Les scènes seront déplacées dans 'Non classé'. Cette action est irréversible.",
            async () => {
                await deleteDoc(doc(db, `cartes/${effectiveRoomId}/groups/${groupId}`));
            }
        );
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
            showAlert('Erreur', 'Impossible de sauvegarder (pas de roomId)');
            return;
        }

        if (!formData.name?.trim()) {
            console.error('❌ [CitiesManager] No name provided');
            showAlert('Attention', 'Veuillez entrer un nom pour la scène');
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

                // 🆕 Initialize Default Settings if needed (pixelsPerUnit, globalTokenScale, donjon)
                const settingsRef = doc(db, `cartes/${effectiveRoomId}/settings/general`);
                const settingsSnap = await getDoc(settingsRef);

                if (!settingsSnap.exists()) {
                    await setDoc(settingsRef, {
                        pixelsPerUnit: 1,
                        globalTokenScale: 1,
                        donjon: false
                    });
                } else {
                    const data = settingsSnap.data();
                    const updates: any = {};
                    if (data.pixelsPerUnit === undefined) updates.pixelsPerUnit = 1;
                    if (data.globalTokenScale === undefined) updates.globalTokenScale = 1;
                    if (data.donjon === undefined) updates.donjon = false;

                    if (Object.keys(updates).length > 0) {
                        await updateDoc(settingsRef, updates);
                    }
                }
            }
        } catch (error) {
            console.error('❌ [CitiesManager] Error saving scene:', error);
            showAlert('Erreur', 'Erreur lors de la sauvegarde: ' + (error as Error).message);
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

        // 🛡️ SECURITY CHECK: Is anyone in this scene?
        const playersInScene = players.filter(p => {
            // 1. Explicitly in this scene
            if (p.currentSceneId === id) return true;
            // 2. Implicitly in this scene (global group location) AND no override
            if (!p.currentSceneId && globalCityId === id) return true;
            return false;
        });

        if (playersInScene.length > 0) {
            showAlert(
                "Suppression Impossible",
                `Impossible de supprimer cette scène : ${playersInScene.length} joueur(s) y sont actuellement présents (${playersInScene.map(p => p.name).join(', ')}). Déplacez-les d'abord.`
            );
            return;
        }

        if (!effectiveRoomId) return;

        showConfirm(
            "Supprimer cette scène ?",
            "Êtes-vous sûr de vouloir supprimer cette scène ? Tous les éléments associés (PNJ, objets, sons, brouillard, obstacles, lumières, etc.) seront également supprimés. Cette action est irréversible.",
            async () => {
                try {
                    console.log(`🗑️ [CitiesManager] Starting cascading deletion for city: ${id}`);

                    // Count entities for user feedback
                    let deletedCount = {
                        npcs: 0,
                        objects: 0,
                        drawings: 0,
                        notes: 0,
                        obstacles: 0,
                        lights: 0,
                        musicZones: 0,
                        measurements: 0,
                        fog: 0
                    };

                    // 🔥 Use batch operations for atomic deletion (max 500 operations per batch)
                    const batch = writeBatch(db);

                    // 1. Delete NPCs/Characters with cityId
                    const charactersRef = collection(db, `cartes/${effectiveRoomId}/characters`);
                    const charactersQuery = query(charactersRef, where('cityId', '==', id));
                    const charactersSnapshot = await getDocs(charactersQuery);
                    charactersSnapshot.forEach((docSnap) => {
                        batch.delete(docSnap.ref);
                        deletedCount.npcs++;
                    });

                    // 2. Delete Objects
                    const objectsRef = collection(db, `cartes/${effectiveRoomId}/objects`);
                    const objectsQuery = query(objectsRef, where('cityId', '==', id));
                    const objectsSnapshot = await getDocs(objectsQuery);
                    objectsSnapshot.forEach((docSnap) => {
                        batch.delete(docSnap.ref);
                        deletedCount.objects++;
                    });

                    // 3. Delete Drawings
                    const drawingsRef = collection(db, `cartes/${effectiveRoomId}/drawings`);
                    const drawingsQuery = query(drawingsRef, where('cityId', '==', id));
                    const drawingsSnapshot = await getDocs(drawingsQuery);
                    drawingsSnapshot.forEach((docSnap) => {
                        batch.delete(docSnap.ref);
                        deletedCount.drawings++;
                    });

                    // 4. Delete Notes (text)
                    const notesRef = collection(db, `cartes/${effectiveRoomId}/text`);
                    const notesQuery = query(notesRef, where('cityId', '==', id));
                    const notesSnapshot = await getDocs(notesQuery);
                    notesSnapshot.forEach((docSnap) => {
                        batch.delete(docSnap.ref);
                        deletedCount.notes++;
                    });

                    // 5. Delete Obstacles
                    const obstaclesRef = collection(db, `cartes/${effectiveRoomId}/obstacles`);
                    const obstaclesQuery = query(obstaclesRef, where('cityId', '==', id));
                    const obstaclesSnapshot = await getDocs(obstaclesQuery);
                    obstaclesSnapshot.forEach((docSnap) => {
                        batch.delete(docSnap.ref);
                        deletedCount.obstacles++;
                    });

                    // 6. Delete Lights
                    const lightsRef = collection(db, `cartes/${effectiveRoomId}/lights`);
                    const lightsQuery = query(lightsRef, where('cityId', '==', id));
                    const lightsSnapshot = await getDocs(lightsQuery);
                    lightsSnapshot.forEach((docSnap) => {
                        batch.delete(docSnap.ref);
                        deletedCount.lights++;
                    });

                    // 7. Delete Music Zones
                    const musicZonesRef = collection(db, `cartes/${effectiveRoomId}/musicZones`);
                    const musicZonesQuery = query(musicZonesRef, where('cityId', '==', id));
                    const musicZonesSnapshot = await getDocs(musicZonesQuery);
                    musicZonesSnapshot.forEach((docSnap) => {
                        batch.delete(docSnap.ref);
                        deletedCount.musicZones++;
                    });

                    // 8. Delete Measurements
                    const measurementsRef = collection(db, `cartes/${effectiveRoomId}/measurements`);
                    const measurementsQuery = query(measurementsRef, where('cityId', '==', id));
                    const measurementsSnapshot = await getDocs(measurementsQuery);
                    measurementsSnapshot.forEach((docSnap) => {
                        batch.delete(docSnap.ref);
                        deletedCount.measurements++;
                    });

                    // 9. Delete Fog (specific document)
                    const fogDocId = `fog_${id}`;
                    const fogRef = doc(db, `cartes/${effectiveRoomId}/fog/${fogDocId}`);
                    const fogSnapshot = await getDoc(fogRef);
                    if (fogSnapshot.exists()) {
                        batch.delete(fogRef);
                        deletedCount.fog++;
                    }

                    // 10. Delete the City itself
                    const cityRef = doc(db, `cartes/${effectiveRoomId}/cities/${id}`);
                    batch.delete(cityRef);

                    // Commit the batch
                    await batch.commit();

                    // Calculate total deleted entities
                    const totalDeleted = Object.values(deletedCount).reduce((sum, count) => sum + count, 0);

                    console.log('✅ [CitiesManager] Cascading deletion completed:', deletedCount);

                    // Show success message with details
                    const deletedItems = [];
                    if (deletedCount.npcs > 0) deletedItems.push(`${deletedCount.npcs} PNJ`);
                    if (deletedCount.objects > 0) deletedItems.push(`${deletedCount.objects} objet(s)`);
                    if (deletedCount.musicZones > 0) deletedItems.push(`${deletedCount.musicZones} son(s)`);
                    if (deletedCount.drawings > 0) deletedItems.push(`${deletedCount.drawings} dessin(s)`);
                    if (deletedCount.notes > 0) deletedItems.push(`${deletedCount.notes} note(s)`);
                    if (deletedCount.obstacles > 0) deletedItems.push(`${deletedCount.obstacles} obstacle(s)`);
                    if (deletedCount.lights > 0) deletedItems.push(`${deletedCount.lights} lumière(s)`);
                    if (deletedCount.measurements > 0) deletedItems.push(`${deletedCount.measurements} mesure(s)`);
                    if (deletedCount.fog > 0) deletedItems.push('brouillard');

                    if (deletedItems.length > 0) {
                        showAlert(
                            "Scène supprimée",
                            `Scène supprimée avec succès. Éléments supprimés : ${deletedItems.join(', ')}.`
                        );
                    }

                } catch (error) {
                    console.error('❌ [CitiesManager] Error during cascading deletion:', error);
                    showAlert('Erreur', 'Erreur lors de la suppression de la scène: ' + (error as Error).message);
                }
            }
        );
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
                batch.set(settingsRef, { currentCityId: moveTargetCity.id }, { merge: true });

                // B. Réinitialiser les positions individuelles de TOUS les joueurs (pour qu'ils suivent le global)
                // 🆕 Si la scène a un spawn point défini, placer les joueurs à cette position
                const spawnX = moveTargetCity.spawnX ?? 0;
                const spawnY = moveTargetCity.spawnY ?? 0;

                players.forEach(p => {
                    const charRef = doc(charactersRef, p.id);
                    batch.update(charRef, {
                        currentSceneId: null, // Remove override
                        x: spawnX,  // 🆕 Place at spawn point
                        y: spawnY   // 🆕 Place at spawn point
                    });
                });

                if (onCitySelect) onCitySelect(moveTargetCity.id);
            }
            // 2. Si mode "sélection" (Individuel)
            else {
                // 🆕 Si la scène a un spawn point défini, placer les joueurs sélectionnés à cette position
                const spawnX = moveTargetCity.spawnX ?? 0;
                const spawnY = moveTargetCity.spawnY ?? 0;

                // Mettre à jour uniquement les joueurs sélectionnés avec l'ID de la scène
                selectedPlayerIds.forEach(pId => {
                    const charRef = doc(charactersRef, pId);
                    batch.update(charRef, {
                        currentSceneId: moveTargetCity.id,
                        x: spawnX,  // 🆕 Place at spawn point
                        y: spawnY   // 🆕 Place at spawn point
                    });
                });
            }

            await batch.commit();
            console.log(`✅ [CitiesManager] Moved ${moveMode === 'all' ? 'everyone' : selectedPlayerIds.size + ' players'} to ${moveTargetCity.name}${moveTargetCity.spawnX !== undefined ? ` at spawn (${moveTargetCity.spawnX}, ${moveTargetCity.spawnY})` : ''}`);
            setShowMoveDialog(false);

        } catch (error) {
            console.error("❌ [CitiesManager] Error executing move:", error);
            showAlert("Erreur", "Erreur lors du déplacement.");
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

                {/* Form Overlay - Custom instead of Shadcn Dialog to avoid modal constraints */}
                <AnimatePresence>
                    {showForm && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShowForm(false)}
                                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="relative w-full max-w-[500px] bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                            >
                                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                                    <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                                        {editingId ? "Modifier la scène" : "Nouvelle scène"}
                                    </h2>
                                    <Button size="icon" variant="ghost" className="rounded-full h-8 w-8 hover:bg-white/10" onClick={() => setShowForm(false)}>
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>

                                <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh] custom-scrollbar">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="uppercase text-xs font-bold text-gray-500 tracking-wider text-white">Nom</Label>
                                            <Input
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                className="bg-white/5 border-white/10 focus:border-[#c0a080]/50 text-white"
                                                placeholder="Nom du lieu..."
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="uppercase text-xs font-bold text-gray-500 tracking-wider text-white">Groupe</Label>
                                            <select
                                                value={formData.groupId}
                                                onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                                                className="w-full h-10 px-3 rounded-md bg-[#1a1a1a] border border-white/10 text-white focus:outline-none focus:border-[#c0a080]/50"
                                            >
                                                <option value="" className="bg-[#111]">Non classé</option>
                                                {groups.map(g => (
                                                    <option key={g.id} value={g.id} className="bg-[#111]">{g.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="uppercase text-xs font-bold text-gray-500 tracking-wider text-white">Description</Label>
                                        <Textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                            className="bg-white/5 border-white/10 focus:border-[#c0a080]/50 min-h-[80px] resize-none text-white"
                                            placeholder="Description rapide..."
                                        />
                                    </div>
                                </div>

                                <div className="p-6 bg-white/[0.02] border-t border-white/5 flex justify-end gap-3">
                                    <Button variant="ghost" onClick={() => setShowForm(false)} className="text-white/50 hover:text-white">Annuler</Button>
                                    <Button onClick={handleSave} className="bg-[#c0a080] text-black hover:bg-[#d4b594] font-bold px-6">
                                        {editingId ? "Enregistrer" : "Créer"}
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>


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

            {/* Dialogues Shadcn Simples pour Alertes et Confirmations */}
            <Dialog open={alertConfig.open} onOpenChange={(open) => setAlertConfig(prev => ({ ...prev, open }))}>
                <DialogContent className="bg-[#111] border border-white/10 text-white sm:max-w-[400px] z-[100]">
                    <DialogHeader>
                        <DialogTitle className="text-[#c0a080]">{alertConfig.title}</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            {alertConfig.message}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => setAlertConfig(prev => ({ ...prev, open: false }))} className="bg-[#c0a080] text-black hover:bg-[#d4b594]">
                            Compris
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={confirmConfig.open} onOpenChange={(open) => setConfirmConfig(prev => ({ ...prev, open }))}>
                <DialogContent className="bg-[#111] border border-white/10 text-white sm:max-w-[400px] z-[100]">
                    <DialogHeader>
                        <DialogTitle className="text-white">{confirmConfig.title}</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            {confirmConfig.message}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => setConfirmConfig(prev => ({ ...prev, open: false }))} className="hover:text-white">
                            Annuler
                        </Button>
                        <Button
                            onClick={() => {
                                confirmConfig.onConfirm();
                                setConfirmConfig(prev => ({ ...prev, open: false }));
                            }}
                            className="bg-red-500 hover:bg-red-600 text-white"
                        >
                            Confirmer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {mounted && createPortal(
                <BackgroundSelector
                    isOpen={showBackgroundSelector}
                    onClose={() => setShowBackgroundSelector(false)}
                    onSelectLocal={(path) => setFormData(prev => ({ ...prev, backgroundUrl: path }))}
                />,
                document.body
            )}
        </>



    );
}

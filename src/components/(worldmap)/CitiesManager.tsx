// CitiesManager.tsx - Gestionnaire simple de villes avec pan/zoom
"use client";

import { useState, useEffect, useRef } from "react";
import { useGame } from "@/contexts/GameContext";
import { db, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, setDoc, getDoc } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Edit2, Plus, ZoomIn, ZoomOut, Maximize2, Upload, Grid3x3, Eye, EyeOff, Map as MapIcon, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface City {
    id: string;
    name: string;
    x: number;
    y: number;
    description?: string;
    icon?: string;
    color?: string;
    visibleToPlayers?: boolean;
    backgroundUrl?: string; // 🆕 Fond spécifique à cette ville
}

const ICONS = ["🏰", "🏛️", "🏘️", "⛪", "🗼", "🏯"];
const COLORS = ["#c0a080", "#8B4513", "#4169E1", "#228B22", "#DC143C", "#9370DB"];


interface CitiesManagerProps {
    onCitySelect?: (cityId: string) => void; // 🆕 Callback pour naviguer vers une ville
}

export default function CitiesManager({ onCitySelect }: CitiesManagerProps) {
    const { user, isMJ } = useGame();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [cities, setCities] = useState<City[]>([]);
    const [selectedCity, setSelectedCity] = useState<City | null>(null);

    // Formulaire
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: "", description: "", icon: ICONS[0], color: COLORS[0], x: 0, y: 0, visibleToPlayers: true, backgroundUrl: "" });
    const [editingId, setEditingId] = useState<string | null>(null);
    const cityBackgroundInputRef = useRef<HTMLInputElement>(null);

    // Drag & Drop ville
    const [draggingCity, setDraggingCity] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [hasDragged, setHasDragged] = useState(false);

    // Pan & Zoom
    const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
    const [viewScale, setViewScale] = useState(1);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });

    // Image de fond
    const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
    const [imageScale, setImageScale] = useState({ width: 1000, height: 1000 }); // Dimensions de référence
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Affichage grille
    const [showGrid, setShowGrid] = useState(true);

    // Charger les villes
    useEffect(() => {
        if (!user?.roomId) return;
        const unsubscribe = onSnapshot(collection(db, `cartes/${user.roomId}/cities`), (snapshot) => {
            const loaded: City[] = [];
            snapshot.forEach((doc) => loaded.push({ id: doc.id, ...doc.data() } as City));
            setCities(loaded);

            // Mettre à jour la ville sélectionnée si elle a changé
            setSelectedCity(prev => {
                if (!prev) return null;
                const updatedCity = loaded.find(c => c.id === prev.id);
                return updatedCity || prev;
            });
        });
        return () => unsubscribe();
    }, [user?.roomId]);

    // Charger les paramètres de la carte (image de fond et grille)
    useEffect(() => {
        if (!user?.roomId) return;
        const unsubscribe = onSnapshot(doc(db, `cartes/${user.roomId}/settings/map`), (snapshot) => {
            const data = snapshot.data();
            if (data) {
                // Charger l'état de la grille
                if (data.showGrid !== undefined) {
                    setShowGrid(data.showGrid);
                }
                // Charger l'image de fond
                if (data.backgroundImageUrl) {
                    const img = new Image();
                    img.onload = () => {
                        setBackgroundImage(img);
                        // Utiliser les dimensions sauvegardées ou les dimensions de l'image
                        const width = data.imageWidth || img.width;
                        const height = data.imageHeight || img.height;
                        setImageScale({ width, height });
                    };
                    img.src = data.backgroundImageUrl;
                }
            }
        });
        return () => unsubscribe();
    }, [user?.roomId]);

    // Calculer le scale de l'image pour le fit
    const getImageFitScale = () => {
        const canvas = canvasRef.current;
        if (!canvas || !backgroundImage) return 1;
        const scaleX = canvas.width / imageScale.width;
        const scaleY = canvas.height / imageScale.height;
        return Math.max(scaleX, scaleY);
    };

    // Calculer l'offset de centrage de l'image
    const getImageOffset = () => {
        const canvas = canvasRef.current;
        if (!canvas || !backgroundImage) return { x: 0, y: 0 };
        const fitScale = getImageFitScale();
        const scaledWidth = imageScale.width * fitScale;
        const scaledHeight = imageScale.height * fitScale;
        return {
            x: (canvas.width - scaledWidth) / 2,
            y: (canvas.height - scaledHeight) / 2,
        };
    };

    // Convertir coordonnées écran -> monde (coordonnées relatives à l'image)
    const screenToWorld = (screenX: number, screenY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const fitScale = getImageFitScale();
        const imageOffset = getImageOffset();

        const x = (screenX - rect.left - viewOffset.x - imageOffset.x) / (viewScale * fitScale);
        const y = (screenY - rect.top - viewOffset.y - imageOffset.y) / (viewScale * fitScale);
        return { x, y };
    };

    // Convertir coordonnées monde -> écran
    const worldToScreen = (worldX: number, worldY: number) => {
        const fitScale = getImageFitScale();
        const imageOffset = getImageOffset();
        return {
            x: worldX * viewScale * fitScale + viewOffset.x + imageOffset.x,
            y: worldY * viewScale * fitScale + viewOffset.y + imageOffset.y,
        };
    };

    // Dessiner le canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        // Fond
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Image de fond si présente
        if (backgroundImage) {
            ctx.save();

            // Calculer le scale pour remplir le canvas tout en gardant le ratio
            const scaleX = canvas.width / imageScale.width;
            const scaleY = canvas.height / imageScale.height;
            const fitScale = Math.max(scaleX, scaleY); // Cover mode

            // Dimensions de l'image après scaling
            const scaledWidth = imageScale.width * fitScale;
            const scaledHeight = imageScale.height * fitScale;

            // Centrer l'image
            const offsetX = (canvas.width - scaledWidth) / 2;
            const offsetY = (canvas.height - scaledHeight) / 2;

            ctx.translate(viewOffset.x + offsetX, viewOffset.y + offsetY);
            ctx.scale(viewScale * fitScale, viewScale * fitScale);
            ctx.drawImage(backgroundImage, 0, 0);
            ctx.restore();
        }

        // Grille
        if (showGrid) {
            ctx.strokeStyle = "#333";
            ctx.lineWidth = 1;
            const gridSize = 50 * viewScale;
            const offsetX = viewOffset.x % gridSize;
            const offsetY = viewOffset.y % gridSize;

            for (let x = offsetX; x < canvas.width; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }
            for (let y = offsetY; y < canvas.height; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
            }
        }

        // Villes
        cities.forEach((city) => {
            // Filtrer les villes non visibles pour les joueurs
            if (!isMJ && !city.visibleToPlayers) return;

            const screenPos = worldToScreen(city.x, city.y);
            const isSelected = selectedCity?.id === city.id;
            const isDragging = draggingCity === city.id;

            ctx.fillStyle = city.color || "#c0a080";
            ctx.strokeStyle = isSelected ? "#fff" : isDragging ? "#FFD700" : "#666";
            ctx.lineWidth = isSelected || isDragging ? 3 : 1;

            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, 15 * viewScale, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Indicateur pour villes invisibles (MJ seulement)
            if (isMJ && !city.visibleToPlayers) {
                ctx.strokeStyle = "#FF0000";
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.arc(screenPos.x, screenPos.y, 18 * viewScale, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            ctx.font = `${20 * viewScale}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(city.icon || "🏰", screenPos.x, screenPos.y);

            // Nom de la ville avec contour pour meilleure visibilité
            ctx.font = `bold ${12 * viewScale}px Arial`;
            ctx.textBaseline = "top";

            // Contour noir épais pour contraste
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 3 * viewScale;
            ctx.strokeText(city.name, screenPos.x, screenPos.y + 20 * viewScale);

            // Texte blanc par-dessus
            ctx.fillStyle = "#fff";
            ctx.fillText(city.name, screenPos.x, screenPos.y + 20 * viewScale);
        });
    }, [cities, selectedCity, draggingCity, viewOffset, viewScale, backgroundImage, showGrid, isMJ, imageScale]);

    // Clic sur le canvas
    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        // Ne pas ouvrir la popup si on vient de faire un drag
        if (hasDragged || isPanning) {
            setHasDragged(false);
            return;
        }

        const worldPos = screenToWorld(e.clientX, e.clientY);

        const clicked = cities.find((city) => {
            // Les joueurs ne peuvent cliquer que sur les villes visibles
            if (!isMJ && !city.visibleToPlayers) return false;

            const dx = city.x - worldPos.x;
            const dy = city.y - worldPos.y;
            return Math.sqrt(dx * dx + dy * dy) < 20;
        });

        if (clicked) {
            setSelectedCity(clicked);
            // 🆕 Double-clic pour naviguer vers la ville
            if (e.detail === 2 && onCitySelect) {
                onCitySelect(clicked.id);
            }
        } else {
            setSelectedCity(null);
        }
    };

    // Début du drag
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        // Clic molette pour pan (tous les utilisateurs)
        if (e.button === 1) {
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
            e.preventDefault();
            return;
        }

        if (e.button !== 0) return;

        const worldPos = screenToWorld(e.clientX, e.clientY);

        // Vérifier si on clique sur une ville
        const city = cities.find((c) => {
            const dx = c.x - worldPos.x;
            const dy = c.y - worldPos.y;
            return Math.sqrt(dx * dx + dy * dy) < 20;
        });

        // Si on clique sur une ville et qu'on est MJ, on peut la déplacer
        if (city && isMJ) {
            setDraggingCity(city.id);
            setDragOffset({ x: worldPos.x - city.x, y: worldPos.y - city.y });
            setHasDragged(false);
        } else {
            // Sinon, on déplace la carte (comportement par défaut)
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
        }
    };

    // Pendant le drag
    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isPanning) {
            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            setViewOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
            setPanStart({ x: e.clientX, y: e.clientY });
            return;
        }

        if (!draggingCity || !isMJ) return;

        // Marquer qu'on a bougé (pour distinguer clic vs drag)
        setHasDragged(true);

        const worldPos = screenToWorld(e.clientX, e.clientY);

        setCities((prev) =>
            prev.map((city) =>
                city.id === draggingCity
                    ? { ...city, x: worldPos.x - dragOffset.x, y: worldPos.y - dragOffset.y }
                    : city
            )
        );
    };

    // Fin du drag
    const handleMouseUp = async () => {
        if (isPanning) {
            setIsPanning(false);
            return;
        }

        if (!draggingCity || !user?.roomId) {
            setDraggingCity(null);
            return;
        }

        const city = cities.find((c) => c.id === draggingCity);
        if (city) {
            await updateDoc(doc(db, `cartes/${user.roomId}/cities/${city.id}`), {
                x: city.x,
                y: city.y,
            });
        }

        setDraggingCity(null);
    };

    // Zoom avec molette
    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(5, viewScale * delta));

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - viewOffset.x) / viewScale;
        const worldY = (mouseY - viewOffset.y) / viewScale;

        const newOffsetX = mouseX - worldX * newScale;
        const newOffsetY = mouseY - worldY * newScale;

        setViewScale(newScale);
        setViewOffset({ x: newOffsetX, y: newOffsetY });
    };

    // Ouvrir le formulaire
    const handleAddCity = () => {
        setFormData({ name: "", description: "", icon: ICONS[0], color: COLORS[0], x: 500, y: 400, visibleToPlayers: true, backgroundUrl: "" });
        setEditingId(null);
        setShowForm(true);
    };

    // Sauvegarder
    const handleSave = async () => {
        if (!user?.roomId || !formData.name.trim()) return;

        if (editingId) {
            await updateDoc(doc(db, `cartes/${user.roomId}/cities/${editingId}`), formData);
        } else {
            await addDoc(collection(db, `cartes/${user.roomId}/cities`), formData);
        }

        setShowForm(false);
        setFormData({ name: "", description: "", icon: ICONS[0], color: COLORS[0], x: 0, y: 0, visibleToPlayers: true, backgroundUrl: "" });
        setEditingId(null);
    };

    // Modifier
    const handleEdit = (city: City) => {
        setFormData({
            name: city.name,
            description: city.description || "",
            icon: city.icon || ICONS[0],
            color: city.color || COLORS[0],
            x: city.x,
            y: city.y,
            visibleToPlayers: city.visibleToPlayers ?? true,
            backgroundUrl: city.backgroundUrl || "",
        });
        setEditingId(city.id);
        setShowForm(true);
    };

    // Supprimer
    const handleDelete = async (id: string) => {
        if (!user?.roomId || !confirm("Supprimer cette ville ?")) return;
        await deleteDoc(doc(db, `cartes/${user.roomId}/cities/${id}`));
        if (selectedCity?.id === id) setSelectedCity(null);
    };

    // Toggle visibilité
    const handleToggleVisibility = async (city: City) => {
        if (!user?.roomId || !isMJ) return;
        const newVisibility = !city.visibleToPlayers;
        await updateDoc(doc(db, `cartes/${user.roomId}/cities/${city.id}`), {
            visibleToPlayers: newVisibility,
        });
    };

    // Reset vue
    const resetView = () => {
        setViewScale(1);
        setViewOffset({ x: 0, y: 0 });
    };

    // Upload image de fond
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user?.roomId) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const imageUrl = event.target?.result as string;
            const img = new Image();
            img.onload = async () => {
                setBackgroundImage(img);
                setImageScale({ width: img.width, height: img.height });
                // Sauvegarder dans Firebase
                await setDoc(doc(db, `cartes/${user.roomId}/settings/map`), {
                    backgroundImageUrl: imageUrl,
                    imageWidth: img.width,
                    imageHeight: img.height,
                    showGrid,
                }, { merge: true });
            };
            img.src = imageUrl;
        };
        reader.readAsDataURL(file);
    };

    // Toggle grille et sauvegarder dans Firebase
    const handleToggleGrid = async () => {
        if (!user?.roomId) return;
        const newShowGrid = !showGrid;
        setShowGrid(newShowGrid);
        await setDoc(doc(db, `cartes/${user.roomId}/settings/map`), {
            showGrid: newShowGrid,
        }, { merge: true });
    };

    // 🆕 Upload fond de ville (pour une ville spécifique)
    const handleCityBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const imageUrl = event.target?.result as string;
            setFormData({ ...formData, backgroundUrl: imageUrl });
        };
        reader.readAsDataURL(file);
    };


    return (
        <div className="relative h-full w-full overflow-hidden bg-[#0a0a0a] group">
            {/* Canvas Layer */}
            <div ref={containerRef} className="absolute inset-0 z-0">
                <canvas
                    ref={canvasRef}
                    onClick={handleCanvasClick}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                    className={cn(
                        "w-full h-full block touch-none",
                        isPanning ? "cursor-grabbing" : draggingCity ? "cursor-move" : "cursor-pointer"
                    )}
                />
            </div>

            {/* UI Layer - Top Bar */}
            <div className="absolute top-0 left-0 right-0 z-10 p-4 pointer-events-none">
                <div className="flex items-start justify-between max-w-7xl mx-auto">
                    {/* Title & Stats */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="pointer-events-auto bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2 shadow-2xl"
                    >
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <MapIcon className="w-5 h-5 text-[#c0a080]" />
                            Plan des villes
                            <span className="text-xs font-normal text-white/50 bg-white/10 px-2 py-0.5 rounded-full ml-2">
                                {cities.length}
                            </span>
                        </h2>
                        {isMJ && cities.length > 0 && (
                            <div className="text-xs text-gray-400 mt-1 flex gap-2">
                                <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {cities.filter(c => c.visibleToPlayers).length}</span>
                                <span className="flex items-center gap-1"><EyeOff className="w-3 h-3" /> {cities.filter(c => !c.visibleToPlayers).length}</span>
                            </div>
                        )}
                    </motion.div>

                    {/* Toolbar */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="pointer-events-auto flex gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-2 shadow-2xl"
                    >
                        <div className="flex items-center gap-1 border-r border-white/10 pr-2 mr-1">
                            <Button onClick={() => setViewScale((s) => Math.min(5, s * 1.2))} size="icon" variant="ghost" className="h-8 w-8 text-white/70 hover:text-[#c0a080] hover:bg-white/5">
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                            <Button onClick={() => setViewScale((s) => Math.max(0.1, s / 1.2))} size="icon" variant="ghost" className="h-8 w-8 text-white/70 hover:text-[#c0a080] hover:bg-white/5">
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                            <Button onClick={resetView} size="icon" variant="ghost" className="h-8 w-8 text-white/70 hover:text-[#c0a080] hover:bg-white/5">
                                <Maximize2 className="h-4 w-4" />
                            </Button>
                        </div>

                        <Button
                            onClick={handleToggleGrid}
                            size="icon"
                            variant="ghost"
                            className={cn(
                                "h-8 w-8 transition-colors",
                                showGrid ? "text-[#c0a080] bg-[#c0a080]/10" : "text-white/70 hover:text-[#c0a080] hover:bg-white/5"
                            )}
                            title={showGrid ? "Masquer la grille" : "Afficher la grille"}
                        >
                            <Grid3x3 className="h-4 w-4" />
                        </Button>

                        {isMJ && (
                            <>
                                <div className="w-px h-8 bg-white/10 mx-1" />
                                <Button onClick={() => fileInputRef.current?.click()} size="icon" variant="ghost" className="h-8 w-8 text-white/70 hover:text-[#c0a080] hover:bg-white/5" title="Changer le fond">
                                    <Upload className="h-4 w-4" />
                                </Button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                />
                                <Button onClick={handleAddCity} size="sm" className="bg-[#c0a080] text-black hover:bg-[#d4b594] ml-2 font-medium shadow-lg shadow-[#c0a080]/20">
                                    <Plus className="h-4 w-4 mr-1.5" />
                                    Ajouter
                                </Button>
                            </>
                        )}
                    </motion.div>
                </div>
            </div>

            {/* Selected City Card */}
            <AnimatePresence>
                {selectedCity && (
                    <motion.div
                        initial={{ opacity: 0, x: 20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.95 }}
                        className="absolute top-24 right-4 z-20 w-80 pointer-events-none"
                    >
                        <div className="pointer-events-auto bg-black/80 backdrop-blur-xl border border-[#c0a080]/30 rounded-xl overflow-hidden shadow-2xl">
                            {/* Header Color Strip */}
                            <div className="h-2 w-full" style={{ backgroundColor: selectedCity.color || '#c0a080' }} />

                            <div className="p-5">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center text-3xl border border-white/10 shadow-inner"
                                            style={{ color: selectedCity.color || '#c0a080' }}
                                        >
                                            {selectedCity.icon}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-lg text-white leading-tight">{selectedCity.name}</h4>
                                            <div className="text-xs text-white/40 font-mono mt-0.5">
                                                X: {Math.round(selectedCity.x)} • Y: {Math.round(selectedCity.y)}
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => setSelectedCity(null)}
                                        className="h-6 w-6 text-white/40 hover:text-white -mr-2 -mt-2"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>

                                {selectedCity.description && (
                                    <div className="bg-white/5 rounded-lg p-3 mb-4 border border-white/5">
                                        <p className="text-sm text-gray-300 leading-relaxed">{selectedCity.description}</p>
                                    </div>
                                )}

                                {isMJ && (
                                    <div className="flex gap-2 pt-2 border-t border-white/10">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleToggleVisibility(selectedCity)}
                                            className={cn(
                                                "flex-1 h-8 text-xs font-medium border border-white/10",
                                                selectedCity.visibleToPlayers
                                                    ? "text-green-400 hover:text-green-300 hover:bg-green-400/10"
                                                    : "text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                            )}
                                        >
                                            {selectedCity.visibleToPlayers ? (
                                                <><Eye className="h-3 w-3 mr-1.5" /> Visible</>
                                            ) : (
                                                <><EyeOff className="h-3 w-3 mr-1.5" /> Masqué</>
                                            )}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleEdit(selectedCity)}
                                            className="h-8 w-8 px-0 text-white/70 hover:text-white hover:bg-white/10 border border-white/10"
                                        >
                                            <Edit2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleDelete(selectedCity.id)}
                                            className="h-8 w-8 px-0 text-red-400 hover:text-red-300 hover:bg-red-400/10 border border-white/10"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                )}

                                {/* 🆕 Bouton Entrer dans la ville */}
                                {onCitySelect && (
                                    <Button
                                        onClick={() => onCitySelect(selectedCity.id)}
                                        className="w-full mt-3 bg-[#c0a080] text-black hover:bg-[#d4b594] font-semibold"
                                        size="sm"
                                    >
                                        Entrer dans la ville →
                                    </Button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Hint for navigation */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/5 text-[10px] text-white/40 font-medium uppercase tracking-wider">
                    {isPanning ? "Glisser pour déplacer" : "Molette pour zoomer • Clic molette pour déplacer"}
                </div>
            </div>


            {/* Formulaire */}
            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent className="bg-[#111] border border-white/10 text-white sm:max-w-[425px] shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            {editingId ? <Edit2 className="w-5 h-5 text-[#c0a080]" /> : <Plus className="w-5 h-5 text-[#c0a080]" />}
                            {editingId ? "Modifier la ville" : "Nouvelle ville"}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5 mt-2">
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Nom de la ville</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Ex: Minas Tirith"
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#c0a080]/50 focus:ring-[#c0a080]/20"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description" className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Une brève description..."
                                rows={3}
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-[#c0a080]/50 focus:ring-[#c0a080]/20 resize-none"
                            />
                        </div>

                        <div className="space-y-2 pt-2 border-t border-white/10">
                            <Label className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Fond de carte de la ville</Label>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    onClick={() => cityBackgroundInputRef.current?.click()}
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 border-white/10 text-white/70 hover:text-[#c0a080] hover:bg-white/5"
                                >
                                    <Upload className="h-4 w-4 mr-2" />
                                    {formData.backgroundUrl ? "Changer le fond" : "Uploader un fond"}
                                </Button>
                                {formData.backgroundUrl && (
                                    <Button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, backgroundUrl: "" })}
                                        variant="outline"
                                        size="sm"
                                        className="border-white/10 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                            <input
                                ref={cityBackgroundInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleCityBackgroundUpload}
                                className="hidden"
                            />
                            {formData.backgroundUrl && (
                                <div className="relative w-full h-24 rounded-md overflow-hidden border border-white/10 bg-white/5">
                                    <img src={formData.backgroundUrl} alt="Fond de ville" className="w-full h-full object-cover" />
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Icône</Label>
                                <div className="grid grid-cols-3 gap-2">
                                    {ICONS.map((icon) => (
                                        <button
                                            key={icon}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, icon })}
                                            className={cn(
                                                "h-10 rounded-md flex items-center justify-center text-xl transition-all border",
                                                formData.icon === icon
                                                    ? "bg-[#c0a080] border-[#c0a080] text-black scale-105 shadow-lg shadow-[#c0a080]/20"
                                                    : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20"
                                            )}
                                        >
                                            {icon}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Couleur</Label>
                                <div className="grid grid-cols-3 gap-2">
                                    {COLORS.map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, color })}
                                            className={cn(
                                                "h-10 rounded-md transition-all border relative overflow-hidden",
                                                formData.color === color
                                                    ? "border-white scale-105 shadow-lg"
                                                    : "border-transparent opacity-70 hover:opacity-100"
                                            )}
                                            style={{ backgroundColor: color }}
                                        >
                                            {formData.color === color && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                                    <div className="w-2 h-2 bg-white rounded-full shadow-sm" />
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-white/10">
                            <Label className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Visibilité</Label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, visibleToPlayers: true })}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 h-9 rounded-md text-sm font-medium transition-colors border",
                                        formData.visibleToPlayers
                                            ? "bg-green-500/20 border-green-500/50 text-green-400"
                                            : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                                    )}
                                >
                                    <Eye className="h-4 w-4" />
                                    Visible
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, visibleToPlayers: false })}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 h-9 rounded-md text-sm font-medium transition-colors border",
                                        !formData.visibleToPlayers
                                            ? "bg-red-500/20 border-red-500/50 text-red-400"
                                            : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                                    )}
                                >
                                    <EyeOff className="h-4 w-4" />
                                    Masqué
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <Button
                                onClick={() => setShowForm(false)}
                                variant="ghost"
                                className="flex-1 text-white/60 hover:text-white hover:bg-white/5"
                            >
                                Annuler
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={!formData.name.trim()}
                                className="flex-1 bg-[#c0a080] text-black hover:bg-[#d4b594] font-semibold"
                            >
                                {editingId ? "Enregistrer" : "Créer la ville"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

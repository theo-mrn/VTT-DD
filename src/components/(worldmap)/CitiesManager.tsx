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
import { Trash2, Edit2, Plus, ZoomIn, ZoomOut, Maximize2, Upload, Grid3x3, Eye, EyeOff } from "lucide-react";

interface City {
    id: string;
    name: string;
    x: number;
    y: number;
    description?: string;
    icon?: string;
    color?: string;
    visibleToPlayers?: boolean;
}

const ICONS = ["🏰", "🏛️", "🏘️", "⛪", "🗼", "🏯"];
const COLORS = ["#c0a080", "#8B4513", "#4169E1", "#228B22", "#DC143C", "#9370DB"];

export default function CitiesManager() {
    const { user, isMJ } = useGame();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [cities, setCities] = useState<City[]>([]);
    const [selectedCity, setSelectedCity] = useState<City | null>(null);

    // Formulaire
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ name: "", description: "", icon: ICONS[0], color: COLORS[0], x: 0, y: 0, visibleToPlayers: true });
    const [editingId, setEditingId] = useState<string | null>(null);

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
        setFormData({ name: "", description: "", icon: ICONS[0], color: COLORS[0], x: 500, y: 400, visibleToPlayers: true });
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
        setFormData({ name: "", description: "", icon: ICONS[0], color: COLORS[0], x: 0, y: 0, visibleToPlayers: true });
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

    return (
        <div className="relative h-full p-4">
            {/* Canvas */}
            <div className="h-full flex flex-col">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-semibold text-white">
                        Plan des villes ({cities.length})
                        {isMJ && cities.length > 0 && (
                            <span className="text-sm text-gray-400 ml-2">
                                ({cities.filter(c => c.visibleToPlayers).length} visibles / {cities.filter(c => !c.visibleToPlayers).length} masquées)
                            </span>
                        )}
                    </h2>
                    <div className="flex gap-2">
                        <Button onClick={() => setViewScale((s) => Math.min(5, s * 1.2))} size="sm" variant="outline" className="border-[#c0a080] text-[#c0a080] hover:bg-[#c0a080] hover:text-black">
                            <ZoomIn className="h-4 w-4" />
                        </Button>
                        <Button onClick={() => setViewScale((s) => Math.max(0.1, s / 1.2))} size="sm" variant="outline" className="border-[#c0a080] text-[#c0a080] hover:bg-[#c0a080] hover:text-black">
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <Button onClick={resetView} size="sm" variant="outline" className="border-[#c0a080] text-[#c0a080] hover:bg-[#c0a080] hover:text-black">
                            <Maximize2 className="h-4 w-4" />
                        </Button>
                        <Button
                            onClick={handleToggleGrid}
                            size="sm"
                            variant={showGrid ? "default" : "outline"}
                            className={showGrid ? "bg-[#c0a080] text-black hover:bg-[#d4b594]" : "border-[#c0a080] text-[#c0a080] hover:bg-[#c0a080] hover:text-black"}
                            title={showGrid ? "Masquer la grille" : "Afficher la grille"}
                        >
                            <Grid3x3 className="h-4 w-4" />
                        </Button>
                        {isMJ && (
                            <>
                                <Button onClick={() => fileInputRef.current?.click()} size="sm" variant="outline" className="border-[#c0a080] text-[#c0a080] hover:bg-[#c0a080] hover:text-black">
                                    <Upload className="h-4 w-4" />
                                </Button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                />
                                <Button onClick={handleAddCity} size="sm" className="bg-[#c0a080] text-black hover:bg-[#d4b594]">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Ajouter
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                <div ref={containerRef} className="flex-1 min-h-0 relative">
                    <canvas
                        ref={canvasRef}
                        onClick={handleCanvasClick}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onWheel={handleWheel}
                        className={`w-full h-full border border-gray-700 rounded-lg bg-[#1a1a1a] ${isPanning ? "cursor-grabbing" : draggingCity ? "cursor-move" : "cursor-pointer"
                            }`}
                    />

                    {/* Popup ville sélectionnée */}
                    {selectedCity && (
                        <div className="absolute top-4 right-4 p-4 bg-[#2a2a2a] border border-[#c0a080] rounded-lg shadow-lg max-w-sm">
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-3xl">{selectedCity.icon}</span>
                                    <h4 className="font-semibold text-white">{selectedCity.name}</h4>
                                </div>
                                <div className="flex gap-1">
                                    {isMJ && (
                                        <>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleToggleVisibility(selectedCity)}
                                                title={selectedCity.visibleToPlayers ? "Masquer aux joueurs" : "Montrer aux joueurs"}
                                                className="text-[#c0a080] hover:bg-[#c0a080] hover:text-black"
                                            >
                                                {selectedCity.visibleToPlayers ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => handleEdit(selectedCity)} className="text-[#c0a080] hover:bg-[#c0a080] hover:text-black">
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleDelete(selectedCity.id)}
                                                className="text-red-500 hover:bg-red-500 hover:text-white"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </>
                                    )}
                                    <Button size="sm" variant="ghost" onClick={() => setSelectedCity(null)} className="text-[#c0a080] hover:bg-[#c0a080] hover:text-black">
                                        ✕
                                    </Button>
                                </div>
                            </div>
                            {selectedCity.description && (
                                <p className="text-sm text-gray-400">{selectedCity.description}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Formulaire */}
            <Dialog open={showForm} onOpenChange={setShowForm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingId ? "Modifier" : "Nouvelle"} ville</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nom *</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Nom de la ville"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Description..."
                                rows={3}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Icône</Label>
                            <div className="flex gap-2">
                                {ICONS.map((icon) => (
                                    <Button
                                        key={icon}
                                        type="button"
                                        variant={formData.icon === icon ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setFormData({ ...formData, icon })}
                                        className="text-xl"
                                    >
                                        {icon}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Couleur</Label>
                            <div className="flex gap-2">
                                {COLORS.map((color) => (
                                    <Button
                                        key={color}
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setFormData({ ...formData, color })}
                                        className={`w-10 h-10 p-0 ${formData.color === color ? "ring-2 ring-white" : ""}`}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Visibilité</Label>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant={formData.visibleToPlayers ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setFormData({ ...formData, visibleToPlayers: true })}
                                    className="flex-1"
                                >
                                    <Eye className="h-4 w-4 mr-2" />
                                    Visible aux joueurs
                                </Button>
                                <Button
                                    type="button"
                                    variant={!formData.visibleToPlayers ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setFormData({ ...formData, visibleToPlayers: false })}
                                    className="flex-1"
                                >
                                    <EyeOff className="h-4 w-4 mr-2" />
                                    Masqué (MJ seulement)
                                </Button>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => setShowForm(false)} variant="outline" className="flex-1">
                                Annuler
                            </Button>
                            <Button onClick={handleSave} disabled={!formData.name.trim()} className="flex-1">
                                {editingId ? "Modifier" : "Créer"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, ArrowRightLeft } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LootInteraction, LootItem, Character } from '@/app/[roomid]/map/types';
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { v4 as uuidv4 } from 'uuid';
import { Pencil, Save, Plus, Trash2, ImageIcon, Search } from 'lucide-react';
import { db } from '@/lib/firebase';
import AddItemDialog from '@/components/(dialogs)/AddItemDialog';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore'; // Firebase imports
import { toast } from 'sonner';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    DragStartEvent,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface LootComponentProps {
    isOpen: boolean;
    onClose: () => void;
    interaction: LootInteraction;
    character?: Character; // The character looting (optional for GM editing or when opening MapObject)
    isMJ?: boolean;
    roomId: string; // Required for Firebase access
    onUpdateInteraction?: (interaction: LootInteraction) => void;
}

// Interface matching Firestore Inventory structure
interface InventoryItem {
    id: string;
    message: string; // name
    category: string;
    quantity: number;
    diceSelection?: string;
    visibility?: string;
    weight?: number;
    bonusTypes?: any;
}

export default function LootComponent({
    isOpen,
    onClose,
    interaction,
    character,
    isMJ,
    roomId,
    onUpdateInteraction
}: LootComponentProps) {
    // State for local items (container) and character items (inventory)
    // In a real app, 'containerItems' would sync with interaction.items via a DB update
    const [containerItems, setContainerItems] = useState<LootItem[]>(interaction.items);
    const [characterItems, setCharacterItems] = useState<LootItem[]>([]); // Default empty, populated by useEffect
    const [inventoryRawItems, setInventoryRawItems] = useState<InventoryItem[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [isEditMode, setIsEditMode] = useState(false);

    // GM Add Item State
    const [newItemName, setNewItemName] = useState("");
    const [newItemDesc, setNewItemDesc] = useState("");
    const [newItemQty, setNewItemQty] = useState(1);

    // Linked ID State for Edit Mode (Now just simple toggle)
    const isShared = interaction.linkedId === "global";

    // Catalog State
    const [isCatalogOpen, setIsCatalogOpen] = useState(false);

    // Sync container items with interaction prop change (ONLY if not linked)
    useEffect(() => {
        if (!interaction.linkedId) {
            setContainerItems(interaction.items);
        }
    }, [interaction.items, interaction.linkedId]);

    // SHARED CONTAINER SYNC
    useEffect(() => {
        if (!roomId || !interaction.linkedId) return;

        const sharedRef = collection(db, `Inventaire/${roomId}/shared_${interaction.linkedId}`);

        const unsubscribe = onSnapshot(sharedRef, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));

            // Map to LootItem format for display
            const mappedItems: LootItem[] = items.map(invItem => ({
                id: invItem.id,
                name: invItem.message,
                quantity: invItem.quantity,
                description: invItem.category || "",
                weight: invItem.weight || 0,
                image: "",
                category: invItem.category,
                diceSelection: invItem.diceSelection,
                visibility: invItem.visibility,
                bonusTypes: invItem.bonusTypes
            }));
            setContainerItems(mappedItems);
        });

        return () => unsubscribe();
    }, [roomId, interaction.linkedId]);

    // REAL INVENTORY SYNC
    useEffect(() => {
        if (!roomId || !character?.name) return;

        const inventoryRef = collection(db, `Inventaire/${roomId}/${character.name}`);

        const unsubscribe = onSnapshot(inventoryRef, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
            setInventoryRawItems(items);

            // Map to LootItem format for display
            const mappedItems: LootItem[] = items.map(invItem => ({
                id: invItem.id,
                name: invItem.message,
                quantity: invItem.quantity,
                description: invItem.category || "",
                weight: invItem.weight || 0,
                image: "", // Inventory items don't have images yet
                category: invItem.category,
                diceSelection: invItem.diceSelection,
                visibility: invItem.visibility,
                bonusTypes: invItem.bonusTypes
            }));
            setCharacterItems(mappedItems);
        });

        return () => unsubscribe();
    }, [roomId, character?.name]);

    // Handlers for Edit Mode
    const handleUpdateName = (name: string) => {
        onUpdateInteraction?.({ ...interaction, name });
    };

    const handleToggleShared = (checked: boolean) => {
        const updatedInteraction = { ...interaction };
        if (checked) {
            updatedInteraction.linkedId = "global";
        } else {
            // Use delete or set to null if schema permits, but undefined breaks Firestore
            // Ideally we want to remove the field, but we can't delete from interaction prop directly (it's immutable-ish).
            // We are creating a copy.
            delete updatedInteraction.linkedId;
        }
        onUpdateInteraction?.(updatedInteraction);
    };

    const handleAddItem = async () => {
        // Local logic
        if (!interaction.linkedId) {
            const newItem: LootItem = {
                id: uuidv4(),
                name: "Nouvel Objet",
                quantity: 1,
                description: "",
                image: ""
            };
            const newItems = [...interaction.items, newItem];
            setContainerItems(newItems);
            onUpdateInteraction?.({ ...interaction, items: newItems });
        } else {
            // Shared logic
            const sharedRef = collection(db, `Inventaire/${roomId}/shared_${interaction.linkedId}`);
            await addDoc(sharedRef, {
                message: "Nouvel Objet",
                quantity: 1,
                category: "autre",
                weight: 0,
                bonusTypes: {},
                visibility: 'public'
            });
        }
    };

    const handleUpdateItem = async (itemId: string, field: keyof LootItem, value: string | number) => {
        if (!interaction.linkedId) {
            const updatedItems = interaction.items.map(item =>
                item.id === itemId ? { ...item, [field]: value } : item
            );
            setContainerItems(updatedItems);
            onUpdateInteraction?.({ ...interaction, items: updatedItems });
        } else {
            // Shared logic - find the doc and update
            // Mapping LootItem fields to InventoryItem fields
            // name -> message, description -> category (simplified mapping)
            const sharedRef = doc(db, `Inventaire/${roomId}/shared_${interaction.linkedId}/${itemId}`);
            const updateData: any = {};
            if (field === 'name') updateData.message = value;
            else if (field === 'quantity') updateData.quantity = value;
            else if (field === 'description') updateData.category = value; // simple mapping
            // Note: Changing other fields not supported in this simple view efficiently yet

            if (Object.keys(updateData).length > 0) {
                await updateDoc(sharedRef, updateData);
            }
        }
    };

    const handleDeleteItem = async (itemId: string) => {
        if (!interaction.linkedId) {
            const updatedItems = interaction.items.filter(item => item.id !== itemId);
            setContainerItems(updatedItems);
            onUpdateInteraction?.({ ...interaction, items: updatedItems });
        } else {
            const sharedRef = doc(db, `Inventaire/${roomId}/shared_${interaction.linkedId}/${itemId}`);
            await deleteDoc(sharedRef);
        }
    };

    const handleGMAddItem = async () => {
        if (!newItemName) return;

        await addItemLogic(newItemName, newItemDesc, newItemQty);

        // Reset form
        setNewItemName("");
        setNewItemDesc("");
        setNewItemQty(1);
        toast.success("Objet ajouté au butin");
    };

    const handleCatalogAdd = async (item: { name: string, category: string, quantity: number, weight: number }) => {
        await addItemLogic(item.name, item.category, item.quantity, item.weight);
        toast.success(`${item.quantity} ${item.name} ajouté(s)`);
    };

    const addItemLogic = async (name: string, description: string, quantity: number, weight: number = 0) => {
        if (!interaction.linkedId) {
            const newItem: LootItem = {
                id: uuidv4(),
                name: name,
                quantity: quantity,
                description: description,
                image: "", // Catalog items don't provide images yet but we could look them up
                weight: weight,
                category: description // using description as category for local items mostly
            };
            const updatedItems = [...interaction.items, newItem];
            setContainerItems(updatedItems);
            onUpdateInteraction?.({ ...interaction, items: updatedItems });
        } else {
            const sharedRef = collection(db, `Inventaire/${roomId}/shared_${interaction.linkedId}`);
            // Check for existing item to stack? Firestore logic usually adds new doc unless we query first.
            // For simplicity and speed in catalog add, we'll just add. Stacking logic is complex blindly.
            await addDoc(sharedRef, {
                message: name,
                quantity: quantity,
                category: description || "autre",
                weight: weight,
                bonusTypes: {},
                visibility: 'public'
            });
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        console.log("Drag End:", { active, over });

        if (!over) return;

        const activeIdStr = active.id as string;
        const overIdStr = over.id as string;

        // Find source and destination
        const isFromContainer = containerItems.find(i => i.id === activeIdStr);
        const isFromCharacter = characterItems.find(i => i.id === activeIdStr);

        console.log("Source check:", {
            activeIdStr,
            overIdStr,
            isFromContainer: !!isFromContainer,
            isFromCharacter: !!isFromCharacter,
            containerItem: isFromContainer
        });

        // Determine target zone
        const isOverContainer = overIdStr === 'container-droppable' || containerItems.some(i => i.id === overIdStr);
        const isOverCharacter = overIdStr === 'character-droppable' || characterItems.some(i => i.id === overIdStr);

        console.log("Target Detection:", {
            overIdStr,
            isOverContainer,
            isOverCharacter
        });

        // Dropped on Container Area (Character -> Container)
        if (isOverContainer && isFromCharacter) {
            console.log("Action: Character -> Container");
            try {
                // 1. Remove one unit from Character Inventory (Frontend Optimistic Update somewhat managed by realtime listener, but let's be explicit)
                // Need to find the raw inventory item to update/delete
                const rawItem = inventoryRawItems.find(i => i.id === activeIdStr);
                console.log("Raw item found:", rawItem);

                if (rawItem && character) {
                    const itemRef = doc(db, `Inventaire/${roomId}/${character.name}/${rawItem.id}`);
                    if (rawItem.quantity > 1) {
                        await updateDoc(itemRef, { quantity: rawItem.quantity - 1 });
                    } else {
                        await deleteDoc(itemRef);
                    }
                }

                // 2. Add to Container Interaction
                if (!interaction.linkedId) {
                    // Local Logic
                    const existingContainerItem = containerItems.find(i => i.name === isFromCharacter.name);
                    let newContainerItems = [...containerItems];

                    if (existingContainerItem) {
                        newContainerItems = containerItems.map(i =>
                            i.id === existingContainerItem.id ? { ...i, quantity: i.quantity + 1 } : i
                        );
                    } else {
                        const newItem: LootItem = {
                            id: uuidv4(),
                            name: isFromCharacter.name,
                            quantity: 1,
                            description: isFromCharacter.description || "",
                            image: isFromCharacter.image || "",
                            weight: isFromCharacter.weight || 0,
                            category: isFromCharacter.category,
                            diceSelection: isFromCharacter.diceSelection,
                            visibility: isFromCharacter.visibility,
                            bonusTypes: isFromCharacter.bonusTypes
                        };
                        newContainerItems.push(newItem);
                    }

                    console.log('📦 [LOOTCOMPONENT DEBUG] Calling onUpdateInteraction for MapObject with items:', newContainerItems.length);
                    onUpdateInteraction?.({ ...interaction, items: newContainerItems });
                } else {
                    // Shared Logic
                    // Check if item exists in shared collection
                    // We need to query by 'message' (name)
                    const sharedRef = collection(db, `Inventaire/${roomId}/shared_${interaction.linkedId}`);
                    // Since specific query might be async and tricky inside drop, we can check 'containerItems' which is synced
                    // 'containerItems' has correct 'name' mapped from 'message'
                    const existingItem = containerItems.find(i => i.name === isFromCharacter.name);

                    if (existingItem) {
                        const docRef = doc(db, `Inventaire/${roomId}/shared_${interaction.linkedId}/${existingItem.id}`);
                        await updateDoc(docRef, { quantity: existingItem.quantity + 1 });
                    } else {
                        await addDoc(sharedRef, {
                            message: isFromCharacter.name,
                            category: isFromCharacter.category || "autre",
                            quantity: 1,
                            weight: isFromCharacter.weight || 0,
                            bonusTypes: isFromCharacter.bonusTypes || {},
                            diceSelection: isFromCharacter.diceSelection || null,
                            visibility: isFromCharacter.visibility || 'public'
                        });
                    }
                }

                toast.success(`1 ${isFromCharacter.name} déposé dans ${interaction.name}`);

            } catch (e) {
                console.error("Error moving to container", e);
                toast.error("Erreur lors du transfert vers le contenant");
            }
        }
        // Dropped on Character Area (Container -> Character)
        else if (isOverCharacter && isFromContainer) {
            console.log("Action: Container -> Character");
            try {
                // 1. Remove one unit from Container
                if (!interaction.linkedId) {
                    // Local logic
                    let newContainerItems = [...containerItems];
                    const itemInContainer = containerItems.find(i => i.id === activeIdStr);
                    if (!itemInContainer) return;

                    if (itemInContainer.quantity > 1) {
                        newContainerItems = containerItems.map(i =>
                            i.id === activeIdStr ? { ...i, quantity: i.quantity - 1 } : i
                        );
                    } else {
                        newContainerItems = containerItems.filter(i => i.id !== activeIdStr);
                    }
                    onUpdateInteraction?.({ ...interaction, items: newContainerItems });
                } else {
                    // Shared Logic
                    const itemInContainer = containerItems.find(i => i.id === activeIdStr);
                    if (!itemInContainer) return;

                    const docRef = doc(db, `Inventaire/${roomId}/shared_${interaction.linkedId}/${activeIdStr}`);
                    if (itemInContainer.quantity > 1) {
                        await updateDoc(docRef, { quantity: itemInContainer.quantity - 1 });
                    } else {
                        await deleteDoc(docRef);
                    }
                }

                // 2. Add to Character Inventory (Firestore)
                if (character) {
                    // Check if item exists in inventory (by name and category preferably, but name is key here)
                    console.log("Checking inventory for existing item:", isFromContainer.name);
                    console.log("Inventory raw items:", inventoryRawItems);

                    const existingInvItem = inventoryRawItems.find(i => i.message === isFromContainer.name);
                    const inventoryRef = collection(db, `Inventaire/${roomId}/${character.name}`);

                    if (existingInvItem) {
                        console.log("Existing item found, incrementing quantity", existingInvItem);
                        const itemRef = doc(inventoryRef, existingInvItem.id);
                        await updateDoc(itemRef, { quantity: existingInvItem.quantity + 1 });
                    } else {
                        console.log("Creating new item in inventory");
                        // Create new item
                        // Default values AND preserved values from LootItem
                        const newItemData = {
                            message: isFromContainer.name || "Objet sans nom",
                            category: isFromContainer.category || "autre",
                            quantity: 1,
                            bonusTypes: isFromContainer.bonusTypes || {},
                            diceSelection: isFromContainer.diceSelection || null,
                            visibility: isFromContainer.visibility || 'public',
                            weight: isFromContainer.weight || 0
                        };
                        console.log("New item data:", newItemData);
                        await addDoc(inventoryRef, newItemData);
                    }
                    toast.success(`1 ${isFromContainer.name} ramassé`);
                }
            } catch (e) {
                console.error("Error looting item", e);
                toast.error("Erreur lors du ramassage");
            }
        }
    };

    if (!isOpen) return null;

    const draggedItem =
        containerItems.find(i => i.id === activeId) ||
        characterItems.find(i => i.id === activeId);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-5xl bg-[#1a1a1a] border border-[#333] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[700px]"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-white/5 bg-[#1a1a1a] flex justify-between items-center">
                            <div className="flex items-center gap-3 flex-1">
                                <div className="p-2 bg-amber-900/20 rounded-lg text-amber-500">
                                    <Package size={24} />
                                </div>
                                <div className="flex-1">
                                    {isEditMode ? (
                                        <div className="flex flex-col gap-2 w-full max-w-md">
                                            <Input
                                                value={interaction.name}
                                                onChange={(e) => handleUpdateName(e.target.value)}
                                                className="bg-[#111] border-[#333] text-xl font-bold text-white mb-1"
                                                placeholder="Nom du butin"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-4">
                                            <h2 className="text-2xl font-bold text-white font-serif">{interaction.name}</h2>
                                            {isMJ && (
                                                <div className="flex items-center gap-2 bg-[#222] px-3 py-1 rounded-full border border-[#333]">
                                                    <Switch
                                                        id="shared-mode-header"
                                                        checked={isShared}
                                                        onCheckedChange={handleToggleShared}
                                                        className="scale-75 data-[state=checked]:bg-amber-600"
                                                    />
                                                    <Label htmlFor="shared-mode-header" className="text-[10px] text-gray-400 uppercase font-bold tracking-wider cursor-pointer select-none">
                                                        {isShared ? "Partagé (Global)" : "Local"}
                                                    </Label>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <p className="text-sm text-gray-400">Fouille en cours...</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {isMJ && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setIsEditMode(!isEditMode)}
                                        className={`${isEditMode ? 'text-amber-500 bg-amber-900/20' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        {isEditMode ? <Save size={18} /> : <Pencil size={18} />}
                                    </Button>
                                )}
                                <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white">
                                    <X size={24} />
                                </Button>
                            </div>
                        </div>

                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                        >
                            <div className="flex flex-1 overflow-hidden">
                                {/* Left: Container */}
                                <div className="flex-1 flex flex-col bg-[#161616] p-4 border-r border-[#333]">
                                    <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                                        <Package className="text-amber-600" size={18} />
                                        Contenu
                                    </h3>
                                    {isEditMode ? (
                                        <div className="flex-1 bg-[#0f0f0f] rounded-xl p-3 overflow-y-auto border border-[#333] min-h-[200px] space-y-2">
                                            {interaction.items.map((item) => (
                                                <div key={item.id} className="flex flex-col gap-2 p-3 bg-[#202020] rounded-lg border border-white/5">
                                                    <div className="flex gap-2">
                                                        <Input
                                                            value={item.name}
                                                            onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                                                            className="flex-1 h-8 bg-[#151515] border-[#333] text-sm"
                                                            placeholder="Nom"
                                                        />
                                                        <Input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={(e) => handleUpdateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                                                            className="w-20 h-8 bg-[#151515] border-[#333] text-sm"
                                                            placeholder="Qté"
                                                        />
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8 text-red-500 hover:bg-red-900/20"
                                                            onClick={() => handleDeleteItem(item.id)}
                                                        >
                                                            <Trash2 size={16} />
                                                        </Button>
                                                    </div>
                                                    <Input
                                                        value={item.description || ""}
                                                        onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                                                        className="h-8 bg-[#151515] border-[#333] text-xs text-gray-400"
                                                        placeholder="Description..."
                                                    />
                                                </div>
                                            ))}
                                            <Button
                                                variant="outline"
                                                className="w-full border-dashed border-[#444] text-gray-500 hover:text-amber-500 hover:border-amber-500/50 h-10 text-sm"
                                                onClick={handleAddItem}
                                            >
                                                <Plus size={14} className="mr-2" /> Ajouter un objet
                                            </Button>
                                        </div>
                                    ) : (
                                        <SortableList id="container-droppable" items={containerItems} />
                                    )}
                                </div>

                                {/* Center: Action Area (Visual separator) */}
                                <div className="w-12 bg-[#111] flex flex-col items-center justify-center border-x border-[#333] text-gray-600">
                                    <ArrowRightLeft size={20} />
                                </div>

                                {/* Right: Character Inventory or GM Tools */}
                                <div className="flex-1 flex flex-col bg-[#1a1a1a] p-4">
                                    {isMJ ? (
                                        <div className="flex flex-col h-full">
                                            <h3 className="text-lg font-bold text-amber-500 mb-4 flex items-center gap-2">
                                                <Plus size={18} />
                                                Ajouter au butin
                                            </h3>
                                            <div className="bg-[#202020] p-4 rounded-xl border border-[#333] space-y-4">
                                                <Button
                                                    onClick={() => setIsCatalogOpen(true)}
                                                    className="w-full bg-amber-600 hover:bg-amber-700 text-white h-12 text-lg font-medium shadow-lg shadow-amber-900/20"
                                                >
                                                    <Search size={20} className="mr-2" />
                                                    Ouvrir le Catalogue
                                                </Button>

                                                <div className="relative flex items-center py-2">
                                                    <div className="flex-grow border-t border-[#333]"></div>
                                                    <span className="flex-shrink-0 mx-4 text-gray-500 text-xs uppercase tracking-wider">Ou ajout manuel</span>
                                                    <div className="flex-grow border-t border-[#333]"></div>
                                                </div>

                                                <div className="space-y-3 bg-[#1a1a1a] p-3 rounded-lg border border-[#333]">
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-medium text-gray-400 uppercase">Nom de l'objet</label>
                                                        <Input
                                                            value={newItemName}
                                                            onChange={(e) => setNewItemName(e.target.value)}
                                                            placeholder="Ex: Épée longue"
                                                            className="bg-[#151515] border-[#333]"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-medium text-gray-400 uppercase">Quantité</label>
                                                        <Input
                                                            type="number"
                                                            value={newItemQty}
                                                            onChange={(e) => setNewItemQty(parseInt(e.target.value) || 1)}
                                                            className="bg-[#151515] border-[#333]"
                                                            min={1}
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-medium text-gray-400 uppercase">Description (Optionnel)</label>
                                                        <Input
                                                            value={newItemDesc}
                                                            onChange={(e) => setNewItemDesc(e.target.value)}
                                                            placeholder="Ex: Une vieille lame rouillée..."
                                                            className="bg-[#151515] border-[#333]"
                                                        />
                                                    </div>
                                                    <Button
                                                        onClick={handleGMAddItem}
                                                        disabled={!newItemName}
                                                        variant="ghost"
                                                        className="w-full text-gray-400 hover:text-white hover:bg-[#333] border border-dashed border-[#444] mt-2"
                                                    >
                                                        <Plus size={16} className="mr-2" />
                                                        Ajouter manuellement
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="mt-4 p-4 rounded-lg bg-blue-900/20 text-blue-200 text-sm border border-blue-900/40">
                                                <div className="flex items-start gap-2">
                                                    <div className="shrink-0 mt-0.5 w-4 h-4 bg-blue-400 rounded-full flex items-center justify-center text-[10px] text-black font-bold">i</div>
                                                    En tant que MJ, vous voyez ce panneau pour gérer facilement le contenu du butin. Les joueurs verront leur propre inventaire ici.
                                                </div>
                                            </div>
                                        </div>
                                    ) : character ? (
                                        <>
                                            <h3 className="text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                                                <img src={typeof character.image === 'string' ? character.image : character.image?.src} className="w-6 h-6 rounded-full border border-gray-600" alt="" />
                                                Inventaire de {character.name}
                                            </h3>
                                            <SortableList id="character-droppable" items={characterItems} />
                                        </>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-gray-400 italic">
                                            <Package size={32} className="mb-2 opacity-50" />
                                            <p>Aucun personnage sélectionné</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <DragOverlay>
                                {activeId && draggedItem ? (
                                    <ItemCard item={draggedItem} overlay />
                                ) : null}
                            </DragOverlay>
                        </DndContext>

                        <AddItemDialog
                            isOpen={isCatalogOpen}
                            onOpenChange={setIsCatalogOpen}
                            onAdd={handleCatalogAdd}
                        />
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

// Sub-components

interface SortableListProps {
    id: string;
    items: LootItem[];
}

function SortableList({ id, items }: SortableListProps) {
    const { setNodeRef } = useSortable({ id });

    return (
        <div ref={setNodeRef} className="flex-1 bg-[#0f0f0f] rounded-xl p-3 overflow-y-auto border border-[#333] min-h-[200px]">
            <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 gap-2">
                    {items.map((item) => (
                        <SortableItem key={item.id} item={item} />
                    ))}
                    {items.length === 0 && (
                        <div className="h-20 flex items-center justify-center text-gray-600 italic text-sm">
                            Vide
                        </div>
                    )}
                </div>
            </SortableContext>
        </div>
    );
}

interface SortableItemProps {
    item: LootItem;
}

function SortableItem({ item }: SortableItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: item.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <ItemCard item={item} />
        </div>
    );
}

function ItemCard({ item, overlay }: { item: LootItem, overlay?: boolean }) {
    return (
        <div className={`
            flex items-center gap-3 p-3 rounded-lg border 
            ${overlay ? 'bg-[#252525] border-amber-500 shadow-xl scale-105 cursor-grabbing' : 'bg-[#202020] border-white/5 hover:bg-[#252525] hover:border-white/10 cursor-grab'}
            transition-all select-none
        `}>
            <div className="w-10 h-10 rounded bg-[#151515] border border-white/5 flex items-center justify-center overflow-hidden shrink-0 text-amber-700/50">
                {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                    <Package size={16} />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                    <span className="font-medium text-gray-200 text-sm truncate">{item.name}</span>
                    <Badge variant="secondary" className="bg-black/40 text-gray-400 text-xs hover:bg-black/60">x{item.quantity}</Badge>
                </div>
                {item.description && (
                    <p className="text-xs text-gray-500 truncate">{item.description}</p>
                )}
            </div>
        </div>
    );
}

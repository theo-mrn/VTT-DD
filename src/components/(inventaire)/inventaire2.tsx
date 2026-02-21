'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, Plus, Sword, Target, Shield, Beaker, ChevronRight, Coins, Apple, X, ArrowUpDown, MinusCircle, PlusCircle } from 'lucide-react';
import { db, doc, collection, onSnapshot, getDoc, updateDoc, setDoc, deleteDoc, addDoc } from '@/lib/firebase';
import { toast } from 'sonner';

interface InventoryItem {
  id: string;
  message: string;
  category: string;
  quantity: number;
  diceSelection?: string;
  visibility?: string;
  weight?: number;
}

interface Bonus {
  type: string;
  value: number;
}

interface InventoryManagementProps {
  playerName: string;
  roomId: string;
  canEdit?: boolean;
  onHeightChange?: (height: number) => void;
  style?: React.CSSProperties;
}

interface ItemDescription {
  name: string;
  description: string;
}

const predefinedItems: Record<string, string[]> = {
  'armes-contact': ['Épée à une main', 'Épée à deux mains', 'Épée longue', 'Katana', 'Rapière', 'Hache', 'Marteau'],
  'armes-distance': ['Arc léger', 'Arc lourd', 'Arbalète', 'Couteaux de lancer'],
  'armures': ['Armure légère', 'Armure de cuir', 'Armure lourde', 'Côte de maille'],
  'potions': ['Petite potion de vie', 'Grande potion de vie', 'Fortifiant', 'Potion de dégat'],
  'bourse': ["pièce d'OR", "pièce d'argent", "pièce de cuivre"],
  'nourriture': ['Pomme', 'Pain', 'Fromage', 'Champignon', 'Pomme de terre', 'viande', 'Minotaure'],
  'autre': []
};

const statAttributes = ["CON", "SAG", "DEX", "FOR", "CHA", "INT", "PV", "Defense", "INIT", "Contact", "Distance", "Magie"];
const categoryIcons: Record<string, React.ReactNode> = {
  'armes-contact': <Sword className="w-6 h-6 text-[#c0a080]" />,
  'armes-distance': <Target className="w-6 h-6 text-[#c0a080]" />,
  'armures': <Shield className="w-6 h-6 text-[#c0a080]" />,
  'potions': <Beaker className="w-6 h-6 text-[#c0a080]" />,
  'bourse': <Coins className="w-6 h-6 text-[#c0a080]" />,
  'nourriture': <Apple className="w-6 h-6 text-[#c0a080]" />,
  'autre': <ChevronRight className="w-6 h-6 text-[#c0a080]" />,
};

export default function InventoryManagement({ playerName, roomId, canEdit = true, onHeightChange, style }: InventoryManagementProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [dialogSearchTerm, setDialogSearchTerm] = useState<string>('');
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState<boolean>(false);
  const [currentCategory, setCurrentCategory] = useState<string>('all');
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState<boolean>(false);
  const [isBonusDialogOpen, setIsBonusDialogOpen] = useState<boolean>(false);
  const [isDiceDialogOpen, setIsDiceDialogOpen] = useState<boolean>(false);
  const [isQuantityDialogOpen, setIsQuantityDialogOpen] = useState<boolean>(false);
  const [currentItem, setCurrentItem] = useState<InventoryItem | null>(null);
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemQuantity, setNewItemQuantity] = useState<number>(1);
  const [bonusType, setBonusType] = useState<string>('');
  const [bonusValue, setBonusValue] = useState<string>('');
  const [diceCount, setDiceCount] = useState<number>(1);
  const [diceFaces, setDiceFaces] = useState<number>(6);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [bonusesMap, setBonusesMap] = useState<Record<string, Bonus[]>>({});
  const [itemDescriptions, setItemDescriptions] = useState<Record<string, ItemDescription>>({});
  const [sortBy, setSortBy] = useState<string>('category');
  const [bonusActiveMap, setBonusActiveMap] = useState<Record<string, boolean>>({});
  const [itemsWithBonus, setItemsWithBonus] = useState<Set<string>>(new Set());

  const inventoryRef = collection(db, `Inventaire/${roomId}/${playerName}`);

  // Charger les descriptions des objets depuis Items.json
  useEffect(() => {
    const loadItemDescriptions = async () => {
      try {
        const response = await fetch('/tabs/Items.json');
        const data = await response.json();

        const descriptions: Record<string, ItemDescription> = {};

        // Parcourir les données et créer un mapping nom -> description
        for (let i = 1; i <= 21; i++) {
          const name = data[`Affichage${i}`];
          const description = data[`rang${i}`];
          if (name && description) {
            descriptions[name.toLowerCase()] = { name, description };
          }
        }

        setItemDescriptions(descriptions);
      } catch (error) {
        console.error('Erreur lors du chargement des descriptions:', error);
      }
    };

    loadItemDescriptions();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(inventoryRef, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setInventory(items);
    });
    return () => unsubscribe();
  }, [playerName, roomId]);

  useEffect(() => {
    if (currentItem) {
      const itemRef = doc(db, `Bonus/${roomId}/${playerName}/${currentItem.id}`);
      const unsubscribe = onSnapshot(itemRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          const bonusArray = statAttributes.map(stat => ({
            type: stat,
            value: data[stat] || 0,
          }));
          setBonuses(bonusArray);
        } else {
          setBonuses([]);
        }
      });
      return () => unsubscribe();
    }
  }, [currentItem, playerName, roomId]);

  useEffect(() => {
    const loadBonuses = async () => {
      const bonusesData: Record<string, Bonus[]> = {};
      const activeData: Record<string, boolean> = {};
      const itemsWithBonusSet = new Set<string>();

      for (const item of inventory) {
        const itemRef = doc(db, `Bonus/${roomId}/${playerName}/${item.id}`);
        const bonusDoc = await getDoc(itemRef);
        if (bonusDoc.exists()) {
          const data = bonusDoc.data();
          const isActive = data.active ?? true;

          const bonusArray = statAttributes
            .map(stat => ({
              type: stat,
              value: data[stat] || 0,
            }))
            .filter(bonus => bonus.value !== 0);

          // Si l'item a des bonus (peu importe l'état actif/inactif)
          if (bonusArray.length > 0) {
            itemsWithBonusSet.add(item.id);
            activeData[item.id] = isActive;

            // Afficher les bonus dans le tooltip seulement s'ils sont actifs
            if (isActive) {
              bonusesData[item.id] = bonusArray;
            }
          }
        }
      }
      setBonusesMap(bonusesData);
      setBonusActiveMap(activeData);
      setItemsWithBonus(itemsWithBonusSet);
    };

    if (inventory.length > 0) {
      loadBonuses();
    }
  }, [inventory, roomId, playerName]);

  const handleAddItem = async (item: string) => {
    try {
      const existingItem = inventory.find(i => i.message === item && i.category === currentCategory);
      if (existingItem) {
        const itemRef = doc(inventoryRef, existingItem.id);
        await updateDoc(itemRef, { quantity: existingItem.quantity + 1 });
        toast.success(`${item} ajouté`, {
          description: `Quantité : ${existingItem.quantity + 1}`,
          duration: 2000,
        });
      } else {
        await addDoc(inventoryRef, {
          message: item,
          category: currentCategory,
          quantity: 1,
          bonusTypes: {},
          diceSelection: currentCategory.includes('armes') ? `1d6` : null,
          visibility: 'public',
          weight: 1
        });
        toast.success(`${item} créé`, {
          duration: 2000,
        });
      }
      setIsAddItemDialogOpen(false);
    } catch (error) {
      console.error('Erreur lors de l\'ajout de l\'objet:', error);
      toast.error('Erreur', {
        description: "Impossible d'ajouter l'objet.",
        duration: 3000,
      });
    }
  };

  const handleAddPredefinedItem = async (item: string, category: string) => {
    try {
      const existingItem = inventory.find(i => i.message === item && i.category === category);
      if (existingItem) {
        const itemRef = doc(inventoryRef, existingItem.id);
        await updateDoc(itemRef, { quantity: existingItem.quantity + 1 });
        toast.success(`${item} ajouté`, {
          description: `Quantité : ${existingItem.quantity + 1}`,
          duration: 2000,
        });
      } else {
        await addDoc(inventoryRef, {
          message: item,
          category: category,
          quantity: 1,
          bonusTypes: {},
          diceSelection: category.includes('armes') ? `1d6` : null,
          visibility: 'public',
          weight: 1
        });
        toast.success(`${item} ajouté`, {
          duration: 2000,
        });
      }
      setIsAddItemDialogOpen(false);
    } catch (error) {
      console.error('Erreur lors de l\'ajout de l\'objet:', error);
      toast.error('Erreur', {
        description: "Impossible d'ajouter l'objet.",
        duration: 3000,
      });
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      const item = inventory.find(i => i.id === id);
      await deleteDoc(doc(inventoryRef, id));
      toast.success('Objet supprimé', {
        description: item?.message,
        duration: 2000,
      });
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      toast.error('Erreur', {
        description: "Impossible de supprimer l'objet.",
        duration: 3000,
      });
    }
  };

  const handleRenameItem = async () => {
    if (currentItem && newItemName) {
      try {
        const itemRef = doc(inventoryRef, currentItem.id);
        await updateDoc(itemRef, { message: newItemName });
        toast.success('Nom modifié', {
          description: `${currentItem.message} → ${newItemName}`,
          duration: 2000,
        });
        setIsRenameDialogOpen(false);
        setIsRenameDialogOpen(false);
        setNewItemName('');

        // Also update the name in the Bonus collection if it exists
        const bonusRef = doc(db, `Bonus/${roomId}/${playerName}/${currentItem.id}`);
        updateDoc(bonusRef, { name: newItemName }).catch(() => {
          // Ignore error if bonus doc doesn't exist
        });
      } catch (error) {
        console.error('Erreur lors du renommage:', error);
        toast.error('Erreur', {
          description: "Impossible de renommer l'objet.",
          duration: 3000,
        });
      }
    }
  };

  const handleUpdateQuantity = async () => {
    if (currentItem && newItemQuantity > 0) {
      try {
        const itemRef = doc(inventoryRef, currentItem.id);
        await updateDoc(itemRef, {
          quantity: newItemQuantity
        });
        toast.success('Quantité modifiée', {
          description: `${currentItem.message} : ${newItemQuantity}`,
          duration: 2000,
        });
        setIsQuantityDialogOpen(false);
        setNewItemQuantity(1);
      } catch (error) {
        console.error('Erreur lors de la modification de quantité:', error);
        toast.error('Erreur', {
          description: "Impossible de modifier la quantité.",
          duration: 3000,
        });
      }
    }
  };

  const handleAddBonus = async () => {
    console.log("Current item:", currentItem);
    console.log("Bonus type:", bonusType);
    console.log("Bonus value:", bonusValue);
    if (currentItem && bonusType && bonusValue) {
      try {
        const itemRef = doc(db, `Bonus/${roomId}/${playerName}/${currentItem.id}`);
        await setDoc(itemRef, {
          [bonusType]: parseInt(bonusValue),
          active: true,
          [bonusType]: parseInt(bonusValue),
          category: 'Inventaire',
          name: currentItem.message
        }, { merge: true });

        setItemsWithBonus(prev => new Set([...prev, currentItem.id]));
        setBonusActiveMap(prev => ({ ...prev, [currentItem.id]: true }));

        toast.success('Bonus ajouté', {
          description: `${currentItem.message} : ${bonusType} +${bonusValue}`,
          duration: 2000,
        });

        setBonusType('');
        setBonusValue('');
        setIsBonusDialogOpen(false);
      } catch (error) {
        console.error('Erreur lors de l\'ajout du bonus:', error);
        toast.error('Erreur', {
          description: "Impossible d'ajouter le bonus.",
          duration: 3000,
        });
      }
    } else {
      console.log("Missing data for bonus.");
      toast.error('Données manquantes', {
        description: "Veuillez remplir tous les champs.",
        duration: 3000,
      });
    }
  };

  const handleToggleBonusActive = async (itemId: string | undefined) => {
    try {
      if (itemId) {
        const itemRef = doc(db, `Bonus/${roomId}/${playerName}/${itemId}`);
        const itemSnapshot = await getDoc(itemRef);
        if (itemSnapshot.exists()) {
          const data = itemSnapshot.data();
          const currentActiveState = data.active ?? true;
          const newActiveState = !currentActiveState;
          await updateDoc(itemRef, { active: newActiveState });

          const item = inventory.find(i => i.id === itemId);

          setBonusActiveMap(prev => ({
            ...prev,
            [itemId]: newActiveState
          }));

          const bonusArray = statAttributes
            .map(stat => ({
              type: stat,
              value: data[stat] || 0,
            }))
            .filter(bonus => bonus.value !== 0);

          if (newActiveState && bonusArray.length > 0) {
            setBonusesMap(prev => ({
              ...prev,
              [itemId]: bonusArray
            }));
            toast.success('Bonus activé', {
              description: item?.message,
              duration: 2000,
            });
          } else {
            setBonusesMap(prev => {
              const newMap = { ...prev };
              delete newMap[itemId];
              return newMap;
            });
            toast.success('Bonus désactivé', {
              description: item?.message,
              duration: 2000,
            });
          }
        }
      }
    } catch (error) {
      console.error("Error toggling active state:", error);
      toast.error('Erreur', {
        description: "Impossible de modifier l'état du bonus.",
        duration: 3000,
      });
    }
  };

  const renderBonuses = () => (
    <div className="space-y-4">
      {statAttributes.map((stat) => (
        bonuses.some((bonus) => bonus.type === stat && bonus.value !== 0) && (
          <div key={stat} className="flex justify-between items-center bg-[#1c1c1c] p-3 rounded border border-[#333]">
            <span className="font-bold text-[#d4d4d4]">{stat}: <span className="text-[#c0a080]">{bonuses.find(b => b.type === stat)?.value}</span></span>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
              onClick={() => handleDeleteBonus(stat)}
            >
              <MinusCircle className="h-4 w-4" />
            </Button>
          </div>
        )
      ))}
    </div>
  );


  const handleDeleteBonus = async (bonusType: string) => {
    if (currentItem) {
      try {
        const itemRef = doc(db, `Bonus/${roomId}/${playerName}/${currentItem.id}`);
        await setDoc(itemRef, { [bonusType]: 0 }, { merge: true });

        const itemSnapshot = await getDoc(itemRef);
        if (itemSnapshot.exists()) {
          const data = itemSnapshot.data();
          const remainingBonuses = statAttributes
            .map(stat => data[stat] || 0)
            .filter(value => value !== 0);

          if (remainingBonuses.length === 0) {
            setItemsWithBonus(prev => {
              const newSet = new Set(prev);
              newSet.delete(currentItem.id);
              return newSet;
            });
            setBonusActiveMap(prev => {
              const newMap = { ...prev };
              delete newMap[currentItem.id];
              return newMap;
            });
          }
        }

        toast.success('Bonus supprimé', {
          description: `${currentItem.message} : ${bonusType}`,
          duration: 2000,
        });
      } catch (error) {
        console.error('Erreur lors de la suppression du bonus:', error);
        toast.error('Erreur', {
          description: "Impossible de supprimer le bonus.",
          duration: 3000,
        });
      }
    }
  };

  const handleUpdateDice = async () => {
    if (currentItem) {
      try {
        const itemRef = doc(inventoryRef, currentItem.id);
        await updateDoc(itemRef, { diceSelection: `${diceCount}d${diceFaces}` });
        toast.success('Dés modifiés', {
          description: `${currentItem.message} : ${diceCount}d${diceFaces}`,
          duration: 2000,
        });
        setIsDiceDialogOpen(false);
      } catch (error) {
        console.error('Erreur lors de la modification des dés:', error);
        toast.error('Erreur', {
          description: "Impossible de modifier les dés.",
          duration: 3000,
        });
      }
    }
  };

  const filteredInventory = useMemo(() => inventory
    .filter(item =>
      item.message && item.message.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'alphabetical':
          return a.message.localeCompare(b.message);
        case 'quantity-desc':
          return b.quantity - a.quantity;
        case 'quantity-asc':
          return a.quantity - b.quantity;
        case 'category':
        default:
          // Trier par catégorie puis par nom
          const categoryOrder = Object.keys(predefinedItems);
          const categoryCompare = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
          return categoryCompare !== 0 ? categoryCompare : a.message.localeCompare(b.message);
      }
    }), [inventory, searchTerm, sortBy]);



  return (
    <div ref={containerRef} className="h-full bg-[#242424] flex flex-col rounded-[length:var(--block-radius,0.5rem)] overflow-hidden" style={style}>
      <Card className="card w-full max-w-7xl mx-auto h-full !bg-transparent flex flex-col border-none shadow-none">

        {/* Header fixe avec recherche et tri */}
        <div className="p-6 pb-2 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative w-full">
              <Search className="absolute right-4 top-3 h-4 w-4 text-[var(--text-primary)]" />
              <Input
                id="vtt-inventory-search"
                placeholder="Rechercher"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field"
              />
            </div>

            {/* Sélecteur de tri discret */}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-6 h-10 bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)] p-0 flex items-center justify-center">
                <ArrowUpDown className="w-4 h-4" />
              </SelectTrigger>
              <SelectContent className="bg-[var(--bg-card)] border border-[var(--border-color)]">
                <SelectItem value="category" className="text-sm">
                  Par catégorie
                </SelectItem>
                <SelectItem value="alphabetical" className="text-sm">
                  Alphabétique (A-Z)
                </SelectItem>
                <SelectItem value="quantity-desc" className="text-sm">
                  Quantité (+ → -)
                </SelectItem>
                <SelectItem value="quantity-asc" className="text-sm">
                  Quantité (- → +)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <CardContent className="flex-1 overflow-y-auto min-h-0 p-6 pt-2 custom-scrollbar">
          {/* Grille unifiée d'objets */}
          <TooltipProvider delayDuration={100}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-4">
              {/* Case Ajouter - affichée seulement si canEdit est true */}
              {canEdit && (
                <Dialog open={isAddItemDialogOpen} onOpenChange={setIsAddItemDialogOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DialogTrigger asChild>
                        <div id="vtt-inventory-btn-add" className="aspect-square flex items-center justify-center">
                          <div className="w-16 h-16 rounded-full bg-[var(--bg-dark)] flex items-center justify-center border-2 border-dashed border-[var(--border-color)] hover:border-[var(--accent-brown)] transition-all cursor-pointer hover:scale-110">
                            <Plus className="w-8 h-8 text-[var(--accent-brown)]" />
                          </div>
                        </div>
                      </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent className="bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)]">
                      <p className="font-semibold">Ajouter un objet</p>
                    </TooltipContent>
                  </Tooltip>
                  <DialogContent className="!max-w-[95vw] !w-[1400px] !max-h-[90vh] !min-h-[600px] overflow-hidden flex flex-col" style={{ width: '1400px', maxWidth: '95vw', height: '90vh', maxHeight: '90vh' }}>
                    <DialogHeader className="flex-shrink-0 pb-3 sm:pb-4 border-b">
                      <DialogTitle className="text-base sm:text-xl flex items-center gap-2 text-[var(--accent-brown)]">
                        <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                        Ajouter un objet
                      </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                      {/* Barre de recherche et filtres */}
                      <div className="flex-shrink-0 py-2 sm:py-4 border-b border-[var(--border-color)]">
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                          <div className="relative w-full">
                            <Input
                              placeholder="Rechercher un objet..."
                              value={dialogSearchTerm}
                              onChange={(e) => setDialogSearchTerm(e.target.value)}
                              className="w-16 ml-4text-lg input-field bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)]"
                            />
                          </div>

                          <Select value={currentCategory} onValueChange={setCurrentCategory}>
                            <SelectTrigger className="w-1/2 text-lg bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--accent-brown)]">
                              <SelectValue placeholder="Toutes catégories" />
                            </SelectTrigger>
                            <SelectContent className="bg-[var(--bg-card)] border border-[var(--border-color)]">
                              <SelectItem value="all">Toutes catégories</SelectItem>
                              {Object.keys(predefinedItems).map((category) => (
                                <SelectItem key={category} value={category}>
                                  <div className="flex items-center gap-2">
                                    {categoryIcons[category]}
                                    {category}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex gap-8 flex-1 min-h-0 mt-4 overflow-hidden">
                        {/* Objets prédéfinis */}
                        <div className="flex-[3] overflow-hidden flex flex-col">
                          <h3 className="font-semibold mb-4 text-[var(--accent-brown)] flex items-center gap-2 text-lg flex-shrink-0">
                            <Search className="w-5 h-5" />
                            Objets prédéfinis
                          </h3>

                          <div className="overflow-y-auto flex-1 pr-3">
                            <div className="space-y-6">
                              {Object.entries(predefinedItems)
                                .filter(([categoryKey]) => currentCategory === 'all' || !currentCategory || currentCategory === categoryKey)
                                .map(([categoryKey, items]) => {
                                  const filteredItems = items.filter(item => {
                                    const searchLower = dialogSearchTerm.toLowerCase();
                                    const itemDescription = itemDescriptions[item.toLowerCase()];
                                    return item.toLowerCase().includes(searchLower) ||
                                      (itemDescription && itemDescription.description.toLowerCase().includes(searchLower));
                                  });

                                  if (filteredItems.length === 0) return null;

                                  return (
                                    <div key={categoryKey} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-5">
                                      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[var(--border-color)]">
                                        {categoryIcons[categoryKey]}
                                        <h4 className="font-semibold text-[var(--accent-brown)] text-lg">{categoryKey}</h4>
                                        <span className="ml-auto text-sm text-[var(--text-primary)] bg-[var(--bg-dark)] px-2 py-1 rounded">
                                          {filteredItems.length} objet{filteredItems.length > 1 ? 's' : ''}
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        {filteredItems.map(item => {
                                          const itemDescription = itemDescriptions[item.toLowerCase()];
                                          return (
                                            <div
                                              key={item}
                                              className="bg-[var(--bg-dark)] rounded-lg p-4 hover:bg-[var(--bg-darker)] transition-all duration-200 cursor-pointer border border-[var(--border-color)] hover:shadow-lg"
                                              onClick={() => handleAddPredefinedItem(item, categoryKey)}
                                            >
                                              <div className="flex items-start flex-col gap-2">
                                                <div className="flex items-center justify-between w-full">
                                                  <h5 className="font-semibold text-[color:var(--text-primary)] text-sm">{item}</h5>
                                                  <Plus className="w-4 h-4 text-[var(--accent-brown)] flex-shrink-0" />
                                                </div>
                                                {itemDescription && (
                                                  <p className="text-xs text-[color:var(--text-secondary,var(--text-primary))] opacity-70 line-clamp-2 leading-relaxed">
                                                    {itemDescription.description}
                                                  </p>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}

                              {Object.entries(predefinedItems)
                                .filter(([categoryKey]) => currentCategory === 'all' || !currentCategory || currentCategory === categoryKey)
                                .every(([, items]) =>
                                  items.filter(item => {
                                    const searchLower = dialogSearchTerm.toLowerCase();
                                    const itemDescription = itemDescriptions[item.toLowerCase()];
                                    return item.toLowerCase().includes(searchLower) ||
                                      (itemDescription && itemDescription.description.toLowerCase().includes(searchLower));
                                  }).length === 0
                                ) && (
                                  <div className="text-center py-16">
                                    <Search className="w-16 h-16 mx-auto text-[var(--text-primary)] opacity-50 mb-4" />
                                    <h4 className="text-[var(--text-primary)] font-semibold mb-3 text-lg">Aucun objet trouvé</h4>
                                    <p className="text-[var(--text-secondary)] opacity-70">
                                      Modifiez votre recherche ou créez un objet personnalisé
                                    </p>
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>

                        {/* Séparateur */}
                        <div className="w-px bg-[var(--border-color)] flex-shrink-0"></div>

                        {/* Objet personnalisé */}
                        <div className="flex-1 min-w-0 flex flex-col">
                          <h3 className="font-semibold mb-4 text-[var(--accent-brown)] flex items-center gap-2 text-lg flex-shrink-0">
                            <Plus className="w-5 h-5" />
                            Créer un objet personnalisé
                          </h3>

                          <div className="space-y-4 flex-1">
                            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] p-5">
                              <div className="space-y-4">
                                <div>
                                  <Label className="text-[var(--text-secondary)] text-sm font-medium mb-2 block">Nom de l&apos;objet</Label>
                                  <Input
                                    value={newItemName}
                                    onChange={(e) => setNewItemName(e.target.value)}
                                    className="h-10 input-field"
                                    placeholder="Ex: Épée enchantée"
                                  />
                                </div>

                                <div>
                                  <Label className="text-[var(--text-secondary)] text-sm font-medium mb-2 block">Catégorie</Label>
                                  <Select value={currentCategory} onValueChange={setCurrentCategory}>
                                    <SelectTrigger className="h-10 bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--accent-brown)]">
                                      <SelectValue placeholder="Choisir une catégorie..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[var(--bg-card)] border border-[var(--border-color)]">
                                      {Object.keys(predefinedItems).map((category) => (
                                        <SelectItem key={category} value={category}>
                                          <div className="flex items-center gap-2">
                                            {categoryIcons[category]}
                                            {category}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <Button
                                  onClick={() => {
                                    if (newItemName && currentCategory && currentCategory !== 'all') {
                                      handleAddItem(newItemName);
                                      setNewItemName('');
                                      setIsAddItemDialogOpen(false);
                                    }
                                  }}
                                  disabled={!newItemName || !currentCategory || currentCategory === 'all'}
                                  className="w-full h-11 font-medium button-primary"
                                >
                                  <Plus className="w-4 h-4 mr-2" />
                                  Créer l&apos;objet personnalisé
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              {filteredInventory.map(item => (
                <Card
                  key={item.id}
                  className="relative group hover:shadow-lg hover:border-[var(--accent-brown)] transition-all duration-200 bg-[var(--bg-card)] hover:bg-[var(--bg-card)] dark:hover:bg-[var(--bg-card)] border-[var(--border-color)] overflow-hidden aspect-square"
                >
                  <CardContent className="p-2 flex flex-col items-center justify-center h-full">
                    {canEdit ? (
                      <DropdownMenu modal={false}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              {/* Icône de la catégorie avec badge de quantité - cliquable */}
                              <div className="relative w-16 h-16 cursor-pointer">
                                <div className={`w-16 h-16 rounded-full bg-[var(--bg-dark)] flex items-center justify-center border-2 transition-all ${bonusesMap[item.id] && bonusesMap[item.id].length > 0
                                  ? 'border-[var(--accent-brown)] shadow-lg shadow-[var(--accent-brown)]/50'
                                  : 'border-[var(--border-color)] hover:border-[var(--accent-brown)]'
                                  }`}>
                                  {categoryIcons[item.category]}
                                </div>
                                {/* Badge de quantité */}
                                <div className="absolute -top-1 -right-1 bg-[var(--accent-brown)] text-white rounded-full min-w-[1.5rem] h-6 flex items-center justify-center px-1.5 border-2 border-[var(--bg-card)] font-bold text-xs shadow-lg">
                                  {item.quantity}
                                </div>
                              </div>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent className="bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)]">
                            <div className="space-y-1">
                              <p className="font-semibold">{item.message}</p>
                              {item.diceSelection && (
                                <p className="text-xs font-bold text-green-700 font-mono"> {item.diceSelection}</p>
                              )}
                              {itemsWithBonus.has(item.id) && (
                                <div className="text-xs">
                                  {bonusActiveMap[item.id] === false ? (
                                    <p className="text-gray-500 font-semibold italic">Bonus inactif</p>
                                  ) : bonusesMap[item.id] && bonusesMap[item.id].length > 0 ? (
                                    <>
                                      <p className="text-black">Bonus actifs:</p>
                                      {bonusesMap[item.id].map((bonus, index) => (
                                        <span key={index} className="text-blue-700 font-bold">
                                          {bonus.type} +{bonus.value}{index < bonusesMap[item.id].length - 1 ? ', ' : ''}
                                        </span>
                                      ))}
                                    </>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent className="bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)]">
                          <DropdownMenuItem onSelect={() => {
                            setCurrentItem(item);
                            setNewItemName(item.message);
                            setIsRenameDialogOpen(true);
                          }}>
                            Renommer
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => {
                            setCurrentItem(item);
                            setNewItemQuantity(item.quantity);
                            setIsQuantityDialogOpen(true);
                          }}>
                            Modifier la quantité
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => {
                            setCurrentItem(item);
                            setIsBonusDialogOpen(true);
                          }}>
                            Gérer les bonus
                          </DropdownMenuItem>
                          {itemsWithBonus.has(item.id) && (
                            <DropdownMenuItem onSelect={() => handleToggleBonusActive(item.id)}>
                              {bonusActiveMap[item.id] === false ? 'Activer le bonus' : 'Désactiver le bonus'}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => {
                            setCurrentItem(item);
                            if (item.diceSelection) {
                              const [count, faces] = item.diceSelection.split('d').map(Number);
                              setDiceCount(count || 1);
                              setDiceFaces(faces || 6);
                            }
                            setIsDiceDialogOpen(true);
                          }}>
                            Modifier les dés
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleDeleteItem(item.id)} className="text-red-500">
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {/* Vue en lecture seule - juste l'icône avec le tooltip */}
                          <div className="relative w-16 h-16">
                            <div className={`w-16 h-16 rounded-full bg-[var(--bg-dark)] flex items-center justify-center border-2 transition-all ${bonusesMap[item.id] && bonusesMap[item.id].length > 0
                              ? 'border-[var(--accent-brown)] shadow-lg shadow-[var(--accent-brown)]/50'
                              : 'border-[var(--border-color)] hover:border-[var(--accent-brown)]'
                              }`}>
                              {categoryIcons[item.category]}
                            </div>
                            {/* Badge de quantité */}
                            <div className="absolute -top-1 -right-1 bg-[var(--accent-brown)] text-white rounded-full min-w-[1.5rem] h-6 flex items-center justify-center px-1.5 border-2 border-[var(--bg-card)] font-bold text-xs shadow-lg">
                              {item.quantity}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)]">
                          <div className="space-y-1">
                            <p className="font-semibold">{item.message}</p>
                            {item.diceSelection && (
                              <p className="text-xs font-bold text-green-700 font-mono"> {item.diceSelection}</p>
                            )}
                            {itemsWithBonus.has(item.id) && (
                              <div className="text-xs">
                                {bonusActiveMap[item.id] === false ? (
                                  <p className="text-gray-500 font-semibold italic">Bonus inactif</p>
                                ) : bonusesMap[item.id] && bonusesMap[item.id].length > 0 ? (
                                  <>
                                    <p className="text-black">Bonus actifs:</p>
                                    {bonusesMap[item.id].map((bonus, index) => (
                                      <span key={index} className="text-blue-700 font-bold">
                                        {bonus.type} +{bonus.value}{index < bonusesMap[item.id].length - 1 ? ', ' : ''}
                                      </span>
                                    ))}
                                  </>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TooltipProvider>


          {/* Dialogs identiques à l'original */}
          <Dialog open={isRenameDialogOpen} onOpenChange={(open) => {
            setIsRenameDialogOpen(open);
            if (!open) {
              setCurrentItem(null);
              setNewItemName('');
            }
          }}>
            <DialogContent className="modal-content max-w-md">
              <DialogHeader>
                <DialogTitle className="modal-title">Renommer {currentItem?.message}</DialogTitle>
              </DialogHeader>
              <Input
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Nouveau nom"
                className="input-field"
              />
              <Button onClick={handleRenameItem} className="button-primary mt-4">
                Renommer
              </Button>
            </DialogContent>
          </Dialog>

          <Dialog open={isBonusDialogOpen} onOpenChange={(open) => {
            setIsBonusDialogOpen(open);
            if (!open) {
              setCurrentItem(null);
              setBonusType('');
              setBonusValue('');
            }
          }}>
            <DialogContent className="bg-[#242424] border-[#333] text-[#d4d4d4] max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-[#c0a080]">Gérer les bonus de {currentItem?.message}</DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-4">
                {renderBonuses()}

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#333]">
                  <div className="space-y-2">
                    <Label className="text-[#a0a0a0]">Type de bonus</Label>
                    <Select onValueChange={setBonusType} value={bonusType}>
                      <SelectTrigger className="bg-[#1c1c1c] border-[#333] text-[#d4d4d4]">
                        <SelectValue placeholder="Choisir..." />
                      </SelectTrigger>
                      <SelectContent className="bg-[#2a2a2a] border-[#333] text-[#d4d4d4]">
                        {statAttributes.map(attr => (
                          <SelectItem key={attr} value={attr}>{attr}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[#a0a0a0]">Valeur</Label>
                    <Input
                      type="number"
                      placeholder="Valeur"
                      value={bonusValue}
                      onChange={(e) => setBonusValue(e.target.value)}
                      className="bg-[#1c1c1c] border-[#333] text-[#d4d4d4]"
                    />
                  </div>
                </div>

                <Button className="w-full bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f] font-bold" onClick={handleAddBonus}>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Ajouter le bonus
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isDiceDialogOpen} onOpenChange={(open) => {
            setIsDiceDialogOpen(open);
            if (!open) {
              setCurrentItem(null);
              setDiceCount(1);
              setDiceFaces(6);
            }
          }}>
            <DialogContent className="modal-content max-w-md">
              <DialogHeader>
                <DialogTitle className="modal-title">Modifier les dés pour {currentItem?.message}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="diceCount" className="text-[var(--text-primary)]">Nombre de dés</Label>
                    <Input
                      id="diceCount"
                      type="number"
                      value={diceCount}
                      onChange={(e) => setDiceCount(parseInt(e.target.value))}
                      min={1}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <Label htmlFor="diceFaces" className="text-[var(--text-primary)]">Nombre de faces</Label>
                    <Input
                      id="diceFaces"
                      type="number"
                      value={diceFaces}
                      onChange={(e) => setDiceFaces(parseInt(e.target.value))}
                      min={2}
                      className="input-field"
                    />
                  </div>
                </div>
                <Button onClick={handleUpdateDice} className="button-primary">Mettre à jour les dés</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isQuantityDialogOpen} onOpenChange={(open) => {
            setIsQuantityDialogOpen(open);
            if (!open) {
              setCurrentItem(null);
              setNewItemQuantity(1);
            }
          }}>
            <DialogContent className="modal-content max-w-md">
              <DialogHeader>
                <DialogTitle className="modal-title">Modifier la quantité de {currentItem?.message}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="itemQuantity" className="text-[var(--text-primary)]">Quantité</Label>
                  <Input
                    id="itemQuantity"
                    type="number"
                    value={newItemQuantity}
                    onChange={(e) => setNewItemQuantity(parseInt(e.target.value))}
                    min={1}
                    className="input-field"
                  />
                </div>
                <Button onClick={handleUpdateQuantity} className="button-primary">
                  Enregistrer
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent >
      </Card >
    </div>
  );
}

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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Search, Plus, Sword, Target, Shield, Beaker, ChevronRight, Coins, Apple, X, MinusCircle, PlusCircle } from 'lucide-react';
import { db, doc, collection, updateDoc, setDoc, deleteDoc, addDoc, getDoc, getDocs, query, where } from '@/lib/firebase';
import { toast } from 'sonner';
import { useCharacterInventory, useCharacterBonuses, useSingleItemBonus } from '@/hooks/useCharacterData';

interface InventoryItem {
  id: string;
  message: string;
  category: string;
  quantity: number;
  diceSelection?: string;
  visibility?: string;
  weight?: number;
  bonusTypes?: any;
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
  'armes-contact': <Sword className="w-6 h-6 text-[var(--accent-brown)]" />,
  'armes-distance': <Target className="w-6 h-6 text-[var(--accent-brown)]" />,
  'armures': <Shield className="w-6 h-6 text-[var(--accent-brown)]" />,
  'potions': <Beaker className="w-6 h-6 text-[var(--accent-brown)]" />,
  'bourse': <Coins className="w-6 h-6 text-[var(--accent-brown)]" />,
  'nourriture': <Apple className="w-6 h-6 text-[var(--accent-brown)]" />,
  'autre': <ChevronRight className="w-6 h-6 text-[var(--accent-brown)]" />,
};

export default function InventoryManagement({ playerName, roomId, canEdit = true, onHeightChange, style }: InventoryManagementProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const inventoryRef = collection(db, `Inventaire/${roomId}/${playerName}`);
  const [dialogSearchTerm, setDialogSearchTerm] = useState<string>('');
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState<boolean>(false);
  const [isCustomItemDialogOpen, setIsCustomItemDialogOpen] = useState<boolean>(false);
  const [currentCategory, setCurrentCategory] = useState<string>('all');
  const [customItemCategory, setCustomItemCategory] = useState<string>('');
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState<boolean>(false);
  const [isBonusDialogOpen, setIsBonusDialogOpen] = useState<boolean>(false);
  const [isDiceDialogOpen, setIsDiceDialogOpen] = useState<boolean>(false);
  const [isQuantityDialogOpen, setIsQuantityDialogOpen] = useState<boolean>(false);
  const [currentItem, setCurrentItem] = useState<InventoryItem | null>(null);
  const [isGiveDialogOpen, setIsGiveDialogOpen] = useState<boolean>(false);
  const [giveQuantity, setGiveQuantity] = useState<number>(1);
  const [targetPlayer, setTargetPlayer] = useState<string>('');
  const [availablePlayers, setAvailablePlayers] = useState<{ id: string, name: string }[]>([]);
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

  // inventoryRef removed, handled by hooks
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

  // Utilisation des nouveaux hooks centralisés
  const inventory = useCharacterInventory<InventoryItem>(roomId, playerName);
  const allBonuses = useCharacterBonuses(roomId, playerName);
  const currentItemBonusData = useSingleItemBonus(roomId, playerName, currentItem?.id);

  // Mise à jour de setInventory n'est plus gérée manuellement, inventory est réactif

  // Formatage des bonus de l'item courant sélectionné dans la modale
  useEffect(() => {
    if (currentItemBonusData) {
      const bonusArray = statAttributes.map(stat => ({
        type: stat,
        value: currentItemBonusData[stat] || 0,
      }));
      setBonuses(bonusArray);
    } else {
      setBonuses([]);
    }
  }, [currentItemBonusData]);

  // Recalcul des bonus globaux de l'inventaire en temps réel !
  useEffect(() => {
    const bonusesData: Record<string, Bonus[]> = {};
    const activeData: Record<string, boolean> = {};
    const itemsWithBonusSet = new Set<string>();

    for (const item of inventory) {
      // Filtrer les bonus liés à cet objet précis
      const data = allBonuses.find(b => b.id === item.id);

      if (data) {
        const isActive = data.active ?? true;

        const bonusArray = statAttributes
          .map(stat => ({
            type: stat,
            value: data[stat as keyof typeof data] || 0,
          }))
          .filter(bonus => bonus.value !== 0);

        // Si l'item a des bonus
        if (bonusArray.length > 0) {
          itemsWithBonusSet.add(item.id);
          activeData[item.id] = isActive;

          if (isActive) {
            bonusesData[item.id] = bonusArray as unknown as Bonus[];
          }
        }
      }
    }

    setBonusesMap(bonusesData);
    setBonusActiveMap(activeData);
    setItemsWithBonus(itemsWithBonusSet);
  }, [inventory, allBonuses]);


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

        // Log history (quantité augmentée)
        import('@/lib/historiqueTrackerService').then(({ logHistoryEvent }) => {
          logHistoryEvent({
            roomId, type: 'inventaire',
            message: `**${playerName}** a reçu **1x [${item}]** supplémentaire(s).`,
            characterName: playerName
          });
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

        // Log history (nouvel objet)
        import('@/lib/historiqueTrackerService').then(({ logHistoryEvent }) => {
          logHistoryEvent({
            roomId, type: 'inventaire',
            message: `**${playerName}** a reçu **1x [${item}]** dans son inventaire.`,
            characterName: playerName
          });
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

        // Log history
        import('@/lib/historiqueTrackerService').then(({ logHistoryEvent }) => {
          logHistoryEvent({
            roomId, type: 'inventaire',
            message: `**${playerName}** a reçu **1x [${item}]** supplémentaire(s).`,
            characterName: playerName
          });
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

        // Log history
        import('@/lib/historiqueTrackerService').then(({ logHistoryEvent }) => {
          logHistoryEvent({
            roomId, type: 'inventaire',
            message: `**${playerName}** a reçu **1x [${item}]** dans son inventaire.`,
            characterName: playerName
          });
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

      if (item) {
        import('@/lib/historiqueTrackerService').then(({ logHistoryEvent }) => {
          logHistoryEvent({
            roomId, type: 'inventaire',
            message: `**${playerName}** a jeté/perdu **[${item.message}]**.`,
            characterName: playerName
          });
        });
      }
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

        // Log history differences
        const diff = newItemQuantity - currentItem.quantity;
        if (diff !== 0) {
          import('@/lib/historiqueTrackerService').then(({ logHistoryEvent }) => {
            logHistoryEvent({
              roomId, type: 'inventaire',
              message: `**${playerName}** a **${diff > 0 ? 'reçu' : 'perdu'}** ${Math.abs(diff)}x **[${currentItem.message}]**.`,
              characterName: playerName
            });
          });
        }

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

  const handleConsumeItem = async (item: InventoryItem) => {
    try {
      if (item.quantity > 1) {
        const itemRef = doc(inventoryRef, item.id);
        await updateDoc(itemRef, { quantity: item.quantity - 1 });
        toast.success(`${item.message} consommé`, {
          duration: 2000,
        });
      } else {
        await deleteDoc(doc(inventoryRef, item.id));
        toast.success(`${item.message} consommé (épuisé)`, {
          duration: 2000,
        });
      }

      import('@/lib/historiqueTrackerService').then(({ logHistoryEvent }) => {
        logHistoryEvent({
          roomId, type: 'inventaire',
          message: `**${playerName}** a consommé 1x **[${item.message}]**.`,
          characterName: playerName
        });
      });
    } catch (error) {
      console.error('Erreur lors de la consommation:', error);
      toast.error('Erreur', {
        description: "Impossible de consommer l'objet.",
        duration: 3000,
      });
    }
  };

  const handleGiveItem = async () => {
    if (currentItem && targetPlayer && giveQuantity > 0 && giveQuantity <= currentItem.quantity) {
      try {
        const targetInventoryRef = collection(db, `Inventaire/${roomId}/${targetPlayer}`);

        if (giveQuantity === currentItem.quantity) {
          await deleteDoc(doc(inventoryRef, currentItem.id));
        } else {
          const itemRef = doc(inventoryRef, currentItem.id);
          await updateDoc(itemRef, { quantity: currentItem.quantity - giveQuantity });
        }

        const q = query(targetInventoryRef, where("message", "==", currentItem.message), where("category", "==", currentItem.category));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const targetItemDoc = querySnapshot.docs[0];
          await updateDoc(doc(targetInventoryRef, targetItemDoc.id), {
            quantity: targetItemDoc.data().quantity + giveQuantity
          });
        } else {
          await addDoc(targetInventoryRef, {
            message: currentItem.message,
            category: currentItem.category,
            quantity: giveQuantity,
            bonusTypes: currentItem.bonusTypes || {},
            diceSelection: currentItem.diceSelection || null,
            visibility: currentItem.visibility || 'public',
            weight: currentItem.weight || 1
          });
        }

        toast.success(`Objet(s) donné(s)`, {
          description: `Vous avez donné ${giveQuantity}x ${currentItem.message} à ${targetPlayer}.`,
          duration: 3000,
        });

        import('@/lib/historiqueTrackerService').then(({ logHistoryEvent }) => {
          logHistoryEvent({
            roomId, type: 'inventaire',
            message: `**${playerName}** a donné ${giveQuantity}x **[${currentItem.message}]** à **${targetPlayer}**.`,
            characterName: playerName
          });
        });

        setIsGiveDialogOpen(false);
        setTargetPlayer('');
        setCurrentItem(null);
        setGiveQuantity(1);
      } catch (error) {
        console.error("Erreur lors du don d'objet:", error);
        toast.error('Erreur', {
          description: "Impossible de donner l'objet.",
          duration: 3000,
        });
      }
    }
  };

  const openGiveDialog = async (item: InventoryItem) => {
    setCurrentItem(item);
    setGiveQuantity(1);
    setTargetPlayer('');
    setIsGiveDialogOpen(true);

    try {
      if (!roomId) return;
      const charactersRef = collection(db, `cartes/${roomId}/characters`);
      const snapshot = await getDocs(charactersRef);
      const players: { id: string, name: string }[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.type === 'joueurs' && data.Nomperso && data.Nomperso !== playerName) {
          players.push({ id: docSnap.id, name: data.Nomperso });
        }
      });
      setAvailablePlayers(players);
    } catch (error) {
      console.error("Erreur lors de la récupération des joueurs", error);
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
          <div key={stat} className="flex justify-between items-center bg-[var(--bg-dark)] p-3 rounded border border-[var(--border-color)]">
            <span className="font-bold text-[var(--text-primary)]">{stat}: <span className="text-[var(--accent-brown)]">{bonuses.find(b => b.type === stat)?.value}</span></span>
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
            <InputGroup className="max-w-xs">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                id="vtt-inventory-search"
                placeholder="Rechercher"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </InputGroup>
          </div>
        </div>

        <CardContent className="flex-1 overflow-y-auto min-h-0 p-6 pt-2 custom-scrollbar">
          {/* Grille unifiée d'objets */}
          <TooltipProvider delayDuration={100}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-4">
              {/* Case Ajouter - affichée seulement si canEdit est true */}
              {canEdit && (<>
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
                  <DialogContent className="!max-w-[95vw] !w-[95vw] !h-[90vh] !max-h-[90vh] grid-rows-[1fr] [&>div]:h-full [&>div>div]:h-full [&>div>div]:flex [&>div>div]:flex-col [&>div>div]:overflow-hidden">
                    <DialogHeader className="flex-shrink-0 pb-3 border-b border-[var(--border-color)]">
                      <DialogTitle className="text-lg flex items-center gap-2 text-[var(--accent-brown)]">
                        <Plus className="w-5 h-5" />
                        Ajouter un objet
                      </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-hidden flex flex-col min-h-0">

                      {/* LEFT: Browse predefined items */}
                      <div className="flex-1 flex flex-col min-h-0 min-w-0 pr-6">
                        {/* Search + filters header */}
                        <div className="flex-shrink-0 py-4 ml-2 space-y-4">
                          <div className="flex items-center gap-4">
                            <InputGroup className="max-w-md">
                              <InputGroupAddon>
                                <Search />
                              </InputGroupAddon>
                              <InputGroupInput
                                placeholder="Rechercher..."
                                value={dialogSearchTerm}
                                onChange={(e) => setDialogSearchTerm(e.target.value)}
                              />
                            </InputGroup>
                            <Button
                              onClick={() => setIsCustomItemDialogOpen(true)}
                              className="h-10 px-5 button-primary text-sm font-medium whitespace-nowrap flex-shrink-0"
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Créer un objet
                            </Button>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => setCurrentCategory('all')}
                              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${currentCategory === 'all'
                                ? 'bg-[var(--accent-brown)] text-white'
                                : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--accent-brown)] hover:text-[var(--text-primary)]'
                                }`}
                            >
                              Tout
                            </button>
                            {Object.keys(predefinedItems).map((cat) => (
                              <button
                                key={cat}
                                onClick={() => setCurrentCategory(cat)}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${currentCategory === cat
                                  ? 'bg-[var(--accent-brown)] text-white'
                                  : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--accent-brown)] hover:text-[var(--text-primary)]'
                                  }`}
                              >
                                <span className="[&>svg]:w-4 [&>svg]:h-4">{categoryIcons[cat]}</span>
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Scrollable items */}
                        <div className="overflow-y-auto flex-1 min-h-0 pr-2 custom-scrollbar">
                          {(() => {
                            const categoriesToShow = Object.entries(predefinedItems)
                              .filter(([key]) => currentCategory === 'all' || !currentCategory || currentCategory === key);

                            const hasAnyResults = categoriesToShow.some(([, items]) =>
                              items.some(item => {
                                const s = dialogSearchTerm.toLowerCase();
                                const desc = itemDescriptions[item.toLowerCase()];
                                return item.toLowerCase().includes(s) || (desc && desc.description.toLowerCase().includes(s));
                              })
                            );

                            if (!hasAnyResults) {
                              return (
                                <div className="text-center py-20">
                                  <Search className="w-12 h-12 mx-auto text-[var(--text-secondary)] opacity-30 mb-4" />
                                  <p className="text-[var(--text-primary)] font-medium">Aucun objet trouvé</p>
                                  <p className="text-[var(--text-secondary)] text-sm mt-1">Essayez un autre terme ou créez un objet personnalisé</p>
                                </div>
                              );
                            }

                            return (
                              <div className="space-y-8">
                                {categoriesToShow.map(([categoryKey, items]) => {
                                  const filtered = items.filter(item => {
                                    const s = dialogSearchTerm.toLowerCase();
                                    const desc = itemDescriptions[item.toLowerCase()];
                                    return item.toLowerCase().includes(s) || (desc && desc.description.toLowerCase().includes(s));
                                  });
                                  if (filtered.length === 0) return null;

                                  return (
                                    <div key={categoryKey}>
                                      <div className="flex items-center gap-3 mb-4">
                                        <span className="[&>svg]:w-5 [&>svg]:h-5">{categoryIcons[categoryKey]}</span>
                                        <span className="text-sm font-bold text-[var(--accent-brown)] uppercase tracking-wider">{categoryKey}</span>
                                        <div className="flex-1 h-px bg-[var(--border-color)]" />
                                        <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-dark)] px-2 py-0.5 rounded-full">{filtered.length}</span>
                                      </div>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                        {filtered.map(item => {
                                          const desc = itemDescriptions[item.toLowerCase()];
                                          return (
                                            <Tooltip key={item}>
                                              <TooltipTrigger asChild>
                                                <button
                                                  className="group relative bg-[var(--bg-dark)] rounded-xl px-4 py-4 text-left border border-[var(--border-color)] hover:border-[var(--accent-brown)] hover:shadow-lg hover:shadow-[var(--accent-brown)]/10 transition-all cursor-pointer"
                                                  onClick={() => handleAddPredefinedItem(item, categoryKey)}
                                                >
                                                  <div className="flex items-center gap-3">
                                                    <span className="[&>svg]:w-5 [&>svg]:h-5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">{categoryIcons[categoryKey]}</span>
                                                    <span className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-brown)] transition-colors line-clamp-1">{item}</span>
                                                  </div>
                                                  {desc && (
                                                    <p className="text-xs text-[var(--text-secondary)] mt-2 line-clamp-2 leading-relaxed opacity-70">{desc.description}</p>
                                                  )}
                                                  <Plus className="absolute top-3 right-3 w-4 h-4 text-[var(--accent-brown)] opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </button>
                                              </TooltipTrigger>
                                              {desc && (
                                                <TooltipContent side="bottom" className="max-w-[250px] bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)]">
                                                  <p className="text-sm">{desc.description}</p>
                                                </TooltipContent>
                                              )}
                                            </Tooltip>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                    </div>
                  </DialogContent>
                </Dialog>

                {/* Custom item creation dialog */}
                <Dialog open={isCustomItemDialogOpen} onOpenChange={(open) => {
                  setIsCustomItemDialogOpen(open);
                  if (!open) { setNewItemName(''); setCustomItemCategory(''); }
                }}>
                  <DialogContent className="max-w-sm">
                    <DialogHeader>
                      <DialogTitle className="text-lg text-[var(--accent-brown)] flex items-center gap-2">
                        <Plus className="w-5 h-5" />
                        Créer un objet
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div>
                        <Label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">Nom de l&apos;objet</Label>
                        <Input
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          className="h-10 input-field text-sm"
                          placeholder="Ex: Épée enchantée"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-medium text-[var(--text-secondary)] mb-2 block">Catégorie</Label>
                        <Select value={customItemCategory} onValueChange={setCustomItemCategory}>
                          <SelectTrigger className="h-10 bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)] text-sm w-full">
                            <SelectValue placeholder="Choisir une catégorie..." />
                          </SelectTrigger>
                          <SelectContent className="bg-[var(--bg-card)] border border-[var(--border-color)]">
                            {Object.keys(predefinedItems).map((category) => (
                              <SelectItem key={category} value={category}>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="[&>svg]:w-4 [&>svg]:h-4">{categoryIcons[category]}</span>
                                  {category}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={() => {
                          if (newItemName && customItemCategory) {
                            setCurrentCategory(customItemCategory);
                            handleAddItem(newItemName);
                            setNewItemName('');
                            setCustomItemCategory('');
                            setIsCustomItemDialogOpen(false);
                          }
                        }}
                        disabled={!newItemName || !customItemCategory}
                        className="w-full h-11 button-primary text-sm font-semibold"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Créer l&apos;objet
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>)}

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
                          {(item.category === 'potions' || item.category === 'nourriture') && (
                            <DropdownMenuItem onSelect={() => handleConsumeItem(item)}>
                              Consommer
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => openGiveDialog(item)}>
                            Donner
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
            <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)] max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-[var(--accent-brown)]">Gérer les bonus de {currentItem?.message}</DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-4">
                {renderBonuses()}

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--border-color)]">
                  <div className="space-y-2">
                    <Label className="text-[var(--text-secondary)]">Type de bonus</Label>
                    <Select onValueChange={setBonusType} value={bonusType}>
                      <SelectTrigger className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]">
                        <SelectValue placeholder="Choisir..." />
                      </SelectTrigger>
                      <SelectContent className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)]">
                        {statAttributes.map(attr => (
                          <SelectItem key={attr} value={attr}>{attr}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[var(--text-secondary)]">Valeur</Label>
                    <Input
                      type="number"
                      placeholder="Valeur"
                      value={bonusValue}
                      onChange={(e) => setBonusValue(e.target.value)}
                      className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]"
                    />
                  </div>
                </div>

                <Button className="w-full bg-[var(--accent-brown)] text-black hover:bg-[var(--accent-brown-hover)] font-bold" onClick={handleAddBonus}>
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

          <Dialog open={isGiveDialogOpen} onOpenChange={(open) => {
            setIsGiveDialogOpen(open);
            if (!open) {
              setCurrentItem(null);
              setGiveQuantity(1);
              setTargetPlayer('');
            }
          }}>
            <DialogContent className="modal-content max-w-md">
              <DialogHeader>
                <DialogTitle className="modal-title">Donner {currentItem?.message}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4">
                <div>
                  <Label className="text-[var(--text-primary)]">Destinataire</Label>
                  <Select value={targetPlayer} onValueChange={setTargetPlayer}>
                    <SelectTrigger className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] w-full mt-2">
                      <SelectValue placeholder="Choisir un joueur..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)]">
                      {availablePlayers.length > 0 ? (
                        availablePlayers.map(player => (
                          <SelectItem key={player.id} value={player.name}>{player.name}</SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>Aucun autre joueur</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="giveQuantity" className="text-[var(--text-primary)]">Quantité (Max: {currentItem?.quantity})</Label>
                  <Input
                    id="giveQuantity"
                    type="number"
                    value={giveQuantity}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (currentItem && val > currentItem.quantity) {
                        setGiveQuantity(currentItem.quantity);
                      } else {
                        setGiveQuantity(val);
                      }
                    }}
                    min={1}
                    max={currentItem?.quantity}
                    className="input-field mt-2"
                  />
                </div>
                <Button
                  onClick={handleGiveItem}
                  className="button-primary"
                  disabled={!targetPlayer || targetPlayer === 'none' || giveQuantity < 1}
                >
                  Donner
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent >
      </Card >
    </div>
  );
}

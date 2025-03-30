'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Search, Plus, Sword, Target, Shield, Beaker, ChevronRight, Coins, Apple, MoreHorizontal, X } from 'lucide-react';
import { db, doc, collection, onSnapshot, getDoc, updateDoc, setDoc, deleteDoc, addDoc } from '@/lib/firebase';

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
const categoryIcons: Record<string, JSX.Element> = {
  'armes-contact': <Sword className="w-4 h-4 text-[#c0a080]" />,
  'armes-distance': <Target className="w-4 h-4 text-[#c0a080]" />,
  'armures': <Shield className="w-4 h-4 text-[#c0a080]" />,
  'potions': <Beaker className="w-4 h-4 text-[#c0a080]" />,
  'bourse': <Coins className="w-4 h-4 text-[#c0a080]" />,
  'nourriture': <Apple className="w-4 h-4 text-[#c0a080]" />,
  'autre': <ChevronRight className="w-4 h-4 text-[#c0a080]" />,
};

export default function InventoryManagement({ playerName, roomId }: InventoryManagementProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState<boolean>(false);
  const [currentCategory, setCurrentCategory] = useState<string>('');
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState<boolean>(false);
  const [isBonusDialogOpen, setIsBonusDialogOpen] = useState<boolean>(false);
  const [isDiceDialogOpen, setIsDiceDialogOpen] = useState<boolean>(false);
  const [currentItem, setCurrentItem] = useState<InventoryItem | null>(null);
  const [newItemName, setNewItemName] = useState<string>('');
  const [bonusType, setBonusType] = useState<string>('');
  const [bonusValue, setBonusValue] = useState<string>('');
  const [diceCount, setDiceCount] = useState<number>(1);
  const [diceFaces, setDiceFaces] = useState<number>(6);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [bonusesMap, setBonusesMap] = useState<Record<string, Bonus[]>>({});

  const inventoryRef = collection(db, `Inventaire/${roomId}/${playerName}`);

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
      for (const item of inventory) {
        const itemRef = doc(db, `Bonus/${roomId}/${playerName}/${item.id}`);
        const bonusDoc = await getDoc(itemRef);
        if (bonusDoc.exists() && bonusDoc.data().active) {
          const data = bonusDoc.data();
          const bonusArray = statAttributes
            .map(stat => ({
              type: stat,
              value: data[stat] || 0,
            }))
            .filter(bonus => bonus.value !== 0);
          if (bonusArray.length > 0) {
            bonusesData[item.id] = bonusArray;
          }
        }
      }
      setBonusesMap(bonusesData);
    };

    if (inventory.length > 0) {
      loadBonuses();
    }
  }, [inventory, roomId, playerName]);

  const handleAddItem = async (item: string) => {
    const existingItem = inventory.find(i => i.message === item && i.category === currentCategory);
    if (existingItem) {
      const itemRef = doc(inventoryRef, existingItem.id);
      await updateDoc(itemRef, { quantity: existingItem.quantity + 1 });
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
    }
  };

  const handleDeleteItem = async (id: string) => {
    await deleteDoc(doc(inventoryRef, id));
  };

  const handleRenameItem = async () => {
    if (currentItem && newItemName) {
      const itemRef = doc(inventoryRef, currentItem.id);
      await updateDoc(itemRef, { message: newItemName });
      setIsRenameDialogOpen(false);
      setNewItemName('');
    }
  };

  const handleAddBonus = async () => {
    console.log("Current item:", currentItem); 
    console.log("Bonus type:", bonusType); 
    console.log("Bonus value:", bonusValue); 
    if (currentItem && bonusType && bonusValue) {
        const itemRef = doc(db, `Bonus/${roomId}/${playerName}/${currentItem.id}`);
        await setDoc(itemRef, { 
            [bonusType]: parseInt(bonusValue),
            active: true,
            category: 'Inventaire'
        }, { merge: true });
        setBonusType('');
        setBonusValue('');
        setIsBonusDialogOpen(false);
    } else {
        console.log("Missing data for bonus.");
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
          await updateDoc(itemRef, { active: !currentActiveState });
        }
      }
    } catch (error) {
      console.error("Error toggling active state:", error);
    }
  };

  const renderBonuses = () => (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Bonus associés :</h3>
      {statAttributes.map((stat) => (
        bonuses.some((bonus) => bonus.type === stat && bonus.value !== 0) && (
          <div key={stat} className="mb-4">
            <h4 className="text-sm font-semibold text-[#c0a080]">{stat} :</h4>
            {bonuses
              .filter((bonus) => bonus.type === stat && bonus.value !== 0)
              .map((bonus, index) => (
                <div key={`${bonus.type}-${index}`} className="flex items-center mb-2">
                  <span className="mr-2 text-xs text-blue-500">+{bonus.value}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteBonus(bonus.type)}
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
          </div>
        )
      ))}
    </div>
  );
  

  const handleDeleteBonus = async (bonusType: string) => {
    if (currentItem) {
      const itemRef = doc(db, `Bonus/${roomId}/${playerName}/${currentItem.id}`);
      await setDoc(itemRef, { [bonusType]: 0 }, { merge: true });
    }
  };

  const handleUpdateDice = async () => {
    if (currentItem) {
      const itemRef = doc(inventoryRef, currentItem.id);
      await updateDoc(itemRef, { diceSelection: `${diceCount}d${diceFaces}` });
      setIsDiceDialogOpen(false);
    }
  };

  const filteredInventory = inventory.filter(item =>
    item.message && item.message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const categorizedInventory = Object.keys(predefinedItems).map(category => ({
    category,
    items: filteredInventory.filter(item => item.category === category),
  }));

  return (
    <Card className="card w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="text-[var(--accent-brown)]">Inventaire de {playerName}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center mb-4">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--text-primary)]" />
            <Input
              placeholder="Rechercher"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-8"
            />
          </div>
          <Dialog open={isAddItemDialogOpen} onOpenChange={setIsAddItemDialogOpen}>
            <DialogTrigger asChild>
              <Button className="button-primary">
                <Plus className="mr-2 h-4 w-4" /> Ajouter
              </Button>
            </DialogTrigger>
            <DialogContent className="modal-content">
              <DialogHeader>
                <DialogTitle className="modal-title">Ajouter un objet</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Select onValueChange={(value) => setCurrentCategory(value)}>
                  <SelectTrigger className="bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--accent-brown)]">
                    <SelectValue placeholder="Catégorie" />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--bg-card)] border border-[var(--border-color)]">
                    {Object.keys(predefinedItems).map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {currentCategory && (
                  <div className="grid grid-cols-2 gap-2">
                    {predefinedItems[currentCategory].map((item) => (
                      <Button
                        key={item}
                        onClick={() => handleAddItem(item)}
                        className="button-primary"
                      >
                        {item}
                      </Button>
                    ))}
                    {currentCategory === 'autre' && (
                      <Input
                        placeholder="Autre objet"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddItem((e.target as HTMLInputElement).value);
                            (e.target as HTMLInputElement).value = '';
                          }
                        }}
                        className="input-field"
                      />
                    )}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="all">
          <TabsContent value="all">
            {categorizedInventory.map(({ category, items }) => (
              items.length > 0 && (
                <div key={category} className="mb-4">
                  {items.map(item => (
                    <div key={item.id} className="flex flex-col p-2 border-b border-[var(--border-color)] text-[var(--text-primary)]">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center">
                          {categoryIcons[item.category]}
                          <span className="ml-2">{item.quantity} x {item.message}</span>
                          {item.diceSelection && (
                            <span className="ml-2 text-xs text-green-500">({item.diceSelection})</span>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4 text-[var(--text-primary)]" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)]">
                            <DropdownMenuItem onSelect={() => setIsRenameDialogOpen(true)}>
                              Renommer
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => { 
                              setCurrentItem(item); 
                              setIsBonusDialogOpen(true);
                            }}>
                              Gérer les bonus
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleToggleBonusActive(item.id)}>
                              Activer/Désactiver le bonus
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => { 
                              setCurrentItem(item); 
                              setIsDiceDialogOpen(true);
                            }}>
                              Modifier les dés
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => handleDeleteItem(item.id)}>
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {bonusesMap[item.id] && bonusesMap[item.id].length > 0 && (
                        <div className="ml-6 mt-1 text-sm">
                          <div className="flex flex-wrap gap-2">
                            {bonusesMap[item.id].map((bonus, index) => (
                              <span key={index} className="px-2 py-1 rounded-md bg-[var(--bg-card)] text-[var(--accent-brown)]">
                                {bonus.type} +{bonus.value}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            ))}
          </TabsContent>
        </Tabs>

        <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
          <DialogContent className="modal-content">
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

        <Dialog open={isBonusDialogOpen} onOpenChange={setIsBonusDialogOpen}>
          <DialogContent className="modal-content">
            <DialogHeader>
              <DialogTitle className="modal-title">Gérer les bonus de {currentItem?.message}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {renderBonuses()}
              <h3 className="mt-4 mb-2 text-sm font-semibold">Ajouter un nouveau bonus :</h3>
              <Select onValueChange={setBonusType} value={bonusType}>
                <SelectTrigger className="bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--text-primary)]">
                  <SelectValue placeholder="Type de bonus" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--bg-card)] border border-[var(--border-color)]">
                  {statAttributes.map(attr => (
                    <SelectItem key={attr} value={attr}>{attr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="number"
                placeholder="Valeur du bonus"
                value={bonusValue}
                onChange={(e) => setBonusValue(e.target.value)}
                className="input-field mt-2"
              />

              <Button className="button-primary mt-2" onClick={handleAddBonus}>Ajouter le bonus</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isDiceDialogOpen} onOpenChange={setIsDiceDialogOpen}>
          <DialogContent className="modal-content">
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
      </CardContent>
    </Card>
  );
}

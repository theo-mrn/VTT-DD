'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
            active: true
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
    <Card className="w-full max-w-4xl mx-auto bg-[#242424] border border-[#3a3a3a] text-[#d4d4d4] shadow-lg rounded-lg">
      <CardHeader>
        <CardTitle className="text-[#c0a080]">Inventaire de {playerName}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center mb-4">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-[#d4d4d4]" />
            <Input
              placeholder="Rechercher"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 bg-[#1c1c1c] border border-[#3a3a3a] text-[#d4d4d4]"
            />
          </div>
          <Dialog open={isAddItemDialogOpen} onOpenChange={setIsAddItemDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f]">
                <Plus className="mr-2 h-4 w-4" /> Ajouter
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#1c1c1c] text-[#d4d4d4]">
              <DialogHeader>
                <DialogTitle>Ajouter un objet</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Select onValueChange={(value) => setCurrentCategory(value)}>
                  <SelectTrigger className="bg-[#242424] border border-[#3a3a3a] text-[#c0a080]">
                    <SelectValue placeholder="Catégorie" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2a2a2a] border border-[#3a3a3a]">
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
                        className="bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f]"
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
                            (e.target as HTMLInputElement).value = ''; // Clear the input after adding the item
                          }
                        }}
                        
                        className="bg-[#1c1c1c] border border-[#3a3a3a] text-[#d4d4d4]"
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
                    <div key={item.id} className="flex justify-between items-center p-2 border-b border-[#3a3a3a] text-[#d4d4d4]">
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
                            <MoreHorizontal className="h-4 w-4 text-[#d4d4d4]" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-[#1c1c1c] border border-[#3a3a3a] text-[#d4d4d4]">
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
                            <DropdownMenuItem onSelect={() => handleDeleteItem(item.id)}>
                              Supprimer
                            </DropdownMenuItem>
                            
                          </DropdownMenuContent>

                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              )
            ))}
          </TabsContent>
        </Tabs>

        <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
          <DialogContent className="bg-[#1c1c1c] text-[#d4d4d4]">
            <DialogHeader>
              <DialogTitle>Renommer {currentItem?.message}</DialogTitle>
            </DialogHeader>
            <Input
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Nouveau nom"
              className="bg-[#242424] border border-[#3a3a3a] text-[#d4d4d4]"
            />
            <Button onClick={handleRenameItem} className="mt-4 bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f]">
              Renommer
            </Button>
          </DialogContent>
        </Dialog>

        <Dialog open={isBonusDialogOpen} onOpenChange={setIsBonusDialogOpen}>
          <DialogContent className="bg-[#1c1c1c] text-[#d4d4d4]">
            <DialogHeader>
              <DialogTitle>Gérer les bonus de {currentItem?.message}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              {renderBonuses()}
              <h3 className="mt-4 mb-2 text-sm font-semibold">Ajouter un nouveau bonus :</h3>
              <Select onValueChange={setBonusType} value={bonusType}>
    <SelectTrigger className="bg-[#242424] border border-[#3a3a3a] text-[#d4d4d4]">
        <SelectValue placeholder="Type de bonus" />
    </SelectTrigger>
    <SelectContent className="bg-[#2a2a2a] border border-[#3a3a3a]">
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
    className="mt-2 bg-[#242424] border border-[#3a3a3a] text-[#d4d4d4]"
/>

              <Button className="mt-2 bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f]" onClick={handleAddBonus}>Ajouter le bonus</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isDiceDialogOpen} onOpenChange={setIsDiceDialogOpen}>
          <DialogContent className="bg-[#1c1c1c] text-[#d4d4d4]">
            <DialogHeader>
              <DialogTitle>Modifier les dés pour {currentItem?.message}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="diceCount" className="text-[#d4d4d4]">Nombre de dés</Label>
                  <Input
                    id="diceCount"
                    type="number"
                    value={diceCount}
                    onChange={(e) => setDiceCount(parseInt(e.target.value))}
                    min={1}
                    className="bg-[#242424] border border-[#3a3a3a] text-[#d4d4d4]"
                  />
                </div>
                <div>
                  <Label htmlFor="diceFaces" className="text-[#d4d4d4]">Nombre de faces</Label>
                  <Input
                    id="diceFaces"
                    type="number"
                    value={diceFaces}
                    onChange={(e) => setDiceFaces(parseInt(e.target.value))}
                    min={2}
                    className="bg-[#242424] border border-[#3a3a3a] text-[#d4d4d4]"
                  />
                </div>
              </div>
              <Button onClick={handleUpdateDice} className="bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f]">Mettre à jour les dés</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

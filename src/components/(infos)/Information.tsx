'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Define types for data structure
interface Item {
  nom: string;
  type?: string;
  portée?: string;
  dégâts?: string;
  prix: string;
  DEF?: string;
  commentaires?: string;
  effet?: string;
}

type Data = {
  [key: string]: Item[];
}

export default function Marketplace() {
  const [data, setData] = useState<Data>({});
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('armes');

  // Load JSON data on component mount
  useEffect(() => {
    fetch('/tabs/data.json')
      .then(response => response.json())
      .then((data: Data) => setData(data))
  }, [])

  // Filter categories to exclude certain ones
  const categories = Object.keys(data).filter(category =>
    !['potions', 'vetements', 'immobilier', 'artisanat_materiaux', 'animaux_familiers'].includes(category)
  );

  const filterItems = (items: Item[]): Item[] => {
    return items.filter(item =>
      Object.values(item).some(value =>
        value?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  };

  const renderTableHeader = (category: string) => {
    switch (category) {
      case 'armes':
        return (
          <>
            <TableHead className="text-[#c0a080] font-bold">Nom</TableHead>
            <TableHead className="text-[#c0a080] font-bold">Type</TableHead>
            <TableHead className="text-[#c0a080] font-bold">Portée</TableHead>
            <TableHead className="text-[#c0a080] font-bold">Dégâts</TableHead>
            <TableHead className="text-[#c0a080] font-bold">Prix</TableHead>
          </>
        );
      case 'armures':
        return (
          <>
            <TableHead className="text-[#c0a080] font-bold">Nom</TableHead>
            <TableHead className="text-[#c0a080] font-bold">DEF</TableHead>
            <TableHead className="text-[#c0a080] font-bold">Commentaires</TableHead>
            <TableHead className="text-[#c0a080] font-bold">Prix</TableHead>

          </>
        );
      case 'objets':
      case 'services':
      case 'vehicules':
        return (
          <>
            <TableHead className="text-[#c0a080] font-bold">Nom</TableHead>
            {category === 'objets' || category === 'services' ? <TableHead className="text-[#c0a080] font-bold">Effet</TableHead> : null}
            <TableHead className="text-[#c0a080] font-bold">Prix</TableHead>
          </>
        );
      case 'nourriture':
      case 'montures':
      case 'logement':
        return (
          <>
            <TableHead className="text-[#c0a080] font-bold">Nom</TableHead>
            <TableHead className="text-[#c0a080] font-bold">Prix</TableHead>
          </>
        );
      default:
        return (
          <>
            <TableHead className="text-[#c0a080] font-bold">Nom</TableHead>
            <TableHead className="text-[#c0a080] font-bold">Prix</TableHead>
          </>
        );
    }
  };

  const renderTableRows = (category: string, items: Item[]) => {
    return items.map((item, index) => (
      <TableRow key={index} className="border-[var(--border-color)] hover:bg-white/5 transition-colors">
        <TableCell className="font-medium">{item.nom}</TableCell>
        {category === 'armes' && (
          <>
            <TableCell>{item.type}</TableCell>
            <TableCell>{item.portée}</TableCell>
            <TableCell>{item.dégâts}</TableCell>
          </>
        )}
        {category === 'armures' && (
          <>
            <TableCell>{item.DEF}</TableCell>
            <TableCell className="text-sm opacity-80">{item.commentaires}</TableCell>
          </>
        )}
        {(category === 'objets' || category === 'services') && <TableCell className="text-sm opacity-80">{item.effet}</TableCell>}
        <TableCell className="text-[#c0a080] font-bold">{item.prix}</TableCell>
      </TableRow>
    ));
  };

  return (
    <div className="w-full h-full flex flex-col p-4 md:p-8 overflow-hidden">
      <div className="flex flex-col md:flex-row gap-4 mb-6 shrink-0">
        <Input
          type="search"
          placeholder="Rechercher un objet..."
          className="flex-1 bg-black/40 border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[#c0a080]"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <Tabs defaultValue={categories[0]} className="w-full flex-1 flex flex-col overflow-hidden">
        <TabsList className="flex w-full justify-start gap-1 bg-black/20 p-1 h-auto rounded-xl border border-[var(--border-color)] mb-6 overflow-x-auto no-scrollbar shrink-0">
          {categories.map((category) => (
            <TabsTrigger
              key={category}
              value={category}
              onClick={() => setActiveCategory(category)}
              className="px-4 py-1.5 rounded-lg data-[state=active]:bg-[#c0a080] data-[state=active]:text-[var(--bg-dark)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all text-sm font-bold capitalize"
            >
              {category.replace(/_/g, ' ')}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex-1 overflow-auto rounded-xl bg-black/20 border border-[var(--border-color)]">
          {categories.map((category) => (
            <TabsContent key={category} value={category} className="mt-0 outline-none">
              <Table>
                <TableHeader className="bg-black/40 sticky top-0 z-10">
                  <TableRow className="border-[var(--border-color)] hover:bg-transparent uppercase text-[10px] tracking-widest">
                    {renderTableHeader(category)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data[category] && renderTableRows(category, filterItems(data[category]))}
                </TableBody>
              </Table>
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}

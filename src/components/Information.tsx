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
            <TableHead>Nom</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Portée</TableHead>
            <TableHead>Dégâts</TableHead>
            <TableHead>Prix</TableHead>
          </>
        );
      case 'armures':
        return (
          <>
            <TableHead>Nom</TableHead>
            <TableHead>DEF</TableHead>
            <TableHead>Commentaires</TableHead>
            <TableHead>Prix</TableHead>
         
          </>
        );
      case 'objets':
      case 'services':
      case 'vehicules':
        return (
          <>
            <TableHead>Nom</TableHead>
            {category === 'objets' || category === 'services' ? <TableHead>Effet</TableHead> : null}
            <TableHead>Prix</TableHead>
          </>
        );
      case 'nourriture':
      case 'montures':
      case 'logement':
        return (
          <>
            <TableHead>Nom</TableHead>
            <TableHead>Prix</TableHead>
          </>
        );
      default:
        return (
          <>
            <TableHead>Nom</TableHead>
            <TableHead>Prix</TableHead>
          </>
        );
    }
  };

  const renderTableRows = (category: string, items: Item[]) => {
    return items.map((item, index) => (
      <TableRow key={index}>
        <TableCell>{item.nom}</TableCell>
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
            <TableCell>{item.commentaires}</TableCell>
          </>
        )}
        {(category === 'objets' || category === 'services') && <TableCell>{item.effet}</TableCell>}
        <TableCell>{item.prix}</TableCell>
      </TableRow>
    ));
  };

  return (
    <div className="min-h-screen p-8 font-papyrus">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-xl overflow-hidden">
        <div className="p-8">
       
          <Input
            type="search"
            placeholder="Rechercher un objet..."
            className="mb-6"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Tabs defaultValue={categories[0]} className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-2 mb-8 bg-[#444] text-white">
              {categories.map((category) => (
                <TabsTrigger
                  key={category}
                  value={category}
                  onClick={() => setActiveCategory(category)}
                  className={`px-2 py-1 rounded-lg ${activeCategory === category ? 'bg-[#888] text-black font-semibold' : 'text-white'}`}
                >
                  {category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ')}
                </TabsTrigger>
              ))}
            </TabsList>
            {categories.map((category) => (
              <TabsContent key={category} value={category}>
                <Table>
                  <TableHeader>
                    <TableRow>{renderTableHeader(category)}</TableRow>
                  </TableHeader>
                  <TableBody>
                    {data[category] && renderTableRows(category, filterItems(data[category]))}
                  </TableBody>
                </Table>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
}

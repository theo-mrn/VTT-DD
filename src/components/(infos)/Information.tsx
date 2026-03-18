'use client'

import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
            <TableHead className="text-[var(--accent-brown)] font-bold">Nom</TableHead>
            <TableHead className="text-[var(--accent-brown)] font-bold">Type</TableHead>
            <TableHead className="text-[var(--accent-brown)] font-bold">Portée</TableHead>
            <TableHead className="text-[var(--accent-brown)] font-bold">Dégâts</TableHead>
            <TableHead className="text-[var(--accent-brown)] font-bold">Prix</TableHead>
          </>
        );
      case 'armures':
        return (
          <>
            <TableHead className="text-[var(--accent-brown)] font-bold">Nom</TableHead>
            <TableHead className="text-[var(--accent-brown)] font-bold">DEF</TableHead>
            <TableHead className="text-[var(--accent-brown)] font-bold">Commentaires</TableHead>
            <TableHead className="text-[var(--accent-brown)] font-bold">Prix</TableHead>
          </>
        );
      case 'objets':
      case 'services':
      case 'vehicules':
        return (
          <>
            <TableHead className="text-[var(--accent-brown)] font-bold">Nom</TableHead>
            {category === 'objets' || category === 'services' ? <TableHead className="text-[var(--accent-brown)] font-bold">Effet</TableHead> : null}
            <TableHead className="text-[var(--accent-brown)] font-bold">Prix</TableHead>
          </>
        );
      case 'nourriture':
      case 'montures':
      case 'logement':
        return (
          <>
            <TableHead className="text-[var(--accent-brown)] font-bold">Nom</TableHead>
            <TableHead className="text-[var(--accent-brown)] font-bold">Prix</TableHead>
          </>
        );
      default:
        return (
          <>
            <TableHead className="text-[var(--accent-brown)] font-bold">Nom</TableHead>
            <TableHead className="text-[var(--accent-brown)] font-bold">Prix</TableHead>
          </>
        );
    }
  };

  const renderTableRows = (category: string, items: Item[]) => {
    return items.map((item, index) => (
      <TableRow key={index} className="border-[var(--border-color)] hover:bg-[var(--accent-brown)]/5 transition-colors">
        <TableCell className="font-medium text-[var(--text-primary)]">{item.nom}</TableCell>
        {category === 'armes' && (
          <>
            <TableCell className="text-[var(--text-secondary)]">{item.type}</TableCell>
            <TableCell className="text-[var(--text-secondary)]">{item.portée}</TableCell>
            <TableCell className="text-[var(--text-secondary)]">{item.dégâts}</TableCell>
          </>
        )}
        {category === 'armures' && (
          <>
            <TableCell className="text-[var(--text-secondary)]">{item.DEF}</TableCell>
            <TableCell className="text-sm text-[var(--text-secondary)]">{item.commentaires}</TableCell>
          </>
        )}
        {(category === 'objets' || category === 'services') && <TableCell className="text-sm text-[var(--text-secondary)]">{item.effet}</TableCell>}
        <TableCell className="text-[var(--accent-brown)] font-bold">{item.prix}</TableCell>
      </TableRow>
    ));
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <Tabs defaultValue={categories[0]} className="w-full flex-1 min-h-0 flex flex-col" onValueChange={setActiveCategory}>
        {/* ── Toolbar: Tabs + Search on one line ── */}
        <div className="shrink-0 px-4 md:px-8 pt-4 pb-4">
          <div className="flex items-center gap-3">
            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-card)]/60 backdrop-blur-sm border border-[var(--border-color)] shrink-0 overflow-x-auto no-scrollbar">
              <TabsList className="bg-transparent border-none gap-1 p-0">
                {categories.map((category) => (
                  <TabsTrigger
                    key={category}
                    value={category}
                    className="px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap capitalize data-[state=active]:bg-[var(--accent-brown)] data-[state=active]:text-[var(--bg-dark)] data-[state=active]:shadow-[0_2px_10px_rgba(192,160,128,0.3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    {category.replace(/_/g, ' ')}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher un objet..."
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-[var(--bg-card)]/60 backdrop-blur-sm border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)] focus:shadow-[0_0_15px_rgba(192,160,128,0.1)] transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table content */}
        <div className="flex-1 min-h-0 overflow-auto mx-4 md:mx-8 mb-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] styled-scrollbar">
          {searchTerm ? (
            // Global search: show all categories with results
            <div>
              {categories.map((category) => {
                const filtered = data[category] ? filterItems(data[category]) : [];
                if (filtered.length === 0) return null;
                return (
                  <div key={category}>
                    <div className="px-4 py-2 bg-[var(--bg-dark)]/40 border-b border-[var(--border-color)]">
                      <span className="text-xs font-bold uppercase tracking-widest text-[var(--accent-brown)]">
                        {category.replace(/_/g, ' ')}
                      </span>
                      <span className="ml-2 text-xs text-[var(--text-secondary)]">({filtered.length})</span>
                    </div>
                    <Table>
                      <TableHeader className="bg-[var(--bg-dark)]/60">
                        <TableRow className="border-[var(--border-color)] hover:bg-transparent uppercase text-[10px] tracking-widest">
                          {renderTableHeader(category)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {renderTableRows(category, filtered)}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}
              {categories.every(cat => !data[cat] || filterItems(data[cat]).length === 0) && (
                <div className="text-center text-[var(--text-secondary)] py-10">
                  Aucun résultat trouvé.
                </div>
              )}
            </div>
          ) : (
            // Normal tab view
            categories.map((category) => (
              <TabsContent key={category} value={category} className="mt-0 outline-none">
                <Table>
                  <TableHeader className="bg-[var(--bg-dark)]/60 sticky top-0 z-10">
                    <TableRow className="border-[var(--border-color)] hover:bg-transparent uppercase text-[10px] tracking-widest">
                      {renderTableHeader(category)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data[category] && renderTableRows(category, filterItems(data[category]))}
                  </TableBody>
                </Table>
              </TabsContent>
            ))
          )}
        </div>
      </Tabs>
    </div>
  );
}

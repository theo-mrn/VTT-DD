// Sidebar.tsx
"use client";

import { Swords, BookOpen, FileText, Edit, Dice5, List, Search } from "lucide-react"; 
import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCompetences } from "@/contexts/CompetencesContext";
import debounce from 'lodash/debounce';

type SidebarProps = {
  activeTab: string;
  handleIconClick: (tabName: string) => void;
  isMJ: boolean;
};

type Competence = {
  titre: string;
  description: string;
  type: string;
  source?: string;
};

export default function Sidebar({ activeTab, handleIconClick, isMJ }: SidebarProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Competence[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { searchCompetences } = useCompetences();

  const debouncedSearch = useCallback(
    debounce((term: string) => {
      setIsSearching(true);
      const results = searchCompetences(term);
      setSearchResults(results);
      setIsSearching(false);
    }, 300),
    [searchCompetences]
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (value.trim()) {
      setIsSearching(true);
      debouncedSearch(value);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  };

  return (
    <>
      <aside className="fixed top-1/2 left-0 transform -translate-y-1/2 z-10 bg-[#242424] p-4 rounded-r-lg shadow-lg flex flex-col items-center space-y-6">
        <button onClick={() => setIsSearchOpen(true)} className="p-2">
          <Search className="h-6 w-6 text-[#d4d4d4] hover:text-[#c0a080]" />
        </button>
        {isMJ && (
          <button onClick={() => handleIconClick("GMDashboard")} className="p-2">
            <Swords className={`h-6 w-6 ${activeTab === "GMDashboard" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
          </button>
        )}
        <button onClick={() => handleIconClick("Component")} className="p-2">
          <FileText className={`h-6 w-6 ${activeTab === "Component" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
        <button onClick={() => handleIconClick("NewComponent")} className="p-2">
          <Edit className={`h-6 w-6 ${activeTab === "NewComponent" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
        <button onClick={() => handleIconClick("DiceRollerDnD")} className="p-2">
          <Dice5 className={`h-6 w-6 ${activeTab === "DiceRollerDnD" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
        <button onClick={() => handleIconClick("Competences")} className="p-2">
          <List className={`h-6 w-6 ${activeTab === "Competences" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
        <button onClick={() => handleIconClick("infoComponent")} className="p-2">
          <BookOpen className={`h-6 w-6 ${activeTab === "infoComponent" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
      </aside>

      <Sheet open={isSearchOpen} onOpenChange={setIsSearchOpen}>
        <SheetContent side="left" className="w-full sm:w-[1800px] p-0">
          <div className="flex flex-col h-full">
            <div className="p-6 border-b">
              <SheetHeader className="mb-4">
                <SheetTitle className="text-2xl">Rechercher une compétence</SheetTitle>
                <SheetDescription className="text-base">
                  Recherchez dans les titres et descriptions des compétences
                </SheetDescription>
              </SheetHeader>

              <div className="relative max-w-2xl">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher une compétence..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="pl-9 text-lg"
                />
              </div>

              <div className="mt-2 text-sm text-muted-foreground">
                {isSearching ? (
                  'Recherche en cours...'
                ) : searchResults.length > 0 ? (
                  `${searchResults.length} résultat(s) trouvé(s)`
                ) : searchTerm ? (
                  'Aucun résultat'
                ) : null}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6">
                <AnimatePresence mode="wait">
                  {isSearching ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex justify-center items-center py-8"
                    >
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#c0a080]" />
                    </motion.div>
                  ) : (
                    <div className="space-y-6 w-full">
                      {searchResults.map((competence, index) => (
                        <Card 
                          key={index} 
                          className="bg-card hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          <CardHeader className="pb-3">
                            <CardTitle className="text-xl font-medium">
                              {competence.titre}
                            </CardTitle>
                            <p className="text-base text-muted-foreground">
                              {competence.source}
                            </p>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              <p 
                                className="text-base text-muted-foreground leading-relaxed" 
                                dangerouslySetInnerHTML={{ __html: competence.description }}
                              />
                              {competence.type && (
                                <div className="mt-4">
                                  <span className="inline-block px-4 py-1.5 text-sm bg-muted rounded-lg">
                                    {competence.type}
                                  </span>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

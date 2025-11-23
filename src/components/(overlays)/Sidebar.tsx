// Sidebar.tsx
"use client";

import { Swords, BookOpen, FileText, Edit, Dice5, List, Search ,ChartColumn} from "lucide-react"; 
import { useState, useCallback, useEffect, useRef } from "react";
import { useCompetences } from "@/contexts/CompetencesContext";
import { useGame } from "@/contexts/GameContext";
import debounce from 'lodash/debounce';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const { isHydrated } = useGame();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Competence[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { searchCompetences, isLoading, allCompetences } = useCompetences();
  
  // Use ref to ensure we always have the latest setSearchResults
  const searchResultsRef = useRef(setSearchResults);
  searchResultsRef.current = setSearchResults;
  
  const isSearchingRef = useRef(setIsSearching);
  isSearchingRef.current = setIsSearching;

  // Debug effect to check data loading
  useEffect(() => {}, [isLoading, allCompetences, searchResults]);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Create debounced search function with refs to avoid closure issues
  const debouncedSearch = useCallback(
    debounce((term: string) => {
      isSearchingRef.current(true);
      try {
        const results = searchCompetences(term);
        searchResultsRef.current(results);
      } catch (error) {
        console.error(error);
        searchResultsRef.current([]);
      } finally {
        isSearchingRef.current(false);
      }
    }, 300),
    [searchCompetences]
  );

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (value.trim()) {
      setIsSearching(true);
      debouncedSearch(value);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  };

  // Function to highlight search terms in text
  const highlightSearchTerm = (text: string, term: string) => {
    if (!term) return text;
    const regex = new RegExp(`(${term})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800">$1</mark>');
  };

  // Reset search when dialog closes
  const handleOpenChange = (open: boolean) => {
    setIsSearchOpen(open);
    if (!open) {
      setSearchTerm('');
      setSearchResults([]);
      setIsSearching(false);
    }
  };

  return (
    <>
      <aside className="fixed top-1/2 left-0 transform -translate-y-1/2 z-30 bg-[#242424] p-2 sm:p-3 md:p-4 rounded-r-lg shadow-lg flex flex-col items-center space-y-3 sm:space-y-4 md:space-y-6">
        <button 
          onClick={() => setIsSearchOpen(true)} 
          className="p-1.5 sm:p-2 hover:bg-[#333] rounded transition-colors"
          title="Rechercher une compétence (Ctrl+K)"
        >
          <Search className="h-5 w-5 sm:h-6 sm:w-6 text-[#d4d4d4] hover:text-[#c0a080]" />
        </button>
        {isHydrated && isMJ && (
          <button onClick={() => handleIconClick("GMDashboard")} className="p-1.5 sm:p-2">
            <Swords className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "GMDashboard" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
          </button>
        )}
        <button onClick={() => handleIconClick("Component")} className="p-1.5 sm:p-2">
          <FileText className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "Component" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
        <button onClick={() => handleIconClick("NewComponent")} className="p-1.5 sm:p-2">
          <Edit className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "NewComponent" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
        <button onClick={() => handleIconClick("DiceRoller")} className="p-1.5 sm:p-2">
          <Dice5 className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "DiceRoller" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
        
        <button onClick={() => handleIconClick("Competences")} className="p-1.5 sm:p-2">
          <List className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "Competences" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
        <button onClick={() => handleIconClick("infoComponent")} className="p-1.5 sm:p-2">
          <BookOpen className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "infoComponent" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
        <button onClick={() => handleIconClick("Statistiques")} className="p-1.5 sm:p-2">
          <ChartColumn className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "Statistiques" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
      </aside>

      <Dialog open={isSearchOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-[98vw] sm:max-w-[90vw] md:max-w-4xl w-full max-h-[90vh] sm:max-h-[85vh] p-3 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Rechercher une compétence</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3 sm:space-y-4">
            <div className="relative">
              <Search className="absolute left-2 sm:left-3 top-2 sm:top-3 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher une compétence..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-8 sm:pl-9 text-sm"
              />
            </div>
            <ScrollArea className="h-[300px] xs:h-[400px] sm:h-[500px] w-full">
              {searchResults.length === 0 ? (
                <div className="text-center text-muted-foreground py-6 sm:py-8 text-sm">
                  {isLoading ? "Chargement des données..." : 
                   isSearching ? "Recherche en cours..." : 
                   allCompetences.length === 0 ? "Aucune donnée chargée" :
                   searchTerm ? "Aucune compétence trouvée." : "Tapez pour rechercher..."}
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  <div className="text-xs sm:text-sm font-medium px-2 sm:px-3 py-1.5 sm:py-2 bg-muted rounded-lg">
                    {searchResults.length} compétence(s) trouvée(s)
                  </div>
                  <div className="grid gap-2 sm:gap-3">
                    {searchResults.map((competence, index) => (
                      <div
                        key={`${competence.titre}-${index}`}
                        className="p-3 sm:p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => {
                          setIsSearchOpen(false);
                        }}
                      >
                        <div className="flex flex-col xs:flex-row xs:justify-between xs:items-start mb-2 gap-2">
                          <div className="font-semibold text-sm sm:text-base md:text-lg">
                            <span 
                              dangerouslySetInnerHTML={{ 
                                __html: highlightSearchTerm(competence.titre, searchTerm) 
                              }} 
                            />
                          </div>
                          {competence.type && (
                            <span className="inline-block px-2 py-1 text-[10px] sm:text-xs bg-muted rounded text-muted-foreground flex-shrink-0 w-fit">
                              {competence.type}
                            </span>
                          )}
                        </div>
                        {competence.source && (
                          <div className="text-xs sm:text-sm text-muted-foreground mb-2 font-medium">
                            📖 {competence.source}
                          </div>
                        )}
                        <div className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                          <span 
                            dangerouslySetInnerHTML={{ 
                              __html: highlightSearchTerm(competence.description, searchTerm) 
                            }} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

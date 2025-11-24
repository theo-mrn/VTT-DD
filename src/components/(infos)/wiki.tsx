'use client'

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import HTMLFlipBook from "react-pageflip";

// Define types for profile and race entries
interface Profile {
  description: string;
  hitDie: string;
  image: string;
}

interface Race {
  description: string;
  image: string;
  modificateurs: Record<string, number>;
}

interface Capability {
  [key: string]: string;
}

interface BookEntry {
  name: string;
  type: "Classe" | "Race";
  description: string;
  hitPoints?: string; // Optional for race
  modifiers?: Array<{ stat: string; value: number }>; // Optional for class
  capabilities?: Capability; // Optional for race
  image: string;
}

export default function Component() {
    const [bookEntries, setBookEntries] = useState<BookEntry[]>([]);
    const [currentPage, setCurrentPage] = useState<number>(0);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const bookRef = useRef<any>(null);
  
    useEffect(() => {
      const fetchData = async () => {
        try {
          const profileResponse = await fetch('/tabs/profile.json');
          const raceResponse = await fetch('/tabs/race.json');
          const capabilityResponse = await fetch('/tabs/capacites.json');
  
          const profiles: Record<string, Profile> = await profileResponse.json();
          const races: Record<string, Race> = await raceResponse.json();
          const capabilities: Record<string, Capability> = await capabilityResponse.json();
  
          const formattedEntries: BookEntry[] = [
            ...Object.entries(profiles).map(([key, value]) => ({
              name: key,
              type: "Classe" as const,
              description: value.description,
              hitPoints: value.hitDie,
              image: value.image,
            })),
            ...Object.entries(races).map(([key, value]) => ({
              name: key,
              type: "Race" as const,
              description: value.description,
              modifiers: Object.entries(value.modificateurs).map(([stat, val]) => ({ stat, value: val })),
              capabilities: capabilities[key] || {},
              image: value.image,
            }))
          ];
  
          setBookEntries(formattedEntries);
        } catch (error) {
          console.error("Error fetching JSON data:", error);
        }
      };
  
      fetchData();
    }, []);
  
    const nextPage = () => {
      if (bookRef.current) {
        bookRef.current.pageFlip().flipNext();
      }
    };
  
    const prevPage = () => {
      if (bookRef.current) {
        bookRef.current.pageFlip().flipPrev();
      }
    };
  
    const filteredEntries = bookEntries.filter(entry => 
      entry.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  
    const onFlip = (e: any) => {
      setCurrentPage(e.data);
    };
  
    const RacePage = ({ entry }: { entry: BookEntry }) => (
      <div className="flex flex-col h-full p-8">
        <div className="flex flex-col md:flex-row items-start gap-6 mb-6">
          <div className="md:w-1/4 flex justify-center shrink-0">
            <Image
              src={entry.image}
              alt={entry.name}
              width={250}
              height={250}
              className="rounded-lg shadow-md object-cover"
              style={{ aspectRatio: "1 / 1" }}
            />
          </div>
          <div className="md:w-3/4 flex flex-col gap-4">
            <h2 className="text-4xl font-bold text-amber-900">{entry.name}</h2>
            <p className="text-gray-700 text-lg leading-relaxed">{entry.description}</p>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 mt-auto">
          <div className="bg-amber-100 rounded-lg p-4 md:w-3/4">
            <h3 className="font-bold text-lg mb-3 text-amber-900">Capacités raciales</h3>
            {entry.capabilities && Object.entries(entry.capabilities).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(entry.capabilities).map(([key, value], index) => (
                  <div key={index} className="text-gray-700">
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500">Aucune capacité disponible</div>
            )}
          </div>
          <div className="bg-amber-100 rounded-lg p-3 md:w-1/4 flex flex-col">
            <h3 className="font-bold text-sm mb-2 text-amber-900">Modificateurs</h3>
            <div className="space-y-1">
              {entry.modifiers?.map((mod, index) => (
                <div key={index} className="text-xs flex justify-between">
                  <span className="font-semibold">{mod.stat}</span>
                  <span className="text-amber-700">{mod.value > 0 ? '+' : ''}{mod.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  
    const ClassPage = ({ entry }: { entry: BookEntry }) => (
      <div className="flex flex-col h-full p-8">
        <div className="flex flex-col md:flex-row items-start gap-6 mb-6">
          <div className="md:w-1/4 flex justify-center shrink-0">
            <Image
              src={entry.image}
              alt={entry.name}
              width={250}
              height={250}
              className="rounded-lg shadow-md object-cover"
              style={{ aspectRatio: "1 / 1" }}
            />
          </div>
          <div className="md:w-3/4 flex flex-col gap-4">
            <h2 className="text-4xl font-bold text-amber-900">{entry.name}</h2>
            <p className="text-gray-700 text-lg leading-relaxed">{entry.description}</p>
          </div>
        </div>
        
        <div className="bg-amber-100 rounded-lg p-3 mt-auto max-w-xs">
          <h3 className="font-bold text-sm mb-2 text-amber-900">Points de vie</h3>
          <p className="text-base text-center text-amber-700">{entry.hitPoints}</p>
        </div>
      </div>
    );
  
    const PageContent = ({ entry }: { entry: BookEntry }) => {
      if (!entry) return null;
      switch (entry.type) {
        case "Classe":
          return <ClassPage entry={entry} />;
        case "Race":
          return <RacePage entry={entry} />;
        default:
          return null;
      }
    };
  
    return (
      <div className="h-screen bg-zinc-900 flex items-center justify-center p-8">
        <div className="w-full h-full flex items-center justify-center">
          <div className="relative w-full h-full flex flex-col items-center justify-center gap-4">
            <input
              type="text"
              placeholder="Rechercher une race ou un profil"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="p-2 rounded-lg text-gray-800 z-20"
            />
            <div className="relative w-full h-full flex items-center justify-center">
              <Button
                variant="ghost"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white z-20"
                size="icon"
                onClick={prevPage}
                disabled={filteredEntries.length === 0}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white z-20"
                size="icon"
                onClick={nextPage}
                disabled={filteredEntries.length === 0}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>

            <div className="w-full h-full flex items-center justify-center pb-8 px-16">
              {filteredEntries.length > 0 ? (
                <HTMLFlipBook
                  width={700}
                  height={850}
                  size="stretch"
                  minWidth={650}
                  maxWidth={1200}
                  minHeight={400}
                  maxHeight={900}
                  maxShadowOpacity={0.5}
                  showCover={false}
                  mobileScrollSupport={true}
                  onFlip={onFlip}
                  className="shadow-2xl"
                  style={{}}
                  startPage={0}
                  drawShadow={true}
                  flippingTime={1000}
                  usePortrait={false}
                  startZIndex={0}
                  autoSize={true}
                  clickEventForward={true}
                  useMouseEvents={true}
                  swipeDistance={30}
                  showPageCorners={true}
                  disableFlipByClick={false}
                  ref={bookRef}
                >
                  {filteredEntries.map((entry, index) => (
                    <div key={index} className="bg-[#f4e4bc] shadow-lg">
                      <PageContent entry={entry} />
                    </div>
                  ))}
                </HTMLFlipBook>
              ) : (
                <div className="bg-[#f4e4bc] w-[1600px] h-[1000px] flex items-center justify-center rounded-lg shadow-2xl">
                  <p className="text-gray-500">Aucun résultat trouvé</p>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
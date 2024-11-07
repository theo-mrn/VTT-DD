'use client'

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import Image from "next/image";

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
      setCurrentPage((prev) => (prev + 1) % filteredEntries.length);
    };
  
    const prevPage = () => {
      setCurrentPage((prev) => (prev - 1 + filteredEntries.length) % filteredEntries.length);
    };
  
    const filteredEntries = bookEntries.filter(entry => 
      entry.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  
    // Reset currentPage if filteredEntries is empty
    useEffect(() => {
      if (filteredEntries.length === 0) {
        setCurrentPage(0);
      } else if (currentPage >= filteredEntries.length) {
        setCurrentPage(filteredEntries.length - 1);
      }
    }, [filteredEntries]);
  
    const RacePage = ({ entry, reverse }: { entry: BookEntry; reverse?: boolean }) => (
      <div className={`flex flex-col md:flex-row ${reverse ? "md:flex-row-reverse" : ""} items-center h-full`}>
        <div className="mb-6 md:mb-0 md:w-1/3 flex justify-center">
          <Image
            src={entry.image}
            alt={entry.name}
            width={300}
            height={300}
            className="rounded-lg shadow-md object-cover"
            style={{ aspectRatio: "1 / 1" }}
          />
        </div>
        <div className="md:w-2/3 flex flex-col gap-4 px-4">
          <h2 className="text-3xl font-bold">{entry.name}</h2>
          <p className="text-gray-600 italic mb-4">{entry.description}</p>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="bg-amber-100 rounded-lg p-4 md:w-3/4">
              <h3 className="font-bold mb-2">Capacités raciales</h3>
              {entry.capabilities && Object.entries(entry.capabilities).length > 0 ? (
                Object.entries(entry.capabilities).map(([key, value], index) => (
                  <div key={index} className="mb-2">
                    <span className="font-semibold">{value}</span>
                  </div>
                ))
              ) : (
                <div className="mb-2 text-gray-500">Aucune capacité disponible</div>
              )}
            </div>
            <div className="bg-amber-100 rounded-lg p-4 md:w-1/4">
              <h3 className="font-bold mb-2">Modificateurs</h3>
              {entry.modifiers?.map((mod, index) => (
                <div key={index} className="mb-1">
                  <span className="font-semibold">{mod.stat}: </span>
                  <span className="text-sm">{mod.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  
    const ClassPage = ({ entry, reverse }: { entry: BookEntry; reverse?: boolean }) => (
      <div className={`flex flex-col md:flex-row ${reverse ? "md:flex-row-reverse" : ""} items-center h-full`}>
        <div className="mb-6 md:mb-0 md:w-1/3 flex justify-center">
          <Image
            src={entry.image}
            alt={entry.name}
            width={300}
            height={300}
            className="rounded-lg shadow-md object-cover"
            style={{ aspectRatio: "1 / 1" }}
          />
        </div>
        <div className="md:w-2/3 flex flex-col gap-4 px-4">
          <h2 className="text-3xl font-bold">{entry.name}</h2>
          <p className="text-gray-600 italic mb-4">{entry.description}</p>
          <div className="bg-amber-100 rounded-lg p-4">
            <h3 className="font-bold mb-2">Points de vie</h3>
            <p className="text-lg text-center">{entry.hitPoints}</p>
          </div>
        </div>
      </div>
    );
  
    const PageContent = ({ entry, reverse }: { entry: BookEntry; reverse?: boolean }) => {
      if (!entry) return null; // Check for undefined entry
      switch (entry.type) {
        case "Classe":
          return <ClassPage entry={entry} reverse={reverse} />;
        case "Race":
          return <RacePage entry={entry} reverse={reverse} />;
        default:
          return null;
      }
    };
  
    return (
      <div className="h-screen bg-zinc-900 flex items-center justify-center p-4">
        <div className="w-full max-w-7xl h-full flex items-center justify-center">
          <div className="relative w-full h-full flex items-center justify-center">
            <input
              type="text"
              placeholder="Rechercher une race ou un profil"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="absolute top-4 left-1/2 transform -translate-x-1/2 p-2 rounded-lg text-gray-800"
            />
            <Button
              variant="ghost"
              className="absolute left-0 top-1/2 -translate-y-1/2 text-white z-10"
              size="icon"
              onClick={prevPage}
              disabled={filteredEntries.length === 0}
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
            <Button
              variant="ghost"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-white z-10"
              size="icon"
              onClick={nextPage}
              disabled={filteredEntries.length === 0}
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
  
            <div className="w-full h-[800px] max-w-6xl flex shadow-2xl bg-[#f4e4bc] rounded-lg overflow-hidden">
              <CardContent className="p-8 h-full overflow-y-auto flex-1 flex">
                {filteredEntries.length > 0 && (
                  <PageContent entry={filteredEntries[currentPage]} reverse={currentPage % 2 === 1} />
                )}
              </CardContent>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
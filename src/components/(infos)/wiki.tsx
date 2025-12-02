'use client'

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
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
    <div className="flex flex-col h-full p-8 bg-gradient-to-br from-[#fdf6e3] to-[#f4e4bc]">
      <div className="relative h-full flex flex-col">
        <h2 className="text-4xl font-serif font-bold text-amber-900 mb-6 border-b-2 border-amber-900/20 pb-2 tracking-wide">
          {entry.name}
        </h2>

        <div className="flex-grow">
          <div className="float-left mr-6 mb-4 relative group">
            <div className="absolute inset-0 bg-amber-900/10 transform rotate-3 rounded-lg transition-transform group-hover:rotate-6" />
            <Image
              src={entry.image}
              alt={entry.name}
              width={220}
              height={220}
              className="relative rounded-lg shadow-lg object-cover border-4 border-[#fdf6e3] transform -rotate-2 transition-transform group-hover:rotate-0"
              style={{ aspectRatio: "1 / 1" }}
            />
          </div>

          <p className="text-amber-950 text-lg leading-relaxed font-serif text-justify first-letter:text-5xl first-letter:font-bold first-letter:text-amber-900 first-letter:mr-2 first-letter:float-left">
            {entry.description}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-amber-900/10">
          <div className="md:col-span-2 bg-amber-900/5 rounded-lg p-4 border border-amber-900/10">
            <h3 className="font-serif font-bold text-xl mb-3 text-amber-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-900" />
              Capacités raciales
            </h3>
            {entry.capabilities && Object.entries(entry.capabilities).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(entry.capabilities).map(([key, value], index) => (
                  <div key={index} className="text-amber-900/80 text-sm leading-snug">
                    <span className="font-bold text-amber-900 block mb-1">{key}</span>
                    {value}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-amber-900/50 italic text-sm">Aucune capacité disponible</div>
            )}
          </div>

          <div className="bg-amber-900/5 rounded-lg p-4 border border-amber-900/10 h-fit">
            <h3 className="font-serif font-bold text-lg mb-3 text-amber-900 border-b border-amber-900/10 pb-2">
              Modificateurs
            </h3>
            <div className="space-y-2">
              {entry.modifiers?.map((mod, index) => (
                <div key={index} className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-amber-900">{mod.stat}</span>
                  <span className={`font-bold px-2 py-0.5 rounded ${mod.value > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {mod.value > 0 ? '+' : ''}{mod.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const ClassPage = ({ entry }: { entry: BookEntry }) => (
    <div className="flex flex-col h-full p-8 bg-gradient-to-br from-[#fdf6e3] to-[#f4e4bc]">
      <div className="relative h-full flex flex-col">
        <h2 className="text-4xl font-serif font-bold text-amber-900 mb-6 border-b-2 border-amber-900/20 pb-2 tracking-wide">
          {entry.name}
        </h2>

        <div className="flex-grow">
          <div className="float-right ml-6 mb-4 relative group">
            <div className="absolute inset-0 bg-amber-900/10 transform -rotate-3 rounded-lg transition-transform group-hover:-rotate-6" />
            <Image
              src={entry.image}
              alt={entry.name}
              width={220}
              height={220}
              className="relative rounded-lg shadow-lg object-cover border-4 border-[#fdf6e3] transform rotate-2 transition-transform group-hover:rotate-0"
              style={{ aspectRatio: "1 / 1" }}
            />
          </div>

          <p className="text-amber-950 text-lg leading-relaxed font-serif text-justify first-letter:text-5xl first-letter:font-bold first-letter:text-amber-900 first-letter:mr-2 first-letter:float-left">
            {entry.description}
          </p>
        </div>

        <div className="mt-auto pt-6">
          <div className="bg-amber-900/5 rounded-lg p-6 border border-amber-900/10 max-w-sm mx-auto transform hover:scale-105 transition-transform duration-300">
            <h3 className="font-serif font-bold text-xl mb-2 text-amber-900 text-center">Points de vie</h3>
            <div className="flex items-center justify-center gap-3">
              <Heart className="w-8 h-8 text-red-700 fill-red-700" />
              <p className="text-2xl font-bold text-amber-800">{entry.hitPoints}</p>
            </div>
          </div>
        </div>
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
            placeholder="Rechercher dans le grimoire..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-6 py-3 rounded-full bg-black/30 border border-amber-900/30 text-amber-100 placeholder:text-amber-100/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 w-96 text-center shadow-2xl transition-all z-20 font-serif tracking-wide"
          />
          <div className="relative w-full h-full flex items-center justify-center">
            <Button
              variant="ghost"
              className="absolute left-8 top-1/2 -translate-y-1/2 text-amber-100/30 hover:text-amber-100 hover:bg-white/5 hover:scale-110 transition-all duration-300 z-20 rounded-full p-2"
              size="icon"
              onClick={prevPage}
              disabled={filteredEntries.length === 0}
            >
              <ChevronLeft className="h-16 w-16" />
            </Button>
            <Button
              variant="ghost"
              className="absolute right-8 top-1/2 -translate-y-1/2 text-amber-100/30 hover:text-amber-100 hover:bg-white/5 hover:scale-110 transition-all duration-300 z-20 rounded-full p-2"
              size="icon"
              onClick={nextPage}
              disabled={filteredEntries.length === 0}
            >
              <ChevronRight className="h-16 w-16" />
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

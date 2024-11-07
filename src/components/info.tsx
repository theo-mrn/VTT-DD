"use client";

import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import Capacites from "@/components/infos/capacites";
import Information from "@/components/infos/Information";
import Component from "@/components/infos/wiki";
import Images from "@/components/infos/images";

export default function InfoComponent() {
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isFullScreenInfo, setIsFullScreenInfo] = useState(false);
  const [isFullScreenImages, setIsFullScreenImages] = useState(false);
  const [isFullScreenwiki, setIsFullScreenwiki] = useState(false);

  const handleClick = (component: string) => {
    if (component === "Compétences") {
      setIsFullScreen(true);
    } else if (component === "Information") {
      setIsFullScreenInfo(true);
    } else if (component === "Images") {
      setIsFullScreenImages(true);
    } else if (component === "wiki") {
      setIsFullScreenwiki(true);
    }  else {
      setSelectedComponent(component);
      console.log(`Opening ${component} component`);
    }
  };

  const closeFullScreen = () => setIsFullScreen(false);
  const closeFullScreenInfo = () => setIsFullScreenInfo(false);
  const closeFullScreenwiki = () => setIsFullScreenwiki(false);
  const closeFullScreenImages = () => setIsFullScreenImages(false);
  

  return (
    <div className="w-full min-h-screen text-black p-4">
      {isFullScreen ? (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 overflow-auto">
          <button
            onClick={closeFullScreen}
            className="fixed top-4 left-4 bg-black bg-opacity-70 text-white p-3 rounded-full hover:bg-opacity-90 transition text-xl"
          >
            retour
          </button>
          <div className="flex justify-center items-start p-6">
            <Capacites />
          </div>
        </div>
      ) : isFullScreenInfo ? (
        <div className="fixed top-1/6 left-1/6 w-2/5 h-full z-50 overflow-auto rounded-lg shadow-lg">
          <button
            onClick={closeFullScreenInfo}
            className="absolute top-4 left-4 bg-black bg-opacity-70 text-white p-3 rounded-full hover:bg-opacity-90 transition text-xl"
          >
            retour
          </button>
          <div className="flex justify-center items-start p-6 text-black">
            <Information />
          </div>
        </div>
      ) : isFullScreenwiki ? (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 overflow-auto">
          <button
            onClick={closeFullScreenwiki}
            className="fixed top-4 left-4 bg-black bg-opacity-70 text-white p-3 rounded-full hover:bg-opacity-90 transition text-xl"
          >
            retour
          </button>
          <div className="flex justify-center items-start p-6">
            <Component />
          </div>
        </div>
      ) : 
      isFullScreenImages ? (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 overflow-auto">
          <button
            onClick={closeFullScreenImages}
            className="fixed top-4 left-4 bg-black bg-opacity-70 text-white p-3 rounded-full hover:bg-opacity-90 transition text-xl"
          >
            retour
          </button>
          <div className="flex justify-center items-start p-6">
            <Images />
          </div>
        </div>
      ) : 
      (
        <div className="max-w-xl mx-auto">
          <h1 className="text-2xl font-bold text-stone-200 mb-3 text-center">Informations Complémentaires</h1>
          <p className="text-sm text-stone-400 mb-6 text-center">Ressources, information, et compétences dans la quête principale</p>
          
          <div className="flex flex-col space-y-4">
            {/* Information Card */}
            <Card 
              className="flex items-center justify-between p-4 bg-[#242424] text-white cursor-pointer transition-all"
              onClick={() => handleClick("Information")}
            >
              <div className="flex-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-stone-200">Objets</CardTitle>
                </CardHeader>
                <p className="text-sm text-stone-400">Des informations sur les objets courants.</p>
              </div>
              <Image
                src="/images/information.png"
                alt="Information image"
                width={100}
                height={100}
                className="rounded-md w-1/5"
              />
            </Card>

            <Card 
              className="flex items-center justify-between p-4 bg-[#242424] text-white cursor-pointer transition-all"
              onClick={() => handleClick("wiki")}
            >
              <div className="flex-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-stone-200">Wiki</CardTitle>
                </CardHeader>
                <p className="text-sm text-stone-400">Retrouvez les informations détaillées.</p>
              </div>
              <Image
                src="/images/wiki.png"
                alt="Compétences image"
                width={100}
                height={100}
                className="rounded-md w-1/5"
              />
            </Card>

            {/* Compétences Card */}
            <Card 
              className="flex items-center justify-between p-4 bg-[#242424] text-white cursor-pointer transition-all"
              onClick={() => handleClick("Compétences")}
            >
              <div className="flex-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-stone-200">Compétences</CardTitle>
                </CardHeader>
                <p className="text-sm text-stone-400">Explorez les compétences.</p>
              </div>
              <Image
                src="/images/competences.png"
                alt="Compétences image"
                width={100}
                height={100}
                className="rounded-md w-1/5"
              />
            </Card>

            {/* Images Card */}
            <Card 
              className="flex items-center justify-between p-4 bg-[#242424] text-white cursor-pointer transition-all"
              onClick={() => handleClick("Images")}
            >
              <div className="flex-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg text-stone-200">Images</CardTitle>
                </CardHeader>
                <p className="text-sm text-stone-400">Une sélection d'images.</p>
              </div>
              <Image
                src="/images/Orc.webp"
                alt="Images example"
                width={100}
                height={100}
                className="rounded-md w-1/5"
              />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

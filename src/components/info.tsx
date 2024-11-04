"use client";

import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import Capacites from "@/components/capacites";
import Information from "@/components/Information";
import Images from "@/components/images";

export default function InfoComponent() {
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isFullScreenInfo, setIsFullScreenInfo] = useState(false);
  const [isFullScreenImages, setIsFullScreenImages] = useState(false);

  const handleClick = (component: string) => {
    if (component === "Compétences") {
      setIsFullScreen(true);
    } else if (component === "Information") {
      setIsFullScreenInfo(true);
    } else if (component === "Images") {
      setIsFullScreenImages(true);
    } else {
      setSelectedComponent(component);
      console.log(`Opening ${component} component`);
    }
  };

  const closeFullScreen = () => setIsFullScreen(false);
  const closeFullScreenInfo = () => setIsFullScreenInfo(false);
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
        <div className="fixed top-1/6 left-1/6 w-2/3 h-full z-50 overflow-auto rounded-lg shadow-lg">
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
      ) : isFullScreenImages ? (
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
      ) : (
        <div className="max-w-xl mx-auto">
          <h1 className="text-2xl font-bold text-stone-200 mb-3 text-center">Informations Complémentaires</h1>
          <p className="text-sm text-stone-400 mb-6 text-center">Ressources, information, et compétences dans la quête principale</p>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Information Card */}
            <Card 
              className="text-black cursor-pointer transition-all  p-2"
              onClick={() => handleClick("Information")}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-stone-200 flex justify-between items-center">
                  Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Image
                  src="/images/information.png"
                  alt="Information image"
                  width={200}
                  height={100}
                  className="rounded-md w-full"
                />
              </CardContent>
            </Card>

            {/* Compétences Card */}
            <Card 
              className="bg-olive-800/60 border-olive-700 cursor-pointer transition-all hover:bg-olive-700/80 p-2"
              onClick={() => handleClick("Compétences")}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-stone-200 flex justify-between items-center">
                  Compétences
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Image
                  src="/images/competences.png"
                  alt="Compétences image"
                  width={200}
                  height={100}
                  className="rounded-md w-full"
                />
              </CardContent>
            </Card>

            {/* Images Card */}
            <Card 
              className="bg-olive-800/60 border-olive-700 cursor-pointer transition-all hover:bg-olive-700/80 p-2"
              onClick={() => handleClick("Images")}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-stone-200 flex justify-between items-center">
                  Images
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Image
                  src="/images/image.webp"
                  alt="Images example"
                  width={200}
                  height={100}
                  className="rounded-md w-full"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

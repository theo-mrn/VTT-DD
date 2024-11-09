import React, { useState, useCallback, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { doc, updateDoc, getDoc, db, auth, onAuthStateChanged } from '@/lib/firebase';
import { getCroppedImg } from '@/lib/cropImageHelper';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DecorationSelector from '@/components/DecorationSelector';

// Générer la liste des tokens de 1 à 70
const tokenList = Array.from({ length: 70 }, (_, i) => ({
  id: i + 1,
  name: `Token ${i + 1}`,
  src: `/Token/Token${i + 1}.png`
}));

export default function CharacterImage({ imageUrl, altText, characterId }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [showCropper, setShowCropper] = useState(false);
  const [showDecorationModal, setShowDecorationModal] = useState(false);
  const [croppedImageUrl, setCroppedImageUrl] = useState(imageUrl || "/api/placeholder/192/192");
  const [overlayUrl, setOverlayUrl] = useState("/token/Token1.png");

  const roomId = "665441";

  useEffect(() => {
    const fetchImageURL = async () => {
      try {
        const characterDocRef = doc(db, `cartes/${roomId}/characters`, characterId);
        const characterDoc = await getDoc(characterDocRef);

        if (characterDoc.exists()) {
          const data = characterDoc.data();
          setCroppedImageUrl(data.imageURL2 || imageUrl || "/api/placeholder/192/192");
          setOverlayUrl(`/token/${data.Token || "Token1"}.png`);
        } else {
          setCroppedImageUrl(imageUrl || "/api/placeholder/192/192");
        }
      } catch (error) {
        console.error("Failed to fetch character data:", error);
      }
    };

    if (characterId) fetchImageURL();
  }, [characterId, imageUrl]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });
    return () => unsubscribe();
  }, []);

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSaveCroppedImage = useCallback(async () => {
    if (!currentUser) {
      alert("Please log in to save changes.");
      return;
    }

    try {
      const croppedImage = await getCroppedImg(croppedImageUrl, croppedAreaPixels);
      const characterDocRef = doc(db, `cartes/${roomId}/characters`, characterId);
      await updateDoc(characterDocRef, { imageURL2: croppedImage });
      setCroppedImageUrl(croppedImage);
      setShowCropper(false);
    } catch (e) {
      console.error('Failed to save cropped image:', e);
    }
  }, [croppedAreaPixels, croppedImageUrl, characterId, currentUser]);

  const handleResetImage = useCallback(async () => {
    if (!currentUser) {
      alert("Please log in to reset image.");
      return;
    }

    try {
      const characterDocRef = doc(db, `cartes/${roomId}/characters`, characterId);
      await updateDoc(characterDocRef, { imageURL2: imageUrl });
      setCroppedImageUrl(imageUrl);
      setShowCropper(false);
    } catch (e) {
      console.error('Failed to reset image:', e);
    }
  }, [imageUrl, characterId, currentUser]);

  const handleSelectToken = async (tokenNumber) => {
    try {
      const characterDocRef = doc(db, `cartes/${roomId}/characters`, characterId);
      await updateDoc(characterDocRef, { Token: `Token${tokenNumber}` });
      setOverlayUrl(`/token/Token${tokenNumber}.png`);
    } catch (e) {
      console.error('Failed to update token:', e);
    }
  };

  if (!currentUser) {
    return <div>Please log in to edit your character image.</div>;
  }

  return (
    <div className="relative w-52 h-52 flex justify-center items-center">
      {/* Character Image */}
      <div 
        className="relative w-40 h-40 rounded-full overflow-hidden shadow-lg cursor-pointer z-10"
        onClick={() => setShowCropper(true)}
      >
        <img
          src={croppedImageUrl}
          alt={altText || "Character Image"}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Decorative Overlay */}
      <div 
        className="absolute inset-0 w-56 h-56 bg-center bg-cover z-20 pointer-events-none"
        style={{ backgroundImage: `url(${overlayUrl})` }}
      />

      {/* Cropper Modal with Token Grid */}
      {showCropper && croppedImageUrl && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-80 flex">
          {/* Left side - Cropper */}
          <div className="flex-1 flex flex-col justify-center items-center p-4">
            <div className="relative w-full h-3/4">
              <Cropper
                image={croppedImageUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            <div className="mt-4 w-full max-w-lg">
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.1}
                onValueChange={(value) => setZoom(value[0])}
              />
            </div>

            <div className="mt-6 flex space-x-4">
              <button
                onClick={handleSaveCroppedImage}
                className="bg-green-500 text-white px-6 py-2 rounded"
              >
                Valider
              </button>
              <button
                onClick={() => setShowCropper(false)}
                className="bg-gray-500 text-white px-6 py-2 rounded"
              >
                Annuler
              </button>
              <button
                onClick={handleResetImage}
                className="bg-blue-500 text-white px-6 py-2 rounded"
              >
                Réinitialiser
              </button>
            </div>
          </div>

          {/* Right side - Token Grid */}
          <div className="w-80 bg-white h-full overflow-y-auto">
            <Card className="h-full border-none rounded-none">
              <CardHeader>
                <CardTitle>Sélectionner un Token</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {tokenList.map((token) => (
                    <button
                      key={token.id}
                      onClick={() => handleSelectToken(token.id)}
                      className="relative aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-primary focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                    >
                      <img
                        src={token.src}
                        alt={token.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-40 flex items-end justify-center p-1">
                        <span className="text-white text-xs">{token.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Decoration Modal */}
      {showDecorationModal && (
        <div className="fixed inset-0 z-70 bg-black bg-opacity-100 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-lg w-full relative">
            <DecorationSelector
              characterId={characterId}
              roomId={roomId}
              onClose={() => setShowDecorationModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
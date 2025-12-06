import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import { doc, updateDoc, getDoc, db, auth, onAuthStateChanged } from '@/lib/firebase';
import { getCroppedImg, createCompositeImage } from '@/lib/cropImageHelper';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image as ImageIcon, Check, X, RotateCcw, Sparkles } from 'lucide-react';

// Générer la liste des tokens de 1 à 70 (en excluant certains tokens)
const excludedTokens = [5, 19, 24, 34, 45, 46, 48, 49, 58];
const tokenList = Array.from({ length: 70 }, (_, i) => i + 1)
  .filter(id => !excludedTokens.includes(id))
  .map(id => ({
    id,
    name: `Token ${id}`,
    src: `/Token/Token${id}.png`
  }));

export default function CharacterImage({ imageUrl, altText, characterId }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [showCropper, setShowCropper] = useState(false);
  const [showDecorationModal, setShowDecorationModal] = useState(false);
  const [croppedImageUrl, setCroppedImageUrl] = useState(imageUrl || "/api/placeholder/192/192");
  const [finalImageUrl, setFinalImageUrl] = useState(null);
  const [overlayUrl, setOverlayUrl] = useState("/Token/Token1.png");
  const [previewTokenUrl, setPreviewTokenUrl] = useState("/Token/Token1.png");
  const [previewImage, setPreviewImage] = useState(null);
  const [roomId, setRoomId] = useState(null);

  useEffect(() => {
    const fetchRoomId = async () => {
      try {
        const userDocRef = doc(db, `users/${auth.currentUser.uid}`);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const data = userDoc.data();
          setRoomId(data.room_id);
        } else {
          console.error("User document does not exist.");
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      }
    };

    if (auth.currentUser) fetchRoomId();
  }, [auth.currentUser]);

  useEffect(() => {
    const fetchImageURL = async () => {
      if (!roomId) return;

      try {
        const characterDocRef = doc(db, `cartes/${roomId}/characters`, characterId);
        const characterDoc = await getDoc(characterDocRef);

        if (characterDoc.exists()) {
          const data = characterDoc.data();
          setCroppedImageUrl(data.imageURL2 || imageUrl || "/api/placeholder/192/192");
          setFinalImageUrl(data.imageURLFinal || null);
          const tokenUrl = `/Token/${data.Token || "Token1"}.png`;
          setOverlayUrl(tokenUrl);
          setPreviewTokenUrl(tokenUrl);
        } else {
          setCroppedImageUrl(imageUrl || "/api/placeholder/192/192");
          setFinalImageUrl(null);
        }
      } catch (error) {
        console.error("Failed to fetch character data:", error);
      }
    };

    if (characterId && roomId) fetchImageURL();
  }, [characterId, imageUrl, roomId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });
    return () => unsubscribe();
  }, []);

  const onCropComplete = useCallback(async (croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);

    // Generate preview image
    try {
      const preview = await getCroppedImg(croppedImageUrl, croppedAreaPixels);
      setPreviewImage(preview);
    } catch (e) {
      console.error('Failed to generate preview:', e);
    }
  }, [croppedImageUrl]);

  const handleSaveCroppedImage = useCallback(async () => {
    if (!currentUser || !roomId) {
      alert("Please log in to save changes.");
      return;
    }

    try {
      // First, get the cropped image
      const croppedImage = await getCroppedImg(croppedImageUrl, croppedAreaPixels);

      // Then create the composite image with the token overlay
      const compositeImage = await createCompositeImage(croppedImage, previewTokenUrl);

      const characterDocRef = doc(db, `cartes/${roomId}/characters`, characterId);

      // Extract token number from previewTokenUrl
      const tokenMatch = previewTokenUrl.match(/Token(\d+)\.png/);
      const tokenName = tokenMatch ? `Token${tokenMatch[1]}` : 'Token1';

      // Save both the cropped image and the composite final image
      await updateDoc(characterDocRef, {
        imageURL2: croppedImage,      // Original cropped image (for re-editing)
        imageURLFinal: compositeImage, // Final composite with token
        Token: tokenName
      });

      setCroppedImageUrl(croppedImage);
      setFinalImageUrl(compositeImage);
      setOverlayUrl(previewTokenUrl);
      setShowCropper(false);
    } catch (e) {
      console.error('Failed to save cropped image:', e);
      alert('Erreur lors de la sauvegarde de l\'image');
    }
  }, [croppedAreaPixels, croppedImageUrl, characterId, currentUser, roomId, previewTokenUrl]);

  const handleResetImage = useCallback(async () => {
    if (!currentUser || !roomId) {
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
  }, [imageUrl, characterId, currentUser, roomId]);

  const handleSelectToken = async (tokenNumber) => {
    // Update preview only without saving to database
    setPreviewTokenUrl(`/Token/Token${tokenNumber}.png`);
  };

  if (!currentUser) {
    return <div>Please log in to edit your character image.</div>;
  }

  return (
    <div className="relative w-full h-full flex justify-center items-center mx-auto group min-h-0 min-w-0">
      <div className="relative max-w-full max-h-full aspect-square w-full h-full flex items-center justify-center">
        {finalImageUrl ? (
          /* Display composite final image */
          <div
            className="relative w-full h-full cursor-pointer transition-all duration-300"
            onClick={() => setShowCropper(true)}
          >
            <img
              src={finalImageUrl}
              alt={altText || "Character Image"}
              className="w-full h-full object-contain"
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center rounded-full">
              <ImageIcon className="text-[#c0a0a0]" size={32} />
            </div>
          </div>
        ) : (
          /* Fallback: Display character image with overlay (for backwards compatibility) */
          <>
            <div
              className="relative w-[80%] h-[80%] rounded-full overflow-hidden cursor-pointer z-10 hover:border-[#c0a0a0] transition-all duration-300"
              onClick={() => setShowCropper(true)}
            >
              <img
                src={croppedImageUrl}
                alt={altText || "Character Image"}
                className="w-full h-full object-cover"
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <ImageIcon className="text-[#c0a0a0]" size={32} />
              </div>
            </div>

            {/* Decorative Overlay */}
            <div
              className="absolute inset-0 w-full h-full bg-center bg-cover z-20 pointer-events-none"
              style={{ backgroundImage: `url(${overlayUrl})` }}
            />
          </>
        )}
      </div>

      {/* Cropper Modal with Token Grid */}
      {showCropper && croppedImageUrl && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex flex-col lg:flex-row">
          {/* Left side - Cropper */}
          <div className="flex-1 flex flex-col justify-center items-center p-3 sm:p-4 lg:p-6 bg-[#1a1a1a]">
            <div className="w-full max-w-3xl mb-4">
              <h2 className="text-2xl font-bold text-[#c0a0a0] mb-2 flex items-center gap-2">
                <ImageIcon size={28} />
                Éditer l'image du personnage
              </h2>
              <p className="text-[#a0a0a0] text-sm">Recadrez votre image et choisissez un cadre décoratif</p>
            </div>

            {/* Preview Section */}
            <div className="mb-4">
              <p className="text-[#c0a0a0] text-sm font-semibold mb-2 text-center">Aperçu final</p>
              <div className="relative w-40 h-40 sm:w-48 sm:h-48 flex justify-center items-center mx-auto">
                <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden shadow-2xl z-10 border-2 border-[#c0a0a0]">
                  {previewImage ? (
                    <img
                      src={previewImage}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={croppedImageUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div
                  className="absolute inset-0 w-40 h-40 sm:w-48 sm:h-48 bg-center bg-cover z-20 pointer-events-none"
                  style={{ backgroundImage: `url(${previewTokenUrl})` }}
                />
              </div>
            </div>

            <div className="relative w-full h-[40vh] sm:h-[50vh] lg:h-2/3 max-w-3xl bg-[#242424] rounded-lg overflow-hidden border-2 border-[#3a3a3a] shadow-2xl">
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

            <div className="mt-4 sm:mt-6 w-full max-w-lg px-2">
              <label className="text-[#c0a0a0] text-sm font-semibold mb-2 block">Zoom</label>
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.1}
                onValueChange={(value) => setZoom(value[0])}
                className="cursor-pointer"
              />
            </div>

            <div className="mt-4 sm:mt-6 flex flex-wrap justify-center gap-2 sm:gap-3">
              <button
                onClick={handleSaveCroppedImage}
                className="bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-[#4a4a4a] hover:border-green-500/50 text-green-500 px-4 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg"
              >
                <Check size={18} />
                Valider
              </button>
              <button
                onClick={() => setShowCropper(false)}
                className="bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-[#4a4a4a] hover:border-red-500/50 text-[#d4d4d4] hover:text-red-400 px-4 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg"
              >
                <X size={18} />
                Annuler
              </button>
              <button
                onClick={handleResetImage}
                className="bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-[#4a4a4a] hover:border-blue-500/50 text-blue-400 px-4 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg"
              >
                <RotateCcw size={18} />
                Réinitialiser
              </button>
            </div>
          </div>

          {/* Right side - Token Grid */}
          <div className="w-full lg:w-96 bg-[#242424] h-[40vh] lg:h-full overflow-y-auto border-l border-[#3a3a3a]">
            <div className="h-full">
              <div className="p-4 sm:p-6 border-b border-[#3a3a3a] bg-[#2a2a2a]">
                <h3 className="text-lg font-bold text-[#c0a0a0] flex items-center gap-2">
                  <Sparkles size={20} />
                  Cadres décoratifs
                </h3>
                <p className="text-[#a0a0a0] text-sm mt-1">Choisissez un cadre pour votre portrait</p>
              </div>
              <div className="p-3 sm:p-4">
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 gap-2">
                  {tokenList.map((token) => (
                    <button
                      key={token.id}
                      onClick={() => handleSelectToken(token.id)}
                      className="relative aspect-square rounded-lg overflow-hidden bg-[#2a2a2a] border-2 border-[#3a3a3a] hover:border-[#c0a0a0] focus:outline-none focus:border-[#c0a0a0] transition-all duration-200 hover:scale-105 hover:shadow-xl group"
                    >
                      <img
                        src={token.src}
                        alt={token.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="absolute bottom-0 left-0 right-0 p-1.5 text-center">
                          <span className="text-white text-[10px] sm:text-xs font-semibold drop-shadow-lg">
                            {token.name}
                          </span>
                        </div>
                      </div>
                      {previewTokenUrl === token.src && (
                        <div className="absolute top-1 right-1 bg-[#c0a0a0] rounded-full p-1">
                          <Check size={12} className="text-[#242424]" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
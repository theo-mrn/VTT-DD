import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import { doc, updateDoc, getDoc, db, auth, onAuthStateChanged, storage, ref, uploadBytes, getDownloadURL } from '@/lib/firebase';
import { getCroppedImg, createCompositeImage, getCroppedGif, createCompositeGif } from '@/lib/cropImageHelper';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Image as ImageIcon, Check, X, RotateCcw, Sparkles, Upload } from 'lucide-react';



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
  const [uploading, setUploading] = useState(false);
  const [isGif, setIsGif] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tokenList, setTokenList] = useState([]);

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

          // Load token from R2 if available
          if (data.Token) {
            // Fetch token URL from API
            const tokenResponse = await fetch('/api/assets?category=Token&type=image');
            const tokenData = await tokenResponse.json();
            const tokenAsset = tokenData.assets?.find(asset => asset.name === `${data.Token}.png`);

            if (tokenAsset) {
              setOverlayUrl(tokenAsset.path);
              setPreviewTokenUrl(tokenAsset.path);
            }
          }

          setIsGif(data.isGif || false);
        } else {
          setCroppedImageUrl(imageUrl || "/api/placeholder/192/192");
          setFinalImageUrl(null);
          setIsGif(false);
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

  // Load tokens from API
  useEffect(() => {
    const loadTokens = async () => {
      try {
        const response = await fetch('/api/assets?category=Token&type=image');
        const data = await response.json();

        if (data.assets && Array.isArray(data.assets)) {
          // Extract token number from filename (Token1.png -> 1)
          const tokens = data.assets
            .map(asset => {
              const match = asset.name.match(/Token(\d+)\.png/);
              if (match) {
                return {
                  id: parseInt(match[1]),
                  name: asset.name.replace('.png', ''),
                  src: asset.path // R2 URL
                };
              }
              return null;
            })
            .filter(token => token !== null)
            .sort((a, b) => a.id - b.id);

          setTokenList(tokens);

          // Set default token if not already set
          if (tokens.length > 0 && !overlayUrl) {
            setOverlayUrl(tokens[0].src);
            setPreviewTokenUrl(tokens[0].src);
          }
        }
      } catch (error) {
        console.error('Failed to load tokens:', error);
      }
    };

    loadTokens();
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

    setIsProcessing(true);
    setProcessingProgress(0);

    try {
      let croppedImage;
      let compositeImage;

      if (isGif) {
        // For GIFs, use the new GIF processing functions
        // First crop the GIF
        croppedImage = await getCroppedGif(
          croppedImageUrl,
          croppedAreaPixels,
          (progress) => setProcessingProgress(progress * 50) // 50% for cropping
        );

        // Then create composite with token
        compositeImage = await createCompositeGif(
          croppedImage,
          previewTokenUrl,
          (progress) => setProcessingProgress(50 + progress * 50) // Next 50% for compositing
        );

        // Convert blob URL to blob for upload
        const response = await fetch(compositeImage);
        const blob = await response.blob();

        // Upload the final GIF to Firebase Storage
        const storageRef = ref(storage, `characters/${characterId}_final_${Date.now()}.gif`);
        await uploadBytes(storageRef, blob);
        const finalUrl = await getDownloadURL(storageRef);

        // Also upload the cropped version (without token)
        const croppedResponse = await fetch(croppedImage);
        const croppedBlob = await croppedResponse.blob();
        const croppedStorageRef = ref(storage, `characters/${characterId}_cropped_${Date.now()}.gif`);
        await uploadBytes(croppedStorageRef, croppedBlob);
        const croppedUrl = await getDownloadURL(croppedStorageRef);

        croppedImage = croppedUrl;
        compositeImage = finalUrl;
      } else {
        // For non-GIF images, use the existing logic
        croppedImage = await getCroppedImg(croppedImageUrl, croppedAreaPixels);
        compositeImage = await createCompositeImage(croppedImage, previewTokenUrl, false);
      }

      const characterDocRef = doc(db, `cartes/${roomId}/characters`, characterId);

      // Extract token number/name from previewTokenUrl
      let tokenName = 'Token1';

      // If using R2 URL, extract from path
      if (previewTokenUrl.includes('r2.dev')) {
        const match = previewTokenUrl.match(/Token(\d+)\.png/);
        if (match) {
          tokenName = `Token${match[1]}`;
        }
      } else {
        // Fallback for local URLs
        const match = previewTokenUrl.match(/Token(\d+)\.png/);
        tokenName = match ? `Token${match[1]}` : 'Token1';
      }

      // Save both the cropped image and the composite final image
      await updateDoc(characterDocRef, {
        imageURL2: croppedImage,      // Original cropped image (for re-editing)
        imageURLFinal: compositeImage, // Final composite with token
        Token: tokenName,
        isGif: isGif
      });

      setCroppedImageUrl(croppedImage);
      setFinalImageUrl(compositeImage);
      setOverlayUrl(previewTokenUrl);
      setShowCropper(false);
    } catch (e) {
      console.error('Failed to save cropped image:', e);
      alert('Erreur lors de la sauvegarde de l\'image: ' + e.message);
    } finally {
      setIsProcessing(false);
      setProcessingProgress(0);
    }
  }, [croppedAreaPixels, croppedImageUrl, characterId, currentUser, roomId, previewTokenUrl, isGif]);

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

  const handleSelectToken = async (tokenId) => {
    // Find the token in the token list
    const token = tokenList.find(t => t.id === tokenId);
    if (token) {
      setPreviewTokenUrl(token.src);
    }
  };

  const handleImageUpload = async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    // Check if it's a GIF
    const isGifFile = file.type === 'image/gif';
    setIsGif(isGifFile);
    setUploading(true);

    try {
      // Upload to Firebase Storage
      const storageRef = ref(storage, `characters/${characterId}_${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      // Update the cropped image URL with the new uploaded image
      setCroppedImageUrl(downloadUrl);

      // Reset crop and zoom
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setPreviewImage(null);
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('Erreur lors de l\'upload de l\'image');
    } finally {
      setUploading(false);
    }
  };

  if (!currentUser) {
    return <div>Please log in to edit your character image.</div>;
  }

  return (
    <div className="relative w-full h-full flex justify-center items-center mx-auto group min-h-0 min-w-0">
      <div className="relative max-w-full max-h-full aspect-square w-full h-full flex items-center justify-center">
        {finalImageUrl && !isGif ? (
          /* Display composite final image for non-GIF images */
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
        ) : isGif && croppedImageUrl ? (
          /* Display GIF with CSS overlay */
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
        ) : finalImageUrl ? (
          /* Display composite final image (fallback for existing non-GIF composites) */
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

            {isProcessing && (
              <div className="mt-4 sm:mt-6 w-full max-w-lg px-2">
                <div className="bg-[#1c1c1c] rounded-lg p-3 border border-[#3a3a3a]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[#c0a0a0] text-sm font-semibold">Traitement du GIF...</span>
                    <span className="text-[#a0a0a0] text-xs">{Math.round(processingProgress)}%</span>
                  </div>
                  <div className="w-full bg-[#2a2a2a] rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-300"
                      style={{ width: `${processingProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 sm:mt-6 flex flex-wrap justify-center gap-2 sm:gap-3">
              <label className="bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-[#4a4a4a] hover:border-purple-500/50 text-purple-400 px-4 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg cursor-pointer">
                <Upload size={18} />
                {uploading ? 'Upload...' : 'Changer Photo'}
                <input
                  type="file"
                  accept="image/*,.gif"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
              <button
                onClick={handleSaveCroppedImage}
                className="bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-[#4a4a4a] hover:border-green-500/50 text-green-500 px-4 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg"
                disabled={uploading || isProcessing}
              >
                <Check size={18} />
                {isProcessing ? 'Traitement...' : 'Valider'}
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
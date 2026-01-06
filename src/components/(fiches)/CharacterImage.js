import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import { doc, updateDoc, getDoc, db, auth, onAuthStateChanged, storage, ref, uploadBytes, getDownloadURL } from '@/lib/firebase';
import { getCroppedImg, createCompositeImage, getCroppedGif, createCompositeGif } from '@/lib/cropImageHelper';
import { Slider } from '@/components/ui/slider';
import {
  Image as ImageIcon,
  Check,
  X,
  RotateCcw,
  Sparkles,
  Upload,
  ZoomIn,
  Loader2,
  Maximize2,
  Minimize2,
  Wand2,
  Palette
} from 'lucide-react';

export default function CharacterImage({ imageUrl, altText, characterId }) {
  // --- State Management ---
  const [currentUser, setCurrentUser] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [showForge, setShowForge] = useState(false); // "Forge" = The new Editor

  // Image Data
  const [croppedImageUrl, setCroppedImageUrl] = useState(imageUrl || "/api/placeholder/192/192");
  const [finalImageUrl, setFinalImageUrl] = useState(null);

  // Decoration / Tokens
  const [overlayUrl, setOverlayUrl] = useState("/Token/Token1.png");
  const [previewTokenUrl, setPreviewTokenUrl] = useState("/Token/Token1.png");
  const [tokenList, setTokenList] = useState([]);

  // Previews
  const [previewImage, setPreviewImage] = useState(null);

  // Context
  const [roomId, setRoomId] = useState(null);

  // Processing Status
  const [uploading, setUploading] = useState(false);
  const [isGif, setIsGif] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // --- Effects ---

  // 1. Auth & Room
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
      if (user) fetchRoomId(user.uid);
    });
    return () => unsubscribe();
  }, []);

  const fetchRoomId = async (uid) => {
    try {
      const userDoc = await getDoc(doc(db, `users/${uid}`));
      if (userDoc.exists()) setRoomId(userDoc.data().room_id);
    } catch (e) { console.error(e); }
  };

  // 2. Character Data
  useEffect(() => {
    if (!characterId || !roomId) return;
    const fetchChar = async () => {
      try {
        const docSnap = await getDoc(doc(db, `cartes/${roomId}/characters`, characterId));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setCroppedImageUrl(data.imageURL2 || imageUrl || "/api/placeholder/192/192");
          setFinalImageUrl(data.imageURLFinal || null);
          setIsGif(data.isGif || false);

          if (data.Token) {
            // Try to resolve token URL (optimistic)
            // In a real app we might want to wait for the token list, but for now we'll load it when tokens load
            // or just set the name and let the matcher find it.
          }
        }
      } catch (e) { console.error(e); }
    };
    fetchChar();
  }, [characterId, roomId, imageUrl]);

  // 3. Load Tokens (The Armory)
  useEffect(() => {
    const loadTokens = async () => {
      try {
        const res = await fetch('/api/assets?category=Token&type=image');
        const data = await res.json();
        if (data.assets) {
          const tokens = data.assets.map(a => {
            const m = a.name.match(/Token(\d+)\.png/);
            return m ? { id: parseInt(m[1]), name: a.name.replace('.png', ''), src: a.localPath || a.path } : null;
          }).filter(Boolean).sort((a, b) => a.id - b.id);

          setTokenList(tokens);
          if (tokens.length > 0 && !overlayUrl) {
            setOverlayUrl(tokens[0].src);
            setPreviewTokenUrl(tokens[0].src);
          }
        }
      } catch (e) { console.error(e); }
    };
    loadTokens();
  }, []);

  // --- Logic ---

  const onCropComplete = useCallback(async (_, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
    try {
      const preview = await getCroppedImg(croppedImageUrl, croppedAreaPixels);
      setPreviewImage(preview);
    } catch (e) { console.error(e); }
  }, [croppedImageUrl]);

  const handleResetImage = async () => {
    if (!currentUser || !roomId) return;
    try {
      await updateDoc(doc(db, `cartes/${roomId}/characters`, characterId), { imageURL2: imageUrl });
      setCroppedImageUrl(imageUrl);
      setShowForge(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async () => {
    if (!currentUser || !roomId) return;
    setIsProcessing(true);
    setProcessingProgress(0);

    try {
      // 1. Process Image/GIF
      let cropped, composite;
      if (isGif) {
        cropped = await getCroppedGif(croppedImageUrl, croppedAreaPixels, p => setProcessingProgress(p * 50));
        composite = await createCompositeGif(cropped, previewTokenUrl, p => setProcessingProgress(50 + p * 50));

        // Upload GIFs
        const [cBlob, fBlob] = await Promise.all([fetch(cropped).then(r => r.blob()), fetch(composite).then(r => r.blob())]);
        const cRef = ref(storage, `characters/${characterId}_cropped_${Date.now()}.gif`);
        const fRef = ref(storage, `characters/${characterId}_final_${Date.now()}.gif`);

        await Promise.all([uploadBytes(cRef, cBlob), uploadBytes(fRef, fBlob)]);
        [cropped, composite] = await Promise.all([getDownloadURL(cRef), getDownloadURL(fRef)]);
      } else {
        cropped = await getCroppedImg(croppedImageUrl, croppedAreaPixels);
        composite = await createCompositeImage(cropped, previewTokenUrl, false);
      }

      // 2. Identify Token
      const tokenName = tokenList.find(t => t.src === previewTokenUrl)?.name || 'Token1';

      // 3. Update DB
      await updateDoc(doc(db, `cartes/${roomId}/characters`, characterId), {
        imageURL: croppedImageUrl, // Save base image
        imageURL2: cropped,
        imageURLFinal: composite,
        Token: tokenName,
        isGif
      });

      // 4. Update Local State
      setCroppedImageUrl(cropped);
      setFinalImageUrl(composite);
      setOverlayUrl(previewTokenUrl);
      setShowForge(false);

    } catch (e) {
      console.error(e);
      alert("Error saving: " + e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setIsGif(file.type === 'image/gif');

    try {
      const sRef = ref(storage, `characters/${characterId}_${Date.now()}_${file.name}`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);

      setCroppedImageUrl(url);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setPreviewImage(null);
    } catch (e) {
      console.error(e);
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!currentUser) return <div className="text-xs text-neutral-500">Log in to edit</div>;

  // --- RENDER ---

  return (
    <>
      {/* 1. THE PORTAL (Avatar on Sheet) */}
      <div
        onClick={() => setShowForge(true)}
        className="relative group cursor-pointer w-full h-full flex items-center justify-center transition-all duration-500 hover:scale-[1.02]"
      >
        {/* Subtle Glow */}
        <div className="absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/5 transition-colors duration-500" />

        {/* Main Image Container */}
        <div className="relative w-full h-full z-10 drop-shadow-md transition-all duration-300">
          {finalImageUrl ? (
            <img src={finalImageUrl} alt={altText} className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full rounded-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 flex items-center justify-center">
              <ImageIcon className="text-neutral-400" />
            </div>
          )}
        </div>

        {/* Hover Action */}
        <div className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 pt-10 pointer-events-none">
          <div className="bg-neutral-900/90 backdrop-blur-sm border border-white/10 px-3 py-1.5 rounded-full shadow-xl flex items-center gap-2">
            <Wand2 className="text-white w-3 h-3" />
            <span className="text-[10px] font-medium text-white tracking-wide">EDIT</span>
          </div>
        </div>
      </div>

      {/* 2. THE FORGE (Studio Editor) */}
      {showForge && createPortal(
        <div className="fixed inset-0 z-[9999] bg-[#09090b] animate-in fade-in duration-300 flex flex-col overflow-hidden font-sans text-neutral-200">

          {/* Background Texture */}
          <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-[0.02] pointer-events-none" />

          {/* --- HEADER --- */}
          <header className="relative z-50 flex items-center justify-between px-6 py-5 bg-[#09090b]/50 backdrop-blur-sm border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 bg-neutral-800 rounded flex items-center justify-center border border-white/5">
                <ImageIcon className="text-neutral-400 w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-white tracking-wide">
                  Avatar Studio
                </h1>
              </div>
            </div>

            <button
              onClick={() => setShowForge(false)}
              className="p-2 hover:bg-neutral-800 rounded-md transition-colors text-neutral-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          {/* --- MAIN WORKSPACE --- */}
          <main className="flex-1 relative flex flex-col lg:flex-row items-stretch overflow-hidden">

            {/* CENTER: Canvas */}
            <div className="flex-1 relative flex flex-col items-center justify-center p-6 bg-[#0c0c0e]">

              {/* Cropper Frame */}
              <div className="relative w-full max-w-xl aspect-square bg-[#050505] rounded-xl overflow-hidden shadow-2xl border border-white/10 group">
                <Cropper
                  image={croppedImageUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  classes={{
                    containerClassName: "bg-[#050505]",
                    mediaClassName: "opacity-80 transition-opacity duration-300 group-hover:opacity-100"
                  }}
                />

                {/* Live Token Overlay (The "Real" Result) */}
                <div
                  className="pointer-events-none absolute inset-0 z-10 bg-contain bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${previewTokenUrl})` }}
                />

                {/* Minimal Guide (Optional: fade out when interacting if needed, but the token is the guide now) */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none opacity-50">
                  <div className="w-[100%] h-[100%] rounded-full border border-white/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.85)]" />
                </div>
              </div>

              {/* Toolbar */}
              <div className="absolute bottom-8 z-50">
                <div className="bg-[#18181b] border border-white/5 px-4 py-2 rounded-full shadow-2xl flex items-center gap-4">

                  <div className="flex items-center gap-3 w-40 border-r border-white/5 pr-4">
                    <ZoomIn size={14} className="text-neutral-500" />
                    <Slider
                      value={[zoom]}
                      min={1}
                      max={3}
                      step={0.1}
                      onValueChange={(v) => setZoom(v[0])}
                      className="flex-1"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="p-2 rounded-full hover:bg-white/5 text-neutral-400 hover:text-white cursor-pointer transition-colors" title="Upload">
                      <Upload size={16} />
                      <input type="file" className="hidden" accept="image/*,.gif" onChange={handleUpload} disabled={uploading} />
                    </label>
                    <button onClick={handleResetImage} className="p-2 rounded-full hover:bg-white/5 text-neutral-400 hover:text-white transition-colors" title="Reset">
                      <RotateCcw size={16} />
                    </button>
                  </div>

                  <button
                    onClick={handleSave}
                    disabled={isProcessing}
                    className="ml-2 px-5 py-1.5 bg-white hover:bg-neutral-200 text-black text-xs font-bold rounded-full transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                    <span>{isProcessing ? 'Saving...' : 'Save Changes'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT: Token List */}
            <div className="w-full lg:w-80 bg-[#09090b] border-l border-white/5 flex flex-col h-[30vh] lg:h-auto z-10">
              <div className="p-4 border-b border-white/5 bg-[#09090b]">
                <h2 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">
                  Frames
                </h2>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="grid grid-cols-2 gap-3">
                  {tokenList.map((token) => (
                    <button
                      key={token.id}
                      onClick={() => setPreviewTokenUrl(token.src)}
                      className={`group relative aspect-square rounded-xl transition-all duration-200 overflow-hidden flex items-center justify-center p-2 ${previewTokenUrl === token.src
                        ? 'bg-neutral-800 ring-2 ring-white/20'
                        : 'bg-neutral-900/40 hover:bg-neutral-800 border border-transparent hover:border-white/5'
                        }`}
                      title={token.name}
                    >
                      <img
                        src={token.src}
                        className={`w-full h-full object-contain transition-all duration-300 ${previewTokenUrl === token.src ? 'scale-90 opacity-100' : 'opacity-60 group-hover:scale-105 group-hover:opacity-100'
                          }`}
                        alt={token.name}
                      />

                      {previewTokenUrl === token.src && (
                        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white shadow-[0_0_8px_white]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </main>

          {/* Loader Overlay */}
          {isProcessing && (
            <div className="absolute inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <Loader2 className="text-white w-8 h-8 animate-spin" />
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
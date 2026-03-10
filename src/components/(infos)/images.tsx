'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Film } from "lucide-react"

// Define types for categories and image data
type CategoryCounts = { [key: string]: number }
type ImageData = {
  id: string
  src: string
  alt: string
  category?: string
  type?: string
}

// Define the count of images per category
const assetCategories: CategoryCounts = {
  Drakonide: 10,
  Elfe: 10,
  Halfelin: 10,
  Humain: 10,
  Minotaure: 10,
}



const photoCategories: CategoryCounts = {
  Drakonide: 303,
  Elfe: 265,
  Humain: 407,
  Minotaure: 138,
  Nain: 200,
  Orc: 32,
}

// Generate image data with path, count, and file extension
function generateImageData(
  basePath: string,
  category: string,
  count: number,
  extension: string = 'webp',
  isMapOrPhoto: boolean = false
): ImageData[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${category}-${index + 1}`,
    src: isMapOrPhoto
      ? `${basePath}/${category}/image${index + 1}.${extension}` // For maps and photos in subfolders
      : `${basePath}/${category}${index + 1}.${extension}`,       // For assets directly in the folder
    alt: `${category} ${index + 1}`,
  }))
}

interface ImageGridProps {
  images: ImageData[]
}

function ImageGrid({ images }: ImageGridProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 60;

  useEffect(() => {
    setCurrentPage(1);
  }, [images]);

  if (images.length === 0) {
    return <div className="text-center text-[#c0a080]/60 mt-12 font-papyrus text-xl">Aucune image trouvée.</div>;
  }

  const totalPages = Math.ceil(images.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentImages = images.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="flex flex-col w-full h-full pb-8">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-4 mb-8">
        {currentImages.map((image) => (
          <Card key={image.id} className="relative overflow-hidden group aspect-square">
            <CardContent className="p-0 h-full">
              <img
                src={image.src}
                alt={image.alt}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                className="w-full h-full"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/images/placeholder.png'
                }}
              />
              {/* Download button on hover */}
              <a
                href={image.src}
                download
                className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <button className="bg-[#c0a080] px-6 py-2 rounded text-[#1c1c1c] font-bold uppercase tracking-tighter hover:scale-105 transition-transform">Télécharger</button>
              </a>
            </CardContent>
          </Card>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-6 mt-auto">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-5 py-2.5 bg-black/60 border border-[#c0a080]/30 rounded-xl text-[#c0a080] font-papyrus disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#c0a080]/20 hover:border-[#c0a080]/60 transition-all font-bold tracking-wider uppercase text-sm"
          >
            Précédent
          </button>

          <span className="text-[#c0a080] font-papyrus font-bold text-sm tracking-widest uppercase bg-black/40 px-4 py-2 rounded-lg border border-white/5">
            {currentPage} / {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-5 py-2.5 bg-black/60 border border-[#c0a080]/30 rounded-xl text-[#c0a080] font-papyrus disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#c0a080]/20 hover:border-[#c0a080]/60 transition-all font-bold tracking-wider uppercase text-sm"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  )
}

export default function ImageGalleryTabs() {
  const [assetCategory, setAssetCategory] = useState<string>('all')
  const [mapCategory, setMapCategory] = useState<string>('all')
  const [photoCategory, setPhotoCategory] = useState<string>('all')
  const [activeMainTab, setActiveMainTab] = useState<string>('assets')
  const [assetImages, setAssetImages] = useState<ImageData[]>([])
  const [mapImages, setMapImages] = useState<ImageData[]>([])
  const [photoImages, setPhotoImages] = useState<ImageData[]>([])

  const [apiMaps, setApiMaps] = useState<ImageData[]>([])
  const [apiMapCategories, setApiMapCategories] = useState<string[]>([])
  const [assetMap, setAssetMap] = useState<Map<string, string>>(new Map())

  // Load asset mappings once on mount
  useEffect(() => {
    const loadMappings = async () => {
      try {
        const response = await fetch('/asset-mappings.json')
        const data = await response.json()
        const map = new Map<string, string>()
        data.forEach((m: any) => {
          if (m.localPath && m.path) map.set(m.localPath, m.path)
        })
        setAssetMap(map)
      } catch (error) {
        console.error('Error loading asset mappings:', error)
      }
    }
    loadMappings()
  }, [])

  const resolveAsset = (path: string) => assetMap.get(path) || path

  useEffect(() => {
    const generated = assetCategory === 'all'
      ? Object.entries(assetCategories).flatMap(([cat, count]) => generateImageData('/Assets', cat, count, 'png'))
      : generateImageData('/Assets', assetCategory, assetCategories[assetCategory], 'png')

    // Resolve all generated paths through the mapping
    const mapped = generated.map(img => ({
      ...img,
      src: resolveAsset(img.src)
    }))

    setAssetImages(mapped)
  }, [assetCategory, assetMap])

  const getMapCategory = (categoryStr: string): string => {
    const parts = categoryStr.split('/');
    if (parts[0] === 'Cartes') {
      return 'Autres';
    } else if (parts[0] === 'Map' && parts[1]) {
      return parts[1];
    } else {
      return parts[parts.length - 1] || parts[0];
    }
  };

  useEffect(() => {
    const fetchMaps = async () => {
      try {
        const response = await fetch('/api/maps');
        const data = await response.json();
        const maps = data.maps || [];

        // Filter out videos, keep only static images
        const imageMaps = maps.filter((m: any) => m.type === 'image');

        const formattedMaps: ImageData[] = imageMaps.map((m: any, idx: number) => ({
          id: `api-map-${idx}`,
          src: m.path,
          alt: m.name,
          category: getMapCategory(m.category),
          type: m.type
        }));

        const uniqueCategories = Array.from(new Set(formattedMaps.map(m => m.category || '')));

        setApiMaps(formattedMaps);
        setApiMapCategories(uniqueCategories.sort());
      } catch (error) {
        console.error('Error fetching API maps:', error);
      }
    };

    fetchMaps();
  }, []);

  useEffect(() => {
    if (mapCategory === 'all') {
      setMapImages(apiMaps);
    } else {
      setMapImages(apiMaps.filter(m => m.category === mapCategory));
    }
  }, [mapCategory, apiMaps])

  useEffect(() => {
    const generated = photoCategory === 'all'
      ? Object.entries(photoCategories).flatMap(([cat, count]) =>
        Array.from({ length: count }, (_, index) => ({
          id: `${cat}-${index + 1}`,
          src: `/Photos/${cat}/${cat}${index + 1}.webp`,
          alt: `${cat} ${index + 1}`,
        }))
      )
      : Array.from({ length: photoCategories[photoCategory] }, (_, index) => ({
        id: `${photoCategory}-${index + 1}`,
        src: `/Photos/${photoCategory}/${photoCategory}${index + 1}.webp`,
        alt: `${photoCategory} ${index + 1}`,
      }))

    // Resolve all generated paths through the mapping
    const mapped = generated.map(img => ({
      ...img,
      src: resolveAsset(img.src)
    }))

    setPhotoImages(mapped)
  }, [photoCategory, assetMap])

  return (
    <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 bg-black/40 border border-white/10 p-1 rounded-xl">
        <TabsList className="bg-transparent border-none">
          <TabsTrigger value="assets" className="flex items-center gap-2 data-[state=active]:bg-[#c0a080] data-[state=active]:text-[#1c1c1c] text-[#c0a080]/70">Personnages</TabsTrigger>
          <TabsTrigger value="maps" className="flex items-center gap-2 data-[state=active]:bg-[#c0a080] data-[state=active]:text-[#1c1c1c] text-[#c0a080]/70">Cartes</TabsTrigger>
          <TabsTrigger value="photos" className="flex items-center gap-2 data-[state=active]:bg-[#c0a080] data-[state=active]:text-[#1c1c1c] text-[#c0a080]/70">Photos</TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-4 px-2">
          {activeMainTab === 'assets' && (
            <Select value={assetCategory} onValueChange={setAssetCategory}>
              <SelectTrigger className="w-[180px] bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]">
                <SelectValue placeholder="Catégorie..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white">
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {Object.keys(assetCategories).map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {activeMainTab === 'maps' && (
            <Select value={mapCategory} onValueChange={setMapCategory}>
              <SelectTrigger className="w-[180px] bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]">
                <SelectValue placeholder="Carte..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white">
                <SelectItem value="all">Toutes les cartes</SelectItem>
                {apiMapCategories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {activeMainTab === 'photos' && (
            <Select value={photoCategory} onValueChange={setPhotoCategory}>
              <SelectTrigger className="w-[180px] bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]">
                <SelectValue placeholder="Catégorie..." />
              </SelectTrigger>
              <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white">
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {Object.keys(photoCategories).map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Assets Tab */}
      <TabsContent value="assets">
        <ImageGrid images={assetImages} />
      </TabsContent>

      {/* Maps Tab */}
      <TabsContent value="maps">
        <ImageGrid images={mapImages} />
      </TabsContent>

      {/* Photos Tab */}
      <TabsContent value="photos">
        <ImageGrid images={photoImages} />
      </TabsContent>
    </Tabs>
  )
}

'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Define types for categories and image data
type CategoryCounts = { [key: string]: number }
type ImageData = {
  id: string
  src: string
  alt: string
}

// Define the count of images per category
const assetCategories: CategoryCounts = {
  Drakonide: 10,
  Elfe: 10,
  Halfelin: 10,
  Humain: 10,
  Minotaure: 4,
}

const mapCategories: CategoryCounts = {
  Autre: 10,
  Camps: 10,
  Farm: 9,
  Foret: 29,
  Village: 14,
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
      {images.map((image) => (
        <Card key={image.id} className="relative overflow-hidden group h-[400]"> {/* Increased card height */}
          <CardContent className="p-0 h-full">
            <Image
              src={image.src}
              alt={image.alt}
              width={400}
              height={800}  // Adjusted height for larger display
              className="w-full h-full object-cover" // Ensures the image covers the entire card
            />
            {/* Download button on hover */}
            <a
              href={image.src}
              download
              className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <button className="bg-white p-2 rounded text-gray-800">Télécharger</button>
            </a>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function ImageGalleryTabs() {
  const [assetCategory, setAssetCategory] = useState<string>('all')
  const [mapCategory, setMapCategory] = useState<string>('all')
  const [photoCategory, setPhotoCategory] = useState<string>('all')
  const [assetImages, setAssetImages] = useState<ImageData[]>([])
  const [mapImages, setMapImages] = useState<ImageData[]>([])
  const [photoImages, setPhotoImages] = useState<ImageData[]>([])

  useEffect(() => {
    const images = assetCategory === 'all'
      ? Object.entries(assetCategories).flatMap(([cat, count]) => generateImageData('/Assets', cat, count, 'png'))
      : generateImageData('/Assets', assetCategory, assetCategories[assetCategory], 'png')
    setAssetImages(images)
  }, [assetCategory])

  useEffect(() => {
    const images = mapCategory === 'all'
      ? Object.entries(mapCategories).flatMap(([cat, count]) => generateImageData('/Cartes', cat, count, 'webp', true))
      : generateImageData('/Cartes', mapCategory, mapCategories[mapCategory], 'webp', true)
    setMapImages(images)
  }, [mapCategory])

  useEffect(() => {
    const images = photoCategory === 'all'
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
    setPhotoImages(images)
  }, [photoCategory])
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Galerie d'Images</h1>
      <Tabs defaultValue="assets" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="assets">Personnages</TabsTrigger>
          <TabsTrigger value="maps">Cartes</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
        </TabsList>
        
        {/* Assets Tab */}
        <TabsContent value="assets">
          <div className="flex justify-end mb-4">
            <Select value={assetCategory} onValueChange={setAssetCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Choisir une catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {Object.keys(assetCategories).map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ImageGrid images={assetImages} />
        </TabsContent>
        
        {/* Maps Tab */}
        <TabsContent value="maps">
          <div className="flex justify-end mb-4">
            <Select value={mapCategory} onValueChange={setMapCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Choisir une carte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les cartes</SelectItem>
                {Object.keys(mapCategories).map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ImageGrid images={mapImages} />
        </TabsContent>
        
        {/* Photos Tab */}
        <TabsContent value="photos">
          <div className="flex justify-end mb-4 text-blue">
            <Select value={photoCategory} onValueChange={setPhotoCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Choisir une catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {Object.keys(photoCategories).map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ImageGrid images={photoImages} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

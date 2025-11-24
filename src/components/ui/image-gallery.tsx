import { cn } from "@/lib/utils";

interface ImageGalleryProps {
  images?: string[];
  className?: string;
}

export function ImageGallery({ images: customImages, className = '' }: ImageGalleryProps) {
  // Default images - using local map images
  const defaultImages = [
    "/Cartes/Foret/image2.webp",
    "/Cartes/Village/image2.webp",
    "/Cartes/Camps/image3.webp",
    "/Cartes/Farm/image2.webp",
    "/Cartes/Autre/image2.webp",
    "/Cartes/Foret/image3.webp",
  ];

  const images = customImages || defaultImages;

  return (
    <div className={`flex items-center gap-2 h-[400px] w-full ${className}`}>
      {images.map((src, idx) => (
        <div
          key={idx}
          className="relative group flex-grow transition-all w-56 rounded-lg overflow-hidden h-[400px] duration-500 hover:w-full"
        >
          <img
            className="h-full w-full object-cover object-center"
            src={src}
            alt={`Carte ${idx + 1}`}
          />
        </div>
      ))}
    </div>
  );
}

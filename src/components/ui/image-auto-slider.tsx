import React from 'react';
import { mapImagePath } from '@/utils/imagePathMapper';

interface ImageAutoSliderProps {
  images?: string[];
  className?: string;
}

export const ImageAutoSlider = ({ images: customImages, className = '' }: ImageAutoSliderProps) => {
  // Default local paths that will be mapped to R2
  const defaultLocalPaths = [
    "/Photos/Nain/Nain235.webp",
    "/Photos/Elfe/Elfe34.webp",
    "/Photos/Humain/Humain1.webp",
    "/Photos/Orc/Orc1.webp",
    "/Photos/Drakonide/Drakonide1.webp",
    "/Photos/Nain/Nain100.webp",
    "/Photos/Elfe/Elfe100.webp",
    "/Photos/Humain/Humain200.webp",
  ];

  const [images, setImages] = React.useState<string[]>(customImages || []);

  React.useEffect(() => {
    if (!customImages) {
      // Map local paths to R2 URLs
      const loadImages = async () => {
        const mappedImages = await Promise.all(
          defaultLocalPaths.map(path => mapImagePath(path))
        );
        setImages(mappedImages);
      };
      loadImages();
    }
  }, [customImages]);

  // Duplicate images for seamless loop
  const duplicatedImages = [...images, ...images];

  return (
    <>
      <style>{`
        @keyframes scroll-right {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        .infinite-scroll {
          animation: scroll-right 30s linear infinite;
        }

        .scroll-container {
          mask: linear-gradient(
            90deg,
            transparent 0%,
            black 10%,
            black 90%,
            transparent 100%
          );
          -webkit-mask: linear-gradient(
            90deg,
            transparent 0%,
            black 10%,
            black 90%,
            transparent 100%
          );
        }

        .image-item {
          transition: transform 0.3s ease, filter 0.3s ease;
        }

        .image-item:hover {
          transform: scale(1.05);
          filter: brightness(1.1);
        }
      `}</style>

      <div className={`w-full relative overflow-hidden ${className}`}>
        {/* Scrolling images container */}
        <div className="scroll-container w-full">
          <div className="infinite-scroll flex gap-6 w-max">
            {duplicatedImages.map((image, index) => (
              <div
                key={index}
                className="image-item flex-shrink-0 w-48 h-48 md:w-56 md:h-56 rounded-2xl overflow-hidden shadow-xl border-2 border-gray-200 dark:border-gray-700"
              >
                <img
                  src={image}
                  alt={`Portrait ${(index % images.length) + 1}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

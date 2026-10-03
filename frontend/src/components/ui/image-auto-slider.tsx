'use client';
import React from 'react';
import { useInView } from 'framer-motion';
import { vignette } from '@/lib/assets';

interface ImageAutoSliderProps {
  images?: string[];
  className?: string;
}

// Portraits de la bibliothèque (CDN), en vignettes de 448 px : la tuile fait
// 224 px au plus, 2x pour les écrans denses (au lieu de ~500 Ko chacun).
const DEFAULT_IMAGES = [
  'Nain/Nain235',
  'Elfe/Elfe34',
  'Humain/Humain1',
  'Orc/Orc1',
  'Drakonide/Drakonide1',
  'Nain/Nain100',
  'Elfe/Elfe100',
  'Humain/Humain200',
].map((p) => vignette(`https://assets.yner.fr/Photos/${p}.webp`, 448));

export const ImageAutoSlider = ({ images: customImages, className = '' }: ImageAutoSliderProps) => {
  const images = customImages ?? DEFAULT_IMAGES;
  // Défilement en pause quand le bandeau n'est pas à l'écran
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef, { margin: '100px' });

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

        @media (prefers-reduced-motion: reduce) {
          .infinite-scroll {
            animation: none;
          }
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

      <div ref={containerRef} className={`w-full relative overflow-hidden ${className}`}>
        {/* Scrolling images container */}
        <div className="scroll-container w-full">
          <div
            className="infinite-scroll flex gap-6 w-max"
            style={{ animationPlayState: inView ? 'running' : 'paused' }}
          >
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
                  decoding="async"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

"use client"

import React, { useRef } from 'react';

// ⚡ Static Token Component for Performance Mode (Moved Outside Component to avoid Remounting/Flickering)
const StaticToken = React.memo(({ src, alt, style, className, performanceMode }: { src: string, alt: string, style?: React.CSSProperties, className?: string, performanceMode: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = src?.toLowerCase().endsWith('.webm') || src?.toLowerCase().endsWith('.mp4');

  if (performanceMode === 'static') {
    if (isVideo) {
      // 🎥 Static Video (Paused)
      return (
        <video
          ref={videoRef}
          src={src}
          style={{ ...style, objectFit: 'cover' }}
          className={className}
          muted
          playsInline
          onLoadedData={(e) => {
            e.currentTarget.currentTime = 0; // First frame
            e.currentTarget.pause(); // Ensure paused
          }}
        />
      );
    } else {
      // 🖼️ Static Image (Frozen GIF) - Use img instead of canvas for proper objectFit support
      return (
        <img
          src={src}
          alt={alt}
          style={style}
          className={className}
          draggable={false}
        />
      );
    }
  }

  // 🚀 Animated Default
  if (isVideo) {
    return <img src={src} alt={alt} style={style} className={className} draggable={false} />;
  }
  return <img src={src} alt={alt} style={style} className={className} draggable={false} />;
});

StaticToken.displayName = 'StaticToken';

export default StaticToken;

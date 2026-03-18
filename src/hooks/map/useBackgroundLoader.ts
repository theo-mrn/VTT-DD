import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Hook that manages background image/video loading for the map.
 *
 * Handles:
 * - Fetching the background with progress tracking (via ReadableStream)
 * - Blob-based loading for CORS-safe canvas access
 * - Fallback loading when blob fetch fails (CORS issues)
 * - Video element lifecycle (play/pause, cleanup)
 * - Performance mode integration (pause video in static mode)
 */

interface UseBackgroundLoaderParams {
  /** The background URL to load (image or video). Null means no background. */
  backgroundImage: string | null;
  /** Performance mode from settings; controls video playback. */
  performanceMode: 'high' | 'eco' | 'static';
}

interface UseBackgroundLoaderReturn {
  /** The loaded HTMLImageElement or HTMLVideoElement ready for canvas drawing. */
  bgImageObject: HTMLImageElement | HTMLVideoElement | null;
  /** Setter exposed so external code (e.g. useMapData callbacks) can override the image object. */
  setBgImageObject: React.Dispatch<React.SetStateAction<HTMLImageElement | HTMLVideoElement | null>>;
  /** Whether the background is currently being fetched/loaded. */
  isBackgroundLoading: boolean;
  /** Download progress percentage (0-100). Only meaningful when content-length is available. */
  loadingProgress: number;
}

export function useBackgroundLoader({
  backgroundImage,
  performanceMode,
}: UseBackgroundLoaderParams): UseBackgroundLoaderReturn {
  const [bgImageObject, setBgImageObject] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ── Fallback loader (no progress, direct element src) ────────────────────
  const loadBackgroundFallback = useCallback((url: string) => {
    const cacheBustedUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;

    const isVideo = url.toLowerCase().includes('.webm') || url.toLowerCase().includes('.mp4');
    if (isVideo) {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.src = cacheBustedUrl;
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.volume = 0;
      video.playsInline = true;

      video.onloadedmetadata = () => {
        setBgImageObject(video);
        setIsBackgroundLoading(false);
        video.play().catch((e) => console.error('Video play error:', e));
      };
      videoRef.current = video;
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = cacheBustedUrl;
      img.onload = () => {
        setBgImageObject(img);
        setIsBackgroundLoading(false);
      };
      img.onerror = () => {
        // Attempt recovery without CORS (will taint canvas but show image)
        console.warn('CORS load failed. Trying without CORS.');
        const imgNoCors = new Image();
        imgNoCors.removeAttribute('crossOrigin');
        imgNoCors.src = url; // Use original URL for non-CORS fallback
        imgNoCors.onload = () => {
          setBgImageObject(imgNoCors);
          setIsBackgroundLoading(false);
        };
        imgNoCors.onerror = (e) => {
          console.error('Non-CORS Load Failed:', e, url);
          setIsBackgroundLoading(false);
        };
      };
    }
  }, []);

  // ── Primary loader (blob fetch with progress) ───────────────────────────
  const loadBackground = useCallback(
    async (url: string) => {
      setIsBackgroundLoading(true);
      setLoadingProgress(0);

      // Cleanup any previous video element
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
        videoRef.current = null;
      }

      const cacheBustedUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;

      try {
        const response = await fetch(cacheBustedUrl, { cache: 'reload', mode: 'cors' });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const contentLength = response.headers.get('content-length');
        const total = parseInt(contentLength || '0', 10);

        const reader = response.body?.getReader();
        if (!reader) throw new Error('Impossible de lire le flux');

        const chunks: BlobPart[] = [];
        let receivedLength = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          receivedLength += value.length;

          if (total > 0) {
            setLoadingProgress(Math.round((receivedLength / total) * 100));
          }
        }

        const blob = new Blob(chunks);
        const objectUrl = URL.createObjectURL(blob);

        const isVideo = url.toLowerCase().includes('.webm') || url.toLowerCase().includes('.mp4');

        if (isVideo) {
          const video = document.createElement('video');
          video.src = objectUrl;
          video.autoplay = true;
          video.loop = true;
          video.muted = true;
          video.volume = 0;
          video.playsInline = true;

          video.onloadedmetadata = () => {
            setBgImageObject(video);
            setIsBackgroundLoading(false);
            video.play().catch((e) => console.error('Video play error:', e));
          };
          video.onerror = () => {
            setIsBackgroundLoading(false);
            loadBackgroundFallback(url);
          };
          videoRef.current = video;
        } else {
          const img = new Image();
          img.src = objectUrl;
          img.onload = () => {
            setBgImageObject(img);
            setIsBackgroundLoading(false);
          };
          img.onerror = () => {
            setIsBackgroundLoading(false);
            loadBackgroundFallback(url);
          };
        }
      } catch (error) {
        console.warn(
          'Chargement avec progression echoue (CORS probable), passage en chargement standard...',
          error
        );
        loadBackgroundFallback(url);
      }
    },
    [loadBackgroundFallback]
  );

  // ── Trigger loading when backgroundImage URL changes ─────────────────────
  useEffect(() => {
    if (backgroundImage) {
      loadBackground(backgroundImage);
    } else {
      setIsBackgroundLoading(false);
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
        videoRef.current = null;
      }
    };
  }, [backgroundImage, loadBackground]);

  // ── Sync video playback with performance mode ────────────────────────────
  useEffect(() => {
    if (bgImageObject instanceof HTMLVideoElement) {
      bgImageObject.muted = true;
      bgImageObject.volume = 0;

      if (performanceMode === 'static') {
        bgImageObject.pause();
      } else {
        bgImageObject.play().catch(() => {});
      }
    }
  }, [bgImageObject, performanceMode]);

  return {
    bgImageObject,
    setBgImageObject,
    isBackgroundLoading,
    loadingProgress,
  };
}

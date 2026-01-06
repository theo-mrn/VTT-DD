// cropImageHelper.js
import { parseGIF, decompressFrames } from 'gifuct-js';
import GIF from 'gif.js';

const VIEWPORT_SIZE = 320; // Standard size for all processing
const TOKEN_SCALE = 1.25; // Scale token up to give more room for character

const loadImage = (url) => new Promise((resolve, reject) => {
  const loadWithProxy = (originalUrl) => {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(originalUrl)}`;
    const imgProxy = new Image();
    imgProxy.crossOrigin = 'anonymous';
    imgProxy.onload = () => resolve(imgProxy);
    imgProxy.onerror = (e) => reject(new Error(`Failed to load image via proxy: ${originalUrl}`));
    imgProxy.src = proxyUrl;
  };

  const img = new Image();
  // Only set crossOrigin if it's not a data URL
  if (url && !url.startsWith('data:')) {
    img.crossOrigin = 'anonymous';
  }

  img.onload = () => resolve(img);
  img.onerror = () => {
    // If direct load fails and it's not a data URL, try the proxy
    if (url && !url.startsWith('data:')) {
      console.warn(`Direct load failed for ${url}, trying proxy...`);
      loadWithProxy(url);
    } else {
      reject(new Error(`Failed to load image: ${url.substring(0, 100)}`));
    }
  };
  img.src = url;
});

export const getCroppedImg = (imageSrc, pixelCrop) => {
  return new Promise(async (resolve, reject) => {
    try {
      const image = await loadImage(imageSrc);

      const canvas = document.createElement('canvas');
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      const base64Image = canvas.toDataURL('image/png');
      resolve(base64Image);
    } catch (e) {
      reject(e);
    }
  });
};

// Crop a GIF by processing each frame
export const getCroppedGif = async (gifUrl, pixelCrop, onProgress = null) => {
  try {
    // Load the GIF
    const response = await fetch(gifUrl);
    const arrayBuffer = await response.arrayBuffer();
    const gif = parseGIF(arrayBuffer);
    const frames = decompressFrames(gif, true);

    if (!frames || frames.length === 0) {
      throw new Error('No frames found in GIF');
    }

    // Create GIF encoder
    const encoder = new GIF({
      workers: 2,
      quality: 10,
      width: pixelCrop.width,
      height: pixelCrop.height,
      workerScript: '/gif.worker.js'
    });

    // Process each frame
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];

      // Create a temporary canvas for the original frame
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = gif.lsd.width;
      tempCanvas.height = gif.lsd.height;
      const tempCtx = tempCanvas.getContext('2d');

      // Create ImageData from frame patch
      const imageData = tempCtx.createImageData(gif.lsd.width, gif.lsd.height);

      // Fill with transparent or background color
      const transparentIndex = frame.gce?.transparentColorIndex ?? -1;

      // Copy frame data
      for (let j = 0; j < frame.pixels.length; j++) {
        const colorIndex = frame.pixels[j];
        if (colorIndex === transparentIndex) {
          imageData.data[j * 4 + 3] = 0; // Transparent
        } else {
          const color = frame.colorTable[colorIndex] || [0, 0, 0];
          imageData.data[j * 4] = color[0];     // R
          imageData.data[j * 4 + 1] = color[1]; // G
          imageData.data[j * 4 + 2] = color[2]; // B
          imageData.data[j * 4 + 3] = 255;      // A
        }
      }

      tempCtx.putImageData(imageData, 0, 0);

      // Create cropped canvas
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = pixelCrop.width;
      croppedCanvas.height = pixelCrop.height;
      const croppedCtx = croppedCanvas.getContext('2d');

      // Draw cropped region
      croppedCtx.drawImage(
        tempCanvas,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      // Add frame to encoder
      encoder.addFrame(croppedCtx, {
        delay: frame.delay || 100,
        copy: true
      });

      if (onProgress) {
        onProgress((i + 1) / frames.length * 0.7); // 70% for frame processing
      }
    }

    // Render the GIF
    return new Promise((resolve, reject) => {
      encoder.on('finished', (blob) => {
        if (onProgress) onProgress(1.0);
        resolve(URL.createObjectURL(blob));
      });

      encoder.on('progress', (p) => {
        if (onProgress) {
          onProgress(0.7 + p * 0.3); // Last 30% for encoding
        }
      });

      encoder.render();
    });
  } catch (error) {
    console.error('Error cropping GIF:', error);
    throw error;
  }
};

// Create composite image with token overlay
export const createCompositeImage = (croppedImageSrc, tokenSrc, isGif = false) => {
  return new Promise((resolve, reject) => {
    const tokenSize = VIEWPORT_SIZE * TOKEN_SCALE; // Token is larger
    const targetSize = tokenSize; // Canvas must fit the full token
    const imageSize = VIEWPORT_SIZE; // Character fills the box

    // For GIFs, we can't composite directly without losing animation
    // Return the GIF as-is to handle overlay via CSS
    if (isGif) {
      resolve(croppedImageSrc);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d', { alpha: true });

    // Ensure the canvas is completely transparent
    ctx.clearRect(0, 0, targetSize, targetSize);

    const loadImages = async () => {
      try {
        const characterImage = await loadImage(croppedImageSrc);

        // Draw character image (centered)
        const imageX = (targetSize - imageSize) / 2;
        const imageY = (targetSize - imageSize) / 2;

        // Create circular clipping path for the character image
        ctx.save();
        ctx.beginPath();
        ctx.arc(targetSize / 2, targetSize / 2, (imageSize / 2) - 2, 0, Math.PI * 2); // Slight inset to avoid bleed
        ctx.closePath();
        ctx.clip();

        // Draw the character image
        ctx.drawImage(characterImage, imageX, imageY, imageSize, imageSize);
        ctx.restore();

        // Load and draw token overlay
        const tokenImage = await loadImage(tokenSrc);

        // Draw token overlay centered (preserving its transparency)
        const tokenX = (targetSize - tokenSize) / 2;
        const tokenY = (targetSize - tokenSize) / 2;
        ctx.drawImage(tokenImage, tokenX, tokenY, tokenSize, tokenSize);

        // Convert to base64 PNG with maximum quality (preserves transparency)
        const base64Image = canvas.toDataURL('image/png', 1.0);
        resolve(base64Image);

      } catch (e) {
        reject(e);
      }
    };

    loadImages();
  });
};

// Create composite GIF with token overlay on each frame
export const createCompositeGif = async (gifUrl, tokenSrc, onProgress = null) => {
  try {
    const tokenSize = VIEWPORT_SIZE * TOKEN_SCALE; // Token is larger
    const targetSize = tokenSize; // Canvas must fit the full token
    const imageSize = VIEWPORT_SIZE; // Use full size for GIFs now too

    // Load the GIF
    const response = await fetch(gifUrl);
    const arrayBuffer = await response.arrayBuffer();
    const gif = parseGIF(arrayBuffer);
    const frames = decompressFrames(gif, true);

    if (!frames || frames.length === 0) {
      throw new Error('No frames found in GIF');
    }

    // Load token image
    const tokenImage = await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = tokenSrc;
    });

    // Create GIF encoder
    const encoder = new GIF({
      workers: 2,
      quality: 10,
      width: targetSize,
      height: targetSize,
      workerScript: '/gif.worker.js',
      transparent: 0x000000
    });

    // Process each frame
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];

      // Create composite canvas
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');

      // Clear with transparency
      ctx.clearRect(0, 0, targetSize, targetSize);

      // Create temporary canvas for frame
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = gif.lsd.width;
      tempCanvas.height = gif.lsd.height;
      const tempCtx = tempCanvas.getContext('2d');

      // Create ImageData from frame
      const imageData = tempCtx.createImageData(gif.lsd.width, gif.lsd.height);
      const transparentIndex = frame.gce?.transparentColorIndex ?? -1;

      for (let j = 0; j < frame.pixels.length; j++) {
        const colorIndex = frame.pixels[j];
        if (colorIndex === transparentIndex) {
          imageData.data[j * 4 + 3] = 0;
        } else {
          const color = frame.colorTable[colorIndex] || [0, 0, 0];
          imageData.data[j * 4] = color[0];
          imageData.data[j * 4 + 1] = color[1];
          imageData.data[j * 4 + 2] = color[2];
          imageData.data[j * 4 + 3] = 255;
        }
      }

      tempCtx.putImageData(imageData, 0, 0);

      // Draw character image (centered and full size)
      const imageX = (targetSize - imageSize) / 2;
      const imageY = (targetSize - imageSize) / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(targetSize / 2, targetSize / 2, (imageSize / 2) - 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(tempCanvas, imageX, imageY, imageSize, imageSize);
      ctx.restore();

      // Draw token overlay
      const tokenX = (targetSize - tokenSize) / 2;
      const tokenY = (targetSize - tokenSize) / 2;
      ctx.drawImage(tokenImage, tokenX, tokenY, tokenSize, tokenSize);

      // Add frame to encoder
      encoder.addFrame(ctx, {
        delay: frame.delay || 100,
        copy: true
      });

      if (onProgress) {
        onProgress((i + 1) / frames.length * 0.7);
      }
    }

    // Render the GIF
    return new Promise((resolve, reject) => {
      encoder.on('finished', (blob) => {
        if (onProgress) onProgress(1.0);
        resolve(URL.createObjectURL(blob));
      });

      encoder.on('progress', (p) => {
        if (onProgress) {
          onProgress(0.7 + p * 0.3);
        }
      });

      encoder.render();
    });
  } catch (error) {
    console.error('Error creating composite GIF:', error);
    throw error;
  }
};

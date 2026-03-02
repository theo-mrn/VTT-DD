// cropImageHelper.js
const VIEWPORT_SIZE = 400; // Resolution matching the UI's square container

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
  if (url && !url.startsWith('data:')) {
    img.crossOrigin = 'anonymous';
  }

  img.onload = () => resolve(img);
  img.onerror = () => {
    if (url && !url.startsWith('data:')) {
      console.warn(`Direct load failed for ${url}, trying proxy...`);
      loadWithProxy(url);
    } else {
      reject(new Error(`Failed to load image: ${url.substring(0, 100)}`));
    }
  };
  img.src = url;
});

// Returns exactly what is seen in the cropper as a 400x400 PNG
export const getCroppedImg = async (imageSrc, pixelCrop) => {
  const image = await loadImage(imageSrc);

  // 1. Create a canvas matching the crop area exactly
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = pixelCrop.width;
  cropCanvas.height = pixelCrop.height;
  const cropCtx = cropCanvas.getContext('2d', { alpha: true });

  // Clear with transparency (handles empty space if zoomed out)
  cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);

  // Draw the image shifted by the inverted crop coordinates
  cropCtx.drawImage(image, -pixelCrop.x, -pixelCrop.y);

  // 2. Create the final 400x400 output canvas
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = VIEWPORT_SIZE;
  finalCanvas.height = VIEWPORT_SIZE;
  const finalCtx = finalCanvas.getContext('2d', { alpha: true });

  finalCtx.clearRect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);

  // 3. Scale the cropped image seamlessly into the final viewport
  finalCtx.drawImage(cropCanvas, 0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);

  return finalCanvas.toDataURL('image/png', 1.0);
};

// Composites the token directly over the character (1:1 ratio)
export const createCompositeImage = async (croppedImageSrc, tokenSrc) => {
  const [characterImage, tokenImage] = await Promise.all([
    loadImage(croppedImageSrc),
    loadImage(tokenSrc)
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = VIEWPORT_SIZE;
  canvas.height = VIEWPORT_SIZE;
  const ctx = canvas.getContext('2d', { alpha: true });

  ctx.clearRect(0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);

  // 1. Draw Character (already cropped and scaled to 400x400)
  // We apply a circle clip to ensure it doesn't bleed outside the token's hole
  ctx.save();
  ctx.beginPath();
  ctx.arc(VIEWPORT_SIZE / 2, VIEWPORT_SIZE / 2, VIEWPORT_SIZE / 2 - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(characterImage, 0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);
  ctx.restore();

  // 2. Draw Token (exactly 400x400)
  ctx.drawImage(tokenImage, 0, 0, VIEWPORT_SIZE, VIEWPORT_SIZE);

  return canvas.toDataURL('image/png', 1.0);
};

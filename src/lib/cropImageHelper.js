// cropImageHelper.js
export const getCroppedImg = (imageSrc, pixelCrop) => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous"; // Allow cross-origin images if they have the correct headers
    image.src = imageSrc;

    image.onload = () => {
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

      // Get the base64-encoded string of the cropped image
      const base64Image = canvas.toDataURL('image/jpeg');
      resolve(base64Image);
    };

    image.onerror = () => reject(new Error('Failed to load image'));
  });
};

// Create composite image with token overlay
export const createCompositeImage = (croppedImageSrc, tokenSrc) => {
  return new Promise((resolve, reject) => {
    const targetSize = 320; // Final composite size
    const imageSize = 256; // Size of the circular character image
    const tokenSize = 320; // Size of the token overlay

    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d', { alpha: true });

    // Ensure the canvas is completely transparent
    ctx.clearRect(0, 0, targetSize, targetSize);

    const characterImage = new Image();
    characterImage.crossOrigin = "anonymous";

    characterImage.onload = () => {
      // Draw circular character image in the center
      const imageX = (targetSize - imageSize) / 2;
      const imageY = (targetSize - imageSize) / 2;

      // Create circular clipping path for the character image
      ctx.save();
      ctx.beginPath();
      ctx.arc(targetSize / 2, targetSize / 2, imageSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Draw the character image
      ctx.drawImage(characterImage, imageX, imageY, imageSize, imageSize);
      ctx.restore();

      // Load and draw token overlay
      const tokenImage = new Image();
      tokenImage.crossOrigin = "anonymous";

      tokenImage.onload = () => {
        // Draw token overlay centered (preserving its transparency)
        const tokenX = (targetSize - tokenSize) / 2;
        const tokenY = (targetSize - tokenSize) / 2;
        ctx.drawImage(tokenImage, tokenX, tokenY, tokenSize, tokenSize);

        // Convert to base64 PNG with maximum quality (preserves transparency)
        const base64Image = canvas.toDataURL('image/png', 1.0);
        resolve(base64Image);
      };

      tokenImage.onerror = () => reject(new Error('Failed to load token image'));
      tokenImage.src = tokenSrc;
    };

    characterImage.onerror = () => reject(new Error('Failed to load character image'));
    characterImage.src = croppedImageSrc;
  });
};

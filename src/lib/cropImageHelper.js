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

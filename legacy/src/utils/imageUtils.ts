
export const getDominantColor = (imageUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageUrl;

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 1;
                canvas.height = 1;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve('#000000');
                    return;
                }

                ctx.drawImage(img, 0, 0, 1, 1);
                const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;

                // Convert to Hex
                const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
                resolve(hex);
            } catch (e) {
                console.error("Error extracting color", e);
                resolve('#FF5733'); // Fallback (Bright Orange-Red)
            }
        };

        img.onerror = () => {
            console.warn("Error loading image for color extraction");
            resolve('#FF5733'); // Fallback (Bright Orange-Red)
        };
    });
};

// 🆕 Helper to get readable text color (Black or White) based on background hex
export const getContrastColor = (hexcolor: string): string => {
    // If invalid hex, default to white text
    if (!hexcolor || !hexcolor.startsWith('#')) return '#ffffff';

    // Convert hex to RGB
    const r = parseInt(hexcolor.substr(1, 2), 16);
    const g = parseInt(hexcolor.substr(3, 2), 16);
    const b = parseInt(hexcolor.substr(5, 2), 16);

    // Calculate YIQ ratio
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;

    // Return black for light backgrounds, white for dark
    return (yiq >= 128) ? '#000000' : '#ffffff';
};

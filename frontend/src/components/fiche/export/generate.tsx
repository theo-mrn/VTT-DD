/**
 * Génère le PDF des fiches dans le navigateur et le télécharge. @react-pdf/renderer et les
 * gabarits ne se chargent qu'ici, au premier export. Les portraits (souvent en WebP, que le
 * PDF ne lit pas) sont redessinés en JPEG ; un portrait illisible est simplement omis.
 */
import { vignette } from '@/lib/assets';
import type { SheetSnapshot } from './snapshot';
import type { SheetLabels } from './pdf/sheet-document';
import type { SheetStyle } from './pdf/themes';

const PORTRAIT_PX = 360;

function portraitJpeg(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    const fin = setTimeout(() => resolve(null), 6000);
    img.onload = () => {
      clearTimeout(fin);
      try {
        const ratio = Math.min(1, PORTRAIT_PX / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * ratio);
        canvas.height = Math.round(img.naturalHeight * ratio);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      } catch {
        // Image d'une autre origine sans autorisation : pas de portrait
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(fin);
      resolve(null);
    };
    img.src = vignette(url, PORTRAIT_PX);
  });
}

/** Nom de fichier sûr : « Brom le Nain.pdf » → « Brom-le-Nain.pdf ». */
export function pdfFileName(base: string) {
  const propre = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '-');
  // Tirets retirés aux deux bouts (sans expression régulière à retours en arrière)
  let debut = 0;
  let fin = propre.length;
  while (debut < fin && propre[debut] === '-') debut++;
  while (fin > debut && propre[fin - 1] === '-') fin--;
  const nom = propre.slice(debut, fin).slice(0, 80);
  return `${nom || 'fiche'}.pdf`;
}

export async function downloadSheetsPdf(options: {
  sheets: readonly SheetSnapshot[];
  style: SheetStyle;
  labels: SheetLabels;
  title: string;
  fileName: string;
}) {
  const [{ pdf }, { SheetDocument }, portraits] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./pdf/sheet-document'),
    Promise.all(options.sheets.map((s) => (s.portraitUrl ? portraitJpeg(s.portraitUrl) : null))),
  ]);
  const blob = await pdf(
    <SheetDocument
      sheets={options.sheets}
      portraits={portraits}
      style={options.style}
      labels={options.labels}
      title={options.title}
    />,
  ).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = options.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

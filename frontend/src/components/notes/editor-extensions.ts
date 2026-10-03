/**
 * Extensions de l'éditeur pour les notes écrites avec l'ancien éditeur : images
 * du texte et alignement des paragraphes, affichés et conservés tels quels.
 */
import { Extension, mergeAttributes, Node } from '@tiptap/react';

/** Largeur d'image (en pixels) lue sur l'attribut `width`. */
function largeur(el: HTMLElement): number | null {
  const w = Number.parseInt(el.getAttribute('width') ?? '', 10);
  return Number.isFinite(w) && w > 0 && w <= 4000 ? w : null;
}

/** Image du texte (bloc) : source, texte de remplacement, titre et largeur. */
export const ImageNote = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: null, parseHTML: largeur },
    };
  },
  parseHTML() {
    return [{ tag: 'img[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },
});

const ALIGNEMENTS = new Set(['left', 'center', 'right', 'justify']);

/** Alignement des paragraphes et intertitres (attribut `style`). */
export const AlignementTexte = Extension.create({
  name: 'textAlign',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (el: HTMLElement) =>
              ALIGNEMENTS.has(el.style.textAlign) ? el.style.textAlign : null,
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.textAlign ? { style: `text-align: ${String(attrs.textAlign)}` } : {},
          },
        },
      },
    ];
  },
});

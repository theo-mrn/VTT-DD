/**
 * Notes (service campaign) : notes personnelles, ou rattachées à une campagne
 * et partagées avec le MJ ou toute la table. Contenu en HTML produit par
 * l'éditeur (TipTap), assaini à l'affichage par le moteur de l'éditeur.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import {
  erreurLocale,
  lireCollection,
  maintenant,
  modifierCollection,
  nouvelId,
  serviceActif,
  utilisateurLocal,
} from './depot-local';

export type TypeNote = 'libre' | 'personnage' | 'lieu' | 'objet' | 'quete' | 'journal';
/** `private` : l'auteur seul ; `gm` : l'auteur et le MJ ; `room` : toute la campagne. */
export type VisibiliteNote = 'private' | 'gm' | 'room';

export interface Note {
  id: string;
  title: string;
  content: string;
  icon: string | null;
  kind: TypeNote;
  tags: string[];
  pinned: boolean;
  roomId: string | null;
  visibility: VisibiliteNote;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export type ModificationNote = Partial<
  Pick<Note, 'title' | 'content' | 'icon' | 'kind' | 'tags' | 'pinned' | 'roomId' | 'visibility'>
>;

export const TYPES_NOTE: { id: TypeNote; label: string; icone: string }[] = [
  { id: 'libre', label: 'Note', icone: '📝' },
  { id: 'journal', label: 'Journal', icone: '📖' },
  { id: 'quete', label: 'Quête', icone: '🧭' },
  { id: 'personnage', label: 'Personnage', icone: '🧙' },
  { id: 'lieu', label: 'Lieu', icone: '🏰' },
  { id: 'objet', label: 'Objet', icone: '🗝️' },
];

/** Emoji d'une note : le sien, sinon celui de son type. */
export function iconeNote(n: Pick<Note, 'icon' | 'kind'>): string {
  return n.icon ?? TYPES_NOTE.find((t) => t.id === n.kind)?.icone ?? '📝';
}

/** Texte brut d'une note (recherche, aperçus). */
export function texteNote(html: string): string {
  return html
    .replace(/<(br|\/p|\/h\d|\/li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Dépôt local ─────────────────────────────────────────────────────────────

const COLLECTION = 'notes';

function aMoi(n: Note | undefined, moi: string): Note {
  if (!n || n.authorId !== moi) throw erreurLocale('Note introuvable', 404);
  return n;
}

const local = {
  lister(): Note[] {
    const moi = utilisateurLocal().id;
    return lireCollection<Note>(COLLECTION)
      .filter((n) => n.authorId === moi)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  creer(modif: ModificationNote): Note {
    const moi = utilisateurLocal();
    const date = maintenant();
    const note: Note = {
      title: '',
      content: '',
      icon: null,
      kind: 'libre',
      tags: [],
      pinned: false,
      roomId: null,
      visibility: 'private',
      ...modif,
      id: nouvelId(),
      authorId: moi.id,
      authorName: moi.name,
      createdAt: date,
      updatedAt: date,
    };
    return modifierCollection<Note, Note>(COLLECTION, (toutes) => ({
      elements: [...toutes, note],
      resultat: note,
    }));
  },

  modifier(id: string, modif: ModificationNote): Note {
    const moi = utilisateurLocal().id;
    return modifierCollection<Note, Note>(COLLECTION, (toutes) => {
      const i = toutes.findIndex((n) => n.id === id);
      const suivante = { ...aMoi(toutes[i], moi), ...modif, updatedAt: maintenant() };
      const elements = [...toutes];
      elements[i] = suivante;
      return { elements, resultat: suivante };
    });
  },

  supprimer(id: string): void {
    const moi = utilisateurLocal().id;
    modifierCollection<Note, void>(COLLECTION, (toutes) => {
      aMoi(
        toutes.find((n) => n.id === id),
        moi,
      );
      return { elements: toutes.filter((n) => n.id !== id), resultat: undefined };
    });
  },
};

// ─── Accès (API ou dépôt local) ──────────────────────────────────────────────

const distant = () => serviceActif('campaign');
const url = (id: string) => `/v1/rooms/notes/${encodeURIComponent(id)}`;

export const notes = {
  lister: () => (distant() ? api<Note[]>('/v1/rooms/notes?author=me') : local.lister()),
  creer: (m: ModificationNote) =>
    distant()
      ? api<Note>('/v1/rooms/notes', { method: 'POST', body: JSON.stringify(m) })
      : local.creer(m),
  modifier: (id: string, m: ModificationNote) =>
    distant()
      ? api<Note>(url(id), { method: 'PATCH', body: JSON.stringify(m) })
      : local.modifier(id, m),
  supprimer: (id: string) =>
    distant() ? api<void>(url(id), { method: 'DELETE' }) : local.supprimer(id),
};

// ─── Hooks de domaine ────────────────────────────────────────────────────────

export const clesNotes = { toutes: ['notes'] as const };

export function useNotes() {
  return useQuery({ queryKey: clesNotes.toutes, queryFn: async () => notes.lister() });
}

/** Remplace une note dans la liste en cache (sans recharger : l'éditeur enregistre souvent). */
function remplacer(liste: Note[] | undefined, note: Note): Note[] {
  const autres = (liste ?? []).filter((n) => n.id !== note.id);
  return [note, ...autres];
}

export function useCreerNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (m: ModificationNote) => notes.creer(m),
    onSuccess: (n) => client.setQueryData<Note[]>(clesNotes.toutes, (l) => remplacer(l, n)),
  });
}

export function useModifierNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...m }: ModificationNote & { id: string }) => notes.modifier(id, m),
    onSuccess: (n) => client.setQueryData<Note[]>(clesNotes.toutes, (l) => remplacer(l, n)),
  });
}

export function useSupprimerNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => notes.supprimer(id),
    onSuccess: (_, id) =>
      client.setQueryData<Note[]>(clesNotes.toutes, (l) => (l ?? []).filter((n) => n.id !== id)),
  });
}

'use client'

import * as React from "react";
import { useState, useEffect } from "react";
import { X, Tag, Search, Book, MapPin, User, Plus, Upload, MoreVertical, Edit, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { db, auth, addDoc, collection, doc, updateDoc, deleteDoc, onSnapshot, getDoc, onAuthStateChanged } from "@/lib/firebase";

interface Tag {
  id: string;
  label: string;
  color?: string;
}

interface UseTagsProps {
  onChange?: (tags: Tag[]) => void;
  defaultTags?: Tag[];
  maxTags?: number;
  defaultColors?: string[];
}

function useTags({
  onChange,
  defaultTags = [],
  maxTags = 10,
  defaultColors = [
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  ],
}: UseTagsProps = {}) {
  const [tags, setTags] = useState<Tag[]>(defaultTags);

  function addTag(tag: Tag) {
    if (tags.length >= maxTags) return;

    const newTags = [
      ...tags,
      {
        ...tag,
        color: tag.color || defaultColors[tags.length % defaultColors.length],
      },
    ];
    setTags(newTags);
    onChange?.(newTags);
    return newTags;
  }

  function removeTag(tagId: string) {
    const newTags = tags.filter((t) => t.id !== tagId);
    setTags(newTags);
    onChange?.(newTags);
    return newTags;
  }

  function removeLastTag() {
    if (tags.length === 0) return;
    return removeTag(tags[tags.length - 1].id);
  }

  return {
    tags,
    setTags,
    addTag,
    removeTag,
    removeLastTag,
    hasReachedMax: tags.length >= maxTags,
  };
}

interface Note {
  id: string;
  title: string;
  content: string;
  type: "character" | "location" | "item" | "other";
  tags: Tag[];
  createdAt: Date;
  updatedAt: Date;
  image?: string;
  // Champs spécifiques aux personnages
  race?: string;
  class?: string;
  // Champs spécifiques aux lieux
  region?: string;
  // Champs spécifiques aux objets
  itemType?: string;
}

interface TagsInputProps {
  onChange?: (tags: Tag[]) => void;
  defaultTags?: Tag[];
  maxTags?: number;
}

function TagsInput({ onChange, defaultTags = [], maxTags = 10 }: TagsInputProps) {
  const [inputValue, setInputValue] = useState("");
  const { tags, addTag, removeTag, removeLastTag, hasReachedMax } = useTags({
    maxTags,
    defaultTags,
    onChange,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !inputValue) {
      e.preventDefault();
      removeLastTag();
    }
    if (e.key === "Enter" && inputValue) {
      e.preventDefault();
      addTag({ id: inputValue.toLowerCase(), label: inputValue });
      setInputValue("");
    }
  };

  return (
    <div className="w-full space-y-2">
      <div className="rounded-lg border border-input bg-background p-1">
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm",
                tag.color || "bg-primary/10 text-primary"
              )}
            >
              {tag.label}
              <button
                onClick={() => removeTag(tag.id)}
                className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasReachedMax ? "Max tags reached" : "Add tag..."}
            disabled={hasReachedMax}
            className="flex-1 bg-transparent px-2 py-1 text-sm outline-none placeholder:text-[var(--text-primary)] disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  );
}

function ImageUpload({ image, onImageChange }: { image?: string; onImageChange: (image: string | undefined) => void }) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        onImageChange(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    onImageChange(undefined);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Image</label>
      {image ? (
        <div className="relative">
          <img src={image} alt="Note" className="w-full h-48 object-cover rounded-lg" />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={removeImage}
            className="absolute top-2 right-2"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            id="image-upload"
          />
          <label
            htmlFor="image-upload"
            className="cursor-pointer flex flex-col items-center gap-2"
          >
            <Upload className="h-8 w-8 text-gray-400" />
            <span className="text-sm text-gray-500">Cliquez pour ajouter une image</span>
          </label>
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, onEdit, onDelete }: { note: Note; onEdit: (note: Note) => void; onDelete: (noteId: string) => void }) {
  return (
    <Card className="card overflow-hidden rounded-xl border border-[var(--border-color)]">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <h3 className="font-bold text-lg text-[var(--accent-brown)]">{note.title}</h3>
          <div className="flex gap-1">
            {note.type === "character" && <User className="h-4 w-4 text-blue-500" />}
            {note.type === "location" && <MapPin className="h-4 w-4 text-green-500" />}
            {note.type === "item" && <Book className="h-4 w-4 text-amber-500" />}
            {note.type === "other" && <Tag className="h-4 w-4 text-purple-500" />}
          </div>
        </div>

        {/* Informations spécifiques selon le type */}
        {note.type === "character" && (
          <div className="text-sm text-[var(--text-primary)] mb-2 opacity-75">
            {note.race && <span className="mr-3">Race: {note.race}</span>}
            {note.class && <span className="mr-3">Classe: {note.class}</span>}
          </div>
        )}
        
        {note.type === "location" && (
          <div className="text-sm text-[var(--text-primary)] mb-2 opacity-75">
            {note.region && <span className="mr-3">Région: {note.region}</span>}
          </div>
        )}
        
        {note.type === "item" && (
          <div className="text-sm text-[var(--text-primary)] mb-2 opacity-75">
            {note.itemType && <span className="mr-3">Type: {note.itemType}</span>}
          </div>
        )}

        {/* Image placée après le titre et les infos */}
        {note.image && (
          <div className="relative h-48 w-full mb-3 rounded-lg overflow-hidden">
            <img src={note.image} alt={note.title} className="w-full h-full object-cover" />
          </div>
        )}
        
        <p className="text-sm text-[var(--text-primary)] line-clamp-3 mb-3 whitespace-pre-wrap">{note.content}</p>
        
        <div className="flex flex-wrap gap-1 mt-2 mb-3">
          {note.tags.map((tag) => (
            <span
              key={tag.id}
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs",
                tag.color || "bg-primary/10 text-primary"
              )}
            >
              {tag.label}
            </span>
          ))}
        </div>
        
        <div className="flex justify-end mt-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="rounded-full">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-lg">
              <DropdownMenuItem onClick={() => onEdit(note)}>
                <Edit className="mr-2 h-4 w-4" />
                Modifier
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onDelete(note.id)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

function NoteEditor({ 
  note, 
  onSave, 
  onCancel 
}: { 
  note?: Note; 
  onSave: (note: Note) => void; 
  onCancel: () => void 
}) {
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.content || "");
  const [type, setType] = useState<"character" | "location" | "item" | "other">(note?.type || "character");
  const [tags, setTags] = useState<Tag[]>(note?.tags || []);
  const [image, setImage] = useState<string | undefined>(note?.image);
  
  // Champs spécifiques aux personnages
  const [race, setRace] = useState(note?.race || "");
  const [characterClass, setCharacterClass] = useState(note?.class || "");
  
  // Champs spécifiques aux lieux
  const [region, setRegion] = useState(note?.region || "");
  
  // Champs spécifiques aux objets
  const [itemType, setItemType] = useState(note?.itemType || "");

  const handleSave = () => {
    if (!title.trim()) return;
    
    const updatedNote: Note = {
      id: note?.id || Date.now().toString(),
      title,
      content,
      type,
      tags,
      image,
      createdAt: note?.createdAt || new Date(),
      updatedAt: new Date(),
      // Champs conditionnels selon le type
      ...(type === "character" && { race, class: characterClass }),
      ...(type === "location" && { region }),
      ...(type === "item" && { itemType }),
    };
    
    onSave(updatedNote);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Titre</label>
        <Input 
          value={title} 
          onChange={(e) => setTitle(e.target.value)} 
          placeholder="Titre de la note" 
        />
      </div>
    
      <div className="space-y-2">
        <label className="text-sm font-medium">Type</label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={type === "character" ? "default" : "outline"}
            size="sm"
            onClick={() => setType("character")}
            className="flex gap-2"
          >
            <User className="h-4 w-4" /> Personnage
          </Button>
          <Button
            type="button"
            variant={type === "location" ? "default" : "outline"}
            size="sm"
            onClick={() => setType("location")}
            className="flex gap-2"
          >
            <MapPin className="h-4 w-4" /> Lieu
          </Button>
          <Button
            type="button"
            variant={type === "item" ? "default" : "outline"}
            size="sm"
            onClick={() => setType("item")}
            className="flex gap-2"
          >
            <Book className="h-4 w-4" /> Objet
          </Button>
          <Button
            type="button"
            variant={type === "other" ? "default" : "outline"}
            size="sm"
            onClick={() => setType("other")}
            className="flex gap-2"
          >
            <Tag className="h-4 w-4" /> Autre
          </Button>
        </div>
      </div>
    
      {/* Champs spécifiques selon le type */}
      {type === "character" && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Race</label>
            <Input 
              value={race} 
              onChange={(e) => setRace(e.target.value)} 
              placeholder="Elfe, Humain, Nain..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Classe</label>
            <Input 
              value={characterClass} 
              onChange={(e) => setCharacterClass(e.target.value)} 
              placeholder="Guerrier, Magicien, Voleur..."
            />
          </div>
        </div>
      )}

      {type === "location" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Région</label>
          <Input 
            value={region} 
            onChange={(e) => setRegion(e.target.value)} 
            placeholder="Forêt, Montagne, Désert..."
          />
        </div>
      )}

      {type === "item" && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Type d&apos;objet</label>
          <Input 
            value={itemType} 
            onChange={(e) => setItemType(e.target.value)} 
            placeholder="Arme, Armure, Potion..."
          />
        </div>
      )}

      <ImageUpload image={image} onImageChange={setImage} />

      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <Textarea 
          value={content} 
          onChange={(e) => setContent(e.target.value)} 
          placeholder="Écrivez votre description ici..." 
          className="min-h-[200px]"
        />
      </div>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Tags</label>
        <TagsInput 
          defaultTags={tags} 
          onChange={setTags} 
        />
      </div>
        
              <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onCancel} className="button-cancel">Annuler</Button>
          <Button onClick={handleSave} className="button-primary">Sauvegarder</Button>
        </div>
    </div>
  );
}

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [character, setCharacter] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const userData = userDoc.data();
            setRoomId(String(userData.room_id));
            setCharacter(String(userData.perso));
          } else {
            setError("Données utilisateur non trouvées");
          }
        } catch (err) {
          setError("Erreur lors du chargement des données utilisateur");
          console.error(err);
        }
      } else {
        setError("Utilisateur non connecté");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (roomId && character) {
      const notesCollectionRef = collection(db, 'Notes', roomId, character);

      const unsubscribe = onSnapshot(notesCollectionRef, (snapshot) => {
        try {
          const notesData = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              title: data.title || "",
              content: data.content || "",
              type: data.type || "other",
              tags: data.tags || [],
              image: data.image,
              race: data.race,
              class: data.class,
              region: data.region,
              itemType: data.itemType,
              createdAt: data.createdAt?.toDate() || new Date(),
              updatedAt: data.updatedAt?.toDate() || new Date(),
            } as Note;
          });
          setNotes(notesData);
          setError(null);
        } catch (err) {
          setError("Erreur lors du chargement des notes");
          console.error(err);
        }
      });

      return () => unsubscribe();
    }
  }, [roomId, character]);
  
  const filteredNotes = notes.filter((note: Note) => {
    const matchesSearch = searchTerm === "" || 
      note.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      note.content.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });
  
  const handleSaveNote = async (updatedNote: Note) => {
    if (!roomId || !character) return;
    
    try {
      const notesCollectionRef = collection(db, 'Notes', roomId, character);
      
      // Créer l'objet de base avec les champs obligatoires
      const noteData: any = {
        title: updatedNote.title,
        content: updatedNote.content,
        type: updatedNote.type,
        tags: updatedNote.tags,
        updatedAt: new Date(),
      };

      // Ajouter les champs optionnels seulement s'ils ne sont pas undefined
      if (updatedNote.image !== undefined) {
        noteData.image = updatedNote.image;
      }
      if (updatedNote.race !== undefined) {
        noteData.race = updatedNote.race;
      }
      if (updatedNote.class !== undefined) {
        noteData.class = updatedNote.class;
      }
      if (updatedNote.region !== undefined) {
        noteData.region = updatedNote.region;
      }
      if (updatedNote.itemType !== undefined) {
        noteData.itemType = updatedNote.itemType;
      }

      if (editingNote) {
        const noteDocRef = doc(db, 'Notes', roomId, character, updatedNote.id);
        await updateDoc(noteDocRef, noteData);
        setEditingNote(null);
      } else {
        await addDoc(notesCollectionRef, {
          ...noteData,
          createdAt: new Date(),
        });
        setIsCreating(false);
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      setError("Erreur lors de la sauvegarde de la note");
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!roomId || !character) return;
    
    try {
      const noteDocRef = doc(db, 'Notes', roomId, character, noteId);
      await deleteDoc(noteDocRef);
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      setError("Erreur lors de la suppression de la note");
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-4 min-h-screen bg-[var(--bg-dark)] text-[var(--text-primary)]">
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-brown)]" />
          <span className="ml-2 text-[var(--text-primary)]">Chargement...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-4 min-h-screen bg-[var(--bg-dark)] text-[var(--text-primary)]">
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="text-red-500 mb-2">❌ Erreur</div>
            <p className="text-[var(--text-primary)]">{error}</p>
            <p className="text-sm text-[var(--text-primary)] mt-2">
              Vérifiez votre connexion et réessayez dans quelques instants.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="max-w-6xl mx-auto p-4 min-h-screen bg-[var(--bg-dark)] text-[var(--text-primary)]">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-[var(--accent-brown)]">Notes</h1>
        <Button onClick={() => setIsCreating(true)} className="button-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Nouvelle Note
        </Button>
      </div>
      
      {(isCreating || editingNote) ? (
        <Card className="card mb-6">
          <CardContent className="pt-6">
            <h2 className="text-xl font-bold mb-4 text-[var(--accent-brown)]">{editingNote ? "Modifier la Note" : "Créer une Nouvelle Note"}</h2>
            <NoteEditor 
              note={editingNote || undefined} 
              onSave={handleSaveNote} 
              onCancel={() => {
                setEditingNote(null);
                setIsCreating(false);
              }} 
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-[var(--text-primary)]" />
                              <Input
                  placeholder="Rechercher des notes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field pl-9"
                />
            </div>
          </div>
          
          <Tabs defaultValue="all">
            <TabsList className="mb-4">
              <TabsTrigger value="all">Toutes les Notes</TabsTrigger>
              <TabsTrigger value="characters">Personnages</TabsTrigger>
              <TabsTrigger value="locations">Lieux</TabsTrigger>
              <TabsTrigger value="items">Objets</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredNotes.length > 0 ? (
                  filteredNotes.map((note: Note) => (
                    <NoteCard key={note.id} note={note} onEdit={setEditingNote} onDelete={handleDeleteNote} />
                  ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <p className="text-[var(--text-primary)]">Aucune note trouvée. Essayez d&apos;ajuster vos filtres ou créez une nouvelle note.</p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="characters" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredNotes.filter((note: Note) => note.type === "character").length > 0 ? (
                  filteredNotes
                    .filter((note: Note) => note.type === "character")
                    .map((note: Note) => (
                      <NoteCard key={note.id} note={note} onEdit={setEditingNote} onDelete={handleDeleteNote} />
                    ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <p className="text-[var(--text-primary)]">Aucune note de personnage trouvée.</p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="locations" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredNotes.filter((note: Note) => note.type === "location").length > 0 ? (
                  filteredNotes
                    .filter((note: Note) => note.type === "location")
                    .map((note: Note) => (
                      <NoteCard key={note.id} note={note} onEdit={setEditingNote} onDelete={handleDeleteNote} />
                    ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <p className="text-[var(--text-primary)]">Aucune note de lieu trouvée.</p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="items" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredNotes.filter((note: Note) => note.type === "item").length > 0 ? (
                  filteredNotes
                    .filter((note: Note) => note.type === "item")
                    .map((note: Note) => (
                      <NoteCard key={note.id} note={note} onEdit={setEditingNote} onDelete={handleDeleteNote} />
                    ))
                ) : (
                  <div className="col-span-full text-center py-12">
                    <p className="text-[var(--text-primary)]">Aucune note d&apos;objet trouvée.</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

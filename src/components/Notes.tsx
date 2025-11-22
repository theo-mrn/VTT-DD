'use client'

import * as React from "react";
import Image from "next/image";
import { useState, useEffect } from "react";
import { X, Tag, Search, Book, MapPin, User, Plus, Upload, MoreVertical, Edit, Trash2, Loader2, ChevronDown, ChevronUp, Scroll, CheckCircle2, Circle, Clock } from "lucide-react";
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
import { motion, AnimatePresence } from "framer-motion";
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

interface SubQuest {
  id: string;
  title: string;
  description: string;
  status: "not-started" | "in-progress" | "completed";
}

interface Note {
  id: string;
  title: string;
  content: string;
  type: "character" | "location" | "item" | "quest" | "other";
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
  // Champs spécifiques aux quêtes
  questType?: "principale" | "annexe";
  questStatus?: "not-started" | "in-progress" | "completed";
  subQuests?: SubQuest[];
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
        <div className="relative h-48">
          <Image src={image} alt="Note" fill className="object-cover rounded-lg" sizes="100vw" />
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

function NoteCard({ note, onEdit, onDelete, onUpdateSubQuest, className = "", index = 0 }: { note: Note; onEdit: (note: Note) => void; onDelete: (noteId: string) => void; onUpdateSubQuest: (noteId: string, subQuestId: string) => void; className?: string; index?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isContentTruncated, setIsContentTruncated] = useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Déterminer la taille de la carte selon le contenu réel pour un vrai style bento
  const getCardSize = () => {
    const contentLength = note.content.length;
    const lineCount = (note.content.match(/\n/g) || []).length + 1;
    const hasImage = !!note.image;
    const titleLength = note.title.length;
    const tagsCount = note.tags.length;
    
    // Estimer les lignes de titre (environ 30 caractères par ligne sur mobile)
    const titleLines = Math.ceil(titleLength / 30);
    
    // Estimer les lignes de contenu (environ 40 caractères par ligne visible)
    const estimatedContentLines = Math.max(lineCount, Math.ceil(contentLength / 40));
    
    // Score basé sur la richesse du contenu
    const titleScore = titleLines * 20;
    const contentScore = estimatedContentLines * 12;
    const imageScore = hasImage ? 60 : 0;
    const tagsScore = tagsCount * 8;
    
    const totalScore = titleScore + contentScore + imageScore + tagsScore;
    
    // Style bento dynamique avec variété basée sur l'index
    const isEvenPosition = index % 2 === 0;
    const isSpecialPosition = index % 5 === 0 || index % 7 === 0; // Positions spéciales pour plus de variété
    
    if (hasImage) {
      // Toutes les cartes avec image prennent de la place
      if (totalScore > 120 || estimatedContentLines > 5) return "large"; // Grande carte avec image
      return "wide"; // Carte large avec image
    }
    
    // Logique plus agressive pour créer de la variété
    if (titleLength > 40 || estimatedContentLines > 6) return "large"; // Contenu très riche
    if (titleLength > 25 || estimatedContentLines > 4 || tagsCount > 2) return "wide"; // Contenu riche
    
    // Ajouter de la variété avec les positions spéciales
    if (isSpecialPosition && (titleLength > 20 || estimatedContentLines > 3)) return "wide";
    if (isEvenPosition && estimatedContentLines > 3) return "tall"; // Cartes hautes en position paire
    if (estimatedContentLines > 2 || titleLength > 15) return "medium"; // Contenu court
    return "small"; // Contenu minimal
  };

  const cardSize = getCardSize();

  // Classes CSS pour le layout bento
  const getCardClasses = () => {
    const baseClasses = "group transition-all duration-300 hover:scale-[1.02] hover:shadow-xl";
    
    switch (cardSize) {
      case "large":
        return `${baseClasses} bento-large`;
      case "wide":
        return `${baseClasses} bento-wide`;
      case "tall":
        return `${baseClasses} bento-tall`;
      case "medium":
        return `${baseClasses} bento-medium`;
      default:
        return `${baseClasses} bento-small`;
    }
  };

  // Vérifier si le contenu est tronqué
  useEffect(() => {
    if (contentRef.current) {
      const element = contentRef.current;
      setIsContentTruncated(element.scrollHeight > element.clientHeight);
    }
  }, [note.content, isExpanded]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={getCardClasses()}
    >
      <Card className={`card overflow-hidden rounded-xl border border-[var(--border-color)] hover:shadow-lg transition-all duration-200 hover:border-[var(--accent-brown)]/30 h-full ${className}`}>
        <CardContent className="p-4 h-full flex flex-col">
        {/* En-tête: icône + titre + menu actions */}
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {(() => {
              const typeColorClass = note.type === "character"
                ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                : note.type === "location"
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : note.type === "item"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : note.type === "quest"
                ? "bg-orange-500/10 border-orange-500/30 text-orange-400"
                : "bg-purple-500/10 border-purple-500/30 text-purple-400";
              return (
                <div className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border flex-shrink-0 mt-0.5",
                  typeColorClass
                )}>
                  {note.type === "character" && <User className="h-4 w-4" />}
                  {note.type === "location" && <MapPin className="h-4 w-4" />}
                  {note.type === "item" && <Book className="h-4 w-4" />}
                  {note.type === "quest" && <Scroll className="h-4 w-4" />}
                  {note.type === "other" && <Tag className="h-4 w-4" />}
                </div>
              );
            })()}
            <h3 className="font-semibold text-base sm:text-lg text-[var(--accent-brown)] leading-tight break-words hyphens-auto">
              {note.title}
            </h3>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-[var(--accent-brown)]/10 flex-shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-lg">
              <DropdownMenuItem onClick={() => onEdit(note)}>
                <Edit className="mr-2 h-4 w-4" />
                Modifier
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(note.id)} className="text-red-600 focus:text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Méta-informations sous le titre */}
        {(note.type === "character" || note.type === "location" || note.type === "item" || note.type === "quest") && (
          <div className="text-[10px] sm:text-xs text-[var(--text-primary)] mb-3 opacity-75 flex flex-wrap gap-2">
            {note.type === "character" && note.race && (
              <span className="bg-blue-900/20 px-2 py-1 rounded text-blue-300">Race: {note.race}</span>
            )}
            {note.type === "character" && note.class && (
              <span className="bg-green-900/20 px-2 py-1 rounded text-green-300">Classe: {note.class}</span>
            )}
            {note.type === "location" && note.region && (
              <span className="bg-purple-900/20 px-2 py-1 rounded text-purple-300">Région: {note.region}</span>
            )}
            {note.type === "item" && note.itemType && (
              <span className="bg-amber-900/20 px-2 py-1 rounded text-amber-300">Type: {note.itemType}</span>
            )}
            {note.type === "quest" && note.questType && (
              <span className={cn(
                "px-2 py-1 rounded flex items-center gap-1 font-semibold",
                note.questType === "principale" ? "bg-purple-900/30 text-purple-300 border border-purple-500/30" :
                "bg-blue-900/20 text-blue-300"
              )}>
                {note.questType === "principale" ? " Quête Principale" : " Quête Annexe"}
              </span>
            )}
            {note.type === "quest" && note.questStatus && (
              <span className={cn(
                "px-2 py-1 rounded flex items-center gap-1",
                note.questStatus === "completed" ? "bg-green-900/20 text-green-300" :
                note.questStatus === "in-progress" ? "bg-yellow-900/20 text-yellow-300" :
                "bg-gray-900/20 text-gray-300"
              )}>
                {note.questStatus === "completed" && <CheckCircle2 className="h-3 w-3" />}
                {note.questStatus === "in-progress" && <Clock className="h-3 w-3" />}
                {note.questStatus === "not-started" && <Circle className="h-3 w-3" />}
                {note.questStatus === "completed" ? "Terminée" : 
                 note.questStatus === "in-progress" ? "En cours" : 
                 "Non commencée"}
              </span>
            )}
            {note.type === "quest" && note.subQuests && note.subQuests.length > 0 && (
              <span className="bg-orange-900/20 px-2 py-1 rounded text-orange-300">
                {note.subQuests.filter(sq => sq.status === "completed").length}/{note.subQuests.length} sous-quêtes
              </span>
            )}
          </div>
        )}

        {/* Corps: vignette + contenu */}
        <div className={cn(
          "flex-1 mb-3",
          note.image ? "grid grid-cols-1 md:grid-cols-3 gap-3" : ""
        )}>
          {note.image && (
            <div className="relative rounded-lg overflow-hidden md:col-span-1 aspect-square md:aspect-auto h-32 md:h-full">
              <Image src={note.image} alt={note.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
            </div>
          )}
          <div className={cn(note.image ? "md:col-span-2" : "", "flex flex-col")}>
            <div 
              ref={contentRef}
              className={cn(
                "text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed break-words hyphens-auto flex-1",
                !isExpanded ? "line-clamp-6" : ""
              )}
            >
              {note.content}
            </div>
            {isContentTruncated && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-2 h-6 px-2 text-xs self-start text-[var(--accent-brown)] hover:bg-[var(--accent-brown)]/10"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-3 w-3 mr-1" />
                    Voir moins
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Voir plus
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Sous-quêtes */}
        {note.type === "quest" && note.subQuests && note.subQuests.length > 0 && (
          <div className="mb-3 space-y-2">
            <h4 className="text-xs font-semibold text-[var(--accent-brown)] mb-2">Sous-quêtes :</h4>
            {note.subQuests.map((subQuest) => (
              <div key={subQuest.id} className="bg-[var(--bg-medium)]/50 rounded-lg p-2 border border-[var(--border-color)]/30">
                <div className="flex items-start gap-2">
                  <button 
                    className="mt-0.5 cursor-pointer hover:scale-110 transition-transform focus:outline-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateSubQuest(note.id, subQuest.id);
                    }}
                    title="Changer le statut"
                  >
                    {subQuest.status === "completed" && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                    {subQuest.status === "in-progress" && <Clock className="h-4 w-4 text-yellow-400" />}
                    {subQuest.status === "not-started" && <Circle className="h-4 w-4 text-gray-400" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium",
                      subQuest.status === "completed" ? "line-through opacity-60" : ""
                    )}>
                      {subQuest.title}
                    </p>
                    {subQuest.description && (
                      <p className="text-xs text-[var(--text-primary)] opacity-75 mt-1">{subQuest.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tags */}
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3 flex-shrink-0">
            {note.tags.map((tag) => (
              <span
                key={tag.id}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-1 text-[10px] sm:text-xs",
                  tag.color || "bg-primary/10 text-primary"
                )}
              >
                {tag.label}
              </span>
            ))}
          </div>
        )}

        {/* Pied de carte */}
        <div className="flex justify-between items-center mt-auto pt-3 border-t border-[var(--border-color)]/30 flex-shrink-0">
          <div className="text-xs text-[var(--text-primary)] opacity-60">
            {note.updatedAt.toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit'
            })}
          </div>
        </div>
      </CardContent>
    </Card>
    </motion.div>
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
  const [type, setType] = useState<"character" | "location" | "item" | "quest" | "other">(note?.type || "character");
  const [tags, setTags] = useState<Tag[]>(note?.tags || []);
  const [image, setImage] = useState<string | undefined>(note?.image);
  
  // Champs spécifiques aux personnages
  const [race, setRace] = useState(note?.race || "");
  const [characterClass, setCharacterClass] = useState(note?.class || "");
  
  // Champs spécifiques aux lieux
  const [region, setRegion] = useState(note?.region || "");
  
  // Champs spécifiques aux objets
  const [itemType, setItemType] = useState(note?.itemType || "");
  
  // Champs spécifiques aux quêtes
  const [questType, setQuestType] = useState<"principale" | "annexe">(note?.questType || "principale");
  const [questStatus, setQuestStatus] = useState<"not-started" | "in-progress" | "completed">(note?.questStatus || "not-started");
  const [subQuests, setSubQuests] = useState<SubQuest[]>(note?.subQuests || []);

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
      ...(type === "quest" && { questType, questStatus, subQuests }),
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
        <div className="flex flex-wrap gap-2">
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
            variant={type === "quest" ? "default" : "outline"}
            size="sm"
            onClick={() => setType("quest")}
            className="flex gap-2"
          >
            <Scroll className="h-4 w-4" /> Quête
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

      {type === "quest" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Type de quête</label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={questType === "principale" ? "default" : "outline"}
                size="sm"
                onClick={() => setQuestType("principale")}
                className="flex gap-2"
              >
                Principale
              </Button>
              <Button
                type="button"
                variant={questType === "annexe" ? "default" : "outline"}
                size="sm"
                onClick={() => setQuestType("annexe")}
                className="flex gap-2"
              >
                Annexe
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Statut de la quête</label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={questStatus === "not-started" ? "default" : "outline"}
                size="sm"
                onClick={() => setQuestStatus("not-started")}
                className="flex gap-2"
              >
                <Circle className="h-4 w-4" /> Non commencée
              </Button>
              <Button
                type="button"
                variant={questStatus === "in-progress" ? "default" : "outline"}
                size="sm"
                onClick={() => setQuestStatus("in-progress")}
                className="flex gap-2"
              >
                <Clock className="h-4 w-4" /> En cours
              </Button>
              <Button
                type="button"
                variant={questStatus === "completed" ? "default" : "outline"}
                size="sm"
                onClick={() => setQuestStatus("completed")}
                className="flex gap-2"
              >
                <CheckCircle2 className="h-4 w-4" /> Terminée
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Sous-quêtes</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSubQuests([...subQuests, {
                    id: Date.now().toString(),
                    title: "",
                    description: "",
                    status: "not-started"
                  }]);
                }}
                className="flex gap-2"
              >
                <Plus className="h-4 w-4" /> Ajouter
              </Button>
            </div>
            {subQuests.length > 0 && (
              <div className="space-y-3">
                {subQuests.map((subQuest, index) => (
                  <Card key={subQuest.id} className="p-3">
                    <div className="space-y-2">
                      <div className="flex gap-2 items-start">
                        <Input
                          placeholder="Titre de la sous-quête"
                          value={subQuest.title}
                          onChange={(e) => {
                            const newSubQuests = [...subQuests];
                            newSubQuests[index].title = e.target.value;
                            setSubQuests(newSubQuests);
                          }}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSubQuests(subQuests.filter((_, i) => i !== index));
                          }}
                          className="h-10 w-10 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <Textarea
                        placeholder="Description de la sous-quête"
                        value={subQuest.description}
                        onChange={(e) => {
                          const newSubQuests = [...subQuests];
                          newSubQuests[index].description = e.target.value;
                          setSubQuests(newSubQuests);
                        }}
                        className="min-h-[60px]"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={subQuest.status === "not-started" ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const newSubQuests = [...subQuests];
                            newSubQuests[index].status = "not-started";
                            setSubQuests(newSubQuests);
                          }}
                        >
                          <Circle className="h-3 w-3 mr-1" /> Non commencée
                        </Button>
                        <Button
                          type="button"
                          variant={subQuest.status === "in-progress" ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const newSubQuests = [...subQuests];
                            newSubQuests[index].status = "in-progress";
                            setSubQuests(newSubQuests);
                          }}
                        >
                          <Clock className="h-3 w-3 mr-1" /> En cours
                        </Button>
                        <Button
                          type="button"
                          variant={subQuest.status === "completed" ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            const newSubQuests = [...subQuests];
                            newSubQuests[index].status = "completed";
                            setSubQuests(newSubQuests);
                          }}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Terminée
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
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
              questType: data.questType,
              questStatus: data.questStatus,
              subQuests: data.subQuests,
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
  
  type FirestoreNoteUpdate = Partial<Pick<Note,
    'title' | 'content' | 'type' | 'tags' | 'image' | 'race' | 'class' | 'region' | 'itemType' | 'questType' | 'questStatus' | 'subQuests'
  >> & { updatedAt: Date; createdAt?: Date };

  const handleSaveNote = async (updatedNote: Note) => {
    if (!roomId || !character) return;
    
    try {
      const notesCollectionRef = collection(db, 'Notes', roomId, character);
      
      // Créer l'objet de base avec les champs obligatoires
      const noteData: FirestoreNoteUpdate = {
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
      if (updatedNote.questType !== undefined) {
        noteData.questType = updatedNote.questType;
      }
      if (updatedNote.questStatus !== undefined) {
        noteData.questStatus = updatedNote.questStatus;
      }
      if (updatedNote.subQuests !== undefined) {
        noteData.subQuests = updatedNote.subQuests;
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

  const handleUpdateSubQuest = async (noteId: string, subQuestId: string) => {
    if (!roomId || !character) return;
    
    try {
      const note = notes.find(n => n.id === noteId);
      if (!note || !note.subQuests) return;

      const updatedSubQuests = note.subQuests.map(sq => {
        if (sq.id === subQuestId) {
          // Cycle des statuts : not-started → in-progress → completed → not-started
          let newStatus: "not-started" | "in-progress" | "completed";
          if (sq.status === "not-started") {
            newStatus = "in-progress";
          } else if (sq.status === "in-progress") {
            newStatus = "completed";
          } else {
            newStatus = "not-started";
          }
          return { ...sq, status: newStatus };
        }
        return sq;
      });

      const noteDocRef = doc(db, 'Notes', roomId, character, noteId);
      await updateDoc(noteDocRef, { subQuests: updatedSubQuests });
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la sous-quête:', error);
      setError("Erreur lors de la mise à jour de la sous-quête");
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
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-[var(--accent-brown)]">Notes</h1>
        <Button onClick={() => setIsCreating(true)} className="button-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Nouvelle Note
        </Button>
      </div>
      
      {(isCreating || editingNote) ? (
        <Card className="card mb-4">
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
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-primary)] opacity-60" />
              <Input
                placeholder="Rechercher des notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-9 h-10"
              />
            </div>
          </div>
          
          <Tabs defaultValue="all">
            <TabsList className="mb-3 h-9">
              <TabsTrigger value="all" className="text-xs px-3 py-1">Toutes les Notes</TabsTrigger>
              <TabsTrigger value="characters" className="text-xs px-3 py-1">Personnages</TabsTrigger>
              <TabsTrigger value="locations" className="text-xs px-3 py-1">Lieux</TabsTrigger>
              <TabsTrigger value="items" className="text-xs px-3 py-1">Objets</TabsTrigger>
              <TabsTrigger value="quests" className="text-xs px-3 py-1">Quêtes</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="mt-0">
              <div className="bento-grid">
                <AnimatePresence>
                  {filteredNotes.length > 0 ? (
                    filteredNotes.map((note: Note, index: number) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        onEdit={setEditingNote}
                        onDelete={handleDeleteNote}
                        onUpdateSubQuest={handleUpdateSubQuest}
                        index={index}
                      />
                    ))
                  ) : (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="col-span-full text-center py-12"
                    >
                      <p className="text-[var(--text-primary)]">Aucune note trouvée. Essayez d&apos;ajuster vos filtres ou créez une nouvelle note.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </TabsContent>
            
            <TabsContent value="characters" className="mt-0">
              <div className="bento-grid">
                <AnimatePresence>
                  {filteredNotes.filter((note: Note) => note.type === "character").length > 0 ? (
                    filteredNotes
                      .filter((note: Note) => note.type === "character")
                      .map((note: Note, index: number) => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          onEdit={setEditingNote}
                          onDelete={handleDeleteNote}
                          onUpdateSubQuest={handleUpdateSubQuest}
                          index={index}
                        />
                      ))
                  ) : (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="col-span-full text-center py-12"
                    >
                      <p className="text-[var(--text-primary)]">Aucune note de personnage trouvée.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </TabsContent>
            
            <TabsContent value="locations" className="mt-0">
              <div className="bento-grid">
                <AnimatePresence>
                  {filteredNotes.filter((note: Note) => note.type === "location").length > 0 ? (
                    filteredNotes
                      .filter((note: Note) => note.type === "location")
                      .map((note: Note, index: number) => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          onEdit={setEditingNote}
                          onDelete={handleDeleteNote}
                          onUpdateSubQuest={handleUpdateSubQuest}
                          index={index}
                        />
                      ))
                  ) : (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="col-span-full text-center py-12"
                    >
                      <p className="text-[var(--text-primary)]">Aucune note de lieu trouvée.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </TabsContent>
            
            <TabsContent value="items" className="mt-0">
              <div className="bento-grid">
                <AnimatePresence>
                  {filteredNotes.filter((note: Note) => note.type === "item").length > 0 ? (
                    filteredNotes
                      .filter((note: Note) => note.type === "item")
                      .map((note: Note, index: number) => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          onEdit={setEditingNote}
                          onDelete={handleDeleteNote}
                          onUpdateSubQuest={handleUpdateSubQuest}
                          index={index}
                        />
                      ))
                  ) : (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="col-span-full text-center py-12"
                    >
                      <p className="text-[var(--text-primary)]">Aucune note d&apos;objet trouvée.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </TabsContent>
            
            <TabsContent value="quests" className="mt-0">
              <div className="bento-grid">
                <AnimatePresence>
                  {filteredNotes.filter((note: Note) => note.type === "quest").length > 0 ? (
                    filteredNotes
                      .filter((note: Note) => note.type === "quest")
                      .map((note: Note, index: number) => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          onEdit={setEditingNote}
                          onDelete={handleDeleteNote}
                          onUpdateSubQuest={handleUpdateSubQuest}
                          index={index}
                        />
                      ))
                  ) : (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="col-span-full text-center py-12"
                    >
                      <p className="text-[var(--text-primary)]">Aucune quête trouvée.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

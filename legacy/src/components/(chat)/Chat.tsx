"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useGame } from "@/contexts/GameContext";
import { useCharacter } from "@/contexts/CharacterContext";
import { db, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, storage, ref, uploadBytes, getDownloadURL, limitToLast, deleteDoc, doc, updateDoc } from "@/lib/firebase";
import { Image as ImageIcon, X, Plus, Loader2, MoreVertical, Trash2, Users, Check, Pencil, Upload, MessageSquare, Send } from "lucide-react";
import { trackChatMessage } from '@/lib/challenge-tracker';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { UserProfileDialog } from "@/components/profile/UserProfileDialog";

type ChatMessage = {
    id: string;
    sender: string;
    uid: string;
    text?: string;
    imageUrl?: string;
    timestamp: any;
    recipients?: string[];
};

type Player = {
    uid: string;
    name: string;
    imageUrl?: string;
};

type ChatProps = {
    // Destinataire à présélectionner à l'ouverture (déclenché par "Écrire en privé" depuis l'overlay).
    // `nonce` change à chaque demande pour re-présélectionner même si c'est la même personne.
    prefillRecipient?: { recipientName: string; nonce: number } | null;
};

export default function Chat({ prefillRecipient }: ChatProps = {}) {
    const { user, playerData, isMJ } = useGame();
    const { characters } = useCharacter();

    // Data State
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");

    // UI State
    const [isUploading, setIsUploading] = useState(false);
    const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Dialog States
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [editingVisibility, setEditingVisibility] = useState<ChatMessage | null>(null);
    const [editingTextMsg, setEditingTextMsg] = useState<ChatMessage | null>(null);
    const [editText, setEditText] = useState("");
    const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [selectedCharacterName, setSelectedCharacterName] = useState<string | null>(null);

    // Form States (for Dialogs)
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [targetRecipients, setTargetRecipients] = useState<string[]>([]);

    const roomId = user?.roomId;
    const uploadInputRef = useRef<HTMLInputElement>(null);

    // 1. PLAYERS — dérivé de CharacterContext (déjà abonné à `cartes/{roomId}/characters`)
    // plutôt qu'un onSnapshot propre, pour ne pas dupliquer ce listener sur l'écran map.
    const players: Player[] = useMemo(() => {
        // Should MJ be selectable? Usually MJ sees everything, but players might want to send ONLY to MJ?
        // "visible par certaines personnes" implies restriction. MJ usually bypasses restriction.
        // Let's add MJ as a selectable recipient anyway for clarity "Who can see this".
        const availableRecipients: Player[] = [{ uid: 'MJ', name: 'MJ' }];

        for (const char of characters) {
            if (char.type === "joueurs" && char.Nomperso) {
                availableRecipients.push({
                    // On identifie le destinataire par son Nomperso (et non char.id) : c'est le SEUL
                    // identifiant que le filtre de réception plus bas sait matcher — un recipient stocké
                    // sous char.id n'atteignait jamais le joueur ciblé.
                    uid: char.Nomperso,
                    name: char.Nomperso,
                    imageUrl: char.imageURL
                });
            }
        }
        return availableRecipients;
    }, [characters]);

    // 2. FETCH MESSAGES
    useEffect(() => {
        if (!roomId || !user?.uid) return;
        const q = query(
            collection(db, `rooms/${roomId}/chat`),
            orderBy("timestamp", "asc"),
            limitToLast(50)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs: ChatMessage[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (!data.imageUrl && !data.text) return;

                const isSender = data.uid === user.uid;
                const recipients = data.recipients || [];
                const isPublic = recipients.length === 0 || recipients.includes('all');
                const currentCharacterName = playerData?.Nomperso;
                const isRecipient =
                    recipients.includes(user.uid) ||
                    (currentCharacterName && recipients.includes(currentCharacterName)) ||
                    (isMJ && recipients.includes('MJ'));

                if (isSender || isPublic || isRecipient) {
                    msgs.push({ id: doc.id, ...data } as ChatMessage);
                }
            });
            setMessages(msgs);
        });
        return () => unsubscribe();
    }, [roomId, user?.uid, playerData?.Nomperso, isMJ]);

    // Présélection du destinataire quand on ouvre le chat via "Écrire en privé" depuis l'overlay.
    // On dépend du `nonce` (pas seulement du nom) pour re-cibler la même personne plusieurs fois d'affilée.
    useEffect(() => {
        if (prefillRecipient?.recipientName) {
            setTargetRecipients([prefillRecipient.recipientName]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefillRecipient?.nonce]);

    // Scroll to bottom
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // --- ACTIONS ---

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!newMessage.trim() || !roomId || !user) return;

        try {
            await addDoc(collection(db, `rooms/${roomId}/chat`), {
                sender: isMJ ? "MJ" : (playerData?.Nomperso || "Joueur"),
                uid: user.uid,
                text: newMessage.trim(),
                timestamp: serverTimestamp(),
                recipients: targetRecipients
            });

            // === CHALLENGE TRACKING: Chat Message ===
            if (user?.uid) {
                trackChatMessage(user.uid).catch(error =>
                    console.error('Challenge tracking error:', error)
                );
            }

            setNewMessage("");
        } catch (error) {
            console.error("Failed to send message", error);
        }
    };

    const handleDelete = async () => {
        if (!messageToDelete || !roomId) return;
        try {
            await deleteDoc(doc(db, `rooms/${roomId}/chat`, messageToDelete));
            setMessageToDelete(null);
        } catch (error) {
            console.error(error);
        }
    };

    const handleUploadOpen = (open: boolean) => {
        setIsUploadOpen(open);
        if (!open) {
            setSelectedFile(null);
            setPreviewUrl(null);
            setTargetRecipients([]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleConfirmUpload = async () => {
        if (!selectedFile || !roomId || !user) return;
        setIsUploading(true);
        try {
            const storageRef = ref(storage, `chat_images/${roomId}/${Date.now()}_${selectedFile.name}`);
            await uploadBytes(storageRef, selectedFile);
            const imageUrl = await getDownloadURL(storageRef);

            await addDoc(collection(db, `rooms/${roomId}/chat`), {
                sender: isMJ ? "MJ" : (playerData?.Nomperso || "Joueur"),
                uid: user.uid,
                timestamp: serverTimestamp(),
                imageUrl: imageUrl,
                recipients: targetRecipients
            });
            handleUploadOpen(false);
        } catch (error) {
            console.error("Upload failed", error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleStartEditVisibility = (msg: ChatMessage) => {
        setEditingVisibility(msg);
        setTargetRecipients(msg.recipients || []);
    };

    const handleConfirmEditVisibility = async () => {
        if (!editingVisibility || !roomId) return;
        try {
            await updateDoc(doc(db, `rooms/${roomId}/chat`, editingVisibility.id), {
                recipients: targetRecipients
            });
            setEditingVisibility(null);
        } catch (error) {
            console.error("Update failed", error);
        }
    };

    const handleStartEditText = (msg: ChatMessage) => {
        setEditingTextMsg(msg);
        setEditText(msg.text || "");
    };

    const handleConfirmEditText = async () => {
        if (!editingTextMsg || !roomId || !editText.trim()) return;
        try {
            await updateDoc(doc(db, `rooms/${roomId}/chat`, editingTextMsg.id), {
                text: editText.trim()
            });
            setEditingTextMsg(null);
        } catch (error) {
            console.error("Text update failed", error);
        }
    };

    const toggleRecipient = (uid: string) => {
        setTargetRecipients(prev =>
            prev.includes(uid)
                ? prev.filter(id => id !== uid)
                : [...prev, uid]
        );
    };

    // --- RENDER HELPERS ---

    const RecipientSelector = () => (
        <div className="border border-[var(--border-color)] rounded-lg p-2 bg-[var(--bg-dark)]">
            <div className="text-xs font-semibold text-muted-foreground mb-2 px-1 uppercase tracking-wider">Visible par</div>
            <div className="space-y-1 max-h-[150px] overflow-y-auto">
                <button
                    onClick={() => setTargetRecipients([])}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between transition-colors ${targetRecipients.length === 0 ? "bg-[var(--accent-brown)] text-black font-medium" : "hover:bg-[var(--bg-dark)] text-[var(--text-primary)]"}`}
                >
                    <span>Tout le monde</span>
                    {targetRecipients.length === 0 && <Check className="h-4 w-4" />}
                </button>
                {players.map(player => (
                    <button
                        key={player.uid}
                        onClick={() => toggleRecipient(player.uid)}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between transition-colors ${targetRecipients.includes(player.uid) ? "bg-[color-mix(in_srgb,var(--accent-brown)_20%,transparent)] text-[var(--accent-brown)] border border-[color-mix(in_srgb,var(--accent-brown)_30%,transparent)]" : "hover:bg-[var(--bg-dark)] text-[var(--text-primary)] border border-transparent"}`}
                    >
                        <span>{player.name}</span>
                        {targetRecipients.includes(player.uid) && <Check className="h-4 w-4" />}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-[var(--bg-dark)] text-[var(--text-primary)] border-l border-[var(--border-color)]">

            {/* --- HEADER --- */}
            <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-card)]">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-[var(--accent-brown)]">
                    <MessageSquare className="w-5 h-5" />
                    Chat
                </h2>

                <Dialog open={isUploadOpen} onOpenChange={handleUploadOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-black">
                            <Plus className="w-4 h-4 mr-1" /> Ajouter
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)] sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Partager une image</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            {/* File Input */}
                            <div
                                className={`border-2 border-dashed rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer transition-colors ${previewUrl ? 'border-[var(--accent-brown)] bg-[color-mix(in_srgb,var(--accent-brown)_5%,transparent)]' : 'border-[var(--border-color)] hover:border-[color-mix(in_srgb,var(--accent-brown)_50%,transparent)] hover:bg-[var(--bg-dark)]'}`}
                                onClick={() => uploadInputRef.current?.click()}
                            >
                                {previewUrl ? (
                                    <img src={previewUrl} alt="Preview" className="h-full w-full object-contain rounded-lg p-2" />
                                ) : (
                                    <>
                                        <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                                        <span className="text-sm text-muted-foreground">Cliquez pour choisir une image</span>
                                    </>
                                )}
                                <input
                                    ref={uploadInputRef}
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                />
                            </div>

                            {/* Recipients */}
                            <RecipientSelector />
                        </div>
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => handleUploadOpen(false)}>Annuler</Button>
                            <Button
                                onClick={handleConfirmUpload}
                                disabled={!selectedFile || isUploading}
                                className="bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-black"
                            >
                                {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Envoyer
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* --- LIST --- */}
            <ScrollArea className="flex-1 p-4">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50 mt-20">
                        <MessageSquare className="w-12 h-12 mb-2" />
                        <p className="text-sm">Aucun message</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6 pb-8 px-2 overflow-x-hidden">
                        {messages.map((msg) => {
                            const isMe = msg.uid === user?.uid;
                            const msgPlayer = players.find(p => p.name === msg.sender);
                            const avatarUrl = msgPlayer?.imageUrl || (isMe ? playerData?.imageURL : null);

                            return (
                                <div key={msg.id} className={`flex items-start gap-3 w-full max-w-[90%] animate-in fade-in slide-in-from-bottom-2 duration-500 ${isMe ? 'self-end flex-row-reverse' : 'self-start'}`}>

                                    {/* Avatar Circle */}
                                    <div
                                        className="flex-shrink-0 mt-0.5 cursor-pointer hover:ring-2 hover:ring-[color-mix(in_srgb,var(--accent-brown)_50%,transparent)] rounded-full transition-all"
                                        onClick={() => {
                                            setSelectedUserId(msg.uid || null);
                                            setSelectedCharacterName(msg.sender || null);
                                        }}
                                    >
                                        {avatarUrl ? (
                                            <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-[var(--border-color)]" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-[var(--bg-dark)] flex items-center justify-center border border-[var(--border-color)]">
                                                <span className="text-xs font-bold text-[var(--accent-brown)]">{msg.sender && msg.sender !== "MJ" ? msg.sender.substring(0, 2).toUpperCase() : "MJ"}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Message Column */}
                                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                                        {/* Header Info */}
                                        <div className={`flex items-center gap-2 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                            <span
                                                className={`text-xs font-bold ${isMe ? 'text-[var(--accent-brown)]' : 'text-[var(--accent-brown)]'} cursor-pointer hover:underline`}
                                                onClick={() => {
                                                    setSelectedUserId(msg.uid || null);
                                                    setSelectedCharacterName(msg.sender || null);
                                                }}
                                            >
                                                {isMe ? 'Vous' : msg.sender}
                                            </span>
                                            {msg.recipients && msg.recipients.length > 0 && (
                                                <span
                                                    className="text-[10px] text-[var(--accent-brown)] px-1.5 py-0.5 rounded border flex items-center gap-1"
                                                    style={{
                                                        background: 'color-mix(in srgb, var(--accent-brown) 10%, transparent)',
                                                        borderColor: 'color-mix(in srgb, var(--accent-brown) 20%, transparent)',
                                                    }}
                                                >
                                                    <Users className="w-3 h-3" />
                                                    Privé
                                                </span>
                                            )}
                                            <span className="text-[10px] text-muted-foreground opacity-50 whitespace-nowrap">
                                                {msg.timestamp?.toDate ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Maintenant"}
                                            </span>
                                        </div>

                                        {/* Message Card */}
                                        <div className={`relative group rounded-xl overflow-hidden border border-[var(--border-color)] bg-[var(--bg-dark)] shadow-md hover:border-[color-mix(in_srgb,var(--accent-brown)_50%,transparent)] transition-all ${isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
                                            {msg.imageUrl && (
                                                <img
                                                    src={msg.imageUrl}
                                                    alt="Shared"
                                                    className="w-full h-auto max-h-[400px] object-contain bg-[var(--bg-darker)] cursor-pointer"
                                                    onClick={() => setFullscreenImage(msg.imageUrl!)}
                                                />
                                            )}
                                            {msg.text && (
                                                <div className={`p-3 text-sm whitespace-pre-wrap break-words ${isMe ? 'bg-[color-mix(in_srgb,var(--accent-brown)_10%,transparent)] text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>
                                                    {msg.text}
                                                </div>
                                            )}

                                            {/* Action Menu (Owner/MJ) */}
                                            {(isMJ || isMe) && (
                                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/10 backdrop-blur-sm">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-40 p-1 bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)]" align="end">
                                                            {msg.text && (
                                                                <button
                                                                    onClick={() => handleStartEditText(msg)}
                                                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm md:text-xs hover:bg-[var(--bg-dark)] rounded cursor-pointer transition-colors"
                                                                >
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                    Modifier message
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleStartEditVisibility(msg)}
                                                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm md:text-xs hover:bg-[var(--bg-dark)] rounded cursor-pointer transition-colors"
                                                            >
                                                                <Users className="h-3.5 w-3.5" />
                                                                Visibilité
                                                            </button>
                                                            <button
                                                                onClick={() => setMessageToDelete(msg.id)}
                                                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm md:text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded cursor-pointer transition-colors"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                Supprimer
                                                            </button>
                                                        </PopoverContent>
                                                    </Popover>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                <div ref={scrollRef} />
            </ScrollArea>

            {/* --- COMPOSE --- */}
            <div className="p-3 border-t border-[var(--border-color)] bg-[var(--bg-card)] flex flex-col gap-2">
                {targetRecipients.length > 0 && (
                    <div className="flex items-center justify-between bg-[var(--bg-dark)] p-2 rounded border border-[var(--border-color)]">
                        <span className="text-xs text-[var(--accent-brown)] flex items-center gap-1 min-w-0">
                            <Users className="w-3 h-3 shrink-0" />
                            <span className="truncate">Message privé à {targetRecipients.join(', ')}</span>
                        </span>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs shrink-0" onClick={() => setTargetRecipients([])}>
                            Annuler
                        </Button>
                    </div>
                )}
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-[var(--accent-brown)]">
                                <Users className="w-5 h-5" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-0 bg-[var(--bg-card)] border-[var(--border-color)]" align="start" side="top">
                            <RecipientSelector />
                        </PopoverContent>
                    </Popover>
                    <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Écrire un message..."
                        className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] focus-visible:ring-[color-mix(in_srgb,var(--accent-brown)_50%,transparent)]"
                    />
                    <Button type="submit" disabled={!newMessage.trim()} size="icon" className="shrink-0 bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-black">
                        <Send className="w-4 h-4" />
                    </Button>
                </form>
            </div>

            {/* --- LIGHTBOX --- */}
            {fullscreenImage && (
                <div
                    className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 backdrop-blur animate-in fade-in duration-200"
                    onClick={() => setFullscreenImage(null)}
                >
                    <button
                        onClick={() => setFullscreenImage(null)}
                        className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors p-2"
                    >
                        <X className="h-8 w-8" />
                    </button>
                    <img
                        src={fullscreenImage}
                        alt="Fullscreen"
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                    />
                </div>
            )}

            {/* --- VISIBILITY DIALOG --- */}
            <Dialog open={!!editingVisibility} onOpenChange={(open) => !open && setEditingVisibility(null)}>
                <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)] sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Modifier la visibilité</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <RecipientSelector />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setEditingVisibility(null)}>Annuler</Button>
                        <Button
                            onClick={handleConfirmEditVisibility}
                            className="bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-black"
                        >
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* --- EDIT TEXT DIALOG --- */}
            <Dialog open={!!editingTextMsg} onOpenChange={(open) => !open && setEditingTextMsg(null)}>
                <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)] sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Modifier le message</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleConfirmEditText();
                            }}
                            autoFocus
                            className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] focus-visible:ring-[color-mix(in_srgb,var(--accent-brown)_50%,transparent)]"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setEditingTextMsg(null)}>Annuler</Button>
                        <Button
                            onClick={handleConfirmEditText}
                            className="bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-black"
                            disabled={!editText.trim() || editText === editingTextMsg?.text}
                        >
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* --- DELETE CONFIRM DIALOG --- */}
            <Dialog open={!!messageToDelete} onOpenChange={(open) => !open && setMessageToDelete(null)}>
                <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)] sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Supprimer le message</DialogTitle>
                    </DialogHeader>
                    <div className="py-2 text-sm text-muted-foreground">
                        Êtes-vous sûr de vouloir supprimer ce message ? Cette action est irréversible.
                    </div>
                    <DialogFooter className="mt-4 gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => setMessageToDelete(null)}>Annuler</Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            className="bg-red-900/50 hover:bg-red-900/80 text-red-200 border border-red-900"
                        >
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* --- USER PROFILE DIALOG --- */}
            <UserProfileDialog
                userId={selectedUserId}
                characterName={selectedCharacterName}
                roomId={roomId}
                isOpen={!!selectedUserId || !!selectedCharacterName}
                onClose={() => { setSelectedUserId(null); setSelectedCharacterName(null); }}
            />

        </div>
    );
}

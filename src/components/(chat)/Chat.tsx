"use client";

import { useState, useEffect, useRef } from "react";
import { useGame } from "@/contexts/GameContext";
import { db, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, storage, ref, uploadBytes, getDownloadURL, limitToLast, deleteDoc, doc, updateDoc } from "@/lib/firebase";
import { Image as ImageIcon, X, Plus, Loader2, MoreVertical, Trash2, Users, Check, Pencil, Upload, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

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

export default function Chat() {
    const { user, playerData, isMJ } = useGame();

    // Data State
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [players, setPlayers] = useState<Player[]>([]);
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

    // Form States (for Dialogs)
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [targetRecipients, setTargetRecipients] = useState<string[]>([]);

    const roomId = user?.roomId;
    const uploadInputRef = useRef<HTMLInputElement>(null);

    // 1. FETCH PLAYERS
    useEffect(() => {
        if (!roomId) return;
        const q = query(collection(db, `cartes/${roomId}/characters`));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const availableRecipients: Player[] = [];

            // Should MJ be selectable? Usually MJ sees everything, but players might want to send ONLY to MJ?
            // "visible par certaines personnes" implies restriction. MJ usually bypasses restriction.
            // Let's add MJ as a selectable recipient anyway for clarity "Who can see this".
            availableRecipients.push({ uid: 'MJ', name: 'MJ' });

            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.type === "joueurs" && data.Nomperso) {
                    availableRecipients.push({
                        uid: doc.id,
                        name: data.Nomperso,
                        imageUrl: data.imageURL
                    });
                }
            });
            setPlayers(availableRecipients);
        });
        return () => unsubscribe();
    }, [roomId]);

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
        <div className="border border-[#3a3a3a] rounded-lg p-2 bg-[#1c1c1c]">
            <div className="text-xs font-semibold text-muted-foreground mb-2 px-1 uppercase tracking-wider">Visible par</div>
            <div className="space-y-1 max-h-[150px] overflow-y-auto">
                <button
                    onClick={() => setTargetRecipients([])}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between transition-colors ${targetRecipients.length === 0 ? "bg-[#c0a080] text-black font-medium" : "hover:bg-[#333] text-[#d4d4d4]"}`}
                >
                    <span>Tout le monde</span>
                    {targetRecipients.length === 0 && <Check className="h-4 w-4" />}
                </button>
                {players.map(player => (
                    <button
                        key={player.uid}
                        onClick={() => toggleRecipient(player.uid)}
                        className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between transition-colors ${targetRecipients.includes(player.uid) ? "bg-[#c0a080]/20 text-[#c0a080] border border-[#c0a080]/30" : "hover:bg-[#333] text-[#d4d4d4] border border-transparent"}`}
                    >
                        <span>{player.name}</span>
                        {targetRecipients.includes(player.uid) && <Check className="h-4 w-4" />}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-[#1c1c1c] text-[#d4d4d4] border-l border-[#3a3a3a]">

            {/* --- HEADER --- */}
            <div className="p-4 border-b border-[#3a3a3a] flex justify-between items-center bg-[#242424]">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-[#c0a080]">
                    <MessageSquare className="w-5 h-5" />
                    Chat
                </h2>

                <Dialog open={isUploadOpen} onOpenChange={handleUploadOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-[#c0a080] hover:bg-[#b09070] text-black">
                            <Plus className="w-4 h-4 mr-1" /> Ajouter
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#242424] border-[#3a3a3a] text-[#d4d4d4] sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Partager une image</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            {/* File Input */}
                            <div
                                className={`border-2 border-dashed rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer transition-colors ${previewUrl ? 'border-[#c0a080] bg-[#c0a080]/5' : 'border-[#3a3a3a] hover:border-[#c0a080]/50 hover:bg-[#2a2a2a]'}`}
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
                                className="bg-[#c0a080] hover:bg-[#b09070] text-black"
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
                            return (
                                <div key={msg.id} className={`flex flex-col gap-1 w-full max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-500 ${isMe ? 'self-end' : 'self-start'}`}>
                                    {/* Header Info */}
                                    <div className={`flex items-center gap-2 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        {!isMe && <span className="text-xs font-bold text-[#c0a080]">{msg.sender}</span>}
                                        {msg.recipients && msg.recipients.length > 0 && (
                                            <span className="text-[10px] bg-[#c0a080]/10 text-[#c0a080] px-1.5 py-0.5 rounded border border-[#c0a080]/20 flex items-center gap-1">
                                                <Users className="w-3 h-3" />
                                                Privé
                                            </span>
                                        )}
                                        <span className="text-[10px] text-muted-foreground opacity-50">
                                            {msg.timestamp?.toDate ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Maintenant"}
                                        </span>
                                    </div>

                                    {/* Message Card */}
                                    <div className={`relative group rounded-xl overflow-hidden border border-[#3a3a3a] bg-[#1a1a1a] shadow-md hover:border-[#c0a080]/50 transition-all ${isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
                                        {msg.imageUrl && (
                                            <img
                                                src={msg.imageUrl}
                                                alt="Shared"
                                                className="w-full h-auto max-h-[400px] object-contain bg-[#0a0a0a] cursor-pointer"
                                                onClick={() => setFullscreenImage(msg.imageUrl!)}
                                            />
                                        )}
                                        {msg.text && (
                                            <div className={`p-3 text-sm whitespace-pre-wrap break-words ${isMe ? 'bg-[#c0a080]/10 text-[#e0e0e0]' : 'text-[#d4d4d4]'}`}>
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
                                                    <PopoverContent className="w-40 p-1 bg-[#242424] border-[#3a3a3a] text-[#d4d4d4]" align="end">
                                                        {msg.text && (
                                                            <button
                                                                onClick={() => handleStartEditText(msg)}
                                                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm md:text-xs hover:bg-[#333] rounded cursor-pointer transition-colors"
                                                            >
                                                                <Pencil className="h-3.5 w-3.5" />
                                                                Modifier message
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleStartEditVisibility(msg)}
                                                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm md:text-xs hover:bg-[#333] rounded cursor-pointer transition-colors"
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
                            );
                        })}
                    </div>
                )}
                <div ref={scrollRef} />
            </ScrollArea>

            {/* --- COMPOSE --- */}
            <div className="p-3 border-t border-[#3a3a3a] bg-[#242424] flex flex-col gap-2">
                {targetRecipients.length > 0 && (
                    <div className="flex items-center justify-between bg-[#1c1c1c] p-2 rounded border border-[#3a3a3a]">
                        <span className="text-xs text-[#c0a080] flex items-center gap-1">
                            <Users className="w-3 h-3" /> Message privé
                        </span>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setTargetRecipients([])}>
                            Annuler
                        </Button>
                    </div>
                )}
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-[#c0a080]">
                                <Users className="w-5 h-5" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-0 bg-[#242424] border-[#3a3a3a]" align="start" side="top">
                            <RecipientSelector />
                        </PopoverContent>
                    </Popover>
                    <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Écrire un message..."
                        className="bg-[#1c1c1c] border-[#3a3a3a] text-[#d4d4d4] focus-visible:ring-[#c0a080]/50"
                    />
                    <Button type="submit" disabled={!newMessage.trim()} size="icon" className="shrink-0 bg-[#c0a080] hover:bg-[#b09070] text-black">
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
                <DialogContent className="bg-[#242424] border-[#3a3a3a] text-[#d4d4d4] sm:max-w-[425px]">
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
                            className="bg-[#c0a080] hover:bg-[#b09070] text-black"
                        >
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* --- EDIT TEXT DIALOG --- */}
            <Dialog open={!!editingTextMsg} onOpenChange={(open) => !open && setEditingTextMsg(null)}>
                <DialogContent className="bg-[#242424] border-[#3a3a3a] text-[#d4d4d4] sm:max-w-[425px]">
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
                            className="bg-[#1c1c1c] border-[#3a3a3a] text-[#d4d4d4] focus-visible:ring-[#c0a080]/50"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setEditingTextMsg(null)}>Annuler</Button>
                        <Button
                            onClick={handleConfirmEditText}
                            className="bg-[#c0a080] hover:bg-[#b09070] text-black"
                            disabled={!editText.trim() || editText === editingTextMsg?.text}
                        >
                            Enregistrer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* --- DELETE CONFIRM DIALOG --- */}
            <Dialog open={!!messageToDelete} onOpenChange={(open) => !open && setMessageToDelete(null)}>
                <DialogContent className="bg-[#242424] border-[#3a3a3a] text-[#d4d4d4] sm:max-w-[425px]">
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

        </div>
    );
}

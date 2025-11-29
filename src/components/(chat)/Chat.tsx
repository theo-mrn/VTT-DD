"use client";

import { useState, useEffect, useRef } from "react";
import { useGame } from "@/contexts/GameContext";
import { db, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, storage, ref, uploadBytes, getDownloadURL, getDocs, where } from "@/lib/firebase";
import { Send, Image as ImageIcon, X, Users, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

type Message = {
    id: string;
    text: string;
    sender: string;
    timestamp: any;
    uid: string;
    imageUrl?: string;
    recipients?: string[];
};

type Player = {
    uid: string;
    name: string;
};

export default function Chat() {
    const { user, playerData, isMJ } = useGame();
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [players, setPlayers] = useState<Player[]>([]);
    const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]); // Empty = Everyone
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const roomId = user?.roomId;

    // Fetch available characters (recipients)
    useEffect(() => {
        if (!roomId) return;

        const q = query(collection(db, `cartes/${roomId}/characters`));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const availableRecipients: Player[] = [];

            // Always add MJ
            availableRecipients.push({ uid: 'MJ', name: 'MJ' });

            snapshot.forEach((doc) => {
                const data = doc.data();
                // Filter for player characters
                if (data.type === "joueurs" && data.Nomperso) {
                    availableRecipients.push({
                        uid: doc.id,
                        name: data.Nomperso
                    });
                }
            });
            setPlayers(availableRecipients);
        });

        return () => unsubscribe();
    }, [roomId]);

    // Listen for messages
    useEffect(() => {
        if (!roomId || !user?.uid) return;

        const q = query(
            collection(db, `rooms/${roomId}/chat`),
            orderBy("timestamp", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs: Message[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data() as Omit<Message, 'id'>;

                // Visibility Logic
                const isSender = data.uid === user.uid;
                const recipients = data.recipients || [];
                const isPublic = recipients.length === 0 || recipients.includes('all');

                // Check if the user is a recipient by UID, Character Name, or MJ Role
                const currentCharacterName = playerData?.Nomperso;
                const isRecipient =
                    recipients.includes(user.uid) ||
                    (currentCharacterName && recipients.includes(currentCharacterName)) ||
                    (isMJ && recipients.includes('MJ'));

                if (isSender || isPublic || isRecipient) {
                    msgs.push({ id: doc.id, ...data });
                }
            });
            setMessages(msgs);
        });

        return () => unsubscribe();
    }, [roomId, user?.uid, playerData?.Nomperso, isMJ]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedImage(e.target.files[0]);
        }
    };

    const toggleRecipient = (uid: string) => {
        setSelectedRecipients(prev => {
            if (prev.includes(uid)) {
                return prev.filter(id => id !== uid);
            } else {
                return [...prev, uid];
            }
        });
    };

    const [identity, setIdentity] = useState<string>("");
    const [customIdentity, setCustomIdentity] = useState("");
    const [isIdentityPopoverOpen, setIsIdentityPopoverOpen] = useState(false);

    useEffect(() => {
        if (isMJ) {
            setIdentity("MJ");
        } else {
            setIdentity(playerData?.Nomperso || "Joueur");
        }
    }, [isMJ, playerData?.Nomperso]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!newMessage.trim() && !selectedImage) || !roomId || !user) return;

        // Use the selected identity
        const senderName = identity;
        setIsUploading(true);

        try {
            let imageUrl = "";

            if (selectedImage) {
                const storageRef = ref(storage, `chat_images/${roomId}/${Date.now()}_${selectedImage.name}`);
                await uploadBytes(storageRef, selectedImage);
                imageUrl = await getDownloadURL(storageRef);
            }

            await addDoc(collection(db, `rooms/${roomId}/chat`), {
                text: newMessage,
                sender: senderName,
                uid: user.uid,
                timestamp: serverTimestamp(),
                imageUrl: imageUrl || null,
                recipients: selectedRecipients // Empty array means everyone
            });

            setNewMessage("");
            setSelectedImage(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (error) {
            console.error("Error sending message:", error);
        } finally {
            setIsUploading(false);
        }
    };

    const handleCustomIdentitySubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (customIdentity.trim()) {
            setIdentity(customIdentity.trim());
            setCustomIdentity("");
            setIsIdentityPopoverOpen(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#242424] text-[#d4d4d4] border-l border-[#3a3a3a] overflow-hidden">
            <div className="p-4 border-b border-[#3a3a3a] flex-none flex justify-between items-center">
                <h2 className="text-lg font-semibold">Chat</h2>
                {selectedRecipients.length > 0 && (
                    <span className="text-xs text-[#c0a080] bg-[#c0a080]/10 px-2 py-1 rounded">
                        Privé ({selectedRecipients.length})
                    </span>
                )}
            </div>

            <ScrollArea className="flex-1 p-4 min-h-0">
                <div className="space-y-4 w-full">
                    {messages.map((msg) => {
                        const isMe = user?.uid === msg.uid;
                        const isPrivate = msg.recipients && msg.recipients.length > 0;

                        return (
                            <div key={msg.id} className={`flex flex-col max-w-[85%] ${isMe ? "ml-auto items-end" : "mr-auto items-start"}`}>
                                <div className={`text-xs mb-1 flex items-center gap-1 ${isMe ? "flex-row-reverse text-right" : "flex-row text-left"} text-muted-foreground`}>
                                    <span className="font-medium">{msg.sender}</span>
                                    {isPrivate && <span className="text-[10px] italic">(Privé)</span>}
                                </div>
                                <div className={`px-3 py-2 rounded-lg break-words shadow-sm w-fit ${isMe
                                    ? "bg-[#c0a080] text-black rounded-tr-none"
                                    : "bg-[#3a3a3a] text-[#d4d4d4] rounded-tl-none"
                                    } ${isPrivate ? "border border-yellow-500/50" : ""}`}>
                                    {msg.imageUrl && (
                                        <div className="mb-2">
                                            <img
                                                src={msg.imageUrl}
                                                alt="Shared image"
                                                className="max-w-full rounded-md max-h-[200px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                onClick={() => window.open(msg.imageUrl, '_blank')}
                                            />
                                        </div>
                                    )}
                                    {msg.text && <p className="leading-relaxed">{msg.text}</p>}
                                </div>
                            </div>
                        );
                    })}
                    <div ref={scrollRef} />
                </div>
            </ScrollArea>

            <div className="p-3 border-t border-[#3a3a3a] bg-[#242424] flex-none">
                {selectedImage && (
                    <div className="mb-2 relative inline-block">
                        <div className="relative">
                            <img
                                src={URL.createObjectURL(selectedImage)}
                                alt="Preview"
                                className="h-16 w-16 object-cover rounded border border-[#3a3a3a]"
                            />
                            <button
                                onClick={() => {
                                    setSelectedImage(null);
                                    if (fileInputRef.current) fileInputRef.current.value = "";
                                }}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Identity Indicator */}
                <div className="flex items-center justify-between mb-2 px-1">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <span>En tant que :</span>
                        {isMJ ? (
                            <Popover open={isIdentityPopoverOpen} onOpenChange={setIsIdentityPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <button className="font-bold text-[#c0a080] hover:underline focus:outline-none">
                                        {identity}
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 bg-[#242424] border-[#3a3a3a] text-[#d4d4d4] p-2" align="start" side="top">
                                    <div className="space-y-1">
                                        <h4 className="font-medium text-sm mb-2 px-2">Identité</h4>
                                        <button
                                            onClick={() => { setIdentity("MJ"); setIsIdentityPopoverOpen(false); }}
                                            className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between hover:bg-[#333] ${identity === "MJ" ? "bg-[#333]" : ""}`}
                                        >
                                            <span>MJ</span>
                                            {identity === "MJ" && <Check className="h-4 w-4 text-[#c0a080]" />}
                                        </button>
                                        {playerData?.Nomperso && (
                                            <button
                                                onClick={() => { setIdentity(playerData.Nomperso); setIsIdentityPopoverOpen(false); }}
                                                className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between hover:bg-[#333] ${identity === playerData.Nomperso ? "bg-[#333]" : ""}`}
                                            >
                                                <span>{playerData.Nomperso}</span>
                                                {identity === playerData.Nomperso && <Check className="h-4 w-4 text-[#c0a080]" />}
                                            </button>
                                        )}
                                        <div className="h-px bg-[#3a3a3a] my-1" />
                                        <form onSubmit={handleCustomIdentitySubmit} className="px-2 pb-1">
                                            <label className="text-[10px] text-muted-foreground block mb-1">Autre nom (PNJ)</label>
                                            <div className="flex gap-1">
                                                <Input
                                                    value={customIdentity}
                                                    onChange={(e) => setCustomIdentity(e.target.value)}
                                                    className="h-7 text-xs bg-[#1c1c1c] border-[#3a3a3a]"
                                                    placeholder="Nom..."
                                                />
                                                <Button type="submit" size="sm" className="h-7 w-7 p-0 bg-[#c0a080] text-black hover:bg-[#b09070]">
                                                    <Check className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </form>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        ) : (
                            <span className="font-bold text-[#d4d4d4]">{identity}</span>
                        )}
                    </div>
                </div>

                <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
                    <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                    />

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className={`shrink-0 ${selectedRecipients.length > 0 ? "text-[#c0a080]" : "text-[#d4d4d4]"} hover:text-[#c0a080] hover:bg-[#333]`}
                                title="Choisir les destinataires"
                            >
                                <Users className="h-5 w-5" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 bg-[#242424] border-[#3a3a3a] text-[#d4d4d4] p-2" align="start" side="top">
                            <div className="space-y-1">
                                <h4 className="font-medium text-sm mb-2 px-2">Visible par :</h4>
                                <button
                                    type="button"
                                    onClick={() => setSelectedRecipients([])}
                                    className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between hover:bg-[#333] ${selectedRecipients.length === 0 ? "bg-[#333]" : ""}`}
                                >
                                    <span>Tout le monde</span>
                                    {selectedRecipients.length === 0 && <Check className="h-4 w-4 text-[#c0a080]" />}
                                </button>
                                <div className="h-px bg-[#3a3a3a] my-1" />
                                {players.filter(player => player.name !== identity).map(player => (
                                    <button
                                        key={player.uid}
                                        type="button"
                                        onClick={() => toggleRecipient(player.name)}
                                        className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between hover:bg-[#333] ${selectedRecipients.includes(player.name) ? "bg-[#333]" : ""}`}
                                    >
                                        <span className="truncate">{player.name}</span>
                                        {selectedRecipients.includes(player.name) && <Check className="h-4 w-4 text-[#c0a080]" />}
                                    </button>
                                ))}
                                {players.length === 0 && (
                                    <div className="px-2 py-1.5 text-xs text-muted-foreground">Aucun autre joueur</div>
                                )}
                            </div>
                        </PopoverContent>
                    </Popover>

                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-[#d4d4d4] hover:text-[#c0a080] hover:bg-[#333] shrink-0"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <ImageIcon className="h-5 w-5" />
                    </Button>

                    <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={selectedRecipients.length > 0 ? "Message privé..." : "Votre message..."}
                        className="bg-[#1c1c1c] border-[#3a3a3a] text-[#d4d4d4] focus-visible:ring-[#c0a080]"
                        disabled={isUploading}
                    />
                    <Button
                        type="submit"
                        size="icon"
                        className="bg-[#c0a080] hover:bg-[#b09070] text-black shrink-0"
                        disabled={isUploading || (!newMessage.trim() && !selectedImage)}
                    >
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </div>
        </div>
    );
}

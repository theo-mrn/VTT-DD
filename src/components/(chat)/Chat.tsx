"use client";

import { useState, useEffect, useRef } from "react";
import { useGame } from "@/contexts/GameContext";
import { db, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, storage, ref, uploadBytes, getDownloadURL, getDocs, where, limitToLast } from "@/lib/firebase";
import { DiceRoll } from "@dice-roller/rpg-dice-roller";
import { Send, Image as ImageIcon, X, Users, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

import BasicAvatar from "@/components/ui/basic-avatar";

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
    imageUrl?: string;
    imageUrl2?: string;
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

    // 🎯 SUGGESTIONS STATE
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionQuery, setSuggestionQuery] = useState("");
    const [suggestionIndex, setSuggestionIndex] = useState(0);
    const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    const roomId = user?.roomId;

    // Fetch available characters (recipients)
    useEffect(() => {
        if (!roomId) return;

        const q = query(collection(db, `cartes/${roomId}/characters`));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const availableRecipients: Player[] = [];

            // Always add MJ
            // MJ often doesn't have a specific image in 'characters' collection unless bound to a character
            // We can try to find a default MJ image or leave empty
            availableRecipients.push({ uid: 'MJ', name: 'MJ', imageUrl: undefined });

            snapshot.forEach((doc) => {
                const data = doc.data();
                // Filter for player characters
                if (data.type === "joueurs" && data.Nomperso) {
                    availableRecipients.push({
                        uid: doc.id,
                        name: data.Nomperso,
                        imageUrl: data.imageURL,
                        imageUrl2: data.imageURL2
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
            orderBy("timestamp", "asc"),
            limitToLast(50)
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

    // 🎯 SUGGESTIONS LOGIC
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setNewMessage(val);

        // Detect /w context
        // Matches: /w name1, name2
        // We want to detect if we are currently typing a name
        if (val.startsWith('/w ') || val.startsWith('/whisper ') || val.startsWith('/msg ')) {
            // Remove command part
            const commandPart = val.split(' ')[0] + ' ';
            const afterCommand = val.slice(commandPart.length);

            // Get the last part after comma (the one being typed)
            const parts = afterCommand.split(',');
            const currentPart = parts[parts.length - 1]; // Keep spaces to allow "Elf Ranger"

            // If the current part contains the message separator (e.g. colon or just long space?), we might stop suggesting
            // For now, let's assume names don't contain ' : '
            if (!currentPart.includes(':')) {
                const query = currentPart.trim().toLowerCase();
                setSuggestionQuery(query);

                const filtered = players.filter(p =>
                    p.name.toLowerCase().includes(query) &&
                    p.name !== identity // Don't suggest self
                );

                setFilteredPlayers(filtered);
                setShowSuggestions(filtered.length > 0 && (query.length > 0 || parts.length > 0)); // Show if typing anything
                setSuggestionIndex(0);
                return;
            }
        }
        setShowSuggestions(false);
    };

    const confirmSuggestion = (player: Player) => {
        if (!newMessage) return;

        // Replace the last partial name with the full selected name
        // We need to match exactly the logic in handleInputChange
        const commandEndIndex = newMessage.indexOf(' ') + 1;
        const commandPart = newMessage.slice(0, commandEndIndex);
        const afterCommand = newMessage.slice(commandEndIndex);

        const parts = afterCommand.split(',');
        parts.pop(); // Remove partial
        parts.push(player.name); // Add complete

        const newValue = commandPart + parts.join(', ') + ', ';
        setNewMessage(newValue);
        setShowSuggestions(false);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (showSuggestions) {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSuggestionIndex(prev => Math.max(0, prev - 1));
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSuggestionIndex(prev => Math.min(filteredPlayers.length - 1, prev + 1));
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                if (filteredPlayers[suggestionIndex]) {
                    confirmSuggestion(filteredPlayers[suggestionIndex]);
                }
            } else if (e.key === 'Escape') {
                setShowSuggestions(false);
            }
        }
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if ((!newMessage.trim() && !selectedImage) || !roomId || !user) return;

        // Use the selected identity
        const senderName = identity;
        setIsUploading(true);

        try {
            let messageText = newMessage.trim();
            let msgRecipients = selectedRecipients; // Default to UI selection

            // 🎯 SLASH COMMANDS PROCESSING
            if (messageText.startsWith('/')) {
                const parts = messageText.split(' ');
                const command = parts[0].toLowerCase();
                const args = parts.slice(1);

                // --- /ROLL ---
                if (command === '/roll' || command === '/r') {
                    // Helper to replace stats
                    const replaceCharacteristics = (notation: string): string => {
                        if (!playerData) return notation;

                        const characteristicsRegex = /(CON|FOR|DEX|CHA|INT|SAG|Contact|Distance|Magie|Defense)/gi;

                        return notation.replace(characteristicsRegex, (match) => {
                            const key = match.toUpperCase();
                            let value = 0;

                            // Logic copied from dice-roller.tsx
                            // Note: We use Math.floor() as per dice-roller implementation
                            if (key === "CON") value = Math.floor(playerData.CON || 0);
                            else if (key === "FOR") value = Math.floor(playerData.FOR || 0);
                            else if (key === "DEX") value = Math.floor(playerData.DEX || 0);
                            else if (key === "CHA") value = Math.floor(playerData.CHA || 0);
                            else if (key === "INT") value = Math.floor(playerData.INT || 0);
                            else if (key === "SAG") value = Math.floor(playerData.SAG || 0);
                            else if (key === "CONTACT") value = playerData.Contact || 0;
                            else if (key === "DISTANCE") value = playerData.Distance || 0;
                            else if (key === "MAGIE") value = playerData.Magie || 0;
                            else if (key === "DEFENSE") value = playerData.Defense || 0;

                            return value.toString();
                        });
                    };

                    let notation = '1d20';
                    if (args.length > 0) {
                        notation = args.join(' ');
                    }

                    try {
                        const processedNotation = replaceCharacteristics(notation);
                        const roll = new DiceRoll(processedNotation);

                        // 1. Message pour le Chat
                        // On garde la notation originale pour l'affichage "1d20+CON" mais on montre le calcul
                        messageText = `🎲 Lancer de dé (${notation}) : ${roll.output} = **${roll.total}**`;

                        // 2. Sauvegarde pour les Stats (dice-stats)
                        // On doit parser pour extraire diceCount/diceFaces/modifier si possible pour les stats
                        // On fait une estimation basique pour les stats
                        const basicDiceRegex = /(\d+)d(\d+)/i;
                        const match = processedNotation.match(basicDiceRegex);
                        let diceCount = 1;
                        let diceFaces = 20;
                        let modifier = 0; // Difficile à recalculer parfaitement sans parser complet, on met 0 ou on essaie

                        if (match) {
                            diceCount = parseInt(match[1]);
                            diceFaces = parseInt(match[2]);
                        }

                        // Modifier approximatif: Total - Somme des dés
                        // DiceRoll nous donne roll.total, mais pas directement la somme pure des dés sans modificateur facilement accessible publiquement sans parcourir tous les rolls.
                        // On simplifie pour FirebaseRoll : on stocke le total.

                        // Extraction des résultats individuels (comme dans dice-roller)
                        const results: number[] = [];
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (roll as any).rolls.forEach((rollGroup: any) => {
                            if (rollGroup.rolls && rollGroup.rolls.length > 0) {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                rollGroup.rolls.forEach((die: any) => {
                                    if (!die.discarded) {
                                        results.push(die.value || die.result || die);
                                    }
                                });
                            }
                        });

                        const firebaseRoll = {
                            id: crypto.randomUUID(),
                            isPrivate: false,
                            diceCount,
                            diceFaces,
                            modifier, // Simplifié
                            results,
                            total: roll.total,
                            userName: identity,
                            userAvatar: playerData?.imageURL || null,
                            type: "Chat Roll",
                            timestamp: Date.now(),
                            notation: notation, // Notation originale (ex: 1d20+CON)
                            output: roll.output,
                            persoId: playerData?.id || user.uid
                        };

                        // Sauvegarde dans la collection 'rolls'
                        addDoc(collection(db, `rolls/${roomId}/rolls`), firebaseRoll).catch(err => console.error("Error saving roll stat:", err));

                    } catch (err) {
                        messageText = `⚠️ Erreur : Notation de dé invalide (${notation})`;
                    }
                }
                // --- /W (WHISPER) ---
                else if (command === '/w' || command === '/whisper' || command === '/msg') {
                    // Args contains everything after "/w"
                    // ex: ["Alice,", "Bob", "Salut", "les", "ars"] => "Alice, Bob Salut les gars"

                    const fullContent = args.join(' ');

                    // Algorithm: We want to extract valid recipient names from the start of the string.
                    // Names are separated by commas.
                    // The message starts when we encounter something that is NOT a valid recipient name (or after the last valid name).

                    const potentialSegments = fullContent.split(',').map(s => s.trim());
                    const foundRecipients: string[] = [];
                    let messageStart = "";

                    // We iterate through segments. 
                    // If a segment matches a player name exactly, it's a recipient.
                    // If not, it might be the start of the message (or the last segment containing "Name Message").

                    for (let i = 0; i < potentialSegments.length; i++) {
                        const segment = potentialSegments[i];

                        // Check if this segment is EXACTLY a player name
                        const exactPlayer = players.find(p => p.name.toLowerCase() === segment.toLowerCase());

                        if (exactPlayer) {
                            foundRecipients.push(exactPlayer.uid);
                            // If this was the last segment, the message is empty? 
                            // Or the user typed "/w Name," -> empty message.
                        } else {
                            // This segment is NOT exactly a player name.
                            // It could be:
                            // 1. A typo of a name
                            // 2. The message itself
                            // 3. "Name Message" (only possible for the very last segment if no comma used after last name)

                            // Let's see if it starts with a player name
                            // We only check this for the LAST segment (because intermediate segments are split by comma, so "Name Message" would imply no comma)
                            // OR if proper comma-separation is used, intermediate segments MUST be names.

                            // If we are at the last segment, try to extract name + message
                            if (i === potentialSegments.length - 1) {
                                // Try to find a player name at the start of this segment
                                const sortedPlayers = [...players].sort((a, b) => b.name.length - a.name.length);
                                let foundInSegment = false;

                                for (const p of sortedPlayers) {
                                    if (segment.toLowerCase().startsWith(p.name.toLowerCase())) {
                                        // Confirm it's a distinct word boundary if possible, or just greedy match?
                                        // "Edwin Hello" -> starts with Edwin.
                                        // "EdwinHello" -> starts with Edwin (risky).
                                        // Let's assume space or end of string.
                                        const rest = segment.slice(p.name.length);
                                        if (rest.length === 0 || rest.startsWith(' ') || rest.startsWith(',') || rest.startsWith(':')) {
                                            foundRecipients.push(p.uid);
                                            messageStart = rest.trim();
                                            // Cleanup leading punctuation
                                            if (messageStart.startsWith(':') || messageStart.startsWith(',')) {
                                                messageStart = messageStart.slice(1).trim();
                                            }
                                            foundInSegment = true;
                                            break;
                                        }
                                    }
                                }

                                if (!foundInSegment) {
                                    // This segment is just the message
                                    messageStart = segment;
                                    // If previous segments were valid names, we join them.
                                    // BUT we must be careful: split(',') removes the commas.
                                    // The message might contain commas!
                                    // If we are at index i, and i < length-1, it means we stopped parsing names early.
                                    // Reconstruct the message from here to the end.

                                    // Actually, if we hit a non-name segment in the middle, we should probably stop and assume everything from here is message.
                                    // Re-construct message from original string is hard because we split it.

                                    // Easier: Re-join the remaining segments.
                                    const remainingSegments = potentialSegments.slice(i);
                                    messageStart = remainingSegments.join(', '); // We lost the original spacing but it's a decent fallback
                                }
                            } else {
                                // We are in the middle, and this segment is not a player.
                                // Assume it's the start of the message.
                                const remainingSegments = potentialSegments.slice(i);
                                messageStart = remainingSegments.join(', ');
                            }

                            // Once we hit the message part, we stop looking for recipients
                            break;
                        }
                    }

                    if (foundRecipients.length > 0) {
                        if (!foundRecipients.includes(user.uid)) foundRecipients.push(user.uid);
                        msgRecipients = foundRecipients;
                        messageText = messageStart;

                        if (!messageText) messageText = "👋 (Chuchotement vide)";
                    } else {
                        // Attempted whisper but no recipients found
                        messageText = `⚠️ Erreur : Aucun destinataire trouvé pour "${fullContent}".`;
                        msgRecipients = [user.uid];
                    }
                }
            }

            let imageUrl = "";

            if (selectedImage) {
                const storageRef = ref(storage, `chat_images/${roomId}/${Date.now()}_${selectedImage.name}`);
                await uploadBytes(storageRef, selectedImage);
                imageUrl = await getDownloadURL(storageRef);
            }

            await addDoc(collection(db, `rooms/${roomId}/chat`), {
                text: messageText,
                sender: senderName,
                uid: user.uid,
                timestamp: serverTimestamp(),
                imageUrl: imageUrl || null,
                recipients: msgRecipients // Empty array means everyone
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
                        const msgRecipients = msg.recipients || [];

                        // Find sender details (for avatar)
                        // If I sent it, use my data. If someone else, look in players list.
                        // However, msg.uid is the User UID, but players list uses Character ID (doc.id) or 'MJ'.
                        // We need to map msg.uid or msg.sender to a player.
                        // msg.sender is the Name.

                        let senderAvatarUrl: string | undefined;
                        // Simplification: Try to find by name if possible, or use current user data if it's me
                        if (isMe) {
                            senderAvatarUrl = playerData?.imageURL || playerData?.imageURL2;
                        } else {
                            const senderPlayer = players.find(p => p.name === msg.sender);
                            senderAvatarUrl = senderPlayer?.imageUrl || senderPlayer?.imageUrl2;
                        }

                        // Recipient avatars (excluding me if I'm sender)
                        const recipientAvatars = isPrivate ? msgRecipients.map(recipientUid => {
                            // recipientUid is usually the Character ID (or MJ)
                            const player = players.find(p => p.uid === recipientUid);
                            return player;
                        }).filter(p => p !== undefined) : [];

                        return (
                            <div key={msg.id} className={`flex flex-col max-w-[95%] ${isMe ? "ml-auto items-end" : "mr-auto items-start"}`}>
                                <div className={`text-xs mb-1 flex items-center gap-2 ${isMe ? "flex-row-reverse text-right" : "flex-row text-left"} text-muted-foreground`}>

                                    {/* 1. SENDER AVATAR (if not me, or standard chat) */}
                                    {/* If private and I sent it to multiple people, user wants to see their avatars? "afficher tout les avatar des personnes a qui on envoie" */}
                                    {/* If I receive a private message, I see sender. */}

                                    {!isPrivate && (
                                        <BasicAvatar
                                            src={senderAvatarUrl}
                                            fallback={msg.sender}
                                            className="h-6 w-6"
                                        />
                                    )}

                                    <span className="font-medium">{msg.sender}</span>

                                    {/* RECIPIENT AVATARS FOR PRIVATE MESSAGES */}
                                    {isPrivate && (
                                        <div className="flex -space-x-2 items-center">
                                            {/* Show sender avatar first if it's not me? Or standard logic? */}
                                            {/* User said: "display all the avatars of the people we are sending to in the case of private message of several people" */}
                                            {/* This implies if I AM THE SENDER, or even if I am receiver, I see who else received it? */}

                                            {recipientAvatars.map((player, idx) => (
                                                <BasicAvatar
                                                    key={idx}
                                                    src={player?.imageUrl || player?.imageUrl2}
                                                    fallback={player?.name || "?"}
                                                    className="h-5 w-5 border-2 border-[#242424]"
                                                />
                                            ))}
                                        </div>
                                    )}
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
                                    {msg.text && (
                                        <p className="leading-relaxed">
                                            {msg.text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
                                                part.startsWith('**') && part.endsWith('**')
                                                    ? <strong key={i}>{part.slice(2, -2)}</strong>
                                                    : part
                                            )}
                                        </p>
                                    )}
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

                <form onSubmit={handleSendMessage} className="flex gap-2 items-end relative">
                    {showSuggestions && (
                        <div className="absolute bottom-full left-0 w-64 mb-2 bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg shadow-xl overflow-hidden z-50">
                            <div className="px-3 py-2 text-xs font-semibold text-[#c0a080] bg-[#333] border-b border-[#3a3a3a]">
                                Suggestions de destinataires
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                                {filteredPlayers.map((player, index) => (
                                    <button
                                        key={player.uid}
                                        type="button"
                                        onClick={() => confirmSuggestion(player)}
                                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#3a3a3a] transition-colors ${index === suggestionIndex ? "bg-[#3a3a3a] text-[#c0a080]" : "text-[#d4d4d4]"
                                            }`}
                                    >
                                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                        {player.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
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
                                        onClick={() => toggleRecipient(player.uid)}
                                        className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between hover:bg-[#333] ${selectedRecipients.includes(player.uid) ? "bg-[#333]" : ""}`}
                                    >
                                        <span className="truncate">{player.name}</span>
                                        {selectedRecipients.includes(player.uid) && <Check className="h-4 w-4 text-[#c0a080]" />}
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
                        ref={inputRef}
                        value={newMessage}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder={selectedRecipients.length > 0 ? "Message privé..." : "Votre message... (/roll, /w)"}
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

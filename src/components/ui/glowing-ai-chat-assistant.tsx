import React, { useState, useRef, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, Send, Info, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, ChevronRight, Box, Shield, EyeOff, History, RotateCcw, BarChart2, Store, SwitchCamera, Keyboard, Filter } from 'lucide-react';
import { doc, getDoc, auth, db, addDoc, collection, updateDoc, query, orderBy, limit, onSnapshot } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { toast } from 'sonner';
import { generateSlug } from "@/lib/titles";
import { getAssetUrl } from "@/lib/asset-loader";
import { trackDiceRoll } from '@/lib/challenge-tracker';
import { DiceStats } from "@/components/(dices)/dice-stats";
import { DiceStoreModal } from "../(dices)/dice-store-modal";
import { DICE_SKINS } from "../(dices)/dice-definitions";
import { UserProfileDialog } from "@/components/profile/UserProfileDialog";

// Represents one stat that can be inserted as a dice bonus
interface RollableStat {
  key: string;       // identifier used in notation (e.g. "FOR", "Durabilité")
  label: string;     // display label
  rawValue: number;  // raw stat value
  hasModifier: boolean; // if true, insert floor((value-10)/2); otherwise insert value directly
}

interface CharacterModifiers {
  [key: string]: number;
}

interface FirebaseRoll {
  id: string;
  isPrivate: boolean;
  isBlind?: boolean;
  diceCount: number;
  diceFaces: number;
  modifier: number;
  results: number[];
  total: number;
  userAvatar?: string;
  userName: string;
  type?: string;
  timestamp: number;
  notation?: string;
  output?: string;
  persoId?: string;
  uid?: string;
}

interface FloatingAiAssistantProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const FloatingAiAssistant = ({ isOpen = false, onClose }: FloatingAiAssistantProps) => {
  // const [isOpen, setIsOpen] = useState(false); // Controlled by parent
  const [input, setInput] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [persoId, setPersoId] = useState<string | null>(null);
  const [characterModifiers, setCharacterModifiers] = useState<CharacterModifiers>({});
  const [rollableStats, setRollableStats] = useState<RollableStat[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [show3DAnimations, setShow3DAnimations] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isBlind, setIsBlind] = useState(false);

  // User context
  const [userName, setUserName] = useState("Utilisateur");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | undefined>(undefined);

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingRollsRef = useRef<Map<string, (results: { type: string, value: number }[]) => void>>(new Map());

  // History State
  const [showHistory, setShowHistory] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [firebaseRolls, setFirebaseRolls] = useState<FirebaseRoll[]>([]);
  const [selectedPlayerFilter, setSelectedPlayerFilter] = useState<string | null>(null);

  // Skin State
  const [selectedSkinId, setSelectedSkinId] = useState("gold");
  const [isSkinDialogOpen, setIsSkinDialogOpen] = useState(false);

  // New state for displaying the latest result in the header
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedCharacterName, setSelectedCharacterName] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<{
    result: string;
    total: number;
    notation: string;
    output: string;
    isBlind?: boolean;
  } | null>(null);

  // Scramble effect for the result display when it's "..."
  const [scrambledValue, setScrambledValue] = useState("...");

  // Load skin from Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.dice_skin && DICE_SKINS[data.dice_skin]) {
            setSelectedSkinId(data.dice_skin);
          }
        }
      } catch (error) {
        console.error('Error loading dice skin from Firestore:', error);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      const chars = "0123456789";
      interval = setInterval(() => {
        setScrambledValue(
          Array(2).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join("")
        );
      }, 50);
    } else if (latestResult) {
      setScrambledValue(latestResult.total.toString());
    }
    return () => clearInterval(interval);
  }, [isLoading, latestResult]);

  // History Logic from dice-roller.tsx
  useEffect(() => {
    if (!roomId) return;

    const q = query(
      collection(db, `rolls/${roomId}/rolls`),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rolls: FirebaseRoll[] = [];
      const now = Date.now();

      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const rollData = { id: change.doc.id, ...change.doc.data() } as FirebaseRoll;

          // Check if it's a NEW roll (within last 5 seconds) and NOT from the current user
          // userName check might be tricky if two people have same name, but UID is safer
          const isMe = (auth.currentUser && rollData.uid === auth.currentUser.uid) || rollData.userName === userName;

          if (!isMe && (now - rollData.timestamp < 5000)) {
            // Trigger Sonner Toast for other players
            const totalDisplay = rollData.isBlind ? "???" : rollData.total;
            const details = rollData.output?.split('=')[1]?.trim() || "";

            toast.info(`${rollData.userName} : ${totalDisplay}`, {
              description: `${rollData.notation} : ${details}=${rollData.total}`,
              duration: 5000
            });
          }
        }
      });

      snapshot.forEach((doc) => {
        rolls.push({ id: doc.id, ...doc.data() } as FirebaseRoll);
      });
      setFirebaseRolls(rolls);
    });

    return () => {
      unsubscribe();
    };
  }, [roomId, userName]);

  const canDisplayRoll = (roll: FirebaseRoll) => {
    // As a floating widget, we might not know if WE are MJ easily without prop drilling.
    // However, we fetched user data in useEffect including "perso === 'MJ'".
    const isMJ = userName === "MJ";

    if (isMJ) return true;
    if (roll.isBlind) return roll.userName === userName;
    if (!roll.isPrivate) return true;
    return roll.userName === userName;
  };

  const getFilteredRolls = () => {
    return firebaseRolls.filter(canDisplayRoll);
  };

  const rerollFromFirebase = (roll: FirebaseRoll) => {
    if (roll.notation) {
      setInput(roll.notation);
      setShowHistory(false);
      // Optional: auto-roll? Let's just fill input for now
    }
  };

  // --- Logic from dice-roller.tsx ---

  const calculateModifier = (value: number) => Math.floor(value);

  const fetchCharacterInfo = async (roomId: string, persoId: string) => {
    try {
      const charRef = doc(db, `cartes/${roomId}/characters/${persoId}`);
      const charSnap = await getDoc(charRef);

      if (charSnap.exists()) {
        const charData = charSnap.data();
        setUserName(charData.Nomperso || "Utilisateur");
        setUserAvatar(charData.imageURLFinal || charData.imageURL || undefined);

        // ── Built-in stats defaults ──
        const defaultRollable: Record<string, boolean> = {
          FOR: true, DEX: true, CON: true, SAG: true, INT: true, CHA: true,
          Defense: false, Contact: false, Magie: false, Distance: false, INIT: false,
        };
        const statRollableOverrides: Record<string, boolean> = charData.statRollable ?? {};

        const builtinDefs = [
          { key: 'FOR', label: 'FOR', hasModifier: true },
          { key: 'DEX', label: 'DEX', hasModifier: true },
          { key: 'CON', label: 'CON', hasModifier: true },
          { key: 'SAG', label: 'SAG', hasModifier: true },
          { key: 'INT', label: 'INT', hasModifier: true },
          { key: 'CHA', label: 'CHA', hasModifier: true },
          { key: 'Defense', label: 'Déf', hasModifier: false },
          { key: 'Contact', label: 'Ctt', hasModifier: false },
          { key: 'Magie', label: 'Mag', hasModifier: false },
          { key: 'Distance', label: 'Dst', hasModifier: false },
          { key: 'INIT', label: 'INIT', hasModifier: false },
        ];

        // Build rollable list from built-ins
        const rollables: RollableStat[] = builtinDefs
          .filter(s => (s.key in statRollableOverrides ? statRollableOverrides[s.key] : defaultRollable[s.key] ?? false))
          .map(s => ({
            key: s.key,
            label: s.label,
            rawValue: Number(charData[`${s.key}_F`] ?? charData[s.key] ?? (s.hasModifier ? 10 : 0)),
            hasModifier: s.hasModifier,
          }));

        // Append rollable custom fields
        const customFields: Array<{ id: string; label: string; type: string; value: unknown; isRollable?: boolean; hasModifier?: boolean }> =
          charData.customFields ?? [];
        customFields
          .filter(f => f.isRollable && (f.type === 'number' || f.type === 'percent'))
          .forEach(f => {
            rollables.push({
              key: f.label,     // use label as notation key for custom fields
              label: f.label.length > 5 ? f.label.substring(0, 5) : f.label,
              rawValue: Number(f.value) || 0,
              hasModifier: !!(f.hasModifier && f.type === 'number'),
            });
          });

        setRollableStats(rollables);

        // Keep characterModifiers for backward compat with replaceCharacteristics
        const modifiersMap: CharacterModifiers = {};
        rollables.forEach(s => {
          modifiersMap[s.key] = s.rawValue;
        });
        setCharacterModifiers(modifiersMap);
      }
    } catch (error) {
      console.error("Error fetching character info:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      if (authUser) {
        setUserEmail(authUser.email || null);
        const userRef = doc(db, 'users', authUser.uid);
        getDoc(userRef).then((docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRoomId(data.room_id);
            setPersoId(data.persoId);

            if (data.perso === "MJ") {
              setUserName("MJ");
              setUserAvatar(undefined);
            } else if (data.room_id && data.persoId) {
              fetchCharacterInfo(data.room_id, data.persoId);
            }
          }
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen for 3D roll completion
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleRollComplete = (e: any) => {
      const { rollId, results } = e.detail;
      const resolve = pendingRollsRef.current.get(rollId);
      if (resolve) {
        resolve(results);
        pendingRollsRef.current.delete(rollId);
      }
    };

    window.addEventListener('vtt-3d-roll-complete', handleRollComplete);
    return () => window.removeEventListener('vtt-3d-roll-complete', handleRollComplete);
  }, []);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside the content AND not on the sidebar toggle button
      // Also exclude clicks inside the DiceStoreModal portal (data-dice-store-portal)
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        isOpen &&
        !isSkinDialogOpen && // ← don't close while dice store is open
        !selectedUserId && // ← don't close while user profile dialog is open
        !selectedCharacterName && // ← don't close while user profile dialog is open
        !(event.target as Element).closest('#vtt-sidebar-dice') &&
        !(event.target as Element).closest('[data-dice-store-portal]')
      ) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, isSkinDialogOpen, selectedUserId, selectedCharacterName]);



  const replaceCharacteristics = (notation: string): string => {
    if (!rollableStats.length && !characterModifiers || Object.keys(characterModifiers).length === 0) {
      return notation;
    }

    let processedNotation = notation;

    // Build a sorted list of keys (longest first to avoid partial matches)
    const allKeys = rollableStats.length > 0
      ? rollableStats.map(s => s.key)
      : Object.keys(characterModifiers);

    const sortedKeys = [...allKeys].sort((a, b) => b.length - a.length);
    const escapedKeys = sortedKeys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`\\b(${escapedKeys.join('|')})\\b`, 'gi');

    processedNotation = processedNotation.replace(regex, (match) => {
      // Find matching stat (case-insensitive)
      const stat = rollableStats.find(s => s.key.toLowerCase() === match.toLowerCase());
      if (stat) {
        const val = stat.hasModifier
          ? Math.floor((stat.rawValue - 10) / 2)
          : stat.rawValue;
        return val.toString();
      }
      // Fallback to old map
      const raw = characterModifiers[match] ?? characterModifiers[match.toUpperCase()] ?? 0;
      return raw.toString();
    });

    return processedNotation;
  };

  const parseDiceRequests = (notation: string) => {
    const diceRegex = /(\d+)d(\d+)(?:k([hl])(\d+))?/gi;
    const requests: { type: string, count: number }[] = [];
    let match;
    while ((match = diceRegex.exec(notation)) !== null) {
      const count = parseInt(match[1]);
      const faces = parseInt(match[2]);
      requests.push({ type: `d${faces}`, count });
    }
    return requests;
  };

  const perform3DRoll = async (requests: { type: string, count: number }[], targets?: { type: string, value: number }[]): Promise<{ type: string, value: number }[]> => {
    if (typeof window === 'undefined' || requests.length === 0) return Promise.resolve([]);

    const SUPPORTED_3D_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
    const requests3D = requests.filter(req => SUPPORTED_3D_DICE.includes(req.type));
    const requestsInstant = requests.filter(req => !SUPPORTED_3D_DICE.includes(req.type));

    const instantResults: { type: string, value: number }[] = [];
    requestsInstant.forEach(req => {
      const faces = parseInt(req.type.substring(1));
      for (let i = 0; i < req.count; i++) {
        instantResults.push({
          type: req.type,
          value: Math.floor(Math.random() * faces) + 1
        });
      }
    });

    if (requests3D.length === 0 || !show3DAnimations || isBlind) {
      // Instant simulation if 3D disabled or blind
      const simulatedResults: { type: string, value: number }[] = [];
      requests3D.forEach(req => {
        for (let i = 0; i < req.count; i++) {
          simulatedResults.push({
            type: req.type,
            value: Math.floor(Math.random() * parseInt(req.type.substring(1))) + 1
          });
        }
      });
      return Promise.resolve([...simulatedResults, ...instantResults]);
    }

    // Play Sound
    try {
      const audioUrl = getAssetUrl("/dice.mp3");
      const audio = new Audio(audioUrl);
      audio.volume = 0.5;
      setTimeout(() => {
        audio.play().catch(e => console.warn("Could not play dice sound:", e));
      }, 500);
    } catch (e) { console.error("Audio error:", e); }

    const rollId = crypto.randomUUID();
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        if (pendingRollsRef.current.has(rollId)) {
          console.warn("Roll timed out, generating fallback values");
          const fallbackResults: { type: string, value: number }[] = [];

          requests3D.forEach(req => {
            const faces = parseInt(req.type.substring(1));
            for (let i = 0; i < req.count; i++) {
              fallbackResults.push({
                type: req.type,
                value: Math.floor(Math.random() * faces) + 1
              });
            }
          });
          pendingRollsRef.current.delete(rollId);
          resolve([...fallbackResults, ...instantResults]);
        }
      }, 10000);

      pendingRollsRef.current.set(rollId, (results3D) => {
        clearTimeout(timeoutId);
        resolve([...results3D, ...instantResults]);
      });

      window.dispatchEvent(new CustomEvent('vtt-trigger-3d-roll', {
        detail: {
          rollId,
          requests: requests3D,
          skinId: selectedSkinId,
          targets: targets ? [...targets] : undefined
        }
      }));
    });
  };

  const calculateFinalResult = (notation: string, physicalResults: { type: string, value: number }[]) => {
    const availableResults = [...physicalResults];
    const detailsParts: string[] = [];

    const diceRegex = /(\d+)d(\d+)(?:k([hl])(\d+))?/gi;

    const processedMathString = notation.replace(diceRegex, (match, countStr, facesStr, keepType, keepCountStr) => {
      const count = parseInt(countStr);
      const faces = parseInt(facesStr);
      const dieType = `d${faces}`;
      const keepCount = keepCountStr ? parseInt(keepCountStr) : 0;

      const rollsForMatches: number[] = [];

      let foundCount = 0;
      for (let i = 0; i < availableResults.length && foundCount < count; i++) {
        if (availableResults[i].type === dieType) {
          rollsForMatches.push(availableResults[i].value);
          availableResults.splice(i, 1);
          i--;
          foundCount++;
        }
      }

      while (rollsForMatches.length < count) {
        rollsForMatches.push(Math.floor(Math.random() * faces) + 1);
      }

      let total = 0;
      let usedRolls: { val: number, keep: boolean }[] = rollsForMatches.map(r => ({ val: r, keep: true }));

      if (keepType) {
        const sortedIndices = rollsForMatches.map((val, idx) => ({ val, idx }))
          .sort((a, b) => keepType === 'h' ? b.val - a.val : a.val - b.val);

        const indicesToKeep = new Set(sortedIndices.slice(0, keepCount).map(x => x.idx));

        usedRolls = rollsForMatches.map((val, idx) => ({
          val,
          keep: indicesToKeep.has(idx)
        }));

        total = usedRolls.filter(r => r.keep).reduce((sum, r) => sum + r.val, 0);
      } else {
        total = rollsForMatches.reduce((a, b) => a + b, 0);
      }

      const formattedDice = usedRolls.map(r => r.keep ? `${r.val}` : `r${r.val}`).join(', ');
      detailsParts.push(`[${formattedDice}]`);

      return total.toString();
    });

    let grandTotal = 0;
    try {
      const safeExpression = processedMathString.replace(/[^0-9+\-*/().\s]/g, '');
      // eslint-disable-next-line no-eval
      grandTotal = eval(safeExpression);
    } catch (e) {
      console.error("Error evaluating roll expression", e);
      grandTotal = 0;
    }

    let detailString = notation;
    let matchIndex = 0;
    detailString = detailString.replace(diceRegex, () => {
      const part = detailsParts[matchIndex] || "[?]";
      matchIndex++;
      return part;
    });

    return {
      total: Math.floor(grandTotal),
      output: `${notation} = ${detailString} = ${grandTotal}`
    };
  };

  const handleRoll = async () => {
    if (!input.trim()) return;

    setIsLoading(true);
    try {
      const processedNotation = replaceCharacteristics(input);
      const requests = parseDiceRequests(processedNotation);

      let physicalResults: { type: string, value: number }[] = [];
      let total = 0;
      let output = "";

      // Calculate
      physicalResults = await perform3DRoll(requests);
      const calculated = calculateFinalResult(processedNotation, physicalResults);
      total = calculated.total;
      output = calculated.output;

      // Notifications
      if (isBlind) {
        toast.info("Résultat caché (envoyé au MJ)");
      } else {
        toast(output, { duration: 5000 });
      }

      // Save to Firebase
      if (roomId && userName) {
        let mainDieFaces = 20;
        let mainDieCount = 1;
        if (requests.length > 0) {
          mainDieFaces = parseInt(requests[0].type.substring(1));
          mainDieCount = requests[0].count;
        }

        const firebaseRoll: FirebaseRoll = {
          id: crypto.randomUUID(),
          isPrivate,
          isBlind,
          diceCount: mainDieCount,
          diceFaces: mainDieFaces,
          modifier: 0,
          results: physicalResults.map(r => r.value),
          total: total,
          userName,
          ...(userAvatar ? { userAvatar } : {}),
          type: show3DAnimations ? "Dice Roller" : "Dice Roller/API",
          timestamp: Date.now(),
          notation: input,
          output: output,
          ...(persoId ? { persoId } : {}),
          ...(auth.currentUser ? { uid: auth.currentUser.uid } : {})
        };

        await addDoc(collection(db, `rolls/${roomId}/rolls`), firebaseRoll);

        // === CHALLENGE TRACKING: Dice Roll ===
        if (auth.currentUser) {
          const isCritical = mainDieFaces === 20; // Critique uniquement pour d20
          const mainResult = physicalResults.length > 0 ? physicalResults[0].value : 0;

          trackDiceRoll(
            auth.currentUser.uid,
            mainDieFaces,
            mainResult,
            isCritical
          ).catch(error => console.error('Challenge tracking error:', error));
        }

        // Critical Checks Logic (Titles & Emails)
        const hasD20 = requests.some(r => r.type === 'd20');
        const d20Results = physicalResults.filter(r => r.type === 'd20');
        const hasNat1 = d20Results.some(r => r.value === 1);
        const hasNat20 = d20Results.some(r => r.value === 20);

        if (hasD20 && hasNat1 && userEmail && auth.currentUser) {
          const titleLabel = "Maudit des dés";
          const slug = generateSlug(titleLabel);
          const userRef = doc(db, "users", auth.currentUser.uid);

          getDoc(userRef).then((snap) => {
            if (snap.exists()) {
              const data = snap.data();
              if (!data.titles || data.titles[slug] !== "unlocked") {
                updateDoc(userRef, { [`titles.${slug}`]: "unlocked" }).then(() => {
                  toast.success(`Nouveau titre débloqué : ${titleLabel} !`, { icon: '🔓' });
                });

                fetch('/api/send-critical-fail', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ to: userEmail, firstName: userName, rollDetails: output }),
                });
              }
            }
          });
        }

        if (hasD20 && hasNat20 && userEmail && auth.currentUser) {
          const titleLabel = "Béni des Dieux";
          const slug = generateSlug(titleLabel);
          const userRef = doc(db, "users", auth.currentUser.uid);

          getDoc(userRef).then((snap) => {
            if (snap.exists()) {
              const data = snap.data();
              if (!data.titles || data.titles[slug] !== "unlocked") {
                updateDoc(userRef, { [`titles.${slug}`]: "unlocked" }).then(() => {
                  toast.success(`Nouveau titre débloqué : ${titleLabel} !`, { icon: '🏆' });
                });

                fetch('/api/send-critical-success', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ to: userEmail, firstName: userName, rollDetails: output }),
                });
              }
            }
          });
        }
      }

      // Update Latest Result for Header Display
      console.log("Setting latest result:", { total, input, output });

      // Update Latest Result for Header Display
      console.log("Setting latest result:", { total, input, output });

      setLatestResult({
        result: total.toString(),
        total: total,
        notation: input,
        output: output,
        isBlind: isBlind
      });

      setInput('');
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors du lancer");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleRoll();
    }
  };

  const addToInput = (str: string) => {
    setInput(prev => {
      // 1. Check if we are adding a dice notated as "1dX"
      const diceMatch = str.match(/^1d(\d+)$/);
      if (diceMatch) {
        const faces = diceMatch[1];
        const diceType = `d${faces}`;

        // Regex to find the LAST occurrence of this die type at the end of the string, 
        // possibly followed by whitespace.
        // We look for patterns like "1d6", "2d6", "10d6"
        // The regex captures (count)d(faces)
        const lastDiceRegex = new RegExp(`(\\d+)d${faces}\\s*$`);
        const match = prev.match(lastDiceRegex);

        if (match) {
          // If the previous input ended with this die type, increment the count
          const currentCount = parseInt(match[1]);
          const newCount = currentCount + 1;
          // Replace the last occurrence with the new count
          return prev.replace(lastDiceRegex, `${newCount}d${faces}`);
        }
      }

      // 2. Standard addition logic for other inputs (modifiers, or different dice)
      // Check if the input is empty
      if (prev.length === 0) {
        // If adding a modifier to empty string, assume "1d20" context or just start with modifier? 
        // Usually modifiers like "+ FOR" need something before.
        // But if str is "1d20", just return it.
        if (str.startsWith('+')) return str.substring(2); // Remove "+ "
        return str;
      }

      // Check for trailing operators or spaces to avoid "++"
      const trimmedPrev = prev.trim();
      const needsSeparator = !trimmedPrev.endsWith('+') && !trimmedPrev.endsWith('-');

      if (needsSeparator) {
        if (str.startsWith('+') || str.startsWith('-')) {
          return `${trimmedPrev} ${str}`;
        }
        return `${trimmedPrev} + ${str}`;
      }

      return `${trimmedPrev} ${str}`;
    });

    // Focus back to textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        // Move cursor to end
        textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
      }
    }, 0);
  };

  const isMJ = userName === "MJ";



  return (
    <div className="fixed top-1/2 left-20 z-50 pointer-events-none -translate-y-1/2 ml-2">
      {/* Interface */}
      {isOpen && (
        <div
          ref={containerRef}
          className="w-[500px] flex flex-col gap-3 transition-all duration-300 origin-left pointer-events-auto"
          style={{
            animation: 'popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          <div className="w-full rounded-xl relative isolate overflow-hidden border shadow-lg backdrop-blur-xl" style={{ background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-darker) 100%)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}>
            {/* Subtle white shimmer overlay — preserves the original glassmorphism feel */}
            <div className="absolute inset-0 pointer-events-none rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)' }} />
            <div className="w-full rounded-xl relative">
              {/* TOP ROW: dice sidebar + right controls */}
              <div className="w-full flex items-stretch">

                {/* Left Sidebar - Dice (Always visible) */}
                <div className="w-[120px] flex-shrink-0 p-2" style={{ borderRight: '1px solid var(--border-color)' }}>
                  <div className="grid grid-cols-2 gap-2 h-full content-center">
                    {[4, 6, 8, 10, 12, 20].map((d) => (
                      <button
                        key={`d${d}`}
                        id={`vtt-dice-btn-d${d}`}
                        onClick={() => addToInput(`1d${d}`)}
                        className="group relative w-full aspect-square flex items-center justify-center rounded-lg cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95"
                        style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--accent-brown) 10%, transparent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-brown)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-brown)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                      >
                        <span className="text-xs font-mono font-bold">d{d}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Right Content */}
                <div className="flex-1 flex flex-col min-w-0">

                  {/* Header */}
                  <div className="flex items-center justify-between px-6 pt-3 pb-0">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-4">
                      <div className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: 'var(--accent-brown)' }}></div>
                      <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Dice Roller</span>

                      <TooltipProvider>
                        <Tooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <button className="p-1 rounded-full transition-colors" style={{ color: 'var(--text-secondary)' }}>
                              <Info className="w-3 h-3" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="bg-gradient-to-b from-zinc-900 to-black border border-white/10 text-zinc-300 p-4 w-[380px] space-y-4 text-xs shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 max-h-[80vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent" side="top" align="start">

                            {/* Section: Actions */}
                            <div>
                              <h4 className="font-medium text-zinc-100 text-xs mb-2 flex items-center gap-2">
                                <Dice5 className="w-3.5 h-3.5 text-zinc-500" />
                                Contrôles Rapides
                              </h4>
                              <ul className="space-y-2 text-zinc-400">
                                <li className="flex items-start gap-3">
                                  <div className="mt-1.5 w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0"></div>
                                  <span>
                                    <strong className="text-zinc-200 font-medium">Clic sur les dés</strong> : Ajoute à la main.<br />
                                    <span className="text-[10px] opacity-70">
                                      • Plusieurs clics = augmente le nombre (ex: 3 clics d6 = 3d6).<br />
                                      • Dés différents = combinaison (ex: 1d6 + 1d20).
                                    </span>
                                  </span>
                                </li>
                                <li className="flex items-start gap-3">
                                  <div className="mt-1.5 w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0"></div>
                                  <span><strong className="text-zinc-200 font-medium">Clic sur une stat</strong> : Ajoute votre modificateur (FOR, DEX, etc.) au calcul.</span>
                                </li>
                                <li className="flex items-start gap-3">
                                  <div className="mt-1.5 w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0"></div>
                                  <span><strong className="text-zinc-200 font-medium">Entrée</strong> : Lance les dés immédiatement.</span>
                                </li>
                              </ul>
                            </div>

                            {/* Section: Interface */}
                            <div>
                              <h4 className="font-medium text-zinc-100 text-xs mb-2 flex items-center gap-2">
                                <SwitchCamera className="w-3.5 h-3.5 text-zinc-500" />
                                Interface & Options
                              </h4>
                              <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400">
                                <div className="flex items-center gap-2.5 bg-white/[0.03] p-2 rounded-md border border-white/5">
                                  <Shield className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                                  <div className="flex flex-col gap-0.5">
                                    <strong className="text-zinc-200 font-medium">Privé</strong>
                                    <span className="text-[9px] opacity-60">Visible par vous & MJ</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2.5 bg-white/[0.03] p-2 rounded-md border border-white/5">
                                  <Box className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                                  <div className="flex flex-col gap-0.5">
                                    <strong className="text-zinc-200 font-medium">3D</strong>
                                    <span className="text-[9px] opacity-60">Animation des dés</span>
                                  </div>
                                </div>
                                {userName !== "MJ" && (
                                  <div className="flex items-center gap-2.5 bg-white/[0.03] p-2 rounded-md border border-white/5">
                                    <EyeOff className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                                    <div className="flex flex-col gap-0.5">
                                      <strong className="text-zinc-200 font-medium">Blind</strong>
                                      <span className="text-[9px] opacity-60">Caché (sauf pour MJ)</span>
                                    </div>
                                  </div>
                                )}
                                <div className="flex items-center gap-2.5 bg-white/[0.03] p-2 rounded-md border border-white/5">
                                  <Store className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                                  <div className="flex flex-col gap-0.5">
                                    <strong className="text-zinc-200 font-medium">Boutique</strong>
                                    <span className="text-[9px] opacity-60">Skins de dés</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Section: Commandes Manuelles */}
                            <div>
                              <h4 className="font-medium text-zinc-100 text-xs mb-2 flex items-center gap-2">
                                <Keyboard className="w-3.5 h-3.5 text-zinc-500" />
                                Syntaxe Manuelle
                              </h4>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1 p-2 rounded bg-black/20 border border-white/5">
                                  <code className="text-zinc-300 font-mono text-[10px]">1d20</code>
                                  <span className="text-zinc-500 text-[10px]">Lancer simple</span>
                                </div>
                                <div className="flex flex-col gap-1 p-2 rounded bg-black/20 border border-white/5">
                                  <code className="text-zinc-300 font-mono text-[10px]">1d20 + 5</code>
                                  <span className="text-zinc-500 text-[10px]">Modificateur</span>
                                </div>
                                <div className="flex flex-col gap-1 p-2 rounded bg-black/20 border border-white/5">
                                  <code className="text-zinc-300 font-mono text-[10px]">2d6 + 1d4</code>
                                  <span className="text-zinc-500 text-[10px]">Combinaison</span>
                                </div>
                                <div className="flex flex-col gap-1 p-2 rounded bg-black/20 border border-white/5">
                                  <code className="text-zinc-300 font-mono text-[10px]">2d20kh1</code>
                                  <span className="text-zinc-500 text-[10px]">Avantage</span>
                                </div>
                                <div className="flex flex-col gap-1 p-2 rounded bg-black/20 border border-white/5">
                                  <code className="text-zinc-300 font-mono text-[10px]">2d20kl1</code>
                                  <span className="text-zinc-500 text-[10px]">Désavantage</span>
                                </div>
                                <div className="flex flex-col gap-1 p-2 rounded bg-black/20 border border-white/5">
                                  <code className="text-zinc-300 font-mono text-[10px]">(1d8+2)*2</code>
                                  <span className="text-zinc-500 text-[10px]">Calculs</span>
                                </div>
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onClose?.()}
                        className="p-1.5 rounded-full transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Dice Roller Content (always visible) */}
                  <>
                    {/* Result Display Area (Above Input) */}
                    <div id="vtt-dice-result" className="px-6 pt-4 pb-0 min-h-[3.5rem] flex flex-col justify-end">
                      {(isLoading || latestResult) && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 relative group">

                          {/* Blur effect container for Blind Rolls */}
                          <div className={`flex items-baseline gap-2 w-full overflow-hidden transition-all duration-500 ${latestResult?.isBlind ? 'blur-md opacity-40 select-none' : ''}`}>
                            <span className="text-3xl font-bold font-mono tabular-nums tracking-tight flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                              {scrambledValue}
                            </span>

                            <div className="flex items-baseline gap-2 overflow-hidden truncate min-w-0 flex-1">
                              {!isLoading && latestResult && (
                                <>
                                  <span className="text-sm font-mono flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                    = {latestResult.output.split('=')[1] || ""}
                                  </span>
                                  <span className="text-xs font-mono opacity-50 truncate flex-shrink" style={{ color: 'var(--text-secondary)' }}>
                                    ({latestResult.notation})
                                  </span>
                                </>
                              )}
                              {isLoading && (
                                <span className="text-xs text-zinc-500 font-mono animate-pulse">
                                  Lancement...
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Overlay for Blind Rolls */}
                          {latestResult?.isBlind && !isLoading && (
                            <div className="absolute inset-0 flex items-center justify-start gap-2 text-zinc-500">
                              <EyeOff className="w-5 h-5 animate-pulse" />
                              <span className="text-xs font-medium tracking-widest uppercase opacity-80">Résultat Masqué</span>
                            </div>
                          )}

                        </div>
                      )}
                    </div>

                    {/* Input Section */}
                    <div className="relative overflow-hidden">
                      <textarea
                        ref={textareaRef}
                        id="vtt-dice-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        className="w-full px-6 py-3 bg-transparent border-none outline-none resize-none text-2xl font-light leading-relaxed min-h-[60px] scrollbar-none font-mono"
                        placeholder="1d20 + 5..."
                        style={{ color: 'var(--text-primary)', scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
                      />
                      <div
                        className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"
                      ></div>
                    </div>

                    {/* Controls Section */}
                    <div className="px-4 pb-4 space-y-3">
                      <div className="space-y-3">
                        {/* Modifiers Grid - Hidden for MJ */}
                        {!isMJ && rollableStats.length > 0 && (
                          <div id="vtt-dice-modifiers" className="flex flex-wrap gap-1.5">
                            {rollableStats.map(stat => {
                              const effectiveValue = stat.hasModifier
                                ? Math.floor((stat.rawValue - 10) / 2)
                                : stat.rawValue;
                              const sign = effectiveValue >= 0 ? '+' : '';
                              return (
                                <button
                                  key={stat.key}
                                  onClick={() => addToInput(`+ ${stat.key}`)}
                                  className="group relative py-1 px-2 rounded-lg cursor-pointer transition-all duration-300 text-[10px] font-mono font-bold flex items-center gap-1"
                                  style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-brown)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-brown)'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'; }}
                                  title={`${stat.label}: ${sign}${effectiveValue}${stat.hasModifier ? ` (base ${stat.rawValue})` : ''}`}
                                >
                                  <span className="uppercase tracking-wider">{stat.label}</span>
                                  <span className="opacity-60 text-[9px]">{sign}{effectiveValue}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          {/* Toggles */}
                          <div className="flex items-center gap-2">
                            <button
                              id="vtt-dice-btn-store"
                              onClick={() => setIsSkinDialogOpen(true)}
                              className="p-2 rounded-lg transition-all duration-300 border"
                              style={{ border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-brown)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-brown)'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color)'; }}
                              title="Boutique de dés"
                            >
                              <Store className="w-4 h-4" />
                            </button>
                            <button
                              id="vtt-dice-btn-3d"
                              onClick={() => setShow3DAnimations(!show3DAnimations)}
                              className="p-2 rounded-lg transition-all duration-300 border"
                              style={show3DAnimations ? { background: 'color-mix(in srgb, var(--accent-blue,#5c6bc0) 20%, transparent)', borderColor: 'var(--accent-blue,#5c6bc0)', color: 'var(--accent-blue,#5c6bc0)' } : { border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                              title="3D Rolling"
                            >
                              <Box className="w-4 h-4" />
                            </button>

                            <button
                              id="vtt-dice-btn-private"
                              onClick={() => setIsPrivate(!isPrivate)}
                              className="p-2 rounded-lg transition-all duration-300 border"
                              style={isPrivate ? { background: 'color-mix(in srgb, var(--accent-brown) 20%, transparent)', borderColor: 'var(--accent-brown)', color: 'var(--accent-brown)' } : { border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                              title="Privé"
                            >
                              <Shield className="w-4 h-4" />
                            </button>
                            {userName !== "MJ" && (
                              <button
                                id="vtt-dice-btn-blind"
                                onClick={() => setIsBlind(!isBlind)}
                                className="p-2 rounded-lg transition-all duration-300 border"
                                style={isBlind ? { background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.5)', color: '#f87171' } : { border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                                title="Blind Roll (Caché)"
                              >
                                <EyeOff className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setInput('');
                                setLatestResult(null);
                              }}
                              className="px-3 py-2 text-[10px] font-bold rounded-xl transition-colors"
                              style={{ color: 'var(--text-secondary)', background: 'var(--bg-darker, rgba(0,0,0,0.3))', border: '1px solid var(--border-color)' }}
                            >
                              CLR
                            </button>

                            {/* Send Button */}
                            <button
                              id="vtt-dice-btn-roll"
                              onClick={handleRoll}
                              className="group relative p-2.5 pl-4 pr-3 bg-[var(--accent-brown)] border-none rounded-xl cursor-pointer transition-all duration-300 text-black shadow-lg hover:opacity-90 hover:scale-105 active:scale-95 transform flex items-center gap-2"
                              style={{
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 0 0 0 rgba(239, 68, 68, 0.4)',
                              }}
                            >
                              <span className="text-xs font-bold uppercase tracking-wide opacity-90">Roll</span>
                              <Send className="w-4 h-4 transition-all duration-300 group-hover:translate-x-1" />

                              {/* Animated background glow */}
                              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)] opacity-0 group-hover:opacity-50 transition-opacity duration-300 blur-lg transform scale-110"></div>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                  </>
                </div>
              </div> {/* end flex items-stretch top row */}
            </div> {/* end rounded-xl inner */}
          </div> {/* end card 1: dice roller */}

          {/* CARD 2: History - separate floating card */}
          <div
            className="w-full rounded-xl relative isolate overflow-hidden border shadow-lg backdrop-blur-xl"
            style={{ background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-darker) 100%)', borderColor: 'var(--border-color)', color: 'var(--text-primary)', animation: 'popIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both' }}
          >
            <div className="absolute inset-0 pointer-events-none rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)' }} />
            <div className="w-full rounded-xl relative">
              <div>
                {/* Tabs */}
                <div className="flex px-2 pt-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <button
                    id="vtt-dice-tab-history"
                    onClick={() => setShowStats(false)}
                    className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all duration-300 ${!showStats ? 'border-[var(--accent-brown)] text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <History className="w-3.5 h-3.5" />
                      Historique
                    </div>
                  </button>
                  <button
                    id="vtt-dice-tab-stats"
                    onClick={() => setShowStats(true)}
                    className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all duration-300 ${showStats ? 'border-[var(--accent-brown)] text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <BarChart2 className="w-3.5 h-3.5" />
                      Statistiques
                    </div>
                  </button>
                </div>

                <div className="max-h-[300px] overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                  {!showStats ? (
                    <div className="space-y-2">
                      {/* Filter UI */}
                      <div className="flex items-center gap-2 pb-2 mb-1 border-b border-white/5 overflow-x-auto scrollbar-none">
                        <Filter className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                        <button
                          onClick={() => setSelectedPlayerFilter(null)}
                          className={`text-[10px] px-2 py-0.5 rounded-md transition-colors whitespace-nowrap ${!selectedPlayerFilter ? 'bg-white/10 text-white font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                          Tous
                        </button>
                        {Array.from(new Set(firebaseRolls.map(r => r.userName))).sort().map(player => (
                          <button
                            key={player}
                            onClick={() => setSelectedPlayerFilter(player)}
                            className={`text-[10px] px-2 py-0.5 rounded-md transition-colors whitespace-nowrap ${selectedPlayerFilter === player ? 'bg-white/10 text-white font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}
                          >
                            {player}
                          </button>
                        ))}
                      </div>

                      {firebaseRolls.filter(canDisplayRoll).filter(r => !selectedPlayerFilter || r.userName === selectedPlayerFilter).length === 0 ? (
                        <div className="text-center text-zinc-500 py-6 text-xs italic">
                          Aucun lancer récent...
                        </div>
                      ) : (
                        firebaseRolls.filter(canDisplayRoll).filter(r => !selectedPlayerFilter || r.userName === selectedPlayerFilter).map((roll) => (
                          <div key={roll.id} className="group relative p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all">
                            <div className="flex items-start gap-3">
                              <div
                                className={`flex-shrink-0 mt-0.5 cursor-pointer hover:ring-2 hover:ring-white/20 rounded-full transition-all`}
                                onClick={() => {
                                  setSelectedUserId(roll.uid || null);
                                  setSelectedCharacterName(roll.userName || null);
                                }}
                              >
                                {roll.userAvatar ? (
                                  <img src={roll.userAvatar} alt="" className="w-8 h-8 rounded-full object-cover border border-white/10" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-white/10">
                                    <span className="text-xs font-bold text-zinc-400">{roll.userName.substring(0, 2)}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-xs font-bold text-zinc-300 truncate">{roll.userName}</span>
                                  <div className="flex items-center gap-1">
                                    {roll.isPrivate && <Shield className="w-3 h-3 text-amber-500/70" />}
                                    {roll.isBlind && <EyeOff className="w-3 h-3 text-red-500/70" />}
                                    <span className="text-[10px] text-zinc-600">{new Date(roll.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                </div>
                                <div className="text-[11px] font-mono text-zinc-500 truncate mb-1">{roll.notation}</div>
                                <div className={`text-[10px] font-mono text-zinc-400/70 mb-1 transition-all duration-300 ${roll.isBlind && userName !== "MJ" ? 'blur-sm opacity-30 select-none' : ''}`}>
                                  {roll.output}
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className={`text-sm font-bold text-zinc-200 transition-all duration-300 ${roll.isBlind && userName !== "MJ" ? 'blur-sm opacity-50 select-none' : ''}`}>
                                    Total: {roll.total}
                                  </div>
                                  <button
                                    onClick={() => rerollFromFirebase(roll)}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-all text-zinc-400 hover:text-zinc-200"
                                    title="Relancer"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <DiceStats
                      rolls={getFilteredRolls()}
                      currentUserName={userName}
                      isMJ={userName === "MJ"}
                    />
                  )}
                </div>
              </div> {/* end inner div */}
            </div> {/* end rounded-xl card 2 */}
          </div> {/* end rounded-2xl card 2 */}
        </div>
      )}

      <DiceStoreModal
        isOpen={isSkinDialogOpen}
        onClose={() => setIsSkinDialogOpen(false)}
        currentSkinId={selectedSkinId}
        onSelectSkin={(skinId) => {
          setSelectedSkinId(skinId);
        }}
      />

      <UserProfileDialog
        userId={selectedUserId}
        characterName={selectedCharacterName}
        roomId={roomId}
        isOpen={!!selectedUserId || !!selectedCharacterName}
        onClose={() => { setSelectedUserId(null); setSelectedCharacterName(null); }}
      />

      <style jsx>{`
        @keyframes popIn {
          0% {
            opacity: 0;
            transform: scale(0.9) translateX(-20px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateX(0);
          }
        }
        
        .floating-dice-button:hover {
          transform: scale(1.1);
        }
      `}</style>
    </div >
  );
};

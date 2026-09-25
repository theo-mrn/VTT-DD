"use client";

import { useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, updateDoc, increment, getDoc } from "firebase/firestore";
import { useGame } from '@/contexts/GameContext';
import { checkAndUnlockTimeTitles } from "@/lib/titles";
import { toast } from "sonner";
import { trackTimeSpent, checkThresholdChallenges } from '@/lib/challenge-tracker';

const ACCUMULATE_INTERVAL_MS = 60_000;   // 1 minute : tick local
const FLUSH_EVERY_N_TICKS = 5;        // flush vers Firestore toutes les 5 minutes

export default function TimeTracker() {
    const tickRef = useRef<NodeJS.Timeout | null>(null);
    const pendingMinutes = useRef<number>(0);   // minutes accumulées localement
    const tickCount = useRef<number>(0);   // compteur de ticks depuis le dernier flush
    const userIdRef = useRef<string | null>(null);
    const { user: gameUser } = useGame();

    useEffect(() => {
        const uid = gameUser?.uid;
        if (uid) {
            userIdRef.current = uid;
            startTracking();
        } else {
            userIdRef.current = null;
            stopTracking();
        }

        return () => {
            // Flush les minutes restantes avant unmount
            flushIfPending();
            stopTracking();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameUser?.uid]);

    const flushIfPending = async () => {
        const uid = userIdRef.current;
        if (!uid || pendingMinutes.current === 0) return;

        const minutesToFlush = pendingMinutes.current;
        pendingMinutes.current = 0;
        tickCount.current = 0;

        try {
            const userRef = doc(db, "users", uid);

            // 1. Une seule écriture groupée
            await updateDoc(userRef, {
                timeSpent: increment(minutesToFlush)
            });

            // 2. Lire le total mis à jour
            const snap = await getDoc(userRef);
            if (!snap.exists()) return;

            const totalMinutes: number = snap.data().timeSpent || 0;

            // 3. Vérifier les titres liés au temps
            const unlockedTitles = await checkAndUnlockTimeTitles(uid, totalMinutes);
            if (unlockedTitles && unlockedTitles.length > 0) {
                unlockedTitles.forEach(() => {
                    toast.success("Nouveau titre débloqué !", {
                        description: "Consultez votre profil pour voir vos nouveaux titres."
                    });
                });
            }

            // 4. Défis temps
            await trackTimeSpent(uid, totalMinutes);

            // 5. Défis de seuil (inventaire, stats, niveau…) — profite de la lecture déjà faite
            const userData = snap.data();
            let characterData = null;
            if (userData.room_id && userData.persoId) {
                const characterRef = doc(db, `rooms/${userData.room_id}/characters/${userData.persoId}`);
                const characterSnap = await getDoc(characterRef);
                if (characterSnap.exists()) {
                    characterData = characterSnap.data();
                }
            }
            await checkThresholdChallenges(uid, userData, characterData);

        } catch (error) {
            console.error("Time tracking flush error:", error);
            // Remettre les minutes en attente si l'écriture a échoué
            pendingMinutes.current += minutesToFlush;
        }
    };

    const startTracking = () => {
        if (tickRef.current) return;

        tickRef.current = setInterval(() => {
            if (!userIdRef.current) return;

            // Accumule localement (pas d'accès réseau)
            pendingMinutes.current += 1;
            tickCount.current += 1;

            // Flush toutes les N minutes
            if (tickCount.current >= FLUSH_EVERY_N_TICKS) {
                flushIfPending();
            }
        }, ACCUMULATE_INTERVAL_MS);
    };

    const stopTracking = () => {
        if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
        }
    };

    return null; // Invisible component
}

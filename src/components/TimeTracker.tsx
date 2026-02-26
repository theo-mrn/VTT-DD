"use client";

import { useEffect, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc, increment } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { checkAndUnlockTimeTitles } from "@/lib/titles";
import { toast } from "sonner";
import { trackTimeSpent, checkThresholdChallenges } from '@/lib/challenge-tracker';

export default function TimeTracker() {
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const thresholdCheckRef = useRef<NodeJS.Timeout | null>(null);
    const userIdRef = useRef<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                userIdRef.current = user.uid;
                startTracking();
            } else {
                userIdRef.current = null;
                stopTracking();
            }
        });

        return () => {
            unsubscribe();
            stopTracking();
        };
    }, []);

    const startTracking = () => {
        if (timerRef.current) return;

        // Update every minute (60000ms)
        timerRef.current = setInterval(async () => {
            const uid = userIdRef.current;
            if (!uid) return;

            try {
                const userRef = doc(db, "users", uid);

                // 1. Increment time spent (minutes)
                await updateDoc(userRef, {
                    timeSpent: increment(1)
                });

                // 2. Read the updated total time
                const { getDoc } = await import("firebase/firestore");
                const snap = await getDoc(userRef);
                if (snap.exists()) {
                    const totalMinutes = snap.data().timeSpent || 0;

                    // 3. Check and unlock titles
                    const unlockedTitles = await checkAndUnlockTimeTitles(uid, totalMinutes);
                    if (unlockedTitles && unlockedTitles.length > 0) {
                        unlockedTitles.forEach(() => {
                            toast.success("Nouveau titre débloqué !", {
                                description: "Consultez votre profil pour voir vos nouveaux titres."
                            });
                        });
                    }

                    // === CHALLENGE TRACKING: Time Spent ===
                    trackTimeSpent(uid, totalMinutes).catch(error =>
                        console.error('Challenge tracking error:', error)
                    );
                }

            } catch (error) {
                console.error("Time tracking error:", error);
            }
        }, 60000); // 1 minute

        // === CHALLENGE TRACKING: Periodic Threshold Check ===
        // Vérifie les défis de seuil toutes les 2 minutes
        thresholdCheckRef.current = setInterval(async () => {
            if (!userIdRef.current) return;

            try {
                const uid = userIdRef.current;
                const userRef = doc(db, "users", uid);
                const { getDoc } = await import("firebase/firestore");
                const userSnap = await getDoc(userRef);

                if (!userSnap.exists()) return;

                const userData = userSnap.data();

                // Récupère les données du personnage si disponibles
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
                console.error("Threshold challenges check error:", error);
            }
        }, 120000); // 2 minutes
    };

    const stopTracking = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (thresholdCheckRef.current) {
            clearInterval(thresholdCheckRef.current);
            thresholdCheckRef.current = null;
        }
    };

    return null; // Invisible component
}

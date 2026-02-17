"use client";

import { useEffect, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc, increment } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { checkAndUnlockTimeTitles } from "@/lib/titles";
import { toast } from "sonner";

export default function TimeTracker() {
    const timerRef = useRef<NodeJS.Timeout | null>(null);
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
                }

            } catch (error) {
                console.error("Time tracking error:", error);
            }
        }, 60000); // 1 minute
    };

    const stopTracking = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    return null; // Invisible component
}

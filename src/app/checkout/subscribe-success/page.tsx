"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Crown, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { auth, db, doc, updateDoc } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

function SubscribeSuccessContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const sessionId = searchParams.get("session_id");
    const returnUrl = searchParams.get("returnUrl") || "/";
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

    useEffect(() => {
        if (!sessionId) {
            setStatus("error");
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                // Pas connecté, on affiche quand même le succès
                // Le webhook aura déjà traité l'activation via metadata userId
                setStatus("success");
                return;
            }

            try {
                // Mettre à jour Firestore directement (le webhook s'en charge aussi, 
                // mais on le fait ici en fallback pour les utilisateurs connectés)
                const userRef = doc(db, "users", user.uid);
                await updateDoc(userRef, {
                    premium: true,
                    premiumSince: new Date().toISOString(),
                });
                setStatus("success");
            } catch (error) {
                console.error("Error activating premium:", error);
                // On affiche quand même success car le webhook s'en occupe
                setStatus("success");
            }
        });

        return () => unsubscribe();
    }, [sessionId]);

    if (status === "loading") {
        return (
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 animate-spin" style={{ color: "var(--accent-brown)" }} />
                <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                    Activation de votre abonnement...
                </h2>
            </div>
        );
    }

    if (status === "success") {
        return (
            <div className="flex flex-col items-center gap-6">
                {/* Icône animée */}
                <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="relative"
                >
                    <div
                        className="w-24 h-24 rounded-full flex items-center justify-center"
                        style={{ background: "radial-gradient(circle, var(--accent-brown)/30, transparent)" }}
                    >
                        <Crown className="w-12 h-12" style={{ color: "var(--accent-brown)" }} />
                    </div>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="absolute -top-1 -right-1"
                    >
                        <Sparkles className="w-6 h-6" style={{ color: "var(--accent-brown)" }} />
                    </motion.div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-center"
                >
                    <h2 className="text-3xl font-bold mb-2" style={{ color: "var(--accent-brown)", fontFamily: "var(--font-papyrus, serif)" }}>
                        Bienvenue Premium !
                    </h2>
                    <p className="text-lg mb-1" style={{ color: "var(--text-primary)" }}>
                        Votre abonnement est maintenant actif.
                    </p>
                    <p style={{ color: "var(--text-primary)", opacity: 0.7 }}>
                        Tous les dés sont désormais accessibles et votre badge exclusif est activé.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="w-full"
                >
                    <Button
                        onClick={() => router.push(returnUrl)}
                        className="w-full py-6 text-lg font-bold transition-all"
                        style={{
                            background: "var(--accent-brown)",
                            color: "var(--bg-dark)",
                        }}
                    >
                        <Crown className="w-5 h-5 mr-2" />
                        Commencer l'aventure
                    </Button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center gap-6">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-2">
                <div className="w-10 h-10 text-red-500 text-4xl font-bold flex items-center justify-center">!</div>
            </div>
            <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Erreur</h2>
            <p style={{ color: "var(--text-primary)", opacity: 0.7 }}>
                Impossible de vérifier l'abonnement. Si vous avez été débité, contactez le support.
            </p>
            <Button
                onClick={() => router.push(returnUrl)}
                variant="outline"
                className="w-full border-white/20 text-white hover:bg-white/10"
            >
                Retour
            </Button>
        </div>
    );
}

export default function SubscribeSuccessPage() {
    return (
        <div
            className="min-h-screen flex items-center justify-center p-4"
            style={{ background: "var(--bg-darker, #0a0a0a)" }}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-8 rounded-2xl max-w-md w-full text-center shadow-2xl"
                style={{
                    background: "var(--bg-dark)",
                    border: "1px solid var(--border-color)",
                }}
            >
                <Suspense
                    fallback={
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="w-12 h-12 animate-spin" style={{ color: "var(--accent-brown)" }} />
                            <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                                Chargement...
                            </h2>
                        </div>
                    }
                >
                    <SubscribeSuccessContent />
                </Suspense>
            </motion.div>
        </div>
    );
}

"use client";

import React, { useState, useEffect } from "react";
import { Heart, Sparkles, Check, Crown, Dices, Loader2, Settings, ExternalLink, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { auth, db, doc, getDoc } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { useRouter, usePathname } from "next/navigation";

interface UserData {
    uid: string;
    email: string | null;
    premium?: boolean;
    stripeCustomerId?: string;
}

const FEATURES = [
    {
        icon: <Dices className="w-5 h-5" />,
        label: "Accès à tous les dés disponibles",
        description: "Débloquez l'intégralité de la collection de dés exclusifs.",
    },
    {
        icon: <Crown className="w-5 h-5" />,
        label: "Badge exclusif sur votre profil",
        description: "Affichez fièrement votre statut Premium.",
    },
    {
        icon: <ShieldCheck className="w-5 h-5" />,
        label: "Soutien direct aux serveurs",
        description: "Maintenez l'application en ligne et en constante évolution.",
    },
    {
        icon: <Heart className="w-5 h-5" style={{ color: "var(--accent-red, #e05252)" }} />,
        label: "La reconnaissance éternelle du développeur",
        description: "Merci du fond du cœur pour ce soutien inestimable.",
    },
];

export default function Boutique() {
    const router = useRouter();
    const pathname = usePathname();
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [subscribing, setSubscribing] = useState(false);
    const [managingPortal, setManagingPortal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const userRef = doc(db, "users", user.uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        setUserData({
                            uid: user.uid,
                            email: user.email,
                            premium: data.premium ?? false,
                            stripeCustomerId: data.stripeCustomerId,
                        });
                    } else {
                        setUserData({ uid: user.uid, email: user.email, premium: false });
                    }
                } catch (err) {
                    console.error("Error fetching user data:", err);
                    setUserData({ uid: user.uid, email: user.email, premium: false });
                }
            } else {
                setUserData(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleSubscribe = async () => {
        setSubscribing(true);
        setError(null);

        try {
            const response = await fetch("/api/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: userData?.uid || "",
                    userEmail: userData?.email || "",
                    returnUrl: pathname,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Erreur lors de la création de la session.");
            }

            if (data.url) {
                window.location.href = data.url;
            }
        } catch (err: any) {
            console.error("Subscribe error:", err);
            setError(err.message || "Une erreur est survenue. Veuillez réessayer.");
            setSubscribing(false);
        }
    };

    const handleManagePortal = async () => {
        if (!userData?.stripeCustomerId) return;
        setManagingPortal(true);

        try {
            const response = await fetch("/api/stripe-portal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    stripeCustomerId: userData.stripeCustomerId,
                    returnUrl: pathname,
                }),
            });

            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (err) {
            console.error("Portal error:", err);
        } finally {
            setManagingPortal(false);
        }
    };

    return (
        <div className="min-h-screen p-6 font-papyrus flex items-center justify-center">
            <div className="max-w-lg mx-auto w-full">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="rounded-2xl overflow-hidden shadow-2xl"
                    style={{
                        background: "var(--bg-dark)",
                        border: "1px solid var(--border-color)",
                    }}
                >
                    {/* Header avec gradient */}
                    <div
                        className="relative px-8 pt-10 pb-8 text-center overflow-hidden"
                        style={{
                            borderBottom: "1px solid var(--border-color)",
                            background: "linear-gradient(135deg, var(--bg-darker) 0%, var(--bg-dark) 100%)",
                        }}
                    >
                        {/* Effet lumineux d'arrière-plan */}
                        <div
                            className="absolute inset-0 opacity-10"
                            style={{
                                background: "radial-gradient(ellipse at 50% 0%, var(--accent-brown), transparent 70%)",
                            }}
                        />

                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                            className="relative flex justify-center mb-5"
                        >
                            <div
                                className="p-4 rounded-full"
                                style={{
                                    background: "var(--bg-dark)",
                                    border: "1px solid var(--accent-brown)/40",
                                    boxShadow: "0 0 30px -5px var(--accent-brown)",
                                }}
                            >
                                <Crown className="w-10 h-10" style={{ color: "var(--accent-brown)" }} />
                            </div>
                        </motion.div>

                        <h1
                            className="text-3xl font-bold mb-2 relative"
                            style={{ color: "var(--accent-brown)" }}
                        >
                            Soutenir le Projet
                        </h1>
                        <p className="relative text-base opacity-80" style={{ color: "var(--text-primary)" }}>
                            Devenez membre Premium et aidez à faire évoluer l'application.
                        </p>
                    </div>

                    {/* Prix */}
                    <div className="text-center py-6 px-8">
                        <div className="flex items-baseline justify-center gap-1">
                            <motion.span
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: 0.3, type: "spring" }}
                                className="text-6xl font-bold"
                                style={{ color: "var(--text-primary)" }}
                            >
                                4,99
                            </motion.span>
                            <span className="text-2xl font-medium" style={{ color: "var(--text-primary)", opacity: 0.7 }}>€</span>
                            <span className="text-sm font-medium ml-1" style={{ color: "var(--text-primary)", opacity: 0.5 }}>/ mois</span>
                        </div>
                        <p className="text-sm mt-2" style={{ color: "var(--text-primary)", opacity: 0.5 }}>
                            Sans engagement — Annulable à tout moment
                        </p>
                    </div>

                    {/* Features */}
                    <div className="px-8 pb-6 space-y-3">
                        {FEATURES.map((feature, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.1 * i + 0.4 }}
                                className="flex items-start gap-4 p-3 rounded-xl transition-colors"
                                style={{
                                    background: "var(--bg-darker)/50",
                                    border: "1px solid var(--border-color)",
                                }}
                            >
                                <div
                                    className="flex-shrink-0 mt-0.5"
                                    style={{ color: "var(--accent-brown)" }}
                                >
                                    {feature.icon}
                                </div>
                                <div>
                                    <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                                        {feature.label}
                                    </p>
                                    <p className="text-xs mt-0.5 opacity-60" style={{ color: "var(--text-primary)" }}>
                                        {feature.description}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Footer actions */}
                    <div className="px-8 pb-8 flex flex-col gap-3">
                        {loading ? (
                            /* Skeleton loader */
                            <div
                                className="w-full py-6 rounded-xl flex items-center justify-center"
                                style={{ background: "var(--bg-darker)" }}
                            >
                                <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--accent-brown)" }} />
                            </div>
                        ) : userData?.premium ? (
                            /* Déjà abonné */
                            <>
                                <div
                                    className="w-full py-4 px-6 rounded-xl flex items-center justify-center gap-3 text-base font-semibold"
                                    style={{
                                        background: "var(--accent-brown)/10",
                                        border: "1px solid var(--accent-brown)/40",
                                        color: "var(--accent-brown)",
                                    }}
                                >
                                    <Crown className="w-5 h-5" />
                                    Vous êtes déjà membre Premium
                                    <Sparkles className="w-4 h-4 opacity-70" />
                                </div>

                                {userData.stripeCustomerId && (
                                    <Button
                                        onClick={handleManagePortal}
                                        disabled={managingPortal}
                                        variant="outline"
                                        className="w-full py-5 text-sm"
                                        style={{
                                            borderColor: "var(--border-color)",
                                            color: "var(--text-primary)",
                                            background: "transparent",
                                        }}
                                    >
                                        {managingPortal ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <Settings className="w-4 h-4 mr-2" />
                                        )}
                                        Gérer mon abonnement
                                        <ExternalLink className="w-3 h-3 ml-2 opacity-50" />
                                    </Button>
                                )}
                            </>
                        ) : !userData ? (
                            /* Non connecté */
                            <div className="flex flex-col gap-2">
                                <Button
                                    onClick={() => router.push("/auth")}
                                    className="w-full py-6 text-base font-bold"
                                    style={{
                                        background: "var(--accent-brown)",
                                        color: "var(--bg-dark)",
                                    }}
                                >
                                    <Crown className="w-5 h-5 mr-2" />
                                    Se connecter pour s'abonner
                                </Button>
                                <p className="text-xs text-center opacity-50" style={{ color: "var(--text-primary)" }}>
                                    Un compte est requis pour l'abonnement
                                </p>
                            </div>
                        ) : (
                            /* Connecté, pas premium */
                            <>
                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="text-sm text-center py-2 px-4 rounded-lg"
                                        style={{
                                            background: "rgba(220, 50, 50, 0.1)",
                                            border: "1px solid rgba(220, 50, 50, 0.3)",
                                            color: "#f87171",
                                        }}
                                    >
                                        {error}
                                    </motion.div>
                                )}
                                <motion.div whileTap={{ scale: 0.98 }}>
                                    <Button
                                        onClick={handleSubscribe}
                                        disabled={subscribing}
                                        className="w-full py-6 text-lg font-bold transition-all hover:opacity-90 active:scale-95"
                                        style={{
                                            background: subscribing
                                                ? "var(--accent-brown)/60"
                                                : "var(--accent-brown)",
                                            color: "var(--bg-dark)",
                                            boxShadow: subscribing
                                                ? "none"
                                                : "0 0 20px -5px var(--accent-brown)",
                                        }}
                                    >
                                        {subscribing ? (
                                            <>
                                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                                Redirection vers Stripe...
                                            </>
                                        ) : (
                                            <>
                                                <Heart className="w-5 h-5 mr-2" />
                                                S'abonner maintenant
                                            </>
                                        )}
                                    </Button>
                                </motion.div>
                                <p className="text-xs text-center" style={{ color: "var(--text-primary)", opacity: 0.4 }}>
                                    Paiement sécurisé par Stripe · Annulable à tout moment
                                </p>
                            </>
                        )}
                    </div>
                </motion.div>

                {/* Badge Stripe */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="text-center text-xs mt-4 flex items-center justify-center gap-1.5"
                    style={{ color: "var(--text-primary)", opacity: 0.4 }}
                >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Paiements gérés par Stripe — 100% sécurisé
                </motion.p>
            </div>
        </div>
    );
}

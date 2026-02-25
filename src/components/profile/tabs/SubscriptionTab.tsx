"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
    Crown, Sparkles, Dices, ShieldCheck, Heart,
    Settings, ExternalLink, Loader2, CalendarDays, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { db, doc, updateDoc } from "@/lib/firebase";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

interface UserData {
    premium?: boolean;
    premiumSince?: string;
    stripeCustomerId?: string;
    cancelAtPeriodEnd?: boolean;
    premiumEndDate?: number;
}

interface SubscriptionTabProps {
    uid: string | null;
    userEmail: string | null;
    userData: UserData | null;
}

const FEATURES = [
    { icon: <Dices className="w-4 h-4" />, label: "Tous les dés débloqués", desc: "Accédez à l'intégralité de la collection." },
    { icon: <Crown className="w-4 h-4" />, label: "Badge Premium exclusif", desc: "Visible sur votre profil et en partie." },
    { icon: <ShieldCheck className="w-4 h-4" />, label: "Soutien direct aux serveurs", desc: "Maintenez l'app en ligne et en évolution." },
    { icon: <Heart className="w-4 h-4" />, label: "Reconnaissance du développeur", desc: "Un merci sincère et éternel ❤️" },
];

export default function SubscriptionTab({ uid, userEmail, userData }: SubscriptionTabProps) {
    const [subscribing, setSubscribing] = useState(false);
    const [managingPortal, setManagingPortal] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showCancelDialog, setShowCancelDialog] = useState(false);

    const premiumSinceFormatted = userData?.premiumSince
        ? new Date(userData.premiumSince).toLocaleDateString("fr-FR", {
            day: "numeric", month: "long", year: "numeric",
        })
        : null;

    const premiumEndDateFormatted = userData?.premiumEndDate
        ? new Date(userData.premiumEndDate * 1000).toLocaleDateString("fr-FR", {
            day: "numeric", month: "long", year: "numeric",
        })
        : null;

    const handleSubscribe = async () => {
        setSubscribing(true);
        setError(null);
        try {
            const res = await fetch("/api/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: uid, userEmail, returnUrl: "/profile" }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erreur Stripe");
            if (data.url) window.location.href = data.url;
        } catch (err: any) {
            setError(err.message);
            setSubscribing(false);
        }
    };

    const handleManagePortal = async () => {
        if (!userData?.stripeCustomerId) return;
        setManagingPortal(true);
        try {
            const res = await fetch("/api/stripe-portal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ stripeCustomerId: userData.stripeCustomerId, returnUrl: "/profile" }),
            });
            const data = await res.json();
            if (data.url) window.location.href = data.url;
        } catch (err) {
            console.error(err);
        } finally {
            setManagingPortal(false);
        }
    };

    const handleUnsubscribe = async () => {
        setShowCancelDialog(false);
        setManagingPortal(true);
        setError(null);
        try {
            const res = await fetch("/api/unsubscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: uid,
                    stripeCustomerId: userData?.stripeCustomerId,
                    stripeSubscriptionId: (userData as any)?.stripeSubscriptionId,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Erreur lors de la résiliation");

            // Le statut premium est mis à jour côté client pour éviter les problèmes de permissions côté serveur (non authentifié)
            if (uid) {
                const userRef = doc(db, "users", uid);
                if (data.cancelAt && typeof data.cancelAt === 'number') {
                    await updateDoc(userRef, {
                        cancelAtPeriodEnd: true,
                        premiumEndDate: data.cancelAt
                    });
                } else {
                    await updateDoc(userRef, {
                        premium: false,
                        stripeSubscriptionId: null,
                        cancelAtPeriodEnd: null,
                        premiumEndDate: null
                    });
                }
            }
        } catch (err: any) {
            setError(err.message);
            console.error(err);
        } finally {
            setManagingPortal(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Statut */}
            {userData?.premium ? (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl p-5 space-y-4"
                    style={{
                        background: "linear-gradient(135deg, rgba(180,130,70,0.12), rgba(180,130,70,0.04))",
                        border: "1px solid rgba(180,130,70,0.35)",
                    }}
                >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: "rgba(180,130,70,0.2)" }}
                            >
                                <Crown className="w-5 h-5" style={{ color: "var(--accent-brown)" }} />
                            </div>
                            <div>
                                <p className="font-bold flex items-center gap-1.5" style={{ color: "var(--accent-brown)" }}>
                                    Membre Premium actif
                                    <Sparkles className="w-3.5 h-3.5 opacity-70" />
                                </p>
                                {premiumSinceFormatted && (
                                    <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                                        <CalendarDays className="w-3 h-3" />
                                        Membre depuis le {premiumSinceFormatted}
                                    </p>
                                )}
                            </div>
                        </div>
                        {userData.cancelAtPeriodEnd ? (
                            <span
                                className="text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0 text-center"
                                style={{ background: "rgba(234,179,8,0.15)", color: "#eab308", border: "1px solid rgba(234,179,8,0.3)" }}
                            >
                                Expire {premiumEndDateFormatted ? `le ${premiumEndDateFormatted}` : "prochainement"}
                            </span>
                        ) : (
                            <span
                                className="text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0"
                                style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}
                            >
                                Actif
                            </span>
                        )}
                    </div>

                    {/* Avantages actifs */}
                    <div className="grid grid-cols-2 gap-2">
                        {FEATURES.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm">
                                <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--accent-brown)" }} />
                                <span style={{ color: "var(--text-primary)" }}>{f.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Prix */}
                    <div
                        className="text-xs pt-2 border-t flex items-center justify-between"
                        style={{ borderColor: "rgba(180,130,70,0.2)", color: "var(--text-secondary)" }}
                    >
                        <span>4,99 € / mois · Sans engagement</span>
                    </div>

                    {/* Boutons d'action : Portail / Résilier */}
                    <div className="flex flex-col sm:flex-row gap-2 mt-2">
                        {userData.stripeCustomerId && (
                            <Button
                                onClick={handleManagePortal}
                                disabled={managingPortal}
                                variant="outline"
                                className="flex-1"
                                style={{ borderColor: "rgba(180,130,70,0.4)", color: "var(--text-primary)" }}
                            >
                                {managingPortal
                                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    : <Settings className="w-4 h-4 mr-2" />
                                }
                                Portail Stripe
                                <ExternalLink className="w-3 h-3 ml-2 opacity-40" />
                            </Button>
                        )}

                        {!userData.cancelAtPeriodEnd && (
                            <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                                <DialogTrigger asChild>
                                    <Button
                                        disabled={managingPortal}
                                        variant="destructive"
                                        className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30"
                                    >
                                        {managingPortal ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                        Résilier l'abonnement
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md border-[var(--border-color)] bg-[var(--bg-darker)] text-[var(--text-primary)]">
                                    <DialogHeader>
                                        <DialogTitle>Résilier l'abonnement Premium</DialogTitle>
                                        <DialogDescription className="text-[var(--text-secondary)]">
                                            Êtes-vous sûr de vouloir résilier votre abonnement Premium ? Vous conserverez vos avantages jusqu'à la fin de la période de facturation en cours. Vous pourrez vous réabonner à tout moment.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <DialogFooter className="mt-4 flex-col sm:flex-row gap-2 sm:gap-3">
                                        <Button
                                            variant="outline"
                                            className="w-full sm:w-auto text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-[var(--bg-card)]"
                                            onClick={() => setShowCancelDialog(false)}
                                            disabled={managingPortal}
                                        >
                                            Annuler
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            className="w-full sm:w-auto bg-red-500/90 hover:bg-red-600 text-white"
                                            onClick={handleUnsubscribe}
                                            disabled={managingPortal}
                                        >
                                            Confirmer la résiliation
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>
                </motion.div>
            ) : (
                /* Pas premium */
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl p-5 space-y-4"
                    style={{ background: "var(--bg-darker)", border: "1px solid var(--border-color)" }}
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-500/10 flex items-center justify-center flex-shrink-0">
                            <Crown className="w-5 h-5 text-gray-400" />
                        </div>
                        <div>
                            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                                Pas d'abonnement actif
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                Abonnez-vous pour débloquer tous les avantages.
                            </p>
                        </div>
                    </div>

                    {/* Prix */}
                    <div className="flex items-baseline gap-1 justify-center py-2">
                        <span className="text-4xl font-bold" style={{ color: "var(--text-primary)" }}>4,99</span>
                        <span className="text-lg" style={{ color: "var(--text-secondary)" }}>€</span>
                        <span className="text-sm ml-1" style={{ color: "var(--text-secondary)" }}>/mois</span>
                    </div>

                    {error && (
                        <p className="text-xs text-red-400 text-center">{error}</p>
                    )}

                    <Button
                        onClick={handleSubscribe}
                        disabled={subscribing}
                        className="w-full py-5 text-base font-bold"
                        style={{
                            background: "var(--accent-brown)",
                            color: "var(--bg-dark)",
                            boxShadow: "0 0 24px -6px var(--accent-brown)",
                        }}
                    >
                        {subscribing ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Redirection...</>
                        ) : (
                            <><Crown className="w-4 h-4 mr-2" />S'abonner maintenant</>
                        )}
                    </Button>

                    <p className="text-xs text-center" style={{ color: "var(--text-secondary)" }}>
                        Sans engagement · Annulable à tout moment · Paiement Stripe
                    </p>
                </motion.div>
            )}

            {/* Avantages détaillés */}
            <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                    Avantages inclus
                </p>
                {FEATURES.map((f, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.07 }}
                        className="flex items-start gap-3 p-3 rounded-lg"
                        style={{ background: "var(--bg-darker)", border: "1px solid var(--border-color)" }}
                    >
                        <span className="mt-0.5 flex-shrink-0" style={{ color: "var(--accent-brown)" }}>{f.icon}</span>
                        <div>
                            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{f.label}</p>
                            <p className="text-xs opacity-60" style={{ color: "var(--text-primary)" }}>{f.desc}</p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

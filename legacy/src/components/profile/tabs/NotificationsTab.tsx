"use client";

import { useState, useEffect } from "react";
import { db, doc, updateDoc } from "@/lib/firebase";
import { Bell, Mail, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner"; // Assuming sonner is used, if not we'll just handle it quietly or use existing UI
import { motion } from "framer-motion";

interface NotificationsTabProps {
    uid: string | null;
    userEmail: string | null;
    userData: any | null;
}

export default function NotificationsTab({ uid, userEmail, userData }: NotificationsTabProps) {
    const [emailEnabled, setEmailEnabled] = useState(userData?.emailNotifications ?? true);
    const [loading, setLoading] = useState(false);

    // Sync state when userData changes initially
    useEffect(() => {
        if (userData && userData.emailNotifications !== undefined) {
            setEmailEnabled(userData.emailNotifications);
        }
    }, [userData]);

    const handleToggleEmail = async (checked: boolean) => {
        if (!uid || !userEmail) {
            toast.error("Impossible de trouver votre adresse email");
            return;
        }

        setEmailEnabled(checked);
        setLoading(true);
        try {
            // Update Firestore preference
            const userRef = doc(db, "users", uid);
            await updateDoc(userRef, {
                emailNotifications: checked
            });

            // Call internal API to sync with Resend Audience
            const res = await fetch("/api/resend/preferences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: userEmail,
                    firstName: userData.name || '',
                    enabled: checked
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to update Resend audience");
            }

            toast.success(checked ? "Vous êtes inscrit aux notifications" : "Vous êtes désinscrit des notifications");
        } catch (error) {
            console.error("Erreur lors de la mise à jour des préférences:", error);
            // Revert state on error
            setEmailEnabled(!checked);
            toast.error("Une erreur est survenue lors de la mise à jour");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                    Préférences de notifications
                </h3>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ background: "var(--bg-darker)", border: "1px solid var(--border-color)" }}
            >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(180,130,70,0.15)" }}>
                        <Mail className="w-5 h-5" style={{ color: "var(--accent-brown)" }} />
                    </div>
                    <div>
                        <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                            Emails de session
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            Recevoir un email lorsqu'une nouvelle session de JDR est planifiée.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                    <Switch
                        checked={emailEnabled}
                        onCheckedChange={handleToggleEmail}
                        disabled={loading}
                    />
                </div>
            </motion.div>
        </div>
    );
}

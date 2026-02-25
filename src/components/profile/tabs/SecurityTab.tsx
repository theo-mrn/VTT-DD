"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { Shield, Key, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function SecurityTab() {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);

    const user = auth.currentUser;
    const isGoogleUser = user?.providerData.some(provider => provider.providerId === 'google.com') &&
        !user?.providerData.some(provider => provider.providerId === 'password');

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            toast.error("Les nouveaux mots de passe ne correspondent pas");
            return;
        }

        if (newPassword.length < 6) {
            toast.error("Le mot de passe doit contenir au moins 6 caractères");
            return;
        }

        setLoading(true);
        const user = auth.currentUser;

        if (!user || !user.email) {
            toast.error("Utilisateur non authentifié");
            setLoading(false);
            return;
        }

        try {
            // Re-authentifier l'utilisateur (requis par Firebase pour le changement de mot de passe)
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);

            // Mettre à jour le mot de passe
            await updatePassword(user, newPassword);

            toast.success("Mot de passe mis à jour avec succès");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (error: any) {
            console.error("Erreur changement mot de passe:", error);
            if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
                toast.error("Mot de passe actuel incorrect");
            } else {
                toast.error("Une erreur est survenue lors de la mise à jour");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-[var(--text-secondary)]" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Sécurité du compte
                </h3>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-darker)] shadow-inner"
            >
                {isGoogleUser ? (
                    <div className="flex flex-col items-center py-4 text-center space-y-4">
                        <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-md">
                            <svg className="w-8 h-8" viewBox="0 0 24 24">
                                <path
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                                    fill="#4285F4"
                                />
                                <path
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    fill="#34A853"
                                />
                                <path
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    fill="#FBBC05"
                                />
                                <path
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    fill="#EA4335"
                                />
                            </svg>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-bold text-[var(--text-primary)]">Compte géré par Google</h4>
                            <p className="text-sm text-[var(--text-secondary)] max-w-xs mx-auto">
                                Votre compte est lié à Google. Pour modifier votre mot de passe, vous devez vous rendre dans les paramètres de votre compte Google.
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            className="mt-2 border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                            onClick={() => window.open("https://myaccount.google.com/security", "_blank")}
                        >
                            Gérer mon compte Google
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="current-password">Mot de passe actuel</Label>
                            <div className="relative">
                                <Input
                                    id="current-password"
                                    type={showCurrent ? "text" : "password"}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="pr-10 bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)]"
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrent(!showCurrent)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                >
                                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="h-px bg-[var(--border-color)] my-4 opacity-50" />

                        <div className="space-y-2">
                            <Label htmlFor="new-password">Nouveau mot de passe</Label>
                            <div className="relative">
                                <Input
                                    id="new-password"
                                    type={showNew ? "text" : "password"}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="pr-10 bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)]"
                                    placeholder="Min. 6 caractères"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNew(!showNew)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                >
                                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirm-password">Confirmer le nouveau mot de passe</Label>
                            <Input
                                id="confirm-password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)]"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-4 bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-dark)] text-white font-semibold py-6 rounded-xl transition-all shadow-lg active:scale-95"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Mise à jour...
                                </>
                            ) : (
                                <>
                                    <Key className="w-4 h-4 mr-2" />
                                    Modifier mon mot de passe
                                </>
                            )}
                        </Button>
                    </form>
                )}
            </motion.div>

            <p className="text-xs text-[var(--text-secondary)] px-2 italic">
                * Pour des raisons de sécurité, vous devez entrer votre mot de passe actuel pour effectuer ce changement.
            </p>
        </div>
    );
}

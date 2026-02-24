"use client";

import React from "react";
import { Heart, Sparkles, Check, Crown, Dices } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Boutique() {
    return (
        <div className="min-h-screen p-8 font-papyrus flex items-center justify-center">
            <div className="max-w-2xl mx-auto w-full">
                <Card className="bg-[var(--bg-dark)] text-[var(--text-primary)] border-[var(--border-color)] shadow-xl overflow-hidden">
                    <CardHeader className="text-center pb-8 border-b border-[var(--border-color)]">
                        <div className="flex justify-center mb-6 mt-4">
                            <div className="p-4 bg-[var(--bg-darker)] rounded-full border border-[var(--accent-brown)]/50 shadow-sm">
                                <Crown className="w-10 h-10 text-[var(--accent-brown)]" />
                            </div>
                        </div>
                        <CardTitle className="text-3xl font-bold text-[var(--accent-brown)] mb-2">
                            Soutenir le Projet
                        </CardTitle>
                        <CardDescription className="text-[var(--text-primary)] text-lg opacity-80">
                            Devenez membre Premium et aidez-moi à faire évoluer l'application.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="pt-8">
                        <div className="flex flex-col items-center">
                            <div className="flex items-baseline justify-center gap-1 mb-6">
                                <span className="text-5xl font-bold text-white">4,99</span>
                                <span className="text-xl text-gray-300">€</span>
                                <span className="text-sm font-medium text-gray-400 ml-1">/ mois</span>
                            </div>

                            <div className="w-full max-w-md space-y-4 mb-8">
                                <div className="flex items-center gap-4 p-3 rounded-lg bg-[var(--bg-darker)]/50">
                                    <Check className="w-5 h-5 text-[var(--accent-brown)] flex-shrink-0" />
                                    <span>Soutien direct au maintien des serveurs</span>
                                </div>
                                <div className="flex items-center gap-4 p-3 rounded-lg bg-[var(--bg-darker)]/50">
                                    <Dices className="w-5 h-5 text-[var(--accent-brown)] flex-shrink-0" />
                                    <span>Acces a tout les dés disponibles</span>
                                </div>
                                <div className="flex items-center gap-4 p-3 rounded-lg bg-[var(--bg-darker)]/50">
                                    <Crown className="w-5 h-5 text-[var(--accent-brown)] flex-shrink-0" />
                                    <span>Badge exclusif sur votre profil</span>
                                </div>
                                <div className="flex items-center gap-4 p-3 rounded-lg bg-[var(--bg-darker)]/50">
                                    <Heart className="w-5 h-5 text-red-500/80 flex-shrink-0" />
                                    <span>La reconnaissance éternelle du développeur</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>

                    <CardFooter className="flex flex-col gap-4 pb-8">
                        <Button
                            className="w-full max-w-md mx-auto py-6 text-lg bg-[var(--accent-brown)] hover:bg-[var(--accent-brown)]/80 text-[var(--bg-dark)] font-bold transition-colors"
                        >
                            <Heart className="w-5 h-5 mr-2" />
                            S'abonner maintenant
                        </Button>
                        <p className="text-sm text-center text-gray-500 w-full mt-2">
                            Sans engagement. Annulable à tout moment.
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}

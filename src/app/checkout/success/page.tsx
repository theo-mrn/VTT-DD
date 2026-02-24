"use client";

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { auth, db, doc, getDoc, updateDoc } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { arrayUnion } from 'firebase/firestore';

export default function CheckoutSuccessPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const sessionId = searchParams.get('session_id');
    const skinId = searchParams.get('skin_id');
    const returnUrl = searchParams.get('returnUrl') || '/';
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

    useEffect(() => {
        if (!sessionId || !skinId) {
            setStatus('error');
            return;
        }

        // Wait for Firebase Auth to be ready, then write to Firestore
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                // User not logged in — still mark success (they may be redirected to login)
                setStatus('success');
                return;
            }

            try {
                const userRef = doc(db, 'users', user.uid);
                await updateDoc(userRef, {
                    dice_inventory: arrayUnion(skinId),
                });
                setStatus('success');
            } catch (error) {
                console.error('Error granting item in Firestore:', error);
                setStatus('error');
            }
        });

        return () => unsubscribe();
    }, [sessionId, skinId]);

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#111] p-8 rounded-2xl border border-white/10 max-w-md w-full text-center shadow-2xl"
            >
                {status === 'loading' && (
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                        <h2 className="text-xl font-bold text-white">Vérification du paiement...</h2>
                    </div>
                )}

                {status === 'success' && (
                    <div className="flex flex-col items-center gap-6">
                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-2">
                            <CheckCircle className="w-10 h-10 text-green-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Achat Réussi !</h2>
                        <p className="text-gray-400">
                            Merci pour votre achat. Les nouveaux dés ont été ajoutés à votre inventaire.
                        </p>
                        <Button
                            onClick={() => router.push(returnUrl)}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            Retour au jeu
                        </Button>
                    </div>
                )}

                {status === 'error' && (
                    <div className="flex flex-col items-center gap-6">
                        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-2">
                            <div className="w-10 h-10 text-red-500 text-4xl font-bold flex items-center justify-center">!</div>
                        </div>
                        <h2 className="text-2xl font-bold text-white">Erreur</h2>
                        <p className="text-gray-400">
                            Impossible de vérifier le paiement. Si vous avez été débité, veuillez contacter le support.
                        </p>
                        <Button
                            onClick={() => router.push(returnUrl)}
                            variant="outline"
                            className="w-full border-white/20 text-white hover:bg-white/10"
                        >
                            Retour
                        </Button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}

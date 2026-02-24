"use client";

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

function CheckoutCancelContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    return (
        <div className="flex flex-col items-center gap-6">
            <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mb-2">
                <XCircle className="w-10 h-10 text-amber-500" />
            </div>
            <h2 className="text-2xl font-bold text-white">Achat Annulé</h2>
            <p className="text-gray-400">
                Votre achat n'a pas été finalisé. Aucun montant n'a été débité.
                Vous pouvez retourner au jeu.
            </p>
            <div className="flex gap-4 w-full mt-4">
                <Button
                    onClick={() => router.push(searchParams.get('returnUrl') || '/')}
                    variant="outline"
                    className="flex-1 border-white/20 text-white hover:bg-white/10"
                >
                    Retour au jeu
                </Button>
            </div>
        </div>
    );
}

export default function CheckoutCancelPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#111] p-8 rounded-2xl border border-white/10 max-w-md w-full text-center shadow-2xl"
            >
                <Suspense fallback={
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
                    </div>
                }>
                    <CheckoutCancelContent />
                </Suspense>
            </motion.div>
        </div>
    );
}

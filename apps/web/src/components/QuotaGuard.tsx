"use client";

import { useState, useEffect, useRef } from 'react';
import { useGame } from '@/contexts/GameContext';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, increment, setDoc, query, collection, where, limit as firestoreLimit } from 'firebase/firestore';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Sparkles, X } from "lucide-react";
import Boutique from "./(infos)/boutique";

const DEFAULT_LIMIT = 22.7 * 1024 * 1024; // 22.7 MB
const PREMIUM_LIMIT = 50 * 1024 * 1024; // 50 MB
const FREE_HOSTS = [
    "pub-6b6ff93daa684afe8aca1537c143add0.r2.dev",
    "assets.yner.fr"
];

export default function QuotaGuard() {
    const { user } = useGame();
    const roomId = user?.roomId;
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showBoutique, setShowBoutique] = useState(false);
    const [currentLimit, setCurrentLimit] = useState(DEFAULT_LIMIT);
    const currentUsageRef = useRef<number>(0);
    const currentLimitRef = useRef<number>(DEFAULT_LIMIT);

    // 1. Monitor the quota in real-time
    useEffect(() => {
        if (!roomId) return;

        const unsubUsage = onSnapshot(doc(db, 'rooms', roomId, 'usage', 'storage'), (snap) => {
            if (snap.exists()) {
                const total = snap.data().totalBytes || 0;
                currentUsageRef.current = total;
            }
        });

        // 2. Monitor premium status to adjust limit
        const q = query(
            collection(db, 'users'),
            where('room_id', '==', roomId),
            where('premium', '==', true),
            firestoreLimit(1)
        );

        const unsubPremium = onSnapshot(q, (snapshot) => {
            const limit = !snapshot.empty ? PREMIUM_LIMIT : DEFAULT_LIMIT;
            setCurrentLimit(limit);
            currentLimitRef.current = limit;
        });

        return () => {
            unsubUsage();
            unsubPremium();
        };
    }, [roomId]);

    // 2. Global Interception (Middleware)
    useEffect(() => {
        if (!roomId) return;

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...args: any[]) {
            const urlStr = url.toString();
            (this as any)._url = urlStr;
            (this as any)._isStorage = urlStr.includes('firebasestorage.googleapis.com') &&
                !FREE_HOSTS.some(host => urlStr.includes(host));
            return originalOpen.apply(this, [method, url, ...args] as any);
        };

        XMLHttpRequest.prototype.send = function (body: any) {
            const isStorage = (this as any)._isStorage;

            if (isStorage) {
                let fileSize = 0;
                if (body instanceof Blob || body instanceof File) {
                    fileSize = body.size;
                } else if (typeof body === 'string') {
                    fileSize = body.length;
                }

                if (fileSize > 0) {
                    (this as any)._fileSize = fileSize; // Save for later increment
                    const projectUsage = currentUsageRef.current;
                    const limit = currentLimitRef.current;

                    if (projectUsage + fileSize > limit) {
                        setIsModalOpen(true);
                        console.error("[QuotaGuard] Blocking upload. Limit:", limit, "Attempted size:", fileSize, "Current:", projectUsage);
                        this.dispatchEvent(new ProgressEvent('error'));
                        return; // Block execution
                    }

                    this.addEventListener('load', async () => {
                        if (this.status >= 200 && this.status < 300) {
                            try {
                                const usageRef = doc(db, 'rooms', roomId, 'usage', 'storage');
                                await setDoc(usageRef, {
                                    totalBytes: increment(fileSize),
                                    lastUpdate: new Date()
                                }, { merge: true });
                            } catch (e) {
                                console.error("[QuotaGuard] Failed to update usage counter:", e);
                            }
                        }
                    });
                }
            }

            return originalSend.apply(this, [body] as any);
        };

        return () => {
            XMLHttpRequest.prototype.open = originalOpen;
            XMLHttpRequest.prototype.send = originalSend;
        };
    }, [roomId]);

    return (
        <>
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent unstyled showCloseButton={false} className="max-w-md">
                    <div className="relative isolate overflow-hidden bg-[#0c0c0e] border border-[#c0a080]/30 rounded-2xl shadow-2xl p-0 font-body">
                        <div className="absolute inset-0 bg-gradient-to-br from-[#c0a080]/10 to-transparent pointer-events-none" />

                        <div className="relative p-8 text-center flex flex-col items-center">
                            <div className="w-16 h-16 rounded-full bg-[#1c1c1c] border border-[#c0a080]/40 flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(192,160,128,0.2)]">
                                <ShieldAlert className="w-8 h-8 text-[#c0a080]" />
                            </div>

                            <h2 className="text-2xl font-title font-bold text-[#c0a080] mb-3 tracking-wide">
                                Limite de Stockage Atteinte
                            </h2>

                            <p className="text-zinc-400 text-sm leading-relaxed mb-8 max-w-[280px]">
                                Vous avez utilisé tout votre espace (<span className="text-[#c0a080] font-bold">{currentLimit / (1024 * 1024)} Mo</span>).
                                Supprimez des fichiers ou passez à <span className="text-white font-bold">VTT-DD PRO</span>.
                            </p>

                            <div className="flex flex-col w-full gap-3">
                                <Button
                                    onClick={() => {
                                        setIsModalOpen(false);
                                        setShowBoutique(true);
                                    }}
                                    className="w-full bg-[#c0a080] hover:bg-[#d4b48f] text-black font-bold py-6 rounded-xl transition-all shadow-[0_0_15px_rgba(192,160,128,0.3)] flex items-center justify-center gap-2"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    Découvrir PRO (+15 Go)
                                </Button>

                                <Button
                                    variant="ghost"
                                    onClick={() => setIsModalOpen(false)}
                                    className="w-full text-zinc-500 hover:text-white hover:bg-white/5 font-medium py-3"
                                >
                                    Fermer
                                </Button>
                            </div>
                        </div>
                        <div className="absolute top-0 left-0 right-0 h-1 bg-[#c0a080]" />
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showBoutique} onOpenChange={setShowBoutique}>
                <DialogContent unstyled showCloseButton={false} className="max-w-xl">
                    <div className="relative bg-[#0c0c0e] border border-[#c0a080]/30 rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto scrollbar-thin">
                        <Boutique />
                        <button
                            onClick={() => setShowBoutique(false)}
                            className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-[#c0a080] text-white hover:text-black rounded-full transition-all z-50 border border-white/10"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

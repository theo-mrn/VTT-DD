"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { db, collection, onSnapshot, query, orderBy, limitToLast } from "@/lib/firebase";
import { useGame } from "@/contexts/GameContext";
import { toast } from "sonner";

interface ChatNotificationContextType {
    unreadCount: number;
    clearUnread: () => void;
}

const ChatNotificationContext = createContext<ChatNotificationContextType | undefined>(undefined);

export function ChatNotificationProvider({ children }: { children: ReactNode }) {
    const { user } = useGame();
    const [unreadCount, setUnreadCount] = useState(0);
    const isFirstLoad = useRef(true);

    useEffect(() => {
        const roomId = user?.roomId;
        if (!roomId) return;

        isFirstLoad.current = true;

        const q = query(
            collection(db, `rooms/${roomId}/chat`),
            orderBy("timestamp", "asc"),
            limitToLast(1)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (isFirstLoad.current) {
                isFirstLoad.current = false;
                return;
            }

            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    const isSender = data.uid === user?.uid;
                    if (!isSender) {
                        setUnreadCount((prev) => prev + 1);
                        toast(data.sender ?? "Nouveau message", {
                            description: data.text ?? "Image partagée",
                        });
                    }
                }
            });
        });

        return () => unsubscribe();
    }, [user?.roomId, user?.uid]);

    const clearUnread = useCallback(() => setUnreadCount(0), []);

    return (
        <ChatNotificationContext.Provider value={{ unreadCount, clearUnread }}>
            {children}
        </ChatNotificationContext.Provider>
    );
}

export function useChatNotification() {
    const ctx = useContext(ChatNotificationContext);
    if (!ctx) throw new Error("useChatNotification must be used within ChatNotificationProvider");
    return ctx;
}

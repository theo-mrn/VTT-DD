"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface DialogVisibilityContextType {
    isDialogOpen: boolean;
    setDialogOpen: (isOpen: boolean) => void;
}

const DialogVisibilityContext = createContext<DialogVisibilityContextType | undefined>(undefined);

export function DialogVisibilityProvider({ children }: { children: ReactNode }) {
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    return (
        <DialogVisibilityContext.Provider value={{ isDialogOpen, setDialogOpen: setIsDialogOpen }}>
            {children}
        </DialogVisibilityContext.Provider>
    );
}

export function useDialogVisibility() {
    const context = useContext(DialogVisibilityContext);
    if (context === undefined) {
        throw new Error('useDialogVisibility must be used within a DialogVisibilityProvider');
    }
    return context;
}

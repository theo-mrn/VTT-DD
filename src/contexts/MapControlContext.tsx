'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

type FocusTarget = {
    characterId: string | null;
    timestamp: number;
};

interface MapControlContextType {
    focusTarget: FocusTarget;
    centerOnCharacter: (characterId: string) => void;
    selectedCityId: string | null;
    setSelectedCityId: (cityId: string | null) => void;
    clearFocus: () => void;
}

const MapControlContext = createContext<MapControlContextType | undefined>(undefined);

export function MapControlProvider({ children }: { children: ReactNode }) {
    const [focusTarget, setFocusTarget] = useState<FocusTarget>({ characterId: null, timestamp: 0 });
    const [selectedCityId, setSelectedCityId] = useState<string | null>(null);

    const centerOnCharacter = useCallback((characterId: string) => {
        setFocusTarget({ characterId, timestamp: Date.now() });
    }, []);

    const clearFocus = useCallback(() => {
        setFocusTarget({ characterId: null, timestamp: 0 });
    }, []);

    return (
        <MapControlContext.Provider value={{ focusTarget, centerOnCharacter, selectedCityId, setSelectedCityId, clearFocus }}>
            {children}
        </MapControlContext.Provider>
    );
}

export function useMapControl() {
    const context = useContext(MapControlContext);
    if (context === undefined) {
        throw new Error('useMapControl must be used within a MapControlProvider');
    }
    return context;
}

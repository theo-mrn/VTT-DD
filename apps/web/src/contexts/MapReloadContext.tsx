"use client";

import { createContext, useContext } from 'react';

export const MapReloadContext = createContext<() => void>(() => {});

export function useMapReload() {
    return useContext(MapReloadContext);
}

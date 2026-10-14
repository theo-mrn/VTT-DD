/** Dernier réglage appliqué à la table (panneau ou déclencheur), pour le marquer « en cours ». */
import { createStore } from 'zustand/vanilla';

export const lastAutomation = createStore<{ id: string | null }>(() => ({ id: null }));

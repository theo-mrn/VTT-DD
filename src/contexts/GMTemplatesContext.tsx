"use client"

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useGame } from '@/contexts/GameContext'
import { type NPC, type Category } from '@/components/(personnages)/personnages'
import { type ObjectTemplate } from '@/app/[roomid]/map/types'
import { useNpcStatFields } from '@/hooks/useNpcStatFields'

// --- Types ---

export interface SoundTemplate {
    id: string
    name: string
    soundUrl: string
    type: 'file' | 'youtube'
    category?: 'music' | 'sound'
    duration?: number
    createdAt?: Date
}

export interface MusicPlaylist {
    id: string
    name: string
    trackIds: string[]
    createdAt?: Date
}

export interface ExistingNPC {
    id: string
    Nomperso: string
    imageURL2?: string
    niveau: number
    visibility: 'visible' | 'hidden' | 'ally' | 'invisible'
    cityName?: string
    cityId?: string | null
    // Index signature additive : stats du système actif (ex PV/Defense/FOR pour dnd-classic,
    // vigueur/Stress/... pour un système custom) — cf NPC (personnages.tsx) / NewCharacter (map/types.ts).
    [key: string]: unknown
}

interface GMTemplatesContextType {
    // Data
    npcTemplates: NPC[]
    npcCategories: Category[]
    soundTemplates: SoundTemplate[]
    objectTemplates: ObjectTemplate[]
    existingNPCs: ExistingNPC[]
    cities: { id: string; name: string }[]
    playlists: MusicPlaylist[]
    loading: boolean

    // CRUD NPC Templates
    addNPCTemplate: (data: Record<string, any>) => Promise<string>
    updateNPCTemplate: (id: string, data: Record<string, any>) => Promise<void>

    // CRUD Sound Templates
    addSoundTemplate: (data: Record<string, any>) => Promise<string>
    deleteSoundTemplate: (id: string) => Promise<void>

    // CRUD Playlists
    addPlaylist: (data: { name: string; trackIds: string[] }) => Promise<string>
    updatePlaylist: (id: string, data: Partial<Pick<MusicPlaylist, 'name' | 'trackIds'>>) => Promise<void>
    deletePlaylist: (id: string) => Promise<void>

    // CRUD Object Templates
    addObjectTemplate: (data: Record<string, any>) => Promise<string>

    // Refresh
    refresh: () => Promise<void>
    refreshExistingNPCs: () => Promise<void>
}

const GMTemplatesContext = createContext<GMTemplatesContextType | null>(null)

export function useGMTemplates() {
    const ctx = useContext(GMTemplatesContext)
    if (!ctx) throw new Error('useGMTemplates must be used within GMTemplatesProvider')
    return ctx
}

export function GMTemplatesProvider({ roomId, children }: { roomId: string; children: React.ReactNode }) {
    const { isMJ } = useGame()
    const { abilityStats, vitalStats, defenseKey, combatAttackKeys, extraCombatStats, getDefaultValue } = useNpcStatFields(roomId)
    const [npcTemplates, setNpcTemplates] = useState<NPC[]>([])
    const [npcCategories, setNpcCategories] = useState<Category[]>([])
    const [soundTemplates, setSoundTemplates] = useState<SoundTemplate[]>([])
    const [objectTemplates, setObjectTemplates] = useState<ObjectTemplate[]>([])
    const [playlists, setPlaylists] = useState<MusicPlaylist[]>([])
    const [existingNPCs, setExistingNPCs] = useState<ExistingNPC[]>([])
    const [cities, setCities] = useState<{ id: string; name: string }[]>([])
    const [loading, setLoading] = useState(true)
    const loadedRef = useRef(false)

    // Construit un ExistingNPC depuis un document Firestore de personnage, en copiant dynamiquement
    // chaque clé de stat du système actif (caractéristiques, stats vitales, défense, attaques de combat,
    // stats de combat additionnelles) — jamais une liste fixe de 13 clés D&D (ex "INIT" affiché avec une
    // valeur inventée sur un système qui n'a pas cette notion). Même pattern que parseCharacterDoc
    // (map/page.tsx).
    const buildExistingNPC = useCallback((id: string, data: Record<string, any>, cityNamesMap: Map<string, string>): ExistingNPC => {
        const npc: ExistingNPC = {
            id,
            Nomperso: data.Nomperso || 'Sans nom',
            imageURL2: data.imageURL2 || data.imageURL,
            niveau: data.niveau || 1,
            visibility: data.visibility || 'hidden',
            cityName: data.cityId ? cityNamesMap.get(data.cityId) : 'Aucune ville',
            cityId: data.cityId || null,
        }
        for (const stat of abilityStats) npc[stat.key] = data[stat.key] ?? getDefaultValue(stat)
        for (const { stat, maxKey } of vitalStats) {
            npc[stat.key] = data[stat.key] ?? 0
            if (maxKey) npc[maxKey] = data[maxKey] ?? 0
        }
        if (defenseKey) npc[defenseKey] = data[defenseKey] ?? 5
        for (const key of combatAttackKeys) npc[key] = data[key] ?? 0
        for (const stat of extraCombatStats) npc[stat.key] = data[stat.key] ?? 0
        return npc
    }, [abilityStats, vitalStats, defenseKey, combatAttackKeys, extraCombatStats, getDefaultValue])

    // --- Fetch all data once ---
    const fetchAll = useCallback(async () => {
        if (!roomId) return
        setLoading(true)

        try {
            const [
                npcSnap,
                catSnap,
                soundSnap,
                objSnap,
                playlistSnap,
                citiesSnap,
                charsSnap,
            ] = await Promise.all([
                getDocs(query(collection(db, 'npc_templates', roomId, 'templates'))),
                getDocs(query(collection(db, 'npc_templates', roomId, 'categories'))),
                getDocs(query(collection(db, 'sound_templates', roomId, 'templates'))),
                getDocs(query(collection(db, 'object_templates', roomId, 'templates'))),
                getDocs(query(collection(db, 'sound_templates', roomId, 'playlists'))),
                getDocs(query(collection(db, 'cartes', roomId, 'cities'))),
                getDocs(query(collection(db, 'cartes', roomId, 'characters'))),
            ])

            // NPC Templates
            setNpcTemplates(npcSnap.docs.map(d => ({ id: d.id, ...d.data() } as NPC)))

            // Categories
            setNpcCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category)))

            // Sound Templates
            setSoundTemplates(soundSnap.docs.map(d => ({ id: d.id, ...d.data() } as SoundTemplate)))

            // Object Templates
            setObjectTemplates(objSnap.docs.map(d => ({ id: d.id, ...d.data() } as ObjectTemplate)))

            // Playlists
            setPlaylists(playlistSnap.docs.map(d => ({ id: d.id, ...d.data() } as MusicPlaylist)))

            // Cities
            const cityNamesMap = new Map<string, string>()
            const citiesList: { id: string; name: string }[] = []
            citiesSnap.docs.forEach(d => {
                const cityName = d.data().name || 'Ville inconnue'
                cityNamesMap.set(d.id, cityName)
                citiesList.push({ id: d.id, name: cityName })
            })
            setCities(citiesList)

            // Existing NPCs (characters on the map that are not players)
            const npcs: ExistingNPC[] = []
            charsSnap.docs.forEach(d => {
                const data = d.data()
                if (data.type !== 'joueurs') {
                    npcs.push(buildExistingNPC(d.id, data, cityNamesMap))
                }
            })
            setExistingNPCs(npcs)
        } catch (error) {
            console.error('GMTemplatesContext: Error loading data', error)
        } finally {
            setLoading(false)
        }
    }, [roomId, buildExistingNPC])

    // Load on mount — MJ only, joueurs n'ont jamais besoin de ces données
    useEffect(() => {
        if (!roomId || !isMJ || loadedRef.current) return
        loadedRef.current = true
        fetchAll()
    }, [roomId, isMJ, fetchAll])

    // Real-time listener for NPC templates & categories
    useEffect(() => {
        if (!roomId || !isMJ) return
        const unsubTemplates = onSnapshot(
            collection(db, 'npc_templates', roomId, 'templates'),
            (snap) => setNpcTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() } as NPC)))
        )
        const unsubCategories = onSnapshot(
            collection(db, 'npc_templates', roomId, 'categories'),
            (snap) => setNpcCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)))
        )
        return () => { unsubTemplates(); unsubCategories() }
    }, [roomId, isMJ])

    // --- CRUD: NPC Templates ---

    const addNPCTemplate = useCallback(async (data: Record<string, any>): Promise<string> => {
        const tempId = `temp-${Date.now()}`
        const optimistic = { id: tempId, ...data } as NPC
        setNpcTemplates(prev => [...prev, optimistic])

        const docRef = await addDoc(collection(db, 'npc_templates', roomId, 'templates'), data)
        setNpcTemplates(prev => prev.map(t => t.id === tempId ? { ...t, id: docRef.id } : t))
        return docRef.id
    }, [roomId])

    const updateNPCTemplate = useCallback(async (id: string, data: Record<string, any>): Promise<void> => {
        setNpcTemplates(prev => prev.map(t => t.id === id ? { ...t, ...data } as NPC : t))
        await updateDoc(doc(db, 'npc_templates', roomId, 'templates', id), data)
    }, [roomId])

    // --- CRUD: Sound Templates ---

    const addSoundTemplate = useCallback(async (data: Record<string, any>): Promise<string> => {
        const tempId = `temp-${Date.now()}`
        const optimistic = { id: tempId, ...data } as SoundTemplate
        setSoundTemplates(prev => [...prev, optimistic])

        const docRef = await addDoc(collection(db, 'sound_templates', roomId, 'templates'), data)
        setSoundTemplates(prev => prev.map(t => t.id === tempId ? { ...t, id: docRef.id } : t))
        return docRef.id
    }, [roomId])

    const deleteSoundTemplate = useCallback(async (id: string): Promise<void> => {
        setSoundTemplates(prev => prev.filter(t => t.id !== id))
        await deleteDoc(doc(db, 'sound_templates', roomId, 'templates', id))
    }, [roomId])

    // --- CRUD: Playlists ---

    const addPlaylist = useCallback(async (data: { name: string; trackIds: string[] }): Promise<string> => {
        const tempId = `temp-${Date.now()}`
        const optimistic = { id: tempId, ...data, createdAt: new Date() } as MusicPlaylist
        setPlaylists(prev => [...prev, optimistic])

        const docRef = await addDoc(collection(db, 'sound_templates', roomId, 'playlists'), { ...data, createdAt: new Date() })
        setPlaylists(prev => prev.map(p => p.id === tempId ? { ...p, id: docRef.id } : p))
        return docRef.id
    }, [roomId])

    const updatePlaylist = useCallback(async (id: string, data: Partial<Pick<MusicPlaylist, 'name' | 'trackIds'>>): Promise<void> => {
        setPlaylists(prev => prev.map(p => p.id === id ? { ...p, ...data } : p))
        await updateDoc(doc(db, 'sound_templates', roomId, 'playlists', id), data)
    }, [roomId])

    const deletePlaylist = useCallback(async (id: string): Promise<void> => {
        setPlaylists(prev => prev.filter(p => p.id !== id))
        await deleteDoc(doc(db, 'sound_templates', roomId, 'playlists', id))
    }, [roomId])

    // --- CRUD: Object Templates ---

    const addObjectTemplate = useCallback(async (data: Record<string, any>): Promise<string> => {
        const tempId = `temp-${Date.now()}`
        const optimistic = { id: tempId, ...data } as ObjectTemplate
        setObjectTemplates(prev => [...prev, optimistic])

        const docRef = await addDoc(collection(db, 'object_templates', roomId, 'templates'), data)
        setObjectTemplates(prev => prev.map(t => t.id === tempId ? { ...t, id: docRef.id } : t))
        return docRef.id
    }, [roomId])

    // --- Refresh ---

    const refresh = useCallback(async () => {
        loadedRef.current = false
        await fetchAll()
    }, [fetchAll])

    const refreshExistingNPCs = useCallback(async () => {
        if (!roomId) return
        const [citiesSnap, charsSnap] = await Promise.all([
            getDocs(query(collection(db, 'cartes', roomId, 'cities'))),
            getDocs(query(collection(db, 'cartes', roomId, 'characters'))),
        ])
        const cityNamesMap = new Map<string, string>()
        const citiesList: { id: string; name: string }[] = []
        citiesSnap.docs.forEach(d => {
            const cityName = d.data().name || 'Ville inconnue'
            cityNamesMap.set(d.id, cityName)
            citiesList.push({ id: d.id, name: cityName })
        })
        setCities(citiesList)

        const npcs: ExistingNPC[] = []
        charsSnap.docs.forEach(d => {
            const data = d.data()
            if (data.type !== 'joueurs') {
                npcs.push(buildExistingNPC(d.id, data, cityNamesMap))
            }
        })
        setExistingNPCs(npcs)
    }, [roomId, buildExistingNPC])

    return (
        <GMTemplatesContext.Provider value={{
            npcTemplates,
            npcCategories,
            soundTemplates,
            objectTemplates,
            existingNPCs,
            cities,
            playlists,
            loading,
            addNPCTemplate,
            updateNPCTemplate,
            addSoundTemplate,
            deleteSoundTemplate,
            addPlaylist,
            updatePlaylist,
            deletePlaylist,
            addObjectTemplate,
            refresh,
            refreshExistingNPCs,
        }}>
            {children}
        </GMTemplatesContext.Provider>
    )
}

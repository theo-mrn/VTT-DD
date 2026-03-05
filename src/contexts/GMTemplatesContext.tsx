"use client"

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useGame } from '@/contexts/GameContext'
import { type NPC, type Category } from '@/components/(personnages)/personnages'
import { type ObjectTemplate } from '@/app/[roomid]/map/types'

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

export interface ExistingNPC {
    id: string
    Nomperso: string
    imageURL2?: string
    niveau: number
    PV: number
    PV_Max: number
    Defense: number
    FOR: number
    DEX: number
    CON: number
    INT: number
    SAG: number
    CHA: number
    Contact: number
    Distance: number
    Magie: number
    INIT: number
    visibility: 'visible' | 'hidden' | 'ally' | 'invisible'
    cityName?: string
    cityId?: string | null
}

interface GMTemplatesContextType {
    // Data
    npcTemplates: NPC[]
    npcCategories: Category[]
    soundTemplates: SoundTemplate[]
    objectTemplates: ObjectTemplate[]
    existingNPCs: ExistingNPC[]
    cities: { id: string; name: string }[]
    loading: boolean

    // CRUD NPC Templates
    addNPCTemplate: (data: Record<string, any>) => Promise<string>
    updateNPCTemplate: (id: string, data: Record<string, any>) => Promise<void>

    // CRUD Sound Templates
    addSoundTemplate: (data: Record<string, any>) => Promise<string>
    deleteSoundTemplate: (id: string) => Promise<void>

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
    const [npcTemplates, setNpcTemplates] = useState<NPC[]>([])
    const [npcCategories, setNpcCategories] = useState<Category[]>([])
    const [soundTemplates, setSoundTemplates] = useState<SoundTemplate[]>([])
    const [objectTemplates, setObjectTemplates] = useState<ObjectTemplate[]>([])
    const [existingNPCs, setExistingNPCs] = useState<ExistingNPC[]>([])
    const [cities, setCities] = useState<{ id: string; name: string }[]>([])
    const [loading, setLoading] = useState(true)
    const loadedRef = useRef(false)

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
                citiesSnap,
                charsSnap,
            ] = await Promise.all([
                getDocs(query(collection(db, 'npc_templates', roomId, 'templates'))),
                getDocs(query(collection(db, 'npc_templates', roomId, 'categories'))),
                getDocs(query(collection(db, 'sound_templates', roomId, 'templates'))),
                getDocs(query(collection(db, 'object_templates', roomId, 'templates'))),
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
                    npcs.push({
                        id: d.id,
                        Nomperso: data.Nomperso || 'Sans nom',
                        imageURL2: data.imageURL2 || data.imageURL,
                        niveau: data.niveau || 1,
                        PV: data.PV || 10,
                        PV_Max: data.PV_Max || 10,
                        Defense: data.Defense || 5,
                        FOR: data.FOR || 10,
                        DEX: data.DEX || 10,
                        CON: data.CON || 10,
                        INT: data.INT || 10,
                        SAG: data.SAG || 10,
                        CHA: data.CHA || 10,
                        Contact: data.Contact || 0,
                        Distance: data.Distance || 0,
                        Magie: data.Magie || 0,
                        INIT: data.INIT || 0,
                        visibility: data.visibility || 'hidden',
                        cityName: data.cityId ? cityNamesMap.get(data.cityId) : 'Aucune ville',
                        cityId: data.cityId || null
                    })
                }
            })
            setExistingNPCs(npcs)
        } catch (error) {
            console.error('GMTemplatesContext: Error loading data', error)
        } finally {
            setLoading(false)
        }
    }, [roomId])

    // Load on mount — MJ only, joueurs n'ont jamais besoin de ces données
    useEffect(() => {
        if (!roomId || !isMJ || loadedRef.current) return
        loadedRef.current = true
        fetchAll()
    }, [roomId, isMJ, fetchAll])

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
                npcs.push({
                    id: d.id,
                    Nomperso: data.Nomperso || 'Sans nom',
                    imageURL2: data.imageURL2 || data.imageURL,
                    niveau: data.niveau || 1,
                    PV: data.PV || 10,
                    PV_Max: data.PV_Max || 10,
                    Defense: data.Defense || 5,
                    FOR: data.FOR || 10,
                    DEX: data.DEX || 10,
                    CON: data.CON || 10,
                    INT: data.INT || 10,
                    SAG: data.SAG || 10,
                    CHA: data.CHA || 10,
                    Contact: data.Contact || 0,
                    Distance: data.Distance || 0,
                    Magie: data.Magie || 0,
                    INIT: data.INIT || 0,
                    visibility: data.visibility || 'hidden',
                    cityName: data.cityId ? cityNamesMap.get(data.cityId) : 'Aucune ville',
                    cityId: data.cityId || null
                })
            }
        })
        setExistingNPCs(npcs)
    }, [roomId])

    return (
        <GMTemplatesContext.Provider value={{
            npcTemplates,
            npcCategories,
            soundTemplates,
            objectTemplates,
            existingNPCs,
            cities,
            loading,
            addNPCTemplate,
            updateNPCTemplate,
            addSoundTemplate,
            deleteSoundTemplate,
            addObjectTemplate,
            refresh,
            refreshExistingNPCs,
        }}>
            {children}
        </GMTemplatesContext.Provider>
    )
}

"use client"

import { useState, useEffect } from "react"
import { ScenarioEditor } from "./ScenarioEditor"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Book, Plus, Settings, ChevronRight, FileText, Trash2, Loader2, Save, Crown } from "lucide-react"
import { doc, getDoc, setDoc, onSnapshot } from "@/lib/firebase"
import { db } from "@/lib/firebase"
import { toast } from "sonner"
import { v4 as uuidv4 } from "uuid"
import { useGame } from "@/contexts/GameContext"

type Scene = {
    id: string
    title: string
    content: string
}

type ScenarioData = {
    scenes: Scene[]
    lastUpdated?: number
}

interface ScenarioLayoutProps {
    roomId: string
}

export function ScenarioLayout({ roomId }: ScenarioLayoutProps) {
    const [scenes, setScenes] = useState<Scene[]>([])
    const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isPremium, setIsPremium] = useState(false)
    const { user: gameUser } = useGame()

    // Fetch premium status
    useEffect(() => {
        if (!gameUser?.uid) return
        
        const fetchPremiumStatus = async () => {
            try {
                const userRef = doc(db, "users", gameUser.uid)
                const userSnap = await getDoc(userRef)
                if (userSnap.exists()) {
                    setIsPremium(!!userSnap.data().premium)
                }
            } catch (error) {
                console.error("Error fetching premium status:", error)
            }
        }
        
        fetchPremiumStatus()
    }, [gameUser?.uid])

    // Load initial data
    useEffect(() => {
        if (!roomId) return

        const scenarioRef = doc(db, "cartes", roomId, "scenario", "main")

        const unsubscribe = onSnapshot(scenarioRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data() as ScenarioData
                if (data.scenes && data.scenes.length > 0) {
                    setScenes(data.scenes)
                    if (!activeSceneId) {
                        setActiveSceneId(data.scenes[0].id)
                    }
                } else {
                    // Initialize with an empty scene if document exists but is empty
                    handleInitializeEmpty()
                }
            } else {
                // Initialize if no document
                handleInitializeEmpty()
            }
            setIsLoading(false)
        }, (error) => {
            console.error("Erreur lors du chargement du scénario:", error)
            toast.error("Impossible de charger le scénario")
            setIsLoading(false)
        })

        return () => unsubscribe()
    }, [roomId])

    const handleInitializeEmpty = async () => {
        const initialScene: Scene = { id: uuidv4(), title: "Introduction", content: "<h1>Introduction</h1><p>Commencez à écrire ici...</p>" }
        setScenes([initialScene])
        setActiveSceneId(initialScene.id)

        // Save it right away to create the document
        try {
            const scenarioRef = doc(db, "cartes", roomId, "scenario", "main")
            await setDoc(scenarioRef, {
                scenes: [initialScene],
                lastUpdated: Date.now()
            })
        } catch (e) {
            console.error(e)
        }
    }

    const activeScene = scenes.find((s) => s.id === activeSceneId)

    const handleContentChange = (content: string) => {
        setScenes((prev) =>
            prev.map((s) => (s.id === activeSceneId ? { ...s, content } : s))
        )
    }

    const addScene = () => {
        const newScene = {
            id: uuidv4(),
            title: `Nouvelle scène ${scenes.length + 1}`,
            content: "",
        }
        const newScenes = [...scenes, newScene]
        setScenes(newScenes)
        setActiveSceneId(newScene.id)
        saveToFirebase(newScenes)
    }

    const deleteScene = (id: string, e: React.MouseEvent) => {
        e.stopPropagation() // Prevent selecting the scene when clicking delete

        if (scenes.length <= 1) {
            toast.error("Vous devez garder au moins une scène.")
            return
        }

        const confirmDelete = window.confirm("Êtes-vous sûr de vouloir supprimer cette scène ?")
        if (!confirmDelete) return

        const newScenes = scenes.filter(s => s.id !== id)
        setScenes(newScenes)

        if (activeSceneId === id) {
            setActiveSceneId(newScenes[0].id)
        }

        saveToFirebase(newScenes)
    }

    const saveToFirebase = async (scenesToSave: Scene[] = scenes) => {
        if (!roomId) return

        setIsSaving(true)
        try {
            const scenarioRef = doc(db, "cartes", roomId, "scenario", "main")
            await setDoc(scenarioRef, {
                scenes: scenesToSave,
                lastUpdated: Date.now()
            }, { merge: true })
            toast.success("Scénario sauvegardé")
        } catch (error) {
            console.error("Erreur de sauvegarde:", error)
            toast.error("Erreur lors de la sauvegarde")
        } finally {
            setIsSaving(false)
        }
    }

    const [isGenerating, setIsGenerating] = useState(false)

    const assistWithAI = async () => {
        if (scenes.length === 0) return

        setIsGenerating(true)
        const toastId = toast.loading("🪄 L'IA réfléchit à la suite de l'histoire...")

        try {
            // Rassemble le contenu de toutes les scènes pour donner du contexte
            const contextText = scenes.map(s => `=== SCÈNE : ${s.title} ===\n${s.content.replace(/<[^>]*>?/gm, '')}`).join('\n\n')

            const response = await fetch('/api/scenario-assist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ context: contextText.substring(0, 15000) }) // Limite la taille pour l'API
            })

            if (!response.ok) {
                throw new Error("L'API a répondu avec une erreur.")
            }

            const data = await response.json()

            if (data.error) throw new Error(data.error)

            const newScene = {
                id: uuidv4(),
                title: data.title || "Suite Suggérée",
                content: data.content || "<p>L'IA est sans voix devant votre talent.</p>",
            }

            const newScenes = [...scenes, newScene]
            setScenes(newScenes)
            setActiveSceneId(newScene.id)
            saveToFirebase(newScenes)

            toast.success("Une nouvelle scène a été générée !", { id: toastId })
        } catch (error) {
            console.error("Erreur Aide IA:", error)
            toast.error("Erreur lors de la génération de la scène", { id: toastId })
        } finally {
            setIsGenerating(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex h-[calc(100vh-4rem)] w-full items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden relative">
            {/* Main Background Image */}
            <div
                className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-40"
                style={{ backgroundImage: 'url(/assets/bg.jpg)' }}
            />
            {/* Fallback solid background behind the image */}
            <div className="absolute inset-0 z-[-1] bg-[#fdfbf7] dark:bg-[#1a1614]" />

            {/* Sidebar */}
            <div className="w-64 flex-none border-r border-border/40 bg-white/70 dark:bg-black/60 backdrop-blur-md flex flex-col z-10 overflow-hidden">
                <div className="p-4 border-b border-border/40 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 font-semibold text-foreground">
                        <Book className="h-5 w-5 text-amber-600 dark:text-amber-500" />
                        <span>Scénario</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground/70 hover:text-foreground shrink-0" onClick={() => saveToFirebase()}>
                        <Save className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="p-3 space-y-1 w-full">
                        <div className="text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-2 px-2">
                            Scènes
                        </div>
                        {scenes.map((scene) => (
                            <div
                                key={scene.id}
                                onClick={() => setActiveSceneId(scene.id)}
                                className={`group relative w-full flex items-center justify-between gap-1 px-3 py-2 text-sm rounded-md transition-all text-left cursor-pointer overflow-hidden flex-none ${activeSceneId === scene.id
                                    ? "bg-amber-600/10 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 font-medium shadow-sm"
                                    : "hover:bg-black/5 dark:hover:bg-white/5 text-foreground/70 hover:text-foreground"
                                    }`}
                            >
                                <div className="flex items-center gap-2 overflow-hidden" style={{ width: 'calc(100% - 24px)' }}>
                                    <FileText className="h-4 w-4 shrink-0" />
                                    <span className="truncate block">{scene.title || "Scène sans titre"}</span>
                                </div>

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-6 w-6 shrink-0 opacity-50 hover:bg-destructive/10 hover:text-destructive hover:opacity-100 transition-opacity ${activeSceneId === scene.id ? 'opacity-100 text-destructive/70' : ''}`}
                                    onClick={(e) => deleteScene(scene.id, e)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-3 border-t border-border/40 space-y-2 shrink-0">
                    <Button onClick={addScene} className="w-full justify-start gap-2 bg-white/50 dark:bg-black/40 hover:bg-white/80 dark:hover:bg-black/60 text-foreground border-border/50" variant="outline">
                        <Plus className="h-4 w-4" />
                        Ajouter Scène
                    </Button>
                    <Button
                        onClick={assistWithAI}
                        disabled={!isPremium || isGenerating || scenes.length === 0}
                        className={`w-full justify-start gap-2 border-border/50 ${
                            isPremium 
                                ? "bg-gradient-to-r from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
                                : "bg-white/50 dark:bg-black/40 text-muted-foreground opacity-70 cursor-not-allowed"
                        }`}
                        variant="outline"
                    >
                        {!isPremium ? (
                            <Crown className="h-4 w-4 text-amber-500" />
                        ) : isGenerating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <span>🪄</span>
                        )}
                        {!isPremium 
                            ? "Aide IA (Premium)"
                            : isGenerating 
                                ? "Inspiration en cours..." 
                                : "Aide IA"
                        }
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden relative z-10">
                <div className="relative flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
                    <div className="max-w-7xl mx-auto space-y-6">
                        <div className="flex items-center justify-between pb-4 border-b border-border/30">
                            <div>
                                <input
                                    type="text"
                                    value={activeScene?.title || ""}
                                    onChange={(e) => {
                                        setScenes(prev => prev.map(s => s.id === activeSceneId ? { ...s, title: e.target.value } : s))
                                    }}
                                    className="text-3xl font-bold tracking-tight bg-transparent border-none outline-none focus:ring-0 p-0 w-full placeholder:text-muted-foreground/50"
                                    placeholder="Titre de la scène..."
                                />
                                <p className="text-muted-foreground mt-1">
                                    Éditez le contenu de la scène ci-dessous.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    className="text-destructive hover:bg-destructive/10 border-destructive/20"
                                    onClick={(e) => {
                                        if (activeScene) {
                                            deleteScene(activeScene.id, e)
                                        }
                                    }}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Supprimer
                                </Button>
                                <Button onClick={() => saveToFirebase()} disabled={isSaving}>
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                    Sauvegarder
                                </Button>
                            </div>
                        </div>

                        {activeScene ? (
                            <ScenarioEditor
                                key={activeScene.id} // Force re-render when switching scenes
                                initialContent={activeScene.content}
                                roomId={roomId}
                                scenes={scenes.map(s => ({ id: s.id, title: s.title }))}
                                onNavigateToScene={setActiveSceneId}
                                onChange={handleContentChange}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-64 border border-dashed rounded-lg text-muted-foreground">
                                Sélectionnez ou créez une scène pour commencer.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

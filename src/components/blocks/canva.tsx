'use client'
import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Aclonica } from "next/font/google"
import { ChevronDown } from 'lucide-react'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { mapImagePath } from '@/utils/imagePathMapper'

const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

interface DemoCharacter {
    id: string
    name: string
    path: string
    x: number // 0..1, position relative sur la carte
    y: number // 0..1
    color: string
}

const DEMO_CHARACTERS: DemoCharacter[] = [
    { id: 'nain', name: 'Borin', path: '/Photos/Nain/Nain235.webp', x: 0.24, y: 0.46, color: '#c9a965' },
    { id: 'elfe', name: 'Sylenne', path: '/Photos/Elfe/Elfe34.webp', x: 0.5, y: 0.14, color: '#8fbf9f' },
    { id: 'humain', name: 'Corvin', path: '/Photos/Humain/Humain1.webp', x: 0.72, y: 0.7, color: '#c98f65' },
    { id: 'orc', name: 'Grokk', path: '/Photos/Orc/Orc1.webp', x: 0.46, y: 0.79, color: '#8f6bc9' },
]

// Fond animé unique, déjà présent dans la bibliothèque de cartes (BackgroundSelector, Map/Camp/Animated)
const CITY_BACKGROUND_VIDEO = 'https://assets.yner.fr/Map/Camp/Animated/Goblin_Camp_Day_NoGrid_Audio.webm'
// Dimensions intrinsèques de la vidéo (fallback avant que loadedmetadata ait répondu)
const VIDEO_ASPECT_RATIO = 3840 / 2160

const TOKEN_SIZE = 72

// object-cover recadre la vidéo pour remplir le conteneur : selon le ratio écran, une bande
// verticale ou horizontale de la vidéo est rognée. Les positions des jetons (x/y en 0..1) sont
// relatives à l'image de la vidéo, pas au conteneur — il faut donc convertir via la zone
// effectivement affichée (le "cover rect"), sinon le placement dérive entre les formats d'écran.
function getCoverRect(containerWidth: number, containerHeight: number, videoAspect: number) {
    const containerAspect = containerWidth / containerHeight
    let renderWidth: number
    let renderHeight: number
    if (containerAspect > videoAspect) {
        renderWidth = containerWidth
        renderHeight = containerWidth / videoAspect
    } else {
        renderHeight = containerHeight
        renderWidth = containerHeight * videoAspect
    }
    const offsetX = (containerWidth - renderWidth) / 2
    const offsetY = (containerHeight - renderHeight) / 2
    return { renderWidth, renderHeight, offsetX, offsetY }
}

interface CanvaSectionProps {
    onStart?: () => void
    isUserLoggedIn?: boolean | null
}

export function CanvaSection({ onStart, isUserLoggedIn = null }: CanvaSectionProps) {
    const containerRef = React.useRef<HTMLDivElement>(null)
    const videoRef = React.useRef<HTMLVideoElement>(null)
    const tokenRefs = React.useRef<Record<string, HTMLDivElement | null>>({})
    const positionsRef = React.useRef<Record<string, { x: number; y: number }>>(
        Object.fromEntries(DEMO_CHARACTERS.map(c => [c.id, { x: c.x, y: c.y }]))
    )
    const [images, setImages] = React.useState<Record<string, string>>({})
    // positions ne pilote que le rendu initial ; pendant le drag on écrit directement le style DOM
    // via requestAnimationFrame pour rester fluide à 60fps sans re-render React à chaque pointermove.
    const [positions] = React.useState(positionsRef.current)
    const draggingIdRef = React.useRef<string | null>(null)
    const pendingPointRef = React.useRef<{ x: number; y: number } | null>(null)
    const rafRef = React.useRef<number | null>(null)
    const [draggingId, setDraggingId] = React.useState<string | null>(null)
    const [selectedId, setSelectedId] = React.useState<string | null>(null)
    const videoAspectRef = React.useRef(VIDEO_ASPECT_RATIO)
    // Zone réellement occupée par la vidéo dans le conteneur (après recadrage object-cover),
    // en pixels. Les positions des jetons (0..1) sont converties via ce rect plutôt que via
    // les dimensions brutes du conteneur, pour rester alignées avec le décor peu importe le ratio d'écran.
    const [coverRect, setCoverRect] = React.useState<{ renderWidth: number; renderHeight: number; offsetX: number; offsetY: number } | null>(null)

    React.useEffect(() => {
        Promise.all(DEMO_CHARACTERS.map(async c => [c.id, await mapImagePath(c.path)] as const))
            .then(entries => setImages(Object.fromEntries(entries)))
    }, [])

    const recomputeCoverRect = React.useCallback(() => {
        if (!containerRef.current) return
        const { width, height } = containerRef.current.getBoundingClientRect()
        if (width === 0 || height === 0) return
        setCoverRect(getCoverRect(width, height, videoAspectRef.current))
    }, [])

    React.useEffect(() => {
        recomputeCoverRect()
        const el = containerRef.current
        if (!el) return
        const observer = new ResizeObserver(recomputeCoverRect)
        observer.observe(el)
        return () => observer.disconnect()
    }, [recomputeCoverRect])

    const handleVideoLoadedMetadata = () => {
        const video = videoRef.current
        if (video && video.videoWidth && video.videoHeight) {
            videoAspectRef.current = video.videoWidth / video.videoHeight
            recomputeCoverRect()
        }
    }

    // Convertit une position relative à la vidéo (0..1) en pixels écran, en tenant compte du recadrage object-cover
    const toScreenPixels = React.useCallback((point: { x: number; y: number }) => {
        if (!coverRect) return { left: point.x * 100 + '%', top: point.y * 100 + '%' }
        return {
            left: coverRect.offsetX + point.x * coverRect.renderWidth,
            top: coverRect.offsetY + point.y * coverRect.renderHeight,
        }
    }, [coverRect])

    const applyPendingMove = React.useCallback(() => {
        rafRef.current = null
        const id = draggingIdRef.current
        const point = pendingPointRef.current
        if (!id || !point || !coverRect) return
        const el = tokenRefs.current[id]
        if (el) {
            el.style.left = `${coverRect.offsetX + point.x * coverRect.renderWidth}px`
            el.style.top = `${coverRect.offsetY + point.y * coverRect.renderHeight}px`
        }
        positionsRef.current[id] = point
    }, [coverRect])

    const handlePointerDown = (id: string) => (e: React.PointerEvent) => {
        e.preventDefault()
        e.stopPropagation()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        draggingIdRef.current = id
        setDraggingId(id)
        setSelectedId(id)
    }

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!draggingIdRef.current || !coverRect) return
        // Coordonnées relatives à la zone vidéo affichée (pas au conteneur entier),
        // pour que la position reste ancrée au décor quel que soit le ratio d'écran.
        const rectLeft = coverRect.offsetX
        const rectTop = coverRect.offsetY
        const containerRect = containerRef.current?.getBoundingClientRect()
        if (!containerRect) return
        const localX = e.clientX - containerRect.left - rectLeft
        const localY = e.clientY - containerRect.top - rectTop
        const x = Math.min(1, Math.max(0, localX / coverRect.renderWidth))
        const y = Math.min(1, Math.max(0, localY / coverRect.renderHeight))
        pendingPointRef.current = { x, y }
        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(applyPendingMove)
        }
    }

    const handlePointerUp = () => {
        draggingIdRef.current = null
        pendingPointRef.current = null
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
        setDraggingId(null)
    }

    return (
        <motion.section
            className="relative w-full h-screen overflow-hidden"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
            <div
                ref={containerRef}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className="relative w-full h-full overflow-hidden select-none touch-none bg-black"
            >
                <video
                    ref={videoRef}
                    src={CITY_BACKGROUND_VIDEO}
                    autoPlay
                    loop
                    muted
                    playsInline
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                />
                <div className="absolute inset-0 pointer-events-none bg-black/40" />

                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center pointer-events-none z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                    >
                        <h1 className={cn(
                            "text-6xl md:text-7xl xl:text-9xl gold-text-gradient leading-tight",
                            aclonica.className
                        )}>
                            Yner
                        </h1>
                    </motion.div>
                    <motion.p
                        className={cn("mt-3 text-base md:text-lg text-white/70", aclonica.className)}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.5 }}
                    >
                        Votre table virtuelle ultime
                    </motion.p>

                    <motion.div
                        className="mt-10 flex items-center justify-center pointer-events-auto"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.8 }}
                    >
                        <InteractiveHoverButton
                            onClick={onStart}
                            disabled={isUserLoggedIn === null}
                            className={cn("h-14 px-8 text-lg", aclonica.className)}
                        >
                            {isUserLoggedIn === null ? 'Chargement...' : "Commencer l'aventure"}
                        </InteractiveHoverButton>
                    </motion.div>
                </div>

                <motion.div
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/40 z-10 pointer-events-none"
                    animate={{ y: [0, 8, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                    <span className={cn("text-xs tracking-widest uppercase", aclonica.className)}>Découvrir</span>
                    <ChevronDown className="w-5 h-5" />
                </motion.div>

                {coverRect && DEMO_CHARACTERS.map(c => {
                    const pos = positions[c.id]
                    const src = images[c.id]
                    const isSelected = selectedId === c.id
                    const screenPos = toScreenPixels(pos)
                    return (
                        <div
                            key={c.id}
                            ref={el => { tokenRefs.current[c.id] = el }}
                            onPointerDown={handlePointerDown(c.id)}
                            className={cn(
                                "absolute flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing will-change-[left,top]",
                                draggingId === c.id && "z-20"
                            )}
                            style={{
                                left: screenPos.left,
                                top: screenPos.top,
                                width: TOKEN_SIZE,
                                transform: 'translate(-50%, -50%)',
                            }}
                        >
                            <div
                                className="rounded-full overflow-hidden shadow-lg"
                                style={{
                                    width: TOKEN_SIZE,
                                    height: TOKEN_SIZE,
                                    border: `3px solid ${isSelected ? c.color : 'rgba(255,255,255,0.2)'}`,
                                    boxShadow: isSelected ? `0 0 16px ${c.color}80` : undefined,
                                }}
                            >
                                {src && (
                                    <img
                                        src={src}
                                        alt={c.name}
                                        className="w-full h-full object-cover pointer-events-none"
                                        draggable={false}
                                    />
                                )}
                            </div>
                            <span className={cn(
                                "text-xs text-white/80 bg-black/50 px-2 py-0.5 rounded-full whitespace-nowrap pointer-events-none",
                                aclonica.className
                            )}>
                                {c.name}
                            </span>
                        </div>
                    )
                })}
            </div>
        </motion.section>
    )
}

"use client"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3-geo"
import { contours as d3contours } from "d3-contour"
import { createNoise3D } from "simplex-noise"

interface RotatingEarthProps {
  /** Graine déterminant la géographie générée (ex: nom de la planète). Même seed = même planète. */
  seed?: string
  width?: number
  height?: number
  className?: string
}

// Hash déterministe (djb2) + PRNG mulberry32 : seed texte -> nombres reproductibles, sans dépendance.
function hashSeed(seed: string): number {
  let hash = 5381
  for (let i = 0; i < seed.length; i++) hash = (hash * 33) ^ seed.charCodeAt(i)
  return hash >>> 0
}
function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface PlanetProfile {
  waterLevel: number // fraction de terre visée [0..1], utilisée comme seuil de contour
  octaves: number
  frequency: number
}

function profileForSeed(seed: string): PlanetProfile {
  const rand = mulberry32(hashSeed(seed))
  return {
    waterLevel: 0.35 + rand() * 0.3,
    octaves: 3 + Math.floor(rand() * 3),
    frequency: 1.2 + rand() * 1.2,
  }
}

/** Génère un GeoJSON FeatureCollection de "terres" en échantillonnant du bruit 3D sur une grille
 *  équirectangulaire puis en isolignes (d3-contour) au seuil correspondant à waterLevel. Les
 *  isolignes sont produites en coordonnées grille (colonnes/lignes) ; on les reprojette ensuite en
 *  [lng, lat] pour rester compatible avec un pipeline d3-geo standard. */
function generateLandGeoJSON(profile: PlanetProfile, seed: string): GeoJSON.FeatureCollection {
  const cols = 240
  const rows = 120
  const rand = mulberry32(hashSeed(`${seed}:noise`))
  const noise3D = createNoise3D(rand)

  const values = new Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    const lat = (row / (rows - 1)) * 180 - 90
    const phi = (lat * Math.PI) / 180
    for (let col = 0; col < cols; col++) {
      const lng = (col / cols) * 360 - 180
      const lambda = (lng * Math.PI) / 180
      const x = Math.cos(phi) * Math.cos(lambda)
      const y = Math.cos(phi) * Math.sin(lambda)
      const z = Math.sin(phi)

      let value = 0
      let amplitude = 1
      let freq = profile.frequency
      let maxAmplitude = 0
      for (let o = 0; o < profile.octaves; o++) {
        value += noise3D(x * freq, y * freq, z * freq) * amplitude
        maxAmplitude += amplitude
        amplitude *= 0.5
        freq *= 2
      }
      values[row * cols + col] = value / maxAmplitude // ~[-1, 1]
    }
  }

  // Seuil dérivé de waterLevel : waterLevel haut -> seuil de terre plus haut -> moins de terre.
  const threshold = (profile.waterLevel - 0.5) * 1.6

  const generatedContours = d3contours()
    .size([cols, rows])
    .thresholds([threshold])(values)

  // Reprojette chaque anneau de coordonnées grille -> [lng, lat], et referme les polygones qui
  // touchent les bords est/ouest pour éviter des bandes qui s'enroulent tout autour du globe.
  const toLngLat = ([gx, gy]: number[]): [number, number] => {
    const lng = (gx / cols) * 360 - 180
    const lat = (gy / (rows - 1)) * 180 - 90
    return [lng, lat]
  }

  const features: GeoJSON.Feature[] = []
  for (const geom of generatedContours) {
    const coordinates = geom.coordinates.map((polygon) =>
      polygon.map((ring) => ring.map(toLngLat)),
    )
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates } as GeoJSON.MultiPolygon,
    })
  }

  return { type: "FeatureCollection", features }
}

// ---- Points en demi-teinte à l'intérieur des terres (porté du composant d'origine) --------
function pointInPolygon(point: [number, number], polygon: number[][]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function pointInFeature(point: [number, number], feature: GeoJSON.Feature): boolean {
  const geometry = feature.geometry
  if (geometry.type === "Polygon") {
    const coordinates = geometry.coordinates
    if (!pointInPolygon(point, coordinates[0])) return false
    for (let i = 1; i < coordinates.length; i++) {
      if (pointInPolygon(point, coordinates[i])) return false
    }
    return true
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      if (pointInPolygon(point, polygon[0])) {
        let inHole = false
        for (let i = 1; i < polygon.length; i++) {
          if (pointInPolygon(point, polygon[i])) { inHole = true; break }
        }
        if (!inHole) return true
      }
    }
    return false
  }
  return false
}

function generateDotsInFeature(feature: GeoJSON.Feature, dotSpacing = 16): [number, number][] {
  const dots: [number, number][] = []
  const bounds = d3.geoBounds(feature)
  const [[minLng, minLat], [maxLng, maxLat]] = bounds
  const stepSize = dotSpacing * 0.08
  for (let lng = minLng; lng <= maxLng; lng += stepSize) {
    for (let lat = minLat; lat <= maxLat; lat += stepSize) {
      const point: [number, number] = [lng, lat]
      if (pointInFeature(point, feature)) dots.push(point)
    }
  }
  return dots
}

export default function RotatingEarth({ seed = "default", width = 800, height = 600, className = "" }: RotatingEarthProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const context = canvas.getContext("2d")
    if (!context) return

    let cancelled = false

    const containerWidth = Math.min(width, window.innerWidth - 40)
    const containerHeight = Math.min(height, window.innerHeight - 100)
    const radius = Math.min(containerWidth, containerHeight) / 2.5

    const dpr = window.devicePixelRatio || 1
    canvas.width = containerWidth * dpr
    canvas.height = containerHeight * dpr
    canvas.style.width = `${containerWidth}px`
    canvas.style.height = `${containerHeight}px`
    context.scale(dpr, dpr)

    const projection = d3
      .geoOrthographic()
      .scale(radius)
      .translate([containerWidth / 2, containerHeight / 2])
      .clipAngle(90)

    const path = d3.geoPath(projection, context)

    interface DotData { lng: number; lat: number }
    const allDots: DotData[] = []
    let landFeatures: GeoJSON.FeatureCollection | null = null

    const render = () => {
      context.clearRect(0, 0, containerWidth, containerHeight)

      const currentScale = projection.scale()
      const scaleFactor = currentScale / radius

      // Globe (fond noir, comme l'original)
      context.beginPath()
      context.arc(containerWidth / 2, containerHeight / 2, currentScale, 0, 2 * Math.PI)
      context.fillStyle = "#000000"
      context.fill()
      context.strokeStyle = "#ffffff"
      context.lineWidth = 2 * scaleFactor
      context.stroke()

      if (landFeatures) {
        // Graticule
        const graticule = d3.geoGraticule()
        context.beginPath()
        path(graticule())
        context.strokeStyle = "#ffffff"
        context.lineWidth = 1 * scaleFactor
        context.globalAlpha = 0.25
        context.stroke()
        context.globalAlpha = 1

        // Contours des terres (pas de remplissage plein — juste le trait, comme l'original)
        context.beginPath()
        landFeatures.features.forEach((feature) => path(feature))
        context.strokeStyle = "#ffffff"
        context.lineWidth = 1 * scaleFactor
        context.stroke()

        // Points en demi-teinte à l'intérieur des terres
        allDots.forEach((dot) => {
          const projected = projection([dot.lng, dot.lat])
          if (
            projected &&
            projected[0] >= 0 && projected[0] <= containerWidth &&
            projected[1] >= 0 && projected[1] <= containerHeight
          ) {
            context.beginPath()
            context.arc(projected[0], projected[1], 1.2 * scaleFactor, 0, 2 * Math.PI)
            context.fillStyle = "#999999"
            context.fill()
          }
        })
      }
    }

    const rotation = [0, 0]
    let autoRotate = true
    const rotationSpeed = 0.5

    const rotate = () => {
      if (autoRotate) {
        rotation[0] += rotationSpeed
        projection.rotate(rotation as [number, number])
        render()
      }
    }

    let rafId = 0
    let last = performance.now()
    const loop = (now: number) => {
      if (cancelled) return
      const dt = now - last
      if (dt >= 33) { // ~30fps : rendu Canvas 2D pur, pas besoin de plus pour une rotation lente
        last = now
        rotate()
      }
      rafId = requestAnimationFrame(loop)
    }

    const handleMouseDown = (event: MouseEvent) => {
      autoRotate = false
      const startX = event.clientX
      const startY = event.clientY
      const startRotation = [...rotation]

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const sensitivity = 0.5
        const dx = moveEvent.clientX - startX
        const dy = moveEvent.clientY - startY

        rotation[0] = startRotation[0] + dx * sensitivity
        rotation[1] = startRotation[1] - dy * sensitivity
        rotation[1] = Math.max(-90, Math.min(90, rotation[1]))

        projection.rotate(rotation as [number, number])
        render()
      }

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
        setTimeout(() => { autoRotate = true }, 10)
      }

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1
      const newRadius = Math.max(radius * 0.5, Math.min(radius * 3, projection.scale() * scaleFactor))
      projection.scale(newRadius)
      render()
    }

    canvas.addEventListener("mousedown", handleMouseDown)
    canvas.addEventListener("wheel", handleWheel)

    const init = () => {
      try {
        setIsLoading(true)
        const profile = profileForSeed(seed)
        landFeatures = generateLandGeoJSON(profile, seed)
        landFeatures.features.forEach((feature) => {
          generateDotsInFeature(feature, 40).forEach(([lng, lat]) => allDots.push({ lng, lat }))
        })
        if (cancelled) return
        render()
        setIsLoading(false)
        rafId = requestAnimationFrame(loop)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erreur de génération de la planète")
          setIsLoading(false)
        }
      }
    }
    init()

    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      canvas.removeEventListener("mousedown", handleMouseDown)
      canvas.removeEventListener("wheel", handleWheel)
    }
  }, [seed, width, height])

  if (error) {
    return (
      <div className={`dark flex items-center justify-center bg-card rounded-2xl p-8 ${className}`}>
        <div className="text-center">
          <p className="dark text-destructive font-semibold mb-2">Erreur de génération de la planète</p>
          <p className="dark text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-auto rounded-2xl bg-background dark"
        style={{ maxWidth: "100%", height: "auto" }}
      />
    </div>
  )
}

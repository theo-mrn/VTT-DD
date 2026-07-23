"use client";

// Couche météo cosmétique de la carte — un <canvas> plein écran (viewport, PAS l'espace monde : il ne
// suit ni le zoom ni le pan) posé au-dessus des canvas de carte, non bloquant (pointerEvents:none).
// Système de particules maison, zéro dépendance : pluie (traits inclinés), neige (flocons dérivants),
// brouillard (nappes de gradient). L'état vient de weather-store (piloté par le MJ, synchro via
// settings/general). Au repos (type 'none'), la boucle RAF est stoppée et le canvas vidé : coût nul.

import { useEffect, useRef } from "react";
import { useSyncExternalStore } from "react";
import {
  subscribeWeather,
  getWeather,
  getServerWeather,
  type WeatherType,
} from "@/app/[roomid]/map/weather-store";

// Plafond de particules à intensity=1 (perf : borne le coût même sur grand écran / haute densité).
const MAX_PARTICLES = 400;

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number; // longueur du trait (pluie) / rayon (neige)
  phase: number; // pour la dérive sinusoïdale de la neige
  drift: number; // amplitude de dérive
};

// Nappe de brouillard : un blob mou qui dérive lentement en boucle, avec sa propre pulsation
// d'opacité désynchronisée. Plusieurs blobs qui se recouvrent donnent un brouillard organique,
// contrairement à des gradients radiaux qui translateraient en bloc (halos qui « glissent »).
type FogBlob = {
  x: number;
  y: number;
  r: number; // rayon (fraction de la plus grande dimension)
  vx: number; // dérive px/s
  vy: number;
  pulse: number; // phase de pulsation d'opacité
  pulseSpeed: number;
};

function makeFogBlobs(w: number, h: number): FogBlob[] {
  const max = Math.max(w, h);
  const n = 14; // plus de nappes, plus petites → leur déplacement se voit
  const blobs: FogBlob[] = [];
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 60; // dérive franche (px/s)
    blobs.push({
      x: Math.random() * w,
      y: Math.random() * h,
      // Nappes plus petites (0.12–0.30 de l'écran) : une nappe géante qui translate ne se voit pas,
      // une nappe moyenne qui traverse, si.
      r: max * (0.12 + Math.random() * 0.18),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.6, // dérive surtout horizontale
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.5 + Math.random() * 0.7, // pulsation d'opacité perceptible
    });
  }
  return blobs;
}

/** Nombre de particules cible pour un type/intensité/surface donnés. */
function targetCount(type: WeatherType, intensity: number, area: number): number {
  if (type === "none" || type === "fog") return 0;
  // Densité de base par million de px², modulée par l'intensité, plafonnée.
  const perMega = type === "rain" ? 260 : 130; // la neige est plus lente/visible → moins dense
  const raw = (area / 1_000_000) * perMega * intensity;
  return Math.min(MAX_PARTICLES, Math.round(raw));
}

function makeParticle(type: WeatherType, w: number, h: number, intensity: number): Particle {
  if (type === "snow") {
    const r = 1 + Math.random() * 2.5;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 0,
      vy: 20 + Math.random() * 30 + intensity * 20, // px/s
      len: r,
      phase: Math.random() * Math.PI * 2,
      drift: 8 + Math.random() * 22,
    };
  }
  // rain
  const speed = 700 + Math.random() * 400 + intensity * 300; // px/s, chute rapide
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: speed * 0.18, // légère inclinaison
    vy: speed,
    len: 10 + Math.random() * 14,
    phase: 0,
    drift: 0,
  };
}

export default function WeatherCanvas() {
  const weather = useSyncExternalStore(subscribeWeather, getWeather, getServerWeather);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const fogBlobsRef = useRef<FogBlob[]>([]);
  // Type dessiné à la frame précédente : sert à détecter un changement de météo pour repartir de
  // particules neuves. Sans ça, passer de pluie à neige recycle les particules PLUIE (len 10–24) en
  // les dessinant comme des flocons → d'énormes disques blancs.
  const prevTypeRef = useRef<WeatherType>("none");
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });
  // Dernière météo connue de la boucle : la boucle lit ce ref (pas la prop) pour ne pas se relancer
  // à chaque frame — l'effet ci-dessous le met à jour.
  const weatherRef = useRef(weather);
  weatherRef.current = weather;

  // Densité réduite si l'utilisateur préfère moins d'animation.
  const reducedRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onChange = () => { reducedRef.current = mq.matches; };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Dimensionne le canvas au conteneur parent (viewport de carte), gère le DPR et le resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap DPR à 2 (perf)
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      // Nappes de brouillard dimensionnées à l'ancienne taille : on les vide pour que la boucle
      // les régénère à la nouvelle (évite des blobs hors-champ après un resize).
      fogBlobsRef.current.length = 0;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // Boucle d'animation — montée une fois, pilotée par weatherRef. Stoppe (et vide le canvas) quand
  // il n'y a rien à dessiner.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const step = (ts: number) => {
      const { w, h, dpr } = sizeRef.current;
      const { type, intensity } = weatherRef.current;
      const dt = lastTsRef.current ? Math.min(0.05, (ts - lastTsRef.current) / 1000) : 0;
      lastTsRef.current = ts;

      // Changement de type : on jette les particules/nappes de l'ancien effet — elles seront
      // recréées avec les bons paramètres. Évite le recyclage pluie→neige (disques géants).
      if (type !== prevTypeRef.current) {
        particlesRef.current.length = 0;
        fogBlobsRef.current.length = 0;
        prevTypeRef.current = type;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const factor = reducedRef.current ? 0.4 : 1;

      if (type === "rain" || type === "snow") {
        // Ajuste la population de particules au type/intensité courants.
        const want = Math.round(targetCount(type, intensity, w * h) * factor);
        const arr = particlesRef.current;
        if (arr.length < want) {
          for (let i = arr.length; i < want; i++) arr.push(makeParticle(type, w, h, intensity));
        } else if (arr.length > want) {
          arr.length = want;
        }

        if (type === "rain") {
          ctx.strokeStyle = "rgba(174,194,224,0.55)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (const p of arr) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.y > h) { p.y = -p.len; p.x = Math.random() * w; }
            if (p.x > w) p.x = 0;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 0.02, p.y - p.len);
          }
          ctx.stroke();
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          for (const p of arr) {
            p.phase += dt * 1.5;
            p.y += p.vy * dt;
            p.x += Math.sin(p.phase) * p.drift * dt;
            if (p.y > h) { p.y = -p.len; p.x = Math.random() * w; }
            if (p.x > w) p.x = 0; else if (p.x < 0) p.x = w;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.len, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (type === "fog") {
        particlesRef.current.length = 0;
        // (Re)crée les nappes si absentes ou si la taille a changé.
        if (fogBlobsRef.current.length === 0) fogBlobsRef.current = makeFogBlobs(w, h);
        const blobs = fogBlobsRef.current;

        // 1) Voile de base léger : juste une assise, il ne doit PAS noyer le mouvement des nappes.
        ctx.fillStyle = `rgba(205,210,220,${(0.05 + 0.10 * intensity) * factor})`;
        ctx.fillRect(0, 0, w, h);

        // 2) Nappes molles qui traversent l'écran et pulsent chacune indépendamment. Plus petites et
        //    plus opaques → leur déplacement est visible.
        for (const b of blobs) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.pulse += b.pulseSpeed * dt;
          // Wrap toroïdal relatif au rayon de la nappe (sort d'un côté, rentre de l'autre).
          if (b.x < -b.r) b.x = w + b.r; else if (b.x > w + b.r) b.x = -b.r;
          if (b.y < -b.r) b.y = h + b.r; else if (b.y > h + b.r) b.y = -b.r;

          const pulse = 0.5 + 0.5 * Math.sin(b.pulse); // 0..1
          // Amplitude franche (0.15..1) pour que l'apparition/disparition des nappes se voie.
          const a = (0.14 + 0.26 * intensity) * (0.15 + 0.85 * pulse) * factor;
          const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
          g.addColorStop(0, `rgba(215,219,228,${a})`);
          g.addColorStop(0.5, `rgba(208,213,223,${a * 0.5})`);
          g.addColorStop(1, "rgba(205,210,220,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }
      } else {
        // 'none' : on vient de clear, on stoppe la boucle.
        particlesRef.current.length = 0;
        fogBlobsRef.current.length = 0;
        rafRef.current = null;
        lastTsRef.current = 0;
        return;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    // (Re)démarre la boucle si nécessaire quand la météo devient active.
    if (weather.type !== "none" && rafRef.current === null) {
      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(step);
    } else if (weather.type === "none") {
      // Retour à « Aucun » : la boucle ne redémarre pas (rien à animer) et son cleanup l'a tuée
      // AVANT une frame de clear → l'ancien effet resterait figé à l'écran. On vide donc le canvas
      // ici, une fois, et on remet à zéro les particules/nappes.
      particlesRef.current.length = 0;
      fogBlobsRef.current.length = 0;
      prevTypeRef.current = "none";
      const { w, h, dpr } = sizeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [weather.type]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 10,
      }}
    />
  );
}

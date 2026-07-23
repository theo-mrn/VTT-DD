"use client";

// Picker météo (MJ uniquement) — petit panneau flottant pour choisir l'ambiance de la carte
// (climats NATIFS : Aucune / Pluie / Neige / Brouillard / Tempête de sable) et son intensité. Des
// climats SUPPLÉMENTAIRES peuvent être fournis par un bundle de règles (ex 'alert'/'static' pour le
// bundle Star Wars) via api.map.registerWeather → weather-climates-store, fusionnés ici. Écrit dans
// cartes/{roomId}/... (champ weather), lu par tous via useMapData → synchro MJ→joueurs. Mise à jour
// optimiste du weather-store local pour un retour immédiat côté MJ.

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CloudRain, Snowflake, CloudFog, Wind, Ban, X, icons as LucideIcons } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { db, doc, setDoc } from "@/lib/firebase";
import {
  subscribeWeather,
  getWeather,
  getServerWeather,
  setWeather,
  type WeatherType,
} from "@/app/[roomid]/map/weather-store";
import {
  subscribeWeatherClimates,
  getWeatherClimates,
  getServerWeatherClimates,
} from "@/app/[roomid]/map/weather-climates-store";

type ClimateOption = { type: WeatherType; label: string; Icon: LucideIcon };

// Climats NATIFS toujours proposés (génériques, indépendants du système de règles).
const NATIVE_OPTIONS: ClimateOption[] = [
  { type: "none", label: "Aucune", Icon: Ban },
  { type: "rain", label: "Pluie", Icon: CloudRain },
  { type: "snow", label: "Neige", Icon: Snowflake },
  { type: "fog", label: "Brouillard", Icon: CloudFog },
  { type: "sandstorm", label: "Tempête de sable", Icon: Wind },
];

/** Résout un nom d'icône lucide (string, fourni par le bundle) en composant, fallback CloudFog. */
function resolveIcon(name: string | undefined): LucideIcon {
  if (name && name in LucideIcons) return (LucideIcons as Record<string, LucideIcon>)[name];
  return CloudFog;
}

export default function WeatherPicker({
  roomId,
  isMJ,
  sceneId,
  open,
  onClose,
}: {
  roomId: string;
  isMJ: boolean;
  /** Scène active (selectedCityId) — la météo est stockée par scène. null = fond global. */
  sceneId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const weather = useSyncExternalStore(subscribeWeather, getWeather, getServerWeather);
  // Climats fournis par le bundle actif (vide si aucun) → fusionnés après les natifs.
  const bundleClimates = useSyncExternalStore(
    subscribeWeatherClimates,
    getWeatherClimates,
    getServerWeatherClimates,
  );

  if (!open || !isMJ) return null;

  const OPTIONS: ClimateOption[] = [
    ...NATIVE_OPTIONS,
    ...bundleClimates.map((c) => ({ type: c.type, label: c.label, Icon: resolveIcon(c.icon) })),
  ];

  const write = async (type: WeatherType, intensity: number) => {
    // Optimiste : effet immédiat côté MJ, avant l'aller-retour Firestore.
    setWeather({ type, intensity });
    try {
      // Météo propre à la scène : on écrit dans le doc de la scène (cities/{sceneId}). Sans scène
      // active, on retombe sur settings/general (fond global) — même doc que sa lecture par useMapData.
      const ref = sceneId
        ? doc(db, "cartes", roomId, "cities", sceneId)
        : doc(db, "cartes", roomId, "settings", "general");
      await setDoc(ref, { weather: { type, intensity } }, { merge: true });
    } catch (e) {
      console.error("[weather] échec d'écriture", e);
    }
  };

  const pickType = (type: WeatherType) => {
    if (type === "none") return write("none", 0);
    // Reprend l'intensité courante si on change juste de type, sinon défaut 0.6.
    const intensity = weather.type === "none" ? 0.6 : weather.intensity;
    return write(type, intensity);
  };

  const hasEffect = weather.type !== "none";

  return createPortal(
    <div
      className="fixed left-0 lg:left-20 top-1/2 -translate-y-1/2 z-[95] m-3 pointer-events-auto"
    >
      <div className="w-64 rounded-xl border border-[var(--border-color)] bg-[var(--bg-dark)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <span className="text-sm font-bold text-[var(--text-primary)]">Météo de la carte</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {OPTIONS.map(({ type, label, Icon }) => {
              const active = weather.type === type;
              return (
                <button
                  key={type}
                  onClick={() => pickType(type)}
                  className={[
                    "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors",
                    active
                      ? "border-[var(--accent-brown)] bg-[var(--accent-brown)]/15 text-[var(--text-primary)]"
                      : "border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--accent-brown)]/60",
                  ].join(" ")}
                >
                  <Icon
                    className="w-5 h-5"
                    style={{ color: active ? "var(--accent-brown)" : "var(--text-secondary)" }}
                  />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {hasEffect && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-[var(--text-secondary)]">Intensité</span>
                <span className="text-xs tabular-nums text-[var(--text-secondary)]">
                  {Math.round(weather.intensity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.02}
                max={1}
                step={0.02}
                value={weather.intensity}
                onChange={(e) => write(weather.type, parseFloat(e.target.value))}
                className="w-full accent-[var(--accent-brown)]"
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

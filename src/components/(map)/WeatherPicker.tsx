"use client";

// Picker météo (MJ uniquement) — petit panneau flottant pour choisir l'ambiance de la carte
// (Aucune / Pluie / Neige / Brouillard) et son intensité. Écrit dans cartes/{roomId}/settings/general
// (champ weather), lu par tous via useMapData → synchro instantanée MJ→joueurs. Mise à jour optimiste
// du weather-store local (même schéma que updateGlobalTokenScale) pour un retour immédiat côté MJ.

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CloudRain, Snowflake, CloudFog, Ban, X } from "lucide-react";
import { db, doc, setDoc } from "@/lib/firebase";
import {
  subscribeWeather,
  getWeather,
  getServerWeather,
  setWeather,
  type WeatherType,
} from "@/app/[roomid]/map/weather-store";

const OPTIONS: { type: WeatherType; label: string; Icon: typeof CloudRain }[] = [
  { type: "none", label: "Aucune", Icon: Ban },
  { type: "rain", label: "Pluie", Icon: CloudRain },
  { type: "snow", label: "Neige", Icon: Snowflake },
  { type: "fog", label: "Brouillard", Icon: CloudFog },
];

export default function WeatherPicker({
  roomId,
  isMJ,
  open,
  onClose,
}: {
  roomId: string;
  isMJ: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const weather = useSyncExternalStore(subscribeWeather, getWeather, getServerWeather);

  if (!open || !isMJ) return null;

  const write = async (type: WeatherType, intensity: number) => {
    // Optimiste : effet immédiat côté MJ, avant l'aller-retour Firestore.
    setWeather({ type, intensity });
    try {
      await setDoc(
        doc(db, "cartes", roomId, "settings", "general"),
        { weather: { type, intensity } },
        { merge: true },
      );
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
                min={0.1}
                max={1}
                step={0.05}
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

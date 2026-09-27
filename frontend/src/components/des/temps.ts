'use client';

import { useEffect, useState } from 'react';

/** Heure courante rafraîchie régulièrement, pour les « il y a 2 min » qui vieillissent. */
export function useMaintenant(intervalle = 30_000): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setMaintenant(Date.now()), intervalle);
    return () => window.clearInterval(id);
  }, [intervalle]);
  return maintenant;
}

const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** « à l'instant », « il y a 5 min », « il y a 2 h », puis l'heure (14:32), précédée du jour s'il est passé. */
export function depuis(iso: string, maintenant: number): string {
  const date = new Date(iso);
  const secondes = Math.max(0, Math.round((maintenant - date.getTime()) / 1000));
  if (secondes < 45) return 'à l’instant';
  if (secondes < 3600) return `il y a ${Math.max(1, Math.round(secondes / 60))} min`;
  if (secondes < 6 * 3600) return `il y a ${Math.floor(secondes / 3600)} h`;
  const jour = libelleJour(iso, maintenant);
  return jour === 'Aujourd’hui'
    ? heure.format(date)
    : `${jour.charAt(0).toLowerCase()}${jour.slice(1)}, ${heure.format(date)}`;
}

export function heureDe(iso: string): string {
  return heure.format(new Date(iso));
}

const jourLong = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function debutJour(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Clé de regroupement par jour local (« 2026-09-27 »). */
export function cleJour(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** « Aujourd'hui », « Hier » ou « lundi 22 septembre ». */
export function libelleJour(iso: string, maintenant: number): string {
  const ecart = Math.round(
    (debutJour(maintenant) - debutJour(new Date(iso).getTime())) / 86_400_000,
  );
  if (ecart <= 0) return 'Aujourd’hui';
  if (ecart === 1) return 'Hier';
  const texte = jourLong.format(new Date(iso));
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

'use client';

import { useEffect, useState } from 'react';
import { formatter, translate } from '@/i18n/runtime';

/** Heure courante rafraîchie régulièrement, pour les « il y a 2 min » qui vieillissent. */
export function useMaintenant(intervalle = 30_000): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setMaintenant(Date.now()), intervalle);
    return () => window.clearInterval(id);
  }, [intervalle]);
  return maintenant;
}

const heure = (date: Date) => formatter().dateTime(date, 'time');

/** « à l'instant », « il y a 5 min », « il y a 2 h », puis l'heure (14:32), précédée du jour s'il est passé. */
export function depuis(iso: string, maintenant: number): string {
  const date = new Date(iso);
  const secondes = Math.max(0, Math.round((maintenant - date.getTime()) / 1000));
  if (secondes < 45) return translate('dice.time.justNow');
  if (secondes < 3600)
    return translate('dice.time.minutesAgo', { count: Math.max(1, Math.round(secondes / 60)) });
  if (secondes < 6 * 3600)
    return translate('dice.time.hoursAgo', { count: Math.floor(secondes / 3600) });
  if (estAujourdhui(iso, maintenant)) return heure(date);
  const jour = libelleJour(iso, maintenant);
  return translate('dice.time.dayAt', {
    day: `${jour.charAt(0).toLowerCase()}${jour.slice(1)}`,
    time: heure(date),
  });
}

export function heureDe(iso: string): string {
  return heure(new Date(iso));
}

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

const ecartJours = (iso: string, maintenant: number) =>
  Math.round((debutJour(maintenant) - debutJour(new Date(iso).getTime())) / 86_400_000);

const estAujourdhui = (iso: string, maintenant: number) => ecartJours(iso, maintenant) <= 0;

/** « Aujourd'hui », « Hier » ou « lundi 22 septembre ». */
export function libelleJour(iso: string, maintenant: number): string {
  const ecart = ecartJours(iso, maintenant);
  if (ecart <= 0) return translate('dice.time.today');
  if (ecart === 1) return translate('dice.time.yesterday');
  const texte = formatter().dateTime(new Date(iso), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

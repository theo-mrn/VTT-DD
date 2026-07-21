// Store global des positions résolues des personnages de la carte — pont générique entre la boucle
// de données de page.tsx et le code externe (scripts de bundle via api.map.getCharacters /
// subscribeCharacters, ex un radar de proximité). Les positions publiées ici sont le résultat FINAL
// du pipeline de la page (Firestore + surcharges par carte + overlay temps réel RTDB) : les scripts
// n'ont jamais à répliquer cette fusion. Même pattern singleton que view-flags-store.ts.

export interface MapCharacterPosition {
  id: string;
  name: string;
  /** 'joueurs' = personnages incarnés, 'pnj' = PNJ neutres/alliés, 'monster' = hostiles. */
  type: 'joueurs' | 'pnj' | 'monster';
  x: number;
  y: number;
  /** Visibilité brute du personnage — un consommateur côté joueur doit ignorer les entrées
   *  'hidden'/'gm_only'/'invisible' pour ne pas révéler ce que le MJ cache. */
  visibility?: string;
}

let positions: MapCharacterPosition[] = [];
const listeners = new Set<() => void>();

// Notification ASYNCHRONE et COALESCÉE (macrotâche) : les abonnés (composants de bundle — radar,
// overlay...) font des setState à réception, et une livraison synchrone depuis l'effet de
// publication de page.tsx enchaîne ces setState dans la MÊME cascade React — en rafale (positions
// temps réel pendant un déplacement), le compteur de mises à jour imbriquées déborde («Maximum
// update depth exceeded»). Un setTimeout(0) sort la livraison de la cascade (une microtâche ne
// suffit pas, React la traite encore dans le même cycle) et fusionne les rafales : N publications
// dans le même tick = UNE notification, les abonnés lisent l'état final.
let notifyScheduled = false;
function notify() {
  if (notifyScheduled) return;
  notifyScheduled = true;
  setTimeout(() => {
    notifyScheduled = false;
    listeners.forEach((fn) => fn());
  }, 0);
}

/** Publie la liste courante (remplacement complet). Appelé par page.tsx à chaque mise à jour de son
 *  état `characters` ; vidé à la sortie de la carte.
 *  Ne notifie QUE si le contenu change réellement (même garde que view-flags-store et
 *  sheet-background-store) : la page re-publie une projection NEUVE à chaque changement d'identité
 *  de son état characters, souvent à contenu identique — sans ce garde, chaque re-render en rafale
 *  réveille tous les abonnés (radar, overlay...) pour rien, jusqu'à faire déborder le compteur de
 *  mises à jour imbriquées de React (« Maximum update depth exceeded »). */
export function setMapCharacterPositions(next: MapCharacterPosition[]): void {
  const same =
    next.length === positions.length &&
    next.every((p, i) => {
      const q = positions[i];
      return p.id === q.id && p.x === q.x && p.y === q.y && p.type === q.type
        && p.name === q.name && p.visibility === q.visibility;
    });
  if (same) return;
  positions = next;
  notify();
}

export function getMapCharacterPositions(): MapCharacterPosition[] {
  return positions;
}

export function subscribeMapCharacterPositions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── Nom de la carte courante ────────────────────────────────────────────────
// Publié par page.tsx (nom de la scène/ville sélectionnée, '' pour la carte principale ou hors
// carte). Partage les listeners ci-dessus : un abonné aux positions est aussi réveillé quand le nom
// change (ex l'overlay de localisation qui affiche secteur + coordonnées).

let mapName = '';

export function setMapName(name: string): void {
  if (name === mapName) return;
  mapName = name;
  notify();
}

export function getMapName(): string {
  return mapName;
}

// ── Id de la scène/ville courante ───────────────────────────────────────────
// Publié par page.tsx (selectedCityId) — nécessaire pour qu'un script pose un gabarit de mesure
// (api.map.setMeasurement) avec le cityId attendu par le filtre de useMapData.ts:443
// (`m.cityId === selectedCityId`) : sans ça, un gabarit posé avec cityId=null resterait invisible
// dès que le client courant est sur une scène plutôt que la carte principale.

let selectedCityId: string | null = null;

export function setSelectedCityId(id: string | null): void {
  if (id === selectedCityId) return;
  selectedCityId = id;
  notify();
}

export function getSelectedCityId(): string | null {
  return selectedCityId;
}

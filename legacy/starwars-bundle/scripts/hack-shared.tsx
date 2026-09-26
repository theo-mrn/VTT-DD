// Socle commun du Piratage — la commande "hack" du terminal ne joue AUCUN mini-jeu : elle déroule
// une longue séquence de lignes techniques directement dans le flux du terminal (façon montage de
// piratage de film), pendant que le terminal lui-même passe en mode alerte (cf terminal.tsx).
// L'issue est tirée et VERROUILLÉE dès le lancement, avant la première ligne affichée, et écrite
// dans api.sharedState : c'est ce qui rend le résultat vérifiable par le MJ (commande "hacklog")
// sans que le joueur puisse le falsifier après coup — la séquence ne fait que la mettre en scène.
const HACK_KEY = 'hackSessions';

/** Chance de réussite — assez haute pour que le hack reste un outil utile en jeu, pas une loterie. */
export const SUCCESS_CHANCE = 0.7;

export interface HackSession {
  id: string;
  authorName: string;
  status: 'reussi' | 'echoue'; // tranché dès la création, la séquence ne fait que le révéler
  startedAt: number;
}

const parseSession = (raw: unknown): HackSession | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  return {
    id: r.id,
    authorName: typeof r.authorName === 'string' ? r.authorName : 'Inconnu',
    status: r.status === 'echoue' ? 'echoue' : 'reussi',
    startedAt: typeof r.startedAt === 'number' ? r.startedAt : 0,
  };
};

export const parseHackSessions = (v: unknown): HackSession[] => {
  if (typeof v !== 'string' || !v) return [];
  try {
    const raw = JSON.parse(v);
    if (!Array.isArray(raw)) return [];
    return raw.map(parseSession).filter((s): s is HackSession => s !== null);
  } catch {
    return [];
  }
};

export const subscribeHackSessions = (api: any, cb: (list: HackSession[]) => void): (() => void) =>
  api.sharedState.subscribe(HACK_KEY, (v: unknown) => cb(parseHackSessions(v)));

export const writeHackSessions = (api: any, list: HackSession[]): Promise<void> =>
  api.sharedState.set(HACK_KEY, JSON.stringify(list.slice(-50)));

export const makeHackId = (): string =>
  `hack-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Issue tirée et VERROUILLÉE ici, avant tout affichage. */
export const makeHackSession = (authorName: string): HackSession => ({
  id: makeHackId(),
  authorName,
  status: Math.random() < SUCCESS_CHANCE ? 'reussi' : 'echoue',
  startedAt: Date.now(),
});

// ── Génération de la séquence ────────────────────────────────────────────────────────────────────

/** Palette des lignes de la séquence — l'UI mappe ces rôles sur des couleurs concrètes. */
export type HackLineTone = 'dim' | 'data' | 'ok' | 'warn' | 'bad' | 'accent';

export interface HackLine {
  text: string;
  tone: HackLineTone;
  bold?: boolean;
  /** Délai (ms) avant d'afficher la LIGNE SUIVANTE — c'est ce qui donne le rythme (rafales rapides,
   *  pauses de suspense avant un jalon). */
  delay: number;
}

const HEX = '0123456789ABCDEF';
const rnd = (n: number) => Math.floor(Math.random() * n);
const hex = (len: number) => Array.from({ length: len }, () => HEX[rnd(16)]).join('');
const ip = () => `${172 + rnd(3)}.${rnd(32)}.${rnd(255)}.${rnd(255)}`;
const pick = <T,>(arr: readonly T[]): T => arr[rnd(arr.length)];

/** Barre de progression ASCII — remplie à `pct` %. */
const bar = (pct: number, width = 24) => {
  const filled = Math.round((pct / 100) * width);
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`;
};

/** Cadre du verdict final — les trois lignes sont CALCULÉES à partir du texte pour rester alignées
 *  (les écrire à la main désalignait les bordures dès que la longueur du libellé changeait). */
const banner = (label: string): [string, string, string] => {
  const spaced = label.split('').join(' ');
  const inner = spaced.length + 8; // marge de 4 de chaque côté
  const pad = inner - spaced.length;
  const left = Math.floor(pad / 2);
  return [
    `╔${'═'.repeat(inner)}╗`,
    `║${' '.repeat(left)}${spaced}${' '.repeat(pad - left)}║`,
    `╚${'═'.repeat(inner)}╝`,
  ];
};

const NODE_NAMES = ['ISB-RELAY', 'IMP-GATE', 'KDY-NODE', 'SIENAR-DC', 'CORE-AUTH', 'OUTER-HUB', 'TARKIN-SEC'];
const CIPHERS = ['AUREK-7', 'BESH-256', 'CRESH-AES', 'DORN-RSA', 'ESK-ECC'];
const SUBSYS = ['transpondeur IFF', 'registre d\'équipage', 'plans de patrouille', 'codes d\'amarrage', 'manifeste de cargaison', 'journaux de sécurité'];

/** Construit toute la séquence de lignes à afficher, du premier scan jusqu'au verdict. Le paramètre
 *  `success` détermine la DERNIÈRE PHASE (extraction propre vs détection et coupure) : tout ce qui
 *  précède est identique, pour que le joueur ne devine pas l'issue avant la fin. */
export const buildHackSequence = (success: boolean): HackLine[] => {
  const out: HackLine[] = [];
  const push = (text: string, tone: HackLineTone, delay: number, bold?: boolean) =>
    out.push({ text, tone, delay, bold });

  const target = ip();
  const node = pick(NODE_NAMES);
  const cipher = pick(CIPHERS);

  // ── Phase 1 : reconnaissance ──
  push('', 'dim', 60);
  push(`┌─ SLICER SUITE v4.7 ─ liaison HoloNet établie`, 'accent', 220, true);
  push(`│  cible acquise : ${target}  [${node}]`, 'dim', 180);
  push(`└─ empreinte : Empire Galactique / secteur ${rnd(90) + 10}`, 'dim', 320);
  push('', 'dim', 120);
  push('>> BALAYAGE DES PORTS', 'accent', 260, true);
  for (let i = 0; i < 5; i++) {
    const port = 1000 + rnd(9000);
    const state = pick(['OPEN', 'OPEN', 'FILTERED', 'CLOSED']);
    const tone: HackLineTone = state === 'OPEN' ? 'ok' : 'dim';
    push(`   port ${String(port).padStart(5)}/tcp  ${state.padEnd(9)} ${state === 'OPEN' ? pick(['holonet-svc', 'imp-auth', 'droid-rpc', 'nav-sync']) : ''}`, tone, 90);
  }
  push(`   ${5 + rnd(20)} hôtes voisins détectés sur le sous-réseau`, 'dim', 300);
  push('', 'dim', 120);

  // ── Phase 2 : handshake / négociation de clé ──
  push('>> NÉGOCIATION DE CLÉ', 'accent', 240, true);
  push(`   suite de chiffrement : ${cipher}`, 'data', 160);
  for (let i = 0; i < 3; i++) {
    push(`   handshake ${i + 1}/3  ${hex(8)}-${hex(4)}  ${pick(['ACK', 'ACK', 'RETRY'])}`, 'data', 140);
  }
  push(`   canal sécurisé ouvert`, 'ok', 340);
  push('', 'dim', 120);

  // ── Phase 3 : force brute sur la clé (le gros du spectacle) ──
  push('>> DÉCHIFFREMENT DE LA CLÉ MAÎTRESSE', 'accent', 200, true);
  for (let i = 0; i < 10; i++) {
    push(`   ${hex(4)} ${hex(4)} ${hex(4)} ${hex(4)}   ${hex(4)} ${hex(4)} ${hex(4)} ${hex(4)}`, 'dim', 55);
  }
  const steps = [12, 27, 39, 48, 61, 70, 78, 85, 91, 96, 100];
  for (const pct of steps) {
    push(`   ${bar(pct)} ${String(pct).padStart(3)}%   clé partielle ${hex(4)}-${hex(4)}`, pct === 100 ? 'ok' : 'data', pct === 100 ? 260 : 130);
  }
  push(`   CLÉ MAÎTRESSE : ${hex(4)}-${hex(4)}-${hex(4)}-${hex(4)}`, 'ok', 380, true);
  push('', 'dim', 120);

  // ── Phase 4 : élévation de privilèges + contre-mesures ──
  push('>> ÉLÉVATION DE PRIVILÈGES', 'accent', 240, true);
  push(`   utilisateur : maintenance-droid-${rnd(90) + 10}`, 'dim', 150);
  push(`   escalade  guest > technicien > officier`, 'data', 220);
  push(`   ⚠ CONTRE-MESURE ICE DÉTECTÉE  (couche ${rnd(3) + 2})`, 'warn', 420);
  for (let i = 0; i < 4; i++) {
    push(`   injection de leurre ${hex(6)}  ${pick(['esquivé', 'esquivé', 'bloqué'])}`, 'warn', 120);
  }
  push(`   sonde IDS neutralisée`, 'ok', 340);
  push(`   privilèges : OFFICIER IMPÉRIAL`, 'ok', 300, true);
  push('', 'dim', 120);

  // ── Phase 5 : extraction (ou détection) ──
  push('>> ACCÈS AUX SOUS-SYSTÈMES', 'accent', 240, true);
  const grabbed = [pick(SUBSYS), pick(SUBSYS), pick(SUBSYS)];
  for (const s of grabbed) {
    push(`   lecture ${s}  ${bar(100, 14)} ${rnd(900) + 100} Ko`, 'data', 200);
  }
  push('', 'dim', 160);

  if (success) {
    push(`   effacement des traces  ${bar(100, 14)}`, 'ok', 260);
    push(`   déconnexion propre — aucune alerte émise`, 'ok', 420);
    push('', 'dim', 200);
    const [top, mid, bot] = banner('ACCÈS ACCORDÉ');
    push(top, 'ok', 60, true);
    push(mid, 'ok', 60, true);
    push(bot, 'ok', 260, true);
    push(`   ${grabbed.length} sous-systèmes extraits · session close`, 'dim', 0);
  } else {
    push(`   ⚠ SIGNATURE ANORMALE SIGNALÉE AU COMMANDEMENT`, 'warn', 380);
    push(`   trace inverse en cours  ${bar(35, 14)}`, 'bad', 220);
    push(`   trace inverse en cours  ${bar(72, 14)}`, 'bad', 200);
    push(`   trace inverse en cours  ${bar(100, 14)}`, 'bad', 260);
    push(`   verrouillage du nœud ${node}`, 'bad', 300);
    push('', 'dim', 160);
    const [top, mid, bot] = banner('ACCÈS REFUSÉ');
    push(top, 'bad', 60, true);
    push(mid, 'bad', 60, true);
    push(bot, 'bad', 260, true);
    push(`   connexion coupée par les protocoles IDS`, 'dim', 0);
  }

  return out;
};

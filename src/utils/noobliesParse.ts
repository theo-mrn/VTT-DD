// Parsing de la variable `var tmp = {...}` d'une fiche Noobliés Chroniques.
// Logique partagée avec scripts/extract-sheet.mjs, réutilisée côté serveur (route API).

export function extractTmpObject(html: string): string {
  const marker = 'var tmp =';
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error('Impossible de trouver "var tmp =" dans le HTML de la page.');
  }

  const startIndex = html.indexOf('{', markerIndex);
  if (startIndex < 0) {
    throw new Error("Accolade ouvrante de l'objet tmp introuvable.");
  }

  let depth = 0;
  let endIndex = -1;
  for (let i = startIndex; i < html.length; i += 1) {
    const char = html[i];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }

  if (endIndex < 0) {
    throw new Error("Accolade fermante de l'objet tmp introuvable.");
  }

  return html.slice(startIndex, endIndex);
}

export interface NoobliesRank {
  n: number;
  nom: string;
  checked: boolean;
}

export interface NoobliesVoie {
  rangs: Record<string, NoobliesRank>;
  prestige: string;
  nom: string;
}

export interface NoobliesItem {
  nom?: string;
  dm?: string;
  mod?: string;
  effet?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NoobliesSheet {
  cname?: string;
  pname?: string;
  race?: string;
  taille?: string;
  poids?: string;
  age?: string;
  sexe?: string;
  raciale?: string;
  niveau?: string;
  profil?: string;
  type?: string;
  illu?: string;
  dice?: string;
  etat?: string;
  carac?: Record<string, number>;
  contact?: number;
  distance?: number;
  magique?: number;
  initiative?: number;
  defense?: string | number;
  PV?: { max?: string; left?: string };
  mana?: { max?: string; left?: string };
  notes?: string;
  armes?: Record<string, NoobliesItem>;
  armures?: Record<string, NoobliesItem>;
  besace?: Record<string, NoobliesItem>;
  bourse?: Record<string, string>;
  voies?: Record<string, NoobliesVoie>;
  [key: string]: unknown;
}

export function parseNoobliesHtml(html: string): NoobliesSheet {
  const source = extractTmpObject(html);
  try {
    return JSON.parse(source) as NoobliesSheet;
  } catch (error) {
    throw new Error(`Échec du parsing de l'objet tmp : ${(error as Error).message}`);
  }
}

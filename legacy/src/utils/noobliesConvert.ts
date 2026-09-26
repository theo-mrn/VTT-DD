// Conversion d'une fiche Noobliés Chroniques (objet `tmp`) vers le format
// CharacterExportData déjà accepté par importCharacterExport().
//
// Exécuté côté serveur : lit les fichiers de voies dans public/tabs pour tenter
// d'associer chaque voie nommée à son fichier officiel. À défaut, la voie est
// portée par un squelette générique et toutes ses capacités deviennent custom.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { NoobliesSheet, NoobliesItem } from './noobliesParse';
import type { CharacterExportData } from './characterTransfer';

const TABS_DIR = path.join(process.cwd(), 'public', 'tabs');

// Squelette de voie générique : 5 slots vides, remplis ensuite par les customCompetences.
const GENERIC_VOIE_FILE = 'voie_vide.json';

const PROFILE_FILES = [
  'Samourai', 'Guerrier', 'Barde', 'Barbare', 'Chevalier', 'Druide',
  'Ensorceleur', 'Forgesort', 'Invocateur', 'Moine', 'Magicien',
  'Necromancien', 'Psionique', 'Pretre', 'Rodeur', 'Voleur',
];

const RACE_FILES = [
  'Humain', 'Elfe', 'Elfenoir', 'Elfesylvain', 'Nain', 'Halfelin', 'Orque',
  'Minotaure', 'Drakonide', 'Wolfer', 'Ogre', 'Frouin', 'Ame-forgee',
];

function normalize(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // accents
    .replace(/[^a-z0-9]/g, '')       // ponctuation, espaces
    .trim();
}

interface TabsVoie {
  Voie?: string;
  [key: string]: string | undefined;
}

async function readTabsFile(filename: string): Promise<TabsVoie | null> {
  try {
    const raw = await fs.readFile(path.join(TABS_DIR, filename), 'utf-8');
    return JSON.parse(raw) as TabsVoie;
  } catch {
    return null;
  }
}

// Liste des noms de rangs (Affichage1..5) d'un fichier de voie.
function tabsRankNames(voie: TabsVoie): string[] {
  const names: string[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const v = voie[`Affichage${i}`];
    if (v) names.push(v);
  }
  return names;
}

// Score de correspondance entre une voie source et un fichier /tabs candidat :
// poids fort sur le nom de la voie, poids par rang dont le nom correspond.
function matchScore(sourceVoieName: string, sourceRankNames: string[], candidate: TabsVoie): number {
  let score = 0;
  if (candidate.Voie && normalize(candidate.Voie) === normalize(sourceVoieName)) {
    score += 10;
  }
  const candRanks = tabsRankNames(candidate).map(normalize);
  for (const rn of sourceRankNames) {
    if (candRanks.includes(normalize(rn))) score += 2;
  }
  return score;
}

// Construit la liste de tous les fichiers de voies candidats. On scanne tous les
// profils et toutes les races (et pas seulement ceux de la fiche) car la règle de
// voie raciale / le multiclassage permettent à un personnage de porter une voie
// d'un autre profil. Le score de correspondance par nom de voie (poids fort) garantit
// qu'on retombe sur le bon fichier quelle que soit l'origine.
function candidateFiles(): string[] {
  const files: string[] = [];
  for (const p of PROFILE_FILES) for (let i = 1; i <= 5; i += 1) files.push(`${p}${i}.json`);
  for (const r of RACE_FILES) files.push(`${r}.json`);
  return files;
}

function parseLeadingNumber(value: string | undefined): number | undefined {
  if (value == null) return undefined;
  const cleaned = String(value).replace(',', '.').replace(/[^0-9.]/g, '');
  if (cleaned === '') return undefined;
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? undefined : n;
}

function parseInteger(value: string | number | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? undefined : n;
}

interface CustomCompetenceLocal {
  slotIndex: number;
  voieIndex: number;
  sourceVoie: string;
  sourceRank: number;
  competenceName: string;
  competenceDescription: string;
  competenceType: string;
}

function itemsToInventory(
  items: Record<string, NoobliesItem> | undefined,
  category: string,
): CharacterExportData['inventory'] {
  if (!items) return [];
  return Object.values(items)
    .filter(it => it && (it.nom || '').trim() !== '')
    .map((it, idx) => {
      const details: string[] = [];
      if (it.dm) details.push(`DM ${it.dm}`);
      if (it.mod && it.mod !== '0') details.push(`Mod ${it.mod}`);
      const message = details.length ? `${it.nom} (${details.join(', ')})` : (it.nom as string);
      return {
        id: `noobles-${category}-${idx}`,
        data: {
          message,
          category,
          quantity: 1,
          bonusTypes: {},
          diceSelection: category.startsWith('armes') && it.dm ? it.dm : null,
          visibility: 'public',
          weight: 1,
        },
      };
    });
}

export async function convertNoobliesSheet(sheet: NoobliesSheet): Promise<CharacterExportData> {
  const carac = sheet.carac || {};

  const character: Record<string, unknown> = {
    Nomperso: sheet.cname || 'Personnage importé',
    Race: sheet.race,
    Profile: sheet.profil,
    type: 'joueurs',
    visibility: 'visible',
    // L'avatar de la fiche n'affiche que imageURLFinal : on renseigne les trois champs
    // avec la même source pour que l'image apparaisse directement, sans passer par le Studio.
    imageURL: sheet.illu,
    imageURL2: sheet.illu,
    imageURLFinal: sheet.illu,
    deVie: sheet.dice,
    niveau: parseInteger(sheet.niveau),
    Taille: parseLeadingNumber(sheet.taille),
    Poids: parseLeadingNumber(sheet.poids),
    FOR: carac.FOR,
    DEX: carac.DEX,
    CON: carac.CON,
    INT: carac.INT,
    SAG: carac.SAG,
    CHA: carac.CHA,
    Contact: sheet.contact,
    Distance: sheet.distance,
    Magie: sheet.magique,
    INIT: sheet.initiative,
    Defense: parseInteger(sheet.defense),
    PV: parseInteger(sheet.PV?.left),
    PV_Max: parseInteger(sheet.PV?.max),
    Background: sheet.notes,
  };

  // ---- Voies + compétences custom ----
  const customCompetences: CustomCompetenceLocal[] = [];
  const voiesEntries = Object.values(sheet.voies || {});

  // Pré-charger tous les candidats une seule fois.
  const candidates = await Promise.all(
    candidateFiles().map(async f => ({ file: f, data: await readTabsFile(f) })),
  );
  const usedFiles = new Set<string>();

  for (let i = 0; i < voiesEntries.length; i += 1) {
    const voie = voiesEntries[i];
    const voieIndex = i; // 0-based
    const voieNum = i + 1; // Voie1..N
    const ranks = Object.values(voie.rangs || {}).sort((a, b) => a.n - b.n);
    const rankNames = ranks.map(r => r.nom);

    // Trouver le meilleur fichier /tabs non encore utilisé.
    let best: { file: string; score: number } | null = null;
    for (const c of candidates) {
      if (!c.data || usedFiles.has(c.file)) continue;
      const score = matchScore(voie.nom, rankNames, c.data);
      if (score > 0 && (!best || score > best.score)) best = { file: c.file, score };
    }

    const matched = best && best.score >= 2; // au moins un rang ou le nom exact
    const voieFile = matched ? best!.file : GENERIC_VOIE_FILE;
    if (matched) usedFiles.add(best!.file);

    character[`Voie${voieNum}`] = voieFile;
    // Rang atteint = position du dernier rang coché.
    const lastChecked = ranks.reduce((max, r, idx) => (r.checked ? idx + 1 : max), 0);
    character[`v${voieNum}`] = lastChecked;

    // Si la voie n'est pas reconnue (squelette), on porte chaque rang en custom
    // pour conserver noms + (faute de mieux) le nom comme description.
    if (!matched) {
      ranks.forEach((r, slotIndex) => {
        customCompetences.push({
          slotIndex,
          voieIndex,
          sourceVoie: GENERIC_VOIE_FILE,
          sourceRank: slotIndex + 1,
          competenceName: r.nom,
          competenceDescription: r.nom,
          competenceType: 'other',
        });
      });
    }
  }

  // ---- Inventaire ----
  const inventory: CharacterExportData['inventory'] = [
    ...itemsToInventory(sheet.armes, 'armes-contact'),
    ...itemsToInventory(sheet.armures, 'armures'),
    ...itemsToInventory(sheet.besace, 'autre'),
  ];

  // Nettoyer les undefined (Firestore les refuse, l'import les supprime déjà mais autant être propre).
  Object.keys(character).forEach(k => {
    if (character[k] === undefined) delete character[k];
  });

  return {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    character: character as CharacterExportData['character'],
    customCompetences,
    inventory,
    bonuses: [],
  };
}

import { jsPDF } from 'jspdf';
import { Character } from '@/contexts/CharacterContext';
import type { GameSystemDefinition, StatDefinition } from '@/modules/game-system/types';
import type { SpecializationDoc } from '@/modules/game-content/types';
import { getFormulaDependencies, isCareerSkillForCharacter } from '@/lib/rules-engine';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

const COLOR_BG: [number, number, number] = [26, 24, 22];
const COLOR_CARD: [number, number, number] = [40, 37, 33];
const COLOR_BORDER: [number, number, number] = [90, 76, 51];
const COLOR_GOLD: [number, number, number] = [203, 178, 106];
const COLOR_TEXT: [number, number, number] = [222, 222, 222];
const COLOR_TEXT_DIM: [number, number, number] = [160, 160, 160];

interface ExportPdfOptions {
  getDisplayValue: (field: string) => any;
  getDisplayModifier: (field: string) => number;
  gameSystem: GameSystemDefinition;
  /** Docs de spécialisation du système actif — pour résoudre les ids stockés sur le personnage
   *  (character.specializations) en vrais noms, comme WidgetDetails sur la fiche vivante. */
  specializationDocs: (SpecializationDoc & { id: string })[];
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Widget id encodé "baseType:label:fieldIds:layout:styleOption:justify" (même format que
 *  parseStatGroupId dans fiche.tsx) — extrait juste la liste de fieldIds si présente dans l'id. */
function parseFieldIdsFromWidgetId(id: string): string[] | null {
  const parts = id.split(':');
  return parts[2] ? parts[2].split(',') : null;
}

export async function exportCharacterToPdf(character: Character, { getDisplayValue, getDisplayModifier, gameSystem, specializationDocs }: ExportPdfOptions): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const isDndClassic = gameSystem.systemId === 'dnd-classic';
  const hasSkillSystem = (gameSystem.skills?.length ?? 0) > 0;

  const raceDef = (gameSystem.races ?? []).find((r) => r.id === character.Race);
  const raceLabel = gameSystem.raceLabel || 'Race';
  const raceDisplay = raceDef?.label || character.Race || '-';

  const profileDef = (gameSystem.profiles ?? []).find((p) => p.id === character.Profile);
  const careerLabel = hasSkillSystem ? 'Carrière' : (gameSystem.profileLabel || 'Profil');
  const profileDisplay = profileDef?.label || character.Profile || '-';

  const specializationIds: string[] = Array.isArray((character as unknown as Record<string, unknown>).specializations)
    ? (character as unknown as Record<string, string[]>).specializations
    : [];
  const ownedSpecializations = specializationIds
    .map((id) => specializationDocs.find((d) => d.id === id))
    .filter((s): s is SpecializationDoc & { id: string } => !!s);
  const specializationLabel = ownedSpecializations.length > 1 ? 'Spécialisations' : 'Spécialisation';
  const specializationDisplay = ownedSpecializations.length > 0
    ? ownedSpecializations.map((s) => s.name).join(', ')
    : null;

  // Sections dérivées du SYSTÈME ACTIF plutôt que des clés D&D en dur (FOR/DEX/CON/SAG/INT/CHA,
  // PV/Defense/INIT, Contact/Distance/Magie n'existent que pour dnd-classic) — un système custom
  // (ex Star Wars) exporte ses propres caractéristiques/stats vitales/stats de combat.
  const symbolDiceStatKeys = new Set<string>();
  for (const die of gameSystem.symbolDice ?? []) {
    for (const face of die.faces) {
      for (const key of Object.keys(face.values ?? {})) symbolDiceStatKeys.add(key);
    }
  }
  const defaultAbilityStats = gameSystem.stats.filter(
    (s) => s.category === 'ability' && !symbolDiceStatKeys.has(s.key) && s.visibleToPlayers !== false,
  );

  // Stat vitale (ex PV) -> clé de sa borne maximale (ex PV_Max), pour afficher "valeur / max" en une
  // seule carte — même mécanisme générique que WidgetVitals (FicheWidgets.tsx).
  const vitalMaxKeyByKey = new Map<string, string>();
  for (const stat of gameSystem.stats) {
    if (stat.category !== 'vital' || !stat.maxFormula) continue;
    const [maxKey] = getFormulaDependencies(stat.maxFormula);
    if (maxKey) vitalMaxKeyByKey.set(stat.key, maxKey);
  }
  const maxKeysToSkip = new Set(vitalMaxKeyByKey.values());
  const defaultVitalStats = gameSystem.stats.filter(
    (s) => s.category === 'vital' && s.visibleToPlayers !== false && !maxKeysToSkip.has(s.key),
  );
  const defaultCombatStats = (gameSystem.combatAttackKeys ?? [])
    .map((key) => gameSystem.stats.find((s) => s.key === key))
    .filter((s): s is StatDefinition => !!s);

  // Le widget "Vitalité" de la fiche peut afficher n'importe quel mélange de stats (ex Stress,
  // Blessures, Blessures Critiques, Encaissement pour un système EotE) — pas seulement les 'vital'
  // avec borne, configuré via character.layout (personnalisé par le joueur) ou, à défaut,
  // gameSystem.defaultCharacterLayout (réglé par le MJ). Le PDF réutilise EXACTEMENT ce layout pour
  // sa section "Vitaux", plutôt que de redériver sa propre logique qui manquerait ces stats.
  const activeLayout = (character.layout && character.layout.length > 0)
    ? character.layout
    : (gameSystem.defaultCharacterLayout ?? []);
  const vitalsWidget = activeLayout.find((l) => l.i === 'vitals' || l.i.startsWith('vitals:'));
  const vitalFieldIds = vitalsWidget ? parseFieldIdsFromWidgetId(vitalsWidget.i) : null;

  // Repli sur defaultVitalStats/defaultCombatStats si aucun widget vitals dans le layout actif (ex
  // système sans defaultCharacterLayout configuré et personnage n'ayant jamais personnalisé sa fiche).
  const vitalStats = vitalFieldIds
    ? vitalFieldIds
      .map((key) => gameSystem.stats.find((s) => s.key === key))
      .filter((s): s is StatDefinition => !!s && !maxKeysToSkip.has(s.key))
    : defaultVitalStats;
  // Une stat déjà affichée dans "Vitaux" (ex Blessures Critiques, 'ability' listée explicitement dans
  // le widget vitals) ne doit pas AUSSI apparaître dans "Caractéristiques" — même déduplication que
  // maxKeysToSkip pour PV_Max, appliquée cette fois aux clés déjà montrées par la section Vitaux.
  const vitalStatKeys = new Set(vitalStats.map((s) => s.key));
  const abilityStats = defaultAbilityStats.filter((s) => !vitalStatKeys.has(s.key));
  const combatStats = defaultCombatStats;

  const paintPageBackground = () => {
    doc.setFillColor(...COLOR_BG);
    doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  };
  paintPageBackground();

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      paintPageBackground();
      y = MARGIN;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(14);
    doc.setTextColor(...COLOR_GOLD);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(title.toUpperCase(), MARGIN, y);
    y += 2;
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 7;
  };

  const keyValueLine = (label: string, value: string) => {
    ensureSpace(7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...COLOR_TEXT_DIM);
    doc.text(label, MARGIN, y);
    doc.setTextColor(...COLOR_TEXT);
    doc.setFont('helvetica', 'bold');
    doc.text(value, MARGIN + 32, y);
    y += 6.5;
  };

  // ── En-tête ──────────────────────────────────────────────
  let avatarSize = 0;
  if (character.imageURL) {
    const dataUrl = await loadImageAsDataUrl(character.imageURL);
    if (dataUrl) {
      avatarSize = 28;
      try {
        doc.setDrawColor(...COLOR_GOLD);
        doc.setLineWidth(0.6);
        doc.addImage(dataUrl, MARGIN, y, avatarSize, avatarSize);
        doc.rect(MARGIN, y, avatarSize, avatarSize);
      } catch {
        avatarSize = 0;
      }
    }
  }

  const headerTextX = avatarSize ? MARGIN + avatarSize + 8 : MARGIN;
  doc.setTextColor(...COLOR_GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(character.Nomperso || 'Personnage', headerTextX, y + 10);

  doc.setTextColor(...COLOR_TEXT_DIM);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const subtitle = [profileDisplay, raceDisplay].filter((v) => v && v !== '-').join(' · ');
  if (subtitle) doc.text(subtitle, headerTextX, y + 17);
  doc.text(`Niveau ${character.niveau ?? '-'}`, headerTextX, y + 23);

  y += Math.max(avatarSize, 30) + 6;
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 10;

  // ── Infos générales ──────────────────────────────────────
  sectionTitle('Informations');
  keyValueLine(careerLabel, profileDisplay);
  keyValueLine(raceLabel, raceDisplay);
  if (specializationDisplay) keyValueLine(specializationLabel, specializationDisplay);
  keyValueLine('Taille', `${character.Taille ?? '-'} cm`);
  keyValueLine('Poids', `${character.Poids ?? '-'} Kg`);
  // Dé de Vie est un mécanisme 100% dnd-classic (progression de niveau par jet de dé) — n'a pas de
  // sens pour un système custom, comme déjà fait dans WidgetDetails (FicheWidgets.tsx).
  if (isDndClassic) keyValueLine('Dé de vie', `${character.deVie ?? '-'}`);
  y += 4;

  // ── Caractéristiques (grille 3 par ligne) ────────────────
  if (abilityStats.length > 0) {
    sectionTitle('Caractéristiques');
    const statCols = 3;
    const gap = 4;
    const statCardW = (CONTENT_W - gap * (statCols - 1)) / statCols;
    const statCardH = 20;
    const statRows = Math.ceil(abilityStats.length / statCols);
    ensureSpace(statCardH * statRows + gap);

    abilityStats.forEach((stat, i) => {
      const col = i % statCols;
      const row = Math.floor(i / statCols);
      const x = MARGIN + col * (statCardW + gap);
      const cardY = y + row * (statCardH + gap);

      doc.setFillColor(...COLOR_CARD);
      doc.setDrawColor(...COLOR_BORDER);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, cardY, statCardW, statCardH, 1.5, 1.5, 'FD');

      const base = character[stat.key];
      const label = stat.shortLabel || stat.label || stat.key;

      doc.setTextColor(...COLOR_TEXT_DIM);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(label.toUpperCase(), x + statCardW / 2, cardY + 6, { align: 'center', maxWidth: statCardW - 2 });

      if (stat.rollUsesModifier) {
        const modifier = getDisplayModifier(stat.key);
        const modStr = isNaN(modifier) ? '' : `${modifier >= 0 ? '+' : ''}${modifier}`;
        doc.setTextColor(modifier < 0 ? 200 : 120, modifier < 0 ? 80 : 200, modifier < 0 ? 80 : 120);
        doc.setFontSize(14);
        doc.text(modStr, x + statCardW / 2, cardY + 13, { align: 'center' });

        doc.setTextColor(...COLOR_TEXT_DIM);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(String(base ?? '-'), x + statCardW / 2, cardY + 18, { align: 'center' });
      } else {
        doc.setTextColor(...COLOR_TEXT);
        doc.setFontSize(14);
        doc.text(String(getDisplayValue(stat.key) ?? base ?? '-'), x + statCardW / 2, cardY + 14, { align: 'center' });
      }
    });
    y += statCardH * statRows + gap + 8;
  }

  // ── Vitaux / Combat (rangées de cartes séparées) ─────────
  const cardRowH = 20;
  const renderCardRow = (entries: readonly StatDefinition[]) => {
    if (entries.length === 0) return;
    const cardW = (CONTENT_W - 4 * (entries.length - 1)) / entries.length;
    ensureSpace(cardRowH + 4);

    entries.forEach((stat, i) => {
      const x = MARGIN + i * (cardW + 4);
      doc.setFillColor(...COLOR_CARD);
      doc.setDrawColor(...COLOR_BORDER);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, cardW, cardRowH, 1.5, 1.5, 'FD');

      const label = stat.shortLabel || stat.label || stat.key;
      const maxKey = vitalMaxKeyByKey.get(stat.key);
      const value = maxKey
        ? `${getDisplayValue(stat.key) ?? character[stat.key as keyof Character] ?? '-'} / ${getDisplayValue(maxKey) ?? character[maxKey as keyof Character] ?? '-'}`
        : String(getDisplayValue(stat.key) ?? character[stat.key as keyof Character] ?? '-');

      doc.setTextColor(...COLOR_TEXT_DIM);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(label.toUpperCase(), x + cardW / 2, y + 6, { align: 'center', maxWidth: cardW - 2 });

      doc.setTextColor(...COLOR_TEXT);
      doc.setFontSize(13);
      doc.text(value, x + cardW / 2, y + 15, { align: 'center' });
    });
    y += cardRowH + 10;
  };

  if (vitalStats.length > 0) {
    sectionTitle('Vitaux');
    renderCardRow(vitalStats);
  }

  if (combatStats.length > 0) {
    sectionTitle('Combat');
    renderCardRow(combatStats);
  }

  // ── Compétences (format papier-crayon) ───────────────────
  // Affiche TOUTES les compétences du système (pas seulement celles montées), avec une case cochée
  // si acquise à la création (careerSkillChoices/specializationSkillChoices) et 5 petites cases de
  // rang à côté — pré-cochées jusqu'au rang connu (skillRanks), sinon laissées vides pour un usage
  // papier-crayon réel (le joueur les remplit/coche lui-même en jouant, sans dépendre de l'app).
  if (hasSkillSystem) {
    const careerSkillChoices: string[] = Array.isArray((character as unknown as Record<string, unknown>).careerSkillChoices)
      ? (character as unknown as Record<string, string[]>).careerSkillChoices
      : [];
    const specializationSkillChoices: Record<string, string[]> =
      (character as unknown as Record<string, unknown>).specializationSkillChoices as Record<string, string[]> ?? {};
    const chosenAtCreation = new Set<string>([
      ...careerSkillChoices,
      ...Object.values(specializationSkillChoices).flat(),
    ]);
    const skillRanks: Record<string, number> = (character as unknown as Record<string, unknown>).skillRanks as Record<string, number> ?? {};
    const careerSkillKeys = profileDef?.careerSkillKeys ?? [];

    const skillGroups = new Map<string, NonNullable<typeof gameSystem.skills>>();
    for (const skill of gameSystem.skills ?? []) {
      const groupName = skill.group || 'Compétences';
      if (!skillGroups.has(groupName)) skillGroups.set(groupName, []);
      skillGroups.get(groupName)!.push(skill);
    }

    sectionTitle(gameSystem.skillLabel || 'Compétences');
    const rowH = 6.5;
    const maxRankBoxes = 5;
    const boxSize = 3;

    for (const [groupName, skills] of skillGroups) {
      ensureSpace(rowH * (skills.length + 1));
      doc.setTextColor(...COLOR_GOLD);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(groupName.toUpperCase(), MARGIN, y);
      y += 5;

      for (const skill of skills.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
        ensureSpace(rowH);
        const isCareer = isCareerSkillForCharacter(skill.key, careerSkillKeys, ownedSpecializations);
        const isChosen = chosenAtCreation.has(skill.key);
        const rank = skillRanks[skill.key] ?? 0;

        // Case "acquise à la création" — cochée (croix) si vraiment choisie, vide sinon.
        doc.setDrawColor(...COLOR_BORDER);
        doc.setLineWidth(0.3);
        doc.rect(MARGIN, y - 2.6, boxSize, boxSize);
        if (isChosen) {
          doc.setDrawColor(...COLOR_GOLD);
          doc.setLineWidth(0.4);
          doc.line(MARGIN, y - 2.6, MARGIN + boxSize, y - 2.6 + boxSize);
          doc.line(MARGIN, y - 2.6 + boxSize, MARGIN + boxSize, y - 2.6);
        }

        // Label (+ étoile discrète si compétence de carrière, coût réduit) et clé de caractéristique liée.
        doc.setTextColor(...COLOR_TEXT);
        doc.setFont('helvetica', isChosen ? 'bold' : 'normal');
        doc.setFontSize(9);
        const linkedStat = gameSystem.stats.find((s) => s.key === skill.linkedStatKey);
        const linkedLabel = linkedStat?.shortLabel || linkedStat?.label || skill.linkedStatKey;
        doc.text(`${skill.label}${isCareer ? ' *' : ''} (${linkedLabel})`, MARGIN + boxSize + 3, y);

        // 5 petites cases de rang — pré-cochées jusqu'à skillRanks[key] si connu, sinon vides.
        const boxesStartX = PAGE_W - MARGIN - maxRankBoxes * (boxSize + 1.5);
        for (let i = 0; i < maxRankBoxes; i++) {
          const bx = boxesStartX + i * (boxSize + 1.5);
          doc.setDrawColor(...COLOR_BORDER);
          doc.setLineWidth(0.3);
          doc.rect(bx, y - 2.6, boxSize, boxSize);
          if (i < rank) {
            doc.setFillColor(...COLOR_GOLD);
            doc.rect(bx, y - 2.6, boxSize, boxSize, 'F');
          }
        }

        y += rowH;
      }
      y += 2;
    }
    doc.setTextColor(...COLOR_TEXT_DIM);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    ensureSpace(6);
    doc.text('* Compétence de carrière/spécialisation (coût en XP réduit).', MARGIN, y);
    y += 6;
  }

  // ── Champs personnalisés ─────────────────────────────────
  if (character.customFields?.length) {
    sectionTitle('Champs personnalisés');
    for (const field of character.customFields) {
      const value = field.type === 'boolean' ? (field.value ? 'Oui' : 'Non') : String(field.value);
      keyValueLine(field.label, value);
    }
    y += 4;
  }

  doc.save(`${character.Nomperso || 'personnage'}.pdf`);
}

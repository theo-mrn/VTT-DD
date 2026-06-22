import { jsPDF } from 'jspdf';
import { Character } from '@/contexts/CharacterContext';

const STATS = ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'] as const;
const VITALS = [
  { key: 'PV', label: 'Points de vie', suffix: (c: Character) => ` / ${c.PV_Max ?? '-'}` },
  { key: 'Defense', label: 'Défense' },
  { key: 'INIT', label: 'Initiative' },
] as const;
const COMBAT = [
  { key: 'Contact', label: 'Contact' },
  { key: 'Distance', label: 'Distance' },
  { key: 'Magie', label: 'Magie' },
] as const;

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

export async function exportCharacterToPdf(character: Character, { getDisplayValue, getDisplayModifier }: ExportPdfOptions): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

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
  const subtitle = [character.Profile, character.Race].filter(Boolean).join(' · ');
  if (subtitle) doc.text(subtitle, headerTextX, y + 17);
  doc.text(`Niveau ${character.niveau ?? '-'}`, headerTextX, y + 23);

  y += Math.max(avatarSize, 30) + 6;
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 10;

  // ── Infos générales ──────────────────────────────────────
  sectionTitle('Informations');
  keyValueLine('Taille', `${character.Taille ?? '-'} cm`);
  keyValueLine('Poids', `${character.Poids ?? '-'} Kg`);
  keyValueLine('Dé de vie', `${character.deVie ?? '-'}`);
  y += 4;

  // ── Caractéristiques (grille 3x2) ────────────────────────
  sectionTitle('Caractéristiques');
  const statCols = 3;
  const gap = 4;
  const statCardW = (CONTENT_W - gap * (statCols - 1)) / statCols;
  const statCardH = 20;
  ensureSpace(statCardH * 2 + gap);

  STATS.forEach((stat, i) => {
    const col = i % statCols;
    const row = Math.floor(i / statCols);
    const x = MARGIN + col * (statCardW + gap);
    const cardY = y + row * (statCardH + gap);

    doc.setFillColor(...COLOR_CARD);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, cardY, statCardW, statCardH, 1.5, 1.5, 'FD');

    const base = character[stat];
    const modifier = getDisplayModifier(stat);
    const modStr = isNaN(modifier) ? '' : `${modifier >= 0 ? '+' : ''}${modifier}`;

    doc.setTextColor(...COLOR_TEXT_DIM);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(stat, x + statCardW / 2, cardY + 6, { align: 'center' });

    doc.setTextColor(modifier < 0 ? 200 : 120, modifier < 0 ? 80 : 200, modifier < 0 ? 80 : 120);
    doc.setFontSize(14);
    doc.text(modStr, x + statCardW / 2, cardY + 13, { align: 'center' });

    doc.setTextColor(...COLOR_TEXT_DIM);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(String(base ?? '-'), x + statCardW / 2, cardY + 18, { align: 'center' });
  });
  y += statCardH * 2 + gap + 8;

  // ── Vitaux / Combat (rangées de cartes séparées) ─────────
  const cardRowH = 20;
  const renderCardRow = (entries: readonly { key: string; label: string; suffix?: (c: Character) => string }[]) => {
    const cardW = (CONTENT_W - gap * (entries.length - 1)) / entries.length;
    ensureSpace(cardRowH + gap);

    entries.forEach((entry, i) => {
      const x = MARGIN + i * (cardW + gap);
      doc.setFillColor(...COLOR_CARD);
      doc.setDrawColor(...COLOR_BORDER);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, cardW, cardRowH, 1.5, 1.5, 'FD');

      const value = getDisplayValue(entry.key) ?? character[entry.key as keyof Character];
      const suffix = entry.suffix ? entry.suffix(character) : '';

      doc.setTextColor(...COLOR_TEXT_DIM);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(entry.label.toUpperCase(), x + cardW / 2, y + 6, { align: 'center', maxWidth: cardW - 2 });

      doc.setTextColor(...COLOR_TEXT);
      doc.setFontSize(13);
      doc.text(`${value ?? '-'}${suffix}`, x + cardW / 2, y + 15, { align: 'center' });
    });
    y += cardRowH + 10;
  };

  sectionTitle('Vitaux');
  renderCardRow(VITALS);

  sectionTitle('Combat');
  renderCardRow(COMBAT);

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

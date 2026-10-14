/**
 * Document PDF des fiches (une fiche par page, la suite se répartit sur les pages suivantes) :
 * en-tête (nom, profil, portrait), caractéristiques et ressources en cases, listes sur deux
 * colonnes, textes. Le style (`themes.ts`) ne change que l'habillage. Chargé à la demande avec
 * @react-pdf/renderer (jamais dans le paquet principal).
 */
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { SheetSection, SheetSnapshot } from '../snapshot';
import { PDF_THEMES, type PdfTheme, type SheetStyle } from './themes';

/**
 * Polices standard du PDF : jeu de caractères Windows-1252. Les quelques signes hors de ce jeu
 * (moins typographique, espaces fines…) sont ramenés à leur équivalent, les autres retirés.
 */
const HORS_JEU = /[^\x20-\x7E\xA0-\xFF–—‘’“”…•€ŒœŸ\n]/g;
export const pdfText = (s: string) =>
  s.replace(/−/g, '-').replace(/[   ]/g, ' ').replace(/[‐‑]/g, '-').replace(HORS_JEU, '');

export interface SheetLabels {
  footer: string;
  page: (n: number, total: number) => string;
}

function styles(t: PdfTheme) {
  return StyleSheet.create({
    page: {
      backgroundColor: t.page,
      color: t.ink,
      fontFamily: t.font,
      fontSize: 9.5,
      paddingTop: 30,
      paddingBottom: 40,
      paddingHorizontal: 32,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      marginBottom: 16,
      padding: t.ornate ? 12 : 0,
      paddingBottom: t.ornate ? 12 : 12,
      borderWidth: t.ornate ? 1.5 : 0,
      borderBottomWidth: t.ornate ? 1.5 : 1,
      borderColor: t.ornate ? t.boxBorder : t.rule,
      borderRadius: t.ornate ? 4 : 0,
    },
    ornateInner: {
      position: 'absolute',
      top: 3,
      left: 3,
      right: 3,
      bottom: 3,
      borderWidth: 0.6,
      borderColor: t.boxBorder,
      borderRadius: 2,
    },
    name: { fontFamily: t.bold, fontSize: 24, color: t.ornate ? t.accent : t.ink },
    system: {
      fontSize: 8,
      color: t.muted,
      marginTop: 2,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    concept: { fontFamily: t.italic, fontSize: 9.5, color: t.muted, marginTop: 6 },
    details: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    detail: {
      flexDirection: 'row',
      gap: 3,
      borderWidth: 0.6,
      borderColor: t.boxBorder,
      borderRadius: 10,
      paddingVertical: 2,
      paddingHorizontal: 7,
      backgroundColor: t.box,
    },
    detailLabel: { fontSize: 7.5, color: t.muted },
    detailValue: { fontSize: 8.5, fontFamily: t.bold },
    portrait: {
      width: 74,
      height: 98,
      objectFit: 'cover',
      borderRadius: t.radius,
      borderWidth: 1,
      borderColor: t.boxBorder,
    },
    section: { marginBottom: 12 },
    sectionTitle: {
      fontFamily: t.bold,
      fontSize: t.caps ? 8.5 : 10.5,
      color: t.accent,
      textTransform: t.caps ? 'uppercase' : 'none',
      letterSpacing: t.caps ? 1.4 : 0,
      paddingBottom: 3,
      marginBottom: 6,
      borderBottomWidth: t.ornate ? 1 : 0.6,
      borderBottomColor: t.ornate ? t.accent : t.rule,
    },
    boxes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    stat: {
      width: 62,
      alignItems: 'center',
      paddingTop: 5,
      paddingBottom: 9,
      borderWidth: t.ornate ? 1.4 : 0.8,
      borderColor: t.boxBorder,
      borderRadius: t.radius,
      backgroundColor: t.box,
    },
    statLabel: {
      fontSize: 6.5,
      color: t.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      textAlign: 'center',
    },
    statBig: { fontFamily: t.bold, fontSize: 18, marginTop: 1 },
    ovalWrap: { position: 'absolute', bottom: -7, left: 0, right: 0, alignItems: 'center' },
    statOval: {
      width: 28,
      paddingVertical: 1,
      borderWidth: 0.8,
      borderColor: t.boxBorder,
      borderRadius: 8,
      backgroundColor: t.page,
      alignItems: 'center',
    },
    statOvalText: { fontSize: 8, fontFamily: t.bold, textAlign: 'center' },
    resource: {
      minWidth: 108,
      flexGrow: 1,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderWidth: t.ornate ? 1.2 : 0.8,
      borderColor: t.boxBorder,
      borderRadius: t.radius,
      backgroundColor: t.box,
    },
    resourceLabel: {
      fontSize: 6.5,
      color: t.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    resourceValue: { fontFamily: t.bold, fontSize: 14, marginTop: 2 },
    resourceMax: { fontFamily: t.font, fontSize: 9, color: t.muted },
    columns: { flexDirection: 'row', flexWrap: 'wrap' },
    item: { width: '50%', flexDirection: 'row', paddingRight: 10, marginBottom: 3 },
    bullet: { color: t.accent, width: 8 },
    itemName: { flexShrink: 1 },
    itemNote: { color: t.muted, fontSize: 8.5 },
    groupTitle: {
      fontFamily: t.bold,
      fontSize: 8.5,
      color: t.muted,
      marginTop: 4,
      marginBottom: 3,
    },
    text: { lineHeight: 1.45 },
    footer: {
      position: 'absolute',
      bottom: 18,
      left: 32,
      right: 32,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 7,
      color: t.muted,
    },
  });
}

type S = ReturnType<typeof styles>;

function Section({ section, s }: Readonly<{ section: SheetSection; s: S }>) {
  const titre = <Text style={s.sectionTitle}>{pdfText(section.title)}</Text>;
  switch (section.kind) {
    case 'stats':
      return (
        <View style={s.section} wrap={false}>
          {titre}
          <View style={[s.boxes, { rowGap: 12, marginBottom: 6 }]}>
            {section.items.map((it) => (
              <View key={it.label} style={s.stat}>
                <Text style={s.statLabel}>{pdfText(it.short ?? it.label)}</Text>
                {/* Avec un modificateur : lui en grand, la valeur dans l'ovale (fiche officielle) */}
                <Text style={s.statBig}>{pdfText(it.mod ?? it.value)}</Text>
                {it.mod && (
                  <View style={s.ovalWrap}>
                    <View style={s.statOval}>
                      <Text style={s.statOvalText}>{pdfText(it.value)}</Text>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      );
    case 'resources':
    case 'currencies':
      return (
        <View style={s.section} wrap={false}>
          {titre}
          <View style={s.boxes}>
            {section.items.map((it) => (
              <View key={it.label} style={s.resource}>
                <Text style={s.resourceLabel}>{pdfText(it.label)}</Text>
                <Text style={s.resourceValue}>
                  {pdfText(it.value)}
                  {'max' in it && it.max && <Text style={s.resourceMax}> / {it.max}</Text>}
                </Text>
              </View>
            ))}
          </View>
        </View>
      );
    case 'list':
      return (
        <View style={s.section}>
          {titre}
          {section.groups.map((g, i) => (
            <View key={g.title ?? i}>
              {g.title && <Text style={s.groupTitle}>{pdfText(g.title)}</Text>}
              <View style={s.columns}>
                {g.items.map((it, j) => (
                  <View key={`${it.name}-${j}`} style={s.item} wrap={false}>
                    <Text style={s.bullet}>•</Text>
                    <Text style={s.itemName}>
                      {pdfText(it.name)}
                      {it.note && <Text style={s.itemNote}> {pdfText(it.note)}</Text>}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    case 'text':
      return (
        <View style={s.section}>
          {titre}
          <Text style={s.text}>{pdfText(section.text)}</Text>
        </View>
      );
  }
}

/** Ordre sur la page : cases (caractéristiques, ressources, monnaies) d'abord, puis le reste. */
const RANG: Record<SheetSection['kind'], number> = {
  stats: 0,
  resources: 1,
  currencies: 2,
  list: 3,
  text: 4,
};

function SheetPage({
  sheet,
  portrait,
  s,
  t,
  labels,
}: Readonly<{
  sheet: SheetSnapshot;
  portrait: string | null;
  s: S;
  t: PdfTheme;
  labels: SheetLabels;
}>) {
  const sections = [...sheet.sections].sort((a, b) => RANG[a.kind] - RANG[b.kind]);
  return (
    <Page size="A4" style={s.page}>
      <View style={s.header}>
        {t.ornate && <View style={s.ornateInner} fixed={false} />}
        <View style={{ flexGrow: 1, flexShrink: 1 }}>
          <Text style={s.name}>{pdfText(sheet.name)}</Text>
          {sheet.system && <Text style={s.system}>{pdfText(sheet.system)}</Text>}
          {sheet.concept && <Text style={s.concept}>{pdfText(sheet.concept)}</Text>}
          {sheet.details.length > 0 && (
            <View style={s.details}>
              {sheet.details.map((d) => (
                <View key={`${d.label}-${d.value}`} style={s.detail}>
                  <Text style={s.detailLabel}>{pdfText(d.label)}</Text>
                  <Text style={s.detailValue}>{pdfText(d.value)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- image d'un PDF, pas du DOM */}
        {portrait && <Image src={portrait} style={s.portrait} />}
      </View>
      {sections.map((sec, i) => (
        <Section key={`${sec.kind}-${sec.title}-${i}`} section={sec} s={s} />
      ))}
      <View style={s.footer} fixed>
        <Text>{pdfText(labels.footer)}</Text>
        <Text render={({ pageNumber, totalPages }) => labels.page(pageNumber, totalPages)} />
      </View>
    </Page>
  );
}

export function SheetDocument({
  sheets,
  portraits,
  style,
  labels,
  title,
}: Readonly<{
  sheets: readonly SheetSnapshot[];
  /** Portraits prêts pour le PDF (JPEG en data URL), par fiche ; null : pas de portrait. */
  portraits: readonly (string | null)[];
  style: SheetStyle;
  labels: SheetLabels;
  title: string;
}>) {
  const t = PDF_THEMES[style];
  const s = styles(t);
  return (
    <Document title={pdfText(title)} creator="Yner" producer="Yner">
      {sheets.map((sheet, i) => (
        <SheetPage
          key={`${sheet.name}-${i}`}
          sheet={sheet}
          portrait={portraits[i] ?? null}
          s={s}
          t={t}
          labels={labels}
        />
      ))}
    </Document>
  );
}

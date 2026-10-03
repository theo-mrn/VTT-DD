/**
 * Tests sur les logiques pures extraites de fiche.tsx
 */

import type { Layout } from 'react-grid-layout';

// ─── sanitizeLayout (migration legacy 12-cols → 120-cols) ────────────────────

function sanitizeLayout(layoutArray: Layout[]): Layout[] {
  const isLegacyScale = layoutArray.every(l => (l.w ?? 0) <= 12 && (l.x ?? 0) <= 12);

  return layoutArray.map(l => {
    let newX = l.x ?? 0;
    let newW = l.w ?? 6;
    let newMinW = Math.min(l.minW ?? 20, 20);

    if (isLegacyScale) {
      newX *= 10;
      newW *= 10;
    }

    return { ...l, x: newX, w: newW, minW: newMinW };
  });
}

describe("sanitizeLayout — migration legacy", () => {
  it("détecte un layout legacy (w et x ≤ 12) et multiplie par 10", () => {
    const legacy: Layout[] = [
      { i: 'stats', x: 0, y: 0, w: 6, h: 4 },
      { i: 'vitals', x: 6, y: 0, w: 6, h: 2 },
    ];
    const result = sanitizeLayout(legacy);
    expect(result[0].w).toBe(60);
    expect(result[0].x).toBe(0);
    expect(result[1].w).toBe(60);
    expect(result[1].x).toBe(60);
  });

  it("ne touche pas un layout déjà en 120-cols", () => {
    const modern: Layout[] = [
      { i: 'stats', x: 0, y: 0, w: 60, h: 4 },
      { i: 'vitals', x: 60, y: 0, w: 60, h: 2 },
    ];
    const result = sanitizeLayout(modern);
    expect(result[0].w).toBe(60);
    expect(result[0].x).toBe(0);
    expect(result[1].w).toBe(60);
    expect(result[1].x).toBe(60);
  });

  it("clamp minW à 20 maximum", () => {
    const layout: Layout[] = [{ i: 'test', x: 0, y: 0, w: 60, h: 4, minW: 50 }];
    const result = sanitizeLayout(layout);
    expect(result[0].minW).toBe(20);
  });

  it("applique minW = 20 par défaut si absent", () => {
    const layout: Layout[] = [{ i: 'test', x: 0, y: 0, w: 60, h: 4 }];
    const result = sanitizeLayout(layout);
    expect(result[0].minW).toBe(20);
  });

  it("préserve les autres propriétés (y, h, i)", () => {
    const layout: Layout[] = [{ i: 'avatar', x: 0, y: 3, w: 60, h: 5 }];
    const result = sanitizeLayout(layout);
    expect(result[0].i).toBe('avatar');
    expect(result[0].y).toBe(3);
    expect(result[0].h).toBe(5);
  });

  it("retourne un tableau vide si l'entrée est vide", () => {
    expect(sanitizeLayout([])).toEqual([]);
  });
});

// ─── updateWidgetDim ──────────────────────────────────────────────────────────

function updateWidgetDim(
  layout: Layout[],
  id: string,
  type: 'w' | 'h',
  value: number | 'inc' | 'dec',
  currentCols = 120
): Layout[] {
  return layout.map(item => {
    if (item.i === id) {
      let newItem = { ...item };
      const minW = newItem.minW || 2;
      const minH = newItem.minH || 2;

      if (value === 'inc') {
        if (type === 'w') newItem.w = Math.min((newItem.w || 1) + 1, currentCols);
        if (type === 'h') newItem.h = (newItem.h || 1) + 1;
      } else if (value === 'dec') {
        if (type === 'w') newItem.w = Math.max((newItem.w || 1) - 1, minW);
        if (type === 'h') newItem.h = Math.max((newItem.h || 1) - 1, minH);
      } else if (typeof value === 'number') {
        if (type === 'w') newItem.w = Math.max(value, minW);
      }
      return newItem;
    }
    return item;
  });
}

const baseLayout: Layout[] = [
  { i: 'stats', x: 0, y: 0, w: 60, h: 4, minW: 20, minH: 2 },
  { i: 'vitals', x: 60, y: 0, w: 60, h: 2, minW: 20, minH: 2 },
];

describe("updateWidgetDim — increment/decrement", () => {
  it("incrémente la largeur de 1", () => {
    const result = updateWidgetDim(baseLayout, 'stats', 'w', 'inc');
    expect(result.find(l => l.i === 'stats')!.w).toBe(61);
  });

  it("décrémente la largeur de 1", () => {
    const result = updateWidgetDim(baseLayout, 'stats', 'w', 'dec');
    expect(result.find(l => l.i === 'stats')!.w).toBe(59);
  });

  it("incrémente la hauteur de 1", () => {
    const result = updateWidgetDim(baseLayout, 'stats', 'h', 'inc');
    expect(result.find(l => l.i === 'stats')!.h).toBe(5);
  });

  it("décrémente la hauteur de 1", () => {
    const result = updateWidgetDim(baseLayout, 'stats', 'h', 'dec');
    expect(result.find(l => l.i === 'stats')!.h).toBe(3);
  });

  it("ne descend pas en dessous de minW lors du décrément", () => {
    const small: Layout[] = [{ i: 'stats', x: 0, y: 0, w: 20, h: 4, minW: 20, minH: 2 }];
    const result = updateWidgetDim(small, 'stats', 'w', 'dec');
    expect(result[0].w).toBe(20); // reste à minW
  });

  it("ne descend pas en dessous de minH lors du décrément", () => {
    const small: Layout[] = [{ i: 'stats', x: 0, y: 0, w: 60, h: 2, minW: 20, minH: 2 }];
    const result = updateWidgetDim(small, 'stats', 'h', 'dec');
    expect(result[0].h).toBe(2); // reste à minH
  });

  it("ne dépasse pas currentCols lors de l'incrément de largeur", () => {
    const full: Layout[] = [{ i: 'stats', x: 0, y: 0, w: 120, h: 4, minW: 20, minH: 2 }];
    const result = updateWidgetDim(full, 'stats', 'w', 'inc', 120);
    expect(result[0].w).toBe(120);
  });

  it("ne modifie pas les autres widgets", () => {
    const result = updateWidgetDim(baseLayout, 'stats', 'w', 'inc');
    const vitals = result.find(l => l.i === 'vitals')!;
    expect(vitals.w).toBe(60); // inchangé
  });
});

describe("updateWidgetDim — valeur numérique directe", () => {
  it("affecte directement la largeur avec une valeur numérique", () => {
    const result = updateWidgetDim(baseLayout, 'stats', 'w', 40);
    expect(result.find(l => l.i === 'stats')!.w).toBe(40);
  });

  it("clamp à minW si la valeur est inférieure", () => {
    const result = updateWidgetDim(baseLayout, 'stats', 'w', 5);
    expect(result.find(l => l.i === 'stats')!.w).toBe(20); // clamp à minW=20
  });
});

// ─── Parsing des widget IDs (custom_group:label:fields:layout) ────────────────

function parseWidgetId(id: string): { baseType: string; label: string; fieldIds: string[]; layout: string; styleOption: string; justify: string } {
  const parts = id.split(':');
  const baseType = parts[0] === 'custom_group' || parts[0] === 'stats' || parts[0] === 'vitals' || parts[0] === 'combat_stats' ? parts[0] : 'custom_group';

  const defaultsByType: Record<string, { label: string; fields: string[]; layout: string }> = {
    stats: { label: 'Caractéristiques', fields: ['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'], layout: 'grid' },
    vitals: { label: 'Vitalité', fields: ['PV', 'Defense'], layout: 'horizontal' },
    combat_stats: { label: 'Combat', fields: ['Contact', 'Distance', 'Magie'], layout: 'grid' },
    custom_group: { label: '', fields: [], layout: 'horizontal' },
  };

  const defaults = defaultsByType[baseType];
  const label = parts[1] !== undefined ? parts[1] : defaults.label;
  const fieldIds = parts[2] ? parts[2].split(',') : defaults.fields;
  const layout = parts[3] || defaults.layout;
  const styleOption = parts[4] || 'separated';
  const justify = parts[5] || 'stretch';

  return { baseType, label, fieldIds, layout, styleOption, justify };
}

describe("parseWidgetId", () => {
  it("parse un widget stats simple", () => {
    const result = parseWidgetId('stats');
    expect(result.baseType).toBe('stats');
    expect(result.label).toBe('Caractéristiques');
    expect(result.fieldIds).toEqual(['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA']);
    expect(result.layout).toBe('grid');
  });

  it("parse un widget vitals", () => {
    const result = parseWidgetId('vitals');
    expect(result.fieldIds).toEqual(['PV', 'Defense']);
    expect(result.layout).toBe('horizontal');
  });

  it("parse un custom_group avec label et champs", () => {
    const result = parseWidgetId('custom_group:Mon Groupe:FOR,DEX,CON:grid');
    expect(result.baseType).toBe('custom_group');
    expect(result.label).toBe('Mon Groupe');
    expect(result.fieldIds).toEqual(['FOR', 'DEX', 'CON']);
    expect(result.layout).toBe('grid');
  });

  it("utilise les valeurs par défaut pour les parties manquantes", () => {
    const result = parseWidgetId('custom_group');
    expect(result.label).toBe('');
    expect(result.fieldIds).toEqual([]);
    expect(result.styleOption).toBe('separated');
    expect(result.justify).toBe('stretch');
  });

  it("un type inconnu est traité comme custom_group", () => {
    const result = parseWidgetId('module:quelquechose');
    expect(result.baseType).toBe('custom_group');
  });
});

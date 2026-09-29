/**
 * Grille uniforme en format compact (CSR) : `start[c]..start[c + 1]` donne, dans `items`, les
 * éléments de la case c, en ordre croissant d'indice. Construite en deux passes (comptage puis
 * remplissage), sans tableau par case.
 */

export class Grid {
  readonly minX: number;
  readonly minY: number;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly start: Int32Array;
  readonly items: Int32Array;

  constructor(
    minX: number,
    minY: number,
    cellSize: number,
    cols: number,
    rows: number,
    start: Int32Array,
    items: Int32Array,
  ) {
    this.minX = minX;
    this.minY = minY;
    this.cellSize = cellSize;
    this.cols = cols;
    this.rows = rows;
    this.start = start;
    this.items = items;
  }

  /** Colonne de x, bornée à la grille. */
  col(x: number): number {
    const c = Math.floor((x - this.minX) / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  /** Ligne de y, bornée à la grille. */
  row(y: number): number {
    const r = Math.floor((y - this.minY) / this.cellSize);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }
}

/** Taille de grille : environ `perCell` éléments par case, au plus `maxDim` cases par côté. */
export function gridDims(
  width: number,
  height: number,
  itemCount: number,
  perCell: number,
  maxDim: number,
  minCell: number,
) {
  const w = Math.max(width, 1e-9);
  const h = Math.max(height, 1e-9);
  let cell = Math.sqrt((w * h * perCell) / Math.max(1, itemCount));
  cell = Math.max(cell, minCell, w / maxDim, h / maxDim);
  const cols = Math.max(1, Math.min(maxDim, Math.ceil(w / cell)));
  const rows = Math.max(1, Math.min(maxDim, Math.ceil(h / cell)));
  return { cell, cols, rows };
}

/**
 * Cases traversées par chaque élément, sous forme de visiteur : `visit(i, emit)` appelle
 * `emit(case)` pour chaque case de l'élément i (sans doublon).
 */
export type CellVisitor = (item: number, emit: (cell: number) => void) => void;

/** Construit une grille CSR à partir d'un visiteur de cases. */
export function buildGrid(
  minX: number,
  minY: number,
  cellSize: number,
  cols: number,
  rows: number,
  itemCount: number,
  visit: CellVisitor,
): Grid {
  const cellCount = cols * rows;
  const start = new Int32Array(cellCount + 1);
  const count = (c: number) => {
    start[c + 1]!++;
  };
  for (let i = 0; i < itemCount; i++) visit(i, count);
  for (let c = 0; c < cellCount; c++) start[c + 1]! += start[c]!;
  const items = new Int32Array(start[cellCount]!);
  const fill = start.slice(0, cellCount);
  let current = 0;
  const put = (c: number) => {
    items[fill[c]!++] = current;
  };
  for (let i = 0; i < itemCount; i++) {
    current = i;
    visit(i, put);
  }
  return new Grid(minX, minY, cellSize, cols, rows, start, items);
}

/** Visiteur des cases d'une boîte [x1, x2] × [y1, y2] (bornée à la grille). */
export function visitBox(
  grid: { col(x: number): number; row(y: number): number; cols: number },
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  emit: (cell: number) => void,
) {
  const c1 = grid.col(x1);
  const c2 = grid.col(x2);
  const r1 = grid.row(y1);
  const r2 = grid.row(y2);
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) emit(r * grid.cols + c);
  }
}

/**
 * Visiteur des cases traversées par le segment [a, b] élargi de `margin` : ligne par ligne,
 * on prend l'intervalle en x du segment sur la hauteur de la ligne. Conservatif : une case
 * touchée à `margin` près est incluse.
 */
export function visitSegment(
  grid: {
    col(x: number): number;
    row(y: number): number;
    cols: number;
    minY: number;
    cellSize: number;
  },
  ax: number,
  ay: number,
  bx: number,
  by: number,
  margin: number,
  emit: (cell: number) => void,
) {
  // Toujours du haut vers le bas.
  if (ay > by) {
    let t = ax;
    ax = bx;
    bx = t;
    t = ay;
    ay = by;
    by = t;
  }
  const r1 = grid.row(ay - margin);
  const r2 = grid.row(by + margin);
  const dy = by - ay;
  const dx = bx - ax;
  for (let r = r1; r <= r2; r++) {
    // Portion du segment dans la ligne r (élargie de margin).
    let yTop = grid.minY + r * grid.cellSize - margin;
    let yBot = grid.minY + (r + 1) * grid.cellSize + margin;
    if (yTop < ay) yTop = ay;
    if (yBot > by) yBot = by;
    let xa: number;
    let xb: number;
    if (dy === 0) {
      xa = ax;
      xb = bx;
    } else {
      xa = ax + (dx * (yTop - ay)) / dy;
      xb = ax + (dx * (yBot - ay)) / dy;
    }
    if (xa > xb) {
      const t = xa;
      xa = xb;
      xb = t;
    }
    const c1 = grid.col(xa - margin);
    const c2 = grid.col(xb + margin);
    for (let c = c1; c <= c2; c++) emit(r * grid.cols + c);
  }
}

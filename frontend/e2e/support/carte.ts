/**
 * La carte est un canevas WebGL : ces aides lisent l'état du moteur (exposé en développement par
 * `lib/map/active-map.ts`) et convertissent les coordonnées du monde en position à l'écran pour
 * les gestes à la souris.
 */
import { expect, type Page } from '@playwright/test';

interface Point {
  x: number;
  y: number;
}

/** La carte est montée et ses éléments chargés. */
export async function carteChargee(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const w = window as unknown as {
            __vttActiveMap?: { getState(): { engine: { mounted: boolean } | null } };
          };
          return w.__vttActiveMap?.getState().engine?.mounted ?? false;
        }),
      { timeout: 30_000, message: 'la carte se monte' },
    )
    .toBe(true);
}

/** Donnée d'un élément de la carte (token, porte…) dans le magasin du moteur, ou null. */
export function donnee<T = Record<string, unknown>>(
  page: Page,
  collection: string,
  id: string,
): Promise<T | null> {
  return page.evaluate(
    ([c, i]) => {
      const w = window as unknown as {
        __vttActiveMap?: {
          getState(): {
            engine: {
              store: { getState(): { collections: Record<string, Map<string, unknown>> } };
            } | null;
          };
        };
      };
      const engine = w.__vttActiveMap?.getState().engine;
      return (engine?.store.getState().collections[c!]?.get(i!) as never) ?? null;
    },
    [collection, id],
  );
}

/** Éléments d'une collection de la carte. */
export function elements<T = Record<string, unknown>>(
  page: Page,
  collection: string,
): Promise<T[]> {
  return page.evaluate((c) => {
    const w = window as unknown as {
      __vttActiveMap?: {
        getState(): {
          engine: {
            store: { getState(): { collections: Record<string, Map<string, unknown>> } };
          } | null;
        };
      };
    };
    const items = w.__vttActiveMap?.getState().engine?.store.getState().collections[c];
    return (items ? [...items.values()] : []) as never;
  }, collection);
}

/** Scène affichée (taille, brouillard total…). */
export function scene<T = Record<string, unknown>>(page: Page): Promise<T | null> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __vttActiveMap?: {
        getState(): { engine: { store: { getState(): { scene: unknown } } } | null };
      };
    };
    return (w.__vttActiveMap?.getState().engine?.store.getState().scene as never) ?? null;
  });
}

/** Position à l'écran (pixels de la page) d'un point du monde. */
export async function aLEcran(page: Page, monde: Point): Promise<Point> {
  const local = await page.evaluate((p) => {
    const w = window as unknown as {
      __vttActiveMap?: {
        getState(): {
          engine: { camera: { worldToScreen(p: Point): Point }; canvas: HTMLCanvasElement | null };
        };
      };
    };
    const engine = w.__vttActiveMap!.getState().engine;
    const s = engine.camera.worldToScreen(p);
    const r = engine.canvas!.getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y };
  }, monde);
  return local;
}

/** Glisser à la souris d'un point du monde à un autre, en plusieurs pas. */
export async function glisser(page: Page, de: Point, vers: Point) {
  const a = await aLEcran(page, de);
  const b = await aLEcran(page, vers);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

/** Centre d'un élément de la carte, en coordonnées du monde (tel que ce navigateur le voit). */
export function centre(page: Page, id: string): Promise<Point> {
  return page.evaluate((i) => {
    const w = window as unknown as {
      __vttActiveMap?: {
        getState(): { engine: { entity(id: string): { current: Point } | undefined } | null };
      };
    };
    const c = w.__vttActiveMap!.getState().engine!.entity(i)!.current;
    return { x: c.x, y: c.y };
  }, id);
}

/** Note les pings reçus par ce navigateur (lus ensuite par `pingsRecus`). */
export async function ecouterPings(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __vttPings?: unknown[];
      __vttActiveMap?: {
        getState(): {
          engine: { live: { onPing(l: (p: unknown) => void): () => void } | null } | null;
        };
      };
    };
    w.__vttPings = [];
    w.__vttActiveMap!.getState().engine!.live!.onPing((p) => w.__vttPings!.push(p));
  });
}

export function pingsRecus(page: Page): Promise<{ x: number; y: number; focus: boolean }[]> {
  return page.evaluate(
    () => ((window as unknown as { __vttPings?: never[] }).__vttPings ?? []) as never,
  );
}

/** Ping du MJ (Alt + clic dans l'app), par le moteur : centré chez les joueurs si `focus`. */
export function pinger(page: Page, p: Point, focus = false) {
  return page.evaluate(
    ([pt, f]) => {
      const w = window as unknown as {
        __vttActiveMap?: {
          getState(): { engine: { ping(p: Point, focus: boolean): void } | null };
        };
      };
      w.__vttActiveMap!.getState().engine!.ping(pt as Point, f as boolean);
    },
    [p, focus] as const,
  );
}

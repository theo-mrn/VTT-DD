import { TextDecoder as NodeTextDecoder } from 'node:util';
// jsdom n'expose pas TextDecoder (dispo nativement dans tous les navigateurs ciblés) — polyfill
// AVANT l'import de zip.ts, qui l'utilise pour décoder table.json et les scripts.
(globalThis as { TextDecoder?: unknown }).TextDecoder ??= NodeTextDecoder;

import { zipSync, strToU8 } from 'fflate';
import { readRoomExportZip, rewriteBundleAssetRefs, rewriteCssAssetRefs, slugifyBundleName } from '../zip';

// Fabrique un objet "File" minimal (jsdom n'implémente pas toujours File.arrayBuffer) — seuls
// name/slice/arrayBuffer sont consommés par zip.ts.
function fakeZipFile(entries: Record<string, Uint8Array>, name = 'bundle.zip'): File {
  const bytes = zipSync(entries);
  return {
    name,
    slice: (start: number, end: number) => ({
      arrayBuffer: async () => bytes.slice(start, end).buffer,
    }),
    arrayBuffer: async () => bytes.slice().buffer,
  } as unknown as File;
}

const minimalTableJson = JSON.stringify({
  gameSystem: {
    name: 'Star Wars',
    stats: [{ key: 'FOR', label: 'FOR', category: 'ability', dataType: 'number', origin: 'module' }],
  },
});

describe('readRoomExportZip', () => {
  test('layout canonique : table.json + assets/ + scripts/ classés correctement', async () => {
    const file = fakeZipFile({
      'table.json': strToU8(minimalTableJson),
      'assets/images/wookiee.png': new Uint8Array([1, 2, 3]),
      'assets/fonts/aurebesh.woff2': new Uint8Array([4, 5]),
      'scripts/main.tsx': strToU8('export default () => {}'),
      'styles/theme.css': strToU8(':root { --accent-brown: red; }'),
      'assets/notes.txt': strToU8('ignoré'),
    });
    const parsed = await readRoomExportZip(file);
    expect(parsed.bundle.gameSystem?.name).toBe('Star Wars');
    expect([...parsed.assets.keys()].sort()).toEqual(['assets/fonts/aurebesh.woff2', 'assets/images/wookiee.png']);
    expect(parsed.scripts.get('scripts/main.tsx')).toBe('export default () => {}');
    expect(parsed.styles.get('styles/theme.css')).toBe(':root { --accent-brown: red; }');
  });

  test('zip du DOSSIER entier (préfixe racine unique) : le préfixe est déroulé', async () => {
    const file = fakeZipFile({
      'starwars-bundle/table.json': strToU8(minimalTableJson),
      'starwars-bundle/assets/images/x.png': new Uint8Array([1]),
    });
    const parsed = await readRoomExportZip(file);
    expect(parsed.bundle.gameSystem?.name).toBe('Star Wars');
    expect(parsed.assets.has('assets/images/x.png')).toBe(true);
  });

  test('métadonnées macOS (__MACOSX/, .DS_Store) ignorées', async () => {
    const file = fakeZipFile({
      'table.json': strToU8(minimalTableJson),
      '__MACOSX/table.json': new Uint8Array([0]),
      'assets/images/.DS_Store': new Uint8Array([0]),
    });
    const parsed = await readRoomExportZip(file);
    expect(parsed.assets.size).toBe(0);
  });

  test('aucun JSON racine => erreur explicite', async () => {
    const file = fakeZipFile({ 'assets/images/x.png': new Uint8Array([1]) });
    await expect(readRoomExportZip(file)).rejects.toThrow('aucun table.json');
  });

  test("plusieurs JSON racine sans table.json => erreur ; avec table.json => c'est lui qui gagne", async () => {
    const twoJson = fakeZipFile({
      'a.json': strToU8(minimalTableJson),
      'b.json': strToU8(minimalTableJson),
    });
    await expect(readRoomExportZip(twoJson)).rejects.toThrow('plusieurs JSON');

    const withTable = fakeZipFile({
      'table.json': strToU8(minimalTableJson),
      'autre.json': strToU8('{}'),
    });
    const parsed = await readRoomExportZip(withTable);
    expect(parsed.bundle.gameSystem?.name).toBe('Star Wars');
  });
});

describe('rewriteBundleAssetRefs', () => {
  const urls = new Map([
    ['assets/images/wookiee.png', 'https://assets.yner.fr/bundles/u1/star-wars/assets/images/wookiee.png'],
    ['assets/fonts/aurebesh.woff2', 'https://assets.yner.fr/bundles/u1/star-wars/assets/fonts/aurebesh.woff2'],
  ]);

  test('réécrit en profondeur (objets, tableaux) y compris avec préfixe ./', () => {
    const input = {
      races: [{ label: 'Wookiee', image: 'assets/images/wookiee.png' }],
      typography: { fonts: [{ family: 'Aurebesh', src: './assets/fonts/aurebesh.woff2' }] },
    };
    const out = rewriteBundleAssetRefs(input, urls);
    expect(out.races[0].image).toBe('https://assets.yner.fr/bundles/u1/star-wars/assets/images/wookiee.png');
    expect(out.typography.fonts[0].src).toBe('https://assets.yner.fr/bundles/u1/star-wars/assets/fonts/aurebesh.woff2');
  });

  test('strings non-matchées, nombres, null et booléens inchangés — jamais d\'undefined introduit', () => {
    const input = { a: 'assets/images/absent.png', b: 'https://deja-une-url.fr/x.png', c: 3, d: null, e: true };
    const out = rewriteBundleAssetRefs(input, urls);
    expect(out).toEqual(input);
    expect(Object.values(out).includes(undefined as never)).toBe(false);
  });
});

describe('rewriteCssAssetRefs', () => {
  const urls = new Map([['assets/images/bg.jpg', 'https://assets.yner.fr/bundles/u1/sw/assets/images/bg.jpg']]);

  test('réécrit les chemins dans les expressions url(), avec ou sans ./ et guillemets — sans double remplacement', () => {
    const css = `.a { background: url(assets/images/bg.jpg); } .b { background: url("./assets/images/bg.jpg"); }`;
    const out = rewriteCssAssetRefs(css, urls);
    expect(out).toBe(
      `.a { background: url(https://assets.yner.fr/bundles/u1/sw/assets/images/bg.jpg); } ` +
      `.b { background: url("https://assets.yner.fr/bundles/u1/sw/assets/images/bg.jpg"); }`
    );
  });

  test('CSS sans référence inchangé', () => {
    const css = ':root { --x: red; }';
    expect(rewriteCssAssetRefs(css, urls)).toBe(css);
  });
});

describe('slugifyBundleName', () => {
  test('minuscules, diacritiques retirés, séparateurs en tirets', () => {
    expect(slugifyBundleName('Star Wars — Aux Confins de l\'Empire')).toBe('star-wars-aux-confins-de-l-empire');
    expect(slugifyBundleName('Éclats d\'Étoiles !!')).toBe('eclats-d-etoiles');
  });
  test('nom vide ou sans caractère utile => "bundle"', () => {
    expect(slugifyBundleName('')).toBe('bundle');
    expect(slugifyBundleName('***')).toBe('bundle');
  });
});

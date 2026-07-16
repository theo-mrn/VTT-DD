import { resolvePathDocId } from '../legacy';

describe('resolvePathDocId — rétrocompat des champs VoieN legacy (noms de fichiers) vers ids de docs', () => {
  test('nom de fichier de voie de classe', () => {
    expect(resolvePathDocId('Barbare1.json')).toBe('barbare1');
    expect(resolvePathDocId('Voleur5.json')).toBe('voleur5');
  });

  test('nom de fichier de voie raciale (avec tiret)', () => {
    expect(resolvePathDocId('Ame-forgee.json')).toBe('ame-forgee');
    expect(resolvePathDocId('Elfesylvain.json')).toBe('elfesylvain');
  });

  test('nom de fichier de voie de prestige (avec underscore)', () => {
    expect(resolvePathDocId('prestige_barde2.json')).toBe('prestige_barde2');
  });

  test('strip les accents (normalisation NFD + diacritiques)', () => {
    expect(resolvePathDocId('Précepteur.json')).toBe('precepteur');
    expect(resolvePathDocId('Âme-forgée.json')).toBe('ame-forgee');
  });

  test('idempotent : un id déjà résolu ressort identique', () => {
    expect(resolvePathDocId(resolvePathDocId('Barbare1.json'))).toBe('barbare1');
    expect(resolvePathDocId('barbare1')).toBe('barbare1');
  });

  test('insensible à la casse de l\'extension et aux espaces parasites', () => {
    expect(resolvePathDocId('Barbare1.JSON')).toBe('barbare1');
    expect(resolvePathDocId(' Barbare1.json ')).toBe('barbare1');
  });
});

import { describe, expect, it } from 'vitest';
import { upcomingRows } from './initiative-strip';

const row = (id: string, o: { current?: boolean; defeated?: boolean } = {}) => ({
  id,
  current: o.current ?? false,
  defeated: o.defeated ?? false,
});

describe('bandeau du MJ : qui agit, puis les suivants', () => {
  it('les suivants repartent du début de l’ordre, sans les hors de combat', () => {
    const rows = [row('a'), row('b', { defeated: true }), row('c', { current: true }), row('d')];
    const r = upcomingRows(rows);
    expect(r.current?.id).toBe('c');
    expect(r.next.map((x) => x.id)).toEqual(['d', 'a']);
    expect(r.more).toBe(0);
  });

  it('au-delà de la limite : « +n »', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => row(id, { current: i === 0 }));
    const r = upcomingRows(rows, 4);
    expect(r.next.map((x) => x.id)).toEqual(['b', 'c', 'd', 'e']);
    expect(r.more).toBe(2);
  });

  it('sans tour courant : les premiers de l’ordre', () => {
    const r = upcomingRows([row('a'), row('b')]);
    expect(r.current).toBeNull();
    expect(r.next.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

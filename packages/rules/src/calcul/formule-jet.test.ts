import { describe, expect, it } from 'vitest';
import { charger, type SystemeCharge } from '../chargement/index.js';
import type { SystemeSaisi } from '../schema/index.js';
import { miniD20 } from '../test/mini-systemes.js';
import { normaliserFormuleJet, termesAttributs } from './formule-jet.js';

type AttributSaisi = SystemeSaisi['entites'][number]['attributs'][number];

/** Mini d20 : FOR, DEX et CON au modificateur, Contact à la valeur, Defense en formule. */
function systeme(): SystemeCharge {
  const s = structuredClone(miniD20);
  const jets: Record<string, Partial<AttributSaisi>> = {
    FOR: { jet: { apport: 'modificateur' } },
    DEX: { jet: { apport: 'modificateur' } },
    CON: { jet: { apport: 'modificateur' } },
    Contact: { jet: { apport: 'valeur' } },
    Defense: { jet: { apport: 'mod(@DEX) + @niveau' } },
  };
  const e = s.entites[0]!;
  e.attributs = e.attributs.map((a) =>
    jets[a.cle] ? ({ ...a, ...jets[a.cle] } as AttributSaisi) : a,
  );
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}

const s = systeme();
const norm = (f: string) => {
  const r = normaliserFormuleJet(s, 'personnage', f);
  return r.ok ? r.formule : `ERREUR ${r.erreur.message} @${r.erreur.position}`;
};

describe('normaliserFormuleJet', () => {
  it('remplace une clé nue par le terme déclaré', () => {
    expect(norm('1d20+CON')).toBe('1d20+mod(@CON)');
    expect(norm('1d20 + Contact')).toBe('1d20 + @Contact');
    expect(norm('1d6-CON+8')).toBe('1d6-mod(@CON)+8');
    expect(norm('1d20+Defense')).toBe('1d20+(mod(@DEX) + @niveau)');
  });

  it('prend la valeur d’un attribut sans déclaration de jet', () => {
    expect(norm('1d20+niveau')).toBe('1d20+@niveau');
    expect(norm('PV_Max / 2')).toBe('@PV_Max / 2');
  });

  it('laisse les formes explicites, les dés et les fonctions', () => {
    expect(norm('1d20 + @CON + mod(@DEX)')).toBe('1d20 + @CON + mod(@DEX)');
    expect(norm('4d6k3 + 2d20kl1 + d8 + 1d6!')).toBe('4d6k3 + 2d20kl1 + d8 + 1d6!');
    expect(norm('max(1d6, 2) + FOR')).toBe('max(1d6, 2) + mod(@FOR)');
    expect(norm('si(vrai, 1, 0)')).toBe('si(vrai, 1, 0)');
  });

  it('découpe par jetons : Contact n’est pas CON, d20 n’est pas un attribut', () => {
    expect(norm('Contact+CON')).toBe('@Contact+mod(@CON)');
    expect(norm('d20+CON')).toBe('d20+mod(@CON)');
    expect(norm('CON*2')).toBe('mod(@CON)*2');
  });

  it('tolère la casse quand elle est sans ambiguïté', () => {
    expect(norm('1d20+con')).toBe('1d20+mod(@CON)');
    expect(norm('1d20+contact')).toBe('1d20+@Contact');
  });

  it('refuse une clé inconnue, avec sa position', () => {
    expect(norm('1d20+CONTACT2')).toBe(
      'ERREUR « CONTACT2 » n’est pas un attribut du personnage @5',
    );
    expect(norm('1d20+arme.degats')).toMatch(/^ERREUR « arme\.degats »/);
  });

  it('rend l’erreur de découpage telle quelle', () => {
    expect(norm('1d20 + #')).toBe('ERREUR Caractère inattendu « # » @7');
  });

  it('type d’entité inconnu : erreur lisible sur la première clé nue', () => {
    const r = normaliserFormuleJet(s, 'dragon', '1d20+CON');
    expect(r).toEqual({
      ok: false,
      erreur: { message: 'Type d’entité inconnu : dragon', position: 5 },
    });
    expect(normaliserFormuleJet(s, 'dragon', '2d6+3')).toEqual({ ok: true, formule: '2d6+3' });
  });
});

describe('termesAttributs', () => {
  it('repère @CLE et mod(@CLE) avec leur étendue', () => {
    const f = '1d20+mod(@CON)+@Contact-@cible.ENC';
    expect(termesAttributs(f)).toEqual([
      { debut: 5, fin: 14, cle: 'CON', modificateur: true },
      { debut: 15, fin: 23, cle: 'Contact', modificateur: false },
    ]);
    expect(f.slice(5, 14)).toBe('mod(@CON)');
    expect(f.slice(15, 23)).toBe('@Contact');
  });

  it('formule illisible : aucun terme', () => {
    expect(termesAttributs('1d20 + #')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { nomDiscordDuJeton } from './discord';

const jeton = (charge: unknown) =>
  `e30.${Buffer.from(JSON.stringify(charge)).toString('base64url')}.signature`;

describe('jeton de liaison Discord', () => {
  it('lit le nom Discord, accents compris', () => {
    expect(nomDiscordDuJeton(jeton({ sub: '1', name: 'Théo' }))).toBe('Théo');
  });

  it('null sans nom ou pour un jeton illisible', () => {
    expect(nomDiscordDuJeton(jeton({ sub: '1' }))).toBeNull();
    expect(nomDiscordDuJeton('pas-un-jeton')).toBeNull();
  });
});

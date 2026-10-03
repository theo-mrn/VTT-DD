import { describe, expect, it } from 'vitest';
import { erreurJournalisable } from './error-handler.js';

describe('erreurJournalisable', () => {
  it('retire les paramètres SQL du message, de la pile et de la cause', () => {
    const cause = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint: 'users_email_unique',
      table: 'users',
    });
    const err = Object.assign(
      new Error('Failed query: insert into credentials values ($1)\nparams: $argon2id$v=19$secret'),
      { cause, params: ['$argon2id$v=19$secret'] },
    );
    const journal = JSON.stringify(erreurJournalisable(err));
    expect(journal).not.toContain('secret');
    expect(journal).toContain('Failed query: insert into credentials');
    expect(journal).toContain('users_email_unique');
    expect(journal).toContain('23505');
  });

  it('gère une valeur qui n’est pas une Error', () => {
    expect(erreurJournalisable('boum')).toEqual({ message: 'boum' });
  });
});

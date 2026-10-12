import { describe, expect, it } from 'vitest';
import { normalizePoll, poll, pollActions } from './state';

describe('sondage', () => {
  it('écarte un sondage à moins de deux choix', () => {
    expect(normalizePoll({ id: 'a', options: ['Seul'] })).toBeNull();
    expect(normalizePoll({ id: 'a', options: ['Oui', 'Non'] })?.counts).toEqual([0, 0]);
  });

  it('une voix par votant, la dernière compte ; plus rien une fois clos', () => {
    pollActions.start('On va où ?', ['Forêt', 'Ville']);
    const id = poll.store.getState().value!.id;
    pollActions.tally(id, 'u1', 0);
    pollActions.tally(id, 'u2', 0);
    pollActions.tally(id, 'u1', 1);
    expect(poll.store.getState().value!.counts).toEqual([1, 1]);
    pollActions.close();
    pollActions.tally(id, 'u3', 0);
    expect(poll.store.getState().value!.counts).toEqual([1, 1]);
    pollActions.clear();
    expect(poll.store.getState().value).toBeNull();
  });
});

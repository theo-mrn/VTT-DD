import { describe, expect, it } from 'vitest';
import { parseNatsUrl } from './bus.js';

describe('parseNatsUrl', () => {
  it('sépare les identifiants de l’adresse (nats.js les ignore dans l’URL)', () => {
    expect(parseNatsUrl('nats://vtt-staging:p%2Fs3cr3t@nats.messaging.svc:4222')).toEqual({
      servers: ['nats://nats.messaging.svc:4222'],
      user: 'vtt-staging',
      pass: 'p/s3cr3t',
    });
  });

  it('accepte plusieurs serveurs et les adresses sans identifiants ni schéma', () => {
    expect(parseNatsUrl('nats://a:4222, b:4223')).toEqual({
      servers: ['nats://a:4222', 'nats://b:4223'],
    });
  });
});

import { HttpError } from '@vtt/platform';

/** Service voisin injoignable : 503 `<service>_unavailable`, jamais un droit ouvert par défaut. */
export function unavailable(service: string): HttpError {
  return new HttpError(
    503,
    'Service indisponible',
    `${service}_unavailable`,
    `Le service ${service} ne répond pas`,
  );
}

/** Sonde de vie et de disponibilité du serveur Next (Kubernetes) : aucune dépendance. */
export const dynamic = 'force-static';

export function GET() {
  return new Response('ok', { headers: { 'cache-control': 'no-store' } });
}

// Sonde Kubernetes : répond sans toucher Firebase ni aucune dépendance externe.
export const dynamic = "force-dynamic";

export function GET() {
    return Response.json({ status: "ok" });
}

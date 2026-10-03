import { NextRequest, NextResponse } from "next/server";
import { resolveApiUser } from "@/lib/api-auth";
import { fetchAllowedRemote, parseAllowedRemoteUrl } from "@/lib/remote-url";

export async function GET(req: NextRequest) {
    const user = await resolveApiUser(req);
    if (!user) {
        return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const url = parseAllowedRemoteUrl(req.nextUrl.searchParams.get("url"));
    if (!url) {
        return NextResponse.json({ error: "URL manquante ou hôte non autorisé" }, { status: 400 });
    }

    try {
        // HEAD d'abord : léger
        const head = await fetchAllowedRemote(url, { method: "HEAD" });
        const cl = head.headers.get("content-length");
        if (cl) {
            return NextResponse.json({ size: parseInt(cl, 10) });
        }

        // Repli : GET et comptage des octets
        const get = await fetchAllowedRemote(url);
        const buffer = await get.arrayBuffer();
        return NextResponse.json({ size: buffer.byteLength });
    } catch (err) {
        // Pas de détail de l'erreur réseau au client : il permettrait de sonder le réseau
        console.error("Erreur de /api/file-size", err);
        return NextResponse.json({ error: "Fichier inaccessible" }, { status: 502 });
    }
}

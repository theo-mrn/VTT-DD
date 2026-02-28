import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get("url");
    if (!url) {
        return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    try {
        // HEAD first — lightweight
        const head = await fetch(url, { method: "HEAD" });
        const cl = head.headers.get("content-length");
        if (cl) {
            return NextResponse.json({ size: parseInt(cl, 10) });
        }

        // Fallback: GET and count bytes without storing the whole body
        const get = await fetch(url);
        const buffer = await get.arrayBuffer();
        return NextResponse.json({ size: buffer.byteLength });
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 502 });
    }
}

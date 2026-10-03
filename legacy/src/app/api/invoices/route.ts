import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as any,
});

export async function POST(req: Request) {
    try {
        const { stripeCustomerId } = await req.json();

        if (!stripeCustomerId) {
            return NextResponse.json({ error: "Missing stripeCustomerId" }, { status: 400 });
        }

        const invoices = await stripe.invoices.list({
            customer: stripeCustomerId,
            limit: 24,
        });

        const formatted = invoices.data.map((inv) => ({
            id: inv.id,
            number: inv.number,
            date: inv.created,
            amount: inv.amount_paid,
            currency: inv.currency,
            status: inv.status,
            description: inv.lines?.data?.[0]?.description || null,
            hostedUrl: inv.hosted_invoice_url,
            pdfUrl: inv.invoice_pdf,
        }));

        return NextResponse.json({ invoices: formatted });
    } catch (error: any) {
        console.error("Invoices fetch error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}

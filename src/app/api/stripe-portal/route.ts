import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as any,
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export async function POST(req: Request) {
    try {
        const { stripeCustomerId, returnUrl = "/" } = await req.json();

        if (!stripeCustomerId) {
            return NextResponse.json({ error: "No customer ID" }, { status: 400 });
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            return_url: `${APP_URL}${returnUrl}`,
        });

        return NextResponse.json({ url: portalSession.url });
    } catch (error: any) {
        console.error("Stripe Portal Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}

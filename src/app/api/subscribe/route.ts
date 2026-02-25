import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as any,
});

// Prix de l'abonnement mensuel (en centimes) : 4,99 € = 499 centimes
const MONTHLY_PRICE_CENTS = 499;

function getAppUrl(req: Request): string {
    // Priorité : variable d'env > header host de la requête (fonctionne en local et en prod)
    const envUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (envUrl) {
        // S'assurer que l'URL a bien le protocole
        return envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;
    }
    // Fallback : reconstruction depuis le header host
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    return `${protocol}://${host}`;
}

export async function POST(req: Request) {
    try {
        const { userId, userEmail, returnUrl = "/" } = await req.json();
        const appUrl = getAppUrl(req);

        // Création d'une session Stripe Checkout en mode "subscription"
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "subscription",
            customer_email: userEmail || undefined,
            line_items: [
                {
                    price_data: {
                        currency: "eur",
                        product_data: {
                            name: "Abonnement Premium VTT-DD",
                            description:
                                "Accès à tous les dés, badge exclusif, soutien au développeur.",
                        },
                        unit_amount: MONTHLY_PRICE_CENTS,
                        recurring: {
                            interval: "month",
                        },
                    },
                    quantity: 1,
                },
            ],
            success_url: `${appUrl}/checkout/subscribe-success?session_id={CHECKOUT_SESSION_ID}&returnUrl=${encodeURIComponent(returnUrl)}`,
            cancel_url: `${appUrl}/checkout/cancel?returnUrl=${encodeURIComponent(returnUrl)}`,
            metadata: {
                userId: userId || "",
                type: "premium_subscription",
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (error: any) {
        console.error("Stripe Subscribe Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}

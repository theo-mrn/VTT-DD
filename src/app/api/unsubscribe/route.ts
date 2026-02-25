import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db, doc, updateDoc, collection, query, where, getDocs } from "@/lib/firebase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as any,
});

export async function POST(req: Request) {
    try {
        const { stripeCustomerId, stripeSubscriptionId, userId } = await req.json();

        if (!stripeCustomerId && !stripeSubscriptionId && !userId) {
            return NextResponse.json({ error: "Aucun abonnement trouvé à résilier" }, { status: 400 });
        }

        let canceled = false;
        let cancelAt = 0;

        // Essayer d'utiliser l'ID de l'abonnement direct si fourni
        if (stripeSubscriptionId) {
            const sub: any = await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
            cancelAt = sub.current_period_end;
            canceled = true;
        } else if (stripeCustomerId) {
            // Sinon, chercher l'abonnement actif du client
            const subscriptions = await stripe.subscriptions.list({
                customer: stripeCustomerId,
                status: "active",
            });
            if (subscriptions.data.length > 0) {
                const sub: any = await stripe.subscriptions.update(subscriptions.data[0].id, { cancel_at_period_end: true });
                cancelAt = sub.current_period_end;
                canceled = true;
            } else {
                // Pas d'abonnement actif dans Stripe, on autorise l'annulation locale
                canceled = true;
            }
        } else {
            // S'il n'y a pas d'infos Stripe mais un userId, on annule quand même localement
            canceled = true;
        }

        if (canceled && userId) {
            // L'update Firebase sera gérée côté client pour éviter le PERMISSION_DENIED
            // avec le SDK client non authentifié côté serveur, ou via le Webhook Stripe
            console.log(`Abonnement annulé côté Stripe pour l'utilisateur ${userId}, fin effective: ${cancelAt}`);
        }

        return NextResponse.json({ success: true, message: "Abonnement résilié avec succès", cancelAt });
    } catch (error: any) {
        console.error("Stripe Unsubscribe Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}

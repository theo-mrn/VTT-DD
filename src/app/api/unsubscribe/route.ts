import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db, doc, updateDoc, collection, query, where, getDocs } from "@/lib/firebase";
import { Resend } from 'resend';
import { PremiumCancelledEmail } from '@/components/emails/premium-cancelled-email';

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
            console.log(`Abonnement annulé côté Stripe pour l'utilisateur ${userId}, fin effective: ${cancelAt}`);

            // Récupération de l'email pour lui envoyer une notification
            try {
                let customerEmail: string | undefined;
                let customerName: string | undefined;

                if (stripeCustomerId) {
                    const customer = await stripe.customers.retrieve(stripeCustomerId);
                    if (!customer.deleted && customer.email) {
                        customerEmail = customer.email;
                        customerName = customer.name || undefined;
                    }
                }

                if (customerEmail) {
                    const resend = new Resend(process.env.RESEND_API_KEY!);

                    const cancelDateFormatted = cancelAt ? new Date(cancelAt * 1000).toLocaleDateString("fr-FR", {
                        day: "numeric", month: "long", year: "numeric",
                    }) : undefined;

                    await resend.emails.send({
                        from: 'contact@yner.fr',
                        to: [customerEmail],
                        subject: "📉 VTT-DD - Résiliation de votre abonnement Premium",
                        react: PremiumCancelledEmail({
                            username: customerName,
                            cancelAtDate: cancelDateFormatted,
                        }),
                    });
                    console.log(`📧 Email d'annulation envoyé à ${customerEmail}`);
                }
            } catch (emailError) {
                console.error("Erreur lors de l'envoi de l'email d'annulation:", emailError);
            }
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

import { NextResponse, NextRequest } from "next/server";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { Resend } from 'resend';
import { PremiumActivatedEmail } from '@/components/emails/premium-activated-email';
import { InvoiceEmail } from '@/components/emails/invoice-email';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature")!;

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
        console.error("Webhook signature verification failed:", err.message);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // Gérer les événements Stripe
    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            const metaType = session.metadata?.type;
            const userId = session.metadata?.userId;

            if (metaType === "premium_subscription" && userId) {
                try {
                    const userRef = adminDb.collection("users").doc(userId);
                    await userRef.update({
                        premium: true,
                        stripeCustomerId: session.customer as string,
                        stripeSubscriptionId: session.subscription as string,
                        premiumSince: new Date().toISOString(),
                    });
                    console.log(`✅ User ${userId} premium activated`);

                    // Envoi de l'email de bienvenue
                    if (session.customer_details?.email) {
                        try {
                            const resend = new Resend(process.env.RESEND_API_KEY!);
                            await resend.emails.send({
                                from: 'contact@yner.fr',
                                to: [session.customer_details.email],
                                subject: "👑 Bienvenue dans le cercle Premium de VTT-DD !",
                                react: PremiumActivatedEmail({
                                    username: session.customer_details.name || "Aventurier",
                                }),
                            });
                            console.log(`📧 Email Premium envoyé avec succès à ${session.customer_details.email}`);
                        } catch (emailError) {
                            console.error("Erreur lors de l'envoi de l'email Premium:", emailError);
                        }
                    }
                } catch (error) {
                    console.error("Error updating user premium status:", error);
                }
            }

            // Achat de dé ou cadre de token
            if ((metaType === "dice" || metaType === "token") && userId && session.metadata?.skinId) {
                const skinId = session.metadata.skinId;
                const field = metaType === "token" ? "token_inventory" : "dice_inventory";
                try {
                    const userRef = adminDb.collection("users").doc(userId);
                    await userRef.update({
                        [field]: FieldValue.arrayUnion(skinId),
                    });
                    console.log(`🎲 User ${userId} received ${metaType}: ${skinId}`);
                } catch (error) {
                    console.error(`Error granting ${metaType} ${skinId}:`, error);
                }
            }
            break;
        }

        case "customer.subscription.deleted": {
            // Abonnement annulé → retirer le premium
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;

            try {
                const snapshot = await adminDb.collection("users")
                    .where("stripeCustomerId", "==", customerId)
                    .get();

                if (!snapshot.empty) {
                    const userDoc = snapshot.docs[0];
                    await adminDb.collection("users").doc(userDoc.id).update({
                        premium: false,
                        stripeSubscriptionId: null,
                        cancelAtPeriodEnd: null,
                        premiumEndDate: null,
                    });
                    console.log(`❌ User ${userDoc.id} premium deactivated`);
                }
            } catch (error) {
                console.error("Error deactivating premium:", error);
            }
            break;
        }

        case "invoice.paid": {
            const invoice = event.data.object as Stripe.Invoice;
            const customerEmail = invoice.customer_email;

            if (customerEmail && invoice.hosted_invoice_url) {
                try {
                    const resend = new Resend(process.env.RESEND_API_KEY!);
                    const amountFormatted = ((invoice.amount_paid ?? 0) / 100).toFixed(2).replace('.', ',') + ' €';
                    const lineDesc = invoice.lines?.data?.[0]?.description || 'VTT-DD';

                    await resend.emails.send({
                        from: 'contact@yner.fr',
                        to: [customerEmail],
                        subject: `🧾 VTT-DD - Facture #${invoice.number || 'N/A'}`,
                        react: InvoiceEmail({
                            username: invoice.customer_name || 'Aventurier',
                            invoiceNumber: invoice.number || undefined,
                            amount: amountFormatted,
                            description: lineDesc,
                            invoiceUrl: invoice.hosted_invoice_url,
                            pdfUrl: invoice.invoice_pdf || undefined,
                        }),
                    });
                    console.log(`🧾 Facture envoyée à ${customerEmail} (${invoice.number})`);
                } catch (emailError) {
                    console.error("Erreur envoi facture email:", emailError);
                }
            }
            break;
        }

        case "invoice.payment_failed": {
            console.warn("Payment failed for subscription:", event.data.object);
            break;
        }

        default:
            console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
}

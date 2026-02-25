import { NextResponse, NextRequest } from "next/server";
import Stripe from "stripe";
import { db, doc, updateDoc, getDocs, query, collection, where } from "@/lib/firebase";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// IMPORTANT : désactiver le body parser de Next.js pour les webhooks Stripe
// afin de recevoir le body brut (nécessaire pour la vérification de signature)
export const config = {
    api: {
        bodyParser: false,
    },
};

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
            if (session.metadata?.type === "premium_subscription" && session.metadata?.userId) {
                const userId = session.metadata.userId;
                try {
                    const userRef = doc(db, "users", userId);
                    await updateDoc(userRef, {
                        premium: true,
                        stripeCustomerId: session.customer as string,
                        stripeSubscriptionId: session.subscription as string,
                        premiumSince: new Date().toISOString(),
                    });
                    console.log(`✅ User ${userId} premium activated`);
                } catch (error) {
                    console.error("Error updating user premium status:", error);
                }
            }
            break;
        }

        case "customer.subscription.deleted": {
            // Abonnement annulé → retirer le premium
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;

            try {
                const usersRef = collection(db, "users");
                const q = query(usersRef, where("stripeCustomerId", "==", customerId));
                const snapshot = await getDocs(q);

                if (!snapshot.empty) {
                    const userDoc = snapshot.docs[0];
                    await updateDoc(doc(db, "users", userDoc.id), {
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

        case "invoice.payment_failed": {
            console.warn("Payment failed for subscription:", event.data.object);
            break;
        }

        default:
            console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
}


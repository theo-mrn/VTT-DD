import { NextResponse } from "next/server";
import Stripe from "stripe";
import { DICE_SKINS } from "@/components/(dices)/dice-definitions";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as any, // fallback or exact
});

export async function POST(req: Request) {
    try {
        const { skinId, returnUrl = '/' } = await req.json();

        const skin = DICE_SKINS[skinId];

        if (!skin) {
            return NextResponse.json(
                { error: "Skin not found" },
                { status: 404 }
            );
        }

        if (skin.price <= 0) {
            return NextResponse.json(
                { error: "This item is free" },
                { status: 400 }
            );
        }

        // Convert price to cents since Stripe expects smallest currency unit. E.g €5.00 -> 500
        // If the original price is already treated as an integer like '500' meaning 500 gold coins,
        // assuming here standard mapping of 1 "price unit" = 1 cent or base conversion.
        // If we consider 1 gold = 1 cent, then price is exactly as-is.
        const unitAmount = skin.price;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "eur",
                        product_data: {
                            name: `Dés : ${skin.name}`,
                            description: skin.description,
                            images: skin.textureMap ? [skin.textureMap] : [],
                        },
                        unit_amount: unitAmount,
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/checkout/success?session_id={CHECKOUT_SESSION_ID}&skin_id=${skin.id}&returnUrl=${encodeURIComponent(returnUrl)}`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/checkout/cancel?returnUrl=${encodeURIComponent(returnUrl)}`,
            metadata: {
                skinId: skin.id,
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (error: any) {
        console.error("Stripe Checkout Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}

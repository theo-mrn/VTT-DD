import { NextResponse } from "next/server";
import Stripe from "stripe";
import { DICE_SKINS } from "@/components/(dices)/dice-definitions";
import { TOKEN_DEFINITIONS } from "@/components/(fiches)/token-definitions";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-01-27.acacia" as any, // fallback or exact
});

export async function POST(req: Request) {
    try {
        const { skinId, returnUrl = '/' } = await req.json();

        let item: { id: string, name: string, price: number, description?: string, type: 'dice' | 'token', image?: string };

        if (skinId.startsWith('token_')) {
            const tokenId = skinId.replace('token_', '');
            const token = TOKEN_DEFINITIONS[tokenId];
            if (!token) {
                return NextResponse.json({ error: "Token not found" }, { status: 404 });
            }
            item = {
                id: token.id,
                name: token.name,
                price: token.price,
                description: token.description,
                type: 'token'
            };
        } else {
            const skin = DICE_SKINS[skinId];
            if (!skin) {
                return NextResponse.json({ error: "Skin not found" }, { status: 404 });
            }
            item = {
                id: skin.id,
                name: skin.name,
                price: skin.price,
                description: skin.description,
                type: 'dice',
                image: skin.textureMap
            };
        }

        if (item.price <= 0) {
            return NextResponse.json(
                { error: "This item is free" },
                { status: 400 }
            );
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "eur",
                        product_data: {
                            name: item.type === 'dice' ? `Dés : ${item.name}` : `Cadre : ${item.name}`,
                            description: item.description,
                            images: item.image ? [item.image] : [],
                        },
                        unit_amount: item.price,
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/checkout/success?session_id={CHECKOUT_SESSION_ID}&skin_id=${item.id}&type=${item.type}&returnUrl=${encodeURIComponent(returnUrl)}`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/checkout/cancel?returnUrl=${encodeURIComponent(returnUrl)}`,
            metadata: {
                skinId: item.id,
                type: item.type,
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

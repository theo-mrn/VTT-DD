import { verifyKey } from 'discord-interactions';
import { waitUntil } from '@vercel/functions';

export async function POST(request: Request) {
    const body      = await request.text();
    const signature = request.headers.get('x-signature-ed25519') ?? '';
    const timestamp = request.headers.get('x-signature-timestamp') ?? '';

    const isValid = await verifyKey(body, signature, timestamp, process.env.DISCORD_PUBLIC_KEY ?? '');
    if (!isValid) return new Response('Invalid signature', { status: 401 });

    const interaction = JSON.parse(body);

    // PING — Discord vérifie l'endpoint
    if (interaction.type === 1) return Response.json({ type: 1 });

    // APPLICATION_COMMAND — déléguer au handler Node.js
    if (interaction.type === 2) {
        const name     = interaction.data?.name ?? '';
        const options  = interaction.data?.options ?? [];
        const typeOpt  = options.find((o: any) => o.name === 'type')?.value ?? 'public';
        const rawInput = options.find((o: any) => o.name === 'notation')?.value ?? '';
        const suffix   = rawInput.match(/\s+([pi])$/i)?.[1]?.toLowerCase();

        const isEphemeral =
            ['login', 'link', 'unlink'].includes(name) ||
            suffix === 'p' || suffix === 'i' ||
            typeOpt === 'prive' || typeOpt === 'aveugle';

        // Déclencher le handler en background (ne pas attendre la réponse)
        waitUntil(
            fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/discord/handle`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-discord-secret': process.env.DISCORD_TOKEN ?? '',
                },
                body,
            })
        );

        return Response.json({
            type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
            ...(isEphemeral ? { data: { flags: 64 } } : {}),
        });
    }

    return new Response('Unknown interaction', { status: 400 });
}

import { SignUpEmailTemplate } from '@/components/emails/sign-up-email-template';
import { Resend } from 'resend';

export async function POST(request: Request) {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
        console.error("RESEND_API_KEY is missing in environment variables.");
        return Response.json(
            { error: 'Server misconfiguration: Missing RESEND_API_KEY' },
            { status: 500 }
        );
    }

    const resend = new Resend(apiKey);

    try {
        const body = await request.json();
        const { to, username } = body;

        if (!to) {
            return Response.json(
                { error: 'Missing recipient email ("to")' },
                { status: 400 }
            );
        }

        console.log(`Sending sign-up email to ${to} for ${username}`);

        const { data, error } = await resend.emails.send({
            from: 'contact@yner.fr',
            to: [to],
            subject: `⚔️ Bienvenue sur VTT-DD, ${username || 'Aventurier'} !`,
            react: SignUpEmailTemplate({
                username: username || 'Aventurier',
            }),
        });

        if (error) {
            console.error("Resend API returned error:", error);
            return Response.json({ error }, { status: 500 });
        }

        console.log("Sign-up email sent successfully:", data);
        return Response.json(data);
    } catch (error) {
        console.error("Unexpected error in /api/sent-sign-up:", error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

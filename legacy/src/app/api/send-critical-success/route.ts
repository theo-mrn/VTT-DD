import { CriticalSuccessEmailTemplate } from '@/components/emails/critical-success-email-template';
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
        const { to, firstName, rollDetails, campaignName } = body;

        if (!to) {
            return Response.json(
                { error: 'Missing recipient email ("to")' },
                { status: 400 }
            );
        }

        console.log(`Sending critical success email to ${to} for ${firstName}`);

        const { data, error } = await resend.emails.send({
            from: 'contact@yner.fr',
            to: [to],
            subject: `🏆 Succès Critique ! ${firstName || 'Aventurier'} a fait un 20 naturel !`,
            react: CriticalSuccessEmailTemplate({
                firstName: firstName || 'Aventurier',
                rollDetails: rollDetails || '1d20 → 20',
                campaignName: campaignName || 'votre campagne',
            }),
        });

        if (error) {
            console.error("Resend API returned error:", error);
            return Response.json({ error }, { status: 500 });
        }

        console.log("Critical success email sent successfully:", data);
        return Response.json(data);
    } catch (error) {
        console.error("Unexpected error in /api/send-critical-success:", error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

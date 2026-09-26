import { Resend } from 'resend';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    const apiKey = process.env.RESEND_API_KEY;
    const audienceId = process.env.RESEND_AUDIANCE_KEY;

    if (!apiKey || !audienceId) {
        console.error("RESEND_API_KEY or RESEND_AUDIANCE_KEY is missing in environment variables.");
        return NextResponse.json(
            { error: 'Server misconfiguration: Missing API keys' },
            { status: 500 }
        );
    }

    const resend = new Resend(apiKey);

    try {
        const body = await request.json();
        const { email, firstName, lastName, enabled } = body;

        if (!email) {
            return NextResponse.json(
                { error: 'Missing user email' },
                { status: 400 }
            );
        }

        if (enabled) {
            // Subscribe the user
            const { data, error } = await resend.contacts.create({
                email,
                firstName: firstName || '',
                lastName: lastName || '',
                unsubscribed: false,
                audienceId,
            });

            if (error) {
                console.error("Resend API returned error (create contact):", error);
                return NextResponse.json({ error }, { status: 500 });
            }

            return NextResponse.json({ success: true, message: 'Subscribed successfully' });
        } else {
            // Unsubscribe the user (remove them from the audience)
            const { data, error } = await resend.contacts.remove({
                email,
                audienceId,
            });

            if (error) {
                console.error("Resend API returned error (remove contact):", error);
                return NextResponse.json({ error }, { status: 500 });
            }

            return NextResponse.json({ success: true, message: 'Unsubscribed successfully' });
        }
    } catch (error) {
        console.error("Unexpected error in /api/resend/preferences:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

import { EmailTemplate } from '@/components/email-template';
// Initializing independently to safely check for the key
import { Resend } from 'resend';
import { db, doc, getDoc } from '@/lib/firebase';

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
        console.log("Attempting to send email with data:", body);
        const { to, subject, firstName, campaignName, schedulingUrl, roomId } = body;

        // Use provided audienceId or fallback to env var (handling User's specific typo/naming)
        const audienceId = body.audienceId || process.env.RESEND_AUDIANCE_KEY;

        let finalCampaignName = campaignName;

        // If roomId is provided, try to fetch the campaign name from Firestore
        if (roomId && !finalCampaignName) {
            try {
                const docRef = doc(db, "Salle", roomId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.title) {
                        finalCampaignName = data.title;
                        console.log(`Fetched campaign name from Firestore: ${finalCampaignName}`);
                    }
                } else {
                    console.log("No such document in Firestore for roomId:", roomId);
                }
            } catch (fsError) {
                console.error("Error fetching from Firestore:", fsError);
                // Continue execution, fall back to default if needed
            }
        }

        let recipients: string[] = [];
        let audienceContacts: any[] = [];

        // 1. Handle Audience ID
        if (audienceId) {
            const { data: contacts, error: contactsError } = await resend.contacts.list({
                audienceId: audienceId,
            });

            if (contactsError) {
                console.error("Error fetching audience:", contactsError);
                return Response.json({ error: 'Failed to fetch audience contacts' }, { status: 500 });
            }

            if (contacts && contacts.data) {
                audienceContacts = contacts.data;
                // Filter out those without email
                audienceContacts = audienceContacts.filter(c => c.email);
            }
        }
        // 2. Handle passed 'to' string (comma separated)
        else if (to) {
            recipients = to.split(',').map((email: string) => email.trim()).filter((email: string) => email.length > 0);
        }

        if (recipients.length === 0 && audienceContacts.length === 0) {
            return Response.json(
                { error: 'No recipients found (provide "to" or valid "audienceId")' },
                { status: 400 }
            );
        }

        const emailSubject = subject || `Prochaine session : ${finalCampaignName || 'JDR'}`;
        const campaign = finalCampaignName || 'votre campagne';

        let batchData;

        // prioritize Audience data if available (allows personalized names)
        if (audienceContacts.length > 0) {
            batchData = audienceContacts.map(contact => ({
                from: 'contact@yner.fr',
                to: [contact.email],
                subject: emailSubject,
                react: EmailTemplate({
                    firstName: contact.first_name || firstName || 'Aventurier',
                    campaignName: campaign,
                    schedulingUrl
                }),
            }));
        } else {
            // Standard list send
            batchData = recipients.map(recipientEmail => ({
                from: 'contact@yner.fr',
                to: [recipientEmail],
                subject: emailSubject,
                react: EmailTemplate({
                    firstName: firstName || 'Aventurier',
                    campaignName: campaign,
                    schedulingUrl
                }),
            }));
        }

        // Limit batch size if necessary (Resend max is usually 100 per batch, handle large lists in chunks if needed)
        // For now assuming < 100 for a D&D group.

        const { data, error } = await resend.batch.send(batchData);

        if (error) {
            console.error("Resend API returned error:", error);
            return Response.json({ error }, { status: 500 });
        }

        console.log("Batch emails sent successfully:", data);
        return Response.json(data);
    } catch (error) {
        console.error("Unexpected error in /api/send:", error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
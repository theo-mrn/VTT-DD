import { SessionReminderEmailTemplate } from '@/components/emails/session-reminder-email-template';
import { Resend } from 'resend';
import { db, collection, getDocs, query, where, doc, getDoc, updateDoc, Timestamp } from '@/lib/firebase';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

export async function GET(request: Request) {
    // Verify cron secret in production
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        return Response.json({ error: 'Missing RESEND_API_KEY' }, { status: 500 });
    }

    const resend = new Resend(apiKey);

    try {
        const now = new Date();
        const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const nowTimestamp = Timestamp.fromDate(now);
        const in24hTimestamp = Timestamp.fromDate(in24h);

        // Get all rooms
        const sallesSnapshot = await getDocs(collection(db, 'Salle'));

        let totalEmailsSent = 0;
        let sessionsProcessed = 0;
        const errors: string[] = [];

        for (const salleDoc of sallesSnapshot.docs) {
            const roomId = salleDoc.id;
            const roomData = salleDoc.data();
            const campaignName = roomData.title || 'votre campagne';

            // Query sessions happening in the next 24h that haven't been reminded
            const sessionsQuery = query(
                collection(db, `Salle/${roomId}/sessions`),
                where('date', '>=', nowTimestamp),
                where('date', '<=', in24hTimestamp),
            );

            const sessionsSnapshot = await getDocs(sessionsQuery);

            for (const sessionDoc of sessionsSnapshot.docs) {
                const sessionData = sessionDoc.data();

                // Skip if already reminded
                if (sessionData.reminderSent) continue;

                const sessionDate = sessionData.date?.toDate?.()
                    ? sessionData.date.toDate()
                    : new Date(sessionData.date);

                const formattedDate = format(sessionDate, "EEEE d MMMM 'à' HH:mm", { locale: fr });

                // Get players in this room
                const nomsSnapshot = await getDocs(collection(db, `salles/${roomId}/Noms`));
                const playerUids = nomsSnapshot.docs.map(d => d.id);

                // Fetch emails for each player
                const emailBatch: { to: string[]; firstName: string }[] = [];

                for (const uid of playerUids) {
                    try {
                        const userDoc = await getDoc(doc(db, 'users', uid));
                        if (!userDoc.exists()) continue;

                        const userData = userDoc.data();

                        // Respect email notification preferences
                        if (userData.emailNotifications === false) continue;

                        const email = userData.email;
                        if (!email) continue;

                        emailBatch.push({
                            to: [email],
                            firstName: userData.name || 'Aventurier',
                        });
                    } catch (err) {
                        console.error(`Error fetching user ${uid}:`, err);
                    }
                }

                if (emailBatch.length > 0) {
                    try {
                        const batchData = emailBatch.map(entry => ({
                            from: 'contact@yner.fr',
                            to: entry.to,
                            subject: `📅 Rappel : session de ${campaignName} demain !`,
                            react: SessionReminderEmailTemplate({
                                firstName: entry.firstName,
                                campaignName,
                                sessionDate: formattedDate,
                            }),
                        }));

                        const { error } = await resend.batch.send(batchData);

                        if (error) {
                            console.error(`Resend error for room ${roomId}:`, error);
                            errors.push(`Room ${roomId}: ${JSON.stringify(error)}`);
                        } else {
                            totalEmailsSent += emailBatch.length;
                        }
                    } catch (sendErr) {
                        console.error(`Send error for room ${roomId}:`, sendErr);
                        errors.push(`Room ${roomId}: ${String(sendErr)}`);
                    }
                }

                // Mark session as reminded
                await updateDoc(doc(db, `Salle/${roomId}/sessions`, sessionDoc.id), {
                    reminderSent: true,
                });

                sessionsProcessed++;
            }
        }

        return Response.json({
            success: true,
            sessionsProcessed,
            totalEmailsSent,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error) {
        console.error('Session reminder error:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

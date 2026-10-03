import { SessionReminderEmailTemplate } from '@/components/emails/session-reminder-email-template';
import { Resend } from 'resend';
import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
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

        // Get all rooms
        const sallesSnapshot = await adminDb.collection('Salle').get();

        let totalEmailsSent = 0;
        let sessionsProcessed = 0;
        const errors: string[] = [];

        for (const salleDoc of sallesSnapshot.docs) {
            const roomId = salleDoc.id;
            const roomData = salleDoc.data();
            const campaignName = roomData.title || 'votre campagne';

            // Query sessions happening in the next 24h
            const sessionsSnapshot = await adminDb
                .collection(`Salle/${roomId}/sessions`)
                .where('date', '>=', Timestamp.fromDate(now))
                .where('date', '<=', Timestamp.fromDate(in24h))
                .get();

            for (const sessionDoc of sessionsSnapshot.docs) {
                const sessionData = sessionDoc.data();

                // Skip if already reminded
                if (sessionData.reminderSent) continue;

                const sessionDate = sessionData.date?.toDate?.()
                    ? sessionData.date.toDate()
                    : new Date(sessionData.date);

                const formattedDate = format(sessionDate, "EEEE d MMMM 'à' HH:mm", { locale: fr });

                // Get players: try salles/{roomId}/Noms first, fallback to scanning users with this room
                const playerUids = new Set<string>();

                const nomsSnapshot = await adminDb.collection(`salles/${roomId}/Noms`).get();
                nomsSnapshot.docs.forEach(d => playerUids.add(d.id));

                // Also find users who have this room in their rooms subcollection
                const usersSnapshot = await adminDb.collection('users').get();
                for (const userDoc of usersSnapshot.docs) {
                    const userRoomDoc = await adminDb.doc(`users/${userDoc.id}/rooms/${roomId}`).get();
                    if (userRoomDoc.exists) {
                        playerUids.add(userDoc.id);
                    }
                }

                // Fetch emails for each player
                const emailBatch: { to: string[]; firstName: string }[] = [];

                for (const uid of playerUids) {
                    try {
                        const userDoc = await adminDb.doc(`users/${uid}`).get();
                        if (!userDoc.exists) continue;

                        const userData = userDoc.data()!;

                        // Respect email notification preferences
                        if (userData.emailNotifications === false) continue;

                        // Try Firestore email, fallback to Firebase Auth email
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

                // Only mark as reminded if emails were actually sent
                if (totalEmailsSent > 0) {
                    await adminDb.doc(`Salle/${roomId}/sessions/${sessionDoc.id}`).update({
                        reminderSent: true,
                    });
                }

                sessionsProcessed++;
            }
        }

        return Response.json({
            success: true,
            sessionsProcessed,
            totalEmailsSent,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error: any) {
        console.error('Session reminder error:', error);
        return Response.json({
            error: 'Internal Server Error',
            message: error?.message || String(error),
        }, { status: 500 });
    }
}

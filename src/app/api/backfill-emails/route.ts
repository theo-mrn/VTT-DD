import { adminDb } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const auth = getAuth();
        const usersSnapshot = await adminDb.collection('users').get();

        let updated = 0;
        let skipped = 0;
        const details: string[] = [];

        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();

            // Skip if email already exists in Firestore
            if (userData.email) {
                skipped++;
                continue;
            }

            try {
                // Get email from Firebase Auth
                const authUser = await auth.getUser(userDoc.id);

                if (authUser.email) {
                    await adminDb.doc(`users/${userDoc.id}`).update({
                        email: authUser.email,
                    });
                    updated++;
                    details.push(`${userData.name || userDoc.id} → ${authUser.email}`);
                } else {
                    skipped++;
                }
            } catch (err) {
                // User might exist in Firestore but not in Auth
                skipped++;
            }
        }

        return Response.json({
            success: true,
            updated,
            skipped,
            details,
        });
    } catch (error: any) {
        console.error('Backfill error:', error);
        return Response.json({
            error: 'Internal Server Error',
            message: error?.message || String(error),
        }, { status: 500 });
    }
}

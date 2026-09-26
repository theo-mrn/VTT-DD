import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function getAdminApp() {
    if (getApps().length > 0) {
        return getApps()[0];
    }

    // Option 1: Service account JSON via env var
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccount) {
        return initializeApp({
            credential: cert(JSON.parse(serviceAccount) as ServiceAccount),
        });
    }

    // Option 2: Application Default Credentials (works in Vercel with GOOGLE_APPLICATION_CREDENTIALS)
    // Option 3: Minimal init with project ID (works if rules are open or using env-based auth)
    return initializeApp({
        projectId: 'test-b4364',
    });
}

const adminApp = getAdminApp();
export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);


import { initializeApp, getApps, cert, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// You should set these environment variables or use GOOGLE_APPLICATION_CREDENTIALS
// For local dev, you might need a service-account.json
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : undefined;

// Prevent multiple initializations in dev
const getAdminApp = () => {
    if (getApps().length > 0) {
        return getApp();
    }

    // If we have a service account env var, use it
    if (serviceAccount) {
        return initializeApp({
            credential: cert(serviceAccount)
        });
    }

    // Otherwise fall back to default (GOOGLE_APPLICATION_CREDENTIALS or Cloud Identity)
    return initializeApp();
};

const adminApp = getAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

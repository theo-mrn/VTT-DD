import { initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { resolve } from "path";

// Env sans règles — utilisé par tous les tests CRUD (unauthenticatedContext bypasse les règles)
let testEnv: RulesTestEnvironment;

// Env avec règles — utilisé uniquement par security.e2e.test.ts
let securityEnv: RulesTestEnvironment;

// Règles permissives pour les tests CRUD (pas de vérification d'auth)
const OPEN_RULES = `
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} {
        allow read, write: if true;
      }
    }
  }
`;

export async function getTestEnv(): Promise<RulesTestEnvironment> {
  if (!testEnv) {
    testEnv = await initializeTestEnvironment({
      projectId: "test-b4364",
      firestore: {
        host: "localhost",
        port: 8088,
        rules: OPEN_RULES,
      },
    });
  }
  return testEnv;
}

export async function getSecurityTestEnv(): Promise<RulesTestEnvironment> {
  if (!securityEnv) {
    securityEnv = await initializeTestEnvironment({
      projectId: "test-security-b4364",
      firestore: {
        host: "localhost",
        port: 8088,
        rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
      },
    });
  }
  return securityEnv;
}

export async function cleanupTestEnv(): Promise<void> {
  if (testEnv) await testEnv.cleanup();
}

export async function cleanupSecurityTestEnv(): Promise<void> {
  if (securityEnv) await securityEnv.cleanup();
}

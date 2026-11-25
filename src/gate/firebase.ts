/**
 * firebase.ts — shared Firebase initialization for the PowerTies gate.
 *
 * Same shape as MLOT's firebaseConfig.ts: config comes from Vite env vars
 * named exactly VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN,
 * VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID.
 *
 * The shared Firebase project already exists: `mlot-analyzer`.
 *
 * Dormant by design: if the env vars are not set, `auth` and `db` are null,
 * `isGateConfigured` is false, and the gate renders children untouched so
 * apps can ship the gate before their env vars / Firebase setup are ready.
 */
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// import.meta.env is provided by Vite at build time. Cast through a minimal
// shape so this module typechecks outside a Vite project (no vite/client
// types required).
const env = (
  import.meta as unknown as { env?: Record<string, string | undefined> }
).env ?? {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isGateConfigured: boolean = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

if (isGateConfigured) {
  app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
} else {
  // Dormant — not an error. See README-INTEGRATION.md for the env vars.
  console.warn(
    "[PowerTies gate] Firebase env vars are not set " +
      "(VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, " +
      "VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID). " +
      "The gate is dormant and will render the app without sign-in.",
  );
}

export const firebaseApp: FirebaseApp | null = app;
export const auth: Auth | null = authInstance;
export const db: Firestore | null = dbInstance;

/**
 * Build an Authorization header carrying the signed-in user's Firebase ID
 * token, for attaching to generation fetches against the app's api/ routes.
 * Returns an empty object when the gate is dormant or nobody is signed in,
 * so callers can always spread it: `headers: { ...await authHeader() }`.
 */
export async function authHeader(): Promise<Record<string, string>> {
  if (!authInstance || !authInstance.currentUser) return {};
  try {
    const token = await authInstance.currentUser.getIdToken();
    return { Authorization: `Bearer ${token}` };
  } catch (err) {
    console.warn("[PowerTies gate] Could not get an ID token:", err);
    return {};
  }
}

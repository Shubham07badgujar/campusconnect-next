import path from "node:path";
import fs from "node:fs";
import admin from "firebase-admin";

// Credential source is resolved in this order, regardless of NODE_ENV:
//   1. FIREBASE_SERVICE_ACCOUNT_BASE64  (recommended for cloud hosts like Render)
//   2. FIREBASE_SERVICE_ACCOUNT_JSON    (raw one-line JSON)
//   3. a local file (FIREBASE_ADMIN_SDK_KEY path, or ./service-account-key.json at repo root)

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  [key: string]: unknown;
};

function loadServiceAccount(): ServiceAccountJson {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      const jsonString = Buffer.from(
        process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
        "base64",
      ).toString("utf8");
      const parsed = JSON.parse(jsonString) as ServiceAccountJson;
      console.log("✅ Using Firebase service account from Base64 environment variable");
      return parsed;
    } catch (error) {
      console.error(
        "❌ Error parsing Base64 Firebase service account:",
        (error as Error).message,
      );
      throw new Error(
        "Invalid FIREBASE_SERVICE_ACCOUNT_BASE64 environment variable. Please check the Base64 encoding.",
      );
    }
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Handle literal \n sequences that some hosts introduce in the private key
    try {
      const jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.replace(/\\n/g, "\n");
      const parsed = JSON.parse(jsonString) as ServiceAccountJson;
      console.log("✅ Using Firebase service account from JSON environment variable");
      return parsed;
    } catch {
      try {
        const parsed = JSON.parse(
          process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
        ) as ServiceAccountJson;
        console.log(
          "✅ Using Firebase service account from JSON environment variable (fallback parsing)",
        );
        return parsed;
      } catch (fallbackError) {
        console.error(
          "❌ Error parsing Firebase service account JSON:",
          (fallbackError as Error).message,
        );
        throw new Error(
          "Invalid FIREBASE_SERVICE_ACCOUNT_JSON environment variable. Please check the JSON formatting.",
        );
      }
    }
  }

  const keyPath = path.resolve(
    process.cwd(),
    process.env.FIREBASE_ADMIN_SDK_KEY || "service-account-key.json",
  );
  try {
    const parsed = JSON.parse(fs.readFileSync(keyPath, "utf8")) as ServiceAccountJson;
    console.log("✅ Using Firebase service account from file");
    return parsed;
  } catch (error) {
    console.error(
      "❌ No Firebase credentials found (env var or file):",
      (error as Error).message,
    );
    throw new Error(
      "Firebase service account not configured. On a cloud host set FIREBASE_SERVICE_ACCOUNT_BASE64; locally provide service-account-key.json at the repo root.",
    );
  }
}

// Next.js dev mode creates fresh module instances on recompiles — guard the app
// singleton on globalThis so initializeApp never runs twice.
const ADMIN_KEY = Symbol.for("campusconnect.firebase-admin");

function initAdmin(): typeof admin {
  const globalStore = globalThis as Record<symbol, unknown>;
  if (globalStore[ADMIN_KEY]) {
    return globalStore[ADMIN_KEY] as typeof admin;
  }

  if (admin.apps.length === 0) {
    const serviceAccount = loadServiceAccount();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      projectId: serviceAccount.project_id,
      storageBucket: serviceAccount.project_id
        ? `${serviceAccount.project_id}.appspot.com`
        : undefined,
    });
  }

  globalStore[ADMIN_KEY] = admin;
  return admin;
}

const adminApp = initAdmin();

export default adminApp;
export const firestoreAdmin = () => adminApp.firestore();
export const authAdmin = () => adminApp.auth();
export const FieldValue = adminApp.firestore.FieldValue;

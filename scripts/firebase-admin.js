const admin = require("firebase-admin");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

// Initialize Firebase Admin with service account.
// Credential source is resolved in this order, regardless of NODE_ENV:
//   1. FIREBASE_SERVICE_ACCOUNT_BASE64  (recommended for cloud hosts like Render)
//   2. FIREBASE_SERVICE_ACCOUNT_JSON    (raw one-line JSON)
//   3. a local file (FIREBASE_ADMIN_SDK_KEY path, or ./service-account-key.json)
// This means a deploy works as long as ONE of these is provided — you no longer
// have to also set NODE_ENV=production for the env-var path to be used.
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  try {
    const jsonString = Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
      "base64",
    ).toString("utf8");
    serviceAccount = JSON.parse(jsonString);
    console.log("✅ Using Firebase service account from Base64 environment variable");
  } catch (error) {
    console.error("❌ Error parsing Base64 Firebase service account:", error.message);
    throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_BASE64 environment variable. Please check the Base64 encoding.");
  }
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    // Handle literal \n sequences that some hosts introduce in the private key
    const jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.replace(/\\n/g, "\n");
    serviceAccount = JSON.parse(jsonString);
    console.log("✅ Using Firebase service account from JSON environment variable");
  } catch (error) {
    // Fallback: parse without newline replacement
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      console.log("✅ Using Firebase service account from JSON environment variable (fallback parsing)");
    } catch (fallbackError) {
      console.error("❌ Error parsing Firebase service account JSON:", fallbackError.message);
      throw new Error("Invalid FIREBASE_SERVICE_ACCOUNT_JSON environment variable. Please check the JSON formatting.");
    }
  }
} else {
  // No env credential — fall back to a local file (typical for local development)
  try {
    serviceAccount = require(process.env.FIREBASE_ADMIN_SDK_KEY || require("path").join(__dirname, "..", "service-account-key.json"));
    console.log("✅ Using Firebase service account from file");
  } catch (error) {
    console.error("❌ No Firebase credentials found (env var or file):", error.message);
    throw new Error(
      "Firebase service account not configured. On a cloud host set FIREBASE_SERVICE_ACCOUNT_BASE64; locally provide backend/service-account-key.json.",
    );
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
  storageBucket: `${serviceAccount.project_id}.appspot.com`,
  databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
});

module.exports = admin;

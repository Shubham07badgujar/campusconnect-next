"use client";

import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  type User,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize once (Next.js fast-refresh can re-evaluate modules)
const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

const auth = getAuth(app);
const firestore = getFirestore(app);
const provider = new GoogleAuthProvider();
const db = firestore; // legacy alias
const storage = getStorage(app);

export const loginWithEmailPassword = (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

// Set persistence (browser only)
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Persistence error:", error);
  });
}

// Helper function to check if a user has teacher role
export const checkTeacherRole = async (user: User | null): Promise<boolean> => {
  if (!user) return false;

  try {
    await user.getIdToken(true);
    const tokenResult = await user.getIdTokenResult();
    return !!tokenResult.claims.teacher;
  } catch (error) {
    console.error("Error checking teacher role:", error);
    return false;
  }
};

export { auth, firestore, provider, db, storage };

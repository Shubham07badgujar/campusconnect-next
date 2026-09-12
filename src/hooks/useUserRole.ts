"use client";

// Resolves the signed-in user's app role from Firebase custom claims.
// UI convenience only — real authorization stays on the server guards.
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/client/firebase";
import type { AppRole } from "@/lib/client/navigation";

export type UserRoleState = {
  user: User | null;
  role: AppRole | null;
  loading: boolean;
};

export function useUserRole(): UserRoleState {
  const [state, setState] = useState<UserRoleState>({
    user: null,
    role: null,
    loading: true,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, role: null, loading: false });
        return;
      }

      try {
        const token = await user.getIdTokenResult();
        const role: AppRole = token.claims.admin
          ? "admin"
          : token.claims.teacher
            ? "teacher"
            : "student";
        setState({ user, role, loading: false });
      } catch {
        setState({ user, role: "student", loading: false });
      }
    });

    return () => unsubscribe();
  }, []);

  return state;
}

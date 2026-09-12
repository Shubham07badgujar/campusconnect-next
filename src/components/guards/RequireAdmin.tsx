"use client";

// Port of legacy AdminRoute (post-hardening version) — requires the `admin`
// custom claim, with NO page exceptions.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/client/firebase";

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const [user, loading] = useAuthState(auth);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAdmin = async () => {
      if (user) {
        try {
          const token = await user.getIdTokenResult(true);
          setIsAdmin(!!token.claims.admin);
        } catch (error) {
          console.error("Admin check error:", error);
          setIsAdmin(false);
        }
      }
      setChecking(false);
    };

    checkAdmin();
  }, [user]);

  useEffect(() => {
    if (!loading && !checking && (!user || !isAdmin)) {
      router.replace("/auth/admin");
    }
  }, [loading, checking, user, isAdmin, router]);

  if (loading || checking) {
    return <div>Loading...</div>;
  }

  if (!user || !isAdmin) {
    return null;
  }

  return <>{children}</>;
}

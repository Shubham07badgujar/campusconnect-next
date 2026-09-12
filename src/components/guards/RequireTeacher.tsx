"use client";

// Port of legacy TeacherRoute — requires the `teacher` custom claim.
// (Uses a force-refreshed token so a freshly granted claim is seen.)
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/client/firebase";

export default function RequireTeacher({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">("checking");
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setStatus("denied");
        return;
      }

      try {
        const token = await user.getIdTokenResult(true);
        setStatus(token.claims.teacher ? "allowed" : "denied");
      } catch (error) {
        console.error("Teacher check error:", error);
        setStatus("denied");
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (status === "denied") {
      router.replace("/auth/teacher");
    }
  }, [status, router]);

  if (status === "checking") {
    return <div>Loading...</div>;
  }

  if (status === "denied") {
    return null;
  }

  return <>{children}</>;
}

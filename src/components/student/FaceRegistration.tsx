"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "react-toastify";
import { registerFaceProfile } from "@/lib/client/attendanceService";

const FaceCameraCapture = dynamic(
  () => import("@/components/student/FaceCameraCapture"),
  { ssr: false },
);

export default function FaceRegistration({ studentId, onRegistered }: any) {
  const [registering, setRegistering] = useState(false);

  const handleDescriptor = async (payload: any) => {
    if (!payload?.descriptor || !studentId) {
      return;
    }

    setRegistering(true);
    try {
      const result = await registerFaceProfile({
        studentId,
        descriptor: payload.descriptor,
        modelVersion: "face-api-v1",
      });

      toast.success(result.message || "Face registered successfully.");
      onRegistered?.();
    } catch (error: any) {
      toast.error(error.message || "Face registration failed.");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">Face Registration</h3>
      <p className="mt-1 text-xs text-slate-500">
        Register your face once to use face recognition for attendance.
      </p>
      <FaceCameraCapture
        disabled={registering}
        buttonLabel={registering ? "Registering..." : "Capture & Register Face"}
        onDescriptor={handleDescriptor}
      />
    </div>
  );
}

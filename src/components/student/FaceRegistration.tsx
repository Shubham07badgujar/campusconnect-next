"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "react-toastify";
import { ScanFace } from "lucide-react";
import { registerFaceProfile } from "@/lib/client/attendanceService";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

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
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <ScanFace className="h-3.5 w-3.5" />
            </span>
            Face Registration
          </span>
        }
        description="Register your face once to use face recognition for attendance."
      />
      <CardBody>
        <FaceCameraCapture
          disabled={registering}
          buttonLabel={
            registering ? "Registering..." : "Capture & Register Face"
          }
          onDescriptor={handleDescriptor}
        />
      </CardBody>
    </Card>
  );
}

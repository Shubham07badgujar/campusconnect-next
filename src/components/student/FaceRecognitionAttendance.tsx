"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { ScanFace } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

const FaceCameraCapture = dynamic(
  () => import("@/components/student/FaceCameraCapture"),
  { ssr: false },
);

export default function FaceRecognitionAttendance({
  disabled,
  onVerified,
  ready,
}: any) {
  const [status, setStatus] = useState("");

  const handleDescriptor = (payload: any) => {
    if (
      !payload?.livenessPassed ||
      !Array.isArray(payload?.descriptors) ||
      payload.descriptors.length < 2
    ) {
      setStatus("Face liveness capture failed. Please retry.");
      onVerified?.(null);
      return;
    }

    setStatus(
      "Live face captured. The server will verify it when you mark attendance.",
    );
    onVerified?.({
      descriptors: payload.descriptors,
      livenessPassed: true,
    });
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
              <ScanFace className="h-3.5 w-3.5" />
            </span>
            Face Verification
          </span>
        }
        description="Look at the camera and blink once. Several frames are captured and verified against your registered face on the server."
        actions={ready ? <Badge tone="success">Verified</Badge> : null}
      />
      <CardBody>
        <FaceCameraCapture
          disabled={disabled}
          buttonLabel="Verify Face (Blink)"
          mode="liveness"
          onDescriptor={handleDescriptor}
        />
        {ready ? (
          <p className="mt-3 text-xs text-emerald-700">
            Face verification completed for this session.
          </p>
        ) : null}
        {status ? (
          <p className="mt-3 text-xs text-ink-soft">{status}</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

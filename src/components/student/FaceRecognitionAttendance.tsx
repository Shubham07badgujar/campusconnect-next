"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";

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
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-700">Face Verification</h3>
      <p className="mt-1 text-xs text-slate-500">
        Look at the camera and blink once. Several frames are captured and
        verified against your registered face on the server.
      </p>
      <FaceCameraCapture
        disabled={disabled}
        buttonLabel="Verify Face (Blink)"
        mode="liveness"
        onDescriptor={handleDescriptor}
      />
      {ready ? (
        <p className="mt-2 text-xs text-emerald-700">
          Face verification completed for this session.
        </p>
      ) : null}
      {status ? <p className="mt-2 text-xs text-slate-600">{status}</p> : null}
    </div>
  );
}

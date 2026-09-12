"use client";

import React, { useMemo } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { QrCode } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

export default function StudentQRDisplay({ studentInfo, studentId, prn }: any) {
  const normalizedStudent = studentInfo || {
    uid: studentId,
    prn,
  };

  const normalizedPrn =
    normalizedStudent?.prn ||
    normalizedStudent?.rollNo ||
    normalizedStudent?.rollNumber ||
    prn ||
    "";

  const payloadObject = useMemo(() => {
    return {
      studentId: normalizedStudent?.uid || studentId || "",
      prn: normalizedPrn,
      name: normalizedStudent?.name || normalizedStudent?.displayName || "",
      email: normalizedStudent?.email || "",
      department:
        normalizedStudent?.dept || normalizedStudent?.department || "",
      year: normalizedStudent?.year || "",
      semester: normalizedStudent?.semester || "",
      subjects: Array.isArray(normalizedStudent?.subjects)
        ? normalizedStudent.subjects
        : [],
      generatedAt: new Date().toISOString(),
    };
  }, [normalizedStudent, normalizedPrn, studentId]);

  const payload = useMemo(() => JSON.stringify(payloadObject), [payloadObject]);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <QrCode className="h-3.5 w-3.5" />
            </span>
            Profile QR Code
          </span>
        }
        description="Show this QR to your teacher if your biometric device is unavailable."
      />
      <CardBody>
        <div className="flex justify-center">
          <div className="rounded-xl border border-line bg-white p-3 shadow-card">
            <QRCodeCanvas value={payload} size={180} includeMargin />
          </div>
        </div>
        <p className="mt-3 text-center text-xs font-medium text-ink">
          PRN: {normalizedPrn || "-"}
        </p>
        <p className="mt-1 break-all text-center text-xs text-ink-faint">
          UID: {payloadObject.studentId || "-"}
        </p>
      </CardBody>
    </Card>
  );
}

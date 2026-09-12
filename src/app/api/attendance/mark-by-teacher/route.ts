import { NextRequest, NextResponse } from "next/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import { requireTeacher } from "@/lib/server/auth-guards";
import { getIO } from "@/lib/server/socket-io";
import { getPrnFromRecord, normalizePrn } from "@/lib/server/utils";
import {
  findStudentByStudentIdOrPrn,
  studentBelongsToSession,
} from "@/lib/server/attendance/shared";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireTeacher(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json();
    const sessionId = String(body.sessionId || "").trim();
    const studentIdInput = String(body.studentId || "").trim();
    const prnInput = normalizePrn(body.prn || "");

    if (!sessionId || (!studentIdInput && !prnInput)) {
      return NextResponse.json(
        { message: "sessionId and either studentId or prn are required." },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();
    const sessionDoc = await firestore
      .collection("attendance_sessions")
      .doc(sessionId)
      .get();

    if (!sessionDoc.exists) {
      return NextResponse.json(
        { message: "Attendance session not found." },
        { status: 404 },
      );
    }

    const sessionData = (sessionDoc.data() || {}) as Record<string, any>;
    if (String(sessionData.teacherId || "") !== g.uid) {
      return NextResponse.json(
        { message: "Only session owner can scan student QR." },
        { status: 403 },
      );
    }

    if (sessionData.status !== "active") {
      return NextResponse.json(
        { message: "Attendance session has already ended." },
        { status: 400 },
      );
    }

    const studentData = await findStudentByStudentIdOrPrn(firestore, {
      studentId: studentIdInput,
      prn: prnInput,
    });
    const studentId = String(studentData?.uid || "").trim();

    if (!studentData || !studentId) {
      return NextResponse.json({ message: "Student not found." }, { status: 404 });
    }

    if (!studentData || !studentBelongsToSession(studentData, sessionData)) {
      return NextResponse.json(
        { message: "Student is not enrolled for this session subject." },
        { status: 403 },
      );
    }

    const duplicateSnapshot = await firestore
      .collection("attendance_records")
      .where("sessionId", "==", sessionId)
      .where("studentId", "==", studentId)
      .limit(1)
      .get();

    if (!duplicateSnapshot.empty) {
      return NextResponse.json(
        { message: "Attendance already marked for this student." },
        { status: 409 },
      );
    }

    const recordId = `${sessionId}_${studentId}`.replace(/[^a-zA-Z0-9_-]+/g, "_");
    const recordRef = firestore.collection("attendance_records").doc(recordId);
    const nowMs = Date.now();
    const recordPayload = {
      recordId: recordRef.id,
      sessionId,
      studentId,
      studentName: studentData.name || studentData.displayName || "Student",
      prn: getPrnFromRecord(studentData),
      timestamp: FieldValue.serverTimestamp(),
      latitude: null,
      longitude: null,
      method: "teacher_scan",
      scannedBy: g.uid,
    };

    try {
      await recordRef.create(recordPayload);
    } catch (createError) {
      const alreadyExists =
        Number((createError as { code?: unknown })?.code) === 6 ||
        /already exists/i.test(String((createError as Error)?.message || ""));
      if (alreadyExists) {
        return NextResponse.json(
          { message: "Attendance already marked for this student." },
          { status: 409 },
        );
      }
      throw createError;
    }

    const eventPayload = {
      ...recordPayload,
      timestamp: new Date(nowMs).toISOString(),
    };

    getIO()?.to(`attendance_${sessionId}`).emit("attendance-recorded", eventPayload);

    return NextResponse.json(
      {
        success: true,
        message: "Attendance marked successfully by teacher scan.",
        record: eventPayload,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}

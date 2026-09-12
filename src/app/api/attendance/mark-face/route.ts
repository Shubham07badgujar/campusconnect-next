import { NextRequest, NextResponse } from "next/server";
import adminApp, { FieldValue } from "@/lib/server/firebase-admin";
import { requireStudent } from "@/lib/server/auth-guards";
import { getIO } from "@/lib/server/socket-io";
import {
  normalizeDeviceId,
  getPrnFromRecord,
  haversineDistanceMeters,
  toMillis,
} from "@/lib/server/utils";
import {
  shouldEnforceDistanceForSession,
  studentBelongsToSession,
} from "@/lib/server/attendance/shared";
import {
  buildFaceConfidenceScore,
  euclideanDistance,
  normalizeFaceDescriptor,
} from "@/lib/server/attendance/face";
import {
  ATTENDANCE_ALLOWED_DISTANCE_METERS,
  ATTENDANCE_WINDOW_SECONDS,
  FACE_DESCRIPTOR_LENGTH,
  FACE_FRAME_MIN_VARIATION,
  FACE_LIVENESS_MAX_FRAMES,
  FACE_LIVENESS_MIN_FRAMES,
  FACE_MATCH_DISTANCE_THRESHOLD,
} from "@/lib/server/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireStudent(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json();
    const studentData = g.studentData as Record<string, any>;
    const studentId = g.uid;
    const payloadStudentId = String(body.studentId || "").trim();
    if (payloadStudentId && payloadStudentId !== studentId) {
      return NextResponse.json({ message: "studentId mismatch." }, { status: 403 });
    }

    const sessionId = String(body.sessionId || "").trim();
    const challengeId = String(body.challengeId || "").trim();
    const deviceId = normalizeDeviceId(body.deviceId || "");
    const rawFrames = Array.isArray(body.descriptors)
      ? body.descriptors
      : body.descriptor
        ? [body.descriptor]
        : [];
    const descriptorFrames = rawFrames
      .slice(0, FACE_LIVENESS_MAX_FRAMES)
      .map((frame: unknown) => normalizeFaceDescriptor(frame));
    const studentLocation = {
      lat: Number(body?.studentLocation?.lat),
      lng: Number(body?.studentLocation?.lng),
    };

    if (!sessionId || !deviceId || !challengeId) {
      return NextResponse.json(
        { message: "sessionId, deviceId, and challengeId are required." },
        { status: 400 },
      );
    }

    if (
      descriptorFrames.length < FACE_LIVENESS_MIN_FRAMES ||
      descriptorFrames.some((frame: number[]) => frame.length !== FACE_DESCRIPTOR_LENGTH)
    ) {
      return NextResponse.json(
        {
          message: `At least ${FACE_LIVENESS_MIN_FRAMES} live capture frames of ${FACE_DESCRIPTOR_LENGTH} numeric values are required.`,
          code: "FACE_FRAMES_REQUIRED",
        },
        { status: 400 },
      );
    }

    if (Number.isNaN(studentLocation.lat) || Number.isNaN(studentLocation.lng)) {
      return NextResponse.json(
        { message: "Valid student location is required." },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();

    const [sessionDoc, deviceDoc, faceDoc, challengeDoc] = await Promise.all([
      firestore.collection("attendance_sessions").doc(sessionId).get(),
      firestore.collection("student_devices").doc(studentId).get(),
      firestore.collection("student_faces").doc(studentId).get(),
      firestore.collection("attendance_face_challenges").doc(challengeId).get(),
    ]);

    if (!sessionDoc.exists) {
      return NextResponse.json(
        { message: "Attendance session not found." },
        { status: 404 },
      );
    }

    const sessionData = (sessionDoc.data() || {}) as Record<string, any>;
    if (sessionData.status !== "active") {
      return NextResponse.json(
        { message: "Attendance session has already ended." },
        { status: 400 },
      );
    }

    if (!deviceDoc.exists) {
      return NextResponse.json(
        {
          message: "Trusted device not registered for this student.",
          code: "DEVICE_NOT_REGISTERED",
        },
        { status: 403 },
      );
    }

    const trustedDevice = normalizeDeviceId(
      (deviceDoc.data() as Record<string, any>)?.deviceId || "",
    );
    if (trustedDevice !== deviceId) {
      return NextResponse.json(
        {
          message: "Device verification failed.",
          code: "DEVICE_MISMATCH",
        },
        { status: 403 },
      );
    }

    if (!studentBelongsToSession(studentData, sessionData)) {
      return NextResponse.json(
        { message: "Student is not enrolled for this session subject." },
        { status: 403 },
      );
    }

    const startMs = Number(sessionData.startTimeMs) || toMillis(sessionData.startTime);
    const nowMs = Date.now();
    const maxWindowMs =
      (Number(sessionData.attendanceWindowSeconds) || ATTENDANCE_WINDOW_SECONDS) * 1000;

    if (!startMs || nowMs - startMs > maxWindowMs) {
      return NextResponse.json(
        { message: "Attendance time window has expired." },
        { status: 403 },
      );
    }

    const distance = haversineDistanceMeters(
      studentLocation,
      sessionData.teacherLocation || {},
    );
    const allowedDistance =
      Number(sessionData.allowedDistanceMeters) || ATTENDANCE_ALLOWED_DISTANCE_METERS;
    const enforceDistanceCheck = shouldEnforceDistanceForSession(sessionData);
    if (enforceDistanceCheck && !Number.isFinite(distance)) {
      return NextResponse.json(
        {
          message:
            "Teacher location is unavailable for this session. Ask teacher to restart attendance with location enabled.",
        },
        { status: 403 },
      );
    }
    if (enforceDistanceCheck && distance > allowedDistance) {
      return NextResponse.json(
        {
          message: `Location verification failed. You must be within ${allowedDistance} meters.`,
        },
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
        { message: "Attendance already marked for this session." },
        { status: 409 },
      );
    }

    if (!faceDoc.exists) {
      return NextResponse.json(
        {
          message:
            "No registered face profile found. Please complete face registration first.",
        },
        { status: 403 },
      );
    }

    const challengeData = challengeDoc.exists
      ? ((challengeDoc.data() || {}) as Record<string, any>)
      : null;
    if (!challengeData) {
      return NextResponse.json({ message: "Invalid face challenge." }, { status: 403 });
    }
    if (Boolean(challengeData.used)) {
      return NextResponse.json(
        { message: "Face challenge already used." },
        { status: 403 },
      );
    }
    if (String(challengeData.studentId || "") !== studentId) {
      return NextResponse.json(
        { message: "Face challenge student mismatch." },
        { status: 403 },
      );
    }
    if (String(challengeData.sessionId || "") !== sessionId) {
      return NextResponse.json(
        { message: "Face challenge session mismatch." },
        { status: 403 },
      );
    }

    const expiresAtMs = Number(challengeData.expiresAtMs || 0);
    if (!expiresAtMs || Date.now() > expiresAtMs) {
      return NextResponse.json({ message: "Face challenge expired." }, { status: 403 });
    }

    const storedDescriptor = normalizeFaceDescriptor(
      (faceDoc.data() as Record<string, any>)?.descriptor,
    );
    if (storedDescriptor.length !== FACE_DESCRIPTOR_LENGTH) {
      return NextResponse.json(
        { message: "Registered face profile is invalid. Please register again." },
        { status: 500 },
      );
    }

    // Server-side liveness: every captured frame must match the registered
    // profile, and no two frames may be identical — a replayed stored
    // descriptor produces byte-identical frames and is rejected.
    const frameDistances = descriptorFrames.map((frame: number[]) =>
      euclideanDistance(frame, storedDescriptor),
    );
    const worstDistance = Math.max(...frameDistances);
    if (worstDistance >= FACE_MATCH_DISTANCE_THRESHOLD) {
      return NextResponse.json(
        {
          message: "Face verification failed.",
          faceDistance: Number(worstDistance.toFixed(4)),
        },
        { status: 403 },
      );
    }

    let minFrameVariation = Infinity;
    for (let i = 0; i < descriptorFrames.length; i += 1) {
      for (let j = i + 1; j < descriptorFrames.length; j += 1) {
        minFrameVariation = Math.min(
          minFrameVariation,
          euclideanDistance(descriptorFrames[i], descriptorFrames[j]),
        );
      }
    }
    if (!(minFrameVariation > FACE_FRAME_MIN_VARIATION)) {
      return NextResponse.json(
        {
          message:
            "Face liveness check failed: captured frames are identical. Use a live camera capture.",
          code: "FACE_LIVENESS_FAILED",
        },
        { status: 403 },
      );
    }

    const distanceScore = Math.min(...frameDistances);

    await firestore
      .collection("attendance_face_challenges")
      .doc(challengeId)
      .set(
        {
          used: true,
          usedAtMs: Date.now(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    const recordRef = firestore.collection("attendance_records").doc();
    const studentName =
      studentData.name || studentData.displayName || g.token.name || "Student";
    const studentPrn = getPrnFromRecord(studentData);
    const recordPayload = {
      recordId: recordRef.id,
      sessionId,
      studentId,
      studentName,
      prn: studentPrn,
      timestamp: FieldValue.serverTimestamp(),
      latitude: studentLocation.lat,
      longitude: studentLocation.lng,
      method: "face_recognition",
      confidenceScore: buildFaceConfidenceScore(distanceScore),
      faceDistance: Number(distanceScore.toFixed(4)),
      modelVersion: String(
        (faceDoc.data() as Record<string, any>)?.modelVersion || "face-api-v1",
      ),
      livenessPassed: true,
      livenessFrameCount: descriptorFrames.length,
      livenessFrameVariation: Number(minFrameVariation.toFixed(4)),
      deviceId,
      distanceMeters: Number.isFinite(distance) ? Number(distance.toFixed(2)) : null,
      challengeId,
    };

    await recordRef.set(recordPayload);

    const eventPayload = {
      ...recordPayload,
      timestamp: new Date(nowMs).toISOString(),
    };

    getIO()?.to(`attendance_${sessionId}`).emit("attendance-recorded", eventPayload);
    getIO()?.to(`attendance_${sessionId}`).emit("attendance-heatmap-updated", {
      lat: studentLocation.lat,
      lng: studentLocation.lng,
      studentId,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Attendance marked successfully using face recognition.",
        record: eventPayload,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}

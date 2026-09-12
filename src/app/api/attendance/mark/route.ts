import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
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
  consumeWebauthnChallenge,
  getExpectedOrigins,
  getStoredPasskeys,
  getWebauthnRpIdCandidates,
  updateStoredPasskeyCounter,
} from "@/lib/server/attendance/webauthn";
import {
  ATTENDANCE_ALLOWED_DISTANCE_METERS,
  ATTENDANCE_WINDOW_SECONDS,
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
    const deviceId = normalizeDeviceId(body.deviceId || "");
    const webauthnChallengeId = String(body.webauthnChallengeId || "").trim();
    const webauthnCredential = body.webauthnCredential;
    const studentLocation = {
      lat: Number(body?.studentLocation?.lat),
      lng: Number(body?.studentLocation?.lng),
    };

    if (!sessionId || !deviceId) {
      return NextResponse.json(
        { message: "sessionId and deviceId are required." },
        { status: 400 },
      );
    }

    if (
      !webauthnChallengeId ||
      !webauthnCredential ||
      typeof webauthnCredential !== "object"
    ) {
      return NextResponse.json(
        {
          message: "Passkey (WebAuthn) verification is required.",
          code: "WEBAUTHN_REQUIRED",
        },
        { status: 403 },
      );
    }

    if (Number.isNaN(studentLocation.lat) || Number.isNaN(studentLocation.lng)) {
      return NextResponse.json(
        { message: "Valid student location is required." },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();
    const [sessionDoc, deviceDoc] = await Promise.all([
      firestore.collection("attendance_sessions").doc(sessionId).get(),
      firestore.collection("student_devices").doc(studentId).get(),
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

    // Cryptographically verify the passkey assertion against the stored
    // credential; the challenge is single-use and bound to this session.
    let expectedChallenge: string;
    try {
      expectedChallenge = await consumeWebauthnChallenge(firestore, {
        challengeId: webauthnChallengeId,
        studentId,
        type: "authentication",
        sessionId,
      });
    } catch (challengeError) {
      return NextResponse.json(
        {
          message: (challengeError as Error).message,
          code: "WEBAUTHN_CHALLENGE_INVALID",
        },
        { status: 403 },
      );
    }

    const storedCredentials = await getStoredPasskeys(firestore, studentId);
    const credentialId = String(webauthnCredential.id || "").trim();
    const matchedCredential = storedCredentials.find(
      (item) => item.credentialId === credentialId,
    );
    if (!matchedCredential) {
      return NextResponse.json(
        {
          message: "No registered passkey matches this credential.",
          code: "WEBAUTHN_UNKNOWN_CREDENTIAL",
        },
        { status: 403 },
      );
    }

    let webauthnVerification;
    try {
      webauthnVerification = await verifyAuthenticationResponse({
        response: webauthnCredential,
        expectedChallenge,
        expectedOrigin: getExpectedOrigins(req),
        expectedRPID: getWebauthnRpIdCandidates(req),
        requireUserVerification: true,
        authenticator: {
          credentialID: Buffer.from(matchedCredential.credentialId, "base64url"),
          credentialPublicKey: Buffer.from(matchedCredential.publicKey, "base64url"),
          counter: Number(matchedCredential.counter) || 0,
        },
      });
    } catch (verificationError) {
      return NextResponse.json(
        {
          message: `Passkey verification failed: ${(verificationError as Error).message}`,
          code: "WEBAUTHN_VERIFICATION_FAILED",
        },
        { status: 403 },
      );
    }

    if (!webauthnVerification.verified) {
      return NextResponse.json(
        {
          message: "Passkey verification failed.",
          code: "WEBAUTHN_VERIFICATION_FAILED",
        },
        { status: 403 },
      );
    }

    await updateStoredPasskeyCounter(
      firestore,
      studentId,
      credentialId,
      webauthnVerification.authenticationInfo?.newCounter,
    );

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
      method: "biometric",
      biometricAssertionId: credentialId,
      webauthnVerified: true,
      deviceId,
      distanceMeters: Number.isFinite(distance) ? Number(distance.toFixed(2)) : null,
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
        message: "Attendance marked successfully.",
        record: eventPayload,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}

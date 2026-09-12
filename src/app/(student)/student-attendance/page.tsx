"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { auth, firestore } from "@/lib/client/firebase";
import { doc, getDoc } from "firebase/firestore";
import { toast } from "react-toastify";
import AttendanceSessionCard from "@/components/student/AttendanceSessionCard";
import FingerprintVerification from "@/components/student/FingerprintVerification";
import { useSocket } from "@/context/SocketContext";
import {
  createFaceChallenge,
  ensureTrustedDevice,
  getActiveAttendanceSessions,
  getFaceProfileStatus,
  getStudentAttendance,
  markAttendance,
  markAttendanceByFace,
  registerStudentDevice,
} from "@/lib/client/attendanceService";

const StudentQRDisplay = dynamic(
  () => import("@/components/student/StudentQRDisplay"),
  { ssr: false },
);
const FaceRegistration = dynamic(
  () => import("@/components/student/FaceRegistration"),
  { ssr: false },
);
const FaceRecognitionAttendance = dynamic(
  () => import("@/components/student/FaceRecognitionAttendance"),
  { ssr: false },
);

const getBrowserLocation = () =>
  new Promise<any>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) =>
        reject(new Error(error.message || "Unable to access location.")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });

const getIpBasedLocation = async () => {
  const response = await fetch("https://ipapi.co/json/");
  if (!response.ok) {
    throw new Error("Unable to resolve network location.");
  }

  const data = await response.json();
  const lat = Number(data?.latitude);
  const lng = Number(data?.longitude);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error("Unable to resolve network location.");
  }

  return { lat, lng };
};

const getLocation = async () => {
  try {
    return await getBrowserLocation();
  } catch (geoError) {
    try {
      return await getIpBasedLocation();
    } catch {
      throw geoError;
    }
  }
};

function StudentAttendancePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { socket } = useSocket();
  const [student, setStudent] = useState<any>(null);
  const [subjectAttendance, setSubjectAttendance] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [joinedSessionId, setJoinedSessionId] = useState("");
  const [studentLocation, setStudentLocation] = useState<any>(null);
  const [deviceId, setDeviceId] = useState("");
  const [webauthnResult, setWebauthnResult] = useState<any>(null);
  const [attendanceMethod, setAttendanceMethod] = useState("biometric");
  const [faceRegistered, setFaceRegistered] = useState(false);
  const [faceReady, setFaceReady] = useState(false);
  const [faceDescriptors, setFaceDescriptors] = useState<any[]>([]);
  const [marking, setMarking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingAutoJoinSessionId, setPendingAutoJoinSessionId] = useState(
    String(searchParams.get("sessionId") || "").trim(),
  );

  const joinedSession = useMemo(
    () =>
      activeSessions.find(
        (session) => (session.sessionId || session.id) === joinedSessionId,
      ) || null,
    [activeSessions, joinedSessionId],
  );

  const resetAttendanceVerification = useCallback(() => {
    setWebauthnResult(null);
    setFaceReady(false);
    setFaceDescriptors([]);
  }, []);

  const refreshSessions = async () => {
    try {
      const response = await getActiveAttendanceSessions();
      const sessions = Array.isArray(response.sessions)
        ? response.sessions
        : [];
      setActiveSessions(sessions);

      if (
        joinedSessionId &&
        !sessions.some(
          (session: any) =>
            (session.sessionId || session.id) === joinedSessionId,
        )
      ) {
        setJoinedSessionId("");
        resetAttendanceVerification();
      }
    } catch (error: any) {
      toast.error(error.message || "Unable to fetch active sessions.");
    }
  };

  const refreshAttendanceSummary = async (studentId: any) => {
    if (!studentId) return;

    try {
      const attendanceResult = await getStudentAttendance(studentId);
      setSubjectAttendance(attendanceResult.attendance || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load attendance summary.");
    }
  };

  const refreshFaceStatus = async () => {
    try {
      const result = await getFaceProfileStatus();
      setFaceRegistered(Boolean(result.registered));
    } catch (error: any) {
      toast.error(error.message || "Unable to fetch face profile status.");
    }
  };

  useEffect(() => {
    const requestedSessionId = String(
      searchParams.get("sessionId") || "",
    ).trim();
    setPendingAutoJoinSessionId(requestedSessionId);
  }, [searchParams]);

  useEffect(() => {
    const init = async () => {
      const user = auth.currentUser;
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const userDoc = await getDoc(doc(firestore, "users", user.uid));
        const studentDoc = await getDoc(doc(firestore, "students", user.uid));

        const studentData = userDoc.exists()
          ? userDoc.data()
          : studentDoc.exists()
            ? studentDoc.data()
            : null;

        if (!studentData) {
          throw new Error("Student profile not found.");
        }

        const normalized = {
          uid: user.uid,
          ...studentData,
          prn:
            studentData.rollNo ||
            studentData.rollNumber ||
            studentData.prn ||
            "",
          subjects: Array.isArray(studentData.subjects)
            ? studentData.subjects
            : [],
        };
        setStudent(normalized);

        const persistedDevice = await ensureTrustedDevice();
        setDeviceId(persistedDevice);
        await registerStudentDevice(persistedDevice);

        await Promise.all([
          refreshAttendanceSummary(user.uid),
          refreshSessions(),
          refreshFaceStatus(),
        ]);

        const currentLocation = await getLocation();
        setStudentLocation(currentLocation);
      } catch (error: any) {
        toast.error(error.message || "Failed to initialize attendance page.");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [router]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const onSessionStarted = () => {
      refreshSessions();
    };

    const onSessionEnded = (payload: any) => {
      const endedSessionId = String(payload?.sessionId || "");
      if (endedSessionId && endedSessionId === joinedSessionId) {
        toast.info("The attendance session you joined has ended.");
        setJoinedSessionId("");
        resetAttendanceVerification();
      }
      refreshSessions();
    };

    socket.on("attendance-session-started", onSessionStarted);
    socket.on("attendance-session-ended", onSessionEnded);

    return () => {
      socket.off("attendance-session-started", onSessionStarted);
      socket.off("attendance-session-ended", onSessionEnded);
    };
  }, [socket, joinedSessionId, resetAttendanceVerification]);

  useEffect(() => {
    if (!socket || !joinedSessionId) {
      return;
    }

    let disposed = false;

    const emitJoin = async () => {
      let latestLocation = studentLocation;

      if (!latestLocation) {
        try {
          latestLocation = await getLocation();
          if (!disposed) {
            setStudentLocation(latestLocation);
          }
        } catch {
          latestLocation = null;
        }
      }

      if (!disposed) {
        socket.emit("join_attendance_session", {
          sessionId: joinedSessionId,
          studentLocation: latestLocation || undefined,
        });
      }
    };

    emitJoin();

    return () => {
      disposed = true;
    };
  }, [socket, joinedSessionId, studentLocation]);

  const handleJoinSession = useCallback(
    (sessionId: any) => {
      const normalizedSessionId = String(sessionId || "").trim();
      if (!normalizedSessionId) {
        return;
      }

      if (
        socket &&
        joinedSessionId &&
        joinedSessionId !== normalizedSessionId
      ) {
        socket.emit("leave_attendance_session", {
          sessionId: joinedSessionId,
        });
      }

      setJoinedSessionId(normalizedSessionId);
      setPendingAutoJoinSessionId("");

      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("sessionId");
      const nextQuery = nextParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);

      resetAttendanceVerification();
    },
    [
      searchParams,
      router,
      pathname,
      student?.uid,
      joinedSessionId,
      socket,
      resetAttendanceVerification,
    ],
  );

  const handleLeaveSession = useCallback(
    (sessionIdCandidate = joinedSessionId) => {
      const normalizedSessionId = String(sessionIdCandidate || "").trim();
      if (!normalizedSessionId) {
        return;
      }

      if (socket) {
        socket.emit("leave_attendance_session", {
          sessionId: normalizedSessionId,
        });
      }

      setJoinedSessionId("");
      resetAttendanceVerification();
      toast.info("You left the attendance session.");
    },
    [joinedSessionId, socket, resetAttendanceVerification],
  );

  useEffect(() => {
    if (!pendingAutoJoinSessionId || joinedSessionId) {
      return;
    }

    const matchingSession = activeSessions.find(
      (session) =>
        String(session.sessionId || session.id || "") ===
        pendingAutoJoinSessionId,
    );

    if (!matchingSession) {
      return;
    }

    handleJoinSession(pendingAutoJoinSessionId);
  }, [
    activeSessions,
    handleJoinSession,
    joinedSessionId,
    pendingAutoJoinSessionId,
  ]);

  const handleMark = async () => {
    const sessionId = String(
      joinedSession?.sessionId || joinedSession?.id || "",
    );
    if (!sessionId || !student?.uid || !studentLocation) {
      return;
    }

    setMarking(true);
    try {
      const latestLocation = await getLocation();
      setStudentLocation(latestLocation);

      if (!window.isSecureContext) {
        toast.info(
          "Using network-based location fallback because this page is not running on HTTPS.",
        );
      }

      const finalResult =
        attendanceMethod === "face"
          ? await (async () => {
              if (!faceRegistered) {
                throw new Error(
                  "Face is not registered. Please register your face first.",
                );
              }

              if (!faceReady || faceDescriptors.length < 2) {
                throw new Error(
                  "Complete face liveness verification before marking attendance.",
                );
              }

              const challenge = await createFaceChallenge(sessionId);
              return markAttendanceByFace({
                sessionId,
                studentId: student.uid,
                studentLocation: latestLocation,
                deviceId,
                descriptors: faceDescriptors,
                challengeId: challenge.challengeId,
              });
            })()
          : await (async () => {
              if (!webauthnResult?.challengeId || !webauthnResult?.credential) {
                throw new Error(
                  "Complete passkey verification before marking attendance.",
                );
              }

              return markAttendance({
                sessionId,
                studentId: student.uid,
                studentLocation: latestLocation,
                deviceId,
                webauthnChallengeId: webauthnResult.challengeId,
                webauthnCredential: webauthnResult.credential,
              });
            })();

      toast.success(finalResult.message || "Attendance marked successfully.");

      if (socket && sessionId) {
        socket.emit("leave_attendance_session", {
          sessionId,
        });
      }

      setJoinedSessionId("");
      resetAttendanceVerification();

      await Promise.all([
        refreshAttendanceSummary(student.uid),
        refreshSessions(),
      ]);
    } catch (error: any) {
      if (error.message.includes("Trusted device")) {
        try {
          await registerStudentDevice(deviceId);
        } catch {
          // no-op
        }
      }
      // Passkey challenges are single-use; require a fresh verification
      setWebauthnResult(null);
      toast.error(error.message || "Attendance mark failed.");
    } finally {
      setMarking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-600">
        Loading attendance details...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
              <p className="text-sm text-slate-600">
                Join active sessions, verify biometric, and use profile QR as
                backup.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/student-dashboard")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-700">
                Attendance Method
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAttendanceMethod("biometric")}
                  className={`rounded-lg px-3 py-2 text-xs font-medium ${
                    attendanceMethod === "biometric"
                      ? "bg-emerald-600 text-white"
                      : "border border-slate-300 text-slate-700"
                  }`}
                >
                  Fingerprint
                </button>
                <button
                  type="button"
                  onClick={() => setAttendanceMethod("face")}
                  className={`rounded-lg px-3 py-2 text-xs font-medium ${
                    attendanceMethod === "face"
                      ? "bg-sky-600 text-white"
                      : "border border-slate-300 text-slate-700"
                  }`}
                >
                  Face Recognition
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-700">
                  Active Attendance Sessions
                </h3>
                <button
                  type="button"
                  onClick={refreshSessions}
                  className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700"
                >
                  Refresh
                </button>
              </div>

              {activeSessions.length > 0 ? (
                <div className="space-y-3">
                  {activeSessions.map((session) => {
                    const sessionId = session.sessionId || session.id;
                    const isJoined = joinedSessionId === sessionId;
                    return (
                      <div
                        key={sessionId}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-800">
                              {session.subjectName || "Subject"}
                            </p>
                            <p className="text-xs text-slate-600">
                              {session.teacherName || "Teacher"} |{" "}
                              {session.branch || "-"} {session.year || ""}
                              {session.semester
                                ? ` / Sem ${session.semester}`
                                : ""}
                            </p>
                            <p className="text-xs text-slate-500">
                              {session.day || "-"} |{" "}
                              {session.lectureStartTime || "--:--"} -{" "}
                              {session.lectureEndTime || "--:--"}
                            </p>
                          </div>
                          {isJoined ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled
                                className="rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 text-xs font-medium text-emerald-700"
                              >
                                Joined
                              </button>
                              <button
                                type="button"
                                onClick={() => handleLeaveSession(sessionId)}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                              >
                                Leave Session
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleJoinSession(sessionId)}
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white"
                            >
                              Join Session
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No active attendance sessions are available right now.
                </p>
              )}
            </div>

            {attendanceMethod === "biometric" ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">
                    Passkey verification:{" "}
                    {webauthnResult ? "Ready" : "Not verified yet"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Each verification is valid for one attendance mark of the
                    joined session only.
                  </p>
                </div>

                <FingerprintVerification
                  sessionId={String(
                    joinedSession?.sessionId || joinedSession?.id || "",
                  )}
                  onVerified={(data: any) => {
                    if (data?.verified && data?.challengeId) {
                      setWebauthnResult({
                        challengeId: data.challengeId,
                        credential: data.credential,
                      });
                    } else if (!data?.registered) {
                      setWebauthnResult(null);
                    }
                  }}
                  disabled={!joinedSession}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">
                    Face profile status:{" "}
                    {faceRegistered ? "Registered" : "Not Registered"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Face registration is required only once. After that, only
                    face verification is needed for attendance marking.
                  </p>
                </div>
                {!faceRegistered ? (
                  <FaceRegistration
                    studentId={student?.uid}
                    onRegistered={refreshFaceStatus}
                  />
                ) : null}
                <FaceRecognitionAttendance
                  disabled={!joinedSession || !faceRegistered}
                  ready={faceReady}
                  onVerified={(payload: any) => {
                    const frames = Array.isArray(payload?.descriptors)
                      ? payload.descriptors.filter(
                          (frame: any) =>
                            Array.isArray(frame) && frame.length === 128,
                        )
                      : [];
                    const ready =
                      frames.length >= 2 && Boolean(payload?.livenessPassed);
                    setFaceReady(ready);
                    setFaceDescriptors(ready ? frames : []);
                  }}
                />
              </div>
            )}

            <AttendanceSessionCard
              session={joinedSession}
              studentLocation={studentLocation}
              onMark={handleMark}
              onLeave={() =>
                handleLeaveSession(
                  joinedSession?.sessionId || joinedSession?.id,
                )
              }
              marking={marking}
              verificationReady={
                attendanceMethod === "biometric"
                  ? Boolean(webauthnResult)
                  : faceReady
              }
              verificationLabel={
                attendanceMethod === "biometric" ? "fingerprint" : "face"
              }
            />

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-700">
                Subject Wise Attendance
              </h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600">
                      <th className="px-3 py-2">Subject</th>
                      <th className="px-3 py-2">Attended</th>
                      <th className="px-3 py-2">Total Lectures</th>
                      <th className="px-3 py-2">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectAttendance.map((entry) => (
                      <tr key={entry.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          {entry.subjectName || entry.subjectId}
                        </td>
                        <td className="px-3 py-2">
                          {entry.attendedClasses || 0}
                        </td>
                        <td className="px-3 py-2">{entry.totalClasses || 0}</td>
                        <td className="px-3 py-2">
                          {Number(entry.percentage || 0).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    {subjectAttendance.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-6 text-center text-slate-500"
                        >
                          No attendance stats available yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div>
            <StudentQRDisplay studentInfo={student} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <StudentAttendancePage />
    </Suspense>
  );
}

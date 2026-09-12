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
import { RefreshCw, CalendarClock, BarChart3 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Tabs from "@/components/ui/Tabs";
import {
  TableWrap,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/ui/Table";
import { PageLoader, EmptyState } from "@/components/ui/States";
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
    return <PageLoader label="Loading attendance details..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Join active sessions, verify biometric, and use profile QR as backup."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Attendance Method" />
            <CardBody>
              <Tabs
                items={[
                  { value: "biometric", label: "Fingerprint" },
                  { value: "face", label: "Face Recognition" },
                ]}
                value={attendanceMethod}
                onChange={(value) => setAttendanceMethod(value)}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <CalendarClock className="h-3.5 w-3.5" />
                  </span>
                  Active Attendance Sessions
                </span>
              }
              actions={
                <Button variant="secondary" size="sm" onClick={refreshSessions}>
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              }
            />
            <CardBody>
              {activeSessions.length > 0 ? (
                <div className="space-y-3">
                  {activeSessions.map((session) => {
                    const sessionId = session.sessionId || session.id;
                    const isJoined = joinedSessionId === sessionId;
                    return (
                      <div
                        key={sessionId}
                        className={`rounded-xl border p-3 ${
                          isJoined
                            ? "border-emerald-200 bg-emerald-50/60"
                            : "border-line bg-slate-50/70"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-ink">
                              {session.subjectName || "Subject"}
                            </p>
                            <p className="text-xs text-ink-soft">
                              {session.teacherName || "Teacher"} |{" "}
                              {session.branch || "-"} {session.year || ""}
                              {session.semester
                                ? ` / Sem ${session.semester}`
                                : ""}
                            </p>
                            <p className="text-xs text-ink-faint">
                              {session.day || "-"} |{" "}
                              {session.lectureStartTime || "--:--"} -{" "}
                              {session.lectureEndTime || "--:--"}
                            </p>
                          </div>
                          {isJoined ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone="success">Joined</Badge>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleLeaveSession(sessionId)}
                              >
                                Leave Session
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => handleJoinSession(sessionId)}
                            >
                              Join Session
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={CalendarClock}
                  title="No active sessions"
                  description="No active attendance sessions are available right now."
                />
              )}
            </CardBody>
          </Card>

          {attendanceMethod === "biometric" ? (
            <div className="space-y-6">
              <Card>
                <CardBody className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-ink-soft">
                    Passkey verification:
                    {webauthnResult ? (
                      <Badge tone="success">Ready</Badge>
                    ) : (
                      <Badge tone="neutral">Not verified yet</Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-faint">
                    Each verification is valid for one attendance mark of the
                    joined session only.
                  </p>
                </CardBody>
              </Card>

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
            <div className="space-y-6">
              <Card>
                <CardBody className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-ink-soft">
                    Face profile status:
                    {faceRegistered ? (
                      <Badge tone="success">Registered</Badge>
                    ) : (
                      <Badge tone="warning">Not Registered</Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-faint">
                    Face registration is required only once. After that, only
                    face verification is needed for attendance marking.
                  </p>
                </CardBody>
              </Card>
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
              handleLeaveSession(joinedSession?.sessionId || joinedSession?.id)
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

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <BarChart3 className="h-3.5 w-3.5" />
                  </span>
                  Subject Wise Attendance
                </span>
              }
            />
            <CardBody>
              <TableWrap className="shadow-none">
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Subject</TH>
                      <TH>Attended</TH>
                      <TH>Total Lectures</TH>
                      <TH>Attendance %</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {subjectAttendance.map((entry) => (
                      <TR key={entry.id}>
                        <TD>{entry.subjectName || entry.subjectId}</TD>
                        <TD>{entry.attendedClasses || 0}</TD>
                        <TD>{entry.totalClasses || 0}</TD>
                        <TD>{Number(entry.percentage || 0).toFixed(1)}%</TD>
                      </TR>
                    ))}
                    {subjectAttendance.length === 0 ? (
                      <TR className="hover:bg-transparent">
                        <TD
                          colSpan={4}
                          className="py-6 text-center text-ink-faint"
                        >
                          No attendance stats available yet.
                        </TD>
                      </TR>
                    ) : null}
                  </TBody>
                </Table>
              </TableWrap>
            </CardBody>
          </Card>
        </div>

        <div>
          <StudentQRDisplay studentInfo={student} />
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

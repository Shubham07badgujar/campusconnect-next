"use client";

// Port of legacy services/attendanceService.js.
// The API is same-origin now, so the base is simply /api.
import { auth } from "@/lib/client/firebase";

const API_BASE = "/api";

const fetchWithNetworkHint = async (url: string, options?: RequestInit) => {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(
      "Unable to reach the server. Please check your connection and try again.",
    );
  }
};

const authHeaders = async (): Promise<Record<string, string>> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("You must be logged in.");
  }

  const token = await user.getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

const parseResponse = async (response: Response) => {
  const rawText = await response.text();
  let data: any = null;

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { message: rawText || "Request failed." };
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
        `Request failed with status ${response.status}${response.statusText ? ` (${response.statusText})` : ""}.`,
    );
  }
  return data;
};

export const registerStudentDevice = async (deviceId: string) => {
  const response = await fetchWithNetworkHint(`${API_BASE}/attendance/register-device`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ deviceId }),
  });

  return parseResponse(response);
};

export const startAttendanceSession = async (payload: any) => {
  const response = await fetchWithNetworkHint(`${API_BASE}/attendance/start`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
};

export const getTeacherAttendanceLectures = async () => {
  const response = await fetchWithNetworkHint(`${API_BASE}/attendance/teacher/lectures`, {
    method: "GET",
    headers: await authHeaders(),
  });

  return parseResponse(response);
};

export const getActiveAttendanceSessions = async () => {
  const response = await fetchWithNetworkHint(`${API_BASE}/attendance/sessions/active`, {
    method: "GET",
    headers: await authHeaders(),
  });

  return parseResponse(response);
};

export const getActiveSessionBySubject = async (subjectId: string) => {
  const response = await fetchWithNetworkHint(
    `${API_BASE}/attendance/session/${encodeURIComponent(subjectId)}`,
    {
      method: "GET",
      headers: await authHeaders(),
    },
  );

  return parseResponse(response);
};

export const getPasskeyRegistrationOptions = async () => {
  const response = await fetchWithNetworkHint(
    `${API_BASE}/attendance/webauthn/register/options`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({}),
    },
  );

  return parseResponse(response);
};

export const verifyPasskeyRegistration = async (payload: any) => {
  const response = await fetchWithNetworkHint(
    `${API_BASE}/attendance/webauthn/register/verify`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(payload),
    },
  );

  return parseResponse(response);
};

export const getPasskeyAuthenticationOptions = async (sessionId: string) => {
  const response = await fetchWithNetworkHint(
    `${API_BASE}/attendance/webauthn/auth/options`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ sessionId }),
    },
  );

  return parseResponse(response);
};

export const markAttendance = async (payload: any) => {
  const response = await fetchWithNetworkHint(`${API_BASE}/attendance/mark`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
};

export const getFaceProfileStatus = async () => {
  const response = await fetchWithNetworkHint(`${API_BASE}/attendance/face/me`, {
    method: "GET",
    headers: await authHeaders(),
  });

  return parseResponse(response);
};

export const registerFaceProfile = async (payload: any) => {
  const response = await fetchWithNetworkHint(`${API_BASE}/attendance/face/register`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
};

export const createFaceChallenge = async (sessionId: string) => {
  const response = await fetchWithNetworkHint(`${API_BASE}/attendance/face/challenge`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ sessionId }),
  });

  return parseResponse(response);
};

export const markAttendanceByFace = async (payload: any) => {
  const response = await fetchWithNetworkHint(`${API_BASE}/attendance/mark-face`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
};

export const markAttendanceByTeacher = async (payload: any) => {
  const response = await fetchWithNetworkHint(`${API_BASE}/attendance/mark-by-teacher`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
};

export const endAttendanceSession = async (sessionId: string) => {
  const response = await fetchWithNetworkHint(`${API_BASE}/attendance/end`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ sessionId }),
  });

  return parseResponse(response);
};

export const getStudentAttendance = async (studentId: string) => {
  const response = await fetchWithNetworkHint(
    `${API_BASE}/attendance/student/${encodeURIComponent(studentId)}`,
    {
      method: "GET",
      headers: await authHeaders(),
    },
  );

  return parseResponse(response);
};

export const getAttendanceAnalytics = async (subjectId: string) => {
  const response = await fetchWithNetworkHint(
    `${API_BASE}/attendance/analytics/${encodeURIComponent(subjectId)}`,
    {
      method: "GET",
      headers: await authHeaders(),
    },
  );

  return parseResponse(response);
};

export const getAttendanceSessionRecords = async (sessionId: string) => {
  const response = await fetchWithNetworkHint(
    `${API_BASE}/attendance/session/${encodeURIComponent(sessionId)}/records`,
    {
      method: "GET",
      headers: await authHeaders(),
    },
  );

  return parseResponse(response);
};

export const deleteAttendanceSession = async (sessionId: string) => {
  const response = await fetchWithNetworkHint(
    `${API_BASE}/attendance/session/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      headers: await authHeaders(),
    },
  );

  return parseResponse(response);
};

export const getTeacherAttendanceSessionHistory = async (limit = 30) => {
  const response = await fetchWithNetworkHint(
    `${API_BASE}/attendance/teacher/sessions/history?limit=${encodeURIComponent(String(limit))}`,
    {
      method: "GET",
      headers: await authHeaders(),
    },
  );

  return parseResponse(response);
};

export const getTeacherSubjectAttendanceStudents = async (
  subjectId: string,
  subjectName = "",
) => {
  const query = subjectName
    ? `?subjectName=${encodeURIComponent(String(subjectName))}`
    : "";
  const response = await fetchWithNetworkHint(
    `${API_BASE}/attendance/teacher/subject/${encodeURIComponent(subjectId)}/students${query}`,
    {
      method: "GET",
      headers: await authHeaders(),
    },
  );

  return parseResponse(response);
};

export const getAttendanceSettings = async () => {
  const response = await fetchWithNetworkHint(`${API_BASE}/attendance/settings`, {
    method: "GET",
    headers: await authHeaders(),
  });

  return parseResponse(response);
};

export const updateAttendanceSettings = async (payload: any) => {
  const response = await fetchWithNetworkHint(`${API_BASE}/attendance/settings`, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
};

export const ensureTrustedDevice = async () => {
  const key = "campusconnect_device_id";
  let deviceId: string | null = null;
  try {
    deviceId = localStorage.getItem(key);
    if (!deviceId) {
      deviceId = `device_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`;
      localStorage.setItem(key, deviceId);
    }
  } catch {
    deviceId = `device_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`;
  }

  return deviceId;
};

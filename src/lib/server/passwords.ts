import crypto from "node:crypto";

// Charset excludes ambiguous characters (0/O, 1/l/I) so emailed credentials
// are easy to read and retype.
const PASSWORD_CHARSET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const generateSecurePassword = (length = 12): string => {
  let password = "";
  for (let i = 0; i < length; i += 1) {
    password += PASSWORD_CHARSET[crypto.randomInt(PASSWORD_CHARSET.length)];
  }
  return password;
};

export const makeStudentAuthEmail = (prn: string): string => {
  return `${String(prn).toLowerCase()}@campusconnect.student`;
};

export const normalizeTeacherLoginId = (value: unknown = ""): string => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (!raw) {
    return "";
  }

  if (raw.includes("@")) {
    return raw;
  }

  return `${raw}@campusconnect.teacher`;
};

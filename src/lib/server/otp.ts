import crypto from "node:crypto";
import adminApp from "@/lib/server/firebase-admin";
import { PASSWORD_RESET_OTP_SECRET } from "@/lib/server/constants";
import { normalizeEmail, normalizePrn } from "@/lib/server/utils";
import { normalizeTeacherLoginId } from "@/lib/server/passwords";

export const maskEmailAddress = (email = "") => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return "";
  }

  const [localPart = "", domainPart = ""] = normalizedEmail.split("@");
  if (!localPart || !domainPart) {
    return "";
  }

  const maskedLocal =
    localPart.length <= 2
      ? `${localPart[0] || "*"}*`
      : `${localPart[0]}${"*".repeat(Math.max(1, localPart.length - 2))}${localPart[localPart.length - 1]}`;

  const domainSegments = domainPart.split(".");
  const rootDomain = domainSegments.shift() || "";
  const tld = domainSegments.join(".");
  const maskedRootDomain =
    rootDomain.length <= 2
      ? `${rootDomain[0] || "*"}*`
      : `${rootDomain[0]}${"*".repeat(Math.max(1, rootDomain.length - 2))}${rootDomain[rootDomain.length - 1]}`;

  return `${maskedLocal}@${maskedRootDomain}${tld ? `.${tld}` : ""}`;
};

export const buildPasswordResetDocId = (loginKey = "") => {
  return crypto
    .createHash("sha256")
    .update(
      String(loginKey || "")
        .trim()
        .toLowerCase(),
    )
    .digest("hex");
};

export const buildPasswordOtpHash = (loginKey: string, otp: string) => {
  return crypto
    .createHash("sha256")
    .update(
      `${String(loginKey || "")
        .trim()
        .toLowerCase()}|${String(otp || "").trim()}|${PASSWORD_RESET_OTP_SECRET}`,
    )
    .digest("hex");
};

export const buildPasswordResetTokenHash = (loginKey: string, token: string) => {
  return crypto
    .createHash("sha256")
    .update(
      `${String(loginKey || "")
        .trim()
        .toLowerCase()}|${String(token || "").trim()}|${PASSWORD_RESET_OTP_SECRET}`,
    )
    .digest("hex");
};

// Local copy of findTeacherByLoginIdentifier (src/lib/server/users.ts did not
// exist when this file was created) — keep in sync with the shared version.
const findTeacherByLoginIdentifier = async (
  firestore: FirebaseFirestore.Firestore,
  loginIdentifier = "",
) => {
  const normalizedInput = String(loginIdentifier || "")
    .trim()
    .toLowerCase();

  if (!normalizedInput) {
    return null;
  }

  const normalizedLoginId = normalizeTeacherLoginId(normalizedInput);
  let teacherSnapshot = await firestore
    .collection("teachers")
    .where("loginId", "==", normalizedLoginId)
    .limit(1)
    .get();

  if (teacherSnapshot.empty && normalizedInput.includes("@")) {
    teacherSnapshot = await firestore
      .collection("teachers")
      .where("authEmail", "==", normalizedInput)
      .limit(1)
      .get();
  }

  if (teacherSnapshot.empty) {
    const localTeacherId = normalizedInput.includes("@")
      ? normalizedInput.split("@")[0].toUpperCase()
      : normalizedInput.toUpperCase();

    teacherSnapshot = await firestore
      .collection("teachers")
      .where("teacherId", "==", localTeacherId)
      .limit(1)
      .get();
  }

  if (teacherSnapshot.empty) {
    return null;
  }

  const teacherDoc = teacherSnapshot.docs[0];
  const teacherData = (teacherDoc.data() || {}) as any;
  const authEmail =
    normalizeEmail(teacherData.authEmail) ||
    normalizeEmail(teacherData.loginId) ||
    normalizeTeacherLoginId(
      teacherData.teacherId || teacherData.employeeId || normalizedInput,
    );

  return {
    uid: teacherDoc.id,
    teacherData,
    authEmail,
    loginId: normalizeTeacherLoginId(
      teacherData.loginId ||
        teacherData.teacherId ||
        teacherData.employeeId ||
        normalizedInput,
    ),
  };
};

export type PasswordResetIdentity = {
  uid: string;
  role: string;
  loginId: string;
  authEmail: string;
  personalEmail: string;
  displayName: string;
};

export const resolveLoginIdentityForPasswordReset = async (
  loginIdentifier = "",
): Promise<PasswordResetIdentity | null> => {
  const normalizedInput = String(loginIdentifier || "")
    .trim()
    .toLowerCase();

  if (!normalizedInput) {
    return null;
  }

  const firestore = adminApp.firestore();

  if (!normalizedInput.includes("@")) {
    const teacherMatch = await findTeacherByLoginIdentifier(
      firestore,
      normalizedInput,
    );

    if (teacherMatch) {
      const personalEmail =
        normalizeEmail(teacherMatch.teacherData.contactEmail) ||
        normalizeEmail(teacherMatch.teacherData.email) ||
        normalizeEmail(teacherMatch.authEmail);

      if (!personalEmail) {
        return null;
      }

      return {
        uid: teacherMatch.uid,
        role: "teacher",
        loginId: normalizedInput,
        authEmail: normalizeEmail(teacherMatch.authEmail),
        personalEmail,
        displayName: String(
          teacherMatch.teacherData.name ||
            teacherMatch.teacherData.fullName ||
            teacherMatch.teacherData.displayName ||
            "",
        ).trim(),
      };
    }

    const normalizedRoll = normalizePrn(normalizedInput);
    if (normalizedRoll) {
      let studentSnapshot = await firestore
        .collection("students")
        .where("loginId", "==", normalizedRoll)
        .limit(1)
        .get();

      if (studentSnapshot.empty) {
        studentSnapshot = await firestore
          .collection("students")
          .where("prn", "==", normalizedRoll)
          .limit(1)
          .get();
      }

      if (studentSnapshot.empty) {
        studentSnapshot = await firestore
          .collection("students")
          .where("rollNo", "==", normalizedRoll)
          .limit(1)
          .get();
      }

      if (!studentSnapshot.empty) {
        const studentDoc = studentSnapshot.docs[0];
        const studentData = (studentDoc.data() || {}) as any;
        const uid = String(studentData.uid || studentDoc.id).trim();

        let authEmail = normalizeEmail(studentData.email);
        if (!authEmail && uid) {
          try {
            const authUser = await adminApp.auth().getUser(uid);
            authEmail = normalizeEmail(authUser.email);
          } catch (authError) {
            authEmail = "";
          }
        }

        const personalEmail =
          normalizeEmail(studentData.contactEmail) ||
          normalizeEmail(studentData.personalEmail) ||
          normalizeEmail(studentData.email) ||
          authEmail;

        if (uid && authEmail && personalEmail) {
          return {
            uid,
            role: "student",
            loginId: normalizedInput,
            authEmail,
            personalEmail,
            displayName: String(studentData.name || "").trim(),
          };
        }
      }
    }
  }

  const authEmailInput = normalizeEmail(normalizedInput);
  if (!authEmailInput) {
    return null;
  }

  let userRecord = null;
  try {
    userRecord = await adminApp.auth().getUserByEmail(authEmailInput);
  } catch (error) {
    if ((error as any).code !== "auth/user-not-found") {
      throw error;
    }
  }

  if (!userRecord) {
    const teacherMatch = await findTeacherByLoginIdentifier(
      firestore,
      authEmailInput,
    );

    if (!teacherMatch) {
      return null;
    }

    const personalEmail =
      normalizeEmail(teacherMatch.teacherData.contactEmail) ||
      normalizeEmail(teacherMatch.teacherData.email) ||
      normalizeEmail(teacherMatch.authEmail);

    if (!personalEmail) {
      return null;
    }

    return {
      uid: teacherMatch.uid,
      role: "teacher",
      loginId: authEmailInput,
      authEmail: normalizeEmail(teacherMatch.authEmail) || authEmailInput,
      personalEmail,
      displayName: String(
        teacherMatch.teacherData.name ||
          teacherMatch.teacherData.fullName ||
          teacherMatch.teacherData.displayName ||
          "",
      ).trim(),
    };
  }

  const uid = userRecord.uid;
  const authEmail = normalizeEmail(userRecord.email) || authEmailInput;

  const [teacherDoc, studentDoc, userDoc] = await Promise.all([
    firestore.collection("teachers").doc(uid).get(),
    firestore.collection("students").doc(uid).get(),
    firestore.collection("users").doc(uid).get(),
  ]);

  let role = "admin";
  let displayName = String(userRecord.displayName || "").trim();
  let personalEmail = authEmail;

  if (teacherDoc.exists) {
    const teacherData = (teacherDoc.data() || {}) as any;
    role = "teacher";
    personalEmail =
      normalizeEmail(teacherData.contactEmail) ||
      normalizeEmail(teacherData.email) ||
      authEmail;
    displayName = String(
      teacherData.name ||
        teacherData.fullName ||
        teacherData.displayName ||
        displayName,
    ).trim();
  } else if (studentDoc.exists || userDoc.exists) {
    const studentData = (studentDoc.exists ? studentDoc.data() || {} : {}) as any;
    const userData = (userDoc.exists ? userDoc.data() || {} : {}) as any;

    role = "student";
    personalEmail =
      normalizeEmail(userData.contactEmail) ||
      normalizeEmail(studentData.contactEmail) ||
      normalizeEmail(userData.personalEmail) ||
      normalizeEmail(studentData.personalEmail) ||
      normalizeEmail(userData.email) ||
      normalizeEmail(studentData.email) ||
      authEmail;
    displayName = String(
      userData.name || studentData.name || displayName,
    ).trim();
  }

  return {
    uid,
    role,
    loginId: authEmailInput,
    authEmail,
    personalEmail: normalizeEmail(personalEmail) || authEmail,
    displayName,
  };
};

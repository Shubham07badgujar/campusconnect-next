import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";
import {
  normalizeBranch,
  normalizeJobProfile,
  normalizePhone,
} from "@/lib/server/constants";
import { getSubjectSetsMap } from "@/lib/server/subject-sets";
import {
  generateSecurePassword,
  normalizeTeacherLoginId,
} from "@/lib/server/passwords";
import { sendMail } from "@/lib/server/mailer";
import {
  normalizeTeacherAssignments,
  getAssignmentSummaryFields,
  buildLegacyAssignedCourses,
  generateTeacherId,
  syncTeacherStudentMappings,
} from "@/lib/server/users";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json();
    const firestore = adminApp.firestore();
    const fullName = String(body.fullName || body.name || "").trim();
    const contactEmail = String(body.email || "")
      .trim()
      .toLowerCase();
    const jobProfile = normalizeJobProfile(body.jobProfile || "");
    const department = normalizeBranch(body.department || body.dept || "");
    const mobile = normalizePhone(body.mobile || body.phone || "");

    if (!fullName || !contactEmail || !jobProfile || !department || !mobile) {
      return NextResponse.json(
        {
          message:
            "Full Name, Email, Mobile, Job Profile and Department are required fields.",
        },
        { status: 400 },
      );
    }

    const subjectSetsMap = await getSubjectSetsMap();
    const assignments = normalizeTeacherAssignments({
      assignments: body.assignments,
      subjectSetsMap,
      fallbackBranch: department,
      legacyAssignedCourses: body.assignedCourses,
    });
    const assignmentSummary = getAssignmentSummaryFields(assignments);

    let user;
    let isNewUser = false;
    const generatedPassword = generateSecurePassword();

    let existingTeacherDoc = null;
    const byContactEmailSnapshot = await firestore
      .collection("teachers")
      .where("contactEmail", "==", contactEmail)
      .limit(1)
      .get();

    if (!byContactEmailSnapshot.empty) {
      existingTeacherDoc = byContactEmailSnapshot.docs[0];
    } else {
      const byLegacyEmailSnapshot = await firestore
        .collection("teachers")
        .where("email", "==", contactEmail)
        .limit(1)
        .get();
      if (!byLegacyEmailSnapshot.empty) {
        existingTeacherDoc = byLegacyEmailSnapshot.docs[0];
      }
    }

    const existingTeacherData = (
      existingTeacherDoc ? existingTeacherDoc.data() : {}
    ) as Record<string, any>;
    const existingTeacherUid = existingTeacherDoc ? existingTeacherDoc.id : "";

    const previousProfile = normalizeJobProfile(
      existingTeacherData.jobProfile || "",
    );
    const shouldRegenerateId =
      !existingTeacherData.employeeId ||
      (previousProfile && previousProfile !== jobProfile);
    const employeeId = shouldRegenerateId
      ? await generateTeacherId(firestore, jobProfile)
      : existingTeacherData.employeeId;
    const loginId = normalizeTeacherLoginId(employeeId);
    const authEmail = loginId;

    try {
      if (existingTeacherUid) {
        user = await adminApp.auth().getUser(existingTeacherUid);
      } else {
        user = await adminApp.auth().getUserByEmail(authEmail);
      }

      await adminApp.auth().updateUser(user.uid, {
        email: authEmail,
        password: generatedPassword,
        displayName: fullName,
      });
    } catch (err) {
      if ((err as { code?: string }).code === "auth/user-not-found") {
        user = await adminApp.auth().createUser({
          email: authEmail,
          displayName: fullName,
          password: generatedPassword,
        });
        isNewUser = true;
      } else {
        throw err;
      }
    }

    await adminApp.auth().setCustomUserClaims(user.uid, { teacher: true });

    const teacherPayload = {
      uid: user.uid,
      name: fullName,
      fullName,
      displayName: fullName,
      email: contactEmail,
      jobProfile,
      employeeId,
      teacherId: employeeId,
      loginId,
      authEmail,
      contactEmail,
      mobile,
      phone: mobile,
      dept: department,
      department,
      assignments,
      ...assignmentSummary,
      assignedCourses: buildLegacyAssignedCourses(assignments),
      updatedAt: new Date().toISOString(),
      createdAt: existingTeacherData.createdAt || new Date().toISOString(),
    };

    await firestore.collection("teachers").doc(user.uid).set(teacherPayload, {
      merge: true,
    });

    await syncTeacherStudentMappings({
      firestore,
      teacherUid: user.uid,
      teacherId: employeeId,
      teacherName: fullName,
      assignments,
    });

    const mailText = `Hi ${fullName},

You have been ${isNewUser ? "added as a teacher" : "updated"} in CampusConnect.

Teacher ID: ${employeeId}
  Login ID: ${loginId}
Job Profile: ${jobProfile}
  Login Email: ${authEmail}
Password: ${generatedPassword}

Please log in and change your password after first login.

- CampusConnect Team`;

    await sendMail({
      to: contactEmail,
      subject: "Your CampusConnect Teacher Login",
      text: mailText,
    });

    return NextResponse.json(
      {
        message: isNewUser
          ? "Teacher added and login email sent successfully."
          : "Teacher updated and new credentials sent successfully.",
        teacher: {
          uid: user.uid,
          employeeId,
          teacherId: employeeId,
          loginId,
          jobProfile,
        },
        credentials: {
          loginId,
          authEmail,
          password: generatedPassword,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error creating teacher:", error);
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}

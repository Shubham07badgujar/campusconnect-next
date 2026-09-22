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
  syncTeacherStudentMappings,
} from "@/lib/server/users";
import { allocateFreeTeacherId } from "@/lib/server/teacher-ids";
import { writeTeacherDirectory } from "@/lib/server/teacher-directory";

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

    let employeeId: string = existingTeacherData.employeeId;
    let loginId = normalizeTeacherLoginId(employeeId);
    let authEmail = loginId;

    if (existingTeacherUid && !shouldRegenerateId) {
      // Updating a teacher we have already identified by their contact email.
      // Reusing their own account is exactly right here.
      user = await adminApp.auth().getUser(existingTeacherUid);
      await adminApp.auth().updateUser(user.uid, {
        email: authEmail,
        password: generatedPassword,
        displayName: fullName,
      });
    } else if (existingTeacherUid) {
      // Known teacher changing job profile, so their ID (and login) moves.
      employeeId = await allocateFreeTeacherId(firestore, jobProfile);
      loginId = normalizeTeacherLoginId(employeeId);
      authEmail = loginId;

      user = await adminApp.auth().getUser(existingTeacherUid);
      await adminApp.auth().updateUser(user.uid, {
        email: authEmail,
        password: generatedPassword,
        displayName: fullName,
      });
    } else {
      // CREATING. The previous implementation called getUserByEmail() here and,
      // on a hit, ran updateUser() on whatever account it found — resetting a
      // different teacher's password and renaming their account. An existing
      // account at this address is a COLLISION, never something to adopt.
      //
      // Firebase Auth's unique-email constraint is the authority: we allocate,
      // attempt creation, and on a clash allocate the next id instead. With a
      // monotonic counter this normally succeeds first time; the loop covers
      // ids that predate the counter.
      let created = false;
      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        employeeId = await allocateFreeTeacherId(firestore, jobProfile);
        loginId = normalizeTeacherLoginId(employeeId);
        authEmail = loginId;

        try {
          user = await adminApp.auth().createUser({
            email: authEmail,
            displayName: fullName,
            password: generatedPassword,
          });
          created = true;
          isNewUser = true;
        } catch (err) {
          if ((err as { code?: string }).code !== "auth/email-already-exists") {
            throw err;
          }
          // That login address is taken by an account we must not touch — most
          // likely a teacher whose Firestore record was deleted while their
          // sign-in survived. Move to the next id.
        }
      }

      if (!created) {
        return NextResponse.json(
          {
            message:
              "Could not allocate a free teacher login. Some teacher accounts " +
              "may exist in authentication without a matching record.",
          },
          { status: 409 },
        );
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

    // Publish the student-visible projection. `teachers` itself is staff-only,
    // because it carries mobile numbers and the sign-in identifier.
    await writeTeacherDirectory(firestore, user.uid, teacherPayload);

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

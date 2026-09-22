import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";
import {
  normalizeBranch,
  normalizeJobProfile,
  normalizePhone,
} from "@/lib/server/constants";
import { getSubjectSetsMap } from "@/lib/server/subject-sets";
import { normalizeTeacherLoginId } from "@/lib/server/passwords";
import {
  normalizeTeacherAssignments,
  getAssignmentSummaryFields,
  buildLegacyAssignedCourses,
  syncTeacherStudentMappings,
} from "@/lib/server/users";
import { allocateFreeTeacherId } from "@/lib/server/teacher-ids";
import { writeTeacherDirectory } from "@/lib/server/teacher-directory";
import { reportError } from "@/lib/server/logger";

export const runtime = "nodejs";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const { uid } = await params;
    if (!uid) {
      return NextResponse.json(
        { message: "Teacher UID is required." },
        { status: 400 },
      );
    }

    const body = await req.json();
    const firestore = adminApp.firestore();
    const teacherDocRef = firestore.collection("teachers").doc(uid);
    const teacherDoc = await teacherDocRef.get();

    if (!teacherDoc.exists) {
      return NextResponse.json({ message: "Teacher not found." }, { status: 404 });
    }

    const existingTeacherData = teacherDoc.data() as Record<string, any>;
    const fullName = String(
      body.fullName || body.name || existingTeacherData.name || "",
    ).trim();
    const contactEmail = String(
      body.email ||
        existingTeacherData.contactEmail ||
        existingTeacherData.email ||
        "",
    )
      .trim()
      .toLowerCase();
    const jobProfile = normalizeJobProfile(
      body.jobProfile || existingTeacherData.jobProfile || "",
    );
    const department = normalizeBranch(
      body.department ||
        body.dept ||
        existingTeacherData.department ||
        existingTeacherData.dept ||
        "",
    );
    const mobile = normalizePhone(
      body.mobile ||
        body.phone ||
        existingTeacherData.mobile ||
        existingTeacherData.phone ||
        "",
    );

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
      legacyAssignedCourses:
        body.assignedCourses || existingTeacherData.assignedCourses,
    });
    const assignmentSummary = getAssignmentSummaryFields(assignments);

    const previousProfile = normalizeJobProfile(
      existingTeacherData.jobProfile || "",
    );
    // `previousProfile &&` matters: normalizeJobProfile returns "" for a blank
    // or unrecognised stored profile, and without this guard "" !== jobProfile
    // was true on every save — handing the teacher a new ID, and therefore a
    // new sign-in address, every time they were edited.
    const shouldRegenerateId =
      !existingTeacherData.employeeId ||
      (previousProfile && previousProfile !== jobProfile);
    const employeeId = shouldRegenerateId
      ? await allocateFreeTeacherId(firestore, jobProfile)
      : existingTeacherData.employeeId;
    const loginId = normalizeTeacherLoginId(employeeId);
    const authEmail = loginId;

    const updatePayload = {
      uid,
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
    };

    await teacherDocRef.set(updatePayload, { merge: true });

    // Keep the student-visible projection in step with the record.
    await writeTeacherDirectory(firestore, uid, {
      ...existingTeacherData,
      ...updatePayload,
    });

    await syncTeacherStudentMappings({
      firestore,
      teacherUid: uid,
      teacherId: employeeId,
      teacherName: fullName,
      assignments,
    });

    try {
      await adminApp.auth().updateUser(uid, {
        displayName: fullName,
        email: authEmail,
      });
      await adminApp.auth().setCustomUserClaims(uid, { teacher: true });
    } catch (authError) {
      reportError("Teacher auth update warning", (authError as Error).message, {
        route: "/api/teachers/[uid]",
      });
    }

    return NextResponse.json(
      {
        message: "Teacher updated successfully.",
        teacher: {
          uid,
          employeeId,
          teacherId: employeeId,
          loginId,
          jobProfile,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    reportError("Error updating teacher", error, { route: "/api/teachers/[uid]" });
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}

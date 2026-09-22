import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";
import { generateSecurePassword } from "@/lib/server/passwords";
import { sendMail } from "@/lib/server/mailer";
import { getSubjectSetsMap } from "@/lib/server/subject-sets";
import { buildStudentProfile, writeStudentProfile } from "@/lib/server/students";
import { reportError } from "@/lib/server/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  const body = await req.json().catch(() => ({}));
  const { name, email, rollNo, dept, year, semester, phone, contactEmail } = body;
  // Always generate the password server-side; any client-supplied value is ignored.
  const password = generateSecurePassword();

  try {
    const firestore = adminApp.firestore();
    const subjectSets = await getSubjectSetsMap();

    let existingUser = null;
    try {
      existingUser = await adminApp.auth().getUserByEmail(email);
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found") {
        throw error;
      }
    }

    if (existingUser) {
      const userDoc = await firestore
        .collection("users")
        .where("email", "==", email)
        .get();

      if (!userDoc.empty) {
        return NextResponse.json(
          { message: "User already exists in both Firebase Auth and Firestore" },
          { status: 400 },
        );
      }

      // Auth account exists but has no profile — build and attach one.
      const built = buildStudentProfile(
        {
          uid: existingUser.uid,
          name,
          email,
          rollNo,
          dept,
          year,
          semester,
          phone,
          contactEmail,
          onboardingSource: "admin_single_link",
        },
        subjectSets,
      );

      if (built.ok === false) {
        return NextResponse.json(
          { message: built.errors.join(" "), errors: built.errors },
          { status: 400 },
        );
      }

      await writeStudentProfile(firestore, built.profile);

      await sendMail({
        to: email,
        subject: "Your CampusConnect Account",
        text: `Hi ${built.profile.name},\n\nYour account already exists in CampusConnect.\n\n- CampusConnect Team`,
      });

      return NextResponse.json(
        {
          message: "User exists. Added to Firestore and notified.",
          uid: existingUser.uid,
          subjects: built.profile.subjects,
        },
        { status: 200 },
      );
    }

    // Validate BEFORE creating the Auth account, so a rejected record does not
    // leave an orphaned Firebase Auth user behind.
    const validation = buildStudentProfile(
      {
        uid: "pending",
        name,
        email,
        rollNo,
        dept,
        year,
        semester,
        phone,
        contactEmail,
        onboardingSource: "admin_single",
      },
      subjectSets,
    );

    if (validation.ok === false) {
      return NextResponse.json(
        { message: validation.errors.join(" "), errors: validation.errors },
        { status: 400 },
      );
    }

    const userRecord = await adminApp.auth().createUser({
      email: validation.profile.email,
      password,
      displayName: validation.profile.name,
    });

    await writeStudentProfile(firestore, {
      ...validation.profile,
      uid: userRecord.uid,
    });

    await sendMail({
      to: email,
      subject: "Your CampusConnect Account",
      text: `Hi ${validation.profile.name},\n\nYour account has been created.\nEmail: ${validation.profile.email}\nPassword: ${password}\n\n- CampusConnect Team`,
    });

    return NextResponse.json(
      {
        message: "User created and email sent",
        uid: userRecord.uid,
        subjects: validation.profile.subjects,
      },
      { status: 200 },
    );
  } catch (error) {
    reportError("Failed to create student", error, { route: "/api/users" });
    return NextResponse.json(
      { message: "Failed to create student." },
      { status: 500 },
    );
  }
}

/**
 * Update an existing student.
 *
 * This used to be a direct `updateDoc` from the admin screen, which wrote only
 * `users/{uid}` and never recomputed `subjects`. Moving a student to another
 * year therefore left them carrying their OLD year's subjects: excluded from
 * their new class's attendance sessions while still matching the old one. It
 * also never touched Firebase Auth, so editing the email diverged the login
 * from the record and broke password reset.
 *
 * Routing edits through the server lets the same buildStudentProfile() that
 * governs creation govern edits too, so the two cannot disagree.
 */
export async function PUT(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  const body = await req.json().catch(() => ({}));
  const { uid, name, email, rollNo, dept, year, semester, phone, contactEmail } =
    body;

  const targetUid = String(uid || "").trim();
  if (!targetUid) {
    return NextResponse.json({ message: "uid is required" }, { status: 400 });
  }

  try {
    const firestore = adminApp.firestore();
    const existingDoc = await firestore.collection("users").doc(targetUid).get();
    if (!existingDoc.exists) {
      return NextResponse.json({ message: "Student not found" }, { status: 404 });
    }

    const existing = (existingDoc.data() || {}) as Record<string, unknown>;
    const subjectSets = await getSubjectSetsMap();

    // Subjects are recomputed from the SUBMITTED branch/year/semester — that is
    // the whole point of routing edits through here.
    const built = buildStudentProfile(
      {
        uid: targetUid,
        name,
        email,
        rollNo,
        dept,
        year,
        semester,
        // Fall back to stored values so an edit form that does not expose these
        // fields cannot blank them.
        phone: phone ?? existing.phone ?? existing.mobile,
        contactEmail: contactEmail ?? existing.contactEmail,
        onboardingSource: String(existing.onboardingSource || "admin_edit"),
      },
      subjectSets,
    );

    if (built.ok === false) {
      return NextResponse.json(
        { message: built.errors.join(" "), errors: built.errors },
        { status: 400 },
      );
    }

    // Keep the Auth account in step with the record. Without this a student
    // would keep signing in with the old address while the profile showed the
    // new one, and password reset (which reads the profile email) would target
    // an account that does not exist.
    const previousEmail = String(existing.email || "")
      .trim()
      .toLowerCase();
    let emailChanged = false;

    if (built.profile.email && built.profile.email !== previousEmail) {
      try {
        await adminApp.auth().updateUser(targetUid, {
          email: built.profile.email,
          displayName: built.profile.name,
        });
        emailChanged = true;
      } catch (error) {
        if ((error as { code?: string }).code === "auth/email-already-exists") {
          return NextResponse.json(
            { message: "That email is already used by another account." },
            { status: 400 },
          );
        }
        throw error;
      }
    } else {
      await adminApp
        .auth()
        .updateUser(targetUid, { displayName: built.profile.name })
        .catch(() => {
          // A missing Auth user must not block the profile update — the record
          // is still what the admin screens read.
        });
    }

    await writeStudentProfile(firestore, built.profile, { mode: "update" });

    return NextResponse.json(
      {
        message: emailChanged
          ? "Student updated. Their sign-in email changed too."
          : "Student updated.",
        uid: targetUid,
        subjects: built.profile.subjects,
        emailChanged,
      },
      { status: 200 },
    );
  } catch (error) {
    reportError("Failed to update student", error, { route: "/api/users" });
    return NextResponse.json(
      { message: "Failed to update student." },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";
import { generateSecurePassword } from "@/lib/server/passwords";
import { sendMail } from "@/lib/server/mailer";
import { getSubjectSetsMap } from "@/lib/server/subject-sets";
import { buildStudentProfile, writeStudentProfile } from "@/lib/server/students";

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
    console.error("Failed to create student:", error);
    return NextResponse.json(
      { message: "Failed to create student." },
      { status: 500 },
    );
  }
}

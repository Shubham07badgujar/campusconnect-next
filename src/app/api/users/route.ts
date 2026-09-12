import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";
import { generateSecurePassword } from "@/lib/server/passwords";
import { sendMail } from "@/lib/server/mailer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  const body = await req.json();
  const { name, email, rollNo, dept, year, semester } = body;
  // Always generate the password server-side; any client-supplied value is ignored.
  const password = generateSecurePassword();

  try {
    let existingUser = null;
    try {
      existingUser = await adminApp.auth().getUserByEmail(email);
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found") {
        throw error;
      }
    }

    if (existingUser) {
      const firestore = adminApp.firestore();
      const userDoc = await firestore
        .collection("users")
        .where("email", "==", email)
        .get();

      if (userDoc.empty) {
        await firestore
          .collection("users")
          .doc(existingUser.uid)
          .set({
            name,
            email,
            uid: existingUser.uid,
            rollNo,
            rollNumber: rollNo,
            dept,
            year: year || "",
            semester: semester || "",
            role: "Student",
            createdAt: new Date().toISOString(),
          });

        await sendMail({
          to: email,
          subject: "Your CampusConnect Account",
          text: `Hi ${name},\n\nYour account already exists in CampusConnect.\n\n- CampusConnect Team`,
        });

        return NextResponse.json(
          {
            message: "User exists. Added to Firestore and notified.",
            uid: existingUser.uid,
          },
          { status: 200 },
        );
      } else {
        return NextResponse.json(
          {
            message: "User already exists in both Firebase Auth and Firestore",
          },
          { status: 400 },
        );
      }
    }

    const userRecord = await adminApp.auth().createUser({
      email,
      password,
      displayName: name,
    });

    const firestore = adminApp.firestore();
    await firestore
      .collection("users")
      .doc(userRecord.uid)
      .set({
        name,
        email,
        uid: userRecord.uid,
        rollNo,
        rollNumber: rollNo,
        dept,
        year: year || "",
        semester: semester || "",
        role: "Student",
      });

    await sendMail({
      to: email,
      subject: "Your CampusConnect Account",
      text: `Hi ${name},\n\nYour account has been created.\nEmail: ${email}\nPassword: ${password}\n\n- CampusConnect Team`,
    });

    return NextResponse.json(
      {
        message: "User created and email sent",
        uid: userRecord.uid,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}

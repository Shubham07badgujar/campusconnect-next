import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";
import {
  normalizeBranch,
  normalizePhone,
  normalizeSemester,
  normalizeYear,
} from "@/lib/server/constants";
import { getSubjectSetsMap } from "@/lib/server/subject-sets";
import {
  generateSecurePassword,
  makeStudentAuthEmail,
} from "@/lib/server/passwords";
import { sendMail } from "@/lib/server/mailer";
import { buildExistingStudentIndex } from "@/lib/server/onboarding";
import { reportError } from "@/lib/server/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { students, duplicateStrategy = "skip" } = body;
    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json(
        { message: "No student entries provided" },
        { status: 400 },
      );
    }

    if (!["skip", "update"].includes(duplicateStrategy)) {
      return NextResponse.json(
        {
          message: "Invalid duplicate strategy. Use 'skip' or 'update'.",
        },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();
    const subjectSets: any = await getSubjectSetsMap();
    const existingByPrn = await buildExistingStudentIndex(firestore);

    const inBatchPrns = new Set();
    const failedEntries: any[] = [];
    const createdEntries: any[] = [];
    const skippedExistingEntries: any[] = [];
    const updatedEntries: any[] = [];
    const manualCredentialEntries: any[] = [];
    let credentialsSentCount = 0;

    for (const rawEntry of students) {
      const name = String(rawEntry.name || "").trim();
      const prn = String(rawEntry.prn || "")
        .trim()
        .toUpperCase();
      const phone = normalizePhone(rawEntry.phone || "");
      const branch = normalizeBranch(rawEntry.branch || "");
      const year = normalizeYear(rawEntry.year || "");
      const semester = normalizeSemester(rawEntry.semester || "");
      const contactEmail = String(rawEntry.email || "")
        .trim()
        .toLowerCase();

      const rowErrors: any[] = [];
      if (!name) rowErrors.push("Missing name");
      if (!prn) rowErrors.push("Missing PRN");
      if (!phone) rowErrors.push("Missing/invalid mobile number");
      if (!branch) rowErrors.push("Missing/invalid branch");
      if (!year) rowErrors.push("Missing/invalid year");
      if (!semester) rowErrors.push("Missing/invalid semester");
      if (prn && inBatchPrns.has(prn))
        rowErrors.push("Duplicate PRN in upload");

      const subjects = subjectSets?.[branch]?.[year]?.[semester] || [];
      if (subjects.length === 0) {
        rowErrors.push("No subject set configured for branch/year/semester");
      }

      if (rowErrors.length > 0) {
        failedEntries.push({ name, prn, reason: rowErrors.join(", ") });
        continue;
      }

      inBatchPrns.add(prn);
      const authEmail = makeStudentAuthEmail(prn);
      const password = generateSecurePassword();

      if (existingByPrn.has(prn)) {
        const existing = existingByPrn.get(prn);

        if (duplicateStrategy === "skip") {
          skippedExistingEntries.push({
            name,
            prn,
            reason: "Already enrolled (PRN exists)",
            existingUid: existing.uid || "",
            existingEmail: existing.email || "",
          });
          continue;
        }

        const mergedPayload: any = {
          name,
          prn,
          rollNo: prn,
          rollNumber: prn,
          phone,
          mobile: phone,
          dept: branch,
          department: branch,
          year,
          semester,
          subjects,
          role: "Student",
          contactEmail: contactEmail || "",
          onboardingSource: "bulk_upload_update",
          updatedAt: new Date().toISOString(),
        };

        const targetUid =
          existing.uid || existing.userDocId || existing.studentDocId;
        const keepEmail = existing.email || "";
        if (keepEmail) {
          mergedPayload.email = keepEmail;
        }
        if (targetUid) {
          mergedPayload.uid = targetUid;
        }

        if (existing.userDocId || targetUid) {
          await firestore
            .collection("users")
            .doc(existing.userDocId || targetUid)
            .set(mergedPayload, { merge: true });
        }

        if (existing.studentDocId || targetUid) {
          await firestore
            .collection("students")
            .doc(existing.studentDocId || targetUid)
            .set(mergedPayload, { merge: true });
        }

        updatedEntries.push({
          name,
          prn,
          existingUid: existing.uid || "",
          existingEmail: existing.email || "",
        });
        continue;
      }

      try {
        const existingAuthUser = await adminApp
          .auth()
          .getUserByEmail(authEmail)
          .catch((e: any) => {
            if (e.code === "auth/user-not-found") return null;
            throw e;
          });

        if (existingAuthUser) {
          failedEntries.push({
            name,
            prn,
            reason: "Duplicate PRN (auth account already exists)",
          });
          continue;
        }

        const userRecord = await adminApp.auth().createUser({
          email: authEmail,
          password,
          displayName: name,
        });

        const studentPayload = {
          uid: userRecord.uid,
          name,
          email: authEmail,
          loginId: prn,
          prn,
          rollNo: prn,
          rollNumber: prn,
          phone,
          mobile: phone,
          dept: branch,
          department: branch,
          year,
          semester,
          subjects,
          role: "Student",
          contactEmail: contactEmail || "",
          onboardingSource: "bulk_upload",
          createdAt: new Date().toISOString(),
        };

        await firestore
          .collection("users")
          .doc(userRecord.uid)
          .set(studentPayload);
        await firestore
          .collection("students")
          .doc(userRecord.uid)
          .set(studentPayload, { merge: true });

        if (contactEmail) {
          try {
            await sendMail({
              to: contactEmail,
              subject: "CampusConnect Student Login Credentials",
              text: `Hi ${name},\n\nYour CampusConnect account is ready.\nLogin ID: ${prn}\nSystem Email: ${authEmail}\nPassword: ${password}\n\nPlease change your password after first login.`,
            });
            credentialsSentCount += 1;
          } catch (mailError: any) {
            reportError("Credential email failed", mailError.message, {
              route: "/api/admin/bulk-onboard-students",
            });
            manualCredentialEntries.push({
              name,
              prn,
              phone,
              branch,
              year,
              semester,
              contactEmail,
              loginId: prn,
              systemEmail: authEmail,
              password,
              reason: `Email delivery failed: ${mailError.message}`,
            });
          }
        } else {
          manualCredentialEntries.push({
            name,
            prn,
            phone,
            branch,
            year,
            semester,
            contactEmail: "",
            loginId: prn,
            systemEmail: authEmail,
            password,
            reason: "Contact email missing in uploaded data",
          });
        }

        createdEntries.push({
          uid: userRecord.uid,
          name,
          prn,
          email: authEmail,
        });
        existingByPrn.set(prn, {
          prn,
          uid: userRecord.uid,
          email: authEmail,
          userDocId: userRecord.uid,
          studentDocId: userRecord.uid,
        });
      } catch (createError: any) {
        failedEntries.push({
          name,
          prn,
          reason: createError.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalProcessed: students.length,
        createdCount: createdEntries.length,
        updatedCount: updatedEntries.length,
        skippedExistingCount: skippedExistingEntries.length,
        failedCount: failedEntries.length,
        credentialsSentCount,
        manualCredentialCount: manualCredentialEntries.length,
        createdEntries,
        updatedEntries,
        skippedExistingEntries,
        failedEntries,
        manualCredentialEntries,
        duplicateStrategy,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

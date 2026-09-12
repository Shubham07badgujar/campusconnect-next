import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAdmin } from "@/lib/server/auth-guards";
import { buildExistingStudentIndex } from "@/lib/server/onboarding";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { students } = body;
    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json(
        { message: "No student entries provided" },
        { status: 400 },
      );
    }

    const firestore = adminApp.firestore();
    const existingByPrn = await buildExistingStudentIndex(firestore);

    const inFilePrn = new Set();
    const duplicateInDb: any[] = [];
    const duplicateInFile: any[] = [];

    students.forEach((rawEntry: any) => {
      const prn = String(rawEntry.prn || "")
        .trim()
        .toUpperCase();
      const name = String(rawEntry.name || "").trim();

      if (!prn) return;

      if (inFilePrn.has(prn)) {
        duplicateInFile.push({ prn, name });
      }
      inFilePrn.add(prn);

      if (existingByPrn.has(prn)) {
        const existing = existingByPrn.get(prn);
        duplicateInDb.push({
          prn,
          name,
          existingUid: existing.uid || "",
          existingEmail: existing.email || "",
        });
      }
    });

    return NextResponse.json({
      success: true,
      precheck: {
        totalRows: students.length,
        duplicateDbCount: duplicateInDb.length,
        duplicateFileCount: duplicateInFile.length,
        duplicateInDb,
        duplicateInFile,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

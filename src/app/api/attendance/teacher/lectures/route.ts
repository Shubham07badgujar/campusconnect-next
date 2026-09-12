import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireTeacher } from "@/lib/server/auth-guards";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const g = await requireTeacher(req);
  if (g.ok === false) return g.response;

  try {
    const firestore = adminApp.firestore();

    const snapshot = await firestore
      .collection("timetables")
      .where("teacherId", "==", g.uid)
      .get();

    const lectures = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Record<string, any>),
      }))
      .sort((a: Record<string, any>, b: Record<string, any>) => {
        const dayOrder: Record<string, number> = {
          Monday: 1,
          Tuesday: 2,
          Wednesday: 3,
          Thursday: 4,
          Friday: 5,
          Saturday: 6,
          Sunday: 7,
        };

        const dayA = dayOrder[String(a.day || "")] || 99;
        const dayB = dayOrder[String(b.day || "")] || 99;
        if (dayA !== dayB) return dayA - dayB;

        return String(a.startTime || "").localeCompare(
          String(b.startTime || ""),
        );
      });

    return NextResponse.json({ success: true, lectures }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 },
    );
  }
}

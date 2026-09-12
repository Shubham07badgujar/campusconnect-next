import { NextRequest, NextResponse } from "next/server";
import adminApp from "@/lib/server/firebase-admin";
import { requireAuthenticatedUser } from "@/lib/server/auth-guards";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teacherId: string }> },
) {
  const g = await requireAuthenticatedUser(req);
  if (g.ok === false) return g.response;

  try {
    const { teacherId: teacherIdParam } = await params;
    const teacherId = String(teacherIdParam || "").trim();
    if (!teacherId) {
      return NextResponse.json(
        { message: "teacherId is required." },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(req.url);
    const dayFilter = String(searchParams.get("day") || "").trim();
    const firestore = adminApp.firestore();

    let queryRef = firestore
      .collection("timetables")
      .where("teacherId", "==", teacherId);

    if (dayFilter) {
      queryRef = queryRef.where("day", "==", dayFilter);
    }

    const snapshot = await queryRef.get();
    const lectures = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Record<string, any>),
      }))
      .sort((a: Record<string, any>, b: Record<string, any>) => {
        const dayOrder = [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ];
        const dayDiff =
          dayOrder.indexOf(a.day || "") - dayOrder.indexOf(b.day || "");
        if (dayDiff !== 0) return dayDiff;
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

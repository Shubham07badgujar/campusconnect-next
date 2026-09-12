import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Lightweight liveness probe for Render health checks — no auth, no Firestore.
export async function GET() {
  return NextResponse.json({ ok: true, service: "campusconnect", ts: Date.now() });
}

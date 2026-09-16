import { NextResponse } from "next/server";
import { computeStatus } from "@/lib/server/keep-alive";

export const runtime = "nodejs";
// Must never be statically prerendered — every hit has to reach the live
// server, because reaching the server is the whole point of the route.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(computeStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}

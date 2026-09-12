import { NextRequest, NextResponse } from "next/server";
import { requireTeacherOrAdmin } from "@/lib/server/auth-guards";
import { deleteMaterialAsset } from "@/lib/server/cloudinary";

export const runtime = "nodejs";

// Delete file from Cloudinary
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ publicId: string[] }> },
) {
  // Only teachers and admins may delete uploaded assets
  const g = await requireTeacherOrAdmin(req);
  if (g.ok === false) return g.response;

  try {
    const { publicId } = await params;
    const decodedPublicId = decodeURIComponent(
      (Array.isArray(publicId) ? publicId : [publicId]).join("/"),
    );

    // Only assets under this app's material folder may be deleted here
    const outcome = await deleteMaterialAsset(decodedPublicId);
    if (outcome.allowed === false) {
      return NextResponse.json(
        { message: "Only study material assets can be deleted." },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      result: outcome.result,
    });
  } catch (error: any) {
    console.error("Delete error:", error);
    return NextResponse.json(
      {
        message: "Failed to delete file",
        error: error.message,
      },
      { status: 500 },
    );
  }
}

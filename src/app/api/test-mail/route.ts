import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/auth-guards";
import { createMailTransporter } from "@/lib/server/mailer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const g = await requireAdmin(req);
  if (g.ok === false) return g.response;

  const transporter = createMailTransporter();

  try {
    await transporter.verify();

    const info = await transporter.sendMail({
      from: `"CampusConnect" <${process.env.EMAIL_USERNAME}>`,
      to: "koliviraj555@gmail.com",
      subject: "Test Email",
      text: "Yeh test email hai from Nodemailer",
    });

    return new NextResponse("Test email sent: " + info.messageId);
  } catch (err) {
    return new NextResponse(
      "Error sending test mail: " + (err as Error).message,
      { status: 500 },
    );
  }
}

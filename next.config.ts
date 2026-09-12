import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only packages that must not be bundled by webpack (native/worker assets)
  serverExternalPackages: [
    "tesseract.js",
    "pdf-parse",
    "firebase-admin",
    "cloudinary",
    "nodemailer",
    "@simplewebauthn/server",
  ],
  async rewrites() {
    // Legacy-path shims: the old Express API exposed some route groups outside /api.
    // Keeping these lets any un-migrated fetch keep working during the port.
    return [
      { source: "/attendance/:path*", destination: "/api/attendance/:path*" },
      { source: "/timetable/:path*", destination: "/api/timetable/:path*" },
      { source: "/verify-admin", destination: "/api/auth/verify-admin" },
    ];
  },
};

export default nextConfig;

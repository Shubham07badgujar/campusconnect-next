"use client";

// Public marketing pages keep the legacy top navbar (Home / About / Login).
import Navbar from "@/components/common/Navbar";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <div className="pt-16" />
      {children}
    </>
  );
}

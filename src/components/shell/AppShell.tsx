"use client";

// The authenticated application shell: role-aware sidebar + header + content.
// Mounted by the (protected)/(student)/(teacher)/(admin) route-group layouts.
// Role detection here is a UI convenience only — the real authorization lives
// in the route-group guards and the server-side API guards.
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import Sidebar, { SidebarBrand, SidebarNav } from "./Sidebar";
import Header from "./Header";
import { PageLoader } from "@/components/ui/States";

const COLLAPSE_KEY = "cc_sidebar_collapsed";

export default function AppShell({ children }: { children: ReactNode }) {
  const { user, role, loading } = useUserRole();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // ignore storage failures
    }
  }, []);

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        // ignore storage failures
      }
      return !c;
    });
  };

  if (loading || !role) {
    // Guards handle the unauthenticated redirect; this is just the shell's
    // brief claims-resolution moment.
    return <PageLoader label="Loading your workspace..." />;
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar role={role} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-drawer-in flex-col border-r border-line bg-surface shadow-overlay">
            <div className="flex items-center justify-between pr-2">
              <SidebarBrand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-ink-soft hover:bg-slate-100 hover:text-ink"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="cc-scroll flex-1 overflow-y-auto">
              <SidebarNav role={role} onNavigate={() => setMobileOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          role={role}
          userName={user?.displayName || user?.email || "User"}
          photoURL={user?.photoURL}
          onOpenMobileNav={() => setMobileOpen(true)}
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

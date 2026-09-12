"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  ChevronDown,
  KeyRound,
  LogOut,
  Menu,
  UserRound,
} from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, firestore } from "@/lib/client/firebase";
import { titleForPath, type AppRole } from "@/lib/client/navigation";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import NotificationsModal from "@/components/common/NotificationsModal";

const roleTone: Record<AppRole, "brand" | "success" | "warning"> = {
  student: "brand",
  teacher: "success",
  admin: "warning",
};

export default function Header({
  role,
  userName,
  photoURL,
  onOpenMobileNav,
}: {
  role: AppRole;
  userName: string;
  photoURL?: string | null;
  onOpenMobileNav: () => void;
}) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Live unread announcement count (same query the legacy navbars used)
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(firestore, "announcements"), where("active", "==", true));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const unread = snapshot.docs.filter(
          (doc) => !(doc.data().readBy || []).includes(user.uid),
        ).length;
        setUnreadCount(unread);
      },
      () => setUnreadCount(0),
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="rounded-lg p-2 text-ink-soft transition hover:bg-slate-100 hover:text-ink lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink sm:text-base">
            {titleForPath(pathname)}
          </p>
          <p className="hidden text-[11px] text-ink-faint sm:block">
            CampusConnect · {role.charAt(0).toUpperCase() + role.slice(1)} workspace
          </p>
        </div>

        <button
          type="button"
          onClick={() => setNotifOpen(true)}
          className="relative rounded-lg p-2 text-ink-soft transition hover:bg-slate-100 hover:text-ink"
          aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-xl border border-transparent p-1 pr-2 transition hover:border-line hover:bg-slate-50"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <Avatar name={userName} src={photoURL} size="md" />
            <span className="hidden min-w-0 text-left sm:block">
              <span className="block max-w-[140px] truncate text-sm font-medium text-ink">
                {userName || "User"}
              </span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-ink-faint sm:block" />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-56 animate-fade-up rounded-card border border-line bg-surface p-1.5 shadow-pop"
            >
              <div className="border-b border-line px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-ink">
                  {userName || "User"}
                </p>
                <Badge tone={roleTone[role]} className="mt-1 capitalize">
                  {role}
                </Badge>
              </div>
              <Link
                href="/profile"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft transition hover:bg-slate-100 hover:text-ink"
              >
                <UserRound className="h-4 w-4" /> Profile
              </Link>
              <Link
                href="/change-password"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-soft transition hover:bg-slate-100 hover:text-ink"
              >
                <KeyRound className="h-4 w-4" /> Change password
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-danger transition hover:bg-rose-50"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <NotificationsModal isOpen={notifOpen} onClose={() => setNotifOpen(false)} />
    </header>
  );
}

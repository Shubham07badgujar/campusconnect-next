"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NAVIGATION, type AppRole, type NavItem } from "@/lib/client/navigation";

function isItemActive(item: NavItem, pathname: string): boolean {
  if (pathname === item.href) return true;
  return (item.activePrefixes || []).some(
    (p) => pathname === p || pathname.startsWith(p),
  );
}

export function SidebarNav({
  role,
  collapsed = false,
  onNavigate,
}: {
  role: AppRole;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() || "";
  const groups = NAVIGATION[role];

  return (
    <nav aria-label="Main navigation" className="flex-1 space-y-5 px-3 py-4">
      {groups.map((group) => (
        <div key={group.title}>
          {!collapsed ? (
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              {group.title}
            </p>
          ) : (
            <div className="mx-3 mb-2 border-t border-line first:hidden" aria-hidden />
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isItemActive(item, pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-brand-50 text-brand-700"
                        : "text-ink-soft hover:bg-slate-100 hover:text-ink"
                    } ${collapsed ? "justify-center px-2" : ""}`}
                  >
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-600"
                      />
                    ) : null}
                    <Icon
                      className={`h-[18px] w-[18px] shrink-0 ${active ? "text-brand-600" : "text-ink-faint group-hover:text-ink-soft"}`}
                    />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function SidebarBrand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div
      className={`flex h-16 items-center gap-2.5 border-b border-line px-4 ${collapsed ? "justify-center px-2" : ""}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
        <GraduationCap className="h-5 w-5" />
      </span>
      {!collapsed ? (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold tracking-tight text-ink">
            CampusConnect
          </p>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
            Campus platform
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Desktop sidebar (hidden below lg). */
export default function Sidebar({
  role,
  collapsed,
  onToggleCollapsed,
}: {
  role: AppRole;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <aside
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200 lg:flex ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      <SidebarBrand collapsed={collapsed} />
      <div className="cc-scroll flex-1 overflow-y-auto">
        <SidebarNav role={role} collapsed={collapsed} />
      </div>
      <div className="border-t border-line p-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-ink-soft transition hover:bg-slate-100 hover:text-ink"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" /> Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

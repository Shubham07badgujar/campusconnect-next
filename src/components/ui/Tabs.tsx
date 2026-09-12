"use client";

import type { ReactNode } from "react";

export type TabItem<T extends string = string> = {
  value: T;
  label: ReactNode;
  count?: number;
};

/** Horizontal, scrollable tab bar (controlled). */
export default function Tabs<T extends string>({
  items,
  value,
  onChange,
  className = "",
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`hide-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1 shadow-card ${className}`}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(item.value)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-brand-600 text-white shadow-sm"
                : "text-ink-soft hover:bg-slate-100 hover:text-ink"
            }`}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span
                className={`rounded-full px-1.5 text-[10px] font-semibold ${
                  active ? "bg-white/20 text-white" : "bg-slate-200 text-ink-soft"
                }`}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

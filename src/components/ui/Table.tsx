"use client";

// Table primitives with a consistent look; the wrapper guarantees horizontal
// scrolling on small screens so pages never overflow the viewport.
import type { HTMLAttributes, ReactNode } from "react";

export function TableWrap({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`cc-scroll overflow-x-auto rounded-card border border-line bg-surface shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function Table({ className = "", ...rest }: HTMLAttributes<HTMLTableElement>) {
  return <table className={`w-full min-w-max text-left text-sm ${className}`} {...rest} />;
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-line bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-ink-soft">
      {children}
    </thead>
  );
}

export function TH({ className = "", ...rest }: HTMLAttributes<HTMLTableCellElement>) {
  return <th className={`px-4 py-3 ${className}`} {...rest} />;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({ className = "", ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={`transition-colors hover:bg-slate-50/70 ${className}`} {...rest} />;
}

export function TD({ className = "", ...rest }: HTMLAttributes<HTMLTableCellElement>) {
  return <td className={`px-4 py-3 text-ink ${className}`} {...rest} />;
}

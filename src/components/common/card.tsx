"use client";

export function Card({ children, className }: any) {
  return <div className={`border rounded-lg p-4 shadow ${className}`}>{children}</div>;
}

export function CardContent({ children }: any) {
  return <div>{children}</div>;
}

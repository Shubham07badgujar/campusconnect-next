"use client";

const palette = [
  "bg-brand-100 text-brand-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
];

const hash = (s: string) =>
  [...s].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 997, 7);

export default function Avatar({
  name = "",
  src,
  size = "md",
  className = "",
}: {
  name?: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const sizes = {
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-xs",
    lg: "h-12 w-12 text-sm",
    xl: "h-20 w-20 text-xl",
  } as const;

  const initials =
    String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("") || "?";

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name || "User avatar"}
        className={`${sizes[size]} rounded-full object-cover ring-2 ring-white ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`${sizes[size]} flex items-center justify-center rounded-full font-semibold ring-2 ring-white ${palette[hash(name) % palette.length]} ${className}`}
    >
      {initials}
    </span>
  );
}

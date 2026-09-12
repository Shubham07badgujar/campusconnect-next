import RequireAuth from "@/components/guards/RequireAuth";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

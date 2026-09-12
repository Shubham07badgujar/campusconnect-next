import RequireAuth from "@/components/guards/RequireAuth";
import AppShell from "@/components/shell/AppShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

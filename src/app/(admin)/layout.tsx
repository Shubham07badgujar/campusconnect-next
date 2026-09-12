import RequireAdmin from "@/components/guards/RequireAdmin";
import AppShell from "@/components/shell/AppShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      <AppShell>{children}</AppShell>
    </RequireAdmin>
  );
}

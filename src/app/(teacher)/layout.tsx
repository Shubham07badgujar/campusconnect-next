import RequireTeacher from "@/components/guards/RequireTeacher";
import AppShell from "@/components/shell/AppShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <RequireTeacher>
      <AppShell>{children}</AppShell>
    </RequireTeacher>
  );
}

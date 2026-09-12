import RequireTeacher from "@/components/guards/RequireTeacher";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireTeacher>{children}</RequireTeacher>;
}

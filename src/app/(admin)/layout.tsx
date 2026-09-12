import RequireAdmin from "@/components/guards/RequireAdmin";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireAdmin>{children}</RequireAdmin>;
}

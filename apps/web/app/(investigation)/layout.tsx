import { Sidebar } from "./_components/Sidebar";

export const dynamic = "force-dynamic";

export default function InvestigationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const asOf = new Date();
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar asOf={asOf} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

import { PageHeader } from "@/components/page-states";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-5 p-6">
      <PageHeader title="Dashboard" description="Cluster overview" />
      <p className="text-sm text-muted-foreground">Dashboard coming in a later task.</p>
    </div>
  );
}

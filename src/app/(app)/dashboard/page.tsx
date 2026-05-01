import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { requireUser } from "@/lib/auth";
import { loadFinancialSnapshotData } from "@/lib/server/financial-snapshot";

export default async function DashboardPage() {
  const { supabase, user } = await requireUser();
  const snapshot = await loadFinancialSnapshotData(supabase, user.id);

  return <DashboardClient snapshot={snapshot} />;
}

import { createServerClient } from '@/lib/supabase-server';
import { groupByFlow, groupBySource } from '@/lib/flows';
import type { Lead, DashboardMetrics, FlowId } from '@/lib/types';
import DashboardClient from '@/components/DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createServerClient();

  const { data: leads } = await supabase.from('leads').select('*');
  const allLeads: Lead[] = (leads ?? []) as Lead[];

  const flowGroups = groupByFlow(allLeads);
  const flowCounts = Object.fromEntries(
    Object.entries(flowGroups).map(([k, v]) => [k, v.length])
  ) as Record<FlowId, number>;

  const initial: DashboardMetrics = {
    totalLeads: allLeads.length,
    telegramActive: allLeads.filter(l => l.telegram_activo).length,
    ofActive: allLeads.filter(l => l.of_activo).length,
    cupidActive: allLeads.filter(l => l.cupidbot_activo).length,
    flowCounts,
    sourceStats: groupBySource(allLeads),
  };

  return <DashboardClient initial={initial} />;
}

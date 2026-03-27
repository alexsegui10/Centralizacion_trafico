import { createServerClient } from '@/lib/supabase-server';
import KanbanBoard from '@/components/KanbanBoard';
import type { Lead } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function KanbanPage() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('leads')
    .select('*')
    .order('updated_at', { ascending: false });

  return <KanbanBoard initialLeads={(data ?? []) as Lead[]} />;
}

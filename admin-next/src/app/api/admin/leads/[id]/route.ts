import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id: visitorId } = await params;
  const body = await req.json();
  const { action, flow } = body as { action: string; flow?: string };

  const supabase = createServerClient();
  const now = new Date().toISOString();

  let update: Record<string, unknown> = { updated_at: now };

  switch (action) {
    case 'activate_cupidbot':
      update = { ...update, cupidbot_activo: true, cupidbot_pausado: false };
      break;
    case 'pause_cupidbot':
      update = { ...update, cupidbot_activo: false, cupidbot_pausado: true };
      break;
    case 'set_flow':
      if (!flow) return NextResponse.json({ error: 'flow required' }, { status: 400 });
      update = { ...update, active_flow: flow };
      break;
    case 'mark_vip':
      update = { ...update, of_activo: true, active_flow: '4', cupidbot_activo: false, cupidbot_pausado: false };
      break;
    case 'mark_conflict':
      update = { ...update, active_flow: '6', cupidbot_activo: false };
      break;
    case 'resolve_conflict': {
      // Re-infer flow from current lead state
      const { data: lead } = await supabase.from('leads').select('*').eq('visitor_id', visitorId).single();
      let resolved = null;
      if (lead) {
        if (lead.of_activo)                                                             resolved = '4';
        else if (lead.mgo_directo)                                                      resolved = '1';
        else if (lead.mgo_en_canal && !lead.mgo_directo)                               resolved = '2';
        else if (lead.telegram_activo && !lead.mgo_directo && !lead.mgo_en_canal)      resolved = '3';
      }
      update = { ...update, active_flow: resolved };
      break;
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const { error } = await supabase.from('leads').update(update).eq('visitor_id', visitorId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

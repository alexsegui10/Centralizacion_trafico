import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const { visitor_id, contenido, tipo, bot_tipo } = await req.json();

  if (!visitor_id || !contenido) {
    return NextResponse.json({ error: 'visitor_id and contenido required' }, { status: 400 });
  }

  const { error } = await supabase.from('mensajes').insert({
    visitor_id,
    tipo: tipo ?? 'bot',
    bot_tipo: bot_tipo ?? null,
    contenido,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
